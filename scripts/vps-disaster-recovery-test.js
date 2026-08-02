const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
const backupRoot = `/root/deploy-backups/readiness-${stamp}`;
const restoreRoot = `/tmp/zeroscreen-restore-test-${process.pid}`;
const files = [
  ['/home/ubuntu/trading-bot/src/index.ts', 'trading-bot/src/index.ts'],
  ['/home/ubuntu/trading-bot/src/order.ts', 'trading-bot/src/order.ts'],
  ['/home/ubuntu/trading-bot/dist/src/index.js', 'trading-bot/dist/src/index.js'],
  ['/home/ubuntu/trading-bot/dist/src/order.js', 'trading-bot/dist/src/order.js'],
  ['/home/ubuntu/trading-bot/auto_token.js', 'trading-bot/auto_token.js'],
  ['/root/zeroscreen/src/server.ts', 'zeroscreen/src/server.ts'],
  ['/root/zeroscreen/dist/server.js', 'zeroscreen/dist/server.js'],
  ['/root/.pm2/dump.pm2', 'pm2/dump.pm2'],
];

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function copy(source, destination) {
  if (!fs.existsSync(source)) throw new Error(`Required recovery source is missing: ${source}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(destination, 0o600);
}

try {
  fs.mkdirSync(backupRoot, { recursive: false, mode: 0o700 });
  const manifest = [];
  for (const [source, relative] of files) {
    const destination = path.join(backupRoot, relative);
    copy(source, destination);
    manifest.push({ relative, sha256: sha(destination), bytes: fs.statSync(destination).size });
  }
  fs.writeFileSync(path.join(backupRoot, 'manifest.json'), `${JSON.stringify({ createdAt: new Date().toISOString(), secretsIncluded: false, files: manifest }, null, 2)}\n`, { mode: 0o600, flag: 'wx' });

  fs.mkdirSync(restoreRoot, { recursive: false, mode: 0o700 });
  for (const row of manifest) {
    const source = path.join(backupRoot, row.relative);
    const restored = path.join(restoreRoot, row.relative);
    copy(source, restored);
    if (sha(restored) !== row.sha256) throw new Error(`Restore checksum mismatch: ${row.relative}`);
  }
  for (const relative of ['trading-bot/dist/src/index.js', 'trading-bot/dist/src/order.js', 'trading-bot/auto_token.js', 'zeroscreen/dist/server.js']) {
    execFileSync(process.execPath, ['--check', path.join(restoreRoot, relative)], { stdio: 'pipe', timeout: 30000 });
  }
  JSON.parse(fs.readFileSync(path.join(restoreRoot, 'pm2/dump.pm2'), 'utf8'));
  console.log(`RECOVERY_BACKUP=${backupRoot}`);
  console.log(`RECOVERY_FILES=${manifest.length}`);
  console.log('RECOVERY_CHECKSUMS=OK');
  console.log('RECOVERY_RUNTIME_SYNTAX=OK');
  console.log('DISASTER_RECOVERY_TEST=OK');
} catch (error) {
  console.error(`DISASTER_RECOVERY_TEST=FAILED:${error.message}`);
  process.exitCode = 1;
} finally {
  const resolved = path.resolve(restoreRoot);
  if (resolved.startsWith('/tmp/zeroscreen-restore-test-')) fs.rmSync(resolved, { recursive: true, force: true });
}
