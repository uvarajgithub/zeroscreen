"use strict";

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const entries = fs.readdirSync(root, { withFileTypes: true });

const ignoreNames = new Set([
  ".git",
  "node_modules",
  "dist",
  ".claude",
  ".playwright-mcp",
  ".sixth"
]);

function classify(name, isDir) {
  if (isDir) {
    if (["src", "public", "views", "docs", "scripts", "data"].includes(name)) return "canonical-dir";
    return "other-dir";
  }
  if (/^backtest_|^bt_/.test(name)) return "backtest";
  if (/^check_|^verify_|^audit_/.test(name)) return "checks";
  if (/^analyze_|^stats_|^explain_/.test(name)) return "analysis";
  if (/^simulate_|^replay_/.test(name)) return "sim";
  if (/^patch_|^fix_|^tmp_/.test(name)) return "patch-tmp";
  if (/\.py$/i.test(name)) return "python-util";
  if (/\.json$/i.test(name)) return "json-artifact";
  if (/\.png$|\.svg$/i.test(name)) return "media";
  if (["package.json", "package-lock.json", "tsconfig.json", "README.md", ".gitignore", ".env"].includes(name)) return "project-core";
  if (name === "server.ts" || name === "server.js" || name === "server_vps.js" || name === "server_zs.ts") return "server-variant";
  return "other-file";
}

const rows = [];
for (const e of entries) {
  if (ignoreNames.has(e.name)) continue;
  rows.push({
    name: e.name,
    type: e.isDirectory() ? "dir" : "file",
    category: classify(e.name, e.isDirectory())
  });
}

const byCategory = rows.reduce((acc, r) => {
  acc[r.category] = (acc[r.category] || 0) + 1;
  return acc;
}, {});

const totalFiles = rows.filter(r => r.type === "file").length;
const totalDirs = rows.filter(r => r.type === "dir").length;

console.log("ZeroScreen repository inventory");
console.log("Root:", root);
console.log("Files:", totalFiles, "Dirs:", totalDirs);
console.log("\nBy category:");
Object.keys(byCategory)
  .sort((a, b) => byCategory[b] - byCategory[a])
  .forEach(k => console.log(`- ${k}: ${byCategory[k]}`));

const moveHints = {
  backtest: "scripts/backtest/",
  checks: "scripts/checks/",
  analysis: "scripts/analysis/",
  sim: "scripts/sim/",
  "patch-tmp": "scripts/patch/ or scripts/tmp/",
  "python-util": "scripts/checks/ or scripts/analysis/",
  "json-artifact": "data/"
};

const hintRows = rows.filter(r => r.type === "file" && moveHints[r.category]);
if (hintRows.length) {
  console.log("\nSuggested move targets (non-binding):");
  for (const r of hintRows.slice(0, 120)) {
    console.log(`- ${r.name} -> ${moveHints[r.category]}`);
  }
  if (hintRows.length > 120) {
    console.log(`... and ${hintRows.length - 120} more`);
  }
}
