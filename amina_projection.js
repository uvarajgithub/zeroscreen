'use strict';
/**
 * amina_projection.js  (practical version)
 * Fixed-lot projections for AMINA-T100
 *
 * Base: 1 lot = 30 qty  |  RS_PER_PT = 15  |  MaxDD/lot = ₹17,290
 *
 * Actual yearly ₹ per lot:
 *   2021 ₹4,21,502  2022 ₹4,02,573  2023 ₹2,90,982
 *   2024 ₹3,36,641  2025 ₹3,07,588  2026 ₹1,66,406 (4.5mo)
 */

const PER_LOT = {
  2021: 421502,
  2022: 402573,
  2023: 290982,
  2024: 336641,
  2025: 307588,
  2026: 166406,   // Jan–17 May partial
};

const FULL_YEAR_AVG = Math.round((421502+402573+290982+336641+307588)/5); // ₹3,51,857
const MAX_DD_PER_LOT = 17290;
const CAPITAL_PER_LOT = 25000; // recommended: ₹25K per lot

function fmtRs(n, sign=false) {
  const s = Math.round(Math.abs(n)).toLocaleString('en-IN');
  if (sign) return (n >= 0 ? '+₹' : '-₹') + s;
  return '₹' + s;
}

const LINE  = '─'.repeat(96);
const DLINE = '═'.repeat(96);

console.log(DLINE);
console.log('  AMINA-T100 — DEPLOYMENT & RETURN PROJECTION');
console.log('  1 lot = 30 qty  |  ₹15/pt  |  Avg ₹3,51,857/lot/yr  |  MaxDD ₹17,290/lot');
console.log(DLINE);

// ── 1. Capital needed per lot ─────────────────────────────────────────────────
console.log('\n  HOW MUCH CAPITAL PER LOT?\n');
console.log('  Option A  ₹15,000  — exact ATM premium (BNF ~₹500 × 30)  [risky, no buffer]');
console.log('  Option B  ₹25,000  — ATM premium + buffer  [RECOMMENDED]');
console.log('  Option C  ₹40,000  — conservative (handles deep ITM entry, high IV days)');
console.log(`\n  MaxDD/lot = ₹17,290  →  worst case your ₹25K absorbs it with ₹7K remaining`);

// ── 2. Fixed-lot yearly table ─────────────────────────────────────────────────
const LOT_SIZES = [1, 2, 5, 10, 20, 50];

console.log('\n' + DLINE);
console.log('  FIXED QTY — YEAR-BY-YEAR PROFIT  (no compounding, steady deployment)');
console.log(DLINE);

console.log('  ' + [
  'Lots'.padEnd(5), 'Qty'.padStart(5), 'Capital'.padStart(10),
  '2021'.padStart(10), '2022'.padStart(10), '2023'.padStart(10),
  '2024'.padStart(10), '2025'.padStart(10), '2026(4.5m)'.padStart(11),
  '5yr Total'.padStart(11), 'Ann %'.padStart(7)
].join(' '));
console.log(LINE);

for (const lots of LOT_SIZES) {
  const capital = lots * CAPITAL_PER_LOT;
  const yr5     = [2021,2022,2023,2024,2025].reduce((s,y) => s + PER_LOT[y]*lots, 0);
  const annPct  = (yr5 / 5 / capital * 100).toFixed(0) + '%';
  const cols = [
    String(lots+'L').padEnd(5),
    String(lots*30).padStart(5),
    fmtRs(capital).padStart(10),
    fmtRs(PER_LOT[2021]*lots).padStart(10),
    fmtRs(PER_LOT[2022]*lots).padStart(10),
    fmtRs(PER_LOT[2023]*lots).padStart(10),
    fmtRs(PER_LOT[2024]*lots).padStart(10),
    fmtRs(PER_LOT[2025]*lots).padStart(10),
    fmtRs(PER_LOT[2026]*lots).padStart(11),
    fmtRs(yr5).padStart(11),
    annPct.padStart(7),
  ];
  console.log('  ' + cols.join(' '));
}

// ── 3. Scale-up guide: manual lot increase each year ─────────────────────────
console.log('\n' + DLINE);
console.log('  MANUAL SCALE-UP GUIDE  (reinvest profits → add more lots each year)');
console.log(DLINE);

const STARTS = [25000, 50000, 100000, 200000, 500000, 1000000];
for (const startCap of STARTS) {
  let lots    = Math.max(1, Math.floor(startCap / CAPITAL_PER_LOT));
  let capital = startCap;
  const rows  = [];

  for (const yr of [2021,2022,2023,2024,2025]) {
    const earned = PER_LOT[yr] * lots;
    capital += earned;
    const newLots = Math.floor(capital / CAPITAL_PER_LOT);
    rows.push(`${yr}:${String(lots+'L').padStart(4)} ${fmtRs(earned,true).padStart(11)}`);
    lots = newLots;
  }
  const earned26 = PER_LOT[2026] * lots;
  capital += earned26;
  rows.push(`2026:${String(lots+'L').padStart(3)} ${fmtRs(earned26,true).padStart(11)} (4.5mo)`);

  const profit = capital - startCap;
  console.log(`\n  Start: ${fmtRs(startCap)} | Init lots: ${Math.max(1,Math.floor(startCap/CAPITAL_PER_LOT))}`);
  rows.forEach(r => console.log('    ' + r));
  console.log(`    ──────────────────────────────────────────────────`);
  console.log(`    End capital: ${fmtRs(capital)}  | Profit: ${fmtRs(profit,true)}  | Final lots: ${lots}`);
}

// ── 4. Risk summary ───────────────────────────────────────────────────────────
console.log('\n' + DLINE);
console.log('  RISK SUMMARY (per lot = 30 qty)');
console.log(LINE);
console.log('  Max loss/day      -₹1,800   (both T1+RE full SL hit)');
console.log('  MaxDD 5.5 yrs     -₹17,290');
console.log('  Worst single day  -₹3,174');
console.log('  Best year/lot    +₹4,21,502  (2021)');
console.log('  Worst year/lot   +₹2,90,982  (2023)  ← still profitable');
console.log('  Win rate          56.6%');
console.log(`  Avg profit/yr    +${fmtRs(FULL_YEAR_AVG)}/lot`);
console.log(`  Days to recover 1-lot capital (₹25K): ~${Math.ceil(25000/FULL_YEAR_AVG*252)} trading days`);
console.log(DLINE);
