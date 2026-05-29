// SL CONDITION DEEP ANALYSIS
// Tests: SL_PTS = 150 (current) vs 100 vs 50 vs 200 vs 250
// Shows: how many SL hits, which context, which candle, P&L impact, avg loss per SL

const r = JSON.parse(require('fs').readFileSync('/home/ubuntu/trading-bot/cache/banknifty_5yr.json','utf8'));
const ALL = Object.keys(r).sort().filter(k => r[k] && r[k].length > 0);

const pdh = cs => Math.max(...cs.map(c => c.high));
const pdl = cs => Math.min(...cs.map(c => c.low));
const pdc = cs => cs[cs.length - 1].close;

const ctx = { ABOVE_PDH: 0, BELOW_PDL: 0, INSIDE: 0, NO_PREV: 0 };
const ctxByYear = {};

for (let i = 0; i < ALL.length; i++) {
  const date = ALL[i];
  const yr = date.slice(0, 4);
  if (!ctxByYear[yr]) ctxByYear[yr] = { ABOVE_PDH: 0, BELOW_PDL: 0, INSIDE: 0 };

  if (i === 0) { ctx.NO_PREV++; continue; }
  const cs   = r[date];
  const prev = r[ALL[i - 1]];
  if (!prev || prev.length === 0) { ctx.NO_PREV++; continue; }

  const PH     = pdh(prev);
  const PL     = pdl(prev);
  const vsPDH  = cs[0].open - PH;
  const vsPDL  = cs[0].open - PL;

  let c;
  if      (vsPDH > 120) c = 'ABOVE_PDH';
  else if (vsPDL < 0)   c = 'BELOW_PDL';
  else                  c = 'INSIDE';

  ctx[c]++;
  ctxByYear[yr][c]++;
}

console.log('\n  PIECE 1 — Market Context split across', ALL.length, 'days\n');
console.log('  Context     Count   %age');
console.log('  ─────────────────────────');
const total = ALL.length - ctx.NO_PREV;
for (const [c, n] of Object.entries(ctx)) {
  if (c === 'NO_PREV') continue;
  console.log(`  ${c.padEnd(12)} ${String(n).padStart(5)}   ${(n/total*100).toFixed(1)}%`);
}
console.log(`  ${'TOTAL'.padEnd(12)} ${String(total).padStart(5)}   100%`);

console.log('\n  By year:');
console.log('  Year   ABOVE_PDH   BELOW_PDL   INSIDE');
console.log('  ──────────────────────────────────────');
for (const [yr, c] of Object.entries(ctxByYear).sort()) {
  const tot = c.ABOVE_PDH + c.BELOW_PDL + c.INSIDE;
  console.log(`  ${yr}   ${String(c.ABOVE_PDH).padStart(5)}(${(c.ABOVE_PDH/tot*100).toFixed(0)}%)   ${String(c.BELOW_PDL).padStart(5)}(${(c.BELOW_PDL/tot*100).toFixed(0)}%)   ${String(c.INSIDE).padStart(5)}(${(c.INSIDE/tot*100).toFixed(0)}%)`);
}
