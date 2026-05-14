require('dotenv').config({ path: '/home/ubuntu/trading-bot/.env' });
const { KiteConnect } = require('/home/ubuntu/trading-bot/node_modules/kiteconnect');
const { createHybridState, processHybridCandle, trailLock50, trailDefault } = require('/home/ubuntu/trading-bot/dist/src/strategy');

const kc = new KiteConnect({ api_key: process.env.API_KEY });
kc.setAccessToken(process.env.ACCESS_TOKEN);

const QTY = 30;
const CHUNK_DAYS = 60;       // safe chunk size for 15-min data
const YEARS_BACK = 2;        // how far back to try (API limit ~400 days)

function fmtDate(d) {
  return d.toISOString().slice(0, 10) + ' 00:00:00';
}
function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function toIST(d) {
  return new Date(d).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true
  });
}
function toISTDate(d) {
  return new Date(d).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).split('/').reverse().join('-'); // YYYY-MM-DD
}
function parseHour(ist) {
  const m = /(\d+):(\d+)\s*(am|pm)/i.exec(ist);
  if (!m) return 0;
  let h = parseInt(m[1]);
  if (m[3].toLowerCase() === 'pm' && h !== 12) h += 12;
  if (m[3].toLowerCase() === 'am' && h === 12) h = 0;
  return h;
}

function tickTrailCheck(log, peak, curr) {
  const l = log[log.length - 1];
  if (!l || l.pts != null || !l.d) return null;
  const favNow = l.d === 'CE' ? curr.high - l.en : l.en - curr.low;
  const newPeak = Math.max(peak, favNow);
  if (newPeak < 50) return { peak: newPeak, exit: null };
  const trailSL = newPeak - 25;
  const adverse = l.d === 'CE' ? l.en - curr.low : curr.high - l.en;
  if (adverse >= trailSL) return { peak: newPeak, exit: trailSL };
  return { peak: newPeak, exit: null };
}

// Run one trading day — returns P&L for all 4 strategies
function runDayFull(candles) {
  const C = candles;
  if (C.length < 5) return null;

  const QTY_S1 = 30, TGT = 40, SL1 = 20;

  // LOCK50
  let lS = createHybridState(), lPnl = 0, lW = 0, lL = 0, lLog = [], lPrev = null;
  // TRAIL (trailDefault)
  let tS = createHybridState(), tPnl = 0, tW = 0, tL = 0, tPrev = null;
  // SCALP1 (arms on every LOCK50 signal before 12PM, max 3/day, TGT=40, SL=20)
  let s1Pnl = 0, s1W = 0, s1L = 0, s1In = false, s1Dir = null;
  let s1En = 0, s1SL = 0, s1Tgt = 0, s1Ct = 0;
  // TICK TRAIL (peak-25, activates @+50, trailLock50 signals)
  let ttS = createHybridState(), ttPnl = 0, ttW = 0, ttL = 0, ttLog = [], ttPrev = null;
  let ttPeak = 0;

  for (let i = 1; i < C.length; i++) {
    const prev = C[i - 1], curr = C[i];
    const ist  = curr.ist;
    const eod  = ist.includes('3:15') || ist.includes('3:30');
    const h    = parseHour(ist);

    // ── LOCK50 ──
    if (lPrev) {
      const sig = processHybridCandle(lS, lPrev, curr, eod, trailLock50);
      if (sig.action === 'ENTER' || sig.action === 'REVERSE_ENTER') {
        if (sig.action === 'REVERSE_ENTER') {
          const l = lLog[lLog.length - 1];
          if (l && l.pts == null) { l.pts = -100; l.r = 'sl_reverse'; lPnl -= 100; lL++; }
        }
        lLog.push({ t: ist, d: lS.dir, en: lS.entry || curr.close, pts: null, r: null });
        // arm SCALP1
        if (s1Ct < 3 && !s1In && h < 12) {
          s1In = true; s1Dir = lS.dir; s1En = curr.close;
          s1SL  = s1Dir === 'CE' ? s1En - SL1 : s1En + SL1;
          s1Tgt = s1Dir === 'CE' ? s1En + TGT  : s1En - TGT;
          s1Ct++;
        }
      }
      if (sig.action === 'EXIT_EARLY' || sig.action === 'EXIT_SL' || sig.action === 'EXIT_EOD') {
        const l = lLog[lLog.length - 1];
        if (l && l.pts == null) { l.pts = Math.round(sig.pts); l.r = sig.action.toLowerCase(); lPnl += sig.pts; if (sig.pts > 0) lW++; else lL++; }
      }
    }
    lPrev = prev;

    // ── TRAIL ──
    if (tPrev) {
      const sig = processHybridCandle(tS, tPrev, curr, eod, trailDefault);
      if (sig.action === 'ENTER' || sig.action === 'REVERSE_ENTER') {
        if (sig.action === 'REVERSE_ENTER') { tPnl -= 100; tL++; }
      }
      if (sig.action === 'EXIT_EARLY' || sig.action === 'EXIT_SL' || sig.action === 'EXIT_EOD') {
        tPnl += sig.pts; if (sig.pts > 0) tW++; else tL++;
      }
    }
    tPrev = prev;

    // ── SCALP1 monitor ──
    if (s1In && s1Dir) {
      const slHit  = s1Dir === 'CE' ? curr.low  <= s1SL  : curr.high >= s1SL;
      const tgtHit = s1Dir === 'CE' ? curr.high >= s1Tgt : curr.low  <= s1Tgt;
      if (slHit || tgtHit || h >= 15) {
        const pts = tgtHit ? TGT : slHit ? -SL1 : Math.round(s1Dir === 'CE' ? curr.close - s1En : s1En - curr.close);
        s1Pnl += pts; if (pts > 0) s1W++; else s1L++;
        s1In = false; s1Dir = null;
      }
    }

    // ── TICK TRAIL ──
    if (ttPrev) {
      const sig = processHybridCandle(ttS, ttPrev, curr, eod, trailLock50);
      if (sig.action === 'ENTER' || sig.action === 'REVERSE_ENTER') {
        if (sig.action === 'REVERSE_ENTER') {
          const l = ttLog[ttLog.length - 1];
          if (l && l.pts == null) {
            l.pts = Math.round(ttPeak >= 50 ? ttPeak - 25 : -100);
            l.r = 'sl_reverse'; ttPnl += l.pts; if (l.pts > 0) ttW++; else ttL++;
          }
        }
        ttLog.push({ t: ist, d: ttS.dir, en: ttS.entry || curr.close, pts: null, r: null });
        ttPeak = 0;
      }
      const tt = tickTrailCheck(ttLog, ttPeak, curr);
      if (tt) {
        ttPeak = tt.peak;
        if (tt.exit != null) {
          const l = ttLog[ttLog.length - 1];
          if (l && l.pts == null) { l.pts = Math.round(tt.exit); l.r = 'tick_trail'; ttPnl += tt.exit; if (tt.exit > 0) ttW++; else ttL++; ttPeak = 0; }
        }
      }
      if (ttLog[ttLog.length - 1] && ttLog[ttLog.length - 1].pts == null) {
        if (sig.action === 'EXIT_EARLY' || sig.action === 'EXIT_SL' || sig.action === 'EXIT_EOD') {
          const l = ttLog[ttLog.length - 1];
          if (l && l.pts == null) { l.pts = Math.round(sig.pts); l.r = sig.action.toLowerCase(); ttPnl += sig.pts; if (sig.pts > 0) ttW++; else ttL++; ttPeak = 0; }
        }
      }
    }
    ttPrev = prev;
  }

  return {
    lock: Math.round(lPnl),  lockW: lW,  lockL: lL,  lockTrades: lLog.length,
    trail: Math.round(tPnl), trailW: tW, trailL: tL,
    s1: Math.round(s1Pnl),   s1W,        s1L,
    tick: Math.round(ttPnl), tickW: ttW, tickL: ttL, tickTrades: ttLog.length
  };
}


async function run() {
  const now = new Date();
  const startDate = addDays(now, -YEARS_BACK * 365);
  
  // Build chunks
  const chunks = [];
  let cur = new Date(startDate);
  while (cur < now) {
    const next = addDays(cur, CHUNK_DAYS);
    chunks.push({ from: new Date(cur), to: next > now ? now : next });
    cur = next;
  }

  console.log(`Fetching ${YEARS_BACK} years of 15-min BANKNIFTY data in ${chunks.length} chunks...`);
  console.log(`Date range: ${startDate.toISOString().slice(0,10)} to ${now.toISOString().slice(0,10)}\n`);

  // Collect all candles
  const allCandles = [];
  let fetchedChunks = 0, failedChunks = 0;

  for (let ci = 0; ci < chunks.length; ci++) {
    const { from, to } = chunks[ci];
    const fromStr = from.toISOString().slice(0,10) + ' 09:00:00';
    const toStr   = to.toISOString().slice(0,10)   + ' 15:30:00';
    process.stdout.write(`  Chunk ${ci+1}/${chunks.length}: ${fromStr.slice(0,10)} to ${toStr.slice(0,10)} ... `);
    try {
      const raw = await kc.getHistoricalData(260105, '15minute', fromStr, toStr, false);
      if (raw && raw.length > 0) {
        allCandles.push(...raw);
        process.stdout.write(`OK (${raw.length} candles)\n`);
        fetchedChunks++;
      } else {
        process.stdout.write(`empty\n`);
        failedChunks++;
      }
    } catch (e) {
      process.stdout.write(`FAIL: ${e.message}\n`);
      failedChunks++;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nFetch complete: ${fetchedChunks} chunks OK, ${failedChunks} failed`);
  console.log(`Total raw candles: ${allCandles.length}`);

  // Group candles by IST trading date
  const byDate = {};
  for (const c of allCandles) {
    const date = toISTDate(c.date);
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({
      open: c.open, high: c.high, low: c.low, close: c.close, date: c.date,
      ist: toIST(c.date)
    });
  }

  // Sort dates, filter to days with enough candles (10+)
  const tradingDates = Object.keys(byDate)
    .filter(d => byDate[d].length >= 10)
    .sort();

  console.log(`Trading days found: ${tradingDates.length}`);
  if (tradingDates.length === 0) { console.log('No trading days — exiting.'); return; }
  console.log(`Range: ${tradingDates[0]}  to  ${tradingDates[tradingDates.length-1]}\n`);

  // Run backtest for each day
  const results = [];
  for (const date of tradingDates) {
    const candles = byDate[date].sort((a, b) => new Date(a.date) - new Date(b.date));
    const r = runDayFull(candles);
    if (r) results.push({ date, candles: candles.length, ...r });
  }

  // ── MONTHLY SUMMARY ───────────────────────────────────────────────
  const monthly = {};
  for (const r of results) {
    const ym = r.date.slice(0, 7);
    if (!monthly[ym]) monthly[ym] = {
      lock:0, trail:0, s1:0, tick:0, days:0,
      lockW:0, lockL:0, trailW:0, trailL:0, s1W:0, s1L:0, tickW:0, tickL:0
    };
    monthly[ym].lock  += r.lock;  monthly[ym].trail += r.trail; monthly[ym].s1 += r.s1;  monthly[ym].tick  += r.tick;
    monthly[ym].days  += 1;
    monthly[ym].lockW += r.lockW; monthly[ym].lockL += r.lockL;
    monthly[ym].trailW+= r.trailW;monthly[ym].trailL+= r.trailL;
    monthly[ym].s1W   += r.s1W;   monthly[ym].s1L   += r.s1L;
    monthly[ym].tickW += r.tickW; monthly[ym].tickL += r.tickL;
  }

  const fp = p => (p >= 0 ? '+' : '') + p;
  const fr = p => (p >= 0 ? '+' : '-') + 'Rs.' + Math.abs(p * QTY).toLocaleString('en-IN');
  const fw = (w, l) => w + 'W/' + l + 'L';

  console.log('═'.repeat(100));
  console.log('MONTHLY SUMMARY — ALL 4 STRATEGIES  (qty ' + QTY + ')');
  console.log('═'.repeat(100));
  console.log(' Month   Days | LOCK50        TRAIL          SCALP1         TICK TRAIL');
  console.log(' ' + '─'.repeat(97));

  let totL=0, totTr=0, totS1=0, totT=0, totDays=0;
  let totLW=0, totLL=0, totTrW=0, totTrL=0, totS1W=0, totS1L=0, totTW=0, totTL=0;

  for (const ym of Object.keys(monthly).sort()) {
    const m = monthly[ym];
    totL+=m.lock; totTr+=m.trail; totS1+=m.s1; totT+=m.tick; totDays+=m.days;
    totLW+=m.lockW; totLL+=m.lockL; totTrW+=m.trailW; totTrL+=m.trailL;
    totS1W+=m.s1W; totS1L+=m.s1L; totTW+=m.tickW; totTL+=m.tickL;
    console.log(
      ' ' + ym + '  ' + String(m.days).padEnd(4) +
      '| ' + (fp(m.lock)+' '+fw(m.lockW,m.lockL)).padEnd(15) +
      (fp(m.trail)+' '+fw(m.trailW,m.trailL)).padEnd(15) +
      (fp(m.s1)+' '+fw(m.s1W,m.s1L)).padEnd(15) +
      (fp(m.tick)+' '+fw(m.tickW,m.tickL))
    );
  }
  console.log(' ' + '─'.repeat(97));
  console.log(
    ' TOTAL  ' + String(totDays).padEnd(4) +
    '| ' + (fp(totL)+' '+fw(totLW,totLL)).padEnd(15) +
    (fp(totTr)+' '+fw(totTrW,totTrL)).padEnd(15) +
    (fp(totS1)+' '+fw(totS1W,totS1L)).padEnd(15) +
    (fp(totT)+' '+fw(totTW,totTL))
  );
  console.log('═'.repeat(100));

  // ── ANNUAL SUMMARY ────────────────────────────────────────────────
  const annual = {};
  for (const ym of Object.keys(monthly)) {
    const yr = ym.slice(0,4);
    if (!annual[yr]) annual[yr] = { lock:0, trail:0, s1:0, tick:0, days:0 };
    annual[yr].lock  += monthly[ym].lock;
    annual[yr].trail += monthly[ym].trail;
    annual[yr].s1    += monthly[ym].s1;
    annual[yr].tick  += monthly[ym].tick;
    annual[yr].days  += monthly[ym].days;
  }

  console.log('\nANNUAL SUMMARY:');
  console.log(' Year  Days | LOCK50 pts     Rs(30)          | TRAIL pts      Rs(30)          | SCALP1 pts     Rs(30)          | TICK TRAIL pts Rs(30)');
  console.log(' ' + '─'.repeat(120));
  for (const yr of Object.keys(annual).sort()) {
    const a = annual[yr];
    console.log(
      ' ' + yr + '  ' + String(a.days).padEnd(4) +
      '| ' + (fp(a.lock)+' pts').padEnd(16) + fr(a.lock).padEnd(18) +
      '| ' + (fp(a.trail)+' pts').padEnd(16) + fr(a.trail).padEnd(18) +
      '| ' + (fp(a.s1)+' pts').padEnd(16) + fr(a.s1).padEnd(18) +
      '| ' + (fp(a.tick)+' pts').padEnd(16) + fr(a.tick)
    );
  }
  console.log(' ' + '─'.repeat(120));
  console.log(
    ' ALL   ' + String(totDays).padEnd(4) +
    '| ' + (fp(totL)+' pts').padEnd(16) + fr(totL).padEnd(18) +
    '| ' + (fp(totTr)+' pts').padEnd(16) + fr(totTr).padEnd(18) +
    '| ' + (fp(totS1)+' pts').padEnd(16) + fr(totS1).padEnd(18) +
    '| ' + (fp(totT)+' pts').padEnd(16) + fr(totT)
  );

  console.log('\n── Rs. SUMMARY (qty ' + QTY + ') ─────────────────────────────');
  console.log('  LOCK50     : ' + fr(totL));
  console.log('  TRAIL      : ' + fr(totTr));
  console.log('  SCALP1     : ' + fr(totS1));
  console.log('  TICK TRAIL : ' + fr(totT));
  console.log('─────────────────────────────────────────────────────');
  console.log('  Avg/day    : LOCK50 ' + fp(Math.round(totL/totDays)) + '  TRAIL ' + fp(Math.round(totTr/totDays)) + '  SCALP1 ' + fp(Math.round(totS1/totDays)) + '  TICK_TRAIL ' + fp(Math.round(totT/totDays)));

  // ── BEST/WORST ────────────────────────────────────────────────────
  const sorted = [...results].sort((a, b) => a.tick - b.tick);
  console.log('\n TOP 5 WORST days (Tick Trail):');
  sorted.slice(0,5).forEach(r => console.log(
    '  ' + r.date + '  Lock:' + fp(r.lock).padEnd(8) + 'Trail:' + fp(r.trail).padEnd(8) + 'S1:' + fp(r.s1).padEnd(8) + 'Tick:' + fp(r.tick)
  ));
  console.log('\n TOP 5 BEST days (Tick Trail):');
  sorted.slice(-5).reverse().forEach(r => console.log(
    '  ' + r.date + '  Lock:' + fp(r.lock).padEnd(8) + 'Trail:' + fp(r.trail).padEnd(8) + 'S1:' + fp(r.s1).padEnd(8) + 'Tick:' + fp(r.tick)
  ));

  console.log('\n Win/Loss days:');
  console.log('  LOCK50 profitable days    : ' + results.filter(r=>r.lock>0).length + '/' + results.length);
  console.log('  TRAIL  profitable days    : ' + results.filter(r=>r.trail>0).length + '/' + results.length);
  console.log('  SCALP1 profitable days    : ' + results.filter(r=>r.s1>0).length + '/' + results.length);
  console.log('  TICK TRAIL profitable days: ' + results.filter(r=>r.tick>0).length + '/' + results.length);
}

run().catch(e => { console.error('ERR:', e.message); process.exit(1); });

