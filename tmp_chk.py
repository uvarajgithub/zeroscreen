import json, os, datetime
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

trades = json.load(open('/root/zeroscreen/trades.json'))
hb = json.loads(open('/root/zeroscreen/bot-heartbeat.json').read()) if os.path.exists('/root/zeroscreen/bot-heartbeat.json') else {}
state = json.loads(open('/root/zeroscreen/trade-state.json').read()) if os.path.exists('/root/zeroscreen/trade-state.json') else {}

today = datetime.datetime.now(ZoneInfo('Asia/Kolkata')).strftime('%Y-%m-%d')
td = [t for t in trades if (t.get('date') or '').startswith(today)]
closed = [t for t in td if t.get('exitPrice') and t['exitPrice'] > 0]
cpnl = sum(t.get('pnl', 0) for t in closed)
in_trade = bool(hb.get('inTrade') or state.get('activeTrade') or state.get('mainEntryDone'))
unreal = hb.get('unrealisedPnL', 0) if in_trade else 0
total = cpnl + unreal

print(f"Date        : {today}")
print(f"Closed trades: {len(closed)}")
print(f"Open position: {'YES - ' + str(hb.get('direction','?')) if in_trade else 'NO'}")
print(f"Closed P&L  : {cpnl:+.1f} pts  =  Rs {round(cpnl*15):+,}")
if in_trade:
    print(f"Unrealised  : {unreal:+.1f} pts  =  Rs {round(unreal*15):+,}")
print(f"TOTAL TODAY : {total:+.1f} pts  =  Rs {round(total*15):+,}")
print("---")
for i, t in enumerate(closed, 1):
    p = t.get('pnl', 0)
    print(f"  {i}. {t.get('direction','?'):2s}  Entry:{t.get('entryPrice')}  Exit:{t.get('exitPrice')}  PnL:{p:+.1f}pts / Rs{round(p*15):+,}  [{t.get('reasonExit','?')}]  {(t.get('date') or '')[:16]}")
if in_trade:
    print(f"  LIVE: {hb.get('direction','?')}  EntryIdx:{hb.get('entryPrice') or state.get('entryPrice')}  LiveIdx:{hb.get('livePrice')}  Unreal:{unreal:+.1f}pts")
