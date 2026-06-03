'use strict';
// Root cause analysis: WHY is the premium 300-430 pts when fair value is ~200 pts?
// Fair premium = BankNifty × risk_free × days_to_expiry / 365

const trades = [
  { t:'T2', dir:'CE', idxEntry:53693.4, futEntry:54062.4, idxExit:53723.5, futExit:53930.0, idxPts:30.1 },
  { t:'T3', dir:'CE', idxEntry:53763.8, futEntry:54154.6, idxExit:53818.7, futExit:54054.0, idxPts:54.9 },
  { t:'T4', dir:'CE', idxEntry:53846.3, futEntry:54280.0, idxExit:53993.2, futExit:54321.0, idxPts:147.0},
];

const QTY = 30;
const DAYS_TO_EXPIRY = 23;  // June 26 expiry, June 3 today
const RISK_FREE = 0.07;     // 7% per year
const FAIR_PREMIUM = Math.round(53800 * RISK_FREE * DAYS_TO_EXPIRY / 365);  // ~237 pts

console.log('\n' + '='.repeat(75));
console.log(' ROOT CAUSE: Stale/inflated futures LTP at entry');
console.log('='.repeat(75));
console.log(` Fair futures premium today: BNF × 7% × ${DAYS_TO_EXPIRY}d / 365 = ~${FAIR_PREMIUM} pts`);
console.log('');

console.log(' SCENARIO A — What actually happened (stale LTP at entry):');
console.log('-'.repeat(75));
let totalActualRs = 0;
for (const t of trades) {
  const premEntry = t.futEntry - t.idxEntry;
  const premExit  = t.futExit  - t.idxExit;
  const futPts    = t.dir==='CE' ? t.futExit - t.futEntry : t.futEntry - t.futExit;
  const rs = futPts * QTY;
  totalActualRs += rs;
  console.log(` ${t.t}: Fut entry ${t.futEntry} (prem ${premEntry.toFixed(0)}) → exit ${t.futExit} (prem ${premExit.toFixed(0)}) = ${futPts>0?'+':''}${futPts.toFixed(0)} pts = ${rs>=0?'+':''}₹${rs.toLocaleString('en-IN')}`);
}
console.log(` Total: ₹${totalActualRs.toLocaleString('en-IN')}  ← LOSSES`);

console.log('');
console.log(` SCENARIO B — If entry used FAIR premium (~${FAIR_PREMIUM} pts, not stale LTP):`);
console.log('-'.repeat(75));
let totalFairRs = 0;
for (const t of trades) {
  const fairFutEntry = t.idxEntry + FAIR_PREMIUM;
  const premExit     = t.futExit - t.idxExit;
  const futPts       = t.dir==='CE' ? t.futExit - fairFutEntry : fairFutEntry - t.futExit;
  const rs = futPts * QTY;
  totalFairRs += rs;
  console.log(` ${t.t}: Fut entry ${fairFutEntry.toFixed(0)} (fair ${FAIR_PREMIUM}) → exit ${t.futExit} (prem ${premExit.toFixed(0)}) = ${futPts>0?'+':''}${futPts.toFixed(0)} pts = ${rs>=0?'+':''}₹${rs.toLocaleString('en-IN')}`);
}
console.log(` Total: ₹${totalFairRs.toLocaleString('en-IN')}  ← Much better!`);

console.log('');
console.log(` SCENARIO C — Index-based (backtest assumption, delta=1.0):`);
console.log('-'.repeat(75));
let totalIdxRs = 0;
for (const t of trades) {
  const rs = t.idxPts * QTY;
  totalIdxRs += rs;
  console.log(` ${t.t}: Index entry ${t.idxEntry.toFixed(0)} → exit ${t.idxExit.toFixed(0)} = +${t.idxPts.toFixed(1)} pts = +₹${rs.toLocaleString('en-IN')}`);
}
console.log(` Total: +₹${totalIdxRs.toLocaleString('en-IN')}  ← Backtest result`);

console.log('');
console.log('='.repeat(75));
console.log(' DIAGNOSIS');
console.log('='.repeat(75));
const stalePremium = Math.round((54062.4-53693.4 + 54154.6-53763.8 + 54280.0-53846.3)/3);
console.log(` Avg stale premium at entry:  ${stalePremium} pts (should be ~${FAIR_PREMIUM})`);
console.log(` Overpay at entry:            ${stalePremium-FAIR_PREMIUM} pts per trade = ₹${((stalePremium-FAIR_PREMIUM)*30).toLocaleString('en-IN')} per trade`);
console.log(` This is a DATA LATENCY issue — the futures LTP returned by getCurrentPrice()`);
console.log(` was stale, reflecting the old price BEFORE the strong C12 +93% bull candle.`);
console.log(` The index jumped +480 pts in C12 but the futures LTP was not updated.`);
console.log('');
console.log(' THE FIX:');
console.log('   1. At entry, compute fair futures price = index_close + fair_premium');
console.log('   2. Use this as the ORDER reference price, not getCurrentPrice()');
console.log('   3. This eliminates stale LTP entry error (~150 pts per trade today)');
console.log('   4. Premium compression (fair entry → actual exit) is only 10-30 pts normally');
console.log('');
console.log(' TODAY was extreme because:');
console.log('   a) C12 was a monster +480pt candle → futures LTP highly likely stale after this');
console.log(`   b) Rollover week: expiry in ${DAYS_TO_EXPIRY} days → premium elevated & volatile`);
