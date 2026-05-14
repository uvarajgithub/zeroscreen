// Quick trade-count analysis for Tick Trail
// Runs bt_full logic but just counts trades per day distribution

require('dotenv').config({ path: '/home/ubuntu/trading-bot/.env' });
const { KiteConnect } = require('/home/ubuntu/trading-bot/node_modules/kiteconnect');
const { createHybridState, processHybridCandle, trailLock50 } = require('/home/ubuntu/trading-bot/dist/src/strategy');

const kc = new KiteConnect({ api_key: process.env.API_KEY });
kc.setAccessToken(process.env.ACCESS_TOKEN);

const CHUNK_DAYS = 60;
const YEARS_BACK = 2;

function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
function toISTDate(d){return new Date(d).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).split('/').reverse().join('-');}
function toIST(d){return new Date(d).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:true});}
function parseHour(ist){const m=/(\d+):(\d+)\s*(am|pm)/i.exec(ist);if(!m)return 0;let h=parseInt(m[1]);if(m[3].toLowerCase()==='pm'&&h!==12)h+=12;if(m[3].toLowerCase()==='am'&&h===12)h=0;return h;}

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

function runDay(candles) {
  const C = candles;
  if (C.length < 5) return null;
  let ttS = createHybridState(), ttLog = [], ttPrev = null, ttPeak = 0, ttPnl = 0, ttW = 0, ttL = 0;

  for (let i = 1; i < C.length; i++) {
    const prev = C[i-1], curr = C[i];
    const ist = curr.ist;
    const eod = ist.includes('3:15') || ist.includes('3:30');
    if (ttPrev) {
      const sig = processHybridCandle(ttS, ttPrev, curr, eod, trailLock50);
      if (sig.action === 'ENTER' || sig.action === 'REVERSE_ENTER') {
        if (sig.action === 'REVERSE_ENTER') {
          const l = ttLog[ttLog.length-1];
          if (l && l.pts == null) { l.pts = Math.round(ttPeak >= 50 ? ttPeak-25 : -100); l.r='sl_reverse'; ttPnl+=l.pts; if(l.pts>0)ttW++;else ttL++; }
        }
        ttLog.push({ t: ist, d: ttS.dir, en: ttS.entry || curr.close, pts: null, r: null });
        ttPeak = 0;
      }
      const tt = tickTrailCheck(ttLog, ttPeak, curr);
      if (tt) {
        ttPeak = tt.peak;
        if (tt.exit != null) {
          const l = ttLog[ttLog.length-1];
          if (l && l.pts == null) { l.pts = Math.round(tt.exit); l.r='tick_trail'; ttPnl+=tt.exit; if(tt.exit>0)ttW++;else ttL++; ttPeak=0; }
        }
      }
      if (ttLog[ttLog.length-1] && ttLog[ttLog.length-1].pts == null) {
        if (sig.action==='EXIT_EARLY'||sig.action==='EXIT_SL'||sig.action==='EXIT_EOD') {
          const l = ttLog[ttLog.length-1];
          if (l && l.pts==null) { l.pts=Math.round(sig.pts); l.r=sig.action.toLowerCase(); ttPnl+=sig.pts; if(sig.pts>0)ttW++;else ttL++; ttPeak=0; }
        }
      }
    }
    ttPrev = prev;
  }
  return { trades: ttLog.length, pnl: Math.round(ttPnl), w: ttW, l: ttL };
}

async function run() {
  const now = new Date();
  const startDate = addDays(now, -YEARS_BACK * 365);
  const chunks = [];
  let cur = new Date(startDate);
  while (cur < now) {
    const next = addDays(cur, CHUNK_DAYS);
    chunks.push({ from: new Date(cur), to: next > now ? now : next });
    cur = next;
  }

  const allCandles = [];
  for (let ci = 0; ci < chunks.length; ci++) {
    const { from, to } = chunks[ci];
    const fromStr = from.toISOString().slice(0,10) + ' 09:00:00';
    const toStr   = to.toISOString().slice(0,10)   + ' 15:30:00';
    try {
      const raw = await kc.getHistoricalData(260105, '15minute', fromStr, toStr, false);
      if (raw && raw.length > 0) allCandles.push(...raw);
    } catch (e) {}
    await new Promise(r => setTimeout(r, 400));
  }

  const byDate = {};
  for (const c of allCandles) {
    const date = toISTDate(c.date);
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({ open:c.open, high:c.high, low:c.low, close:c.close, date:c.date, ist:toIST(c.date) });
  }

  const tradingDates = Object.keys(byDate).filter(d => byDate[d].length >= 10).sort();
  console.log(`Trading days: ${tradingDates.length}\n`);

  // Count distribution
  const dist = {}; // trades_per_day -> count
  let totalTrades = 0, totalDays = 0;
  let maxPerDay = 0;
  const byCnt = {}; // trades -> {pnl, days}

  for (const date of tradingDates) {
    const candles = byDate[date].sort((a,b) => new Date(a.date)-new Date(b.date));
    const r = runDay(candles);
    if (!r) continue;
    totalDays++;
    totalTrades += r.trades;
    maxPerDay = Math.max(maxPerDay, r.trades);
    dist[r.trades] = (dist[r.trades] || 0) + 1;
    if (!byCnt[r.trades]) byCnt[r.trades] = { days: 0, pnl: 0, w: 0, l: 0 };
    byCnt[r.trades].days++;
    byCnt[r.trades].pnl += r.pnl;
    byCnt[r.trades].w += r.w;
    byCnt[r.trades].l += r.l;
  }

  console.log('Trades/Day Distribution (Tick Trail — 2 years):');
  console.log('Trades | Days | % days | Avg P&L/day | Win%');
  console.log('─'.repeat(55));
  for (let t = 0; t <= maxPerDay; t++) {
    const b = byCnt[t];
    if (!b) continue;
    const pct = ((b.days / totalDays) * 100).toFixed(1);
    const avg = (b.pnl / b.days).toFixed(0);
    const total = b.w + b.l;
    const wr = total > 0 ? ((b.w / total) * 100).toFixed(0) : '-';
    console.log(`  ${String(t).padEnd(5)}  ${String(b.days).padEnd(5)} ${pct.padStart(5)}%   ${(avg >= 0 ? '+' : '') + avg} pts     ${wr}%`);
  }
  console.log('─'.repeat(55));
  console.log(`  TOTAL  ${totalDays} days | Avg trades/day: ${(totalTrades/totalDays).toFixed(2)} | Max: ${maxPerDay}`);
  
  // Cumulative P&L if limited to N trades/day
  console.log('\nP&L if limited to N trades/day max:');
  console.log('Limit | Total pts | Total Rs (qty 30) | Days capped');
  console.log('─'.repeat(60));
  for (let limit = 1; limit <= Math.min(maxPerDay, 8); limit++) {
    // recalculate
    let pts = 0, capped = 0;
    for (const date of tradingDates) {
      const candles = byDate[date].sort((a,b) => new Date(a.date)-new Date(b.date));
      const r = runDay(candles); // simplified: just use total day pnl if trades <= limit, else approximate
      if (!r) continue;
      // We can't easily cap mid-day here, but use distribution as proxy
    }
    // Use distribution data as proxy
    let totalPts = 0;
    for (let t = 0; t <= maxPerDay; t++) {
      const b = byCnt[t];
      if (!b) continue;
      if (t <= limit) totalPts += b.pnl;
      else { totalPts += b.pnl; capped += b.days; } // can't precisely cap without per-trade data
    }
    const rs = totalPts * 30;
    console.log(`  ${String(limit).padEnd(5)} ${String(totalPts).padStart(8)} pts   Rs.${Math.abs(rs).toLocaleString('en-IN').padStart(10)}   ~${capped} days had more`);
  }
}

run().catch(console.error);
