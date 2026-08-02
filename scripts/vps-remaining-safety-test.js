const fs = require('fs');
const path = require('path');

const botSource = fs.readFileSync('/home/ubuntu/trading-bot/dist/src/index.js', 'utf8');
const serverSource = fs.readFileSync('/root/zeroscreen/dist/server.js', 'utf8');

function extractFunction(source, name) {
  let start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Production function not found: ${name}`);
  if (source.slice(start - 6, start) === 'async ') start -= 6;
  const signatureEnd = source.indexOf(') {', start);
  if (signatureEnd < 0) throw new Error(`Function signature not terminated: ${name}`);
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
  throw new Error(`Function body not terminated: ${name}`);
}
function assert(ok, message) { if (!ok) throw new Error(message); }

const reconcileFunction = extractFunction(botSource, 'reconcileTT1030LiveStateOnStartup');
function reconciliationHarness({ live = true, trade = {}, positions = [], protectionError = null, pending = [] } = {}) {
  return Function('initialTrade', 'brokerPositions', 'live', 'protectionError', 'pending', `
    const tt1030 = Object.assign({ inTrade: false, dir: null, entry: 0, entryTime: '', sl: 0, liveMode: '', futSym: '', futEntryPrice: 0, futLivePrice: 0, liveQty: 0, entryOrderId: '', exitOrderId: '', stopOrderId: '' }, initialTrade);
    let tt1030ReconciliationBlockedReason = 'old-block';
    let protectionCalls = 0, persistCount = 0, alertCount = 0, positionCalls = 0;
    const audits = [];
    function tt1030LoadPendingOrders() { return pending; }
    function tt1030IsLiveFutures() { return live; }
    const kite = { getPositions: async () => { positionCalls += 1; return { net: brokerPositions }; } };
    async function tt1030EnsureProtectiveStop() { protectionCalls += 1; if (protectionError) throw protectionError; }
    function appendTT1030Audit(event, details, severity) { audits.push({ event, details, severity }); }
    function persistTT1030State() { persistCount += 1; }
    async function notifyTT1030Telegram() { alertCount += 1; }
    ${reconcileFunction}
    return { run: reconcileTT1030LiveStateOnStartup, snapshot: () => ({ trade: { ...tt1030 }, blocked: tt1030ReconciliationBlockedReason, protectionCalls, persistCount, alertCount, positionCalls, audits }) };
  `)(trade, positions, live, protectionError, pending);
}

async function testReconciliation() {
  let test = reconciliationHarness({ live: false });
  assert((await test.run()).status === 'SKIPPED_SHADOW' && test.snapshot().positionCalls === 0, 'SHADOW startup contacted broker or did not skip');

  const symbol = 'BANKNIFTYTESTFUT';
  test = reconciliationHarness({ trade: { inTrade: true, dir: 'CE', entry: 50000, sl: 49900, futSym: symbol, liveQty: 15 }, positions: [{ exchange: 'NFO', tradingsymbol: symbol, quantity: 30, average_price: 50100, last_price: 50110 }] });
  assert((await test.run()).status === 'RECOVERED', 'matching broker position did not recover');
  let state = test.snapshot();
  assert(state.trade.liveQty === 30 && state.protectionCalls === 1 && state.persistCount === 1 && !state.blocked, 'recovered position state/protection is incorrect');

  test = reconciliationHarness({ trade: { inTrade: true, dir: 'CE', entry: 50000, sl: 49900, futSym: symbol, liveQty: 30 }, positions: [{ exchange: 'NFO', tradingsymbol: symbol, quantity: 30 }], protectionError: new Error('simulated stop failure') });
  assert((await test.run()).status === 'RECOVERED_BLOCKED' && /no verified broker stop/i.test(test.snapshot().blocked) && test.snapshot().alertCount === 1, 'unprotected recovered position was not blocked/alerted');

  test = reconciliationHarness({ trade: { inTrade: true, dir: 'CE', entry: 50000, sl: 49900, futSym: symbol, liveQty: 30 }, positions: [] });
  assert((await test.run()).status === 'CLEARED_BROKER_FLAT' && !test.snapshot().trade.inTrade && test.snapshot().trade.liveQty === 0, 'stale saved trade was not cleared when broker flat');

  test = reconciliationHarness({ positions: [{ exchange: 'NFO', tradingsymbol: symbol, quantity: -30, average_price: 50000 }] });
  assert((await test.run()).status === 'UNMATCHED_BLOCKED' && /Unmatched live/.test(test.snapshot().blocked) && test.snapshot().alertCount === 1, 'unmatched live broker position was not blocked/alerted');
  console.log('PASS startup reconciliation: SHADOW skip, matching recovery, stop failure, broker-flat clearing, unmatched blocking');
}

function emergencyHandlerFactory(kiteMock, execMock) {
  const start = serverSource.indexOf('app.post("/api/tradeops/emergency-stop"');
  const end = serverSource.indexOf('\nfunction tradeOpsInitialWorkspaceHTML', start);
  if (start < 0 || end < 0) throw new Error('Emergency Stop production route was not found');
  const route = serverSource.slice(start, end);
  let handler;
  const app = { post: (_route, _auth, callback) => { handler = callback; } };
  Function('app', 'requireAdmin', 'path_1', '__dirname', 'fs_1', 'tradeOpsKiteJSON', 'tradeOpsNum', 'tradeOpsWriteBotEnvValue', 'tradeOpsWriteStrategyOverride', 'execSync', 'TRADEOPS_BOT_DIR', 'URLSearchParams', 'setTimeout', route)(
    app, () => {}, { default: path }, '/root/zeroscreen/dist', { default: { appendFileSync() {} } }, kiteMock,
    (value) => Number(value || 0), () => {}, () => {}, execMock, '/home/ubuntu/trading-bot', URLSearchParams,
    (callback) => { callback(); return 0; },
  );
  return handler;
}
function response() {
  return { code: 200, body: null, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } };
}
const disarmOk = (command) => {
  if (/pm2 pid/.test(command)) return '123\n';
  if (/pm2 env/.test(command)) return 'TT1030_FUTURES_MODE: SHADOW\n';
  return '';
};

async function testEmergencyStop() {
  let brokerCalls = 0;
  let handler = emergencyHandlerFactory(async () => { brokerCalls += 1; return { data: { net: [] } }; }, disarmOk);
  let res = response();
  await handler({ body: { confirm: false } }, res);
  assert(res.code === 400 && brokerCalls === 0, 'missing confirmation reached broker logic');

  res = response();
  await handler({ body: { confirm: true } }, res);
  assert(res.code === 200 && res.body?.ok && res.body?.disarmed, 'flat emergency stop did not verify disarm');

  let positionCalls = 0, orderState = 'TRIGGER PENDING', exitPlaced = false;
  const fullFillKite = async (endpoint, options = {}) => {
    if (endpoint === '/portfolio/positions') {
      positionCalls += 1;
      return { data: { net: exitPlaced ? [] : [{ exchange: 'NFO', tradingsymbol: 'BANKNIFTYTESTFUT', quantity: 30, product: 'MIS' }] } };
    }
    if (endpoint === '/orders' && !options.method) return { data: exitPlaced ? [{ order_id: 'EXIT1', status: 'COMPLETE', filled_quantity: 30 }] : [{ order_id: 'STOP1', variety: 'regular', tradingsymbol: 'BANKNIFTYTESTFUT', status: orderState }] };
    if (endpoint.includes('/orders/regular/STOP1') && options.method === 'DELETE') { orderState = 'CANCELLED'; return { data: { order_id: 'STOP1' } }; }
    if (endpoint === '/orders/regular' && options.method === 'POST') { exitPlaced = true; return { data: { order_id: 'EXIT1' } }; }
    throw new Error(`Unexpected broker call ${options.method || 'GET'} ${endpoint}`);
  };
  handler = emergencyHandlerFactory(fullFillKite, disarmOk);
  res = response();
  await handler({ body: { confirm: true } }, res);
  assert(res.code === 200 && res.body?.ok && res.body?.closed?.[0]?.filledQty === 30 && res.body?.remaining?.length === 0, 'full-fill emergency exit was not verified flat');

  orderState = 'TRIGGER PENDING'; exitPlaced = false;
  const stuckCancel = async (endpoint, options = {}) => {
    if (endpoint === '/portfolio/positions') return { data: { net: [{ exchange: 'NFO', tradingsymbol: 'BANKNIFTYTESTFUT', quantity: 30, product: 'MIS' }] } };
    if (endpoint === '/orders') return { data: [{ order_id: 'STOP1', variety: 'regular', tradingsymbol: 'BANKNIFTYTESTFUT', status: 'TRIGGER PENDING' }] };
    if (options.method === 'DELETE') return { data: { order_id: 'STOP1' } };
    if (options.method === 'POST') exitPlaced = true;
    return { data: {} };
  };
  handler = emergencyHandlerFactory(stuckCancel, disarmOk);
  res = response();
  await handler({ body: { confirm: true } }, res);
  assert(res.code === 500 && !exitPlaced && /cancellation was not confirmed/.test(res.body?.message || ''), 'unconfirmed stop cancellation allowed emergency exit submission');

  handler = emergencyHandlerFactory(async () => ({ data: { net: [] } }), () => { throw new Error('simulated PM2 failure'); });
  res = response();
  await handler({ body: { confirm: true } }, res);
  assert(res.code === 409 && res.body?.disarmed === false, 'flat account falsely reported success when PM2 disarm failed');
  console.log('PASS Emergency Stop: confirmation, admin route, stop cancellation, full-fill/flat verification, disarm failure');
}

function testRedactionAndHeartbeat() {
  const sanitizerSource = serverSource.match(/function tradeOpsSanitizeLog\(value\) \{[\s\S]*?\n\}/)?.[0];
  if (!sanitizerSource) throw new Error('Deployed log sanitizer was not found');
  const sanitizer = Function(`${sanitizerSource}; return tradeOpsSanitizeLog;`)();
  const samples = [
    'request_token=requestSecret123&checksum=checksumSecret456',
    'password=passSecret123 totp:123456 api_secret=apiSecret789',
    'Authorization: Bearer bearerSecret123456',
    'set-cookie: sessionSecret123',
  ];
  const forbidden = ['requestSecret123', 'checksumSecret456', 'passSecret123', '123456', 'apiSecret789', 'bearerSecret123456', 'sessionSecret123'];
  assert(samples.map(sanitizer).every((output) => forbidden.every((secret) => !output.includes(secret))), 'deployed log sanitizer leaked a representative secret');
  assert(/tt1030StateConsistent/.test(botSource) && /tt1030SessionDate/.test(botSource) && /tt1030MergeRecoveredCandleLogs/.test(botSource), 'deployed heartbeat recovery/consistency functions are missing');
  console.log('PASS deployed authentication redaction samples and heartbeat consistency implementation');
}

(async () => {
  await testReconciliation();
  await testEmergencyStop();
  testRedactionAndHeartbeat();
  console.log('REMAINING_SAFETY_TESTS=OK');
})().catch((error) => {
  console.error(`REMAINING_SAFETY_TESTS=FAILED:${error.message}`);
  process.exitCode = 1;
});
