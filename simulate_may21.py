"""
AMINA 100 Variant B — May 21, 2026 simulation
Uses actual candle data from bot logs.
Shows: what happened vs what WOULD happen with T3 recovery.
"""

SL_INITIAL = 60
TRAIL_GAP  = 100
BUFFER     = 25
RS_PER_PT  = 15  # 30 qty × 0.5 delta

# ── May 21 actual 15-min candles (from amina.log, IST times) ──────────────────
# Format: (IST_time, open, high, low, close)
CANDLES = [
    # 9:15–9:30 candle not in log but T1 entry implies some early candles
    # 9:30 AM onward from PM2 bot logs (reconstructed via: T1 was PE, entry ~53791)
    # Using only confirmed log candles:
    ("10:00", 53816.15, 53872.70, 53746.85, 53790.95),  # C4 BEAR
    ("10:15", 53801.85, 53882.80, 53794.95, 53875.50),  # C5 BULL
    ("10:30", 53852.70, 53893.15, 53753.80, 53824.00),  # C6 BEAR
    ("10:45", 53823.50, 53858.30, 53729.80, 53750.15),  # C7 BEAR
    ("11:00", 53763.70, 53765.65, 53654.85, 53673.75),  # C8 BEAR
    ("11:15", 53668.60, 53765.10, 53530.75, 53755.15),  # C9 BULL
    ("11:30", 53757.20, 53759.50, 53661.85, 53677.85),  # C10 BEAR
    ("11:45", 53697.70, 53713.55, 53623.40, 53651.45),  # C11 BEAR
    ("12:00", 53640.35, 53704.00, 53618.15, 53622.95),  # C12 BEAR
    ("12:15", 53604.15, 53613.95, 53447.10, 53476.85),  # C13 BEAR
    ("12:30", 53476.70, 53489.70, 53327.65, 53413.40),  # C14 BEAR
    ("12:45", 53399.90, 53399.90, 53245.30, 53245.30),  # C15 BEAR (new low)
    ("13:00", 53276.25, 53306.85, 53156.15, 53285.90),  # C16 BULL
    ("13:15", 53288.75, 53335.30, 53247.50, 53265.40),  # C17 BEAR
    ("13:30", 53263.15, 53403.75, 53239.95, 53376.35),  # C18 BULL
    ("13:45", 53383.25, 53444.00, 53289.40, 53322.40),  # C19 BEAR
    ("14:00", 53347.45, 53360.70, 53272.55, 53352.05),  # C20 BULL
    ("14:15", 53337.40, 53421.35, 53303.85, 53358.40),  # C21 BULL
    ("14:30", 53355.05, 53509.35, 53353.70, 53453.25),  # C22 BULL
    ("14:45", 53450.10, 53521.55, 53440.30, 53460.80),  # C23 BULL
]

def body_size(o, c):
    return abs(c - o)

def is_bull(o, c):
    return c >= o

def t3_entry_scan(cs):
    """Check only last-2 candle pair for T3 entry signal on the LATEST candle."""
    if len(cs) < 2:
        return None
    prev = cs[-2]
    last = cs[-1]
    p_bull = is_bull(prev[1], prev[4])
    l_bull = is_bull(last[1], last[4])
    p_body_h = max(prev[1], prev[4])
    p_body_l = min(prev[1], prev[4])
    p_body   = body_size(prev[1], prev[4])
    l_body   = body_size(last[1], last[4])

    if p_bull == l_bull:
        # Rule A: same color
        sig = "CE" if l_bull else "PE"
        c2level = prev[2] if sig == "CE" else prev[3]  # high or low
        if sig == "CE" and last[4] > c2level:
            return {"sig": sig, "px": last[4], "bl": c2level, "rule": "A(C2)"}
        if sig == "PE" and last[4] < c2level:
            return {"sig": sig, "px": last[4], "bl": c2level, "rule": "A(C2)"}
    elif l_body > p_body:
        # Rule B: opposite color, last body > prev body
        sig = "CE" if l_bull else "PE"
        c2level = p_body_h if sig == "CE" else p_body_l
        if sig == "CE" and last[4] > c2level:
            return {"sig": sig, "px": last[4], "bl": c2level, "rule": "B(C2)"}
        if sig == "PE" and last[4] < c2level:
            return {"sig": sig, "px": last[4], "bl": c2level, "rule": "B(C2)"}
    return None

def simulate_trail(entry_dir, entry_px, candles_after, label="T"):
    """Simulate a trade through candles. Returns (pts, exit_time, exit_px, reason)."""
    peak = 0
    for i, (t, o, h, l, c) in enumerate(candles_after):
        # SL level is based on PREVIOUS peak (before this candle closes)
        eff_sl_start = max(0, peak - TRAIL_GAP) if peak >= SL_INITIAL else -SL_INITIAL
        sl_px_start  = (entry_px + eff_sl_start) if entry_dir == "CE" else (entry_px - eff_sl_start)

        # Tick SL check intrabar (skip very first candle — entry candle)
        intrabar_hit = (l <= sl_px_start) if entry_dir == "CE" else (h >= sl_px_start)
        if intrabar_hit and i > 0:
            tick_exit = sl_px_start
            tick_pts  = (tick_exit - entry_px) if entry_dir == "CE" else (entry_px - tick_exit)
            return tick_pts, t, tick_exit, "Tick-SL"

        # Update peak with candle close
        pts = (c - entry_px) if entry_dir == "CE" else (entry_px - c)
        if pts > peak:
            peak = pts

        # Candle-close SL check (using close-updated peak)
        eff_sl_close = max(0, peak - TRAIL_GAP) if peak >= SL_INITIAL else -SL_INITIAL
        if pts <= eff_sl_close - BUFFER:
            return pts, t, c, "Candle-SL"

    # EOD exit
    last = candles_after[-1]
    pts_eod = (last[4] - entry_px) if entry_dir == "CE" else (entry_px - last[4])
    return pts_eod, last[0], last[4], "EOD"

# ─────────────────────────────────────────────────────────────────────────────
print("=" * 60)
print("  AMINA 100 Variant B — May 21, 2026 Simulation")
print("=" * 60)

# ── Actual T1 (from real logs) ────────────────────────────────────────────────
t1_entry_px  = 53791.0   # PE — reconstructed from T1_SL_TICK log
t1_dir       = "PE"
t1_exit_px   = 53872.0   # intrabar tick SL exit
t1_pts       = t1_entry_px - t1_exit_px  # = -81
t1_rs        = round(t1_pts * RS_PER_PT)

print(f"\n📍 T1 Entry  : {t1_dir} @ {t1_entry_px:.0f}  (10:00 AM candle signal)")
print(f"   T1 SL Hit: {t1_exit_px:.0f} intrabar @ 10:28 AM")
print(f"   T1 P&L   : {t1_pts:+.0f} pts  (₹{t1_rs:+,})")

# ── Actual RE (from real logs) ────────────────────────────────────────────────
re_dir      = "CE"        # opposite of PE
re_entry_px = 53872.0     # entered at T1 SL price
re_exit_px  = 53783.0     # intrabar tick SL
re_pts      = re_entry_px - re_exit_px  # CE: exit-entry = 53783-53872 = -89
re_pts      = re_exit_px - re_entry_px  # fix: CE pnl = exit - entry
re_rs       = round(re_pts * RS_PER_PT)

print(f"\n🔄 RE Entry  : {re_dir} @ {re_entry_px:.0f}  (immediate after T1 SL @ 10:28 AM)")
print(f"   RE SL Hit: {re_exit_px:.0f} intrabar @ 10:38 AM")
print(f"   RE P&L   : {re_pts:+.0f} pts  (₹{re_rs:+,})")

t1_re_pts = t1_pts + re_pts
t1_re_rs  = t1_rs + re_rs
print(f"\n   ⚡ DONE at 10:38 AM — T1+RE total: {t1_re_pts:+.0f} pts  (₹{t1_re_rs:+,})")
print(f"   💤 Old bot: LOCKED OUT rest of day. Missed massive PE drop.")

# ── Market after DONE ─────────────────────────────────────────────────────────
print(f"\n{'─'*60}")
print("  BankNifty AFTER DONE (missed moves):")
for t, o, h, l, c in CANDLES:
    arrow = "🔴" if c < o else "🟢"
    print(f"    {t}  {arrow}  O:{o:.0f}  H:{h:.0f}  L:{l:.0f}  C:{c:.0f}  ({c-o:+.0f})")

# ── T3 RECOVERY SIMULATION ───────────────────────────────────────────────────
print(f"\n{'─'*60}")
print("  🔄 T3 RECOVERY (NEW — with fix)")
print(f"  Logic: After RE SL → count 3 DONE candles → scan last-2 pair")
print()

# DONE candles start from C6 (10:30 AM candle) onward
# C6=index0, C7=index1, C8=index2 → doneCandles=3 at C8
done_candles = 0
t3_fired = False
done_start_idx = 2  # C6 (10:30 AM) is index 2 in CANDLES list

for idx in range(done_start_idx, len(CANDLES)):
    t, o, h, l, c = CANDLES[idx]
    done_candles += 1

    if done_candles < 3:
        print(f"    {t}  Waiting... (doneCandles={done_candles}/3)")
        continue

    # Scan last-2 pair (candles available up to and including this one)
    avail = CANDLES[:idx+1]
    res = t3_entry_scan(avail)

    if res is None:
        print(f"    {t}  No T3 signal (doneCandles={done_candles})")
        continue

    # T3 entry!
    t3_dir  = res["sig"]
    t3_px   = res["px"]
    t3_bl   = res["bl"]
    t3_rule = res["rule"]
    t3_sl   = t3_px + SL_INITIAL if t3_dir == "CE" else t3_px - SL_INITIAL
    # Wait: SL direction
    t3_sl   = (t3_px - SL_INITIAL) if t3_dir == "CE" else (t3_px + SL_INITIAL)

    print(f"    {t}  🎯 T3 {t3_dir} @ {t3_px:.0f}  BL:{t3_bl:.0f}  Rule:{t3_rule}  SL:{t3_sl:.0f}")

    # Simulate trade from next candle onward
    remaining = CANDLES[idx+1:]
    if not remaining:
        print(f"         No candles after entry — EOD exit @ {t3_px:.0f}")
        t3_pts, t3_exit_t, t3_exit_px, t3_reason = 0, t, t3_px, "EOD (no candles)"
    else:
        t3_pts, t3_exit_t, t3_exit_px, t3_reason = simulate_trail(t3_dir, t3_px, remaining, "T3")

    t3_rs = round(t3_pts * RS_PER_PT)

    print(f"         Exit: {t3_exit_t}  px:{t3_exit_px:.0f}  via {t3_reason}")
    print(f"         T3 P&L: {t3_pts:+.0f} pts  (₹{t3_rs:+,})")

    total_pts = t1_pts + re_pts + t3_pts
    total_rs  = t1_rs + re_rs + t3_rs
    print(f"\n{'='*60}")
    print(f"  📊 FINAL DAY RESULT (with T3):")
    print(f"     T1:    {t1_pts:+.0f} pts  (₹{t1_rs:+,})")
    print(f"     RE:    {re_pts:+.0f} pts  (₹{re_rs:+,})")
    print(f"     T3:    {t3_pts:+.0f} pts  (₹{t3_rs:+,})")
    print(f"     ─────────────────────────")
    print(f"     TOTAL: {total_pts:+.0f} pts  (₹{total_rs:+,})")
    print()
    print(f"  vs. WITHOUT T3: {t1_re_pts:+.0f} pts  (₹{t1_re_rs:+,})")
    improvement = total_pts - t1_re_pts
    print(f"  IMPROVEMENT:   {improvement:+.0f} pts  (₹{round(improvement*RS_PER_PT):+,})")
    print("=" * 60)

    t3_fired = True
    break

if not t3_fired:
    print("    T3 never fired on May 21 with this scan logic.")
    print(f"    (Day result stays at {t1_re_pts:+.0f} pts / ₹{t1_re_rs:+,})")
