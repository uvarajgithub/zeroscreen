const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const failures = [];
const requireMatch = (value, pattern, message) => {
  if (!pattern.test(value)) failures.push(message);
};
const rejectMatch = (value, pattern, message) => {
  if (pattern.test(value)) failures.push(message);
};

const tokenScript = read('auto_token.js');
const sourceServer = read('src/server.ts');
const distServer = read('dist/server.js');
const docs = [read('README.md'), read('docs/session/SESSION_2026_06_03.md')].join('\n');

requireMatch(tokenScript, /const ZERODHA_USER_ID\s*=\s*process\.env\.ZERODHA_USER_ID;/, 'Zerodha user ID must come from the environment');
requireMatch(tokenScript, /const ZERODHA_PASSWORD\s*=\s*process\.env\.ZERODHA_PASSWORD;/, 'Zerodha password must come from the environment');
requireMatch(tokenScript, /const TOTP_SECRET\s*=\s*process\.env\.ZERODHA_TOTP_SECRET;/, 'TOTP secret must come from the environment');
rejectMatch(tokenScript, /const\s+(?:ZERODHA_PASSWORD|TOTP_SECRET)\s*=\s*['"][^'"]+['"]/, 'Authentication secret is hard-coded');
rejectMatch(tokenScript, /(?:Request|Access) token[^\n]*\.slice\s*\(/i, 'A token prefix is logged');
rejectMatch(tokenScript, /Submitting TOTP[^\n]*(?:otp|generateTOTP)/i, 'A TOTP value is logged');
rejectMatch(tokenScript, /(?:Body|Location|Response)\s*:\s*\$\{/i, 'Raw authentication response data is logged');
rejectMatch(docs, /\s-pw\s+["'](?!<VPS_PASSWORD>)[^"']+["']/i, 'Documentation contains a plaintext command-line password');

for (const [name, server] of [['src/server.ts', sourceServer], ['dist/server.js', distServer]]) {
  requireMatch(server, /request_token\|access_token\|token\|checksum\|session_id/, `${name} does not redact authentication URL parameters`);
  requireMatch(server, /password\|passwd\|totp\|otp\|api_secret\|totp_secret\|cookie\|set-cookie/, `${name} does not redact credential fields`);
  requireMatch(server, /REDACTED_AUTH/, `${name} does not redact authorization blobs`);
}

const runtimeSanitizerSource = distServer.match(/function tradeOpsSanitizeLog\(value\) \{[\s\S]*?\n\}/)?.[0];
if (!runtimeSanitizerSource) {
  failures.push('Could not load the runtime log sanitizer');
} else {
  const sanitize = Function(`${runtimeSanitizerSource}; return tradeOpsSanitizeLog;`)();
  const samples = [
    ['https://example.test/callback?request_token=dummyRequest123&checksum=dummyChecksum456', ['dummyRequest123', 'dummyChecksum456']],
    ['password=dummyPassword123 totp:123456 api_secret=dummyApiSecret123', ['dummyPassword123', '123456', 'dummyApiSecret123']],
    ['Authorization: Bearer dummyBearerToken12345', ['dummyBearerToken12345']],
    ['set-cookie: session=dummyCookieValue123', ['dummyCookieValue123']],
  ];
  for (const [sample, secrets] of samples) {
    const sanitized = sanitize(sample);
    if (secrets.some((secret) => sanitized.includes(secret))) {
      failures.push('Runtime sanitizer leaked a representative authentication value');
      break;
    }
  }
}

if (fs.existsSync(path.join(root, 'scripts', 'tmp-ssh-askpass.cmd'))) {
  failures.push('Temporary SSH askpass credential helper still exists');
}

if (failures.length) {
  console.error(`AUTH_REDACTION_FAILED (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('AUTH_REDACTION_OK');
