#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = fs
  .readdirSync(root)
  .filter((f) => f.endsWith('.py') && fs.statSync(path.join(root, f)).isFile())
  .sort();

function classify(content) {
  const hasRunpy = /runpy\.run_path\(/.test(content);
  const hasScriptsPath = /['"]scripts['"]/.test(content);
  const isWrapper = hasRunpy && hasScriptsPath;
  return isWrapper ? 'WRAPPER' : 'RISK';
}

const rows = files.map((f) => {
  const content = fs.readFileSync(path.join(root, f), 'utf8');
  return { file: f, bucket: classify(content) };
});

const count = (b) => rows.filter((r) => r.bucket === b).length;
console.log('Root Python wrapper scan');
console.log(`Total: ${rows.length} | WRAPPER: ${count('WRAPPER')} | RISK: ${count('RISK')}`);

const risk = rows.filter((r) => r.bucket === 'RISK');
if (risk.length) {
  console.log('\nRISK candidates:');
  for (const r of risk) {
    console.log(`- ${r.file}`);
  }
}
