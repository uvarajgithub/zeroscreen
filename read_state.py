import json
s = json.load(open('/home/ubuntu/trading-bot/trade-state.json'))
print('dailyPnL:', s.get('dailyPnL'))
print('tradeCount:', s.get('tradeCount'))
print('lock50Wins:', s.get('lock50Wins'))
print('lock50Losses:', s.get('lock50Losses'))
print('lock50TradeLog:')
for t in s.get('lock50TradeLog', []):
    print(' ', t)
