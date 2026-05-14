#!/usr/bin/env python3
"""Fix 1: Add missing opening * in TRAIL Done for Day line."""
path = '/home/ubuntu/trading-bot/dist/src/index.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# The pattern on the buggy line (around line 431):
# trailCtx = `✅ *TRAIL*  ·  Done for Day\n📈 ${_shSign}${shadowPnL.toFixed(0)} pts*  ·  ...
# We need to add * before ${_shSign} so it becomes:
# trailCtx = `✅ *TRAIL*  ·  Done for Day\n📈 *${_shSign}${shadowPnL.toFixed(0)} pts*  ·  ...

# Use a unique anchor: "Done for Day\\n" followed by chart emoji and ${_shSign}
# The unescaped \n in the template literal becomes \\n in the string

import re

# Find the line and do a targeted replacement
# Pattern: after "Done for Day\n" + emoji, there should be *${_shSign}
# Currently it's missing the leading *

def fix_done_for_day(content):
    lines = content.split('\n')
    fixed = False
    for i, line in enumerate(lines):
        if 'Done for Day' in line and 'trailCtx' in line and 'TRAIL' in line:
            # Check if it has the bug: `pts*` but NOT `*${_shSign}`
            if 'pts*' in line and '*${_shSign}' not in line:
                # Add * before ${_shSign}${shadowPnL
                new_line = line.replace(
                    '${_shSign}${shadowPnL.toFixed(0)} pts*',
                    '*${_shSign}${shadowPnL.toFixed(0)} pts*',
                    1
                )
                if new_line != line:
                    lines[i] = new_line
                    fixed = True
                    print(f"Fix 1 applied at line {i+1}")
                    print(f"  Before: {line.strip()[:100]}")
                    print(f"  After:  {new_line.strip()[:100]}")
                else:
                    print(f"Fix 1 ERROR: replacement had no effect on: {line.strip()[:100]}")
            else:
                print(f"Fix 1: Line may already be correct or pattern mismatch:")
                print(f"  {line.strip()[:100]}")
                print(f"  has '*${{_shSign}}': {'*${_shSign}' in line}")
                print(f"  has 'pts*': {'pts*' in line}")
            break
    else:
        print("Fix 1 ERROR: Could not find TRAIL Done for Day trailCtx line")
    
    if fixed:
        return '\n'.join(lines)
    return content

content = fix_done_for_day(content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done.")
