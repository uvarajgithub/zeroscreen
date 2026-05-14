import json
with open('/home/ubuntu/trading-bot/research-candles-cache.json') as f:
    d = json.load(f)
c = d if isinstance(d, list) else list(d.values())[0]
print('total:', len(c))
print('first:', c[0]['date'])
print('last:', c[-1]['date'])
