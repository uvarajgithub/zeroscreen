const fs = require('fs');
const path = require('path');

const root = '/home/ubuntu/trading-bot';
const statePath = path.join(root, 'tt1000-state.json');
const ledgerPath = path.join(root, 'trades.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
if (!Array.isArray(ledger)) throw new Error('trades.json is not an array');
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(state.day || ''))) throw new Error('TT1000 state day is invalid');

const candidates = [];
for (const trade of state.log || []) {
  if (!trade || !trade.dir || !(trade.entry > 0) || !(trade.exit > 0)) continue;
  const date = new Date(`${state.day}T${trade.time}:00+05:30`).toISOString();
  const qty = 30;
  candidates.push({
    date,
    type: 'TEN_O_CLOCK_INDEX',
    direction: trade.dir,
    symbol: 'BANKNIFTY_INDEX_SHADOW',
    entryPrice: trade.entry,
    exitPrice: trade.exit,
    pnl: trade.pts,
    pnlRs: trade.pnlRs,
    reasonEntry: 'ten_o_clock_breakout',
    reasonExit: trade.reason,
    aiScore: 1,
    slippage: 0,
    duration: 0,
    qty,
  });
  if (trade.premIn > 0 && trade.premOut > 0 && trade.symbol) {
    const optionPoints = parseFloat((trade.premOut - trade.premIn).toFixed(1));
    candidates.push({
      date,
      type: 'TEN_O_CLOCK_OPT',
      direction: trade.dir,
      symbol: trade.symbol,
      entryPrice: trade.premIn,
      exitPrice: trade.premOut,
      premiumEntry: trade.premIn,
      premiumExit: trade.premOut,
      pnl: optionPoints,
      pnlRs: Math.round(optionPoints * qty),
      reasonEntry: 'ten_o_clock_opt_shadow',
      reasonExit: trade.reason,
      aiScore: 1,
      slippage: 0,
      duration: 0,
      qty,
    });
  }
}

const same = (left, right) =>
  left.type === right.type &&
  left.date === right.date &&
  left.direction === right.direction &&
  left.symbol === right.symbol &&
  Number(left.entryPrice) === Number(right.entryPrice) &&
  Number(left.exitPrice) === Number(right.exitPrice);
const missing = candidates.filter((candidate) => !ledger.some((row) => same(row, candidate)));
if (!candidates.length) throw new Error('No completed TT1000 trades found to backfill');

if (missing.length) {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const backup = `/root/deploy-backups/tt1000-ledger-backfill-${stamp}.json`;
  fs.copyFileSync(ledgerPath, backup);
  const temp = `${ledgerPath}.tt1000-backfill-${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify([...ledger, ...missing], null, 2), { mode: 0o600 });
  fs.renameSync(temp, ledgerPath);
  console.log(`TT1000_BACKFILL_BACKUP=${backup}`);
}

const finalLedger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const verified = candidates.filter((candidate) => finalLedger.some((row) => same(row, candidate)));
if (verified.length !== candidates.length) throw new Error('Backfill verification failed');
console.log(`TT1000_BACKFILL_EXPECTED=${candidates.length}`);
console.log(`TT1000_BACKFILL_ADDED=${missing.length}`);
console.log(`TT1000_BACKFILL_VERIFIED=${verified.length}`);
console.log('TT1000_BACKFILL=OK');
