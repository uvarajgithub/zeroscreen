// Fetch last 5 days BankNifty 15-min data from Yahoo Finance
// Then run Variant B strategy (buf=25, trail=100, RE=opposite)
const https = require('https');

const RS=15, SL_INITIAL=60, TRAIL_GAP=100, BUFFER=25;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0',
        'Accept': 'application/json',
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse error: ' + data.slice(0,200))); }
      });
    });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

async function fetchBankNifty15m() {
  // ^NSEBANK = BankNifty Index on Yahoo Finance
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEBANK?interval=15m&range=7d';
  const data = await fetchJson(url);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('No data from Yahoo Finance');

  const timestamps = result.timestamps || result.timestamp;
  const q = result.indicators?.quote?.[0];
  if (!timestamps || !q) throw new Error('Missing timestamps or quotes');

  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (!q.open[i] || !q.close[i]) continue;
    // Convert Unix timestamp to IST
    const utcMs = timestamps[i] * 1000;
    const istMs = utcMs + (5.5 * 3600 * 1000);
    const d = new Date(istMs);
    const date = d.getUTCFullYear() + '-' +
      String(d.getUTCMonth()+1).padStart(2,'0') + '-' +
      String(d.getUTCDate()).padStart(2,'0');
    const h = d.getUTCHours(), m = d.getUTCMinutes();
    // Only market hours 9:15 to 15:30 IST
    if (h < 9 || (h === 9 && m < 15) || h > 15 || (h === 15 && m > 30)) continue;
    candles.push({ date, h, m, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i] });
  }
  return candles;
}

// ── Same strategy logic as backtest_variantB_full.js ──────────
const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);

function enrich(c) {
  const bull = c.close >= c.open;
  const bh = Math.max(c.open, c.close);
  const bl = Math.min(c.open, c.close);
  return Object.assign({}, c, { bull, body_high: bh, body_low: bl, body_size: bh - bl });
}

function rollingEntryScan(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i+1];
    let sig = null, c2l = 0, c3l = 0, rule = '';
    if (ca.bull === cb.bull) {
      sig = ca.bull ? 'CE' : 'PE';
      c2l = sig==='CE' ? ca.high : ca.low;
      c3l = sig==='CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
      rule = 'A';
    } else if (cb.body_size > ca.body_size) {
      sig = cb.bull ? 'CE' : 'PE';
      c2l = sig==='CE' ? ca.body_high : ca.body_low;
      c3l = sig==='CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
      rule = 'B';
    } else continue;
    if (sig==='CE' && cb.close > c2l) return { sig, entryIdx: i+1, px: cb.close, rule: rule+'(C2)' };
    if (sig==='PE' && cb.close < c2l) return { sig, entryIdx: i+1, px: cb.close, rule: rule+'(C2)' };
    for (let j = i+2; j < cs.length; j++) {
      const c = cs[j];
      if (sig==='CE' && c.close > c3l) return { sig, entryIdx: j, px: c.close, rule };
      if (sig==='PE' && c.close < c3l) return { sig, entryIdx: j, px: c.close, rule };
    }
  }
  return null;
}

function simLeg(cs, startIdx, dir) {
  const entry = cs[startIdx].close;
  let sl = dir==='CE' ? entry - SL_INITIAL : entry + SL_INITIAL;
  let peak = 0;
  for (let idx = startIdx+1; idx < cs.length; idx++) {
    const c = cs[idx];
    if (isEOD(c)) return { pts: dir==='CE' ? c.close-entry : entry-c.close, type:'EOD', exitPx: c.close, exitTime: `${c.h}:${String(c.m).padStart(2,'0')}` };
    const ib = dir==='CE' ? c.high-entry : entry-c.low;
    if (ib > peak) peak = ib;
    if (peak >= SL_INITIAL) {
      const locked = Math.max(0, peak - TRAIL_GAP);
      if (dir==='CE') sl = Math.max(sl, entry + locked);
      else sl = Math.min(sl, entry - locked);
    }
    const intraTouched = dir==='CE' ? c.low <= sl : c.high >= sl;
    const margin = dir==='CE' ? sl - c.close : c.close - sl;
    if (intraTouched && margin >= BUFFER) return { pts: dir==='CE' ? sl-entry : entry-sl, type:'SL', exitPx: sl, exitTime: `${c.h}:${String(c.m).padStart(2,'0')}` };
  }
  const last = cs[cs.length-1];
  return { pts: dir==='CE' ? last.close-entry : entry-last.close, type:'EOD', exitPx: last.close, exitTime: 'EOD' };
}

async function todayDetail(candles) {
  const today = new Date(Date.now() + 5.5*3600000);
  const todayStr = today.getUTCFullYear()+'-'+String(today.getUTCMonth()+1).padStart(2,'0')+'-'+String(today.getUTCDate()).padStart(2,'0');
  const cs = candles.filter(c => c.date === todayStr);
  if (!cs.length) { console.log('No candles for today'); return; }
  console.log('='.repeat(72));
  console.log(' MAY 20 — FULL CANDLE DATA (BankNifty 15-min)');
  console.log('='.repeat(72));
  let dh=0, dl=999999, prev=null;
  for (const c of cs) {
    if (c.high > dh) dh = c.high;
    if (c.low < dl) dl = c.low;
    const dir = c.close >= c.open ? 'UP' : 'DN';
    const chg = prev != null ? ((c.close-prev >= 0 ? '+' : '') + (c.close-prev).toFixed(0)) : '---';
    const mark = (c.h===10 && c.m===30) ? '  <-- STRATEGY DONE HERE' : (c.h===10 && c.m===45) ? '  <-- RE DONE HERE' : '';
    console.log(`${c.h}:${String(c.m).padStart(2,'0')}  ${c.open.toFixed(0)}/${c.high.toFixed(0)}/${c.low.toFixed(0)}/${c.close.toFixed(0)}  ${dir}  chg:${chg}${mark}`);
    prev = c.close;
  }
  const dayOpen = cs[0].open;
  console.log('---');
  console.log(`Open: ${dayOpen.toFixed(0)} | High: ${dh.toFixed(0)} | Low: ${dl.toFixed(0)} | Close: ${prev.toFixed(0)}`);
  console.log(`Move from open: ${prev-dayOpen>=0?'+':''}${(prev-dayOpen).toFixed(0)} pts | Range: ${(dh-dl).toFixed(0)} pts`);
  console.log(`What strategy got: Rs 0 (both legs breakeven at 10:30/10:45)`);
  console.log(`What was available after exit: ${(prev-53051>=0?'+':'')+(prev-53051).toFixed(0)} pts move from signal entry`);
}

async function main(candles) {

  // Group by date
  const byDay = {};
  for (const c of candles) {
    if (!byDay[c.date]) byDay[c.date] = [];
    byDay[c.date].push(c);
  }
  const dates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 4);
  const last5 = dates.slice(-5);

  console.log('='.repeat(72));
  console.log(' LAST 5 DAYS — Variant B (buf=25, trail=100, RE=opposite)');
  console.log(' Data: Yahoo Finance (^NSEBANK) — LIVE/FRESH');
  console.log('='.repeat(72));

  let grandTotal = 0;
  for (const date of last5) {
    const cs = byDay[date].map(enrich);
    let res = null;
    for (let idx = 0; idx < cs.length; idx++) {
      if (isEOD(cs[idx])) break;
      const r = rollingEntryScan(cs.slice(0, idx+1));
      if (!r || r.entryIdx !== idx) continue;
      res = r; break;
    }
    const c1 = cs[0], c2 = cs[1] || cs[0];
    console.log('\n' + '-'.repeat(72));
    console.log(` DATE: ${date}  |  Open: ${c1.open.toFixed(0)}`);
    console.log(` C1: O=${c1.open.toFixed(0)} H=${c1.high.toFixed(0)} L=${c1.low.toFixed(0)} C=${c1.close.toFixed(0)} ${c1.bull?'▲':'▼'}  |  C2: O=${c2.open.toFixed(0)} H=${c2.high.toFixed(0)} L=${c2.low.toFixed(0)} C=${c2.close.toFixed(0)} ${c2.bull?'▲':'▼'}`);

    if (!res) {
      console.log(` SIGNAL: NONE — No trade today`);
      console.log(` DAY P&L: Rs 0  [FLAT]`);
      continue;
    }
    const entryTime = `${cs[res.entryIdx].h}:${String(cs[res.entryIdx].m).padStart(2,'0')}`;
    console.log(` SIGNAL: ${res.sig} @ ${res.px.toFixed(0)} at ${entryTime}  (Rule ${res.rule})`);

    const t1 = simLeg(cs, res.entryIdx, res.sig);
    const t1Rs = Math.round(t1.pts * RS);
    console.log(` T1 ${res.sig}: ${res.px.toFixed(0)} → ${t1.exitPx.toFixed(0)} @ ${t1.exitTime} | ${t1.pts>=0?'+':''}${t1.pts.toFixed(1)} pts | Rs ${t1Rs>=0?'+':''}${t1Rs} [${t1.type}]`);

    let rePts = 0, reRs = 0;
    if (t1.type === 'SL') {
      const reDir = res.sig==='CE' ? 'PE' : 'CE';
      let reStart = res.entryIdx + 1;
      for (let i = res.entryIdx+1; i < cs.length; i++) {
        if (`${cs[i].h}:${String(cs[i].m).padStart(2,'0')}` === t1.exitTime) { reStart = i; break; }
      }
      const re = simLeg(cs, reStart, reDir);
      rePts = re.pts; reRs = Math.round(re.pts * RS);
      console.log(` RE ${reDir}: ${cs[reStart].close.toFixed(0)} → ${re.exitPx.toFixed(0)} @ ${re.exitTime} | ${re.pts>=0?'+':''}${re.pts.toFixed(1)} pts | Rs ${reRs>=0?'+':''}${reRs} [${re.type}]`);
    }

    const dayPts = t1.pts + rePts;
    const dayRs = t1Rs + reRs;
    grandTotal += dayRs;
    const result = dayRs > 0 ? 'WIN' : dayRs < 0 ? 'LOSS' : 'FLAT';
    console.log(` DAY P&L: Rs ${dayRs>=0?'+':''}${dayRs}  [${result}]`);
  }

  console.log('\n' + '='.repeat(72));
  console.log(` 5-DAY TOTAL: Rs ${grandTotal>=0?'+':''}${grandTotal}`);
  console.log('='.repeat(72));
}

async function run() {
  console.log('Fetching BankNifty 15-min data from Yahoo Finance...');
  let candles;
  try { candles = await fetchBankNifty15m(); }
  catch(e) { console.error('Yahoo Finance error:', e.message); process.exit(1); }
  if (!candles.length) { console.error('No candles fetched'); process.exit(1); }
  console.log(`Fetched ${candles.length} candles\n`);
  await todayDetail(candles);
  await main(candles);
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
