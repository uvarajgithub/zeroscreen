"use strict";

const fs = require("fs");

const root = process.cwd();
const names = fs.readdirSync(root).filter((n) => n.endsWith(".js")).sort();

function isWrapper(text) {
  return text.includes("Compatibility wrapper; real script moved to scripts/");
}

function risks(text) {
  const r = [];
  if (/__dirname/.test(text)) r.push("__dirname");
  if (/require\(['\"]\.\//.test(text)) r.push("require-relative");
  if (/\.\/dist\/|dist\/src/.test(text)) r.push("dist-relative");
  if (/\.\/cache\/|cache\//.test(text)) r.push("cache-relative");
  if (/\/home\/ubuntu\//.test(text)) r.push("abs-vps-path");
  return r;
}

const coreKeep = new Set([
  "server.js",
  "server_vps.js",
  "amina-live.js",
  "order.js",
  "auto_token.js"
]);

let wrapper = 0;
const candidates = [];
for (const n of names) {
  const t = fs.readFileSync(n, "utf8");
  if (isWrapper(t)) {
    wrapper += 1;
    continue;
  }
  if (coreKeep.has(n)) continue;
  if (/^check_.*\.js$/i.test(n)) continue;
  if (/^backtest_.*\.js$/i.test(n) || /^bt_.*\.js$/i.test(n)) continue;
  if (/^analyze_.*\.js$/i.test(n)) continue;
  if (/^tmp_.*\.js$/i.test(n)) continue;
  candidates.push({ file: n, risks: risks(t) });
}

const low = candidates.filter((x) => x.risks.length === 0);
const risk = candidates.filter((x) => x.risks.length > 0);

console.log("Root utility JS risk scan");
console.log(`Candidates: ${candidates.length} | LOW: ${low.length} | RISK: ${risk.length} | WRAPPER_IGNORED: ${wrapper}`);

if (low.length) {
  console.log("\nLOW candidates:");
  for (const x of low) console.log(`- ${x.file}`);
}
if (risk.length) {
  console.log("\nRISK candidates:");
  for (const x of risk) console.log(`- ${x.file}: ${x.risks.join(",")}`);
}
