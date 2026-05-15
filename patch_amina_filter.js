// patch_amina_filter.js — removes the re-entry day-open filter from amina-live.ts
const fs = require('fs');
const FILE = '/home/ubuntu/trading-bot/src/amina-live.ts';

let lines = fs.readFileSync(FILE, 'utf8').split('\n');

// Find the "// Re-entry filter" comment line
const filterCommentIdx = lines.findIndex(l => l.includes('// Re-entry filter'));
if (filterCommentIdx < 0) { console.log('ERROR: filter comment not found'); process.exit(1); }

console.log(`Found filter comment at line ${filterCommentIdx + 1}`);

// From that line, find:
//   filterCommentIdx   → "// Re-entry filter"          DELETE
//   +1                 → const reDir ...               KEEP
//   +2                 → const moveFromOpen ...         DELETE
//   +3                 → const moveAgainstRe ...        DELETE
//   +4                 → (blank line)                   DELETE
//   +5                 → if (moveAgainstRe >= 0) {      DELETE
//   then find matching } else { and remove through that line
//   then find the closing } of the else block and remove just that line

// Find "if (moveAgainstRe >= 0)" line
const ifIdx = lines.findIndex((l, i) => i > filterCommentIdx && l.includes('if (moveAgainstRe >= 0)'));
if (ifIdx < 0) { console.log('ERROR: if line not found'); process.exit(1); }
console.log(`Found if block at line ${ifIdx + 1}`);

// Find "} else {" after ifIdx (closes the if, opens else)
const elseIdx = lines.findIndex((l, i) => i > ifIdx && l.trim() === '} else {');
if (elseIdx < 0) { console.log('ERROR: } else { not found'); process.exit(1); }
console.log(`Found } else { at line ${elseIdx + 1}`);

// Find the closing } of the else block
// It's the next line that is exactly "        }" (8 spaces) after elseIdx
let closeElseIdx = -1;
for (let i = elseIdx + 1; i < lines.length; i++) {
  if (lines[i].replace(/\r/, '') === '        }') {
    closeElseIdx = i;
    break;
  }
}
if (closeElseIdx < 0) { console.log('ERROR: closing } of else not found'); process.exit(1); }
console.log(`Found closing } of else at line ${closeElseIdx + 1}`);

// Now build new lines array:
// - Remove: filterCommentIdx (comment)
// - Keep:   filterCommentIdx+1 (reDir declaration)
// - Remove: filterCommentIdx+2 (moveFromOpen)
// - Remove: filterCommentIdx+3 (moveAgainstRe)
// - Remove: filterCommentIdx+4 (blank)
// - Remove: ifIdx through elseIdx (if block + } else {)
// - Keep:   elseIdx+1 ... closeElseIdx-1 (re-entry code) — dedent by 2 spaces
// - Remove: closeElseIdx (closing })

// Also update the telegram message in the re-entry block to remove filter reference
const newLines = [];
for (let i = 0; i < lines.length; i++) {
  // Skip filter comment
  if (i === filterCommentIdx) { newLines.push('        // Re-entry — no filter (backtest shows +Rs 1.64L over 5yr)'); continue; }
  // Skip moveFromOpen, moveAgainstRe, blank before if
  if (i === filterCommentIdx + 2) continue; // moveFromOpen
  if (i === filterCommentIdx + 3) continue; // moveAgainstRe
  if (i === filterCommentIdx + 4 && lines[i].trim() === '') continue; // blank
  // Skip if block through } else {
  if (i >= ifIdx && i <= elseIdx) continue;
  // Fix indentation of else block body (was 10 spaces, now 8)
  if (i > elseIdx && i < closeElseIdx) {
    const fixed = lines[i].replace(/^\r/, '').replace(/^          /, '        ');
    // Remove filter reference in telegram message
    const cleaned = fixed.replace(/\| Filter: .{1,20} \(\$\{moveAgainstRe\.toFixed\(0\)\} pts\)\\n`/, '`');
    newLines.push(cleaned);
    continue;
  }
  // Skip closing } of else
  if (i === closeElseIdx) continue;
  newLines.push(lines[i]);
}

fs.writeFileSync(FILE, newLines.join('\n'), 'utf8');
console.log('✓ Filter removed successfully');
console.log(`  Removed ${lines.length - newLines.length} lines`);

// Verify
const result = fs.readFileSync(FILE, 'utf8');
console.log('moveAgainstRe occurrences remaining:', (result.match(/moveAgainstRe/g) || []).length);
console.log('REENTRY_SKIP occurrences remaining:', (result.match(/REENTRY_SKIP/g) || []).length);
