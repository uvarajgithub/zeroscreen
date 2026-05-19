import json, os

TRADES_FILE = "/home/ubuntu/trading-bot/trades.json"
existing = []
if os.path.exists(TRADES_FILE):
    with open(TRADES_FILE) as f:
        try:
            existing = json.load(f)
            if not isinstance(existing, list):
                existing = []
        except:
            existing = []

# T1 trade: PE, SL hit at C4 (10:15) — rePts stored as -60 (old code), actual was -132pts
t1 = {
    "date": "2026-05-19 10:00:05",
    "direction": "PE",
    "symbol": "BANKNIFTY26MAY53000PE",
    "entryPrice": 53485.8,
    "exitPrice": 53617.85,
    "premiumEntry": 0,
    "premiumExit": 0,
    "pnl": -132.05,
    "pnlRs": -900,
    "reasonExit": "T1_SL",
    "duration": 915
}

# RE trade: CE, rePts=0 means trail-to-BE exit
re = {
    "date": "2026-05-19 10:15:04",
    "direction": "CE",
    "symbol": "BANKNIFTY26MAY54000CE",
    "entryPrice": 53617.85,
    "exitPrice": 53617.85,
    "premiumEntry": 0,
    "premiumExit": 0,
    "pnl": 0,
    "pnlRs": 0,
    "reasonExit": "RE_SL",
    "duration": 18896
}

dates = [t.get("date") for t in existing]
if t1["date"] not in dates:
    existing.append(t1)
if re["date"] not in dates:
    existing.append(re)

with open(TRADES_FILE, "w") as f:
    json.dump(existing, f, indent=2)

print("Done. trades.json now has", len(existing), "records")
