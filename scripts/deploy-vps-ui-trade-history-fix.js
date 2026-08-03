const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const expected = '8ca9a93cd2dde7526aca759105ffff272ee910a21ec44e7d3c55d9a1a3af7ac6';
const staged = '/tmp/zeroscreen-shadowMonitor.ts';
const root = '/root/zeroscreen';
const source = path.join(root, 'src/shadowMonitor.ts');
const dist = path.join(root, 'dist');
const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
const backup = `/root/deploy-backups/ui-trade-history-${stamp}`;

function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function run(file, args, options = {}) {
  return execFileSync(file, args, { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 20 * 1024 * 1024, ...options });
}

if (!fs.existsSync(staged) || sha(staged) !== expected) throw new Error('Staged Shadow Monitor source hash mismatch');
fs.mkdirSync(backup, { recursive: false, mode: 0o700 });
fs.copyFileSync(source, path.join(backup, 'shadowMonitor.ts'));
fs.cpSync(dist, path.join(backup, 'dist'), { recursive: true, errorOnExist: true });

let installed = false;
try {
  fs.copyFileSync(staged, source);
  fs.chmodSync(source, 0o644);
  installed = true;
  run('npm', ['run', 'build']);
  run(process.execPath, ['--check', path.join(dist, 'shadowMonitor.js')]);
  run(process.execPath, ['--check', path.join(dist, 'server.js')]);
  const runtime = fs.readFileSync(path.join(dist, 'shadowMonitor.js'), 'utf8');
  for (const marker of ['body-hold-s1', 'low-iv-gamma', 'LOW_IV_GAMMA_OPT', 'TEN_O_CLOCK_INDEX', 'data-period="TRADES"', 'tt1030-shadow-state.json']) {
    if (!runtime.includes(marker)) throw new Error(`Compiled UI marker missing: ${marker}`);
  }
  run('pm2', ['restart', 'zeroscreen']);
  const until = Date.now() + 30000;
  let online = false;
  while (Date.now() < until) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    const list = JSON.parse(run('pm2', ['jlist']));
    const app = list.find((row) => row.name === 'zeroscreen');
    if (app?.pm2_env?.status === 'online' && app.pid) { online = true; break; }
  }
  if (!online) throw new Error('ZeroScreen did not return online');
  const status = run('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', 'http://127.0.0.1:4000/signals']).trim();
  if (!['200', '302'].includes(status)) throw new Error(`Shadow Monitor HTTP ${status}`);
  run('pm2', ['save', '--force']);
  fs.rmSync(staged, { force: true });
  console.log(`UI_HISTORY_BACKUP=${backup}`);
  console.log(`UI_HISTORY_SOURCE_SHA256=${expected}`);
  console.log(`UI_HISTORY_HTTP=${status}`);
  console.log('UI_HISTORY_DEPLOYMENT=OK');
} catch (error) {
  if (installed) {
    fs.copyFileSync(path.join(backup, 'shadowMonitor.ts'), source);
    fs.rmSync(dist, { recursive: true, force: true });
    fs.cpSync(path.join(backup, 'dist'), dist, { recursive: true });
    try { run('pm2', ['restart', 'zeroscreen']); } catch (_) {}
  }
  throw error;
}
