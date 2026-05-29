import json, sys

path = "/home/ubuntu/trading-bot/5year-backtest-result.json"
try:
    j = json.load(open(path))
except Exception as e:
    print(f"ERROR loading JSON: {e}")
    sys.exit(1)

print("Top-level keys:", list(j.keys()))
print("Totals:", j.get("totals"))
print("TradingDays:", j.get("tradingDays"))
print("WinRate:", j.get("winRate"))

monthly = j.get("monthly", {})
mk = sorted(monthly.keys())
print(f"\nMonthly: {len(mk)} months, first={mk[0] if mk else 'NONE'}, last={mk[-1] if mk else 'NONE'}")
if mk:
    sample = monthly[mk[0]]
    print("Sample month keys:", list(sample.keys()))
    print("Sample month data:", sample)

daily = j.get("daily", [])
print(f"\nDaily entries: {len(daily)}")
if daily:
    print("Daily[0]:", daily[0])

no_trade = j.get("noTradeDays", [])
print(f"\nNoTradeDays: {len(no_trade)}")
if no_trade:
    print("NoTradeDays[0]:", no_trade[0])
