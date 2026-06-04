import json, datetime

with open('/home/ubuntu/trading-bot/trades.json') as f:
    trades = json.load(f)

today = datetime.date.today().isoformat()  # 2026-06-04
rows = [t for t in trades if (t.get('date') or '').startswith(today) and (t.get('exitPrice') or 0) > 0]

print(f"Date: {today}  |  Closed trades: {len(rows)}")
print()
print(f"{'Dir':<4} {'Type':<14} {'Entry(idx/fut)':>14} {'Exit(idx/fut)':>14} {'PremEntry':>10} {'PremExit':>10} {'pnl pts':>8} {'pnlRs':>8}")
print("-"*90)

total_idx = 0
total_rs = 0
for t in rows:
    ep = t.get('entryPrice', 0)
    xp = t.get('exitPrice', 0)
    pe = t.get('premiumEntry', 0)
    px = t.get('premiumExit', 0)
    pts = t.get('pnl', 0)
    rs = t.get('pnlRs') or round(pts * (t.get('qty', 30)))
    total_idx += pts
    total_rs += rs
    print(f"{t.get('direction',''):<4} {t.get('type','')[:14]:<14} {ep:>14.1f} {xp:>14.1f} {pe:>10.1f} {px:>10.1f} {pts:>+8.1f} {rs:>+8.0f}")

print("-"*90)
print(f"{'TOTAL':<32} {'':>14} {'':>14} {'':>10} {'':>10} {total_idx:>+8.1f} {total_rs:>+8.0f}")
print()
print("KEY:")
print("  Entry/Exit: stored as FUTURES prices (freshPrice & trail.exitPrice + fairPrem)")
print("  PremEntry/Exit: actual futures LTP from getOptionLTP() at entry/exit time")
print("  pnl: INDEX pts (trail.pts)")
print("  pnlRs: computed from futures prices (entryPrice → exitPrice)")
print()
print("ACTUAL market premiums (futures LTP - index close):")
for t in rows:
    pe = t.get('premiumEntry', 0) or 0
    ep = t.get('entryPrice', 0) or 0
    # ep = freshPrice (fair computed), pe = actual LTP
    actual_prem = pe - (ep - (round(ep * 0.07 * 23/365)))  # rough reverse
    print(f"  {t.get('direction','')} {t.get('type','')[:14]}: premiumEntry(actual LTP)={pe:.0f}, entryPrice(our fair)={ep:.0f}, diff={pe-ep:+.0f}")
