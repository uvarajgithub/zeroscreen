const path = require('path');
const dotenv = require('dotenv');

const botDir = process.env.TRADING_BOT_DIR || '/home/ubuntu/trading-bot';
dotenv.config({ path: path.join(botDir, '.env') });
const { KiteConnect } = require(path.join(botDir, 'node_modules', 'kiteconnect'));

const openStatuses = new Set([
  'OPEN', 'TRIGGER PENDING', 'VALIDATION PENDING', 'OPEN PENDING',
  'PUT ORDER REQ RECEIVED', 'MODIFY VALIDATION PENDING', 'MODIFY PENDING', 'CANCEL PENDING',
]);

async function main() {
  const required = ['API_KEY', 'ACCESS_TOKEN'];
  const missing = required.filter((name) => !String(process.env[name] || '').trim());
  if (missing.length) throw new Error(`Missing broker configuration: ${missing.join(', ')}`);

  const kite = new KiteConnect({ api_key: process.env.API_KEY });
  kite.setAccessToken(process.env.ACCESS_TOKEN);
  await kite.getProfile();
  const [positions, orders] = await Promise.all([kite.getPositions(), kite.getOrders()]);
  const nonFlat = (positions?.net || []).filter((position) => Number(position?.quantity || 0) !== 0);
  const openOrders = (orders || []).filter((order) => openStatuses.has(String(order?.status || '').toUpperCase()));
  const bankNiftyFutures = nonFlat.filter((position) =>
    String(position?.exchange || '') === 'NFO' && /BANKNIFTY.*FUT$/i.test(String(position?.tradingsymbol || '')),
  );
  const mode = String(process.env.MODE || 'UNSET').toUpperCase();
  const ttMode = String(process.env.TT1030_FUTURES_MODE || 'UNSET').toUpperCase();
  const safe = mode !== 'LIVE' && ttMode === 'SHADOW' && nonFlat.length === 0 && openOrders.length === 0;

  console.log('KITE_AUTH_OK');
  console.log(`MODE=${mode}`);
  console.log(`TT1030_FUTURES_MODE=${ttMode}`);
  console.log(`NON_FLAT_POSITIONS=${nonFlat.length}`);
  console.log(`OPEN_ORDERS=${openOrders.length}`);
  console.log(`BANKNIFTY_FUTURES_POSITIONS=${bankNiftyFutures.length}`);
  console.log(`BROKER_PREFLIGHT=${safe ? 'OK' : 'BLOCKED'}`);
  if (!safe) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`BROKER_PREFLIGHT_ERROR=${error?.message || String(error)}`);
  process.exitCode = 1;
});
