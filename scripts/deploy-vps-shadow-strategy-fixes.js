const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const expected = '063e511e23a849482cbf3423d06a451ee447d8d5d5a3f6f84116b49dda131405';
const stagedSource = '/tmp/zeroscreen-shadow-index.ts';
const stagedRuntime = '/tmp/zeroscreen-shadow-index.js';
const source = '/home/ubuntu/trading-bot/src/index.ts';
const runtime = '/home/ubuntu/trading-bot/dist/src/index.js';
const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
const backup = `/root/deploy-backups/shadow-strategy-fix-${stamp}`;

function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function safeCopy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 });
  fs.copyFileSync(from, to);
}

if (![stagedSource, stagedRuntime].every(fs.existsSync)) throw new Error('Staged shadow-strategy artifacts are missing');
if (sha(stagedSource) !== expected || sha(stagedRuntime) !== expected) throw new Error('Staged artifact hash does not match audited build');
execFileSync(process.execPath, ['--check', stagedRuntime], { stdio: 'pipe' });
fs.mkdirSync(backup, { recursive: false, mode: 0o700 });
safeCopy(source, path.join(backup, 'index.ts'));
safeCopy(runtime, path.join(backup, 'index.js'));

let installed = false;
try {
  safeCopy(stagedSource, source);
  safeCopy(stagedRuntime, runtime);
  fs.chmodSync(source, 0o644);
  fs.chmodSync(runtime, 0o644);
  installed = true;
  execFileSync('pm2', ['restart', 'trading-bot'], { stdio: 'pipe', timeout: 30000 });
  const until = Date.now() + 30000;
  let heartbeat = null;
  while (Date.now() < until) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    try { heartbeat = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/bot-heartbeat.json', 'utf8')); } catch (_) { continue; }
    const age = Date.now() - new Date(heartbeat.at).getTime();
    if (age >= 0 && age < 120000 && heartbeat.bodyHoldS1Strategy === 'BODY_HOLD_S1_SHADOW' && heartbeat.bodyHoldS2Strategy === 'BODY_HOLD_S2_SHADOW') break;
  }
  if (!heartbeat || heartbeat.bodyHoldS1Strategy !== 'BODY_HOLD_S1_SHADOW' || heartbeat.bodyHoldS2Strategy !== 'BODY_HOLD_S2_SHADOW') throw new Error('Body Hold heartbeat fields did not appear after restart');
  const list = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
  const bot = list.find((row) => row.name === 'trading-bot');
  if (!bot || bot.pm2_env?.status !== 'online' || !bot.pid) throw new Error('trading-bot is not online after deployment');
  execFileSync('pm2', ['save', '--force'], { stdio: 'pipe', timeout: 30000 });
  fs.rmSync(stagedSource, { force: true });
  fs.rmSync(stagedRuntime, { force: true });
  console.log(`SHADOW_FIX_BACKUP=${backup}`);
  console.log(`SHADOW_FIX_SHA256=${expected}`);
  console.log('SHADOW_FIX_DEPLOYMENT=OK');
} catch (error) {
  if (installed) {
    safeCopy(path.join(backup, 'index.ts'), source);
    safeCopy(path.join(backup, 'index.js'), runtime);
    try { execFileSync('pm2', ['restart', 'trading-bot'], { stdio: 'ignore', timeout: 30000 }); } catch (_) {}
  }
  throw error;
}
