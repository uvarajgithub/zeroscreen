import json
d = json.load(open('/home/ubuntu/trading-bot/futures-daily-results.json'))
print(type(d))
if isinstance(d, list):
    print('list, first item:', d[0])
elif isinstance(d, dict):
    keys = list(d.keys())[:3]
    print('dict keys sample:', keys)
    for k in keys:
        print(k, '->', str(d[k])[:100])
