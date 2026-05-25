import sys
path = "/home/ubuntu/trading-bot/src/index.ts"
with open(path, encoding='utf-8-sig') as f:
    lines = f.readlines()

for idx in [424, 425, 711, 1779, 1807]:
    print(f"Line {idx+1}: {repr(lines[idx][:100])}")
