import json

j = json.load(open("/home/ubuntu/trading-bot/5year-backtest-result.json"))
daily = [d for d in j["daily"] if d["bbPnL"] != 0]
wins   = sorted([d for d in daily if d["bbPnL"] > 0], key=lambda x: -x["bbPnL"])
losses = sorted([d for d in daily if d["bbPnL"] < 0], key=lambda x:  x["bbPnL"])

print("TOP 5 PROFIT DAYS:")
for d in wins[:5]:
    print(f"  {d['date']}: +{d['bbPnL']:.1f} pts  +Rs{round(d['bbPnL']*15):,}")

print()
print("TOP 5 LOSS DAYS:")
for d in losses[:5]:
    print(f"  {d['date']}: {d['bbPnL']:.1f} pts  Rs{round(d['bbPnL']*15):,}")

print()
print(f"Avg profit day : +{sum(d['bbPnL'] for d in wins)/len(wins):.1f} pts  +Rs{round(sum(d['bbPnL'] for d in wins)/len(wins)*15):,}")
print(f"Avg loss day   :  {sum(d['bbPnL'] for d in losses)/len(losses):.1f} pts  Rs{round(sum(d['bbPnL'] for d in losses)/len(losses)*15):,}")
print()
print(f"Total traded days : {len(daily)}")
print(f"Win days          : {len(wins)}")
print(f"Loss days         : {len(losses)}")
