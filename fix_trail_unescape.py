#!/usr/bin/env python3
"""
Fix TRAIL panel: unescape all \${ and \` in lines 10345-10391 (the ternary block).
L50O is already correct.
"""
path = '/root/zeroscreen/dist/server.js'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find TRAIL block start
trail_start = None
for i, l in enumerate(lines):
    if 'sh-pos-trail-wrap' in l:
        trail_start = i
        break

if trail_start is None:
    print("ERROR: trail block not found")
    exit(1)

print(f"TRAIL wrap at line {trail_start+1}")

# Fix lines from trail_start+1 to trail_start+55 (the ternary block)
fixed = 0
for i in range(trail_start+1, min(trail_start+60, len(lines))):
    original = lines[i]
    # Replace escaped \${ with ${
    fixed_line = original.replace('\\${', '${')
    # Replace escaped \` with `
    fixed_line = fixed_line.replace('\\`', '`')
    if fixed_line != original:
        print(f"Fixed line {i+1}: {repr(original[:80])} -> {repr(fixed_line[:80])}")
        lines[i] = fixed_line
        fixed += 1

print(f"\nTotal lines fixed: {fixed}")

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Done.")
