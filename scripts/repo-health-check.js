#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');

const checks = [
  { name: 'Structure strict', cmd: 'node scripts/verify-structure.js --strict' },
  { name: 'Root check JS risk', cmd: 'node scripts/scan-root-check-risk.js' },
  { name: 'Root check Python risk', cmd: 'node scripts/scan-root-check-py-risk.js' },
  { name: 'Root Python wrapper risk', cmd: 'node scripts/scan-root-py-wrapper-risk.js' },
  { name: 'Root backtest risk', cmd: 'node scripts/scan-root-backtest-risk.js' },
  { name: 'Root utility JS risk', cmd: 'node scripts/scan-root-utility-js-risk.js' },
  { name: 'Root TS risk', cmd: 'node scripts/scan-root-ts-risk.js' },
  { name: 'Shadow P&L runtime invariants', cmd: 'node scripts/checks/verify-shadow-pnl-runtime.js' },
  { name: 'Visible root strict', cmd: 'node scripts/scan-visible-root.js --strict' }
];

function runCheck(name, cmd) {
  console.log(`\n=== ${name} ===`);
  const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  process.stdout.write(out.trimEnd() + '\n');
}

try {
  for (const c of checks) runCheck(c.name, c.cmd);
  console.log('\nRepo health check: PASS');
  process.exit(0);
} catch (err) {
  const msg = err && err.stdout ? String(err.stdout) : String(err);
  if (msg.trim()) console.error(msg.trim());
  console.error('\nRepo health check: FAIL');
  process.exit(1);
}
