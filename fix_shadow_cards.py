#!/usr/bin/env python3
# Patch: add in-trade pos card + full stats to TRAIL and LOCK50 shadow panels
# and update JS to drive them

FILE = '/root/zeroscreen/dist/server.js'
src = open(FILE, encoding='utf-8').read()
orig_len = len(src)

# ─────────────────────────────────────────────────────────────────────────────
# 1.  TRAIL panel — replace sh-pos-trail-wrap + stats div
# ─────────────────────────────────────────────────────────────────────────────
TRAIL_OLD = '        <div id="sh-pos-trail-wrap">'
TRAIL_OLD_END = '          <div style="font-size:.67rem;color:var(--muted);padding:4px 2px">Shadow paper strategy \u2014 trailDefault'

TRAIL_NEW = '''        <div id="sh-pos-trail-wrap">
          <!-- Flat / watching card -->
          <div class="sh-pos sh-pos-watch" id="sh-pos-trail-flat">
            <div class="watch-title"><span>\u23f3</span> TRAIL Shadow \u2014 <span id="sh-trail-status">Watching</span></div>
            <div id="sh-trail-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)">Watching for next signal\u23f3</div>
            <div id="sh-trail-watch" style="margin-top:10px"></div>
          </div>
          <!-- In-trade card (hidden when flat) -->
          <div class="pos-card pos-ce" id="sh-pos-trail-card" style="display:none">
            <div class="pos-hdr">
              <span class="pos-live-dot"></span>
              <span class="pos-badge pos-b-ce" id="sh-trail-card-badge">CE OPTION</span>
              <span class="pos-sym">BANKNIFTY</span>
              <span class="pos-mode">PAPER</span>
            </div>
            <div class="pos-pnl-rs g" id="sh-trail-card-rs">\u2014</div>
            <div class="pos-pnl-pts g" id="sh-trail-card-pts">\u2014 unrealised</div>
            <div class="pos-grid">
              <div><div class="pos-lbl">Entry Index</div><div class="pos-val mono" id="sh-trail-card-ep">\u2014</div></div>
              <div><div class="pos-lbl">Live Index</div><div class="pos-val g mono" id="sh-trail-card-lp">\u2014</div></div>
              <div><div class="pos-lbl">Stop Loss</div><div class="pos-val r mono" id="sh-trail-card-sl">\u2014</div></div>
              <div><div class="pos-lbl">SL Risk \u20b9</div><div class="pos-val r" id="sh-trail-card-slrs">\u2014</div></div>
            </div>
          </div>
        </div>
        <!-- Stats -->
        <div>
          <div class="ss-card">
            <div class="ss-row">
              <div><div class="ss-lbl">Today P&amp;L</div></div>
              <div style="text-align:right"><div class="ss-val" id="sh-trail-pnl-rs" style="color:#818cf8">\u2014</div><div class="ss-sub" id="sh-trail-pnl-pts"></div></div>
            </div>
            <div class="ss-row" id="sh-trail-unr-row" style="display:none">
              <div><div class="ss-lbl" style="color:var(--muted);font-style:italic">\u21b3 Unrealised</div></div>
              <div style="text-align:right"><div class="ss-val" id="sh-trail-unr-rs"></div><div class="ss-sub" id="sh-trail-unr-pts"></div></div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">Trades Today</div></div>
              <div style="text-align:right"><div class="ss-val" id="sh-trail-tc">0</div><div class="ss-sub"><span class="g" id="sh-trail-w">0W</span> / <span class="r" id="sh-trail-l">0L</span></div></div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">This Week</div></div>
              <div style="text-align:right"><div class="ss-val" id="sh-trail-wk-rs" style="color:#818cf8">\u2014</div><div class="ss-sub" id="sh-trail-wk-pts"></div></div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">All-Time P&amp;L</div></div>
              <div style="text-align:right"><div class="ss-val" style="color:var(--muted)">\u2014</div><div class="ss-sub">Paper only</div></div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">Win Rate (All-Time)</div></div>
              <div style="text-align:right"><div class="ss-val" id="sh-trail-wr">\u2014</div><div class="ss-sub" id="sh-trail-wrs"></div></div>
            </div>
          </div>
          <div style="font-size:.67rem;color:var(--muted);padding:4px 2px">Shadow paper strategy \u2014 trailDefault'''

# Find old TRAIL block: from sh-pos-trail-wrap to end of description div's opening
idx_start = src.find(TRAIL_OLD)
idx_end   = src.find(TRAIL_OLD_END)
if idx_start < 0 or idx_end < 0:
    print(f"FAIL: TRAIL anchors not found  start={idx_start}  end={idx_end}")
    exit(1)
# Find end of that description line (closing </div>)
idx_end_line = src.find('\n', idx_end)
old_trail_block = src[idx_start : idx_end_line]
src = src[:idx_start] + TRAIL_NEW + src[idx_end_line:]
print("OK: TRAIL panel HTML replaced")

# ─────────────────────────────────────────────────────────────────────────────
# 2.  LOCK50 Old panel — replace sh-pos-l50o-wrap + stats div
# ─────────────────────────────────────────────────────────────────────────────
L50O_OLD = '        <div id="sh-pos-l50o-wrap">'
L50O_OLD_END = '          <div style="font-size:.67rem;color:var(--muted);padding:4px 2px">Shadow paper strategy \u2014 trailLock50Old'

L50O_NEW = '''        <div id="sh-pos-l50o-wrap">
          <!-- Flat / watching card -->
          <div class="sh-pos sh-pos-watch" id="sh-pos-l50o-flat">
            <div class="watch-title"><span>\U0001f512</span> LOCK50 Old Shadow \u2014 <span id="sh-l50o-status">Watching</span></div>
            <div id="sh-l50o-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)">Watching for next signal\u23f3</div>
            <div id="sh-l50o-watch" style="margin-top:10px"></div>
          </div>
          <!-- In-trade card (hidden when flat) -->
          <div class="pos-card pos-ce" id="sh-pos-l50o-card" style="display:none">
            <div class="pos-hdr">
              <span class="pos-live-dot"></span>
              <span class="pos-badge pos-b-ce" id="sh-l50o-card-badge">CE OPTION</span>
              <span class="pos-sym">BANKNIFTY</span>
              <span class="pos-mode">PAPER</span>
            </div>
            <div class="pos-pnl-rs g" id="sh-l50o-card-rs">\u2014</div>
            <div class="pos-pnl-pts g" id="sh-l50o-card-pts">\u2014 unrealised</div>
            <div class="pos-grid">
              <div><div class="pos-lbl">Entry Index</div><div class="pos-val mono" id="sh-l50o-card-ep">\u2014</div></div>
              <div><div class="pos-lbl">Live Index</div><div class="pos-val g mono" id="sh-l50o-card-lp">\u2014</div></div>
              <div><div class="pos-lbl">Stop Loss</div><div class="pos-val r mono" id="sh-l50o-card-sl">\u2014</div></div>
              <div><div class="pos-lbl">SL Risk \u20b9</div><div class="pos-val r" id="sh-l50o-card-slrs">\u2014</div></div>
            </div>
          </div>
        </div>
        <!-- Stats -->
        <div>
          <div class="ss-card">
            <div class="ss-row">
              <div><div class="ss-lbl">Today P&amp;L</div></div>
              <div style="text-align:right"><div class="ss-val am" id="sh-l50o-pnl-rs">\u2014</div><div class="ss-sub" id="sh-l50o-pnl-pts"></div></div>
            </div>
            <div class="ss-row" id="sh-l50o-unr-row" style="display:none">
              <div><div class="ss-lbl" style="color:var(--muted);font-style:italic">\u21b3 Unrealised</div></div>
              <div style="text-align:right"><div class="ss-val" id="sh-l50o-unr-rs"></div><div class="ss-sub" id="sh-l50o-unr-pts"></div></div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">Trades Today</div></div>
              <div style="text-align:right"><div class="ss-val" id="sh-l50o-tc">0</div><div class="ss-sub"><span class="g" id="sh-l50o-w">0W</span> / <span class="r" id="sh-l50o-l">0L</span></div></div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">This Week</div></div>
              <div style="text-align:right"><div class="ss-val am" id="sh-l50o-wk-rs">\u2014</div><div class="ss-sub" id="sh-l50o-wk-pts"></div></div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">All-Time P&amp;L</div></div>
              <div style="text-align:right"><div class="ss-val" style="color:var(--muted)">\u2014</div><div class="ss-sub">Paper only</div></div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">Win Rate (All-Time)</div></div>
              <div style="text-align:right"><div class="ss-val" id="sh-l50o-wr">\u2014</div><div class="ss-sub" id="sh-l50o-wrs"></div></div>
            </div>
          </div>
          <div style="font-size:.67rem;color:var(--muted);padding:4px 2px">Shadow paper strategy \u2014 trailLock50Old'''

idx_start2 = src.find(L50O_OLD)
idx_end2   = src.find(L50O_OLD_END)
if idx_start2 < 0 or idx_end2 < 0:
    print(f"FAIL: LOCK50 anchors not found  start={idx_start2}  end={idx_end2}")
    exit(1)
idx_end2_line = src.find('\n', idx_end2)
src = src[:idx_start2] + L50O_NEW + src[idx_end2_line:]
print("OK: LOCK50 panel HTML replaced")

# ─────────────────────────────────────────────────────────────────────────────
# 3.  JS — update TRAIL shadow section to drive new card + stats
#     Find the TRAIL try block update section and extend it
# ─────────────────────────────────────────────────────────────────────────────
OLD_JS_TRAIL_CARD = "        if(ge('sh-trail-tc'))ge('sh-trail-tc').textContent=shTr;"
NEW_JS_TRAIL_CARD = """        if(ge('sh-trail-tc')){ge('sh-trail-tc').innerHTML=shTr+(shInT?'<span style="font-size:.6rem;color:#10b981"> +live</span>':'');}
        if(ge('sh-trail-wk-rs')){ge('sh-trail-wk-rs').textContent=fR(shTotal);ge('sh-trail-wk-rs').style.color=gc(shTotal);}
        if(ge('sh-trail-wk-pts'))ge('sh-trail-wk-pts').textContent=fP(shTotal);
        if(ge('sh-trail-wrs'))ge('sh-trail-wrs').textContent=(shW+shL)>0?shW+'W / '+shL+'L':'—';
        var _shFC=ge('sh-pos-trail-flat'),_shIC=ge('sh-pos-trail-card');
        if(_shFC&&_shIC){if(shInT&&shEp>0){_shFC.style.display='none';_shIC.style.display='';var _shDir2=(hb.shadowDir||'').toUpperCase();_shIC.className='pos-card pos-'+(_shDir2==='CE'?'ce':'pe');var _shBadge=ge('sh-trail-card-badge');if(_shBadge){_shBadge.className='pos-badge pos-b-'+(_shDir2==='CE'?'ce':'pe');_shBadge.textContent=_shDir2+' OPTION';}if(ge('sh-trail-card-rs')){ge('sh-trail-card-rs').textContent=fR(shUnr);ge('sh-trail-card-rs').className='pos-pnl-rs '+(shUnr>=0?'g':'r');}if(ge('sh-trail-card-pts')){ge('sh-trail-card-pts').textContent=fP(shUnr)+' unrealised';ge('sh-trail-card-pts').className='pos-pnl-pts '+(shUnr>=0?'g':'r');}if(ge('sh-trail-card-ep'))ge('sh-trail-card-ep').textContent=shEp.toFixed(1);if(ge('sh-trail-card-lp')){ge('sh-trail-card-lp').textContent=lp>0?lp.toFixed(1):'—';}if(ge('sh-trail-card-sl'))ge('sh-trail-card-sl').textContent=parseFloat(hb.shadowSL||0)>0?parseFloat(hb.shadowSL).toFixed(1):'—';var _shSlRs=Math.abs(parseFloat(hb.shadowSL||shEp)-shEp)*15;if(ge('sh-trail-card-slrs'))ge('sh-trail-card-slrs').textContent='\u20b9'+_shSlRs.toFixed(0);}else{_shFC.style.display='';_shIC.style.display='none';}}"""

if OLD_JS_TRAIL_CARD not in src:
    print("FAIL: TRAIL card JS anchor not found")
    exit(1)
src = src.replace(OLD_JS_TRAIL_CARD, NEW_JS_TRAIL_CARD, 1)
print("OK: TRAIL JS card update added")

# ─────────────────────────────────────────────────────────────────────────────
# 4.  JS — update LOCK50 shadow section to drive new card + stats
# ─────────────────────────────────────────────────────────────────────────────
OLD_JS_L50O_CARD = "        if(ge('sh-l50o-tc'))ge('sh-l50o-tc').textContent=s1Tr;"
NEW_JS_L50O_CARD = """        if(ge('sh-l50o-tc')){ge('sh-l50o-tc').innerHTML=s1Tr+(s1InT?'<span style="font-size:.6rem;color:#10b981"> +live</span>':'');}
        if(ge('sh-l50o-wk-rs')){ge('sh-l50o-wk-rs').textContent=fR(s1Total);ge('sh-l50o-wk-rs').style.color=gc(s1Total);}
        if(ge('sh-l50o-wk-pts'))ge('sh-l50o-wk-pts').textContent=fP(s1Total);
        if(ge('sh-l50o-wrs'))ge('sh-l50o-wrs').textContent=(s1W+s1L)>0?s1W+'W / '+s1L+'L':'—';
        var _s1FC=ge('sh-pos-l50o-flat'),_s1IC=ge('sh-pos-l50o-card');
        if(_s1FC&&_s1IC){if(s1InT&&s1Ep>0){_s1FC.style.display='none';_s1IC.style.display='';var _s1Dir2=(hb.scalp1Dir||'').toUpperCase();_s1IC.className='pos-card pos-'+(_s1Dir2==='CE'?'ce':'pe');var _s1Badge=ge('sh-l50o-card-badge');if(_s1Badge){_s1Badge.className='pos-badge pos-b-'+(_s1Dir2==='CE'?'ce':'pe');_s1Badge.textContent=_s1Dir2+' OPTION';}if(ge('sh-l50o-card-rs')){ge('sh-l50o-card-rs').textContent=fR(s1Unr);ge('sh-l50o-card-rs').className='pos-pnl-rs '+(s1Unr>=0?'g':'r');}if(ge('sh-l50o-card-pts')){ge('sh-l50o-card-pts').textContent=fP(s1Unr)+' unrealised';ge('sh-l50o-card-pts').className='pos-pnl-pts '+(s1Unr>=0?'g':'r');}if(ge('sh-l50o-card-ep'))ge('sh-l50o-card-ep').textContent=s1Ep.toFixed(1);if(ge('sh-l50o-card-lp')){ge('sh-l50o-card-lp').textContent=lp>0?lp.toFixed(1):'—';}if(ge('sh-l50o-card-sl'))ge('sh-l50o-card-sl').textContent=parseFloat(hb.scalp1SL||0)>0?parseFloat(hb.scalp1SL).toFixed(1):'—';var _s1SlRs=Math.abs(parseFloat(hb.scalp1SL||s1Ep)-s1Ep)*15;if(ge('sh-l50o-card-slrs'))ge('sh-l50o-card-slrs').textContent='\u20b9'+_s1SlRs.toFixed(0);}else{_s1FC.style.display='';_s1IC.style.display='none';}}"""

if OLD_JS_L50O_CARD not in src:
    print("FAIL: LOCK50 card JS anchor not found")
    exit(1)
src = src.replace(OLD_JS_L50O_CARD, NEW_JS_L50O_CARD, 1)
print("OK: LOCK50 JS card update added")

open(FILE, 'w', encoding='utf-8').write(src)
print(f"DONE — {len(src)-orig_len:+d} bytes delta")
