#!/usr/bin/env python3
"""Check the res.send context and find backtick balance from line 9930"""
with open('/root/zeroscreen/dist/server.js','r') as f:
    lines=f.readlines()

# Show lines 9928-9935
print("=== res.send context ===")
for i in range(9928, 9936):
    print(f"{i+1}: {repr(lines[i][:80])}")

# Now check if there's a nested backtick issue in the template ternary
# Find lines that have unbalanced backticks around panel-trail
print("\n=== Lines with backtick near TRAIL panel ===")
for i in range(10340, 10395):
    if '`' in lines[i]:
        print(f"{i+1}: {repr(lines[i][:100])}")
