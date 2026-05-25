// simulate_today_bhav.js — fetch today's BANKNIFTY 15-min candles via Kite and run BHAV V3

const https = require('https');

const API_KEY = '7an6kfp8opzq0zai';
const ACCESS_TOKEN = 'IHXLJ6ND5YBU7T7gRpEhJo4uy9F0wwUY';
const INSTRUMENT = 260105; // BANKNIFTY index

// ── helpers ─────────────────────────────────────────────
const body = c => c.close - c.open;
const rng  = c => c.high - c.low;
const bp   = c => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;
const uwp  = c => c.high - c.open;
const lwp  = c => c.open - c.low;
const pdh  = cs => Math.max(...cs.map(c => c.high));
const pdl  = cs => Math.min(...cs.map(c => c.low));
const pdc  = cs => cs[cs.length - 1].close;

const firstBull = (cs, from, thresh = 30) => { for (let i = from; i < cs.length; i++) if (bp(cs[i]) > thresh) return i; return -1; };
const firstBear = (cs, from, thresh = 30) => { for (let i = from; i < cs.length; i++) if (bp(cs[i]) < -thresh) return i; return -1; };
const firstStrong = (cs, from, thresh = 55) => { for (let i = from; i < cs.length; i++) { const b = bp(cs[i]); if (Math.abs(b) > thresh) return { i, side: b > 0 ? 'CE' : 'PE' }; } return null; };

function findEntry(candles, prevCandles) {
  if (!candles || candles.length < 2 || !prevCandles || prevCandles.length === 0) return null;
  const PH = pdh(prevCandles), PL = pdl(prevCandles), PC = pdc(prevCandles);
  const C0 = candles[0];
  const gap = C0.open - PC;
  const vsPDH = C0.open - PH;
  const vsPDL = C0.open - PL;
  const ctx = vsPDH > 120 ? 'ABOVE_PDH' : vsPDL < 0 ? 'BELOW_PDL' : 'INSIDE';
  const C0bp = bp(C0), C1bp = candles[1] ? bp(candles[1]) : 0;

  // whipsaw guard
  const bps4 = candles.slice(0, Math.min(4, candles.length)).map(bp);
  let wipsaws = 0;
  for (let i = 1; i < bps4.length; i++)
    if (bps4[i] * bps4[i-1] < 0 && Math.abs(bps4[i]) > 65 && Math.abs(bps4[i-1]) > 65) wipsaws++;
  if (wipsaws >= 2) return { entry: null, ctx, reason: 'whipsaw' };

  if (ctx === 'ABOVE_PDH') {
    if (vsPDH > 1000) return { entry: { idx: 0, side: 'CE' }, ctx, reason: 'extraordinary_gap_ce' };
    if (C0bp < -20) return { entry: { idx: 0, side: 'PE' }, ctx, reason: 'above_pdh_c0_reversal_pe' };
    const bearIdx = firstBear(candles, 1, 35);
    if (bearIdx > 0 && bearIdx <= 7) return { entry: { idx: bearIdx, side: 'PE' }, ctx, reason: 'above_pdh_delayed_pe' };
    const contIdx = firstStrong(candles, 2, 55);
    if (contIdx) return { entry: { idx: contIdx.i, side: contIdx.side }, ctx, reason: 'above_pdh_continuation' };
    return { entry: null, ctx, reason: 'above_pdh_no_signal' };
  }

  if (ctx === 'BELOW_PDL') {
    if (C0bp < -65) return { entry: null, ctx, reason: 'selling_climax_skip' };
    if (C0bp > 65) { const i = firstBear(candles, 1, 30); if (i > 0) return { entry: { idx: i, side: 'PE' }, ctx, reason: 'recovery_bounce_pe' }; }
    if (C0.high < PL) {
      if (C1bp > 20) return { entry: { idx: 1, side: 'CE' }, ctx, reason: 'below_pdl_c1_bull_ce' };
      if (C1bp < -20) return { entry: { idx: 0, side: 'PE' }, ctx, reason: 'below_pdl_no_recovery_pe' };
      const s = firstStrong(candles, 2, 40);
      if (s && s.i <= 5) return { entry: { idx: s.i, side: s.side }, ctx, reason: 'below_pdl_c2_signal' };
      return { entry: null, ctx, reason: 'below_pdl_no_c1_signal' };
    }
    if (C0bp > 20) { const i = firstBear(candles, 1, 30); if (i > 0 && i <= 6) return { entry: { idx: i, side: 'PE' }, ctx, reason: 'below_pdl_partial_bounce_pe' }; }
    if (C0bp < -10) {
      for (let i = 2; i <= Math.min(7, candles.length - 2); i++)
        if (bp(candles[i]) < -45 && candles[i-1].close < PL) return { entry: { idx: i, side: 'PE' }, ctx, reason: 'below_pdl_failed_bounce_pe' };
    }
    return { entry: null, ctx, reason: 'below_pdl_ambiguous_avoid' };
  }

  // INSIDE
  if (C0.close < PL) return { entry: { idx: 0, side: 'PE' }, ctx, reason: 'inside_c0_breaks_below_pdl' };
  if (C0.close > PH) return { entry: { idx: 0, side: 'CE' }, ctx, reason: 'inside_c0_breaks_above_pdh' };
  const gapUp = gap > 50, gapDown = gap < -50;
  if (Math.abs(C0bp) > 55) {
    const side = C0bp > 0 ? 'CE' : 'PE';
    const aligned = (gapUp && side === 'CE') || (gapDown && side === 'PE');
    if (aligned) return { entry: { idx: 0, side }, ctx, reason: 'inside_c0_strong_gap_aligned' };
    return { entry: null, ctx, reason: 'inside_c0_strong_gap_trap_skip' };
  }
  if (C0bp > 25 && gapUp) return { entry: { idx: 0, side: 'CE' }, ctx, reason: 'inside_c0_mod_bull_gapup_ce' };
  if (C0bp < -25 && gapDown) return { entry: { idx: 0, side: 'PE' }, ctx, reason: 'inside_c0_mod_bear_gapdown_pe' };
  const s = firstStrong(candles, 1, 55);
  if (s && s.i <= 4) return { entry: { idx: s.i, side: s.side }, ctx, reason: 'inside_delayed_signal' };
  return { entry: null, ctx, reason: 'inside_no_signal' };
}

function simulateDay(candles, entryIdx, side, SL_PTS = 150, TRAIL_GAP = 20) {
  const ep = candles[entryIdx].close;
  let peak = ep, sl = ep + (side === 'CE' ? -SL_PTS : SL_PTS);
  let exit = null, exitReason = '', exitIdx = entryIdx;
  let eodCandle = candles[candles.length - 1];

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    const cur = c.close;
    const profit = side === 'CE' ? cur - ep : ep - cur;

    // EOD exit at last candle
    const t = new Date(c.time);
    if (t.getHours() >= 15 && t.getMinutes() >= 14) {
      exit = cur; exitReason = 'EOD'; exitIdx = i; break;
    }

    // Update trail
    if (profit > 0) {
      if (side === 'CE' && cur > peak) { peak = cur; sl = Math.max(sl, peak - TRAIL_GAP); }
      if (side === 'PE' && cur < peak) { peak = cur; sl = Math.min(sl, peak + TRAIL_GAP); }
    }

    // Check SL at candle close
    if (side === 'CE' && cur <= sl) { exit = cur; exitReason = 'SL_trail'; exitIdx = i; break; }
    if (side === 'PE' && cur >= sl) { exit = cur; exitReason = 'SL_trail'; exitIdx = i; break; }
  }

  if (!exit) { exit = candles[candles.length - 1].close; exitReason = 'EOD'; exitIdx = candles.length - 1; }
  const pts = side === 'CE' ? exit - ep : ep - exit;
  return { ep, exit, pts: Math.round(pts), sl: Math.round(sl), exitReason, exitIdx };
}

function getCandles(from, to, interval) {
  return new Promise((resolve, reject) => {
    const url = `https://api.kite.trade/instruments/historical/${INSTRUMENT}/${interval}?from=${from}&to=${to}`;
    const opts = { headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` } };
    https.get(url, opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.status !== 'success') return reject(j);
          const candles = j.data.candles.map(c => ({
            time: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5]
          }));
          resolve(candles);
        } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching candles from Kite...');
  // prev trading day = May 22 (May 23/24/25 weekend)
  const prevCandles = await getCandles('2026-05-22 09:15:00', '2026-05-22 15:30:00', '15minute');
  // today's candles
  const todayCandles = await getCandles('2026-05-25 09:15:00', '2026-05-25 15:30:00', '15minute');

  const PH = pdh(prevCandles), PL = pdl(prevCandles);
  console.log(`\nPrev day (May 24): PDH=${PH.toFixed(2)} PDL=${PL.toFixed(2)} PDC=${pdc(prevCandles).toFixed(2)}`);
  console.log(`Today's candles: ${todayCandles.length}`);
  console.log(`Today open: ${todayCandles[0]?.open} | C0: O=${todayCandles[0]?.open} H=${todayCandles[0]?.high} L=${todayCandles[0]?.low} C=${todayCandles[0]?.close}`);
  console.log(`\n=== CANDLE DATA ===`);
  todayCandles.forEach((c, i) => {
    const t = new Date(c.time);
    const hm = t.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'});
    console.log(`C${i.toString().padStart(2)} ${hm}  O:${c.open.toFixed(0)} H:${c.high.toFixed(0)} L:${c.low.toFixed(0)} C:${c.close.toFixed(0)}  bp:${bp(c).toFixed(0)}%`);
  });

  console.log(`\n=== BHAV V3 SIMULATION ===`);
  const res = findEntry(todayCandles, prevCandles);
  const C0 = todayCandles[0];
  console.log(`Context: ${res?.ctx} | vsPDH: ${(C0.open - PH).toFixed(0)} | vsPDL: ${(C0.open - PL).toFixed(0)}`);

  if (!res?.entry) {
    console.log(`NO ENTRY — reason: ${res?.reason}`);
    return;
  }

  const { idx, side } = res.entry;
  const entryCandle = todayCandles[idx];
  const t = new Date(entryCandle.time);
  const hm = t.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'});
  console.log(`\nEntry: ${side} at C${idx} (${hm}) — Entry price: ${entryCandle.close.toFixed(2)} — Reason: ${res.reason}`);

  const sim = simulateDay(todayCandles, idx, side);
  const inr = sim.pts * 15;
  const win = sim.pts > 0 ? 'WIN ✓' : 'LOSS ✗';
  console.log(`Exit:  ${sim.exit.toFixed(2)} — ${sim.exitReason}`);
  console.log(`P&L:   ${sim.pts > 0 ? '+' : ''}${sim.pts} pts = Rs ${inr > 0 ? '+' : ''}${inr} [${win}]`);
  console.log(`Trail SL at exit: ${sim.sl}`);
  console.log(`\nSummary: 1 trade | ${sim.pts} pts | Rs ${inr}`);
}

main().catch(e => { console.error('ERROR:', e.message || e); process.exit(1); });
