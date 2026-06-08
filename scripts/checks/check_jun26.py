import json
d = json.load(open('/home/ubuntu/trading-bot/cache/banknifty_5yr.json'))
# Check June 2026 dates
for date in sorted(d.keys()):
    if date.startswith('2026-06'):
        print(f'{date}: {len(d[date])} candles')
