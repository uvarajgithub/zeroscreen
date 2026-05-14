import json

f = '/home/ubuntu/trading-bot/trade-state.json'
state = json.load(open(f))

print('Before:')
print('  scalp1PnL:', state['scalp1PnL'])
print('  scalp1Wins:', state['scalp1Wins'])
print('  scalp1Losses:', state['scalp1Losses'])
print('  lock50ShadowState:', state.get('lock50ShadowState'))
for i, t in enumerate(state.get('scalp1TradeLog', [])):
    print(f'  T{i+1}: dir={t["dir"]} entry={t["entry"]} pts={t["pts"]} exit={t.get("exit")}')

# T2: CE entry 53742.8, EOD exit at 54063.2 (= +320.4 pts, confirmed by Telegram "+320 pts")
tl = state['scalp1TradeLog']
# T2 is index 1 (11:30:00 am CE)
tl[1]['exit'] = 54063.2
tl[1]['pts'] = 320
tl[1]['reason'] = 'EOD'
tl[1]['exitMs'] = 1778753103000  # ~3:15 PM

state['scalp1PnL'] = 320
state['scalp1Wins'] = 1     # T2 CE EOD win
state['scalp1Losses'] = 0
state['lock50ShadowState'] = {'inTrade': False, 'dir': None, 'entry': None, 'sl': None}

json.dump(state, open(f, 'w'), indent=2)
print('\nAfter:')
print('  scalp1PnL:', state['scalp1PnL'])
print('  scalp1Wins:', state['scalp1Wins'])
print('  lock50ShadowState:', state['lock50ShadowState'])
print('  T2:', state['scalp1TradeLog'][1])
print('Done.')
