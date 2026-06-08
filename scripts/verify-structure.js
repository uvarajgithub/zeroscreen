"use strict";

const fs = require("fs");

const root = process.cwd();
const strict = process.argv.includes("--strict");

const allowedRootNames = new Set([
  ".git",
  ".gitignore",
  ".env",
  "node_modules",
  "dist",
  "src",
  "public",
  "views",
  "scripts",
  "docs",
  "data",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "README.md",
  ".claude",
  ".playwright-mcp",
  ".sixth"
]);

const compatAllowPatterns = [
  /^server(_vps|_zs)?\.(ts|js)$/,
  /^order(_vps)?\.(ts|js)$/,
  /^db\.ts$/,
  /^drishti_strategy\.ts$/,
  /^mailer\.ts$/,
  /^nse\.ts$/,
  /^scheduler\.ts$/,
  /^scraper\.ts$/,
  /^index_vps\.ts$/,
  /^amina-live\.(ts|js)$/,
  /^auto_token_check\.sh$/,
  /^server\.ts\.bak$/,
  /^sessions\.db$/,
  /^zeroscreen\.db$/,
  /^user-settings\.json$/,
  /^5year-backtest-result\.json$/,
  /^real-premium-backtest-result\.json$/,
  /^real-premium-capital-returns\.json$/,
  /^SESSION_\d{4}_\d{2}_\d{2}\.md$/,
  /^CHECKLIST\.md$/,
  /^cloudflared\.exe$/,
  /^ngrok\.exe$/,
  /^plink\.exe$/,
  /^pscp\.exe$/,
  /^icon-\d+\.svg$/,
  /^og-default\.svg$/,
  /^style\.css$/,
  /^.*\.(py|js)$/,
  /^.*\.json$/,
  /^.*\.png$/
];

const entries = fs.readdirSync(root, { withFileTypes: true });

const unexpected = [];
for (const e of entries) {
  const n = e.name;
  if (allowedRootNames.has(n)) continue;
  if (compatAllowPatterns.some((rx) => rx.test(n))) continue;
  unexpected.push(n);
}

if (!unexpected.length) {
  console.log("Structure check: PASS (no unexpected root entries)");
  process.exit(0);
}

console.log("Structure check: WARN");
console.log("Unexpected root entries:");
unexpected.sort().forEach((n) => console.log(`- ${n}`));

if (strict) {
  process.exit(1);
}
process.exit(0);
