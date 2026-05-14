import json
with open('/home/ubuntu/trading-bot/research-candles-cache.json') as f:
    d = json.load(f)
if isinstance(d, dict):
    keys = list(d.keys())
    print('Keys:', keys[:5])
    for k in keys[:2]:
        v = d[k]
        if isinstance(v, list) and len(v) > 0:
            print(k, '->', len(v), 'candles, first:', v[0].get('date','?') if isinstance(v[0],dict) else str(v[0])[:50])
else:
    print(type(d), str(d)[:200])
