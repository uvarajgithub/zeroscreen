const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const botDir = process.env.TRADING_BOT_DIR || '/home/ubuntu/trading-bot';
const env = {};
for (const line of fs.readFileSync(path.join(botDir, '.env'), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) continue;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  env[match[1]] = value;
}

function preflight(stage) {
  const output = execFileSync(process.execPath, [path.join(botDir, 'scripts/kite-readiness-preflight.js')], {
    cwd: botDir,
    encoding: 'utf8',
    timeout: 30000,
  });
  if (!/BROKER_PREFLIGHT=OK/.test(output)) throw new Error(`${stage} broker preflight did not pass`);
  for (const key of ['NON_FLAT_POSITIONS', 'OPEN_ORDERS', 'BROKER_PREFLIGHT']) {
    const value = output.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1] || 'UNKNOWN';
    console.log(`${stage}_${key}=${value}`);
  }
}

function pm2Process() {
  const list = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
  return list.find((item) => item.name === 'trading-bot');
}

async function main() {
  const mode = String(env.MODE || 'UNSET').toUpperCase();
  const ttMode = String(env.TT1030_FUTURES_MODE || 'UNSET').toUpperCase();
  if (mode === 'LIVE' || ttMode !== 'SHADOW') throw new Error(`Unsafe restart-test modes: MODE=${mode}, TT1030=${ttMode}`);
  console.log(`MODE=${mode}`);
  console.log(`TT1030_FUTURES_MODE=${ttMode}`);
  preflight('BEFORE');

  const before = pm2Process();
  if (!before || before.pm2_env?.status !== 'online') throw new Error('trading-bot is not online before restart');
  execFileSync('pm2', ['restart', 'trading-bot'], { stdio: 'pipe', timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 12000));

  const after = pm2Process();
  if (!after || after.pm2_env?.status !== 'online' || !after.pid || after.pid === before.pid) {
    throw new Error('trading-bot did not return online with a new PID');
  }
  const heartbeat = JSON.parse(fs.readFileSync(path.join(botDir, 'bot-heartbeat.json'), 'utf8'));
  const ageSeconds = Math.round((Date.now() - new Date(heartbeat.at).getTime()) / 1000);
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds >= 120) throw new Error(`Heartbeat is stale after restart: ${ageSeconds}s`);
  if (heartbeat.tt1030StateConsistent !== true) throw new Error('TT1030 heartbeat/state disagree after restart');
  preflight('AFTER');
  execFileSync('pm2', ['save', '--force'], { stdio: 'pipe', timeout: 30000 });
  console.log(`POST_RESTART_HEARTBEAT_AGE_SECONDS=${ageSeconds}`);
  console.log(`POST_RESTART_SESSION=${heartbeat.tt1030SessionDate || heartbeat.sessionDate || 'UNSET'}`);
  console.log('SHADOW_RESTART_RECONCILIATION=OK');
}

main().catch((error) => {
  console.error(`SHADOW_RESTART_RECONCILIATION=FAILED:${error.message}`);
  process.exitCode = 1;
});
