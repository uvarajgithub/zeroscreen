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
  ".vscode",
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
  /^auto_token\.js$/,
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
  /^daily-pnl-log\.json$/,
  /^trades_today\.json$/,
  /^amina-candle-log\.json$/,
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
  /^_.*\.js$/,
  /^backtest_.*\.js$/,
  /^bt_.*\.(js|py)$/,
  /^check_.*\.(js|py)$/,
  /^fix_.*\.py$/,
  /^patch_.*\.py$/,
  /^verify_.*\.py$/,
  /^stats_.*\.py$/,
  /^stats5yr\.py$/,
  /^tmp_.*\.(js|py)$/,
  /^analyze_.*\.js$/,
  /^simulate_.*\.(js|py)$/,
  /^replay_.*\.js$/,
  /^fetch_.*\.js$/,
  /^gen_.*\.(js|py)$/,
  /^probe_.*\.js$/,
  /^find_.*\.py$/,
  /^see_.*\.py$/,
  /^show_.*\.py$/,
  /^add_.*\.py$/,
  /^undo_.*\.py$/,
  /^rename_.*\.py$/,
  /^explain_.*\.py$/,
  /^audit_.*\.js$/,
  /^crash_.*\.js$/,
  /^entry_.*\.js$/,
  /^generate_.*\.js$/,
  /^get_.*\.js$/,
  /^investigate_.*\.js$/,
  /^live_trades_check\.py$/,
  /^may_full\.py$/,
  /^trade_count_.*\.js$/,
  /^trail_sweep\.js$/,
  /^update_cache\.js$/,
  /^validate_.*\.js$/,
  /^why_missed\.js$/,
  /^check_json\.js$/,
  /^check_may_live\d*\.js$/
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
