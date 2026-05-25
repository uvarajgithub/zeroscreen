import json, subprocess
subprocess.run(['curl','-s','http://localhost:4000/api/bot/status','-o','/tmp/bst.json'])
d=json.load(open('/tmp/bst.json'))
hb=d.get('heartbeat',{})

print('=== BHAV V3 LIVE STRATEGY - TODAY MAY 25 2026 ===')
print('Mode:', hb.get('mode'), '| Strategy:', hb.get('strategy'))
print('PDH:', hb.get('bhavPrevDayHigh'), '| PDL:', hb.get('bhavPrevDayLow'))
print('Candles today:', hb.get('bhavCandles'), '| Daily P&L:', hb.get('dailyPnL'), 'pts =', hb.get('dailyPnL',0)*15, 'Rs')
print()
print('=== MAIN BOT TRADES (recentTrades) ===')
trades=d.get('recentTrades',[])
for i,t in enumerate(trades):
    pnl=t.get('pnl',0)
    dur=t.get('duration',0)
    print(f"Trade {i+1}: {t.get('direction')} | {t.get('symbol')}")
    print(f"  Entry index: {t.get('entryPrice')} | Exit index: {t.get('exitPrice')}")
    print(f"  Prem In: {t.get('premiumEntry')} | Prem Out: {t.get('premiumExit')}")
    print(f"  P&L: {pnl} pts = Rs {pnl*15:.0f}  (qty 30 x Rs{pnl*15/30:.1f})")
    print(f"  Duration: {dur}s = {dur//60}m {dur%60}s | Exit: {t.get('reasonExit')} | Entry: {t.get('reasonEntry')}")
    print(f"  Date/Time (UTC): {t.get('date')}")
    print()

total_pts=sum(t.get('pnl',0) for t in trades)
print(f"TOTAL: {len(trades)} trades | {total_pts} pts | Rs {total_pts*15:.0f}")
print()
print('=== SHADOW TRADE LOG (heartbeat.shadowTradeLog) ===')
for t in hb.get('shadowTradeLog',[]):
    print(t)
print()
print('=== SCALP1 TRADE LOG ===')
for t in hb.get('scalp1TradeLog',[]):
    print(t)
