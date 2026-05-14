"""
CORRECT backtest for May 14, 2026 - BANKNIFTY 15-min candles.

TICK TRAIL - correct engine (MIN_BREAKOUT_MARGIN=50, structure-seed refCandle,
              trailLock50, wick-SL, candle-close entries, re-entry on every candle)
TRAIL      - processHybridCandle with trailDefault  (HR_ENTRY_BUF=25)
LOCK50 Old - processHybridCandle with trailDefault  (trailLock50Old undefined -> default)
All: unlimited trades
"""
import json

QTY_MULT = 15   # 30 qty x 0.5 delta = Rs.15/pt

# -- trail functions ----------------------------------------------------
def trail_default(sl, entry, dir_, peak):
    lock = 0
    if   peak >= 200: lock = 100
    elif peak >= 100: lock = 20
    if lock == 0: return sl
    return max(sl, entry+lock) if dir_=="CE" else min(sl, entry-lock)

def trail_lock50(sl, entry, dir_, peak):
    if peak <= 100: return sl
    lock = peak - 50
    return max(sl, entry+lock) if dir_=="CE" else min(sl, entry-lock)

# -- TRAIL / LOCK50 Old engine (processHybridCandle exact port) ---------
def create_state():
    return dict(inTrade=False,dir=None,entry=0.0,sl=0.0,refHigh=0.0,
                firstDone=False,reUsed=False,waitReEntry=False,isC1=False,
                peakProfit=0.0)

def process_candle(state, prev, curr, is_eod, trail_fn):
    bh = max(prev["open"], prev["close"])
    bl = min(prev["open"], prev["close"])
    if state["inTrade"]:
        if state["isC1"]:
            state["isC1"] = False
            pnl = (curr["close"]-state["entry"]) if state["dir"]=="CE" else (state["entry"]-curr["close"])
            if pnl < -3:
                state.update(inTrade=False,firstDone=False,waitReEntry=False,reUsed=False)
                return {"action":"EXIT_EARLY","pts":-3.0}
        sl_hit = (curr["low"]<=state["sl"]) if state["dir"]=="CE" else (curr["high"]>=state["sl"])
        if sl_hit:
            pts = (state["sl"]-state["entry"]) if state["dir"]=="CE" else (state["entry"]-state["sl"])
            past = (curr["close"]<state["sl"]) if state["dir"]=="CE" else (curr["close"]>state["sl"])
            if past and not state["reUsed"]:
                rd = "PE" if state["dir"]=="CE" else "CE"
                re = curr["close"]
                rs = (re-100) if rd=="CE" else (re+100)
                state.update(dir=rd,entry=re,sl=rs,
                             refHigh=curr["high"] if rd=="CE" else curr["low"],
                             reUsed=True,isC1=True,peakProfit=0.0)
                return {"action":"REVERSE_ENTER","dir":rd,"price":re,"prev_pts":pts}
            state["inTrade"] = False
            if not state["reUsed"]: state["waitReEntry"] = True
            else:                   state["firstDone"]   = False
            state["peakProfit"] = 0.0
            return {"action":"EXIT_SL","pts":pts}
        hp = (curr["high"]-state["entry"]) if state["dir"]=="CE" else (state["entry"]-curr["low"])
        if hp > state["peakProfit"]:
            state["peakProfit"] = hp
            state["sl"] = trail_fn(state["sl"],state["entry"],state["dir"],state["peakProfit"])
        if is_eod:
            pts = (curr["close"]-state["entry"]) if state["dir"]=="CE" else (state["entry"]-curr["close"])
            state["inTrade"] = False
            return {"action":"EXIT_EOD","pts":pts}
        return {"action":"NONE"}

    if state["waitReEntry"]:
        rt = (state["dir"]=="CE" and curr["close"]>state["refHigh"]) or \
             (state["dir"]=="PE" and curr["close"]<state["refHigh"])
        if rt:
            e=curr["close"]; sl=(e-100) if state["dir"]=="CE" else (e+100)
            state.update(entry=e,sl=sl,inTrade=True,waitReEntry=False,reUsed=True,isC1=True,peakProfit=0.0)
            return {"action":"ENTER","dir":state["dir"],"price":e}
        da = (state["refHigh"]-curr["close"]) if state["dir"]=="CE" else (curr["close"]-state["refHigh"])
        if da > 150:
            state["waitReEntry"] = False
            if curr["close"] > bh+25:
                e=curr["close"]
                state.update(dir="CE",entry=e,sl=e-100,refHigh=curr["high"],inTrade=True,reUsed=True,isC1=True,peakProfit=0.0)
                return {"action":"ENTER","dir":"CE","price":e}
            if curr["close"] < bl-25:
                e=curr["close"]
                state.update(dir="PE",entry=e,sl=e+100,refHigh=curr["low"],inTrade=True,reUsed=True,isC1=True,peakProfit=0.0)
                return {"action":"ENTER","dir":"PE","price":e}
            state["firstDone"]=False; state["reUsed"]=True
        return {"action":"NONE"}

    if state["firstDone"] or is_eod: return {"action":"NONE"}
    if curr["close"] > bh+25:
        e=curr["close"]
        state.update(dir="CE",entry=e,sl=e-100,refHigh=curr["high"],inTrade=True,firstDone=True,isC1=True,peakProfit=0.0)
        return {"action":"ENTER","dir":"CE","price":e}
    if curr["close"] < bl-25:
        e=curr["close"]
        state.update(dir="PE",entry=e,sl=e+100,refHigh=curr["low"],inTrade=True,firstDone=True,isC1=True,peakProfit=0.0)
        return {"action":"ENTER","dir":"PE","price":e}
    return {"action":"NONE"}

def sim_shadow(name, candles, trail_fn):
    state = create_state()
    trades = []; pnl = 0.0; wins = losses = 0
    open_entry = open_dir = None; t_num = 0
    for i in range(1, len(candles)):
        prev=candles[i-1]; curr=candles[i]
        tm=curr["time"][11:16]; h,m=int(tm[:2]),int(tm[3:])
        is_eod = h>15 or (h==15 and m>=15)
        sig = process_candle(state, prev, curr, is_eod, trail_fn)
        if sig["action"] == "ENTER":
            t_num+=1; open_entry=sig["price"]; open_dir=sig["dir"]
        elif sig["action"] == "REVERSE_ENTER":
            if open_entry is not None:
                pts=sig.get("prev_pts",-100.0); pnl+=pts
                if pts>0: wins+=1
                else:     losses+=1
                trades.append((t_num,open_dir,open_entry,curr["close"],"REVERSE",round(pts,0),tm))
            t_num+=1; open_entry=sig["price"]; open_dir=sig["dir"]
        elif sig["action"] in ("EXIT_EARLY","EXIT_SL","EXIT_EOD"):
            pts=sig["pts"]; pnl+=pts
            rsn={"EXIT_EARLY":"C1-exit","EXIT_SL":"SL-wick","EXIT_EOD":"EOD"}[sig["action"]]
            if pts>0: wins+=1
            else:     losses+=1
            trades.append((t_num,open_dir,open_entry,curr["close"],rsn,round(pts,0),tm))
            open_entry=open_dir=None
    return name, trades, pnl, wins, losses

# -- TICK TRAIL engine (correct: MIN_BREAKOUT_MARGIN=50, refCandle, trailLock50) --
def sim_tick_trail(candles):
    MARGIN = 50
    trades = []; pnl = 0.0; wins = losses = 0; t_num = 0
    # State
    in_trade=False; entry=0.0; sl_=0.0; dir_=None; isC1=False; peak=0.0
    # refCandle = structure seed = first candle (9:15)
    ref = candles[0]

    for i in range(1, len(candles)):
        curr = candles[i]
        tm = curr["time"][11:16]; h,m = int(tm[:2]),int(tm[3:])
        is_eod = h>15 or (h==15 and m>=15)
        ref_bh = max(ref["open"],ref["close"]); ref_bl = min(ref["open"],ref["close"])

        # -- signal detection (before monitoring, same as bot code order) --
        signal = None
        if not is_eod:
            if curr["close"] > ref_bh + MARGIN: signal = "CE"
            elif curr["close"] < ref_bl - MARGIN: signal = "PE"
        # update refCandle if signal fired
        if signal: ref = curr

        # -- monitor open trade --------------------------------------------
        if in_trade:
            if isC1:
                isC1 = False
                c1pnl = (curr["close"]-entry) if dir_=="CE" else (entry-curr["close"])
                if c1pnl < -3:
                    in_trade=False; losses+=1; pnl-=3
                    trades.append((t_num,dir_,entry,curr["close"],"C1-exit",-3,tm))
            if in_trade:
                sl_hit = (curr["low"]<=sl_) if dir_=="CE" else (curr["high"]>=sl_)
                if sl_hit:
                    pts=(sl_-entry) if dir_=="CE" else (entry-sl_)
                    in_trade=False
                    if pts>0: wins+=1
                    else:     losses+=1
                    pnl+=pts
                    trades.append((t_num,dir_,entry,sl_,"SL-wick",round(pts,0),tm))
                else:
                    hp=(curr["high"]-entry) if dir_=="CE" else (entry-curr["low"])
                    if hp>peak:
                        peak=hp
                        sl_=trail_lock50(sl_,entry,dir_,peak)
                    if is_eod:
                        pts=(curr["close"]-entry) if dir_=="CE" else (entry-curr["close"])
                        in_trade=False
                        if pts>0: wins+=1
                        else:     losses+=1
                        pnl+=pts
                        trades.append((t_num,dir_,entry,curr["close"],"EOD",round(pts,0),tm))

        # -- entry (if signal fired and now flat) ---------------------------
        if signal and not in_trade and not is_eod:
            t_num+=1
            e=curr["close"]
            in_trade=True; entry=e; sl_=(e-100) if signal=="CE" else (e+100)
            dir_=signal; isC1=True; peak=0.0

    return "TICK TRAIL (trailLock50, buf=50)", trades, pnl, wins, losses

# -- load candles -------------------------------------------------------
raw = json.load(open("/tmp/today_candles.json"))
candles = [{"time":c[0],"open":c[1],"high":c[2],"low":c[3],"close":c[4]} for c in raw]
print(f"Candles: {len(candles)}  |  {candles[0]['time'][11:16]} to {candles[-1]['time'][11:16]}\n")

results = [
    sim_tick_trail(candles),
    sim_shadow("TRAIL      (trailDefault, buf=25)", candles, trail_default),
    sim_shadow("LOCK50 Old (trailDefault, buf=25)", candles, trail_default),
]

for (name,trades,pnl,wins,losses) in results:
    print(f"{'='*62}")
    print(f"  {name}")
    print(f"{'='*62}")
    print(f"  {'#':<3} {'Dir':<4} {'Entry':>8} {'Exit':>8} {'Reason':<10} {'Pts':>7}  Time")
    print(f"  {'-'*57}")
    for (tn,d,en,ex,rsn,pts,tm) in trades:
        s="+" if pts>=0 else ""; en_=en if en else 0; ex_=ex if ex else 0
        print(f"  T{tn:<2} {d:<4} {en_:>8.1f} {ex_:>8.1f} {rsn:<10} {s}{pts:>6.0f}  {tm}")
    s="+" if pnl>=0 else ""; rs=pnl*QTY_MULT; rss="+" if rs>=0 else ""
    print(f"  {'-'*57}")
    print(f"  TOTAL: {s}{pnl:.0f} pts  ({rss}Rs.{abs(rs):,.0f})  |  {wins}W / {losses}L\n")

print(f"{'='*62}")
print(f"  SUMMARY  (QTY_MULT={QTY_MULT})")
print(f"{'='*62}")
print(f"  {'Strategy':<34} {'Pts':>7}  {'Rs P&L':>12}  W/L")
print(f"  {'-'*60}")
for (name,trades,pnl,wins,losses) in results:
    s="+" if pnl>=0 else ""; rs=pnl*QTY_MULT; rss="+" if rs>=0 else ""
    print(f"  {name:<34} {s}{pnl:>6.0f}  {rss}Rs.{abs(rs):>9,.0f}  {wins}W/{losses}L")
print(f"{'='*62}")
