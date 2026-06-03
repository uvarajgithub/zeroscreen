'use strict';
// bt_compare_reentry.js — per-day: struct entry + body% re-entry vs struct entry + struct re-entry
// Current deployed = 266,196 pts | struct re-entry candidate = 271,225 pts
const { KiteConnect } = require('kiteconnect');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const SL_PTS = 150, TRAIL_GAP = 10, MAX_TRADES = 5, MAX_RE = 5, DAILY_LOSS_CAP = 150;
const bp = c => (c.high - c.low) > 0 ? (c.close - c.open) / (c.high - c.low) * 100 : 0;
const firstBull = (cs, f, t = 30) => { for (let i = f; i < cs.length; i++) if (bp(cs[i]) > t) return i; return -1; };
const firstBear = (cs, f, t = 30) => { for (let i = f; i < cs.length; i++) if (bp(cs[i]) < -t) return i; return -1; };
const firstStrong = (cs, f, t = 55) => { for (let i = f; i < cs.length; i++) { const b = bp(cs[i]); if (Math.abs(b) > t) return { i, side: b > 0 ? 'CE' : 'PE' } } return null; };

// Shared entry: structural break (same as deployed)
function findEntry(today, prev) {
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
  if (ctx === 'ABOVE_PDH') {
    if (vsPDH > 1000) return at(0, 'CE', 'xgap'); if (C0bp > 85) return at(0, 'CE', 'trend'); if (C0bp < -20) return at(0, 'PE', 'rev');
    const bi = firstBear(today, 1, 35); if (bi > 0 && bi <= 7) return at(bi, 'PE', 'del');
    const ci = firstStrong(today, 2, 55); if (ci) return at(ci.i, ci.side, 'cont'); return null;
  }
  if (ctx === 'BELOW_PDL') {
    if (C0bp < -80) return at(0, 'PE', 'trend'); if (C0bp < -65) return null;
    if (C0bp > 65) { const i = firstBear(today, 1, 30); if (i > 0) return at(i, 'PE', 'bounce'); }
    if (C0.high < PL) { if (today.length >= 2 && C1bp > 20) return at(1, 'CE', 'c1b'); if (C1bp < -20) return at(0, 'PE', 'norec'); const s = firstStrong(today, 2, 40); if (s && s.i <= 5) return at(s.i, s.side, 'c2'); return null; }
    if (C0bp > 20) { const i = firstBear(today, 1, 30); if (i > 0 && i <= 6) return at(i, 'PE', 'pb'); }
    if (C0bp < -10) { for (let i = 2; i <= Math.min(7, today.length - 2); i++) if (bp(today[i]) < -45 && today[i - 1].close < PL) return at(i, 'PE', 'fb'); }
    return null;
  }
  if (C0.close < PL && lastIdx === 0) return at(0, 'PE', 'bb'); if (C0.close > PH && lastIdx === 0) return at(0, 'CE', 'ba');
  const gapUp = gap > 50, gapDown = gap < -50;
  if (Math.abs(C0bp) > 55) {
    const bull = C0bp > 0, al = (bull && !gapDown) || (!bull && !gapUp);
    if (al) { if (today.length >= 2 && C1bp * C0bp < 0 && Math.abs(C1bp) > 72) { const s = at(1, C1bp > 0 ? 'CE' : 'PE', 'trap'); if (s) return s; } { const s = at(0, bull ? 'CE' : 'PE', 'mom'); if (s) return s; } }
    else { const gs = gapUp ? 'CE' : 'PE', rc = gapUp ? firstBull(today, 1, 35) : firstBear(today, 1, 35); if (rc > 0 && rc <= 5) { const s = at(rc, gs, 'cg'); if (s) return s; } { const s = at(0, bull ? 'CE' : 'PE', 'mnr'); if (s) return s; } }
  }
  for (let i = 1; i < today.length; i++) {
    const prevC = today[i - 1], curr = today[i];
    if (curr.close < prevC.low) { const oppGap = gapUp, c0opp = C0bp > 20; if (oppGap && c0opp) continue; const s = at(i, 'PE', 'sb_pe'); if (s) return s; }
    if (curr.close > prevC.high) { const oppGap = gapDown, c0opp = C0bp < -20; if (oppGap && c0opp) continue; const s = at(i, 'CE', 'sb_ce'); if (s) return s; }
  }
  for (let i = 5; i < Math.min(today.length, 21); i++) { const pc = today[i - 1].close; if (today[i].low <= PL && pc > PL && bp(today[i]) > 35) return at(i, 'CE', 'pdlt'); if (today[i].high >= PH && pc < PH && bp(today[i]) < -35) return at(i, 'PE', 'pdht'); }
  return null;
}

// Re-entry A: body% >40% (current deployed)
function findReEntryBody(today, exitIdx, side, allowReverse) {
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

// Re-entry B: structural break (candidate)
function findReEntryStruct(today, exitIdx, side, allowReverse) {
  const lastIdx = today.length - 1; if (lastIdx <= exitIdx) return null;
  const rev = side === 'CE' ? 'PE' : 'CE'; let sd = null, rd = null;
  for (let i = exitIdx + 1; i <= lastIdx; i++) {
    const prevC = today[i - 1], curr = today[i];
    if (!sd) { if (side === 'CE' && curr.close > prevC.high) sd = { idx: i, side }; if (side === 'PE' && curr.close < prevC.low) sd = { idx: i, side }; }
    if (!rd && allowReverse) { if (rev === 'CE' && curr.close > prevC.high) rd = { idx: i, side: rev }; if (rev === 'PE' && curr.close < prevC.low) rd = { idx: i, side: rev }; }
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

function runDay(today, prev, reFn) {
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
      const re = reFn(sl, st.lastExitIdx, st.lastExitDir, true); if (re && re.idx === li) sig = re;
    } else if (!st.firstDone) { sig = findEntry(sl, prev); }
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
  console.log('Per-day comparison: body% re-entry vs struct re-entry...');
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
  let greenToRed = [], redToGreen = [], bothGreen = 0, bothRed = 0;
  let bodyTotal = 0, structTotal = 0;
  let bothGreenBody = 0, bothGreenStruct = 0;
  let bothRedBody = 0, bothRedStruct = 0;

  for (let di = 1; di < dates.length; di++) {
    const today = days[dates[di]], prev = days[dates[di - 1]];
    if (!today || today.length < 3 || !prev || prev.length < 3) continue;
    const bodyPnL   = runDay(today, prev, findReEntryBody);
    const structPnL = runDay(today, prev, findReEntryStruct);
    bodyTotal += bodyPnL; structTotal += structPnL;
    const bodyGreen = bodyPnL > 0, structGreen = structPnL > 0;
    if (bodyGreen && !structGreen) greenToRed.push({ date: dates[di], bodyPnL: Math.round(bodyPnL), structPnL: Math.round(structPnL) });
    else if (!bodyGreen && structGreen) redToGreen.push({ date: dates[di], bodyPnL: Math.round(bodyPnL), structPnL: Math.round(structPnL) });
    else if (bodyGreen && structGreen)  { bothGreen++; bothGreenBody += bodyPnL; bothGreenStruct += structPnL; }
    else                                { bothRed++;   bothRedBody += bodyPnL;   bothRedStruct   += structPnL; }
  }

  const gtrBodySum   = greenToRed.reduce((s, d) => s + d.bodyPnL, 0);
  const gtrStructSum = greenToRed.reduce((s, d) => s + d.structPnL, 0);
  const rtgBodySum   = redToGreen.reduce((s, d) => s + d.bodyPnL, 0);
  const rtgStructSum = redToGreen.reduce((s, d) => s + d.structPnL, 0);

  console.log('\n════════════════════════════════════════════════════');
  console.log('BODY% re-entry   : ' + Math.round(bodyTotal)   + ' pts  (deployed)');
  console.log('STRUCT re-entry  : ' + Math.round(structTotal) + ' pts  (diff: ' + (Math.round(structTotal - bodyTotal) >= 0 ? '+' : '') + Math.round(structTotal - bodyTotal) + ')');
  console.log('════════════════════════════════════════════════════');
  console.log('Both GREEN  : ' + bothGreen + ' days  BODY:' + Math.round(bothGreenBody) + '  STRUCT:' + Math.round(bothGreenStruct) + '  diff:' + (Math.round(bothGreenStruct - bothGreenBody) >= 0 ? '+' : '') + Math.round(bothGreenStruct - bothGreenBody));
  console.log('Both RED    : ' + bothRed   + ' days  BODY:' + Math.round(bothRedBody)   + '  STRUCT:' + Math.round(bothRedStruct)   + '  diff:' + (Math.round(bothRedStruct - bothRedBody) >= 0 ? '+' : '') + Math.round(bothRedStruct - bothRedBody));
  console.log('GREEN→RED   : ' + greenToRed.length + ' days  BODY:+' + gtrBodySum + '  STRUCT:' + gtrStructSum + '  diff:' + Math.round(gtrStructSum - gtrBodySum));
  console.log('RED→GREEN   : ' + redToGreen.length + ' days  BODY:' + rtgBodySum  + '  STRUCT:+' + rtgStructSum + '  diff:+' + Math.round(rtgStructSum - rtgBodySum));
  console.log('\n── Top 10 STRUCT RE-ENTRY HURT (green→red) ─────────');
  greenToRed.sort((a, b) => (a.structPnL - a.bodyPnL) - (b.structPnL - b.bodyPnL)).slice(0, 10)
    .forEach(d => console.log(`  ${d.date}  BODY:+${d.bodyPnL}  STRUCT:${d.structPnL}  diff:${d.structPnL - d.bodyPnL}`));
  console.log('\n── Top 10 STRUCT RE-ENTRY HELPED (red→green) ────────');
  redToGreen.sort((a, b) => (b.structPnL - b.bodyPnL) - (a.structPnL - a.bodyPnL)).slice(0, 10)
    .forEach(d => console.log(`  ${d.date}  BODY:${d.bodyPnL}  STRUCT:+${d.structPnL}  diff:+${d.structPnL - d.bodyPnL}`));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
