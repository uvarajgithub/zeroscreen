import json
d = json.load(open("/root/zeroscreen/5year-backtest-result.json"))
t = d.get("totals", {})
print("bbTotal pts:", t.get("bodyBreakout"))
print("bbTotal Rs:", t.get("bodyBreakout") * 15 if t.get("bodyBreakout") else "N/A")
print("tradingDays:", d.get("tradingDays"))
print("tradedDays:", d.get("tradedDays"))
print("winRate:", d.get("winRate"))
print("period:", d.get("period"))

# Monthly count
monthly = d.get("monthly", {})
print("months in monthly:", len(monthly))

# Count monthly trades and wins
total_trades = sum(v.get("bbTrades",0) for v in monthly.values())
total_wins = sum(v.get("bbWins",0) for v in monthly.values())
print("total_trades:", total_trades)
print("total_wins:", total_wins)
print("trade win rate:", round(total_wins/total_trades*100,1) if total_trades else 0)
