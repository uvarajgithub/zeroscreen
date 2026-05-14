#!/usr/bin/env python3
path = '/home/ubuntu/trading-bot/dist/src/index.js'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find and print the line
for i, line in enumerate(lines):
    if 'Done for Day' in line and 'trailCtx' in line:
        print(f"Line {i+1}:")
        print(repr(line[:200]))
        break
