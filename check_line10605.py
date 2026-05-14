#!/usr/bin/env python3
with open('/root/zeroscreen/dist/server.js','r') as f:
    lines=f.readlines()
# Line 10605 (0-indexed: 10604)
print(f"Line 10605: {repr(lines[10604])}")
print(f"Line 10604: {repr(lines[10603])}")
print(f"Line 10606: {repr(lines[10605])}")

# Also look for 'u2014' literally (not escaped)
for i,l in enumerate(lines):
    if 'u2014' in l and '\\u2014' not in l:
        print(f"RAW u2014 at line {i+1}: {repr(l[:100])}")
