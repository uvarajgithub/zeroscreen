import subprocess, json, re

script = """
const {KiteConnect} = require('./node_modules/kiteconnect');
require('dotenv').config();
const k = new KiteConnect({api_key: process.env.API_KEY});
k.setAccessToken(process.env.ACCESS_TOKEN);
k.getHistoricalData(256265, '15minute', '2026-05-18 09:15:00', '2026-05-18 15:30:00', false)
  .then(d => { console.log(JSON.stringify(d.map(c => ({t:String(c.date),o:c.open,h:c.high,l:c.low,c:c.close})))); })
  .catch(e => { console.error(e.message); process.exit(1); });
"""
with open('/home/ubuntu/trading-bot/get_today.js', 'w') as f:
    f.write(script)

result = subprocess.run(['node', 'get_today.js'], capture_output=True, text=True, cwd='/home/ubuntu/trading-bot')

# dotenv prints banners to stdout — extract just the JSON line
json_line = next((l for l in result.stdout.splitlines() if l.strip().startswith('[')), None)
if not json_line:
    print('ERROR:', result.stderr or result.stdout); exit()

candles = json.loads(json_line)

def enrich(c):
    bull = c['c'] >= c['o']
    bh = max(c['o'], c['c']); bl = min(c['o'], c['c'])
    return {**c, 'bull': bull, 'body_high': bh, 'body_low': bl, 'body_size': bh - bl}

def rolling_scan(cs):
    for i in range(len(cs) - 1):
        ca, cb = cs[i], cs[i+1]
        sig = c2level = c3level = rule = None
        if ca['bull'] == cb['bull']:
            sig = 'CE' if ca['bull'] else 'PE'
            c2level = ca['h'] if sig == 'CE' else ca['l']
            c3level = max(ca['h'], cb['h']) if sig == 'CE' else min(ca['l'], cb['l'])
            rule = 'A'
        elif cb['body_size'] > ca['body_size']:
            sig = 'CE' if cb['bull'] else 'PE'
            c2level = ca['body_high'] if sig == 'CE' else ca['body_low']
            c3level = max(ca['body_high'], cb['body_high']) if sig == 'CE' else min(ca['body_low'], cb['body_low'])
            rule = 'B'
        else:
            continue
        if sig == 'CE' and cb['c'] > c2level:
            return {'sig': sig, 'px': cb['c'], 'entryIdx': i+1, 'rule': rule+'(C2)', 'bl': c2level}
        if sig == 'PE' and cb['c'] < c2level:
            return {'sig': sig, 'px': cb['c'], 'entryIdx': i+1, 'rule': rule+'(C2)', 'bl': c2level}
        for j in range(i+2, len(cs)):
            c = cs[j]
            if sig == 'CE' and c['c'] > c3level:
                return {'sig': sig, 'px': c['c'], 'entryIdx': j, 'rule': rule, 'bl': c3level}
            if sig == 'PE' and c['c'] < c3level:
                return {'sig': sig, 'px': c['c'], 'entryIdx': j, 'rule': rule, 'bl': c3level}
    return None

def to_ist(t):
    m = re.search(r'(\d{2}):(\d{2}):', t)
    if not m: return t[11:16]
    h, mn = int(m.group(1)) + 5, int(m.group(2)) + 30
    if mn >= 60: mn -= 60; h += 1
    return f"{h}:{mn:02d}"

cs = [enrich(c) for c in candles]
times = [to_ist(c['t']) for c in cs]

print(f"\n{'#':<5} {'Time':<8} {'O':>8} {'H':>8} {'L':>8} {'C':>8}  Dir   Body")
print('-' * 68)
for i, c in enumerate(cs):
    arrow = 'BULL' if c['bull'] else 'BEAR'
    print(f"C{i+1:<4} {times[i]:<8} {c['o']:>8.1f} {c['h']:>8.1f} {c['l']:>8.1f} {c['c']:>8.1f}  {arrow}  {c['body_size']:>6.1f}")

SL = 60; TRAIL = 100
print('\n--- AMINA 100 SIMULATION (no bug, with re-entry) ---\n')
entry = sig_dir = peak = None
phase = 'SCANNING'  # SCANNING / IN_T1 / IN_RE / DONE
t1_pts = re_pts = day_pts = 0

for n in range(1, len(cs) + 1):
    subset = cs[:n]
    latest = subset[-1]
    ist = times[n - 1]
    price = latest['c']

    if phase == 'DONE':
        print(f"  C{n} {ist}  DONE for day")
        continue

    if phase == 'SCANNING':
        res = rolling_scan(subset)
        if res and res['entryIdx'] == n - 1:
            entry = res['px']; sig_dir = res['sig']
            sl = entry - SL if sig_dir == 'CE' else entry + SL
            peak = entry; trail_sl_val = sl
            phase = 'IN_T1'
            print(f"  >> T1 ENTRY  C{n} {ist}  {sig_dir} @ {entry:.0f}  SL={sl:.0f}  Rule={res['rule']}")
        else:
            print(f"  C{n} {ist}  {'PAST_SIGNAL(idx='+str(res['entryIdx'])+',tot='+str(n-1)+')' if res else 'NO_SIGNAL'}")

    elif phase in ('IN_T1', 'IN_RE'):
        pts = (price - entry) if sig_dir == 'CE' else (entry - price)
        if sig_dir == 'CE':
            if price > peak: peak = price
            trail_sl_val = max(entry - SL, peak - TRAIL)
            hit = price <= trail_sl_val
        else:
            if price < peak: peak = price
            trail_sl_val = min(entry + SL, peak + TRAIL)
            hit = price >= trail_sl_val

        eod = ist in ('15:14', '15:15')
        if hit or eod:
            exit_px = trail_sl_val if hit else price
            final = (exit_px - entry) if sig_dir == 'CE' else (entry - exit_px)
            reason = 'SL/TRAIL' if hit else 'EOD'

            if phase == 'IN_T1':
                t1_pts = final
                print(f"  >> T1 {reason} HIT  C{n} {ist}  exit={exit_px:.0f}  T1 P&L={final:+.0f} pts")
                if hit and not eod:
                    # Automatic re-entry opposite direction at SL close price
                    re_dir = 'CE' if sig_dir == 'PE' else 'PE'
                    re_entry = price  # actual close of the candle (slClose)
                    re_sl = re_entry - SL if re_dir == 'CE' else re_entry + SL
                    entry = re_entry; sig_dir = re_dir
                    peak = re_entry; trail_sl_val = re_sl
                    phase = 'IN_RE'
                    print(f"  >> RE-ENTRY   C{n} {ist}  {re_dir} @ {re_entry:.0f}  SL={re_sl:.0f}  (auto opposite)")
                else:
                    day_pts = t1_pts; phase = 'DONE'
            else:
                re_pts = final; day_pts = t1_pts + re_pts
                print(f"  >> RE {reason} HIT  C{n} {ist}  exit={exit_px:.0f}  RE P&L={final:+.0f} pts")
                phase = 'DONE'
        else:
            label = 'T1' if phase == 'IN_T1' else 'RE'
            print(f"  C{n} {ist}  IN {label} {sig_dir}  price={price:.0f}  unr={pts:+.0f}  peak={peak:.0f}  trail_sl={trail_sl_val:.0f}")

print(f"\n  T1: {t1_pts:+.0f} pts  |  RE: {re_pts:+.0f} pts")
print(f"  === DAY P&L: {day_pts:+.0f} pts  (Rs {day_pts*30*0.5:+.0f}) ===")
