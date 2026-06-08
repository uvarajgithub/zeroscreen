import json
d = json.load(open('/home/ubuntu/trading-bot/5year-backtest-result.json'))
print('Top-level keys:', list(d.keys())[:10])
# Check for daily data
for k in d.keys():
    val = d[k]
    if isinstance(val, dict):
        subkeys = list(val.keys())[:3]
        print(f'  {k}: dict with keys {subkeys}')
    elif isinstance(val, list):
        print(f'  {k}: list of {len(val)} items')
        if val:
            print(f'    sample[0]: {list(val[0].keys()) if isinstance(val[0], dict) else val[0]}')
    else:
        print(f'  {k}: {type(val).__name__} = {str(val)[:50]}')
