const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const secretKeys = new Set([
  'ACCESS_TOKEN', 'API_KEY', 'API_SECRET', 'BOT_API_KEY', 'FAST2SMS_API_KEY',
  'GOOGLE_CLIENT_SECRET', 'SESSION_SECRET', 'TELEGRAM_BOT_TOKEN',
  'ZERODHA_PASSWORD', 'ZERODHA_TOTP_SECRET', 'TRADEOPS_DEBUG_SECRET',
]);
const files = new Set();
for (const name of fs.readdirSync('/root/.pm2')) {
  if (name.startsWith('dump.pm2')) files.add(path.join('/root/.pm2', name));
}
for (const name of fs.readdirSync('/root/deploy-backups')) {
  const full = path.join('/root/deploy-backups', name);
  if (name.startsWith('readiness-')) {
    const dump = path.join(full, 'pm2/dump.pm2');
    if (fs.existsSync(dump)) files.add(dump);
  } else if (name.startsWith('pm2-before-secret-sanitize-') && name.endsWith('.pm2')) {
    files.add(full);
  }
}

function scrub(value) {
  let removed = 0;
  if (Array.isArray(value)) {
    for (const item of value) removed += scrub(item);
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (secretKeys.has(key)) {
        delete value[key];
        removed += 1;
      } else {
        removed += scrub(value[key]);
      }
    }
  }
  return removed;
}
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

let changed = 0;
let removed = 0;
for (const file of files) {
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { continue; }
  const count = scrub(parsed);
  if (count) {
    const temp = `${file}.scrub-${process.pid}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temp, file);
    fs.chmodSync(file, 0o600);
    changed += 1;
    removed += count;
  }
  const readinessRoot = file.match(/^(\/root\/deploy-backups\/readiness-[^/]+)\/pm2\/dump\.pm2$/)?.[1];
  if (readinessRoot) {
    const manifestPath = path.join(readinessRoot, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const row = manifest.files?.find((item) => item.relative === 'pm2/dump.pm2');
      if (row) {
        row.sha256 = sha(file);
        row.bytes = fs.statSync(file).size;
        fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
      }
    }
  }
}

for (const file of files) {
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { continue; }
  const found = [];
  (function inspect(value) {
    if (Array.isArray(value)) return value.forEach(inspect);
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (secretKeys.has(key) && String(child || '') !== '') found.push(key);
      else inspect(child);
    }
  })(parsed);
  if (found.length) throw new Error(`Secret fields remain in ${file}: ${[...new Set(found)].join(',')}`);
}
console.log(`PM2_BACKUP_FILES_CHECKED=${files.size}`);
console.log(`PM2_BACKUP_FILES_CHANGED=${changed}`);
console.log(`PM2_BACKUP_SECRET_FIELDS_REMOVED=${removed}`);
console.log('PM2_BACKUP_SECRET_SCRUB=OK');
