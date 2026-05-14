import json
d = json.load(open('/home/ubuntu/trading-bot/bot-heartbeat.json'))
print('shadowPnL:', d.get('shadowPnL'))
print('shadowTrades:', d.get('shadowTrades'))
print('shadowWins:', d.get('shadowWins'))
print('shadowLosses:', d.get('shadowLosses'))
print('shadowInTrade:', d.get('shadowInTrade'))
print('shadowDir:', d.get('shadowDir'))
print('shadowEntry:', d.get('shadowEntry'))
print()
for i, t in enumerate(d.get('shadowTradeLog', [])):
    print(f'T{i+1}:', t)
