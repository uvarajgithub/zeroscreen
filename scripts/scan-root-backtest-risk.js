"use strict";

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const files = fs.readdirSync(root)
  .filter((n) => /^backtest_.*\.js$/i.test(n) || /^bt_.*\.js$/i.test(n))
  .sort();

function getRisks(text) {
  if (/Compatibility wrapper; real script moved to scripts\/backtest\./.test(text)) {
    return ["wrapper-file"];
  }
  const risks = [];
  if (/__dirname/.test(text)) risks.push("__dirname");
  if (/require\(['\"]\.\//.test(text)) risks.push("require-relative");
  if (/\.\/dist\/|dist\/src/.test(text)) risks.push("dist-relative");
  if (/\/home\/ubuntu\//.test(text)) risks.push("abs-vps-path");
  return risks;
}

const low = [];
const risk = [];
const wrappers = [];
for (const f of files) {
  const text = fs.readFileSync(path.join(root, f), "utf8");
  const r = getRisks(text);
  if (r.includes("wrapper-file")) wrappers.push(f);
  else if (r.length === 0) low.push(f);
  else risk.push({ file: f, risks: r });
}

console.log("Root backtest risk scan");
console.log(`Total: ${files.length} | LOW: ${low.length} | WRAPPER: ${wrappers.length} | RISK: ${risk.length}`);
console.log("\nLOW candidates:");
for (const f of low) console.log(`- ${f}`);
console.log("\nRISK candidates:");
for (const x of risk) console.log(`- ${x.file}: ${x.risks.join(",")}`);
