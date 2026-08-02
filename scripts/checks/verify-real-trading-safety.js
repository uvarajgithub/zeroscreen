const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const bot = read('deployment/trading-bot/index.ts');
const botRuntime = read('deployment/trading-bot/dist/src/index.js');
const serverSource = read('src/server.ts');
const serverRuntime = read('dist/server.js');
const orderRuntime = read('deployment/trading-bot/dist/src/order.js');
const failures = [];
const passed = [];

function check(name, conditions) {
  const failed = conditions.filter(([ok]) => !ok).map(([, message]) => message);
  if (failed.length) failures.push(`${name}: ${failed.join('; ')}`);
  else passed.push(name);
}

check('exit margin handling', [
  [/normalizedIntent === "EXIT"[\s\S]*tt1030AssertLiveExitReducesPosition[\s\S]*else[\s\S]*tt1030AssertLiveMargin/.test(bot), 'exit/entry checks are not separated'],
  [/requestedQty > Math\.abs\(currentQty\)/.test(bot), 'oversized exits are not blocked'],
]);
check('startup broker reconciliation', [
  [/async function reconcileTT1030LiveStateOnStartup/.test(bot), 'reconciler missing'],
  [/await reconcileTT1030LiveStateOnStartup\(\)/.test(bot), 'reconciler not called at startup'],
  [/startup_unmatched_broker_position/.test(bot), 'unmatched broker positions do not block startup'],
]);
check('delayed-fill recovery', [
  [/TT1030_PENDING_ORDERS_FILE/.test(bot), 'pending-order journal missing'],
  [/tt1030UpsertPendingOrder\(pendingRecord\)[\s\S]*tt1030WaitForBrokerOrder/.test(bot), 'order is not journaled before confirmation polling'],
  [/setInterval\(\(\) => \{ tt1030RecoverPendingOrders\(\)/.test(bot), 'five-second recovery loop missing'],
]);
check('broker protective stop', [
  [/order_type: "SL-M"/.test(bot), 'SL-M protective order missing'],
  [/broker_protective_stop_accepted/.test(bot), 'broker acceptance is not verified'],
  [/setInterval\(\(\) => \{ tt1030MonitorProtectiveStop\(\)/.test(bot), 'protective-stop monitor missing'],
]);
check('daily loss and maximum risk', [
  [/const DAILY_LOSS_CAP = Number\(config_1\.config\.risk\?\.maxDailyLossPoints/.test(bot), 'configured points cap is not loaded'],
  [!/if \(false\) \{\s*console\.log\(`Daily loss limit hit/.test(bot), 'disabled daily-loss runtime gate remains'],
  [/tt1030DailyCapReached\(risk\.dailyPnlRs\)/.test(bot), 'broker daily-loss gate missing'],
  [/risk\.lossPoints >= TT1030_WARN_RISK_PTS/.test(bot), 'maximum-position-risk gate missing'],
]);
for (const [name, server] of [['source', serverSource], ['runtime', serverRuntime]]) {
  check(`Emergency Stop ${name}`, [
    [/TT1030_FUTURES_MODE["']?,?\s*["']SHADOW/.test(server), 'LIVE disarm missing'],
    [/filledQty < row\.qty/.test(server), 'fill verification missing'],
    [/const flat = remaining\.length === 0/.test(server), 'flat-account verification missing'],
  ]);
}
check('PM2 order rounding artifact', [
  [/function kiteOrder\(payload\)/.test(orderRuntime), 'runtime guard missing'],
  [((orderRuntime.match(/kite\.placeOrder\("regular"/g) || []).length === (orderRuntime.match(/kite\.placeOrder\("regular", kiteOrder\(\{/g) || []).length), 'not every runtime placement is guarded'],
]);
check('PM2 bot runtime artifact', [
  [botRuntime === bot, 'dist/src/index.js differs from the verified canonical bot source'],
  [/async function reconcileTT1030LiveStateOnStartup/.test(botRuntime), 'runtime reconciliation fix missing'],
  [/order_type: "SL-M"/.test(botRuntime), 'runtime protective-stop fix missing'],
  [/tt1030StateConsistent/.test(botRuntime), 'runtime heartbeat consistency fix missing'],
]);

for (const script of ['verify-pm2-order-artifact.js', 'verify-auth-redaction.js', 'verify-tt1030-heartbeat-state.js']) {
  try {
    execFileSync(process.execPath, [path.join(__dirname, script)], { cwd: root, stdio: 'pipe' });
    passed.push(script.replace(/^verify-|\.js$/g, ''));
  } catch (error) {
    failures.push(`${script}: ${String(error.stderr || error.message).trim()}`);
  }
}

for (const file of ['auto_token.js', 'dist/server.js', 'deployment/trading-bot/dist/src/index.js', 'deployment/trading-bot/dist/src/order.js', 'scripts/recover_tt1030_today.js']) {
  try {
    execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
  } catch (error) {
    failures.push(`${file}: syntax check failed`);
  }
}

if (failures.length) {
  console.error(`REAL_TRADING_SAFETY_FAILED (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`REAL_TRADING_SAFETY_OK checks=${passed.length}`);
passed.forEach((name) => console.log(`PASS ${name}`));
