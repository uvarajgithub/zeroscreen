#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const strict = process.argv.includes('--strict');

function globToRegex(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function loadExcludePatterns() {
  const settingsPath = path.join(root, '.vscode', 'settings.json');
  if (!fs.existsSync(settingsPath)) return [];
  const raw = fs.readFileSync(settingsPath, 'utf8');
  const json = JSON.parse(raw);
  const map = (json['files.exclude'] || {});
  return Object.entries(map)
    .filter(([, enabled]) => enabled === true)
    .map(([pattern]) => pattern)
    .filter((p) => !p.includes('/'));
}

function isExcluded(name, patterns) {
  return patterns.some((p) => globToRegex(p).test(name));
}

const alwaysVisible = new Set([
  '.env',
  '.gitignore',
  'README.md',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'server.ts',
  'server_zs.ts',
  'amina-live.ts',
  'order.ts',
  'order_vps.ts',
  'index_vps.ts',
  'db.ts',
  'drishti_strategy.ts',
  'mailer.ts',
  'nse.ts',
  'scheduler.ts',
  'scraper.ts',
  'style.css',
  'server.ts.bak'
]);

const excludePatterns = loadExcludePatterns();
const files = fs.readdirSync(root)
  .filter((n) => fs.statSync(path.join(root, n)).isFile())
  .sort();

const visible = files.filter((f) => !isExcluded(f, excludePatterns));
const unexpectedVisible = visible.filter((f) => !alwaysVisible.has(f));

console.log('Visible root files scan');
console.log(`TOTAL_ROOT_FILES=${files.length}`);
console.log(`VISIBLE_AFTER_EXCLUDES=${visible.length}`);
console.log(`UNEXPECTED_VISIBLE=${unexpectedVisible.length}`);

if (visible.length) {
  console.log('\nvisible files:');
  visible.forEach((f) => console.log(`- ${f}`));
}

if (!strict) process.exit(0);

if (!unexpectedVisible.length) {
  console.log('\nVisible root strict check: PASS');
  process.exit(0);
}

console.log('\nVisible root strict check: FAIL');
console.log('unexpected visible files:');
unexpectedVisible.forEach((f) => console.log(`- ${f}`));
process.exit(1);
