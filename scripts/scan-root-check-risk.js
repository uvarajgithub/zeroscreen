"use strict";

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const entries = fs.readdirSync(root).filter((n) => /^check_.*\.js$/i.test(n)).sort();

if (!entries.length) {
  console.log("No root check_*.js files found.");
  process.exit(0);
}

function collectRisks(text) {
  if (/Compatibility wrapper; real script moved to scripts\/checks\./.test(text)) {
    return ["wrapper-file"];
  }
  const risks = [];
  if (/__dirname/.test(text)) risks.push("__dirname");
  if (/require\(['"]\.\//.test(text)) risks.push("require-relative");
  if (/\.\/dist\/|dist\/src/.test(text)) risks.push("dist-relative");
  if (/\.\/cache\/|cache\//.test(text)) risks.push("cache-relative");
  if (/\/home\/ubuntu\//.test(text)) risks.push("abs-vps-path");
  if (/sqlite3\s/.test(text)) risks.push("sqlite3-cli");
  return risks;
}

const out = [];
for (const file of entries) {
  const full = path.join(root, file);
  const text = fs.readFileSync(full, "utf8");
  const risks = collectRisks(text);
  out.push({ file, risks, level: risks.length ? "RISK" : "LOW" });
}

const low = out.filter((r) => r.level === "LOW");
const wrappers = out.filter((r) => r.risks.includes("wrapper-file"));
const risk = out.filter((r) => r.level === "RISK" && !r.risks.includes("wrapper-file"));

console.log("Root check script risk scan");
console.log(`Total: ${out.length} | LOW: ${low.length} | WRAPPER: ${wrappers.length} | RISK: ${risk.length}`);

if (low.length) {
  console.log("\nLOW candidates:");
  for (const r of low) console.log(`- ${r.file}`);
}

if (risk.length) {
  console.log("\nRISK candidates:");
  for (const r of risk) console.log(`- ${r.file}: ${r.risks.join(",")}`);
}
