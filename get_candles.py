import json

hb = json.load(open('/home/ubuntu/trading-bot/bot-heartbeat.json'))
candles = hb.get('candleHistory', [])
print('Total candles in heartbeat:', len(candles))
for c in candles:
    print(c)
