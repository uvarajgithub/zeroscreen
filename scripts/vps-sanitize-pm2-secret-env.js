const fs = require('fs');
const { execFileSync } = require('child_process');

const dump = '/root/.pm2/dump.pm2';
const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
const backup = `/root/deploy-backups/pm2-before-secret-sanitize-${stamp}.pm2`;
const targets = [
  { name: 'zeroscreen', script: '/root/zeroscreen/dist/server.js', cwd: '/root/zeroscreen' },
  { name: 'trading-bot', script: '/home/ubuntu/trading-bot/dist/src/index.js', cwd: '/home/ubuntu/trading-bot' },
  { name: 'indicator-shadow', script: '/home/ubuntu/trading-bot/dist/src/indicator-shadow.js', cwd: '/home/ubuntu/trading-bot' },
];
const sensitive = /(TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY|TOTP)/i;

function pm2(...args) {
  return execFileSync('pm2', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 20 * 1024 * 1024 });
}
function list() { return JSON.parse(pm2('jlist')); }
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

if (!fs.existsSync(dump)) throw new Error('PM2 dump is missing');
fs.copyFileSync(dump, backup, fs.constants.COPYFILE_EXCL);
fs.chmodSync(backup, 0o600);

try {
  for (const target of targets) {
    try { pm2('delete', target.name); } catch (_) {}
    pm2('start', target.script, '--name', target.name, '--cwd', target.cwd);
  }
  sleep(5000);
  const processes = list();
  for (const target of targets) {
    const process = processes.find((row) => row.name === target.name);
    if (!process || process.pm2_env?.status !== 'online' || !process.pid) throw new Error(`${target.name} did not return online`);
    const env = process.pm2_env?.env || {};
    const keys = Object.keys(env).filter((key) => sensitive.test(key) && String(env[key] || '') !== '');
    if (keys.length) throw new Error(`${target.name} still has sensitive PM2 env keys: ${keys.join(',')}`);
  }
  const heartbeat = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/bot-heartbeat.json', 'utf8'));
  if (Date.now() - new Date(heartbeat.at).getTime() > 120000) throw new Error('trading-bot heartbeat did not recover');
  const indicator = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/indicator-shadow-heartbeat.json', 'utf8'));
  const indicatorAt = indicator.at || indicator.updatedAt || indicator.timestamp;
  if (indicatorAt && Date.now() - new Date(indicatorAt).getTime() > 120000) throw new Error('indicator-shadow heartbeat did not recover');
  pm2('save', '--force');
  const saved = JSON.parse(fs.readFileSync(dump, 'utf8'));
  for (const target of targets) {
    const process = saved.find((row) => row.name === target.name);
    const keys = Object.keys(process?.env || {}).filter((key) => sensitive.test(key) && String(process.env[key] || '') !== '');
    if (keys.length) throw new Error(`${target.name} saved PM2 env still contains sensitive keys`);
  }
  console.log(`PM2_SECRET_SANITIZE_BACKUP=${backup}`);
  console.log(`PM2_SECRET_SANITIZE_TARGETS=${targets.map((row) => row.name).join(',')}`);
  console.log('PM2_SECRET_SANITIZE=OK');
} catch (error) {
  for (const target of targets) { try { pm2('delete', target.name); } catch (_) {} }
  fs.copyFileSync(backup, dump);
  try { pm2('resurrect'); } catch (_) {}
  throw error;
}
