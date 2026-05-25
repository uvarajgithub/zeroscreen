// backtest_may2026_live.js — BHAV V3 backtest for May 2026 using live Kite candles
'use strict';
const https = require('https');

const API_KEY      = '7an6kfp8opzq0zai';
const ACCESS_TOKEN = 'IHXLJ6ND5YBU7T7gRpEhJo4uy9F0wwUY';
const INSTRUMENT   = 260105; // BANKNIFTY index
const SL_PTS       = 150;
const TRAIL_GAP    = 20;
const PTS_PER_RS   = 15;

// ── helpers ──────────────────────────────────────────────────────────────
const body = c => c.close - c.open;
const rng  = c => c.high - c.low;
const bp   = c => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;
const pdh  = cs => Math.max(...cs.map(c => c.high));
const pdl  = cs => Math.min(...cs.map(c => c.low));
const pdc  = cs => cs[cs.length - 1].close;
const firstBull   = (cs, from, t=30) => { for (let i=from;i<cs.length;i++) if (bp(cs[i])>t) return i; return -1; };
const firstBear   = (cs, from, t=30) => { for (let i=from;i<cs.length;i++) if (bp(cs[i])<-t) return i; return -1; };
const firstStrong = (cs, from, t=55) => { for (let i=from;i<cs.length;i++) { const b=bp(cs[i]); if (Math.abs(b)>t) return {i, side: b>0?'CE':'PE'}; } return null; };

function getCandles(from, to) {
  return new Promise((resolve, reject) => {
    const url = `https://api.kite.trade/instruments/historical/${INSTRUMENT}/15minute?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const opts = { headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` } };
    https.get(url, opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.status !== 'success') return reject(new Error(j.message || JSON.stringify(j)));
          resolve(j.data.candles.map(c => ({ time:c[0], open:c[1], high:c[2], low:c[3], close:c[4] })));
        } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ── entry logic (full BHAV V3) ────────────────────────────────────────────
function findEntry(candles, prevCandles) {
  if (!candles || candles.length < 2 || !prevCandles || prevCandles.length === 0) return null;
  const PH = pdh(prevCandles), PL = pdl(prevCandles), PC = pdc(prevCandles);
  const C0 = candles[0];
  const gap    = C0.open - PC;
  const vsPDH  = C0.open - PH;
  const vsPDL  = C0.open - PL;
  const ctx    = vsPDH > 120 ? 'ABOVE_PDH' : vsPDL < 0 ? 'BELOW_PDL' : 'INSIDE';
  const C0bp   = bp(C0);
  const C1bp   = candles[1] ? bp(candles[1]) : 0;

  // whipsaw guard
  const bps4 = candles.slice(0, Math.min(4, candles.length)).map(bp);
  let wipsaws = 0;
  for (let i = 1; i < bps4.length; i++)
    if (bps4[i]*bps4[i-1]<0 && Math.abs(bps4[i])>65 && Math.abs(bps4[i-1])>65) wipsaws++;
  if (wipsaws >= 2) return { entry:null, ctx, reason:'whipsaw' };

  if (ctx === 'ABOVE_PDH') {
    if (vsPDH > 1000) return { entry:{idx:0, side:'CE'}, ctx, reason:'extraordinary_gap_ce' };
    if (C0bp < -20)   return { entry:{idx:0, side:'PE'}, ctx, reason:'above_pdh_c0_reversal_pe' };
    const bearIdx = firstBear(candles, 1, 35);
    if (bearIdx > 0 && bearIdx <= 7) return { entry:{idx:bearIdx, side:'PE'}, ctx, reason:'above_pdh_delayed_pe' };
    const contIdx = firstStrong(candles, 2, 55);
    if (contIdx) return { entry:{idx:contIdx.i, side:contIdx.side}, ctx, reason:'above_pdh_continuation' };
    return { entry:null, ctx, reason:'above_pdh_no_signal' };
  }

  if (ctx === 'BELOW_PDL') {
    if (C0bp < -65) return { entry:null, ctx, reason:'selling_climax_skip' };
    if (C0bp > 65)  { const i=firstBear(candles,1,30); if (i>0) return {entry:{idx:i,side:'PE'},ctx,reason:'recovery_bounce_pe'}; }
    if (C0.high < PL) {
      if (C1bp > 20)  return { entry:{idx:1, side:'CE'}, ctx, reason:'below_pdl_c1_bull_ce' };
      if (C1bp < -20) return { entry:{idx:0, side:'PE'}, ctx, reason:'below_pdl_no_recovery_pe' };
      const s = firstStrong(candles, 2, 40);
      if (s && s.i <= 5) return { entry:{idx:s.i, side:s.side}, ctx, reason:'below_pdl_c2_signal' };
      return { entry:null, ctx, reason:'below_pdl_no_c1_signal' };
    }
    if (C0bp > 20) { const i=firstBear(candles,1,30); if (i>0&&i<=6) return {entry:{idx:i,side:'PE'},ctx,reason:'below_pdl_partial_bounce_pe'}; }
    if (C0bp < -10) {
      for (let i=2; i<=Math.min(7,candles.length-2); i++)
        if (bp(candles[i])<-45 && candles[i-1].close<PL) return {entry:{idx:i,side:'PE'},ctx,reason:'below_pdl_failed_bounce_pe'};
    }
    return { entry:null, ctx, reason:'below_pdl_ambiguous_avoid' };
  }

  // INSIDE
  if (C0.close < PL) return { entry:{idx:0, side:'PE'}, ctx, reason:'inside_c0_breaks_below_pdl' };
  if (C0.close > PH) return { entry:{idx:0, side:'CE'}, ctx, reason:'inside_c0_breaks_above_pdh' };
  const gapUp = gap > 50, gapDown = gap < -50;
  if (Math.abs(C0bp) > 55) {
    const c0isBull = C0bp > 0;
    const aligned  = (c0isBull && !gapDown) || (!c0isBull && !gapUp);
    if (aligned) {
      if (C1bp * C0bp < 0 && Math.abs(C1bp) > 65)
        return { entry:{idx:1, side:C1bp>0?'CE':'PE'}, ctx, reason:'inside_c0_trap_c1_signal' };
      return { entry:{idx:0, side:c0isBull?'CE':'PE'}, ctx, reason:'inside_c0_momentum' };
    } else {
      const gapSide  = gapUp ? 'CE' : 'PE';
      const revCandle = gapUp ? firstBull(candles,1,35) : firstBear(candles,1,35);
      if (revCandle > 0 && revCandle <= 5)
        return { entry:{idx:revCandle, side:gapSide}, ctx, reason:'inside_counter_gap_reversal' };
      return { entry:{idx:0, side:c0isBull?'CE':'PE'}, ctx, reason:'inside_c0_momentum_no_reversal' };
    }
  }
  if (Math.abs(C0bp) > 30) {
    if (C1bp * C0bp > 0) return { entry:{idx:0, side:C0bp>0?'CE':'PE'}, ctx, reason:'inside_c0_moderate_c1_confirmed' };
    if (Math.abs(C1bp)>65 && C1bp*C0bp<0 && candles.length>2) {
      const C2bp = bp(candles[2]);
      if (C2bp*C0bp>0 && Math.abs(C2bp)>20) return { entry:{idx:0, side:C0bp>0?'CE':'PE'}, ctx, reason:'inside_c0_c1_fake_c2_confirms' };
    }
  }
  for (let i=2; i<=4; i++) {
    if (i >= candles.length) break;
    const cbp = bp(candles[i]);
    if (Math.abs(cbp) > 55) {
      const signalBull = cbp > 0;
      const oppGap = (signalBull && gapDown) || (!signalBull && gapUp);
      const c0ModOpp = (signalBull && C0bp<-20) || (!signalBull && C0bp>20);
      if (oppGap && c0ModOpp) continue;
      const prev = bp(candles[i-1]);
      if (Math.abs(prev)>60 && prev*cbp<0) {
        if (i+1<candles.length && bp(candles[i+1])*cbp<0 && Math.abs(bp(candles[i+1]))>60)
          return { entry:null, ctx, reason:'inside_whipsaw_c1c2' };
      }
      return { entry:{idx:i, side:cbp>0?'CE':'PE'}, ctx, reason:`inside_c${i}_strong` };
    }
  }
  for (let i=5; i<Math.min(candles.length,21); i++) {
    const prevClose = candles[i-1].close;
    if (candles[i].low <= PL && prevClose > PL && bp(candles[i]) > 35)
      return { entry:{idx:i, side:'CE'}, ctx, reason:'inside_pdl_test_ce' };
    if (candles[i].high >= PH && prevClose < PH && bp(candles[i]) < -35)
      return { entry:{idx:i, side:'PE'}, ctx, reason:'inside_pdh_test_pe' };
  }
  return { entry:null, ctx, reason:'inside_no_signal' };
}

// ── P&L calc (LOCK20 candle-close trail) ─────────────────────────────────
function calcPL(candles, entryIdx, side) {
  const ep   = candles[entryIdx].close;
  const sign = side === 'CE' ? 1 : -1;
  let trailStop = -SL_PTS, peakPts = 0;

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    const favPts = side === 'CE' ? (c.high - ep) : (ep - c.low);
    if (favPts > peakPts) {
      peakPts   = favPts;
      trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
    }
    const closePts = sign * (c.close - ep);
    if (closePts <= trailStop) {
      const exitType = trailStop <= 0 ? 'SL' : 'TRAIL';
      return { pl: trailStop * PTS_PER_RS, peakPts, exitIdx:i, exitType, ep, exitPrice: ep + sign*trailStop };
    }
    // EOD check
    const t = new Date(c.time);
    if (t.getHours() >= 15 && t.getMinutes() >= 14) {
      const pl = sign * (c.close - ep) * PTS_PER_RS;
      return { pl, peakPts, exitIdx:i, exitType:'EOD', ep, exitPrice:c.close };
    }
  }
  const last = candles[candles.length - 1];
  return { pl: sign*(last.close-ep)*PTS_PER_RS, peakPts, exitIdx:candles.length-1, exitType:'EOD', ep, exitPrice:last.close };
}

// ── re-entry helper ───────────────────────────────────────────────────────
function findReEntry(candles, fromIdx, side) {
  for (let i = fromIdx + 1; i <= candles.length - 3; i++) {
    const b = bp(candles[i]);
    if (side === 'CE' && b > 35) return i;
    if (side === 'PE' && b < -35) return i;
  }
  return -1;
}

// ── simulate one day ──────────────────────────────────────────────────────
function simulateDay(dayCandles, prevCandles, dateStr) {
  const PH = pdh(prevCandles), PL = pdl(prevCandles);
  const res = findEntry(dayCandles, prevCandles);

  if (!res || !res.entry) {
    return { date:dateStr, ctx:res?.ctx||'?', trades:[], totalPts:0, totalRs:0, note:res?.reason||'no_signal' };
  }

  const trades = [];
  let totalPts = 0;

  // T1
  const t1 = calcPL(dayCandles, res.entry.idx, res.entry.side);
  const t1EntryCandleTime = new Date(dayCandles[res.entry.idx].time)
    .toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'});
  const t1ExitCandleTime = new Date(dayCandles[t1.exitIdx].time)
    .toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'});
  trades.push({ n:1, side:res.entry.side, entry:t1.ep.toFixed(0), exit:t1.exitPrice.toFixed(0),
    pts:Math.round(t1.pl/PTS_PER_RS), rs:t1.pl, type:t1.exitType, entryTime:t1EntryCandleTime, exitTime:t1ExitCandleTime, reason:res.reason });
  totalPts += Math.round(t1.pl / PTS_PER_RS);

  // Re-entries (only after profitable non-EOD exits, up to 3)
  let curExit = t1, curSide = res.entry.side, tradeN = 1;

  // Check reverse RE after big T1 (peakPts >= 100, profitable trail exit)
  if (t1.peakPts >= 100 && t1.exitType !== 'EOD' && t1.pl > 0) {
    const revSide = curSide === 'CE' ? 'PE' : 'CE';
    let revIdx = -1;
    for (let i = curExit.exitIdx + 1; i <= dayCandles.length - 3; i++) {
      const b = bp(dayCandles[i]);
      if ((revSide === 'CE' && b > 65) || (revSide === 'PE' && b < -65)) { revIdx = i; break; }
    }
    if (revIdx > 0) {
      tradeN++;
      const rRev = calcPL(dayCandles, revIdx, revSide);
      const reEntryTime = new Date(dayCandles[revIdx].time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'});
      const reExitTime  = new Date(dayCandles[rRev.exitIdx].time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'});
      trades.push({ n:tradeN, side:revSide, entry:rRev.ep.toFixed(0), exit:rRev.exitPrice.toFixed(0),
        pts:Math.round(rRev.pl/PTS_PER_RS), rs:rRev.pl, type:rRev.exitType, entryTime:reEntryTime, exitTime:reExitTime, reason:'reverse_re' });
      totalPts += Math.round(rRev.pl / PTS_PER_RS);
      curExit = rRev; curSide = revSide;
    }
  }

  for (let re = 0; re < 3; re++) {
    if (curExit.exitType !== 'EOD' && curExit.pl > 0) {
      const reIdx = findReEntry(dayCandles, curExit.exitIdx, curSide);
      if (reIdx > 0) {
        tradeN++;
        const rRE = calcPL(dayCandles, reIdx, curSide);
        const reEntryTime = new Date(dayCandles[reIdx].time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'});
        const reExitTime  = new Date(dayCandles[rRE.exitIdx].time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'});
        trades.push({ n:tradeN, side:curSide, entry:rRE.ep.toFixed(0), exit:rRE.exitPrice.toFixed(0),
          pts:Math.round(rRE.pl/PTS_PER_RS), rs:rRE.pl, type:rRE.exitType, entryTime:reEntryTime, exitTime:reExitTime, reason:'re_entry' });
        totalPts += Math.round(rRE.pl / PTS_PER_RS);
        curExit = rRE;
      } else break;
    } else break;
  }

  // Post-loop reverse check: after exhausting same-dir REs, if last trade profitable
  // and strong opposite candle appears → take the other leg + up to 2 more same-dir REs
  if (curSide === res.entry.side && curExit.exitType !== 'EOD' && curExit.pl > 0) {
    const revSide2 = curSide === 'CE' ? 'PE' : 'CE';
    let rev2Idx = -1;
    for (let i = curExit.exitIdx + 1; i <= dayCandles.length - 3; i++) {
      const b = bp(dayCandles[i]);
      if ((revSide2 === 'CE' && b > 65) || (revSide2 === 'PE' && b < -65)) { rev2Idx = i; break; }
    }
    if (rev2Idx > 0) {
      tradeN++;
      const rRev2 = calcPL(dayCandles, rev2Idx, revSide2);
      const et2 = new Date(dayCandles[rev2Idx].time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'});
      const xt2 = new Date(dayCandles[rRev2.exitIdx].time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'});
      trades.push({ n:tradeN, side:revSide2, entry:rRev2.ep.toFixed(0), exit:rRev2.exitPrice.toFixed(0),
        pts:Math.round(rRev2.pl/PTS_PER_RS), rs:rRev2.pl, type:rRev2.exitType, entryTime:et2, exitTime:xt2, reason:'postloop_reverse_re' });
      totalPts += Math.round(rRev2.pl / PTS_PER_RS);
      curExit = rRev2; curSide = revSide2;
      // up to 2 more same-dir REs after the reversal leg
      for (let re2 = 0; re2 < 2; re2++) {
        if (curExit.exitType !== 'EOD' && curExit.pl > 0) {
          const reIdx2 = findReEntry(dayCandles, curExit.exitIdx, curSide);
          if (reIdx2 > 0) {
            tradeN++;
            const rRE2 = calcPL(dayCandles, reIdx2, curSide);
            const et3 = new Date(dayCandles[reIdx2].time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'});
            const xt3 = new Date(dayCandles[rRE2.exitIdx].time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'});
            trades.push({ n:tradeN, side:curSide, entry:rRE2.ep.toFixed(0), exit:rRE2.exitPrice.toFixed(0),
              pts:Math.round(rRE2.pl/PTS_PER_RS), rs:rRE2.pl, type:rRE2.exitType, entryTime:et3, exitTime:xt3, reason:'postloop_re' });
            totalPts += Math.round(rRE2.pl / PTS_PER_RS);
            curExit = rRE2;
          } else break;
        } else break;
      }
    }
  }

  return { date:dateStr, ctx:res.ctx, PH:PH.toFixed(0), PL:PL.toFixed(0), trades, totalPts, totalRs:totalPts*PTS_PER_RS };
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('Fetching BANKNIFTY 15-min candles for May 2026 from Kite...');
  // Fetch Apr 29 - May 25 in one call (to have prev-day for every May trading day)
  const allCandles = await getCandles('2026-04-29 09:15:00', '2026-05-25 15:30:00');
  console.log(`Total candles fetched: ${allCandles.length}`);

  // Group by date
  const byDate = {};
  for (const c of allCandles) {
    const d = c.time.slice(0, 10);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(c);
  }
  const dates = Object.keys(byDate).sort();
  console.log(`Trading days: ${dates.length} (${dates[0]} to ${dates[dates.length-1]})\n`);

  // Filter to May only for results
  const mayDates = dates.filter(d => d.startsWith('2026-05'));
  const results  = [];

  for (const date of mayDates) {
    const dayIdx  = dates.indexOf(date);
    if (dayIdx < 1) continue;
    const prevDate    = dates[dayIdx - 1];
    const dayCandles  = byDate[date];
    const prevCandles = byDate[prevDate];
    if (!prevCandles || prevCandles.length === 0) continue;
    const r = simulateDay(dayCandles, prevCandles, date);
    results.push(r);
  }

  // ── Print results ────────────────────────────────────────────────────
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('  BHAV V3 BACKTEST — MAY 2026 (Live Kite Candles)');
  console.log('══════════════════════════════════════════════════════════════════');

  let cumPts = 0, wins = 0, losses = 0, noTrade = 0, totalTrades = 0;

  for (const r of results) {
    cumPts += r.totalPts;
    const sign = r.totalPts > 0 ? '+' : '';
    const flag = r.trades.length === 0 ? '⬜ NO TRADE' : r.totalPts > 0 ? '✅ WIN   ' : '❌ LOSS  ';
    if (r.trades.length === 0) noTrade++;
    else if (r.totalPts > 0) wins++;
    else losses++;
    totalTrades += r.trades.length;

    console.log(`\n${r.date}  [${r.ctx}]  PDH:${r.PH||'-'} PDL:${r.PL||'-'}`);
    if (r.trades.length === 0) {
      console.log(`  ${flag}  — ${r.note}`);
    } else {
      for (const t of r.trades) {
        const pts = (t.pts >= 0 ? '+' : '') + t.pts;
        const rs  = (t.rs >= 0 ? '+' : '') + Math.round(t.rs);
        console.log(`  T${t.n} ${t.side} ${t.entryTime}→${t.exitTime}  Entry:${t.entry} Exit:${t.exit}  ${pts}pts ₹${rs}  [${t.type}] ${t.reason}`);
      }
      const tot = (r.totalPts >= 0 ? '+' : '') + r.totalPts;
      console.log(`  ${flag}  Day total: ${tot} pts = ₹${(r.totalPts >= 0 ? '+' : '') + r.totalRs}  (cum: ${cumPts > 0 ? '+' : ''}${cumPts} pts)`);
    }
  }

  const tradeDays = wins + losses;
  const wr = tradeDays > 0 ? (wins/tradeDays*100).toFixed(1) : '0';
  const totalRs = cumPts * PTS_PER_RS;

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  MAY 2026 SUMMARY');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`  Trading days : ${results.length}  (${noTrade} no-trade, ${tradeDays} traded)`);
  console.log(`  Total trades : ${totalTrades}`);
  console.log(`  Win days     : ${wins} / ${tradeDays}  (${wr}% WR)`);
  console.log(`  Loss days    : ${losses}`);
  console.log(`  Total P&L    : ${cumPts >= 0 ? '+' : ''}${cumPts} pts = ₹${cumPts >= 0 ? '+' : ''}${totalRs}`);
  console.log('══════════════════════════════════════════════════════════════════');
}

main().catch(e => { console.error('ERROR:', e.message || e); process.exit(1); });
