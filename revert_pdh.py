#!/usr/bin/env python3
"""Revert PDH changes from dist/src/index.js (the live running file)"""

path = '/home/ubuntu/trading-bot/dist/src/index.js'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# Remove PDH state vars
import re

# Remove pdhHigh/pdhLow/pdhContext var declarations
content, n = re.subn(r'\nlet pdhHigh\s*=\s*0;\nlet pdhLow\s*=\s*0;\nlet pdhContext\s*=\s*"NEUTRAL"[^\n]*\n', '\n', content)
changes += n; print(f"Removed PDH vars: {n}")

# Remove PDH fetch at reset
content, n = re.subn(
    r'\s*// Fetch previous day.*?getPrevDayHL\(\)\.then\(\(\{ high, low \}\) => \{.*?\}\)\.catch\(e => log\("PDH_FETCH_FAIL".*?\}\);',
    '', content, flags=re.DOTALL)
changes += n; print(f"Removed PDH fetch: {n}")

# Remove PDH context set at first candle
content, n = re.subn(
    r'\s*// Set PDH/PDL context based on first candle close\s*if \(pdhHigh > 0.*?pdhContext \}\);\s*\}',
    '', content, flags=re.DOTALL)
changes += n; print(f"Removed PDH context set: {n}")

# Remove PDH blocked checks in ENTER case
content, n = re.subn(
    r'\s*// PDH/PDL context filter.*?break;\s*\}',
    '', content, flags=re.DOTALL | re.MULTILINE)
changes += n; print(f"Removed PDH filter blocks: {n}")

print(f"\nTotal changes: {changes}")

# Verify no PDH code remains
remaining = content.count('pdhHigh') + content.count('PDH_BLOCKED') + content.count('getPrevDayHL')
print(f"PDH references remaining: {remaining}")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Saved.")
