const fs = require('fs');

const legacyFile = process.argv[2];
const envFile = process.argv[3];
const sanitizedFile = process.argv[4];
if (!legacyFile || !envFile || !sanitizedFile) {
  throw new Error('Usage: node migrate-vps-auth-env.js <legacy-auto-token> <env-file> <sanitized-auto-token>');
}

const legacy = fs.readFileSync(legacyFile, 'utf8');
const specs = [
  ['ZERODHA_USER_ID', /const\s+ZERODHA_USER_ID\s*=\s*['"]([^'"]+)['"]/],
  ['ZERODHA_PASSWORD', /const\s+ZERODHA_PASSWORD\s*=\s*['"]([^'"]+)['"]/],
  ['ZERODHA_TOTP_SECRET', /const\s+TOTP_SECRET\s*=\s*['"]([^'"]+)['"]/],
];
const recovered = {};
for (const [name, pattern] of specs) {
  const match = legacy.match(pattern);
  if (!match?.[1]) throw new Error(`Could not recover ${name} from the legacy file`);
  recovered[name] = match[1];
}

let envText = fs.readFileSync(envFile, 'utf8');
for (const [name] of specs) {
  const line = `${name}=${recovered[name]}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  envText = pattern.test(envText) ? envText.replace(pattern, line) : `${envText.replace(/\s*$/, '\n')}${line}\n`;
}
const tmp = `${envFile}.${process.pid}.tmp`;
fs.writeFileSync(tmp, envText, { mode: 0o600 });
fs.chmodSync(tmp, 0o600);
fs.renameSync(tmp, envFile);
fs.chmodSync(envFile, 0o600);

// Retain a usable rollback copy without retaining the previously embedded secrets.
fs.copyFileSync(sanitizedFile, legacyFile);
fs.chmodSync(legacyFile, 0o600);
console.log('AUTH_ENV_MIGRATION_OK');
