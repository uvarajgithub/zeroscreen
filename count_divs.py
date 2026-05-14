#!/usr/bin/env python3
"""Count div depth through TRAIL panel to find unclosed divs"""
path = '/root/zeroscreen/dist/server.js'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

start = None
for i, l in enumerate(lines):
    if 'panel-trail' in l and 'style="display:none"' in l:
        start = i
        break

print(f"TRAIL panel starts at line {start+1}: {repr(lines[start][:80])}")

depth = 0
for i in range(start, min(start+100, len(lines))):
    l = lines[i]
    opens = l.count('<div') - l.count('</div')
    depth += opens
    if abs(opens) > 0 or depth == 0 and i > start:
        print(f"  {i+1}: depth={depth} opens={opens} | {repr(l[:80])}")
    if depth == 0 and i > start:
        print(f"  ^ PANEL CLOSES AT LINE {i+1}")
        break
