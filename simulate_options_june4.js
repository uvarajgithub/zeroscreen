'use strict';
// Simulate June 4, 2026 OPTIONS P&L
// Uses actual option premiums from OPT_STRIKE_FOUND log

// ── Actual data from today's bot logs ─────────────────────────────────────
// OPT_STRIKE_FOUND at 12:15 PM: strike:54300, ceLTP:1257, peLTP:965, DTE:26
// This gives us the actual market premiums for June 30 monthly options

const DTE    = 26;   // days to June 30 expiry
const QTY    = 30;
const DELTA  = 0.5;  // ATM delta
const SPREAD = 3;    // pts per side (₹6 round trip = ₹3×30×2 = ₹180/trade)

// Actual premiums observed at 12:15 PM when index=54294
const ATM_CE_PREM_OBSERVED = 1257;  // BANKNIFTY26JUN54300CE actual LTP
const ATM_PE_PREM_OBSERVED = 965;   // BANKNIFTY26JUN54300PE actual LTP

// Theta per candle (options lose value over time)
const CE_THETA = ATM_CE_PREM_OBSERVED / (DTE * 26);  // ≈ ₹1.86/candle
const PE_THETA = ATM_PE_PREM_OBSERVED / (DTE * 26);  // ≈ ₹1.43/candle

// Estimate option premium at each trade entry (index level affects premium)
// For monthly options, premium changes slowly with index — ±100 pts ≈ ±₹50
function estimatePremium(dir, indexLevel, obsIndex=54294) {
  const base = dir === 'CE' ? ATM_CE_PREM_OBSERVED : ATM_PE_PREM_OBSERVED;
  // Adjust for distance from ATM (54300 was observed ATM)
  const distFromAtm = (dir === 'CE') ? indexLevel - 54300 : 54300 - indexLevel;
  // Rough delta adjustment: each pt in-the-money ≈ +delta premium
  const premAdj = distFromAtm * DELTA;
  return Math.max(50, Math.round(base + premAdj));
}

// ── Today's 5 DRISHTI trades ───────────────────────────────────────────────
const trades = [
  { t:1, dir:'CE', indexEntry:54242.3, indexExit:54332.2, indexPts:89.8,  candlesHeld:1, actualBot:'OPT_FAIL (400-600 filter)' },
  { t:2, dir:'CE', indexEntry:54379.8, indexExit:54229.8, indexPts:-150.0, candlesHeld:2, actualBot:'OPT_FAIL (400-600 filter)' },
  { t:3, dir:'CE', indexEntry:54319.1, indexExit:54346.6, indexPts:27.5,  candlesHeld:1, actualBot:'OPT_FAIL (400-600 filter)' },
  { t:4, dir:'PE', indexEntry:54224.85,indexExit:54150.2, indexPts:74.7,  candlesHeld:1, actualBot:'OPT_FAIL (400-600 filter)' },
  { t:5, dir:'CE', indexEntry:54294.4, indexExit:54345.1, indexPts:50.7,  candlesHeld:1,
    actualBot:'ENTERED @ ₹1,257 (BANKNIFTY26JUN54300CE) | EXIT LOST on restart' },
];

console.log('\n' + '═'.repeat(100));
console.log(' JUNE 4, 2026 — OPTIONS SIMULATION vs ACTUAL');
console.log(` Monthly Options: DTE=${DTE} days | ATM CE=₹${ATM_CE_PREM_OBSERVED} | ATM PE=₹${ATM_PE_PREM_OBSERVED}`);
console.log(` Theta CE=₹${CE_THETA.toFixed(2)}/candle | PE=₹${PE_THETA.toFixed(2)}/candle | Spread=₹${SPREAD*2}/trade`);
console.log('═'.repeat(100));

console.log('\nWhat would have happened if options bot was working from T1 (simulated):');
console.log('─'.repeat(100));
console.log('T#  Dir  Index    Opt Entry  Index    Delta    Theta   Spread  Opt Pts  Opt Rs    Actual Bot');
console.log('    Entry  Prem   Exit Prem  Pts      Gain     Cost    Cost');
console.log('─'.repeat(100));

let totalOptPts = 0, totalOptRs = 0;

for (const t of trades) {
  const theta = t.dir === 'CE' ? CE_THETA : PE_THETA;
  const entryPrem = estimatePremium(t.dir, t.indexEntry);
  // Exit premium = entry + delta×indexPts - theta×candles (option pricing model)
  const deltaGain  = DELTA * t.indexPts;
  const thetaCost  = theta * t.candlesHeld;
  const spreadCost = SPREAD * 2;  // ₹6 round trip
  const optPts     = deltaGain - thetaCost - spreadCost;
  const optRs      = Math.round(optPts * QTY);
  const exitPrem   = Math.round(entryPrem + deltaGain - thetaCost);

  totalOptPts += optPts;
  totalOptRs  += optRs;

  const idxPts = (t.indexPts >= 0 ? '+' : '') + t.indexPts.toFixed(1);
  const dGain  = (deltaGain >= 0 ? '+' : '') + deltaGain.toFixed(1);
  const opts   = (optPts >= 0 ? '+' : '') + optPts.toFixed(1);
  const optrs  = (optRs >= 0 ? '+' : '-') + '₹' + Math.abs(optRs).toLocaleString('en-IN');

  console.log(`T${t.t}  ${t.dir}  ${t.indexEntry.toFixed(0)} ₹${entryPrem.toString().padStart(4)}  ${t.indexExit.toFixed(0)}  ₹${exitPrem.toString().padStart(4)}  ${idxPts.padStart(7)}  ${dGain.padStart(7)}  -₹${(thetaCost*QTY).toFixed(0).padStart(5)}  -₹${(spreadCost*QTY).toFixed(0).padStart(3)}  ${opts.padStart(7)}  ${optrs.padStart(10)}  ${t.actualBot}`);
}

console.log('─'.repeat(100));
console.log(`${'TOTAL'.padEnd(80)} ${(totalOptPts>=0?'+':'')+totalOptPts.toFixed(1).padStart(7)}  ${(totalOptRs>=0?'+':'-')+'₹'+Math.abs(totalOptRs).toLocaleString('en-IN').padStart(9)}`);

// ── T5 Actual vs Simulated ─────────────────────────────────────────────────
console.log('\n' + '═'.repeat(100));
console.log(' T5 — ACTUAL ENTRY vs SIMULATED');
console.log('═'.repeat(100));
console.log(` Actual entry:   BANKNIFTY26JUN54300CE @ ₹1,257  (real market premium, OPT_ENTRY log)`);
console.log(` Sim entry est:  BANKNIFTY26JUN54300CE @ ₹${estimatePremium('CE', 54294)}  (delta-adjusted from ATM)`);
console.log(` Index move:     +50.7 pts`);
console.log(` Delta gain:     +${(0.5*50.7).toFixed(1)} pts option premium`);
console.log(` Theta:          -${(CE_THETA*1).toFixed(1)} pts (1 candle)`);
console.log(` Spread:         -6 pts round trip`);
console.log(` Net option pts: +${(0.5*50.7 - CE_THETA - SPREAD*2).toFixed(1)} pts`);
console.log(` Net ₹:          +₹${Math.round((0.5*50.7 - CE_THETA - SPREAD*2)*QTY).toLocaleString('en-IN')}`);
console.log('');
console.log(` ACTUAL: Entry at ₹1,257 — EXIT WAS LOST (restart at 12:22 PM wiped optEntryPrem=0)`);
console.log(` With today fix (state persistence): exit LTP would be fetched at restart → P&L recorded`);

// ── Comparison table ─────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(100));
console.log(' COMPARISON: FUTURES vs OPTIONS — June 4, 2026');
console.log('═'.repeat(100));
console.log(' Metric                         Futures (actual)     Options (simulated)');
console.log('─'.repeat(75));

const futPts = 92.7, futRs = 2802;
console.log(' Index pts gained              ' + ('+'+futPts.toFixed(1)).padStart(20) + ('+'+futPts.toFixed(1)).padStart(20));
console.log(' Real Rs P&L                  ' + ('+Rs'+futRs.toLocaleString('en-IN')).padStart(20) + ((totalOptRs>=0?'+':'')+totalOptRs.toLocaleString('en-IN')).padStart(20));
console.log(' Rs per index pt              ' + ('Rs'+(futRs/futPts).toFixed(0)).padStart(20) + ('Rs'+(totalOptRs/futPts).toFixed(0)).padStart(20));
console.log(' Effective multiplier         ' + '30 (delta=1.0)'.padStart(20) + ('~'+(totalOptRs/futPts).toFixed(0)+' (delta 0.5-theta)').padStart(20));
console.log('─'.repeat(75));

console.log('\n WHY OPTIONS GAVE LESS:');
console.log(`   T2 SL (-150 pts index):  Futures = -₹4,500  |  Options = -₹${Math.abs(Math.round((-150*0.5-CE_THETA*2-SPREAD*2)*QTY)).toLocaleString('en-IN')} (delta halves the loss ✓)`);
console.log(`   T1 Win (+90 pts index):  Futures = +₹2,700  |  Options = +₹${Math.abs(Math.round((90*0.5-CE_THETA*1-SPREAD*2)*QTY)).toLocaleString('en-IN')} (theta+spread eat into gain)`);
console.log(`   T4 Win (+75 pts index):  Futures = +₹2,250  |  Options = +₹${Math.abs(Math.round((74.7*0.5-PE_THETA*1-SPREAD*2)*QTY)).toLocaleString('en-IN')}`);

console.log('\n BREAKEVEN for options today:');
console.log(`   Theta(1 candle)+Spread = ₹${(CE_THETA*QTY).toFixed(0)} + ₹${SPREAD*2*QTY} = ₹${((CE_THETA+SPREAD*2)*QTY).toFixed(0)} round trip cost`);
console.log(`   Need index move > ${((CE_THETA+SPREAD*2)/DELTA).toFixed(0)} pts just to break even`);
console.log(`   Today: T1(+90✓) T2(-150 SL) T3(+28 barely✓) T4(+75✓) T5(+51✓)  — 4/5 above breakeven`);
