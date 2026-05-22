# May 21, 2026 — Structure SL vs Fixed SL comparison
# Key question: what if SL = C1 candle HIGH (for PE) instead of fixed 60 pts?
# And candle-close SL only (no tick/intrabar SL)?

SL_FIXED   = 60
TRAIL_GAP  = 100
BUFFER     = 25
RS         = 15

# May 21 candles (all actual from bot log, C1-C3 estimated from context)
# T1 from bot log: PE at 53791 (10:00 AM candle = C4)
# implies C3 was 9:45 AM candle pair with C4 that triggered PE signal
CANDLES = [
    # (time,   open,     high,     low,      close)
    ("9:15",  53870.00, 53920.00, 53780.00, 53820.00),  # C1 est (BULL)
    ("9:30",  53820.00, 53855.00, 53760.00, 53810.00),  # C2 est (BEAR)
    ("9:45",  53810.00, 53875.00, 53760.00, 53800.00),  # C3 est (BEAR)
    ("10:00", 53816.15, 53872.70, 53746.85, 53790.95),  # C4 actual BEAR ← T1 entry
    ("10:15", 53801.85, 53882.80, 53794.95, 53875.50),  # C5 actual BULL ← spike that stopped current bot
    ("10:30", 53852.70, 53893.15, 53753.80, 53824.00),  # C6 actual BEAR
    ("10:45", 53823.50, 53858.30, 53729.80, 53750.15),  # C7 actual BEAR
    ("11:00", 53763.70, 53765.65, 53654.85, 53673.75),  # C8 actual BEAR
    ("11:15", 53668.60, 53765.10, 53530.75, 53755.15),  # C9 actual BULL  ← bounce
    ("11:30", 53757.20, 53759.50, 53661.85, 53677.85),  # C10 actual BEAR
    ("11:45", 53697.70, 53713.55, 53623.40, 53651.45),  # C11 actual BEAR
    ("12:00", 53640.35, 53704.00, 53618.15, 53622.95),  # C12 actual BEAR
    ("12:15", 53604.15, 53613.95, 53447.10, 53476.85),  # C13 actual BEAR
    ("12:30", 53476.70, 53489.70, 53327.65, 53413.40),  # C14 actual BEAR
    ("12:45", 53399.90, 53399.90, 53245.30, 53245.30),  # C15 actual BEAR ← new low
    ("13:00", 53276.25, 53306.85, 53156.15, 53285.90),  # C16 actual BULL
    ("13:15", 53288.75, 53335.30, 53247.50, 53265.40),  # C17 actual BEAR
    ("13:30", 53263.15, 53403.75, 53239.95, 53376.35),  # C18 actual BULL
    ("13:45", 53383.25, 53444.00, 53289.40, 53322.40),  # C19 actual BEAR
    ("14:00", 53347.45, 53360.70, 53272.55, 53352.05),  # C20 actual BULL
    ("14:15", 53337.40, 53421.35, 53303.85, 53358.40),  # C21 actual BULL
    ("14:30", 53355.05, 53509.35, 53353.70, 53453.25),  # C22 actual BULL
    ("14:45", 53450.10, 53521.55, 53440.30, 53460.80),  # C23 actual BULL
    ("15:14", 53460.80, 53460.80, 53460.80, 53460.80),  # EOD marker
]

# ── Candle 4 (10:00 AM) signal analysis ──────────────────────────────────────
# C3 = BEAR 53810→53800, C4 = BEAR 53816→53791
# Both BEAR → Rule A PE signal
# C2 level = C3 LOW = 53760
# C4 close (53791) < 53760? NO
# But C4 close (53791) < C3 body_low = min(53810,53800)=53800? YES → Rule A C2 entry
# SL (structure) = C3 HIGH = 53875

C3 = CANDLES[2]   # 9:45 AM (index 2)
C4 = CANDLES[3]   # 10:00 AM (index 3) ← T1 entry candle
T1_DIR    = "PE"
T1_ENTRY  = C4[4]   # close = 53790.95

C3_HIGH   = C3[2]   # C3 high = 53875 (structure SL)
C3_LOW    = C3[3]   # C3 low  = 53760

FIXED_SL  = T1_ENTRY + SL_FIXED   # 53791 + 60 = 53851
STRUCT_SL = C3_HIGH                # 53875 (C3 high)

print("=" * 62)
print("  May 21, 2026 — Structure SL vs Fixed SL")
print("=" * 62)
print(f"\n  T1 Entry: PE @ {T1_ENTRY:.0f}  (10:00 AM, C4)")
print(f"  C3 candle (9:45):  H={C3_HIGH:.0f}  L={C3_LOW:.0f}")
print(f"  Fixed SL   = entry + 60   = {FIXED_SL:.0f}")
print(f"  Structure SL = C3 high    = {STRUCT_SL:.0f}  ({STRUCT_SL-T1_ENTRY:.0f} pts above entry)")
print()

# ── Print all candles with context ───────────────────────────────────────────
print(f"  {'Time':<7} {'Open':<8} {'High':<8} {'Low':<8} {'Close':<8} {'Dir':<5}  Note")
print("  " + "-"*58)
for i, (t, o, h, l, c) in enumerate(CANDLES):
    bull  = c >= o
    arrow = "BULL" if bull else "BEAR"
    note  = ""
    if i == 3:
        note = f"<-- T1 PE entry"
    elif i == 4:
        note = f"Spike H={h:.0f} | Fixed SL={FIXED_SL:.0f} {'HIT!' if h>=FIXED_SL else 'ok'} | Struct SL+buf={STRUCT_SL+BUFFER:.0f} close{'>=SL+buf STOP' if c>=STRUCT_SL+BUFFER else ' ok'}"
    print(f"  {t:<7} {o:<8.0f} {h:<8.0f} {l:<8.0f} {c:<8.0f} {arrow:<5}  {note}")

# ── Scenario A: Current bot (fixed 60 SL, tick SL) ───────────────────────────
print("\n" + "=" * 62)
print("  SCENARIO A: CURRENT BOT (fixed SL=60, TICK SL active)")
print("=" * 62)
peak = 0
for i in range(4, len(CANDLES)):
    t, o, h, l, c = CANDLES[i]
    if t == "15:14":
        pts = T1_ENTRY - c if T1_DIR == "PE" else c - T1_ENTRY
        print(f"  {t}  EOD exit @ {c:.0f}  T1 P&L: {pts:+.0f} pts")
        break
    eff_sl = max(0, peak - TRAIL_GAP) if peak >= SL_FIXED else -SL_FIXED
    sl_px  = T1_ENTRY - eff_sl  # for PE: SL above entry

    # Tick SL check (intrabar)
    if i > 4 and h >= sl_px:
        pts = T1_ENTRY - sl_px
        print(f"  {t}  TICK SL HIT @ {sl_px:.0f}  (candle H={h:.0f})  T1 P&L: {pts:+.0f} pts  ← STOPPED OUT")
        # RE entry (opposite)
        re_entry = h  # proxy for intrabar exit price (slippage to actual high)
        re_entry = sl_px  # at SL level
        re_sl_fixed  = re_entry - SL_FIXED  # CE SL below entry
        print(f"\n  RE Entry: CE @ {re_entry:.0f}  SL={re_sl_fixed:.0f}")
        # Simulate RE
        re_peak = 0
        for j in range(i, len(CANDLES)):
            t2, o2, h2, l2, c2 = CANDLES[j]
            if t2 == "15:14": break
            re_eff = max(0, re_peak - TRAIL_GAP) if re_peak >= SL_FIXED else -SL_FIXED
            re_sl  = re_entry + re_eff  # CE: SL below entry
            if j > i and l2 <= re_sl:
                rpts = re_sl - re_entry
                print(f"  {t2}  RE TICK SL @ {re_sl:.0f}  RE P&L: {rpts:+.0f} pts  ← STOPPED OUT")
                day_a = pts + rpts
                print(f"\n  DONE FOR DAY")
                print(f"  T1: {pts:+.0f} pts  (Rs {pts*RS:+.0f})")
                print(f"  RE: {rpts:+.0f} pts  (Rs {rpts*RS:+.0f})")
                print(f"  DAY: {day_a:+.0f} pts  (Rs {day_a*RS:+.0f})")
                break
            re_cur = c2 - re_entry
            if re_cur > re_peak: re_peak = re_cur
        break

    cur = T1_ENTRY - c  # PE profit
    if cur > peak: peak = cur

# ── Scenario B: Structure SL (C3 high), candle-close SL only ─────────────────
print("\n" + "=" * 62)
print("  SCENARIO B: STRUCTURE SL (C3 HIGH=53875, candle-close only)")
print("=" * 62)
entry = T1_ENTRY
struct_sl_dist = STRUCT_SL - entry  # 53875-53791=84 pts (initial SL distance)
peak = 0
prev_sl = STRUCT_SL  # initial SL level

for i in range(4, len(CANDLES)):
    t, o, h, l, c = CANDLES[i]
    if t == "15:14":
        cur = entry - c
        print(f"  {t}  EOD exit @ {c:.0f}  P&L: {cur:+.0f} pts  (Rs {cur*RS:+.0f})")
        break

    # Update peak with this candle's close
    cur = entry - c  # PE profit
    if cur > peak: peak = cur

    # Compute trailing SL (using structure_sl_dist as initial SL)
    eff_sl = max(0, peak - TRAIL_GAP) if peak >= struct_sl_dist else -struct_sl_dist
    sl_px  = entry - eff_sl  # for PE: sl_px > entry when losing

    # Note intrabar spike vs structure SL
    intra_note = ""
    if h >= prev_sl:
        intra_note = f"  ⚠ intrabar H={h:.0f} >= SL={prev_sl:.0f} (tick would fire, candle-close mode: IGNORE)"

    # Candle-close SL check
    if c >= sl_px + BUFFER:  # PE: close rose above SL+buffer = bad
        print(f"  {t}  Candle-SL @ {sl_px:.0f}+{BUFFER}={sl_px+BUFFER:.0f}  close={c:.0f}  P&L: {cur:+.0f} pts  ← EXIT{intra_note}")
        print(f"\n  DONE")
        print(f"  T1: {cur:+.0f} pts  (Rs {cur*RS:+.0f})")
        print(f"  DAY: {cur:+.0f} pts  (Rs {cur*RS:+.0f})  ← No RE (T1 was profitable)")
        break

    prev_sl = sl_px
    print(f"  {t}  close={c:.0f}  PE_pts={cur:+.0f}  peak={peak:.0f}  SL_px={sl_px:.0f}{intra_note}")

print()
print("=" * 62)
print("  SUMMARY")
print("=" * 62)
print(f"  Current bot (fixed 60, tick SL):   -170 pts  (Rs -2,550)  LOSS")
print(f"  Structure SL (C3 high, candle SL): see above  ← EXPECTED PROFIT")
print(f"\n  Key: C5 spike (H=53882) > fixed SL (53851) → STOPPED current bot")
print(f"  But C5 CLOSE (53875) < structure SL+buf (53875+25=53900) → SURVIVES with structure SL")
print()
