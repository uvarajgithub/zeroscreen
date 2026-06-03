import json, sys, os

# Load today's candle log from the bot
with open('/home/ubuntu/trading-bot/candle-log.json') as f:
    clog = json.load(f)

print(f"Date: {clog.get('date')}")
print(f"Candles logged: {len(clog.get('log', []))}")
print()

# Print the candle log (what the bot evaluated each candle)
print(f"{'C#':<4} {'Time':<6} {'Close':>8} {'Body%':>7}  {'Signal/Reason'}")
print("-"*80)
for e in clog.get('log', []):
    sig = e.get('signal') or ''
    reason = e.get('reason') or ''
    offline = ' [OFFLINE]' if e.get('offline') else ''
    body = f"{e.get('bodyPct',0):>+4}%"
    sig_str = f">>> ENTER {sig} — {reason}" if sig else reason[:60]
    print(f"C{e.get('idx',0):<3} {e.get('time',''):<6} {e.get('close',0):>8.1f}  {body}  {sig_str}{offline}")
