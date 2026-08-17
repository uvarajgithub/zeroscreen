const fs = require('fs');
const { execFileSync } = require('child_process');

// OpenSSH uses the first value it encounters. This file must sort before
// cloud-init's 50-cloud-init.conf, otherwise its PasswordAuthentication=yes
// wins even though a later 99-* file says no.
const target = '/etc/ssh/sshd_config.d/00-zeroscreen-key-only.conf';
const backup = `${target}.backup-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`;
const prior = fs.existsSync(target) ? fs.readFileSync(target) : null;
if (prior) fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);

try {
  fs.writeFileSync(target, [
    '# Managed for ZeroScreen VPS after key-only login verification',
    'PasswordAuthentication no',
    'KbdInteractiveAuthentication no',
    'PermitRootLogin prohibit-password',
    '',
  ].join('\n'), { mode: 0o600 });
  execFileSync('/usr/sbin/sshd', ['-t'], { stdio: 'pipe' });
  execFileSync('systemctl', ['reload', 'ssh'], { stdio: 'pipe' });
  console.log('SSH_KEY_ONLY_HARDENING=OK');
  console.log(`SSH_CONFIG_BACKUP=${prior ? backup : 'not-needed'}`);
} catch (error) {
  if (prior) fs.writeFileSync(target, prior, { mode: 0o600 });
  else fs.rmSync(target, { force: true });
  try { execFileSync('systemctl', ['reload', 'ssh'], { stdio: 'ignore' }); } catch (_) {}
  throw error;
}
