"use strict";

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const files = process.argv.slice(2);

if (files.length === 0) {
  console.log("Usage: node scripts/patch-utility-js-paths.js <file1> [file2 ...]");
  process.exit(1);
}

function ensurePathRequire(src) {
  if (/require\(['\"]path['\"]\)/.test(src)) return src;
  if (src.startsWith("'use strict';\n")) {
    return src.replace("'use strict';\n", "'use strict';\nconst path = require('path');\n");
  }
  if (src.startsWith('"use strict";\n')) {
    return src.replace('"use strict";\n', '"use strict";\nconst path = require(\'path\');\n');
  }
  return "const path = require('path');\n" + src;
}

let patched = 0;
for (const rel of files) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.log(`[SKIP] ${rel} not found`);
    continue;
  }

  let src = fs.readFileSync(p, "utf8");
  const before = src;

  // Convert common absolute VPS path anchors to cwd-relative anchors.
  src = src.replace(/['\"]\/home\/ubuntu\/trading-bot\//g, "path.join(process.cwd(), '");
  src = src.replace(/['\"]\/root\/zeroscreen\//g, "path.join(process.cwd(), '");

  // Fix trailing quote and slash for replaced absolute anchors.
  src = src.replace(/path\.join\(process\.cwd\(\), '([^'\"]+?)['\"]\)/g, "path.join(process.cwd(), '$1')");

  // Rewrite common relative requires from moved script location.
  src = src.replace(/require\(['\"]\.\/dist\/src\/([^'\"]+)['\"]\)/g, "require(path.join(process.cwd(), 'dist/src/$1'))");
  src = src.replace(/require\(['\"]\.\/cache\/([^'\"]+)['\"]\)/g, "require(path.join(process.cwd(), 'cache/$1'))");

  // Rewrite __dirname usage.
  src = src.replace(/__dirname/g, "process.cwd()");

  if (/path\.join\(process\.cwd\(\)/.test(src)) {
    src = ensurePathRequire(src);
  }

  if (src !== before) {
    fs.writeFileSync(p, src, "utf8");
    patched += 1;
    console.log(`[PATCH] ${rel}`);
  } else {
    console.log(`[NOOP] ${rel}`);
  }
}

console.log(`Done. patched=${patched}`);
