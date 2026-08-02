const fs = require('fs');

const botSource = fs.readFileSync('/home/ubuntu/trading-bot/dist/src/index.js', 'utf8');
const orderSource = fs.readFileSync('/home/ubuntu/trading-bot/dist/src/order.js', 'utf8');

function extractFunction(source, name) {
  let start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Production function not found: ${name}`);
  if (source.slice(start - 6, start) === 'async ') start -= 6;
  const signatureEnd = source.indexOf(') {', start);
  if (signatureEnd < 0) throw new Error(`Production function signature was not terminated: ${name}`);
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
  throw new Error(`Production function was not terminated: ${name}`);
}

const exitGuard = extractFunction(botSource, 'tt1030AssertLiveExitReducesPosition');
const placeOrder = extractFunction(botSource, 'tt1030PlaceLiveFuturesOrder');
const wholePrice = extractFunction(orderSource, 'wholeOrderPrice');
const kiteOrder = extractFunction(orderSource, 'kiteOrder');

function harness(positionQty) {
  const factory = Function('initialQty', `
    let currentQty = initialQty;
    let exitChecks = 0;
    let marginChecks = 0;
    let placements = 0;
    let journalAdds = 0;
    let journalRemoves = 0;
    async function tt1030BrokerPosition() { return currentQty ? { quantity: currentQty } : null; }
    function appendTT1030Audit() {}
    async function tt1030AssertLiveMargin() { marginChecks += 1; }
    ${exitGuard}
    const originalExitGuard = tt1030AssertLiveExitReducesPosition;
    tt1030AssertLiveExitReducesPosition = async (...args) => { exitChecks += 1; return originalExitGuard(...args); };
    const kite = { placeOrder: async () => { placements += 1; return { order_id: 'ORDER1' }; } };
    function tt1030UpsertPendingOrder() { journalAdds += 1; }
    function tt1030RemovePendingOrder() { journalRemoves += 1; }
    async function tt1030WaitForBrokerOrder() { return { order_id: 'ORDER1', status: 'COMPLETE', filled_quantity: 30, average_price: 50000 }; }
    function log() {}
    async function notifyTT1030Telegram() {}
    ${placeOrder}
    return {
      guard: originalExitGuard,
      place: tt1030PlaceLiveFuturesOrder,
      snapshot: () => ({ exitChecks, marginChecks, placements, journalAdds, journalRemoves }),
    };
  `);
  return factory(positionQty);
}

function expectReject(promise, pattern) {
  return promise.then(() => { throw new Error(`Expected rejection: ${pattern}`); }, (error) => {
    if (!pattern.test(error.message)) throw error;
  });
}
function assert(ok, message) { if (!ok) throw new Error(message); }

async function main() {
  let test = harness(30);
  assert(await test.guard('BANKNIFTYTESTFUT', 'SELL', 30) === 30, 'long SELL exit was not allowed');
  await expectReject(test.guard('BANKNIFTYTESTFUT', 'BUY', 30), /increase or reverse/);
  await expectReject(test.guard('BANKNIFTYTESTFUT', 'SELL', 31), /exceeds broker quantity/);
  console.log('PASS long exit side and oversize guards');

  test = harness(-30);
  assert(await test.guard('BANKNIFTYTESTFUT', 'BUY', 30) === -30, 'short BUY exit was not allowed');
  await expectReject(test.guard('BANKNIFTYTESTFUT', 'SELL', 30), /increase or reverse/);
  console.log('PASS short exit side guard');

  test = harness(0);
  await expectReject(test.guard('BANKNIFTYTESTFUT', 'SELL', 30), /already flat/);
  console.log('PASS flat-account exit rejection');

  test = harness(30);
  await test.place('BANKNIFTYTESTFUT', 'SELL', 30, 'test_exit', 'EXIT', {});
  let state = test.snapshot();
  assert(state.exitChecks === 1 && state.marginChecks === 0 && state.placements === 1 && state.journalAdds === 1 && state.journalRemoves === 1, 'exit path used margin or skipped journal/confirmation');
  console.log('PASS exit bypasses entry margin after position-reduction verification');

  test = harness(0);
  await test.place('BANKNIFTYTESTFUT', 'BUY', 30, 'test_entry', 'ENTRY', {});
  state = test.snapshot();
  assert(state.marginChecks === 1 && state.exitChecks === 0 && state.placements === 1, 'entry path did not use margin check exclusively');
  console.log('PASS entry retains margin precheck');

  const rounding = Function('log', `${wholePrice}\n${kiteOrder}\nreturn kiteOrder;`)(() => {});
  const buy = rounding({ transaction_type: 'BUY', price: 100.01, trigger_price: 99.01 });
  const sell = rounding({ transaction_type: 'SELL', price: 100.99, trigger_price: 99.99 });
  const market = rounding({ transaction_type: 'BUY', order_type: 'MARKET', quantity: 30 });
  assert(buy.price === 101 && buy.trigger_price === 100, 'BUY prices were not rounded upward');
  assert(sell.price === 100 && sell.trigger_price === 99, 'SELL prices were not rounded downward');
  assert(!Object.hasOwn(market, 'price') && !Object.hasOwn(market, 'trigger_price'), 'market order gained price fields');
  console.log('PASS whole-price BUY/SELL rounding and market-order preservation');
  console.log('ORDER_SAFETY_FAILURE_INJECTION=OK');
}

main().catch((error) => {
  console.error(`ORDER_SAFETY_FAILURE_INJECTION=FAILED:${error.message}`);
  process.exitCode = 1;
});
