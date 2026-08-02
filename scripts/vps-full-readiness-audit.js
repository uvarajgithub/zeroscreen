const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execFileSync } = require('child_process');

const BOT_DIR = process.env.TRADING_BOT_DIR || '/home/ubuntu/trading-bot';
const WEB_DIR = process.env.ZERO_SCREEN_DIR || '/root/zeroscreen';
const PM2_HOME = process.env.PM2_HOME || '/root/.pm2';
const EXPECTED_DEPLOYMENT_SHA256 = {
  bot: '063e511e23a849482cbf3423d06a451ee447d8d5d5a3f6f84116b49dda131405',
  order: '3f9355047caeefee52a9a5fbf84343357c7f816c46e4a9b145bee77e62c96149',
  server: '3d8eb5518f1c1966a51b86486394d0ea9c712a8e21eda04034505bbe832c1d07',
  shadowMonitor: '0460e27a64cd15d1113769bc415d8798d971d81b6f942ee2e5389837a978b029',
  lowIvGamma: 'e34e122c7f2532ac754c03145799253cb0bc3a3a52a813d7f5fc4cedf0ebc07e',
  lowIvGammaConfig: 'd96d251a37e99ed41e4f78ec559f60a7b54915a8d02d1417eed5a2b01637bdfc',
  lowIvGammaBacktest: '58030b3f160ade283081318d6038b9ef33f5c794859f46caebb0828775483006',
  autoToken: 'cb7a5f763d4d51410731a6b95a0d28fa07f118cbead78bc50d03a0e9f35375fe',
};
const pass = [];
const fail = [];
const warn = [];

function record(ok, name, detail = '') {
  (ok ? pass : fail).push(detail ? `${name}: ${detail}` : name);
}
function warning(name, detail = '') {
  warn.push(detail ? `${name}: ${detail}` : name);
}
function read(file) {
  return fs.readFileSync(file, 'utf8');
}
function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function parseEnv(file) {
  const values = {};
  for (const line of read(file).split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}
function mode(file) {
  return fs.statSync(file).mode & 0o777;
}
function pm2List() {
  return JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
}
function inspectProcess(list, name) {
  const row = list.find((item) => item.name === name);
  record(Boolean(row), `${name} registered in PM2`);
  if (!row) return null;
  record(row.pm2_env?.status === 'online', `${name} online`, `status=${row.pm2_env?.status || 'unknown'}`);
  record(Number(row.pid || 0) > 0, `${name} has live PID`);
  return row;
}

async function main() {
  console.log(`AUDIT_AT=${new Date().toISOString()}`);
  const botEnvPath = path.join(BOT_DIR, '.env');
  record(fs.existsSync(botEnvPath), 'trading-bot .env exists');
  const env = fs.existsSync(botEnvPath) ? parseEnv(botEnvPath) : {};
  record(mode(botEnvPath) === 0o600, 'trading-bot .env permissions are 600', `mode=${mode(botEnvPath).toString(8)}`);
  record(String(env.MODE || '').toUpperCase() !== 'LIVE', 'global mode is not LIVE', `mode=${String(env.MODE || 'UNSET').toUpperCase()}`);
  record(String(env.TT1030_FUTURES_MODE || '').toUpperCase() === 'SHADOW', 'TT1030 mode is SHADOW', `mode=${String(env.TT1030_FUTURES_MODE || 'UNSET').toUpperCase()}`);

  const tokenPath = path.join(BOT_DIR, 'access_token.txt');
  record(fs.existsSync(tokenPath), 'access token file exists');
  if (fs.existsSync(tokenPath)) record(mode(tokenPath) === 0o600, 'access token permissions are 600', `mode=${mode(tokenPath).toString(8)}`);

  const findArtifact = (candidates) => candidates.map((name) => path.join(BOT_DIR, name)).find(fs.existsSync);
  const botSource = findArtifact(['src/index.ts', 'index.ts']);
  const botRuntime = path.join(BOT_DIR, 'dist/src/index.js');
  const orderSource = findArtifact(['src/order.ts', 'order.ts']);
  const orderRuntime = path.join(BOT_DIR, 'dist/src/order.js');
  record(Boolean(botSource), 'canonical bot source exists');
  record(fs.existsSync(botRuntime), 'PM2 bot runtime exists');
  record(Boolean(orderSource), 'canonical order source exists');
  record(fs.existsSync(orderRuntime), 'PM2 order runtime exists');
  if (botSource && fs.existsSync(botRuntime)) record(sha(botSource) === sha(botRuntime), 'PM2 bot runtime matches canonical source');
  record(sha(botRuntime) === EXPECTED_DEPLOYMENT_SHA256.bot, 'deployed bot runtime matches audited local artifact');
  record(sha(orderRuntime) === EXPECTED_DEPLOYMENT_SHA256.order, 'deployed order runtime matches audited local artifact');

  const lowIvGammaPath = path.join(BOT_DIR, 'low_iv_gamma.js');
  const lowIvGammaConfigPath = path.join(BOT_DIR, 'low-iv-gamma-config.json');
  record(fs.existsSync(lowIvGammaPath) && sha(lowIvGammaPath) === EXPECTED_DEPLOYMENT_SHA256.lowIvGamma, 'Low-IV Gamma shadow engine matches audited artifact');
  record(fs.existsSync(lowIvGammaConfigPath) && sha(lowIvGammaConfigPath) === EXPECTED_DEPLOYMENT_SHA256.lowIvGammaConfig, 'Low-IV Gamma configuration matches audited artifact');
  if (fs.existsSync(lowIvGammaPath)) {
    const lowIvSource = read(lowIvGammaPath);
    record(!/placeOrder|exitTrade|squareOffAll/.test(lowIvSource), 'Low-IV Gamma has no broker order path');
    record(/executionMode:\s*"SHADOW"/.test(lowIvSource), 'Low-IV Gamma hard-codes SHADOW execution');
  }
  if (fs.existsSync(lowIvGammaConfigPath)) {
    const lowIvConfig = JSON.parse(read(lowIvGammaConfigPath));
    record(lowIvConfig.executionMode === 'SHADOW' && lowIvConfig.enabled === true, 'Low-IV Gamma is enabled in SHADOW only');
    record(lowIvConfig.allowExpiryDay === false, 'Low-IV Gamma expiry-day entries are disabled');
  }
  const lowIvBacktestPath = path.join(BOT_DIR, 'low-iv-gamma-backtest.json');
  record(fs.existsSync(lowIvBacktestPath) && sha(lowIvBacktestPath) === EXPECTED_DEPLOYMENT_SHA256.lowIvGammaBacktest, 'Low-IV Gamma exact-data backtest matches audited artifact');
  if (fs.existsSync(lowIvBacktestPath)) {
    const lowIvBacktest = JSON.parse(read(lowIvBacktestPath));
    const selection = lowIvBacktest?.strategies?.['low-iv-gamma']?.OPTIONS;
    record(lowIvBacktest?.coverage?.from === '2026-07-29' && lowIvBacktest?.coverage?.to === '2026-07-31', 'Low-IV Gamma backtest coverage is recorded');
    record(Array.isArray(selection?.days) && selection.days.length === 3, 'Low-IV Gamma backtest contains all eligible sessions');
  }

  const bot = read(botRuntime);
  const order = read(orderRuntime);
  const safetyPatterns = [
    ['exit position-reduction guard', /tt1030AssertLiveExitReducesPosition/],
    ['startup broker reconciliation', /reconcileTT1030LiveStateOnStartup/],
    ['pending-order recovery', /tt1030RecoverPendingOrders/],
    ['broker protective SL-M', /order_type:\s*["']SL-M["']/],
    ['daily-loss broker gate', /tt1030DailyCapReached/],
    ['five-second risk monitor', /tt1030MonitorProtectiveStop/],
    ['heartbeat consistency field', /tt1030StateConsistent/],
  ];
  for (const [name, pattern] of safetyPatterns) record(pattern.test(bot), name);
  record(!/if\s*\(false\)\s*\{\s*console\.log\(`Daily loss limit hit/.test(bot), 'daily-loss gate is not disabled');
  const placementCount = (order.match(/kite\.placeOrder\("regular"/g) || []).length;
  const guardedCount = (order.match(/kite\.placeOrder\("regular",\s*kiteOrder\(\{/g) || []).length;
  record(placementCount > 0 && placementCount === guardedCount, 'all order placements use whole-price guard', `guarded=${guardedCount}/${placementCount}`);
  if (orderSource) {
    const sourceOrder = read(orderSource);
    const sourcePlacements = (sourceOrder.match(/kite\.placeOrder\("regular"/g) || []).length;
    const sourceGuarded = (sourceOrder.match(/kite\.placeOrder\("regular",\s*kiteOrder\(\{/g) || []).length;
    record(sourcePlacements === placementCount && sourceGuarded === guardedCount, 'order source/runtime placement guards agree', `source=${sourceGuarded}/${sourcePlacements},runtime=${guardedCount}/${placementCount}`);
  }
  record(Boolean(env.TELEGRAM_BOT_TOKEN), 'Telegram bot token configured');
  record(Boolean(env.TELEGRAM_CHAT_ID), 'Telegram chat configured');
  record(String(env.TT1030_TELEGRAM_ENABLED || '').toUpperCase() === 'ON', 'TT1030 safety alerts enabled', `value=${String(env.TT1030_TELEGRAM_ENABLED || 'UNSET').toUpperCase()}`);

  const serverRuntime = path.join(WEB_DIR, 'dist/server.js');
  record(fs.existsSync(serverRuntime), 'ZeroScreen runtime exists');
  if (fs.existsSync(serverRuntime)) {
    const server = read(serverRuntime);
    record(/app\.post\("\/api\/tradeops\/emergency-stop",\s*requireAdmin/.test(server), 'Emergency Stop requires admin');
    record(/filledQty < row\.qty/.test(server) && /const flat = remaining\.length === 0/.test(server), 'Emergency Stop verifies fills and flat account');
    record(/TT1030_FUTURES_MODE["']?,?\s*["']SHADOW/.test(server), 'Emergency Stop disarms TT1030 LIVE mode');
    record(/redact|REDACTED|sanitizeSensitive/gi.test(server), 'Server runtime contains log redaction');
    record(sha(serverRuntime) === EXPECTED_DEPLOYMENT_SHA256.server, 'deployed ZeroScreen runtime matches audited local artifact');
  }
  const shadowMonitorRuntime = path.join(WEB_DIR, 'dist/shadowMonitor.js');
  record(fs.existsSync(shadowMonitorRuntime) && sha(shadowMonitorRuntime) === EXPECTED_DEPLOYMENT_SHA256.shadowMonitor, 'deployed Shadow Monitor runtime matches audited UI artifact');
  const autoTokenPath = path.join(BOT_DIR, 'auto_token.js');
  record(fs.existsSync(autoTokenPath) && sha(autoTokenPath) === EXPECTED_DEPLOYMENT_SHA256.autoToken, 'deployed token refresher matches audited local artifact');

  const heartbeatPath = path.join(BOT_DIR, 'bot-heartbeat.json');
  record(fs.existsSync(heartbeatPath), 'heartbeat exists');
  if (fs.existsSync(heartbeatPath)) {
    const heartbeat = JSON.parse(read(heartbeatPath));
    const ageSeconds = Math.round((Date.now() - new Date(heartbeat.at).getTime()) / 1000);
    record(Number.isFinite(ageSeconds) && ageSeconds >= 0 && ageSeconds < 120, 'heartbeat is fresh', `ageSeconds=${ageSeconds}`);
    record(heartbeat.tt1030StateConsistent === true, 'TT1030 heartbeat/state agree');
    console.log(`HEARTBEAT_MODE=${String(heartbeat.tt1030Mode || heartbeat.mode || 'UNSET').toUpperCase()}`);
    console.log(`HEARTBEAT_SESSION=${heartbeat.tt1030SessionDate || heartbeat.sessionDate || 'UNSET'}`);
    console.log(`HEARTBEAT_CANDLES=${Number(heartbeat.tt1030Candles || 0)}`);
    console.log(`HEARTBEAT_TRADES=${Number(heartbeat.tt1030Trades || 0)}`);
  }
  const lowIvHeartbeatPath = path.join(BOT_DIR, 'low-iv-gamma-heartbeat.json');
  record(fs.existsSync(lowIvHeartbeatPath), 'Low-IV Gamma heartbeat exists');
  if (fs.existsSync(lowIvHeartbeatPath)) {
    const lowIvHeartbeat = JSON.parse(read(lowIvHeartbeatPath));
    const lowIvAge = Math.round((Date.now() - new Date(lowIvHeartbeat.at).getTime()) / 1000);
    record(lowIvHeartbeat.lowIvGammaMode === 'SHADOW', 'Low-IV Gamma heartbeat confirms SHADOW mode');
    record(Number.isFinite(lowIvAge) && lowIvAge >= 0 && lowIvAge < 120, 'Low-IV Gamma heartbeat is fresh', `ageSeconds=${lowIvAge}`);
  }

  const pendingPath = path.join(BOT_DIR, 'tt1030-pending-orders.json');
  if (fs.existsSync(pendingPath)) {
    const pending = JSON.parse(read(pendingPath));
    const count = Array.isArray(pending) ? pending.length : Array.isArray(pending.records) ? pending.records.length : 0;
    record(count === 0, 'no unresolved pending-order journal entries', `count=${count}`);
  } else {
    pass.push('no pending-order journal file');
  }

  const firstPm2 = pm2List();
  const botProcess = inspectProcess(firstPm2, 'trading-bot');
  const webProcess = inspectProcess(firstPm2, 'zeroscreen');
  const pm2SecretKeys = new Set(['ACCESS_TOKEN', 'API_KEY', 'API_SECRET', 'BOT_API_KEY', 'FAST2SMS_API_KEY', 'GOOGLE_CLIENT_SECRET', 'SESSION_SECRET', 'TELEGRAM_BOT_TOKEN', 'ZERODHA_PASSWORD', 'ZERODHA_TOTP_SECRET', 'TRADEOPS_DEBUG_SECRET']);
  const pm2Targets = ['trading-bot', 'zeroscreen', 'indicator-shadow'];
  const livePm2Secrets = firstPm2.flatMap((item) => pm2Targets.includes(item.name)
    ? Object.keys(item.pm2_env?.env || {}).filter((key) => pm2SecretKeys.has(key) && String(item.pm2_env.env[key] || '') !== '').map((key) => `${item.name}:${key}`)
    : []);
  record(livePm2Secrets.length === 0, 'production PM2 environments contain no credential copies', `count=${livePm2Secrets.length}`);
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const secondPm2 = pm2List();
  for (const before of [botProcess, webProcess].filter(Boolean)) {
    const after = secondPm2.find((item) => item.name === before.name);
    record(Boolean(after) && after.pid === before.pid && after.pm2_env?.restart_time === before.pm2_env?.restart_time && after.pm2_env?.status === 'online', `${before.name} stable across observation`);
  }
  const dumpPath = path.join(PM2_HOME, 'dump.pm2');
  record(fs.existsSync(dumpPath), 'PM2 process list is persisted');
  if (fs.existsSync(dumpPath)) {
    const saved = JSON.parse(read(dumpPath));
    record(['trading-bot', 'zeroscreen'].every((name) => saved.some((item) => item.name === name)), 'PM2 dump contains both production services');
    const savedPm2Secrets = saved.flatMap((item) => pm2Targets.includes(item.name)
      ? Object.keys(item.env || {}).filter((key) => pm2SecretKeys.has(key) && String(item.env[key] || '') !== '').map((key) => `${item.name}:${key}`)
      : []);
    record(savedPm2Secrets.length === 0, 'saved PM2 process list contains no credential copies', `count=${savedPm2Secrets.length}`);
  }

  try {
    const ntp = execFileSync('timedatectl', ['show', '-p', 'NTPSynchronized', '--value'], { encoding: 'utf8' }).trim();
    record(ntp === 'yes', 'host clock is NTP synchronized', `value=${ntp || 'unknown'}`);
  } catch (_) {
    warning('host clock synchronization could not be verified');
  }
  if (typeof fs.statfsSync === 'function') {
    const disk = fs.statfsSync(BOT_DIR);
    const freeGb = disk.bavail * disk.bsize / (1024 ** 3);
    record(freeGb >= 1, 'at least 1 GB disk space is free', `freeGb=${freeGb.toFixed(2)}`);
  }
  let availableMemoryMb = os.freemem() / (1024 ** 2);
  try {
    const memInfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const availableKb = Number(memInfo.match(/^MemAvailable:\s+(\d+)\s+kB$/mi)?.[1]);
    if (Number.isFinite(availableKb) && availableKb > 0) availableMemoryMb = availableKb / 1024;
  } catch (_) {}
  if (availableMemoryMb < 128) warning('host available memory is low', `availableMb=${availableMemoryMb.toFixed(0)}`);
  else pass.push(`host available memory is adequate: availableMb=${availableMemoryMb.toFixed(0)}`);

  try {
    const cron = execFileSync('crontab', ['-l'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    record(/auto_token\.js|auto_token_check\.sh/.test(cron), 'automatic broker-token refresh is scheduled');
  } catch (_) {
    fail.push('automatic broker-token refresh is not verifiably scheduled');
  }

  try {
    const sshd = execFileSync('/usr/sbin/sshd', ['-T'], { encoding: 'utf8' });
    const passwordAuth = /^passwordauthentication\s+yes$/mi.test(sshd);
    const rootPassword = /^permitrootlogin\s+yes$/mi.test(sshd);
    if (passwordAuth && rootPassword) warning('root password SSH remains enabled; rotate the exposed password or migrate to keys');
    else pass.push('SSH does not allow direct root password login');
  } catch (_) {
    warning('effective SSH authentication policy could not be verified');
  }

  try {
    const preflight = execFileSync(process.execPath, [path.join(BOT_DIR, 'scripts/kite-readiness-preflight.js')], {
      cwd: BOT_DIR,
      encoding: 'utf8',
      timeout: 30000,
    }).trim();
    for (const line of preflight.split(/\r?\n/)) console.log(line);
    record(/BROKER_PREFLIGHT=OK/.test(preflight), 'broker preflight passes');
  } catch (error) {
    const safeOutput = String(error.stdout || error.stderr || error.message).replace(/[A-Za-z0-9_-]{24,}/g, '[REDACTED]');
    fail.push(`broker preflight failed: ${safeOutput.trim()}`);
  }

  const secretValues = ['ZERODHA_PASSWORD', 'ZERODHA_TOTP_SECRET', 'ACCESS_TOKEN', 'API_SECRET']
    .map((key) => env[key]).filter((value) => typeof value === 'string' && value.length >= 6);
  const logDir = path.join(PM2_HOME, 'logs');
  let exposedFiles = 0;
  if (fs.existsSync(logDir)) {
    for (const name of fs.readdirSync(logDir)) {
      if (!/^(trading-bot|zeroscreen).*(out|error).*\.log$/i.test(name)) continue;
      const file = path.join(logDir, name);
      const size = fs.statSync(file).size;
      const handle = fs.openSync(file, 'r');
      const length = Math.min(size, 1024 * 1024);
      const buffer = Buffer.alloc(length);
      fs.readSync(handle, buffer, 0, length, size - length);
      fs.closeSync(handle);
      const tail = buffer.toString('utf8');
      if (secretValues.some((secret) => tail.includes(secret))) exposedFiles += 1;
    }
  }
  record(exposedFiles === 0, 'recent PM2 logs contain no current auth secrets', `files=${exposedFiles}`);

  const errorLogs = fs.existsSync(logDir) ? fs.readdirSync(logDir).filter((name) => /^(trading-bot|zeroscreen).*error.*\.log$/i.test(name)) : [];
  let recentFatalCount = 0;
  for (const name of errorLogs) {
    const file = path.join(logDir, name);
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > 24 * 60 * 60 * 1000) continue;
    const size = stat.size;
    const handle = fs.openSync(file, 'r');
    const length = Math.min(size, 256 * 1024);
    const buffer = Buffer.alloc(length);
    fs.readSync(handle, buffer, 0, length, size - length);
    fs.closeSync(handle);
    recentFatalCount += (buffer.toString('utf8').match(/uncaught|unhandled|fatal|segmentation fault/gi) || []).length;
  }
  if (recentFatalCount) warning('recent fatal-pattern log entries require review', `count=${recentFatalCount}`);
  else pass.push('no recent fatal-pattern PM2 log entries');

  console.log(`AUDIT_PASS=${pass.length}`);
  console.log(`AUDIT_WARN=${warn.length}`);
  console.log(`AUDIT_FAIL=${fail.length}`);
  for (const item of pass) console.log(`PASS ${item}`);
  for (const item of warn) console.log(`WARN ${item}`);
  for (const item of fail) console.log(`FAIL ${item}`);
  if (fail.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`AUDIT_CRASH=${String(error?.message || error).replace(/[A-Za-z0-9_-]{24,}/g, '[REDACTED]')}`);
  process.exitCode = 1;
});
