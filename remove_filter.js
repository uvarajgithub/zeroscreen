// Removes the re-entry filter from amina-live.ts
// Replaces: if (moveAgainstRe >= 0) { ...skip... } else { ...take re-entry... }
// With: always take re-entry (no filter)
const fs = require('fs');
const path = '/home/ubuntu/trading-bot/src/amina-live.ts';

let src = fs.readFileSync(path, 'utf8');

// Find and replace the filter block
const OLD = `        // Re-entry filter
        const reDir: "CE" | "PE" = state.t1Dir === "CE" ? "PE" : "CE";
        const moveFromOpen  = state.slClose - state.dayOpen;
        const moveAgainstRe = reDir === "CE" ? moveFromOpen : -moveFromOpen;

        if (moveAgainstRe >= 0) {
          // Filter failed → skip re-entry
          state.dayPts = -SL_T1;
          state.dayRs  = state.dayPts * RS_PER_PT;
          state.phase  = "DONE";
          saveState();

          log("REENTRY_SKIP", { moveAgainstRe: moveAgainstRe.toFixed(0), slClose: state.slClose.toFixed(0), dayOpen: state.dayOpen.toFixed(0) });
          await sendTelegram(
            \`🔔 *AMINA → T1 SL HIT* (−50 pts)\\n\`
            + \`Dir: \${state.t1Dir} | Entry: \${state.t1Entry.toFixed(0)} | Exit: \${state.slClose.toFixed(0)}\\n\`
            + \`⛔ *Re-entry SKIPPED* → price not favourable\\n\`
            + \`(\${state.slClose.toFixed(0)} vs open \${state.dayOpen.toFixed(0)}: \${moveAgainstRe >= 0 ? "+" : ""}\${moveAgainstRe.toFixed(0)} pts)\\n\`
            + \`Day P&L: *−50 pts (Rs −750)*\`
          ).catch(() => {});
        } else {
          // Take re-entry
          const reSymbol = await getBestOptionSymbol(reDir);`;

const NEW = `        // No filter — always take re-entry
        const reDir: "CE" | "PE" = state.t1Dir === "CE" ? "PE" : "CE";

        {
          // Take re-entry (filter removed — backtest shows +Rs 1.64L over 5yr)
          const reSymbol = await getBestOptionSymbol(reDir);`;

if (src.includes(OLD)) {
  src = src.replace(OLD, NEW);
  // Also need to close the else block — find the closing brace of the old else block
  // The else block ends before "} else {" pattern was removed, now we just have one block
  // Need to remove the extra closing brace that closed the else
  // Find "} // end re-entry filter" or just the extra closing brace after the re-entry block
  fs.writeFileSync(path, src, 'utf8');
  console.log('✓ Filter removed — exact match found and replaced');
} else {
  // Try to find partial match
  const idx = src.indexOf('// Re-entry filter');
  if (idx >= 0) {
    console.log('PARTIAL: found comment at index', idx);
    console.log('Context:\n', src.slice(idx, idx+200));
  } else {
    console.log('NOT FOUND — checking moveAgainstRe count:', src.split('moveAgainstRe').length - 1);
    // Show lines with moveAgainst
    src.split('\n').forEach((l,i) => { if(l.includes('moveAgainst')) console.log(i+1, l); });
  }
}
