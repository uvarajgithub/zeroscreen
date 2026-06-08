#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const [, , targetDir, ...files] = process.argv;

if (!targetDir || files.length === 0) {
  console.log('Usage: node scripts/migrate-py-with-wrapper.js <targetDir> <file1.py> [file2.py ...]');
  console.log('Example: node scripts/migrate-py-with-wrapper.js scripts/analysis stats5yr.py');
  process.exit(1);
}

const root = process.cwd();
const destBase = path.resolve(root, targetDir);
fs.mkdirSync(destBase, { recursive: true });

function buildWrapper(targetRelPath) {
  const parts = targetRelPath.split(/[\\/]+/).filter(Boolean);
  const pyPathExpr = parts.map((p) => ` / '${p}'`).join('');
  return [
    '#!/usr/bin/env python3',
    'import runpy',
    'from pathlib import Path',
    `runpy.run_path(Path(__file__).resolve().parent${pyPathExpr}, run_name='__main__')`,
    ''
  ].join('\n');
}

let moved = 0;
let skipped = 0;

for (const file of files) {
  const src = path.resolve(root, file);
  const baseName = path.basename(file);

  if (path.extname(baseName).toLowerCase() !== '.py') {
    console.log(`[SKIP] ${file} (not a .py file)`);
    skipped++;
    continue;
  }

  if (!fs.existsSync(src)) {
    console.log(`[SKIP] ${file} (not found)`);
    skipped++;
    continue;
  }

  const dest = path.join(destBase, baseName);
  if (fs.existsSync(dest)) {
    console.log(`[SKIP] ${file} (destination exists: ${path.relative(root, dest)})`);
    skipped++;
    continue;
  }

  fs.renameSync(src, dest);

  const wrapperTargetRel = path.relative(root, dest).split(path.sep).join('/');
  fs.writeFileSync(src, buildWrapper(wrapperTargetRel), 'utf8');
  console.log(`[MOVED] ${file} -> ${path.relative(root, dest)}`);
  moved++;
}

console.log(`Done. moved=${moved}, skipped=${skipped}`);
