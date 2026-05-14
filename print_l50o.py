#!/usr/bin/env python3
"""Print exact lines around sh-pos-l50o-wrap"""
with open('/root/zeroscreen/dist/server.js','r',encoding='utf-8') as f:
    lines=f.readlines()
for i,l in enumerate(lines):
    if 'sh-pos-l50o-wrap' in l:
        print(f"Found at line {i+1}")
        for j in range(i, min(i+35, len(lines))):
            print(f"{j+1}: {repr(lines[j][:100])}")
        break
