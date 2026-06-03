import json
d = json.load(open('/home/ubuntu/trading-bot/cache/banknifty_5yr.json'))
print('type:', type(d).__name__)
print('is list:', isinstance(d, list))
if isinstance(d, dict):
    print('keys:', list(d.keys())[:5])
    # Try to find the candles array
    for k, v in d.items():
        if isinstance(v, list) and len(v) > 100:
            print(f'  {k}: list of {len(v)}, sample:', v[0] if v else None)
elif isinstance(d, list):
    print('len:', len(d))
    print('sample[0]:', d[0] if d else None)
