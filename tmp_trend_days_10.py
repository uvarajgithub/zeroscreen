import json
from collections import defaultdict
from pathlib import Path

ROOT = Path("/home/ubuntu/trading-bot")
DATA = ROOT / "research-banknifty-15m-1y.json"
START = "2026-07-01"
END = "2026-08-14"
QTY = 30
BUFFER = 10


def load_rows():
    data = json.loads(DATA.read_text())
    rows = []
    if isinstance(data, list):
        rows = data
    elif isinstance(data, dict):
        for key in ["candles", "data", "rows"]:
            if isinstance(data.get(key), list):
                rows = data[key]
                break
        if not rows and isinstance(data.get("days"), dict):
            for day, day_rows in data["days"].items():
                for r in day_rows:
                    x = dict(r)
                    x.setdefault("date", day)
                    rows.append(x)
    out = []
    for r in rows:
        raw = str(r.get("date") or r.get("time") or r.get("start") or r.get("timestamp") or "")
        day = raw[:10] if len(raw) >= 10 and raw[4:5] == "-" else str(r.get("day") or "")
        time = str(r.get("time") or r.get("minute") or "")
        if not time and "T" in raw:
            time = raw[11:16]
        if not time and " " in raw:
            time = raw.split(" ")[1][:5]
        try:
            out.append({"day": day, "time": time, "open": float(r["open"]), "high": float(r["high"]), "low": float(r["low"]), "close": float(r["close"])})
        except Exception:
            pass
    return out


def run_10(candles):
    candles = sorted(candles, key=lambda x: x["time"])
    range_high = range_low = None
    in_trade = False
    direction = None
    entry = sl = ref_high = ref_low = 0.0
    trades = []
    for idx, c in enumerate(candles, start=1):
        time = c["time"]
        if idx == 4 and range_high is None:
            range_high, range_low = c["high"], c["low"]
            continue
        if range_high is None:
            continue
        eod = time >= "15:30" or time == "15:15"
        if in_trade:
            sl_hit = c["close"] <= sl if direction == "CE" else c["close"] >= sl
            if sl_hit or eod:
                exit_price = sl if sl_hit else c["close"]
                pts = exit_price - entry if direction == "CE" else entry - exit_price
                trades.append({"time": time, "dir": direction, "entry": entry, "exit": exit_price, "pts": pts, "reason": "sl_hit" if sl_hit else "exit_eod"})
                in_trade = False
                direction = None
                entry = sl = ref_high = ref_low = 0.0
                continue
            if direction == "CE" and c["close"] > ref_high:
                sl = max(sl, c["low"] - BUFFER)
                ref_high, ref_low = c["high"], c["low"]
            elif direction == "PE" and c["close"] < ref_low:
                sl = min(sl, c["high"] + BUFFER)
                ref_high, ref_low = c["high"], c["low"]
            continue
        if len(trades) >= 2 or eod or idx <= 4:
            continue
        sig = "CE" if c["close"] > range_high else "PE" if c["close"] < range_low else None
        if not sig:
            continue
        direction = sig
        entry = range_high if sig == "CE" else range_low
        sl = c["low"] if sig == "CE" else c["high"]
        ref_high, ref_low = c["high"], c["low"]
        in_trade = True
    if in_trade and candles:
        c = candles[-1]
        pts = c["close"] - entry if direction == "CE" else entry - c["close"]
        trades.append({"time": c["time"], "dir": direction, "entry": entry, "exit": c["close"], "pts": pts, "reason": "forced_eod"})
    return trades


rows = load_rows()
days = defaultdict(list)
for r in rows:
    if START <= r["day"] <= END and "09:15" <= r["time"] <= "15:30":
        days[r["day"]].append(r)

trend_rows = []
for day, candles in days.items():
    candles = sorted(candles, key=lambda x: x["time"])
    if not candles:
        continue
    day_open = candles[0]["open"]
    day_close = candles[-1]["close"]
    day_high = max(c["high"] for c in candles)
    day_low = min(c["low"] for c in candles)
    move = day_close - day_open
    rng = day_high - day_low
    directionality = abs(move) / rng * 100 if rng else 0
    if rng >= 300 and directionality >= 60:
        trades = run_10(candles)
        pts = sum(t["pts"] for t in trades)
        trend_rows.append({
            "day": day,
            "type": "UP" if move > 0 else "DOWN",
            "move": round(move, 1),
            "range": round(rng, 1),
            "directionality": round(directionality, 1),
            "captured": round(pts, 1),
            "pnl": round(pts * QTY),
            "trades": trades,
        })

trend_rows.sort(key=lambda x: (x["day"]))
print("Trend days", START, "to", END, "count", len(trend_rows))
for r in trend_rows:
    print(json.dumps(r, separators=(",", ":")))
