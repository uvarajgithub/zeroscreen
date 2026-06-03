import json

with open('/home/ubuntu/trading-bot/trades.json') as f:
    trades = json.load(f)

today = [t for t in trades if '2026-06-03' in (t.get('date') or '')]

print(f"{'Dir':<4} {'Entry':>9} {'Exit':>9} {'PremEntry':>10} {'PremExit':>10} {'pnl':>7} {'qty':>4}  Reason")
print("-"*80)
for t in today:
    print(f"{t.get('direction',''):<4} {t.get('entryPrice',0):>9.2f} {t.get('exitPrice',0):>9.2f} {t.get('premiumEntry',0):>10.2f} {t.get('premiumExit',0):>10.2f} {t.get('pnl',0):>7.2f} {t.get('qty',0):>4}  {t.get('reasonExit','')}")
