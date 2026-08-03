const fs = require('fs');
const os = require('os');
const path = require('path');

const runtimePath = fs.existsSync('/home/ubuntu/trading-bot/dist/src/index.js')
  ? '/home/ubuntu/trading-bot/dist/src/index.js'
  : path.join(__dirname, '..', 'deployment', 'trading-bot', 'dist', 'src', 'index.js');
const source = fs.readFileSync(runtimePath, 'utf8');
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

const functions = ['persistBodyHoldState', 'startBodyHoldSession', 'bodyHoldHeartbeatFields', 'updateBodyHoldMarkToMarket', 'runBodyHoldShadow']
  .map(extractFunction).join('\n');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bodyhold-fix-test-'));
const original = process.cwd();

(async () => {
  process.chdir(temp);
  try {
    const day = '2026-08-04';
    const empty = { inTrade: false, dir: null, entryIdx: 0, entryPrem: 0, optSym: '', sl: 0, slPrem: 0, waitDir: null, dayFutPts: 0, dayOptPts: 0, dayFutRs: 0, dayOptRs: 0, winsFut: 0, lossFut: 0, winsOpt: 0, lossOpt: 0 };
    fs.writeFileSync('body-hold-shadow-state.json', JSON.stringify({
      date: day,
      savedAt: new Date().toISOString(),
      s1: { ...empty, inTrade: true, dir: 'PE', entryIdx: 57410, entryPrem: 752.7, optSym: 'TESTPE', sl: 57610, slPrem: 552.7 },
      s2: { ...empty, inTrade: true, dir: 'PE', entryIdx: 57410, entryPrem: 752.7, optSym: 'TESTPE', sl: 57523 },
      prevCandle: { open: 57300, high: 57320, low: 57200, close: 57250 },
      candleNum: 20,
    }));
    const factory = Function('fsModule', 'sessionDay', 'emptyState', `
      const fs_1 = { default: fsModule };
      const BODY_HOLD_STATE_FILE = 'body-hold-shadow-state.json';
      const BH_EMPTY = () => ({ ...emptyState });
      let bhs1 = BH_EMPTY(), bhs2 = BH_EMPTY(), bhPrevCandle = null, bhCandleNum = 0, bodyHoldDay = '', bodyHoldStateSavedAt = '';
      const trades = [], events = [];
      const config_1 = { config: { quantity: 30 } };
      const market_1 = { getOptionLTP: async () => 600 };
      const logger_1 = { logTrade: (row) => trades.push(row) };
      const getDrishtiATMOptionSymbol = async () => 'TEST';
      const tt1030ISTParts = () => ({ ymd: sessionDay });
      const log = (event, details) => events.push({ event, details });
      ${functions}
      return { start: startBodyHoldSession, mark: updateBodyHoldMarkToMarket, run: runBodyHoldShadow, heartbeat: bodyHoldHeartbeatFields, snapshot: () => ({ bhs1, bhs2, trades, events, bodyHoldDay }) };
    `);
    const test = factory(fs, day, empty);
    test.start(day);
    let state = test.snapshot();
    assert(state.bhs1.inTrade && state.bhs2.inTrade && state.bodyHoldDay === day, 'same-day S1/S2 state did not restore');
    await test.mark(57200);
    const openHeartbeat = test.heartbeat();
    assert(openHeartbeat.bodyHoldS1Live === 57200 && openHeartbeat.bodyHoldS1OptionLive === 600, 'Body Hold live LTP fields were not published');
    assert(openHeartbeat.bodyHoldS1FuturesUnrealizedPnL === 6300 && openHeartbeat.bodyHoldS1OptionsUnrealizedPnL === -4581, 'Body Hold live unrealized P&L is incorrect');
    await test.run({ open: 57250, high: 57300, low: 57180, close: 57200 }, true);
    state = test.snapshot();
    const types = state.trades.map((row) => row.type);
    assert(!state.bhs1.inTrade && !state.bhs2.inTrade, 'EOD did not flatten both Body Hold states');
    assert(['BH_S1_FUT', 'BH_S1_OPT', 'BH_S2_FUT', 'BH_S2_OPT'].every((type) => types.includes(type)), 'EOD did not record all S1/S2 futures/options rows');
    assert(state.trades.filter((row) => row.type.endsWith('_OPT')).every((row) => row.pnl === -152.7), 'long PE option P&L must be exit premium minus entry premium');
    const saved = JSON.parse(fs.readFileSync('body-hold-shadow-state.json', 'utf8'));
    assert(saved.date === day && saved.s1.inTrade === false && saved.s2.inTrade === false, 'flat EOD state was not persisted');
    const heartbeat = test.heartbeat();
    assert(heartbeat.bodyHoldS1Strategy === 'BODY_HOLD_S1_SHADOW' && heartbeat.bodyHoldS2Strategy === 'BODY_HOLD_S2_SHADOW' && heartbeat.bodyHoldS1InTrade === false && heartbeat.bodyHoldS2InTrade === false, 'Body Hold heartbeat fields are incorrect');
    assert(source.indexOf('if (toMs <= fromMs)') < source.indexOf('kite.getHistoricalData(TT1030_INDEX_TOKEN'), 'premarket inverted-range guard is missing or ordered after broker call');
    assert(/bodyHoldEODWindow[\s\S]*m >= 31[\s\S]*runBodyHoldShadow/.test(source), 'independent 15:31 EOD path is missing');
    console.log('PASS Body Hold same-day restart restoration');
    console.log('PASS Body Hold Futures/Options live LTP and unrealized P&L');
    console.log('PASS Body Hold S1/S2 guaranteed EOD rows and persisted flat state');
    console.log('PASS Body Hold S1/S2 heartbeat visibility');
    console.log('PASS shared 09:15 inverted-range broker guard');
    console.log('BODY_HOLD_FIX_VERIFICATION=OK');
  } finally {
    process.chdir(original);
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(`BODY_HOLD_FIX_VERIFICATION=FAILED:${error.message}`);
  process.exitCode = 1;
});
