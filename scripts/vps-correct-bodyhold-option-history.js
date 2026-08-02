const fs = require('fs');

const ledgerPath = '/home/ubuntu/trading-bot/trades.json';
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
if (!Array.isArray(ledger)) throw new Error('trades.json is not an array');
const matches = ledger.filter((row) =>
  String(row.type || '').toUpperCase() === 'BH_S2_OPT' &&
  String(row.date || '').slice(0, 10) === '2026-07-31' &&
  Number(row.entryPrice ?? row.premiumEntry) === 752.7 &&
  Number(row.exitPrice ?? row.premiumExit) === 686.35
);
if (matches.length !== 1) throw new Error(`Expected exactly one Body Hold S2 option row, found ${matches.length}`);
const row = matches[0];
const points = Number(row.exitPrice ?? row.premiumExit) - Number(row.entryPrice ?? row.premiumEntry);
const correctedPoints = parseFloat(points.toFixed(1));
const correctedRupees = Math.round(points * Number(row.qty || 30));
const changed = Number(row.pnl) !== correctedPoints || Number(row.pnlRs) !== correctedRupees;
if (changed) {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const backup = `/root/deploy-backups/bodyhold-option-ledger-before-correction-${stamp}.json`;
  fs.copyFileSync(ledgerPath, backup, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(backup, 0o600);
  row.pnl = correctedPoints;
  row.pnlRs = correctedRupees;
  const temp = `${ledgerPath}.bodyhold-correction-${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(ledger, null, 2), { mode: 0o600 });
  fs.renameSync(temp, ledgerPath);
  console.log(`BODY_HOLD_HISTORY_BACKUP=${backup}`);
}
const verified = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')).filter((item) =>
  String(item.type || '').toUpperCase() === 'BH_S2_OPT' && String(item.date || '').slice(0, 10) === '2026-07-31'
);
if (verified.length !== 1 || Number(verified[0].pnl) !== correctedPoints || Number(verified[0].pnlRs) !== correctedRupees) {
  throw new Error('Corrected Body Hold history did not verify');
}
console.log(`BODY_HOLD_HISTORY_POINTS=${correctedPoints}`);
console.log(`BODY_HOLD_HISTORY_RUPEES=${correctedRupees}`);
console.log(`BODY_HOLD_HISTORY_CHANGED=${changed}`);
console.log('BODY_HOLD_HISTORY_CORRECTION=OK');
