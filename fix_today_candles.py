#!/usr/bin/env python3
"""Fix getTodayCandles: use nowISTEpoch() not Date.now()"""

path = '/home/ubuntu/trading-bot/src/market.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old = '''  const from    = fmtIST(todayMs + 9 * 3600_000 + 15 * 60_000);  // 9:15 AM today
  const to      = fmtIST(Date.now() - 60_000);                    // 1 minute ago'''

new = '''  const from    = fmtIST(todayMs + (9 * 60 + 15) * 60_000);  // 9:15 AM today
  const to      = fmtIST(nowISTEpoch() - 60_000);             // 1 minute ago'''

if old not in content:
    print("ERROR: old line not found"); exit(1)
content = content.replace(old, new, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("market.ts fix OK")
