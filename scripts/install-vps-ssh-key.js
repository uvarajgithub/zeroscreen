const fs = require('fs');
const path = require('path');

const stagedKey = '/tmp/zeroscreen-vps-ed25519.pub';
const sshDir = '/root/.ssh';
const authorizedKeys = path.join(sshDir, 'authorized_keys');
const key = fs.readFileSync(stagedKey, 'utf8').trim();

if (!/^ssh-ed25519\s+[A-Za-z0-9+/=]+(?:\s+.*)?$/.test(key)) {
  throw new Error('Staged public key is not a valid Ed25519 public key');
}

fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
fs.chmodSync(sshDir, 0o700);
const existing = fs.existsSync(authorizedKeys) ? fs.readFileSync(authorizedKeys, 'utf8') : '';
if (!existing.split(/\r?\n/).some((line) => line.trim() === key)) {
  fs.appendFileSync(authorizedKeys, `${existing && !existing.endsWith('\n') ? '\n' : ''}${key}\n`, { mode: 0o600 });
}
fs.chmodSync(authorizedKeys, 0o600);
fs.unlinkSync(stagedKey);
console.log('SSH_PUBLIC_KEY_INSTALLED=OK');
