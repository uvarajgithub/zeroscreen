"use strict";

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const files = fs.readdirSync(root).filter((n) => /^check_.*\.py$/i.test(n)).sort();

function risks(text) {
  if (/runpy\.run_path\(/.test(text) && /['\"]scripts['\"]\s*\/\s*['\"]checks['\"]/.test(text)) {
    return ["wrapper-file"];
  }
  const r = [];
  if (/__file__/.test(text)) r.push("__file__");
  if (/Path\(__file__\)/.test(text)) r.push("Path(__file__)");
  if (/sys\.path/.test(text)) r.push("sys.path");
  if (/\/home\/ubuntu\//.test(text)) r.push("abs-vps-path");
  return r;
}

let wrapper = 0, low = 0, risk = 0;
const riskRows = [];
for (const f of files) {
  const p = path.join(root, f);
  const t = fs.readFileSync(p, "utf8");
  const rr = risks(t);
  if (rr.includes("wrapper-file")) wrapper++;
  else if (rr.length === 0) low++;
  else { risk++; riskRows.push({ f, rr }); }
}

console.log("Root check Python risk scan");
console.log(`Total: ${files.length} | LOW: ${low} | WRAPPER: ${wrapper} | RISK: ${risk}`);
if (riskRows.length) {
  console.log("\nRISK candidates:");
  for (const row of riskRows) console.log(`- ${row.f}: ${row.rr.join(",")}`);
}
