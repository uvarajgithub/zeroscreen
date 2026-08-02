const fs = require('fs');
const { execFileSync } = require('child_process');

const sensitive = /(TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY|TOTP)/i;
const list = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
for (const process of list) {
  const env = process.pm2_env?.env || {};
  const keys = Object.keys(env).filter((key) => sensitive.test(key) && String(env[key] || '') !== '');
  console.log(JSON.stringify({ name: process.name, status: process.pm2_env?.status, script: process.pm2_env?.pm_exec_path, cwd: process.pm2_env?.pm_cwd, sensitiveKeys: keys.sort() }));
}
const dumpPath = '/root/.pm2/dump.pm2';
if (fs.existsSync(dumpPath)) {
  const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
  for (const process of dump) {
    const keys = Object.keys(process.env || {}).filter((key) => sensitive.test(key) && String(process.env[key] || '') !== '');
    console.log(JSON.stringify({ dumpName: process.name, sensitiveKeys: keys.sort() }));
  }
}
