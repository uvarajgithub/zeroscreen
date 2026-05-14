#!/usr/bin/env python3
"""Fix two bugs in trading bot:
1. TRAIL "Done for Day" unmatched asterisk (causes Telegram to silently drop messages)
2. LOCK50 Old duplicate trade rows (block 2 already adds rows, block 4 re-adds them)
"""

path = '/home/ubuntu/trading-bot/dist/src/index.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# ── Fix 1: Unmatched * in TRAIL Done for Day ──────────────────────────────────
# Bug: `≡ƒôè ${_shSign}${shadowPnL.toFixed(0)} pts*` (no opening *)
# Fix: `≡ƒôè *${_shSign}${shadowPnL.toFixed(0)} pts*`

OLD1 = r"trailCtx = `\u2705 *TRAIL*  \u00b7  Done for Day\n\U0001f4c8 ${_shSign}${shadowPnL.toFixed(0)} pts*  \u00b7  ${shadowWins}W ${shadowLosses}L  \u00b7  T:${shadowTrades}/5`;"

# Use raw byte-level search because of emoji/unicode
SEARCH1 = 'trailCtx = `\u2705 *TRAIL*  \u00b7  Done for Day\\n\U0001f4c8 ${_shSign}${shadowPnL.toFixed(0)} pts*  \u00b7  ${shadowWins}W ${shadowLosses}L  \u00b7  T:${shadowTrades}/5`;'
REPLACE1 = 'trailCtx = `\u2705 *TRAIL*  \u00b7  Done for Day\\n\U0001f4c8 *${_shSign}${shadowPnL.toFixed(0)} pts*  \u00b7  ${shadowWins}W ${shadowLosses}L  \u00b7  T:${shadowTrades}/5`;'

if SEARCH1 in content:
    content = content.replace(SEARCH1, REPLACE1, 1)
    print("Fix 1 applied: TRAIL Done for Day unmatched asterisk fixed")
else:
    # Try alternate encoding
    import re
    # Search using regex to handle unicode variations
    pat1 = r"(trailCtx = `[^\n]*Done for Day\\n[^\n]*) pts\*  \\u00b7  \$\{shadowWins\}"
    m = re.search(pat1, content)
    if m:
        print(f"Fix 1 regex found at: {m.group(0)[:80]}")
    else:
        # Try grepping line
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if 'Done for Day' in line and 'trailCtx' in line:
                print(f"Found at line {i+1}: {line[:120]}")
                if 'pts*  ' in line and '*${_shSign}' not in line:
                    lines[i] = line.replace(
                        'pts*  \u00b7  ${shadowWins}',
                        'pts*  \u00b7  ${shadowWins}'
                    )
                    # Actually fix the missing opening *
                    # The pattern is: `...pts*  ·  ${shadowWins}...`
                    # We need: `...*${_shSign}${shadowPnL.toFixed(0)} pts*...`
                    # Find the part that needs the opening *
                    import re as re2
                    fixed = re2.sub(
                        r'(\n\\n)(📈 )(\$\{_shSign\})',
                        r'\1\2*\3',
                        lines[i]
                    )
                    if fixed != lines[i]:
                        lines[i] = fixed
                        content = '\n'.join(lines)
                        print("Fix 1 applied via line edit")
                    else:
                        print("Fix 1: Could not apply via line edit")
                break
        else:
            print("Fix 1 ERROR: Could not find TRAIL Done for Day line")

# ── Fix 2: LOCK50 Old duplicate trade rows ────────────────────────────────────
# When NOT in trade but scalp1TradeLog.length > 0, block 2 already adds trade rows.
# Block 4 then re-adds them. Fix: only run block 4 when lock50ShadowState.inTrade.

SEARCH2 = '            // Append per-trade rows to LOCK50 Old (same as TICK TRAIL)\n            if (scalp1TradeLog.length > 0) {'
REPLACE2 = '            // Append per-trade rows to LOCK50 Old (only when in-trade; else-if block already adds rows when not in trade)\n            if (lock50ShadowState.inTrade && scalp1TradeLog.length > 0) {'

if SEARCH2 in content:
    content = content.replace(SEARCH2, REPLACE2, 1)
    print("Fix 2 applied: LOCK50 Old duplicate rows fixed")
else:
    # Try without leading spaces
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if 'Append per-trade rows to LOCK50 Old' in line:
            # Next line should be the if condition
            if i+1 < len(lines) and 'if (scalp1TradeLog.length > 0)' in lines[i+1]:
                lines[i+1] = lines[i+1].replace(
                    'if (scalp1TradeLog.length > 0)',
                    'if (lock50ShadowState.inTrade && scalp1TradeLog.length > 0)'
                )
                content = '\n'.join(lines)
                print("Fix 2 applied via line edit")
                break
    else:
        print("Fix 2 ERROR: Could not find LOCK50 Old append block")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done.")
