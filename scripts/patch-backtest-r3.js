"use strict";

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const files = [
  "scripts/backtest/bt_5yr_wait.js",
  "scripts/backtest/bt_compare2.js",
  "scripts/backtest/bt_compare_ltp.js",
  "scripts/backtest/bt_compare_reentry.js",
  "scripts/backtest/bt_drishti_5yr.js",
  "scripts/backtest/bt_futures_real.js",
  "scripts/backtest/bt_improve.js",
  "scripts/backtest/bt_improve_premium.js",
  "scripts/backtest/bt_inside_compare.js",
  "scripts/backtest/bt_integrity.js",
  "scripts/backtest/bt_lastweek.js",
  "scripts/backtest/bt_may29_30.js",
  "scripts/backtest/bt_may29_sim.js",
  "scripts/backtest/bt_monthly_summary.js",
  "scripts/backtest/bt_old_logic.js",
  "scripts/backtest/bt_options.js",
  "scripts/backtest/bt_premium.js",
  "scripts/backtest/bt_real_premium_drishti.js",
  "scripts/backtest/bt_reentry_currentonly.js",
  "scripts/backtest/bt_struct_break.js",
  "scripts/backtest/bt_struct_reentry.js"
];

function patchContent(c) {
  c = c.replace(/__dirname/g, "process.cwd()");
  c = c.replace(/require\(['\"]\.\/dist\/src\/([^'\"]+)['\"]\)/g, "require(path.join(process.cwd(), 'dist/src/$1'))");
  c = c.replace(/require\(['\"]\.\/cache\/([^'\"]+)['\"]\)/g, "require(path.join(process.cwd(), 'cache/$1'))");

  const usesPathJoin = c.includes("path.join(process.cwd()");
  const hasPathImport = /require\(['\"]path['\"]\)/.test(c);
  if (usesPathJoin && !hasPathImport) {
    if (c.startsWith("'use strict';\n")) {
      c = c.replace("'use strict';\n", "'use strict';\nconst path = require('path');\n");
    } else if (c.startsWith('"use strict";\n')) {
      c = c.replace('"use strict";\n', '"use strict";\nconst path = require(\'path\');\n');
    } else {
      c = "const path = require('path');\n" + c;
    }
  }
  return c;
}

let patched = 0;
let skipped = 0;
for (const rel of files) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    skipped += 1;
    continue;
  }
  const before = fs.readFileSync(p, "utf8");
  const after = patchContent(before);
  fs.writeFileSync(p, after, "utf8");
  patched += 1;
}

console.log(`patch-backtest-r3: patched=${patched}, skipped=${skipped}`);
