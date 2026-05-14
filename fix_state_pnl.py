import json

f = '/home/ubuntu/trading-bot/trade-state.json'
state = json.load(open(f))

# T7: PE entry 54194.35, EOD exit at 54063.2 (+131 pts) - confirmed by Telegram
tl = state['shadowTradeLog']
# Index 6 = T7 (3:00:03 pm PE)
tl[6]['exit'] = 54063.2
tl[6]['pts'] = 131
tl[6]['reason'] = 'EOD exit'
tl[6]['exitMs'] = 1778753103000  # approximate 3:15 PM

# T2 (10:30:08 CE), T3 (10:45:00 PE), T4 (11:30:00 CE), T5 (1:30:13 CE)
# These had pts: null. The Telegram said Total +125 = -3 (T1) + T2..T5 + (-3) (T6) + 131 (T7) = 125
# So T2+T3+T4+T5 = 125 - (-3) - (-3) - 131 = 125 + 3 + 3 - 131 = 0
# They summed to 0. Since we don't know individual pts, mark them as (exit not recorded)
# But to not change the total incorrectly, leave them with pts: null for now
# The shadowPnL should reflect the known trades:
# T1: -3, T6: -3, T7: +131 = 125 confirmed by Telegram
state['shadowPnL'] = 125
state['shadowWins'] = 1   # T7 win
state['shadowLosses'] = 2  # T1, T6 losses

# LOCK50 Old: T2 (CE 53742.8) is still open (in trade), T1 (PE 53480.65) has pts: null
# The Telegram said "+320 pts" total. T1 result unknown, T2 CE is still live.
# scalp1PnL from Telegram was +320 pts (1W 0L), that was the live unrealised gain on CE
# But that was unrealised P&L at 3:56 PM. We don't have an exit for T2 yet (it's still "open" in state).
# Keep scalp1PnL as 0 (only closed pts) - the live trade is still open.
# T1 PE: no exit recorded - leave as is

print('Updated shadowPnL:', state['shadowPnL'])
print('T7:', state['shadowTradeLog'][6])
json.dump(state, open(f, 'w'), indent=2)
print('State file updated.')
