import json
hb = json.load(open('/home/ubuntu/trading-bot/bot-heartbeat.json'))
stl = hb.get('shadowTradeLog', [])
s1 = hb.get('scalp1TradeLog', [])
print('=== TRAIL TRADES ===')
for t in stl:
    print(f"  {t.get('time')} | {t.get('dir')} | entry={t.get('entry')} | exit={t.get('exit')} | pts={t.get('pts')} | reason={t.get('reason')}")
print(f"shadowPnL={hb.get('shadowPnL')} wins={hb.get('shadowWins')} losses={hb.get('shadowLosses')} trades={hb.get('shadowTrades')}")
print()
print('=== LOCK50 TRADES ===')
for t in s1:
    print(f"  {t.get('time')} | {t.get('dir')} | entry={t.get('entry')} | exit={t.get('exit')} | pts={t.get('pts')} | reason={t.get('reason')}")
print(f"scalp1PnL={hb.get('scalp1PnL')} wins={hb.get('scalp1Wins')} losses={hb.get('scalp1Losses')} trades={hb.get('scalp1Trades')}")
