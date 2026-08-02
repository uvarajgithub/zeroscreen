const path = require('path');
const dotenv = require('dotenv');

const botDir = process.env.TRADING_BOT_DIR || '/home/ubuntu/trading-bot';
dotenv.config({ path: path.join(botDir, '.env') });
const { KiteConnect } = require(path.join(botDir, 'node_modules', 'kiteconnect'));

const CONFIRM = 'PLACE_AND_FLATTEN_ONE_FUTURES_LOT';
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const activeStatuses = new Set(['OPEN', 'TRIGGER PENDING', 'VALIDATION PENDING', 'OPEN PENDING', 'PUT ORDER REQ RECEIVED', 'MODIFY VALIDATION PENDING', 'MODIFY PENDING', 'CANCEL PENDING']);

function istNow() {
  const shifted = new Date(Date.now() + 5.5 * 3600000);
  return { day: shifted.getUTCDay(), hhmm: shifted.toISOString().slice(11, 16) };
}

async function waitOrder(kite, orderId, accepted, attempts = 24) {
  let order = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    await sleep(500);
    order = (await kite.getOrders()).find((row) => String(row.order_id) === String(orderId)) || order;
    const status = String(order?.status || '').toUpperCase();
    if (accepted.has(status)) return order;
    if (['REJECTED', 'CANCELLED'].includes(status)) throw new Error(`Order ${orderId} ${status}: ${order?.status_message || 'no broker reason'}`);
  }
  throw new Error(`Order ${orderId} did not reach ${[...accepted].join('/')} (last status ${order?.status || 'UNKNOWN'})`);
}

async function positionFor(kite, symbol) {
  return (await kite.getPositions())?.net?.find((row) => String(row.exchange) === 'NFO' && String(row.tradingsymbol) === symbol) || null;
}

async function main() {
  if (args.confirm !== CONFIRM) throw new Error(`Required --confirm=${CONFIRM}`);
  if (String(process.env.MODE || '').toUpperCase() === 'LIVE' || String(process.env.TT1030_FUTURES_MODE || '').toUpperCase() !== 'SHADOW') {
    throw new Error('Smoke test requires MODE!=LIVE and TT1030_FUTURES_MODE=SHADOW');
  }
  const clock = istNow();
  if (clock.day === 0 || clock.day === 6 || clock.hhmm < '09:20' || clock.hhmm > '15:00') {
    throw new Error(`Smoke test is restricted to weekdays 09:20-15:00 IST; now ${clock.hhmm}`);
  }
  const symbol = String(args.symbol || '').toUpperCase();
  const qty = Number(args.qty || 0);
  if (!/^BANKNIFTY.*FUT$/.test(symbol) || !Number.isInteger(qty) || qty <= 0) throw new Error('Provide an explicit BANKNIFTY futures --symbol and --qty');

  const kite = new KiteConnect({ api_key: process.env.API_KEY });
  kite.setAccessToken(process.env.ACCESS_TOKEN);
  await kite.getProfile();
  const instrument = (await kite.getInstruments('NFO')).find((row) => String(row.tradingsymbol) === symbol && String(row.instrument_type) === 'FUT');
  if (!instrument) throw new Error(`NFO futures instrument not found: ${symbol}`);
  if (qty !== Number(instrument.lot_size)) throw new Error(`Test quantity must equal exactly one exchange lot (${instrument.lot_size})`);
  const allPositions = (await kite.getPositions())?.net || [];
  if (allPositions.some((row) => Number(row.quantity || 0) !== 0)) throw new Error('Account is not flat; refusing smoke test');
  if ((await kite.getOrders()).some((row) => activeStatuses.has(String(row.status || '').toUpperCase()))) throw new Error('Account has an open order; refusing smoke test');

  let stopOrderId = '';
  try {
    const entry = await kite.placeOrder('regular', { exchange: 'NFO', tradingsymbol: symbol, transaction_type: 'BUY', quantity: qty, product: 'MIS', order_type: 'MARKET', validity: 'DAY', market_protection: -1, tag: 'CODEXSLMTEST' });
    const entryOrder = await waitOrder(kite, entry.order_id, new Set(['COMPLETE']));
    if (Number(entryOrder.filled_quantity || 0) !== qty) throw new Error(`Entry was not fully filled: ${entryOrder.filled_quantity}/${qty}`);
    const trigger = Math.floor(Number(entryOrder.average_price || 0) - 100);
    if (!(trigger > 0)) throw new Error('Could not calculate protective trigger');

    const stop = await kite.placeOrder('regular', { exchange: 'NFO', tradingsymbol: symbol, transaction_type: 'SELL', quantity: qty, product: 'MIS', order_type: 'SL-M', trigger_price: trigger, validity: 'DAY', market_protection: -1, tag: 'CODEXSLMTEST' });
    stopOrderId = String(stop.order_id || '');
    await waitOrder(kite, stopOrderId, new Set(['TRIGGER PENDING', 'OPEN']));
    await kite.cancelOrder('regular', stopOrderId);
    await waitOrder(kite, stopOrderId, new Set(['CANCELLED']));
    stopOrderId = '';

    const exit = await kite.placeOrder('regular', { exchange: 'NFO', tradingsymbol: symbol, transaction_type: 'SELL', quantity: qty, product: 'MIS', order_type: 'MARKET', validity: 'DAY', market_protection: -1, tag: 'CODEXSLMTEST' });
    const exitOrder = await waitOrder(kite, exit.order_id, new Set(['COMPLETE']));
    if (Number(exitOrder.filled_quantity || 0) !== qty) throw new Error(`Exit was not fully filled: ${exitOrder.filled_quantity}/${qty}`);
    const finalPosition = await positionFor(kite, symbol);
    if (Number(finalPosition?.quantity || 0) !== 0) throw new Error(`Final broker quantity is ${finalPosition.quantity}`);
    console.log('KITE_SLM_SMOKE_TEST_OK');
  } finally {
    if (stopOrderId) {
      try { await kite.cancelOrder('regular', stopOrderId); } catch (_) {}
    }
    const remaining = await positionFor(kite, symbol).catch(() => null);
    const remainingQty = Number(remaining?.quantity || 0);
    if (remainingQty) {
      const transaction = remainingQty > 0 ? 'SELL' : 'BUY';
      const emergency = await kite.placeOrder('regular', { exchange: 'NFO', tradingsymbol: symbol, transaction_type: transaction, quantity: Math.abs(remainingQty), product: String(remaining?.product || 'MIS'), order_type: 'MARKET', validity: 'DAY', market_protection: -1, tag: 'CODEXSLMTEST' });
      await waitOrder(kite, emergency.order_id, new Set(['COMPLETE']));
    }
    const finalPosition = await positionFor(kite, symbol).catch(() => null);
    if (Number(finalPosition?.quantity || 0) !== 0) throw new Error(`CRITICAL: cleanup did not flatten ${symbol}; quantity ${finalPosition.quantity}`);
  }
}

main().catch((error) => {
  console.error(`KITE_SLM_SMOKE_TEST_FAILED=${error?.message || String(error)}`);
  process.exitCode = 1;
});
