import json
d = json.load(open('/home/ubuntu/trading-bot/cache/banknifty_5yr.json'))
dates = sorted(d.keys())
# Skip weekends/holidays (empty), find first trading day
for date in dates:
    if d[date]:
        print(f'{date}: {d[date][0]}')
        break
