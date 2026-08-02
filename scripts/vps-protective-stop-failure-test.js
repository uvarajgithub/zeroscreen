const fs = require('fs');

const source = fs.readFileSync('/home/ubuntu/trading-bot/dist/src/index.js', 'utf8');
function extractFunction(name) {
  let start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Production function not found: ${name}`);
  if (source.slice(start - 6, start) === 'async ') start -= 6;
  const brace = source.indexOf('{', start);
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
  throw new Error(`Production function was not terminated: ${name}`);
}

const deployedFunctions = [
  'tt1030ProtectiveTriggerPrice',
  'tt1030EnsureProtectiveStop',
  'tt1030CancelProtectiveStop',
  'tt1030MonitorProtectiveStop',
].map(extractFunction).join('\n');

function harness({ trade = {}, positionQty = 30, orders = [], placedOrderId = 'STOP1' } = {}) {
  const factory = Function('initialTrade', 'initialQty', 'initialOrders', 'placedOrderId', `
    const setTimeout = (callback) => { callback(); return 0; };
    const tt1030 = Object.assign({
      inTrade: true, dir: 'CE', entry: 50000, sl: 49900, futEntryPrice: 50100,
      futSym: 'BANKNIFTYTESTFUT', liveQty: 30, liveMode: 'LIVE', stopOrderId: '', stopTriggerPrice: 0,
    }, initialTrade);
    let brokerQty = initialQty;
    let brokerOrders = initialOrders;
    let placedPayload = null;
    let modifiedPayload = null;
    let cancelledOrder = null;
    let alertCount = 0;
    let persistCount = 0;
    const audits = [];
    let tt1030ProtectiveMonitorInFlight = false;
    let tt1030ReconciliationBlockedReason = '';
    let tt1030LastProtectiveAlertAt = 0;
    function tt1030IsLiveFutures() { return true; }
    async function tt1030BrokerPosition(symbol) { return brokerQty ? { tradingsymbol: symbol, quantity: brokerQty } : null; }
    function appendTT1030Audit(event, details, severity) { audits.push({ event, details, severity }); }
    function persistTT1030State() { persistCount += 1; }
    async function notifyTT1030Telegram() { alertCount += 1; }
    const kite = {
      getOrders: async () => brokerOrders,
      placeOrder: async (_variety, payload) => { placedPayload = payload; return { order_id: placedOrderId }; },
      modifyOrder: async (_variety, id, payload) => { modifiedPayload = { id, ...payload }; return { order_id: id }; },
      cancelOrder: async (_variety, id) => { cancelledOrder = id; brokerOrders = brokerOrders.map((row) => row.order_id === id ? { ...row, status: 'CANCELLED' } : row); return { order_id: id }; },
    };
    ${deployedFunctions}
    return {
      ensure: tt1030EnsureProtectiveStop,
      cancel: tt1030CancelProtectiveStop,
      monitor: tt1030MonitorProtectiveStop,
      setOrders(value) { brokerOrders = value; },
      setQty(value) { brokerQty = value; },
      snapshot() { return { trade: { ...tt1030 }, placedPayload, modifiedPayload, cancelledOrder, alertCount, persistCount, audits, blocked: tt1030ReconciliationBlockedReason }; },
    };
  `);
  return factory(trade, positionQty, orders, placedOrderId);
}

function assert(ok, message) { if (!ok) throw new Error(message); }

async function main() {
  let test = harness({ orders: [{ order_id: 'STOP1', status: 'TRIGGER PENDING', quantity: 30, trigger_price: 50000 }] });
  await test.ensure();
  let state = test.snapshot();
  assert(state.placedPayload?.order_type === 'SL-M' && state.placedPayload.transaction_type === 'SELL' && state.placedPayload.trigger_price === 50000, 'CE protective SL-M payload is incorrect');
  assert(state.trade.stopOrderId === 'STOP1' && state.trade.stopTriggerPrice === 50000, 'accepted CE stop was not persisted');
  console.log('PASS CE protective SL-M placement and acceptance');

  test = harness({ trade: { dir: 'PE', entry: 50000, sl: 50100, futEntryPrice: 50100 }, positionQty: -30, orders: [{ order_id: 'STOP1', status: 'OPEN', quantity: 30, trigger_price: 50200 }] });
  await test.ensure();
  state = test.snapshot();
  assert(state.placedPayload?.transaction_type === 'BUY' && state.placedPayload.trigger_price === 50200, 'PE protective stop side/trigger is incorrect');
  console.log('PASS PE protective SL-M side and trigger');

  test = harness({ trade: { stopOrderId: 'OLDSTOP' }, orders: [{ order_id: 'OLDSTOP', status: 'TRIGGER PENDING', quantity: 15, trigger_price: 49950 }] });
  await test.ensure();
  state = test.snapshot();
  assert(state.modifiedPayload?.id === 'OLDSTOP' && state.modifiedPayload.quantity === 30 && state.modifiedPayload.trigger_price === 50000, 'stale protective stop was not corrected');
  console.log('PASS stale protective stop modification');

  test = harness({ orders: [{ order_id: 'STOP1', status: 'REJECTED', status_message: 'simulated rejection' }] });
  await test.monitor();
  state = test.snapshot();
  assert(/Protective stop STOP1 REJECTED/.test(state.blocked) && state.alertCount === 1, 'stop rejection did not block reconciliation and alert');
  console.log('PASS protective-stop rejection blocking and alert');

  test = harness({ trade: { stopOrderId: 'STOP2', stopTriggerPrice: 50000 }, orders: [{ order_id: 'STOP2', status: 'TRIGGER PENDING' }] });
  const cancelled = await test.cancel();
  state = test.snapshot();
  assert(cancelled.cancelled === true && cancelled.brokerFlat === false && state.cancelledOrder === 'STOP2' && state.trade.stopOrderId === '', 'protective stop cancellation was not confirmed/cleared');
  console.log('PASS protective-stop cancellation confirmation');

  test = harness({ trade: { stopOrderId: 'STOP3', stopTriggerPrice: 50000 }, positionQty: 0, orders: [{ order_id: 'STOP3', status: 'TRIGGER PENDING' }] });
  const flat = await test.ensure();
  state = test.snapshot();
  assert(flat.positionFlat === true && !state.trade.inTrade && state.trade.liveQty === 0 && state.cancelledOrder === 'STOP3', 'flat broker position did not cancel stale stop and clear state');
  console.log('PASS triggered/flat position reconciliation');
  console.log('PROTECTIVE_STOP_FAILURE_INJECTION=OK');
}

main().catch((error) => {
  console.error(`PROTECTIVE_STOP_FAILURE_INJECTION=FAILED:${error.message}`);
  process.exitCode = 1;
});
