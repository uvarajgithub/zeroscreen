import json
d = json.load(open('/home/ubuntu/trading-bot/cache/banknifty_5yr.json'))
# Find dates with candles that don't have 'h' key
for date in sorted(d.keys()):
    candles = d[date]
    for c in candles:
        if 'h' not in c:
            print(f'{date}: candle without h: {c}')
            break
    else:
        continue
    break
print('check done')
