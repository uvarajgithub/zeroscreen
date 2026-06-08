#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = fs
  .readdirSync(root)
  .filter((f) => f.endsWith('.ts') && fs.statSync(path.join(root, f)).isFile())
  .sort();

const coreIgnoredRationale = {
  'amina-live.ts': 'live-bot runtime entrypoint',
  'index_vps.ts': 'live-bot VPS runtime integration',
  'order.ts': 'broker/order execution module',
  'order_vps.ts': 'VPS-specific order integration',
  'server.ts': 'primary web runtime entrypoint',
  'server_zs.ts': 'alternate production server entrypoint'
};
const coreIgnored = new Set(Object.keys(coreIgnoredRationale));

function reasonsFor(content) {
  const reasons = [];
  if (/from\s+['"]\.\//.test(content) || /require\(['"]\.\//.test(content)) reasons.push('relative-import');
  if (/__dirname/.test(content)) reasons.push('__dirname');
  if (/node-cron|cron\.schedule/.test(content)) reasons.push('scheduler-coupling');
  if (/sqlite3|zeroscreen\.db|Database\(/.test(content)) reasons.push('db-coupling');
  if (/https?|fetchUrl|getHistoricalData|kiteconnect/i.test(content)) reasons.push('network-coupling');
  return reasons;
}

function isCompatWrapper(content) {
  const hasCompatComment = /Compatibility wrapper/.test(content);
  const hasReExport = /export\s+\*\s+from\s+['"]\.\/src\//.test(content);
  return hasCompatComment && hasReExport;
}

const rows = [];
for (const f of files) {
  if (coreIgnored.has(f)) {
    rows.push({ file: f, bucket: 'CORE_IGNORED', reasons: [] });
    continue;
  }

  const content = fs.readFileSync(path.join(root, f), 'utf8');
  if (isCompatWrapper(content)) {
    rows.push({ file: f, bucket: 'WRAPPER_IGNORED', reasons: [] });
    continue;
  }
  const reasons = reasonsFor(content);
  const bucket = reasons.length === 0 ? 'LOW' : 'RISK';
  rows.push({ file: f, bucket, reasons });
}

const count = (b) => rows.filter((r) => r.bucket === b).length;
console.log('Root TypeScript risk scan');
console.log(
  `Total: ${rows.length} | LOW: ${count('LOW')} | RISK: ${count('RISK')} | CORE_IGNORED: ${count('CORE_IGNORED')} | WRAPPER_IGNORED: ${count('WRAPPER_IGNORED')}`
);

const risk = rows.filter((r) => r.bucket === 'RISK');
if (risk.length) {
  console.log('\nRISK candidates:');
  for (const r of risk) {
    console.log(`- ${r.file}: ${r.reasons.join(', ')}`);
  }
}

const core = rows.filter((r) => r.bucket === 'CORE_IGNORED');
if (core.length) {
  console.log('\nCORE_IGNORED files:');
  for (const r of core) {
    const why = coreIgnoredRationale[r.file] || 'core runtime coupling';
    console.log(`- ${r.file}: ${why}`);
  }
}

const low = rows.filter((r) => r.bucket === 'LOW');
if (low.length) {
  console.log('\nLOW candidates:');
  for (const r of low) {
    console.log(`- ${r.file}`);
  }
}
