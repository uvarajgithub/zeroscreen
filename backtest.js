/**
 * backtest.js — Real BNF Strategy Backtest
 * 
 * Runs TWO strategies against real Zerodha historical 15-min candle data:
 *   1. HYBRID REVERSE (our bot — body breakout on signal candle close)
 *   2. VMT  (pre-open premium breakout — ITM option at open LTP + 7)
 *
 * Usage:
 *   node backtest.js                    → last 60 days (default)
 *   node backtest.js --days 200         → last 200 days
 *   node backtest.js --from 2025-01-01  → from specific date
 *
 * Requires: Valid Zerodha ACCESS_TOKEN in /home/ubuntu/trading-bot/.env
 * Data source: Zerodha Kite API (free with any account, up to 400 days 15-min)
 */

const https  = require('https');
const fs     = require('fs');
const path   = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const ENV_PATH = '/home/ubuntu/trading-bot/.env';
const env = {};
fs.readFileSync(ENV_PATH, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const API_KEY      = env.API_KEY;
const ACCESS_TOKEN = env.ACCESS_TOKEN;
const BNF_TOKEN    = 260105;   // Zerodha instrument token for BANKNIFTY
const LOT_SIZE     = 15;       // BNF lot size

const args = process.argv.slice(2);
const daysArg  = args.indexOf('--days')  !== -1 ? parseInt(args[args.indexOf('--days')  + 1]) : 60;
const fromArg  = args.indexOf('--from')  !== -1 ? args[args.indexOf('--from')  + 1] : null;

// ── Zerodha API helpers ───────────────────────────────────────────────────────
function apiGet(endpoint) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.kite.trade',
            path: endpoint,
            method: 'GET',
            headers: {
                'X-Kite-Version': '3',
                'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}`
            }
        };
        const req = https.request(options, res => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch(e) { reject(new Error('JSON parse failed: ' + data.slice(0, 200))); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

async function fetchCandles(instrumentToken, from, to, interval = '15minute') {
    const ep = `/instruments/historical/${instrumentToken}/${interval}?from=${from}&to=${to}&continuous=0&oi=0`;
    const result = await apiGet(ep);
    if (result.status !== 'success') throw new Error('API error: ' + JSON.stringify(result));
    // Returns: [[timestamp, open, high, low, close, volume], ...]
    return result.data.candles.map(c => ({
        ts:     new Date(c[0]),
        open:   c[1],
        high:   c[2],
        low:    c[3],
        close:  c[4],
        volume: c[5]
    }));
}

// ── Black-Scholes for VMT option price approximation ─────────────────────────
function normalCDF(x) {
    const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1 - (((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t) * Math.exp(-x*x);
    return 0.5 * (1.0 + sign * y);
}

function blackScholes(S, K, T, r, sigma, type) {
    if (T <= 0) return Math.max(type === 'CE' ? S - K : K - S, 0);
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    if (type === 'CE') return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
    return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
}

function getOptionPrice(spot, strike, daysToExpiry, type, ivPercent = 18) {
    // T = trading days to expiry / 252
    const T = Math.max(daysToExpiry / 252, 0.001);
    const sigma = ivPercent / 100;
    const r = 0.065; // India risk-free rate
    return Math.round(blackScholes(spot, strike, T, r, sigma, type) * 100) / 100;
}

// ── Date helpers ─────────────────────────────────────────────────────────────
function toIST(date) {
    return new Date(date.getTime() + 5.5 * 3600000);
}
function dateKey(date) {
    const d = toIST(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function hourMinIST(date) {
    const d = toIST(date);
    return d.getHours() * 60 + d.getMinutes();
}
function daysUntilThursday(date) {
    // Weekly BNF options expire every Thursday
    const d = toIST(date);
    const day = d.getDay(); // 0=Sun, 4=Thu
    let daysLeft = (4 - day + 7) % 7;
    if (daysLeft === 0) daysLeft = 7; // already Thursday → next Thursday
    return daysLeft;
}

// Group candles by trading day
function groupByDay(candles) {
    const days = {};
    for (const c of candles) {
        const k = dateKey(c.ts);
        if (!days[k]) days[k] = [];
        days[k].push(c);
    }
    return days;
}

// ── STRATEGY 1: HYBRID REVERSE (Our Bot) ─────────────────────────────────────
// Simplified core logic matching our bot:
//   - Wait for a 15-min body breakout candle after 9:15 AM
//   - Body = |close - open| ≥ 8 pts
//   - Enter at close of signal candle
//   - SL = ±100 pts from entry (index level)
//   - C1-3 rule: if next candle closes 3+ pts AGAINST direction → early exit (−3 pts)
//   - Max 2 trades/day, daily loss cap = 350 pts
function backtestHybridReverse(dayCandles) {
    const results = [];

    for (const [date, candles] of Object.entries(dayCandles)) {
        let dailyPnL = 0;
        let tradeCount = 0;
        const MAX_TRADES = 2;
        const SL_PTS = 100;
        const DAILY_LOSS_CAP = 350;
        const MIN_BODY = 8;

        let inTrade = false;
        let direction = null;
        let entryPrice = 0;
        let prevBodyHigh = null;
        let prevBodyLow = null;
        let prevCandle = null;
        let signalCandle = null;
        let waitingForC1 = false;
        const tradeLog = [];

        // Only process market hours: 9:15 AM (555 min) to 3:15 PM (915 min)
        const mktCandles = candles.filter(c => {
            const m = hourMinIST(c.ts);
            return m >= 555 && m < 915;
        });

        for (let i = 0; i < mktCandles.length; i++) {
            const c = mktCandles[i];
            const m = hourMinIST(c.ts);
            if (dailyPnL <= -DAILY_LOSS_CAP) break;

            if (inTrade) {
                const pnl = direction === 'CE'
                    ? c.close - entryPrice
                    : entryPrice - c.close;

                // SL hit
                if (pnl <= -SL_PTS) {
                    dailyPnL -= SL_PTS;
                    tradeLog.push({ type: 'SL', dir: direction, entry: entryPrice, exit: c.close, pnl: -SL_PTS });
                    inTrade = false; tradeCount++;
                    continue;
                }

                // C1-3 early exit: if next candle closes 3+ pts against us
                if (waitingForC1) {
                    const against = direction === 'CE' ? (c.close < entryPrice - 3) : (c.close > entryPrice + 3);
                    if (against) {
                        const exitPnl = direction === 'CE' ? c.close - entryPrice : entryPrice - c.close;
                        dailyPnL += exitPnl;
                        tradeLog.push({ type: 'C1_EXIT', dir: direction, entry: entryPrice, exit: c.close, pnl: exitPnl });
                        inTrade = false; tradeCount++;
                        waitingForC1 = false;
                        continue;
                    }
                    waitingForC1 = false;
                }

                // EOD exit
                if (m >= 910) {
                    const exitPnl = direction === 'CE' ? c.close - entryPrice : entryPrice - c.close;
                    dailyPnL += exitPnl;
                    tradeLog.push({ type: 'EOD', dir: direction, entry: entryPrice, exit: c.close, pnl: exitPnl });
                    inTrade = false; tradeCount++;
                    break;
                }
            } else {
                // Look for body breakout entry signal
                if (tradeCount >= MAX_TRADES) break;
                if (prevCandle) {
                    const body = Math.abs(c.close - c.open);
                    const bullBody = c.close > c.open && body >= MIN_BODY;
                    const bearBody = c.close < c.open && body >= MIN_BODY;

                    // CE: bullish body breaking above prev body high
                    if (bullBody && prevBodyHigh && c.close > prevBodyHigh) {
                        direction = 'CE';
                        entryPrice = c.close;
                        inTrade = true;
                        waitingForC1 = true;
                        signalCandle = c;
                    }
                    // PE: bearish body breaking below prev body low
                    else if (bearBody && prevBodyLow && c.close < prevBodyLow) {
                        direction = 'PE';
                        entryPrice = c.close;
                        inTrade = true;
                        waitingForC1 = true;
                        signalCandle = c;
                    }
                }
                // Update prev body levels
                if (Math.abs(c.close - c.open) >= MIN_BODY) {
                    prevBodyHigh = Math.max(c.open, c.close);
                    prevBodyLow  = Math.min(c.open, c.close);
                }
                prevCandle = c;
            }
        }

        // Force close if still in trade
        if (inTrade && mktCandles.length > 0) {
            const last = mktCandles[mktCandles.length - 1];
            const exitPnl = direction === 'CE' ? last.close - entryPrice : entryPrice - last.close;
            dailyPnL += exitPnl;
            tradeLog.push({ type: 'EOD_FORCE', dir: direction, entry: entryPrice, exit: last.close, pnl: exitPnl });
        }

        const open  = mktCandles[0]?.open || 0;
        const close = mktCandles[mktCandles.length - 1]?.close || 0;
        const high  = mktCandles.reduce((m, c) => Math.max(m, c.high), 0);
        const low   = mktCandles.reduce((m, c) => Math.min(m, c.low), Infinity);

        results.push({
            date,
            pnl:    Math.round(dailyPnL),
            trades: tradeLog.length,
            fired:  tradeLog.length > 0,
            open, high, low, close,
            tradeLog
        });
    }
    return results;
}

// ── STRATEGY 2: VMT (Pre-Open Premium Breakout) ───────────────────────────────
// Logic:
//   - At 9:15 AM open, note spot price
//   - Select ATM-100 CE (slightly ITM) as primary
//   - Select ATM+100 PE as secondary hedge
//   - Calculate option LTP using Black-Scholes at open
//   - entry = LTP + 7, SL = LTP, target = entry + (3 × SL distance)
//   - Whichever side's trigger is hit first in the first 5 candles → take that trade
//   - Monitor every candle for SL or target
//   - Exit by 11:30 AM if neither hit (theta decay)
function backtestVMT(dayCandles) {
    const results = [];

    for (const [date, candles] of Object.entries(dayCandles)) {
        const mktCandles = candles.filter(c => {
            const m = hourMinIST(c.ts);
            return m >= 555 && m < 915;
        });
        if (mktCandles.length < 3) {
            results.push({ date, pnl: 0, trades: 0, fired: false });
            continue;
        }

        const firstCandle = mktCandles[0];
        const spot = firstCandle.open;
        const atmStrike = Math.round(spot / 100) * 100;
        const ceStrike  = atmStrike;       // ATM CE (standard entry)
        const peStrike  = atmStrike;       // ATM PE

        // Days to Thursday expiry
        const dte = daysUntilThursday(firstCandle.ts);

        // Pre-open premium using B-S (using 18% IV baseline, typical BNF)
        const ceLTP = getOptionPrice(spot, ceStrike, dte, 'CE', 18);
        const peLTP = getOptionPrice(spot, peStrike, dte, 'PE', 18);

        const ceEntry = ceLTP + 7;
        const ceSL    = ceLTP;
        const ceTarget = ceEntry + (ceEntry - ceSL) * 3;  // 3R target

        const peEntry = peLTP + 7;
        const peSL    = peLTP;
        const peTarget = peEntry + (peEntry - peSL) * 3;

        let pnl = 0;
        let fired = false;
        let tradeDir = null;
        let tradeEntry = 0;
        let tradeSL = 0;
        let tradeTarget = 0;
        let inTrade = false;
        const tradeLog = [];

        for (let i = 0; i < mktCandles.length; i++) {
            const c = mktCandles[i];
            const m = hourMinIST(c.ts);

            // Only look for entry in first 30 mins (9:15–9:45)
            if (!inTrade && m <= 585) {
                // Approximate current option price from index move
                const ceNow = getOptionPrice(c.close, ceStrike, dte - i/26, 'CE', 20);
                const peNow = getOptionPrice(c.close, peStrike, dte - i/26, 'PE', 20);

                if (ceNow >= ceEntry && !fired) {
                    tradeDir = 'CE'; tradeEntry = ceNow; tradeSL = ceSL; tradeTarget = ceTarget;
                    inTrade = true; fired = true;
                } else if (peNow >= peEntry && !fired) {
                    tradeDir = 'PE'; tradeEntry = peNow; tradeSL = peSL; tradeTarget = peTarget;
                    inTrade = true; fired = true;
                }
            }

            if (inTrade) {
                const cNow = tradeDir === 'CE'
                    ? getOptionPrice(c.close, ceStrike, dte - i/26, 'CE', 20)
                    : getOptionPrice(c.close, peStrike, dte - i/26, 'PE', 20);

                // SL hit
                if (cNow <= tradeSL) {
                    pnl = Math.round(tradeSL - tradeEntry);
                    tradeLog.push({ type: 'SL', dir: tradeDir, entry: tradeEntry, exit: tradeSL, pnl });
                    inTrade = false; break;
                }
                // Target hit
                if (cNow >= tradeTarget) {
                    pnl = Math.round(tradeTarget - tradeEntry);
                    tradeLog.push({ type: 'TARGET', dir: tradeDir, entry: tradeEntry, exit: tradeTarget, pnl });
                    inTrade = false; break;
                }
                // Exit by 11:30 AM
                if (m >= 690) {
                    pnl = Math.round(cNow - tradeEntry);
                    tradeLog.push({ type: 'TIME_EXIT', dir: tradeDir, entry: tradeEntry, exit: cNow, pnl });
                    inTrade = false; break;
                }
            }
        }

        const open  = mktCandles[0]?.open || 0;
        const close = mktCandles[mktCandles.length - 1]?.close || 0;

        results.push({ date, pnl: Math.round(pnl), trades: tradeLog.length, fired, open, close, tradeLog });
    }
    return results;
}

// ── Print comparison report ───────────────────────────────────────────────────
function printReport(hybridResults, vmtResults) {
    const LINE = '─'.repeat(80);
    
    console.log('\n' + '═'.repeat(80));
    console.log('  BANKNIFTY BACKTEST — HYBRID REVERSE vs VMT STRATEGY');
    console.log('═'.repeat(80));

    let hTotal = 0, hWins = 0, hLosses = 0, hFlat = 0, hMaxDD = 0, hRunDD = 0;
    let vTotal = 0, vWins = 0, vLosses = 0, vFlat = 0, vMaxDD = 0, vRunDD = 0;

    console.log('\n' + LINE);
    console.log(
        'Date'.padEnd(12) +
        'BNF Chg'.padStart(8) +
        '  │ ' +
        'OUR BOT'.padEnd(14) +
        '  │ ' +
        'VMT'.padEnd(14) +
        '  │ ' +
        'EDGE'
    );
    console.log(LINE);

    const allDates = [...new Set([...hybridResults.map(r=>r.date), ...vmtResults.map(r=>r.date)])].sort();

    for (const date of allDates) {
        const h = hybridResults.find(r => r.date === date);
        const v = vmtResults.find(r => r.date === date);
        if (!h || !v) continue;

        const chg = h.open ? Math.round(h.close - h.open) : 0;
        const chgStr = (chg >= 0 ? '+' : '') + chg;

        const hPnl = h.pnl;
        const vPnl = v.pnl;

        hTotal += hPnl;
        vTotal += vPnl;
        if (hPnl > 0) hWins++; else if (hPnl < 0) hLosses++; else hFlat++;
        if (vPnl > 0) vWins++; else if (vPnl < 0) vLosses++; else vFlat++;

        hRunDD = Math.min(hRunDD, hTotal);
        vRunDD = Math.min(vRunDD, vTotal);
        hMaxDD = Math.min(hMaxDD, hRunDD);
        vMaxDD = Math.min(vMaxDD, vRunDD);

        const hStr = (hPnl > 0 ? '+' : '') + hPnl + ' pts' + (h.fired ? '' : ' [no trade]');
        const vStr = (vPnl > 0 ? '+' : '') + vPnl + ' pts' + (v.fired ? '' : ' [no trade]');
        const edge = vPnl > hPnl ? '← VMT better' : hPnl > vPnl ? '← Bot better' : 'SAME';

        console.log(
            date.padEnd(12) +
            chgStr.padStart(8) +
            '  │ ' +
            hStr.padEnd(18) +
            '  │ ' +
            vStr.padEnd(18) +
            '  │ ' +
            edge
        );
    }

    const totalDays = allDates.length;
    console.log('\n' + '═'.repeat(80));
    console.log('  SUMMARY');
    console.log('═'.repeat(80));
    console.log(`  Period:           ${allDates[0]} → ${allDates[allDates.length-1]}  (${totalDays} trading days)`);
    console.log('');
    console.log('                        OUR BOT (HYBRID)    VMT STRATEGY');
    console.log('  ' + LINE.slice(0, 60));
    console.log(`  Total P&L (pts):       ${String(hTotal).padStart(8)}            ${String(vTotal).padStart(8)}`);
    console.log(`  Per lot (₹):           ${String(hTotal * LOT_SIZE).padStart(8)}            ${String(vTotal * LOT_SIZE).padStart(8)}`);
    console.log(`  Win days:              ${String(hWins).padStart(8)}            ${String(vWins).padStart(8)}`);
    console.log(`  Loss days:             ${String(hLosses).padStart(8)}            ${String(vLosses).padStart(8)}`);
    console.log(`  Flat/no trade days:    ${String(hFlat).padStart(8)}            ${String(vFlat).padStart(8)}`);
    const hWinRate = totalDays > 0 ? Math.round(hWins/totalDays*100) : 0;
    const vWinRate = totalDays > 0 ? Math.round(vWins/totalDays*100) : 0;
    const hFireRate = Math.round(hybridResults.filter(r=>r.fired).length/totalDays*100);
    const vFireRate = Math.round(vmtResults.filter(r=>r.fired).length/totalDays*100);
    console.log(`  Win rate:              ${String(hWinRate+'%').padStart(8)}            ${String(vWinRate+'%').padStart(8)}`);
    console.log(`  Trade fire rate:       ${String(hFireRate+'%').padStart(8)}            ${String(vFireRate+'%').padStart(8)}`);
    console.log(`  Max drawdown (pts):    ${String(hMaxDD).padStart(8)}            ${String(vMaxDD).padStart(8)}`);
    console.log('');
    const winner = vTotal > hTotal ? 'VMT STRATEGY' : 'OUR BOT';
    const diff = Math.abs(vTotal - hTotal);
    console.log(`  WINNER: ${winner} by +${diff} pts (₹${diff * LOT_SIZE}/lot)`);
    console.log('═'.repeat(80) + '\n');

    // Save to file
    const report = {
        period: { from: allDates[0], to: allDates[allDates.length-1], days: totalDays },
        hybridReverse: { totalPts: hTotal, perLotRs: hTotal * LOT_SIZE, wins: hWins, losses: hLosses, flat: hFlat, winRate: hWinRate, fireRate: hFireRate, maxDrawdown: hMaxDD },
        vmt: { totalPts: vTotal, perLotRs: vTotal * LOT_SIZE, wins: vWins, losses: vLosses, flat: vFlat, winRate: vWinRate, fireRate: vFireRate, maxDrawdown: vMaxDD },
        daily: allDates.map(d => ({
            date: d,
            hybrid: hybridResults.find(r=>r.date===d),
            vmt: vmtResults.find(r=>r.date===d)
        }))
    };
    fs.writeFileSync('/root/zeroscreen/backtest_result.json', JSON.stringify(report, null, 2));
    console.log('  Full results saved → /root/zeroscreen/backtest_result.json');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\nVerifying API token...');
    try {
        const profile = await apiGet('/user/profile');
        if (profile.status !== 'success') {
            console.error('❌ Token invalid or expired:', profile.message);
            console.error('\n  → Please refresh your Zerodha token first:');
            console.error('    http://139.59.18.52:3001/login\n');
            process.exit(1);
        }
        console.log(`✓ Token valid — logged in as: ${profile.data.user_name}`);
    } catch(e) {
        console.error('❌ API check failed:', e.message);
        process.exit(1);
    }

    // Calculate date range
    const toDate   = new Date();
    const fromDate = fromArg
        ? new Date(fromArg)
        : new Date(Date.now() - daysArg * 86400000);

    const fmt = d => d.toISOString().slice(0, 10);
    console.log(`\nFetching BNF 15-min candles: ${fmt(fromDate)} → ${fmt(toDate)}`);
    console.log('(This may take a few seconds for large date ranges...)\n');

    // Zerodha limits: max 60 days per request for 15-min. Fetch in chunks.
    const CHUNK_DAYS = 59;
    let allCandles = [];
    let cursor = new Date(fromDate);

    while (cursor < toDate) {
        const chunkEnd = new Date(Math.min(cursor.getTime() + CHUNK_DAYS * 86400000, toDate.getTime()));
        process.stdout.write(`  Fetching ${fmt(cursor)} → ${fmt(chunkEnd)}...`);
        try {
            const candles = await fetchCandles(BNF_TOKEN, fmt(cursor) + ' 09:00:00', fmt(chunkEnd) + ' 15:30:00');
            allCandles = allCandles.concat(candles);
            console.log(` ${candles.length} candles`);
        } catch(e) {
            console.log(` ERROR: ${e.message}`);
        }
        cursor = new Date(chunkEnd.getTime() + 86400000);
        await new Promise(r => setTimeout(r, 300)); // rate limit
    }

    if (allCandles.length === 0) {
        console.error('❌ No candle data fetched. Check token and date range.');
        process.exit(1);
    }

    console.log(`\n✓ Total candles fetched: ${allCandles.length}`);

    const dayCandles = groupByDay(allCandles);
    const tradingDays = Object.keys(dayCandles).length;
    console.log(`✓ Trading days: ${tradingDays}`);

    console.log('\nRunning HYBRID REVERSE backtest...');
    const hybridResults = backtestHybridReverse(dayCandles);

    console.log('Running VMT backtest...');
    const vmtResults = backtestVMT(dayCandles);

    printReport(hybridResults, vmtResults);
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
