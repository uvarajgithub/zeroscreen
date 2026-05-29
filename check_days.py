import json

j = json.load(open("/home/ubuntu/trading-bot/5year-backtest-result.json"))
daily = j["daily"]

profit = [d for d in daily if d["bbPnL"] > 0]
loss   = [d for d in daily if d["bbPnL"] < 0]
even   = [d for d in daily if d["bbPnL"] == 0]
no_trade = j.get("noTradeDays", [])

print(f"Total days run     : {len(daily)}")
print(f"Profit days (>0)   : {len(profit)}")
print(f"Loss days   (<0)   : {len(loss)}")
print(f"Breakeven   (=0)   : {len(even)}")
print(f"No-trade days      : {len(no_trade)}")
print(f"")
print(f"Profit day %       : {len(profit)/len(daily)*100:.1f}%")
print(f"Loss day %         : {len(loss)/len(daily)*100:.1f}%")
print(f"")
worst = min(daily, key=lambda d: d["bbPnL"])
best  = max(daily, key=lambda d: d["bbPnL"])
print(f"Best day  : {best['date']}  +{best['bbPnL']} pts")
print(f"Worst day : {worst['date']}  {worst['bbPnL']} pts")
