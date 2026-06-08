#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = fs.readdirSync(root).filter((n) => fs.statSync(path.join(root, n)).isFile()).sort();

function readHead(file, lines = 10) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  return content.split(/\r?\n/).slice(0, lines).join('\n');
}

function isJsWrapper(file) {
  if (!file.endsWith('.js')) return false;
  const head = readHead(file, 12);
  return /Compatibility wrapper/.test(head) && /require\(['"]\.\/scripts\//.test(head);
}

function isPyWrapper(file) {
  if (!file.endsWith('.py')) return false;
  const head = readHead(file, 12);
  return /runpy\.run_path\(/.test(head) && /['"]scripts['"]/.test(head);
}

function classify(file) {
  if (isJsWrapper(file) || isPyWrapper(file)) return 'compat-wrapper';
  if (/\.(json|png|svg|db)$/.test(file)) return 'artifact-or-asset';
  if (/\.(exe|sh)$/.test(file)) return 'tooling-binary-script';
  if (['README.md', 'CHECKLIST.md'].includes(file) || /^SESSION_\d{4}_\d{2}_\d{2}\.md$/.test(file)) return 'docs';
  if (['server.ts', 'server_zs.ts', 'amina-live.ts', 'order.ts', 'order_vps.ts', 'index_vps.ts'].includes(file)) return 'core-runtime-ts';
  if (['db.ts', 'drishti_strategy.ts', 'mailer.ts', 'nse.ts', 'scheduler.ts', 'scraper.ts'].includes(file)) return 'root-ts-wrapper';
  if (/\.(ts|js|py)$/.test(file)) return 'other-code-root';
  return 'other';
}

const buckets = new Map();
for (const f of files) {
  const k = classify(f);
  if (!buckets.has(k)) buckets.set(k, []);
  buckets.get(k).push(f);
}

console.log('Root file audit');
console.log(`TOTAL=${files.length}`);
for (const key of [...buckets.keys()].sort()) {
  const arr = buckets.get(key);
  console.log(`${key}: ${arr.length}`);
}

const show = (key, max = 30) => {
  const arr = buckets.get(key) || [];
  if (!arr.length) return;
  console.log(`\n${key} (sample ${Math.min(arr.length, max)}):`);
  arr.slice(0, max).forEach((f) => console.log(`- ${f}`));
};

show('artifact-or-asset', 120);
show('tooling-binary-script', 120);
show('docs', 120);
show('other-code-root', 80);
