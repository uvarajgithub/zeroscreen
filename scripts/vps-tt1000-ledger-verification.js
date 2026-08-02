const fs = require('fs');

const source = fs.readFileSync('/home/ubuntu/trading-bot/dist/src/index.js', 'utf8');

function extractFunction(name) {
  let start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Function missing: ${name}`);
  if (source.slice(start - 6, start) === 'async ') start -= 6;
  const signatureEnd = source.indexOf(') {', start);
  const brace = signatureEnd + 2;
  let depth = 0, quote = null, escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Function unterminated: ${name}`);
}

function assert(ok, message) { if (!ok) throw new Error(message); }

(async () => {
  const closeFunction = extractFunction('closeTT1000Trade');
  const factory = Function(`
    const rows = [], events = [];
    const config_1 = { config: { quantity: 30 } };
    const market_1 = { getOptionLTP: async () => 210 };
    const logger_1 = { logTrade: (row) => rows.push(row) };
    const tt1030CandleTime = () => '11:15';
    const persistTT1000State = () => {};
    const log = (event, details) => events.push({ event, details });
    const tt1000 = {
      inTrade: true, dir: 'CE', entry: 57000, entryTime: '10:15', sl: 56800,
      optSym: 'BANKNIFTY_TEST_CE', optEntryPrem: 180, optLivePrem: 180,
      dayPts: 0, dayRs: 0, optDayPts: 0, optDayRs: 0,
      trades: 0, wins: 0, losses: 0, log: []
    };
    ${closeFunction}
    return { close: closeTT1000Trade, rows, tt1000 };
  `);
  const test = factory();
  const result = await test.close({}, 57050, 'target');
  assert(result && result.pts === 50, 'close result is incorrect');
  assert(test.rows.length === 2, 'close did not publish both index and option rows');
  const index = test.rows.find((row) => row.type === 'TEN_O_CLOCK_INDEX');
  const option = test.rows.find((row) => row.type === 'TEN_O_CLOCK_OPT');
  assert(index && index.pnl === 50 && index.pnlRs === 1500 && index.qty === 30, 'index ledger row is incorrect');
  assert(option && option.pnl === 30 && option.pnlRs === 900 && option.symbol === 'BANKNIFTY_TEST_CE', 'option ledger row is incorrect');
  assert(test.tt1000.inTrade === false && test.tt1000.dir === null, 'trade was not flattened after logging');
  assert(source.indexOf('type: "TEN_O_CLOCK_INDEX"') < source.indexOf('tt1000.inTrade = false', source.indexOf('async function closeTT1000Trade')), 'ledger logging occurs after state clear');
  console.log('PASS TT1000 index close is published to shared trade ledger');
  console.log('PASS TT1000 option close is published when both premiums are valid');
  console.log('PASS TT1000 ledger write occurs before position state is cleared');
  console.log('TT1000_LEDGER_VERIFICATION=OK');
})().catch((error) => {
  console.error(`TT1000_LEDGER_VERIFICATION=FAILED:${error.message}`);
  process.exitCode = 1;
});
