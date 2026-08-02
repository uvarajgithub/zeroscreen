const fs = require('fs');
const os = require('os');
const path = require('path');

const source = fs.readFileSync('/home/ubuntu/trading-bot/dist/src/index.js', 'utf8');

function extractFunction(name) {
  let start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Production function not found: ${name}`);
  if (source.slice(start - 6, start) === 'async ') start -= 6;
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
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
  throw new Error(`Production function was not terminated: ${name}`);
}

const functions = [
  'tt1030ExpectedSignedQty',
  'tt1030LoadPendingOrders',
  'tt1030SavePendingOrders',
  'tt1030ApplyRecoveredFill',
  'tt1030RecoverPendingOrders',
].map(extractFunction).join('\n');

function context({ pending, orders, positions, initialTrade = {} }) {
  fs.writeFileSync('tt1030-pending-orders.json', JSON.stringify(pending));
  const factory = Function('fsModule', 'orderRows', 'positionRows', 'initialTrade', `
    const fs_1 = { default: fsModule };
    const TT1030_PENDING_ORDERS_FILE = 'tt1030-pending-orders.json';
    let tt1030PendingRecoveryInFlight = false;
    let tt1030ReconciliationBlockedReason = '';
    let currentOrders = orderRows;
    let currentPositions = positionRows;
    let protectionCalls = 0;
    const audits = [];
    const tt1030 = Object.assign({
      inTrade: false, dir: null, entry: 0, entryTime: '', sl: 0, refHigh: 0, refLow: 0,
      optSym: '', optEntryPrem: 0, optLivePrem: 0, liveMode: '', futSym: '', futEntryPrice: 0,
      futLivePrice: 0, liveQty: 0, entryOrderId: '', exitOrderId: '', log: [],
    }, initialTrade);
    const kite = { getOrders: async () => {
      if (currentOrders instanceof Error) throw currentOrders;
      return currentOrders;
    }};
    async function tt1030BrokerPosition(symbol) {
      if (currentPositions instanceof Error) throw currentPositions;
      return currentPositions.find((row) => row.tradingsymbol === symbol) || null;
    }
    function appendTT1030Audit(event, details, severity) { audits.push({ event, details, severity }); }
    function persistTT1030State() {}
    async function tt1030EnsureProtectiveStop() { protectionCalls += 1; }
    ${functions}
    return {
      recover: tt1030RecoverPendingOrders,
      setBroker(nextOrders, nextPositions) { currentOrders = nextOrders; currentPositions = nextPositions; },
      snapshot() { return { tt1030: JSON.parse(JSON.stringify(tt1030)), protectionCalls, audits: JSON.parse(JSON.stringify(audits)), blocked: tt1030ReconciliationBlockedReason }; },
    };
  `);
  return factory(fs, orders, positions, initialTrade);
}

function pendingRows() {
  return JSON.parse(fs.readFileSync('tt1030-pending-orders.json', 'utf8'));
}
function assert(ok, message) {
  if (!ok) throw new Error(message);
}

async function main() {
  const originalCwd = process.cwd();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tt1030-recovery-test-'));
  process.chdir(temp);
  try {
    const entry = { orderId: 'ENTRY1', symbol: 'BANKNIFTYTESTFUT', transaction: 'BUY', requestedQty: 30, beforeQty: 0, intent: 'ENTRY', recoveredQty: 0, strategy: { dir: 'CE', entry: 50000, sl: 49900, entryTime: '10:45' } };
    let test = context({ pending: [entry], orders: [{ order_id: 'ENTRY1', status: 'COMPLETE', filled_quantity: 30, average_price: 50100 }], positions: [{ tradingsymbol: entry.symbol, quantity: 30, average_price: 50100, last_price: 50110 }] });
    await test.recover();
    let state = test.snapshot();
    assert(state.tt1030.inTrade && state.tt1030.liveQty === 30 && state.tt1030.entryOrderId === 'ENTRY1', 'late full entry was not restored');
    assert(state.protectionCalls === 1 && pendingRows().length === 0, 'late full entry was not protected and resolved');
    console.log('PASS late full entry recovery');

    const partial = { ...entry, orderId: 'ENTRY2' };
    test = context({ pending: [partial], orders: [{ order_id: 'ENTRY2', status: 'OPEN', filled_quantity: 10, average_price: 50100 }], positions: [{ tradingsymbol: entry.symbol, quantity: 10, average_price: 50100, last_price: 50105 }] });
    await test.recover();
    state = test.snapshot();
    assert(state.tt1030.liveQty === 10 && state.protectionCalls === 1, 'partial fill was not recovered/protected');
    assert(pendingRows()[0]?.recoveredQty === 10 && /ENTRY2/.test(state.blocked), 'partial fill was not retained as ambiguous');
    test.setBroker([{ order_id: 'ENTRY2', status: 'COMPLETE', filled_quantity: 30, average_price: 50102 }], [{ tradingsymbol: entry.symbol, quantity: 30, average_price: 50102, last_price: 50108 }]);
    await test.recover();
    state = test.snapshot();
    assert(state.tt1030.liveQty === 30 && pendingRows().length === 0 && state.blocked === '', 'progressive fill did not finish reconciliation');
    console.log('PASS progressive partial-fill recovery');

    const missing = { ...entry, orderId: 'ENTRY3' };
    test = context({ pending: [missing], orders: [], positions: [{ tradingsymbol: entry.symbol, quantity: 30, average_price: 50100, last_price: 50110 }] });
    await test.recover();
    state = test.snapshot();
    assert(state.tt1030.inTrade && state.tt1030.liveQty === 30 && pendingRows().length === 0, 'position-delta recovery failed when order was absent');
    console.log('PASS missing-order position-delta recovery');

    const exit = { orderId: 'EXIT1', symbol: entry.symbol, transaction: 'SELL', requestedQty: 30, beforeQty: 30, intent: 'EXIT', recoveredQty: 0 };
    test = context({ pending: [exit], orders: [{ order_id: 'EXIT1', status: 'COMPLETE', filled_quantity: 30, average_price: 50050 }], positions: [], initialTrade: { inTrade: true, dir: 'CE', entry: 50000, futSym: entry.symbol, liveQty: 30, log: [] } });
    await test.recover();
    state = test.snapshot();
    assert(!state.tt1030.inTrade && state.tt1030.liveQty === 0 && state.tt1030.exitOrderId === 'EXIT1' && pendingRows().length === 0, 'late exit was not reconciled flat');
    console.log('PASS late exit recovery');

    const failure = { ...entry, orderId: 'ENTRY4' };
    test = context({ pending: [failure], orders: new Error('simulated broker outage'), positions: [] });
    await test.recover();
    state = test.snapshot();
    assert(pendingRows().length === 1 && /recovery failed/i.test(state.blocked), 'broker failure did not preserve journal and block reconciliation');
    console.log('PASS broker-failure journal preservation');
    console.log('DELAYED_FILL_FAILURE_INJECTION=OK');
  } finally {
    process.chdir(originalCwd);
    const resolved = path.resolve(temp);
    if (resolved.startsWith(os.tmpdir() + path.sep + 'tt1030-recovery-test-')) fs.rmSync(resolved, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`DELAYED_FILL_FAILURE_INJECTION=FAILED:${error.message}`);
  process.exitCode = 1;
});
