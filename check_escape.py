#!/usr/bin/env python3
"""Print exact repr of TRAIL and L50O template ternary lines"""
path = '/root/zeroscreen/dist/server.js'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print("=== TRAIL block ===")
for i, l in enumerate(lines):
    if 'sh-pos-trail-wrap' in l:
        for j in range(i, min(i+5, len(lines))):
            print(f"{j+1}: {repr(lines[j])}")
        break

print("\n=== L50O block ===")
for i, l in enumerate(lines):
    if 'sh-pos-l50o-wrap' in l:
        for j in range(i, min(i+5, len(lines))):
            print(f"{j+1}: {repr(lines[j])}")
        break

# Also print lines containing \` : \` or `}
print("\n=== Ternary separators/closers near trail ===")
for i, l in enumerate(lines):
    if 'sh-pos-trail-wrap' in l:
        start = i
        for j in range(i, min(i+55, len(lines))):
            if '\\`' in repr(lines[j]) or "`}" in lines[j] or "` : `" in lines[j]:
                print(f"{j+1}: {repr(lines[j])}")
        break

print("\n=== Ternary separators/closers near l50o ===")
for i, l in enumerate(lines):
    if 'sh-pos-l50o-wrap' in l:
        for j in range(i, min(i+55, len(lines))):
            if '\\`' in repr(lines[j]) or "`}" in lines[j] or "` : `" in lines[j]:
                print(f"{j+1}: {repr(lines[j])}")
        break
