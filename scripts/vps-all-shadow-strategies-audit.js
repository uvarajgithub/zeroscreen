const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const botDir = '/home/ubuntu/trading-bot';
const env = {};
for (const line of fs.readFileSync(path.join(botDir, '.env'), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) continue;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  env[match[1]] = value;
}
const source = fs.readFileSync(path.join(botDir, 'dist/src/index.js'), 'utf8');
const heartbeat = JSON.parse(fs.readFileSync(path.join(botDir, 'bot-heartbeat.json'), 'utf8'));
const now = new Date();
const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
const today = ist.toISOString().slice(0, 10);
const pass = [], warn = [], fail = [];

function check(ok, name, detail = '') { (ok ? pass : fail).push(detail ? `${name}: ${detail}` : name); }
function warning(name, detail = '') { warn.push(detail ? `${name}: ${detail}` : name); }
function readJson(relative) {
  const file = path.join(botDir, relative);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { fail.push(`${relative} invalid JSON: ${error.message}`); return null; }
}
function stateDay(state) { return String(state?.date || state?.day || ''); }
function duplicateCandleKeys(rows) {
  const keys = (Array.isArray(rows) ? rows : []).map((row) => String(row?.time || row?.idx || row?.num || '')).filter(Boolean);
  return keys.length - new Set(keys).size;
}
function errorCount(pattern) {
  const logDir = '/root/.pm2/logs';
  let count = 0;
  for (const name of fs.readdirSync(logDir).filter((name) => /^trading-bot.*\.log$/i.test(name))) {
    const file = path.join(logDir, name);
    const stat = fs.statSync(file);
    const length = Math.min(stat.size, 1024 * 1024);
    const fd = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, stat.size - length);
    fs.closeSync(fd);
    count += (buffer.toString('utf8').match(pattern) || []).length;
  }
  return count;
}

function auditPersistedStrategy({ name, stateFile, heartbeatPrefix, expectedStrategy, runner, errorPattern }) {
  const state = readJson(stateFile);
  check(Boolean(state), `${name} state file exists`, stateFile);
  if (state) {
    const day = stateDay(state);
    if (day && day !== today) warning(`${name} state is not from today`, `stateDay=${day},today=${today}`);
    else pass.push(`${name} state session is current`);
    const candles = state.candleLog || state.log || [];
    check(duplicateCandleKeys(candles) === 0, `${name} state has no duplicate candle keys`);
  }
  check(source.includes(`async function ${runner}(`), `${name} runner exists`);
  check((source.match(new RegExp(`${runner}\\(`, 'g')) || []).length >= 2, `${name} runner is scheduled`);
  check(String(heartbeat[`${heartbeatPrefix}Strategy`] || '') === expectedStrategy, `${name} heartbeat identity`, `value=${heartbeat[`${heartbeatPrefix}Strategy`] || 'missing'}`);
  const recentErrors = errorCount(errorPattern);
  if (recentErrors) warning(`${name} recent error markers`, `count=${recentErrors}`);
  else pass.push(`${name} has no recent error markers`);
}

const mode = String(env.MODE || 'UNSET').toUpperCase();
const ttMode = String(env.TT1030_FUTURES_MODE || 'UNSET').toUpperCase();
check(mode !== 'LIVE', 'global mode is non-LIVE', `mode=${mode}`);
check(ttMode === 'SHADOW', 'TT1030 futures mode is SHADOW', `mode=${ttMode}`);
const heartbeatAge = Math.round((Date.now() - new Date(heartbeat.at).getTime()) / 1000);
check(heartbeatAge >= 0 && heartbeatAge < 120, 'shared heartbeat is fresh', `ageSeconds=${heartbeatAge}`);

auditPersistedStrategy({ name: '10:30 Shadow', stateFile: 'tt1030-shadow-state.json', heartbeatPrefix: 'tt1030Shadow', expectedStrategy: 'TEN_THIRTY_INDEX_SHADOW', runner: 'runTenThirtyTradeOps', errorPattern: /TT1030_(?:RUN|SHADOW_BOOTSTRAP)_ERR/g });
check(heartbeat.tt1030StateConsistent === true, '10:30 heartbeat/state consistency flag is true');
check(String(heartbeat.tt1030FuturesMode || '').toUpperCase() === 'SHADOW', '10:30 heartbeat mode is SHADOW');

auditPersistedStrategy({ name: '10:00 LOCK Shadow', stateFile: 'tt1000-state.json', heartbeatPrefix: 'tt1000', expectedStrategy: 'TEN_O_CLOCK_INDEX_SHADOW', runner: 'runTenOCLockShadow', errorPattern: /TT1000_RUN_ERR/g });
auditPersistedStrategy({ name: 'Hybrid Body Shadow', stateFile: 'hybrid-state.json', heartbeatPrefix: 'hybridShadow', expectedStrategy: 'HYBRID_BODY_INDEX_SHADOW', runner: 'runHybridBodyShadow', errorPattern: /HYBRID_SHADOW_ERR/g });
auditPersistedStrategy({ name: 'Normal Breakout Shadow', stateFile: 'normal-breakout-v1-state.json', heartbeatPrefix: 'normalBreakoutShadow', expectedStrategy: 'NORMAL_BREAKOUT_V1_SHADOW', runner: 'runNormalBreakoutShadow', errorPattern: /NORMAL_BREAKOUT_SHADOW_ERR/g });

for (const [name, variable] of [['Body Hold S1', 'bhs1'], ['Body Hold S2', 'bhs2']]) {
  check(source.includes(`let ${variable} = BH_EMPTY()`), `${name} state exists in memory`);
  check(source.includes("runBodyHoldShadow(bc"), `${name} shared runner is scheduled`);
  const hasHeartbeat = Object.keys(heartbeat).some((key) => key.toLowerCase().includes(variable.toLowerCase()) || key.toLowerCase().includes(name.replace(/\s/g, '').toLowerCase()));
  if (!hasHeartbeat) warning(`${name} has no heartbeat fields`);
  const hasPersistence = /BODY_HOLD.*STATE_FILE|BH_STATE_FILE|body-hold.*state\.json/i.test(source);
  if (!hasPersistence) warning(`${name} has no restart persistence`);
}
const bodyHoldErrors = errorCount(/BH_SHADOW_ERR/g);
if (bodyHoldErrors) warning('Body Hold recent error markers', `count=${bodyHoldErrors}`);
else pass.push('Body Hold has no recent error markers');

const mainStrategy = String(heartbeat.strategy || 'UNKNOWN');
const mainMode = String(heartbeat.mode || mode || 'UNKNOWN').toUpperCase();
check(mainMode !== 'LIVE', 'configured main strategy is non-LIVE', `strategy=${mainStrategy},mode=${mainMode}`);
if (heartbeat.inTrade) warning('configured main strategy heartbeat reports an open simulated trade', `strategy=${mainStrategy}`);
else pass.push(`configured main strategy is flat: strategy=${mainStrategy}`);

const preflight = execFileSync(process.execPath, [path.join(botDir, 'scripts/kite-readiness-preflight.js')], { cwd: botDir, encoding: 'utf8', timeout: 30000 });
for (const key of ['NON_FLAT_POSITIONS', 'OPEN_ORDERS', 'BROKER_PREFLIGHT']) {
  const value = preflight.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1] || 'UNKNOWN';
  console.log(`${key}=${value}`);
}
check(/BROKER_PREFLIGHT=OK/.test(preflight), 'broker has no unintended SHADOW exposure');

console.log(`SHADOW_AUDIT_PASS=${pass.length}`);
console.log(`SHADOW_AUDIT_WARN=${warn.length}`);
console.log(`SHADOW_AUDIT_FAIL=${fail.length}`);
for (const row of pass) console.log(`PASS ${row}`);
for (const row of warn) console.log(`WARN ${row}`);
for (const row of fail) console.log(`FAIL ${row}`);
if (fail.length) process.exitCode = 1;
