const fs = require('fs');
const monitor = require('/root/zeroscreen/dist/shadowMonitor.js');

const botDir = '/home/ubuntu/trading-bot';
const session = '2026-07-31';
const ledger = JSON.parse(fs.readFileSync(`${botDir}/trades.json`, 'utf8'));
const types = ledger.filter((row) => String(row.date || '').slice(0, 10) === session)
  .reduce((out, row) => { out[row.type || 'UNKNOWN'] = (out[row.type || 'UNKNOWN'] || 0) + 1; return out; }, {});
console.log(`LEDGER=${JSON.stringify(types)}`);

const defaultRequests = [
  ['drishti', 'FUTURES'], ['drishti', 'OPTIONS'],
  ['tt1030', 'FUTURES'], ['tt1030', 'OPTIONS'],
  ['tt1000', 'FUTURES'], ['tt1000', 'OPTIONS'],
  ['normal-breakout', 'FUTURES'], ['normal-breakout', 'OPTIONS'],
  ['hybrid-body', 'FUTURES'], ['hybrid-body', 'OPTIONS'],
  ['body-hold-s1', 'FUTURES'], ['body-hold-s1', 'OPTIONS'],
  ['body-hold-s2', 'FUTURES'], ['body-hold-s2', 'OPTIONS'],
];
const requests = process.argv.slice(2).length
  ? process.argv.slice(2).map((value) => {
    const [strategy, instrument = 'FUTURES'] = value.split(':');
    return [strategy, instrument.toUpperCase()];
  })
  : defaultRequests;
for (const [strategy, instrument] of requests) {
  const payload = monitor.buildShadowMonitorPayload(strategy, instrument, {});
  const rows = (payload.history?.trades || []).filter((row) => row.date === session);
  const day = (payload.history?.days || []).find((row) => row.date === session);
  console.log(JSON.stringify({ requested: strategy, instrument, resolved: payload.identity?.strategyId, historyRows: rows.length, dayTrades: day?.trades ?? null, dayPnl: day?.pnl ?? null, rows: rows.map((row) => ({ symbol: row.instrument, contract: row.contract, entry: row.entry, exit: row.exit, pnl: row.pnl, status: row.status })) }));
}
process.exit(0);
