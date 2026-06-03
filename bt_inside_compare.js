'use strict';
// bt_inside_compare.js — ISOLATED test: only INSIDE entry loop differs
// Variant A: structural break (current deployed) — MUST show 266,196
// Variant B: body% >40% from C2 (simplified)
// Everything else: Strong C0, ABOVE_PDH, BELOW_PDL, re-entry, PDL/PDH late — IDENTICAL
const { KiteConnect } = require('kiteconnect');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const SL_PTS = 150, TRAIL_GAP = 10, MAX_TRADES = 5, MAX_RE = 5, DAILY_LOSS_CAP = 150;
const bp = c => (c.high - c.low) > 0 ? (c.close - c.open) / (c.high - c.low) * 100 : 0;
const firstBull   = (cs, f, t = 30) => { for (let i = f; i < cs.length; i++) if (bp(cs[i]) > t) return i; return -1; };
const firstBear   = (cs, f, t = 30) => { for (let i = f; i < cs.length; i++) if (bp(cs[i]) < -t) return i; return -1; };
const firstStrong = (cs, f, t = 55) => { for (let i = f; i < cs.length; i++) { const b = bp(cs[i]); if (Math.abs(b) > t) return { i, side: b > 0 ? 'CE' : 'PE' } } return null; };

// ── Shared: everything EXCEPT the INSIDE loop ─────────────────────────────
// insideFn(today, gapUp, gapDown, C0bp, lastIdx) → signal or null
function findEntry(today, prev, insideFn) {
  if (!today || today.length < 1 || !prev || prev.length === 0) return null;
  const PH = Math.max(...prev.map(c => c.high)), PL = Math.min(...prev.map(c => c.low)), PC = prev[prev.length - 1].close;
  const C0 = today[0], gap = C0.open - PC, lastIdx = today.length - 1;
  const vsPDH = C0.open - PH, vsPDL = C0.open - PL;
  const ctx = vsPDH > 120 ? 'ABOVE_PDH' : vsPDL < 0 ? 'BELOW_PDL' : 'INSIDE';
  const C0bp = bp(C0), C1bp = today[1] ? bp(today[1]) : 0;
  const bps4 = today.slice(0, Math.min(4, today.length)).map(bp); let w = 0;
  for (let i = 1; i < bps4.length; i++) if (bps4[i] * bps4[i - 1] < 0 && Math.abs(bps4[i]) > 65 && Math.abs(bps4[i - 1]) > 65) w++;
  if (w >= 2) return null;
  const at = (idx, side, r) => idx === lastIdx ? { idx, side, ctx, r } : null;

  // ── ABOVE_PDH (unchanged) ──────────────────────────────────────────────
  if (ctx === 'ABOVE_PDH') {
    if (vsPDH > 1000) return at(0, 'CE', 'xgap');
    if (C0bp > 85) return at(0, 'CE', 'trend');
    if (C0bp < -20) return at(0, 'PE', 'rev');
    const bi = firstBear(today, 1, 35); if (bi > 0 && bi <= 7) return at(bi, 'PE', 'del');
    const ci = firstStrong(today, 2, 55); if (ci) return at(ci.i, ci.side, 'cont');
    return null;
  }

  // ── BELOW_PDL (unchanged) ─────────────────────────────────────────────
  if (ctx === 'BELOW_PDL') {
    if (C0bp < -80) return at(0, 'PE', 'trend');
    if (C0bp < -65) return null;
    if (C0bp > 65) { const i = firstBear(today, 1, 30); if (i > 0) return at(i, 'PE', 'bounce'); }
    if (C0.high < PL) {
      if (today.length >= 2 && C1bp > 20) return at(1, 'CE', 'c1b');
      if (C1bp < -20) return at(0, 'PE', 'norec');
      const s = firstStrong(today, 2, 40); if (s && s.i <= 5) return at(s.i, s.side, 'c2');
      return null;
    }
    if (C0bp > 20) { const i = firstBear(today, 1, 30); if (i > 0 && i <= 6) return at(i, 'PE', 'pb'); }
    if (C0bp < -10) { for (let i = 2; i <= Math.min(7, today.length - 2); i++) if (bp(today[i]) < -45 && today[i - 1].close < PL) return at(i, 'PE', 'fb'); }
    return null;
  }

  // ── INSIDE ────────────────────────────────────────────────────────────
  if (C0.close < PL && lastIdx === 0) return at(0, 'PE', 'bb');
  if (C0.close > PH && lastIdx === 0) return at(0, 'CE', 'ba');

  const gapUp = gap > 50, gapDown = gap < -50;

  // Strong C0 >55% (unchanged)
  if (Math.abs(C0bp) > 55) {
    const bull = C0bp > 0, al = (bull && !gapDown) || (!bull && !gapUp);
    if (al) {
      if (today.length >= 2 && C1bp * C0bp < 0 && Math.abs(C1bp) > 72) { const s = at(1, C1bp > 0 ? 'CE' : 'PE', 'trap'); if (s) return s; }
      { const s = at(0, bull ? 'CE' : 'PE', 'mom'); if (s) return s; }
    } else {
      const gs = gapUp ? 'CE' : 'PE', rc = gapUp ? firstBull(today, 1, 35) : firstBear(today, 1, 35);
      if (rc > 0 && rc <= 5) { const s = at(rc, gs, 'cg'); if (s) return s; }
      { const s = at(0, bull ? 'CE' : 'PE', 'mnr'); if (s) return s; }
    }
  }

  // ── INSIDE loop: pluggable (only thing that changes between A and B) ──
  const loopSig = insideFn(today, gapUp, gapDown, C0bp, lastIdx, at, PL, PH);
  if (loopSig) return loopSig;

  // Late PDL/PDH entries C5-C20 (unchanged)
  for (let i = 5; i < Math.min(today.length, 21); i++) {
    const pc = today[i - 1].close;
    if (today[i].low <= PL && pc > PL && bp(today[i]) > 35) return at(i, 'CE', 'pdlt');
    if (today[i].high >= PH && pc < PH && bp(today[i]) < -35) return at(i, 'PE', 'pdht');
  }
  return null;
}

// ── Variant A: structural break (DEPLOYED) ───────────────────────────────
function insideStruct(today, gapUp, gapDown, C0bp, lastIdx, at) {
  for (let i = 1; i < today.length; i++) {
    const prevC = today[i - 1], curr = today[i];
    if (curr.close < prevC.low) {
      if (gapUp && C0bp > 20) continue;
      const s = at(i, 'PE', 'sb_pe'); if (s) return s;
    }
    if (curr.close > prevC.high) {
      if (gapDown && C0bp < -20) continue;
      const s = at(i, 'CE', 'sb_ce'); if (s) return s;
    }
  }
  return null;
}

// ── Variant B: body% >40% from C2 (simplified) ───────────────────────────
function insideBody(today, gapUp, gapDown, C0bp, lastIdx, at) {
  for (let i = 1; i <= 9; i++) {
    if (i >= today.length) break;
    const cbp = bp(today[i]);
    if (Math.abs(cbp) > 40) {
      const signalBull = cbp > 0;
      const oppGap = (signalBull && gapDown) || (!signalBull && gapUp);
      const c0ModOpp = (signalBull && C0bp < -20) || (!signalBull && C0bp > 20);
      if (oppGap && c0ModOpp) continue;
      const s = at(i, cbp > 0 ? 'CE' : 'PE', 'body40'); if (s) return s;
    }
  }
  return null;
}

// ── Re-entry: body% >40% — IDENTICAL for both variants ───────────────────
function findReEntry(today, exitIdx, side, allowReverse) {
  const lastIdx = today.length - 1; if (lastIdx <= exitIdx) return null;
  const rev = side === 'CE' ? 'PE' : 'CE'; let sd = null, rd = null;
  for (let i = exitIdx + 1; i <= lastIdx; i++) {
    const b = bp(today[i]);
    if (!sd) { if (side === 'CE' && b > 40) sd = { idx: i, side }; if (side === 'PE' && b < -40) sd = { idx: i, side }; }
    if (!rd && allowReverse) { if (rev === 'CE' && b > 40) rd = { idx: i, side: rev }; if (rev === 'PE' && b < -40) rd = { idx: i, side: rev }; }
    if (sd && (!allowReverse || rd)) break;
  }
  if (sd && rd) return sd.idx <= rd.idx ? sd : rd; return sd || rd || null;
}

function trailUpdate(state, candle, isEOD) {
  const sign = state.dir === 'CE' ? 1 : -1;
  const fav = state.dir === 'CE' ? candle.high - state.entry : state.entry - candle.low;
  let pk = state.peakPts, ts = state.trailStop;
  if (fav > pk) { pk = fav; ts = pk >= TRAIL_GAP ? pk - TRAIL_GAP : -SL_PTS; }
  const cp = sign * (candle.close - state.entry);
  if (isEOD || cp <= ts) { return { action: isEOD ? 'EOD' : ts <= 0 ? 'SL' : 'TRAIL', pts: isEOD ? cp : ts, peakPts: pk }; }
  state.peakPts = pk; state.trailStop = ts; return { action: 'HOLD', pts: 0 };
}

function runDay(today, prev, insideFn) {
  const lc = today.slice(1); if (lc.length < 2) return 0;
  let st = { inTrade: false, dir: null, entry: 0, trailStop: -SL_PTS, peakPts: 0, firstDone: false, reCount: 0, lastExitPts: 0, lastExitIdx: -1, lastExitDir: null };
  let dayPnL = 0, trades = 0;
  for (let li = 0; li < lc.length; li++) {
    const bc = lc[li], isEOD = li >= lc.length - 1;
    if (st.inTrade) {
      const tr = trailUpdate(st, bc, isEOD);
      if (tr.action !== 'HOLD') { dayPnL += tr.pts; trades++; st.inTrade = false; st.firstDone = true; st.lastExitPts = tr.peakPts; st.lastExitIdx = li; st.lastExitDir = st.dir; st.dir = null; st.entry = 0; st.peakPts = 0; st.trailStop = -SL_PTS; }
      continue;
    }
    if (isEOD || trades >= MAX_TRADES || dayPnL <= -DAILY_LOSS_CAP) continue;
    let sig = null; const sl = lc.slice(0, li + 1);
    if (st.firstDone && st.reCount < MAX_RE && st.lastExitPts >= 0 && st.lastExitIdx >= 0 && st.lastExitDir) {
      const re = findReEntry(sl, st.lastExitIdx, st.lastExitDir, true); if (re && re.idx === li) sig = re;
    } else if (!st.firstDone) { sig = findEntry(sl, prev, insideFn); }
    if (!sig) continue;
    st.inTrade = true; st.dir = sig.side; st.entry = bc.close; st.trailStop = -SL_PTS; st.peakPts = 0;
    if (st.firstDone) st.reCount++;
  }
  return dayPnL;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchChunk(from, to) {
  const d = await kite.getHistoricalData(260105, '15minute', from, to, false);
  return d.map(x => ({ date: x.date instanceof Date ? x.date : new Date(x.date), open: x.open, high: x.high, low: x.low, close: x.close }));
}

async function main() {
  console.log('ISOLATED INSIDE entry test (Jan 2021 – May 2026)...');
  console.log('Only difference: INSIDE loop (struct break vs body >40%)');
  console.log('Strong C0 / ABOVE_PDH / BELOW_PDL / re-entry = IDENTICAL');
  const startDate = new Date('2021-01-01'), endDate = new Date('2026-05-25');
  const all = []; let cur = new Date(startDate);
  while (cur < endDate) {
    const ce = new Date(cur); ce.setDate(ce.getDate() + 59); if (ce > endDate) ce.setTime(endDate.getTime());
    try { const chunk = await fetchChunk(cur.toISOString().slice(0, 10), ce.toISOString().slice(0, 10)); all.push(...chunk); process.stdout.write('.'); } catch (e) { process.stdout.write('E'); }
    await sleep(350); cur.setDate(cur.getDate() + 60);
  }
  console.log('\nBuilding day map...');
  const days = {};
  for (const c of all) {
    const ist = new Date(c.date.getTime() + 5.5 * 3600 * 1000);
    const tm = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    if (tm < 9 * 60 + 15 || tm > 15 * 60 + 15) continue;
    const dk = ist.toISOString().slice(0, 10);
    if (!days[dk]) days[dk] = [];
    days[dk].push({ open: c.open, high: c.high, low: c.low, close: c.close });
  }

  const dates = Object.keys(days).sort();
  let structTotal = 0, bodyTotal = 0;
  let greenToRed = [], redToGreen = [], bothGreen = 0, bothRed = 0;
  let bothGreenStruct = 0, bothGreenBody = 0, bothRedStruct = 0, bothRedBody = 0;

  for (let di = 1; di < dates.length; di++) {
    const today = days[dates[di]], prev = days[dates[di - 1]];
    if (!today || today.length < 3 || !prev || prev.length < 3) continue;
    const sPnL = runDay(today, prev, insideStruct);
    const bPnL = runDay(today, prev, insideBody);
    structTotal += sPnL; bodyTotal += bPnL;
    const sg = sPnL > 0, bg = bPnL > 0;
    if (sg && !bg) greenToRed.push({ date: dates[di], s: Math.round(sPnL), b: Math.round(bPnL) });
    else if (!sg && bg) redToGreen.push({ date: dates[di], s: Math.round(sPnL), b: Math.round(bPnL) });
    else if (sg && bg) { bothGreen++; bothGreenStruct += sPnL; bothGreenBody += bPnL; }
    else              { bothRed++;   bothRedStruct  += sPnL; bothRedBody  += bPnL; }
  }

  const gtrS = greenToRed.reduce((a, d) => a + d.s, 0);
  const gtrB = greenToRed.reduce((a, d) => a + d.b, 0);
  const rtgS = redToGreen.reduce((a, d) => a + d.s, 0);
  const rtgB = redToGreen.reduce((a, d) => a + d.b, 0);

  console.log('\n════════════════════════════════════════════════════════');
  console.log('BASELINE CHECK (must = 266,196 to trust this test):');
  console.log('  Struct break (A): ' + Math.round(structTotal) + ' pts');
  console.log('  Body% >40%   (B): ' + Math.round(bodyTotal)   + ' pts');
  console.log('  Diff A-B        : ' + (Math.round(structTotal - bodyTotal) >= 0 ? '+' : '') + Math.round(structTotal - bodyTotal) + ' pts');
  console.log('════════════════════════════════════════════════════════');
  console.log('Both GREEN  : ' + bothGreen + ' days  STRUCT:' + Math.round(bothGreenStruct) + '  BODY:' + Math.round(bothGreenBody) + '  diff:' + (Math.round(bothGreenStruct - bothGreenBody) >= 0 ? '+' : '') + Math.round(bothGreenStruct - bothGreenBody));
  console.log('Both RED    : ' + bothRed   + ' days  STRUCT:' + Math.round(bothRedStruct)   + '  BODY:' + Math.round(bothRedBody)   + '  diff:' + (Math.round(bothRedStruct - bothRedBody) >= 0 ? '+' : '') + Math.round(bothRedStruct - bothRedBody));
  console.log('STRUCT→RED  : ' + greenToRed.length + ' days  STRUCT:+' + gtrS + '  BODY:' + gtrB + '  diff:' + Math.round(gtrB - gtrS));
  console.log('BODY→GREEN  : ' + redToGreen.length + ' days  STRUCT:' + rtgS  + '  BODY:+' + rtgB + '  diff:+' + Math.round(rtgB - rtgS));
  console.log('\n── Top 10 struct HURT (struct green but body red) ──────');
  greenToRed.sort((a, b) => (a.b - a.s) - (b.b - b.s)).slice(0, 10)
    .forEach(d => console.log(`  ${d.date}  STRUCT:+${d.s}  BODY:${d.b}  diff:${d.b - d.s}`));
  console.log('\n── Top 10 struct HELPED (body green but struct red) ────');
  redToGreen.sort((a, b) => (b.s - b.b) - (a.s - a.b)).slice(0, 10)
    .forEach(d => console.log(`  ${d.date}  STRUCT:${d.s}  BODY:+${d.b}  diff:+${d.s - d.b}`));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
