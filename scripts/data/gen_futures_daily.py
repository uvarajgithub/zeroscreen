import json

LOT          = 30
COST_TRADE   = 452
ROLLOVER     = 1500
SL_PTS       = 150
TRAIL_GAP    = 10
MAX_TRADES   = 5

cache = json.load(open('/home/ubuntu/trading-bot/cache/banknifty_5yr.json'))

def run_day(candles):
    trade_count = 0
    day_pnl = 0.0
    in_trade = False
    entry = 0.0
    direction = None  # 'L' or 'S'
    trail_stop = 0.0
    peak_pts = 0.0

    for c in sorted(candles, key=lambda x: x.get('h', 15) * 60 + x.get('m', 30)):
        h, m = c.get('h', 15), c.get('m', 30)
        is_eod = h > 15 or (h == 15 and m >= 30)

        if in_trade:
            pts = (c['close'] - entry) if direction == 'L' else (entry - c['close'])
            if pts > peak_pts:
                peak_pts = pts
            trail = peak_pts - TRAIL_GAP if peak_pts >= TRAIL_GAP else -SL_PTS
            trail_stop = trail
            if pts <= trail_stop or is_eod:
                day_pnl += pts
                in_trade = False
                if is_eod:
                    break
            continue

        if is_eod or trade_count >= MAX_TRADES:
            break

        body_range = c['high'] - c['low']
        body = (c['close'] - c['open']) / body_range if body_range > 0 else 0
        if abs(body) >= 0.6:
            direction = 'L' if body > 0 else 'S'
            entry = c['close']
            trail_stop = -SL_PTS
            peak_pts = 0.0
            in_trade = True
            trade_count += 1

    return day_pnl, trade_count

daily_map = {}
for date in sorted(cache.keys()):
    candles = cache[date]
    if not candles:
        continue
    pnl, trades = run_day(candles)
    gross_rs = pnl * LOT
    costs = trades * COST_TRADE
    net_rs = round(gross_rs - costs)
    daily_map[date] = {
        'grossPts': round(pnl, 1),
        'netRs': net_rs,
        'trades': trades
    }

out = {'generated': 'now', 'lot': LOT, 'daily': daily_map}
json.dump(out, open('/home/ubuntu/trading-bot/futures-daily-results.json', 'w'))
print('Written futures-daily-results.json, days:', len(daily_map))
# Spot check a month sum
from collections import defaultdict
mo_check = defaultdict(int)
for date, v in daily_map.items():
    mo = date[:7]
    mo_check[mo] += v['netRs']
for mo in sorted(mo_check)[:3]:
    print(f'  {mo}: ₹{mo_check[mo]:,}')
