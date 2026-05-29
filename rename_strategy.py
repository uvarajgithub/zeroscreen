import json
with open('/root/zeroscreen/5year-backtest-result.json', 'r') as f:
    d = json.load(f)
d['strategy'] = 'BHAV V4'
with open('/root/zeroscreen/5year-backtest-result.json', 'w') as f:
    json.dump(d, f, indent=2)
print('Strategy renamed to BHAV V4')
