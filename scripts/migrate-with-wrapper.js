"use strict";

const fs = require("fs");
const path = require("path");

function usage() {
  console.log("Usage: node scripts/migrate-with-wrapper.js <targetDir> <file1> [file2 ...]");
  console.log("Example: node scripts/migrate-with-wrapper.js scripts/checks check_demo.js");
}

const [, , targetDirArg, ...files] = process.argv;
if (!targetDirArg || files.length === 0) {
  usage();
  process.exit(1);
}

const root = process.cwd();
const targetDir = path.join(root, targetDirArg);
fs.mkdirSync(targetDir, { recursive: true });

let moved = 0;
let skipped = 0;

for (const file of files) {
  const src = path.join(root, file);
  if (!fs.existsSync(src)) {
    console.log(`[SKIP] Not found: ${file}`);
    skipped += 1;
    continue;
  }

  const dst = path.join(targetDir, path.basename(file));
  if (fs.existsSync(dst)) {
    console.log(`[SKIP] Destination exists: ${path.relative(root, dst)}`);
    skipped += 1;
    continue;
  }

  fs.renameSync(src, dst);

  const rel = "./" + path.relative(root, dst).replace(/\\/g, "/");
  const wrapper = [
    "'use strict';",
    `// Compatibility wrapper; real script moved to ${targetDirArg.replace(/\\/g, "/")}.`,
    `require('${rel}');`,
    ""
  ].join("\n");

  fs.writeFileSync(src, wrapper, "utf8");
  console.log(`[MOVED] ${file} -> ${path.relative(root, dst)}`);
  moved += 1;
}

console.log(`Done. moved=${moved}, skipped=${skipped}`);
