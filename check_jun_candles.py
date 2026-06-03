import json
d = json.load(open('/home/ubuntu/trading-bot/cache/banknifty_5yr.json'))
# Check June 2026 and May 2026 candle formats
for date in ['2026-06-02', '2026-06-01', '2026-05-30', '2026-05-26', '2026-05-25']:
    if date in d and d[date]:
        print(f'{date}: {d[date][0]}')
