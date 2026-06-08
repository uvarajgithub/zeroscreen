import json
d = json.load(open('/home/ubuntu/trading-bot/cache/banknifty_5yr.json'))
# It's a dict of date -> candles
dates = sorted(d.keys())
print('Date range:', dates[0], 'to', dates[-1])
print('Total dates:', len(dates))
# Check one day's value
sample_date = dates[0]
val = d[sample_date]
print(f'Value type for {sample_date}:', type(val).__name__)
if isinstance(val, list):
    print('  list of', len(val), 'candles')
    print('  sample candle:', val[0])
elif isinstance(val, dict):
    print('  keys:', list(val.keys())[:5])
