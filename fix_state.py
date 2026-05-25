import json

with open('/home/ubuntu/trading-bot/trade-state.json', 'r') as f:
    s = json.load(f)

print('lock50TradeLog:', s.get('lock50TradeLog', []))
print('dailyPnL:', s.get('dailyPnL'))
print('tradeCount:', s.get('tradeCount'))
bs = s.get('bhavState', {})
print('bhavState.inTrade:', bs.get('inTrade'))
print('bhavState.firstDone:', bs.get('firstDone'))
print('bhavState.reCount:', bs.get('reCount'))

# Fix: clear lock50TradeLog, set bhavState to correct end-of-day state
# Today: PE entry -150 pts (SL hit at 10:30 AM), no re-entries
s['lock50TradeLog'] = [
    {'dir': 'PE', 'entry': 54868, 'pts': -150, 'reason': 'exit_sl'}
]
# bhavState: firstDone=true, inTrade=false, reCount=0 (SL exit = no re-entry allowed)
if 'bhavState' not in s:
    s['bhavState'] = {}
s['bhavState']['inTrade'] = False
s['bhavState']['firstDone'] = True
s['bhavState']['reCount'] = 0
s['bhavState']['lastExitPts'] = -150  # loss, so no re-entry (must be > 0)
s['dailyPnL'] = -150
s['tradeCount'] = 1

with open('/home/ubuntu/trading-bot/trade-state.json', 'w') as f:
    json.dump(s, f, indent=2)

print('\nFixed trade-state.json:')
print('  lock50TradeLog: 1 trade (PE 54868 -150pts exit_sl)')
print('  dailyPnL: -150 | tradeCount: 1 | inTrade: False')
