with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

errors = []

# ══ PATCH S3: Single BHAV V3 strategy card ══════════════════════════════════
old_s3 = (b'<div class="stab-wrap">\n'
    b'      <button class="stab act" id="stab-lock50" type="button" onclick="_sTab(\'lock50\')">\n'
    b'        <span class="stab-name">&#9679; AMINA 100</span>\n'
    b'        <span class="stab-sub">LIVE v2.0</span>\n'
    b'        <span class="stab-pnl" id="stab-pnl-lock50" style="color:${an2.today.pnl>=0?\'#059669\':\'#dc2626\'}">${fmtRs2(an2.today.pnl)}</span>\n'
    b'      </button>\n'
    b'      <button class="stab" id="stab-trail" type="button" onclick="_sTab(\'trail\')">\n'
    b'        <span class="stab-name">&#9670; Trail</span>\n'
    b'        <span class="stab-sub">Paper shadow</span>\n'
    b'        <span class="stab-pnl" id="stab-pnl-trail" style="color:${(hb2.shadowPnL??0)>=0?\'#059669\':\'#dc2626\'}">${fmtRs2(hb2.shadowPnL??0)}</span>\n'
    b'      </button>\n'
    b'      <button class="stab" id="stab-lock50old" type="button" onclick="_sTab(\'lock50old\')">\n'
    b'        <span class="stab-name">&#9671; Lock50</span>\n'
    b'        <span class="stab-sub">Paper shadow</span>\n'
    b'        <span class="stab-pnl" id="stab-pnl-l50o" style="color:${(hb2.scalp1PnL??0)>=0?\'#059669\':\'#dc2626\'}">${fmtRs2(hb2.scalp1PnL??0)}</span>\n'
    b'      </button>\n'
    b'      <button class="stab" id="stab-vmt" type="button" onclick="_sTab(\'vmt\')">\n'
    b'        <span class="stab-name">&#128161; VMT</span>\n'
    b'        <span class="stab-sub">Option shadow</span>\n'
    b'        <span class="stab-pnl" id="stab-pnl-vmt" style="color:#8b949e">&#8212;</span>\n'
    b'      </button>\n'
    b'    </div>\n'
    b'    <script>/* _sTab defined in main script below */</script>')
new_s3 = (b'<div class="stab-wrap">\n'
    b'      <div class="stab act" style="cursor:default;min-width:260px">\n'
    b'        <span class="stab-name">&#9679; BHAV V3</span>\n'
    b'        <span class="stab-sub">${mode2} &middot; 30 qty &middot; SL: ${_slPts2ssr} pts</span>\n'
    b'        <span class="stab-pnl" id="stab-pnl-bhav" style="color:${an2.today.pnl>=0?\'#059669\':\'#dc2626\'}">${fmtRs2(an2.today.pnl)}</span>\n'
    b'      </div>\n'
    b'    </div>')
if old_s3 in c: c = c.replace(old_s3, new_s3, 1); print("S3: OK")
else: errors.append("S3")

# ══ PATCH S1: subtitle rows (BODY_BREAKOUT → BHAV V3 + rows 2+3) ═══════════
old_sub = (b'class="db-sub">BANKNIFTY \xc2\xb7 BODY_BREAKOUT \xc2\xb7 <strong>${mode2}</strong>'
           b' \xc2\xb7 30 qty \xc2\xb7 \xe2\x82\xb9 P&L = pts \xc3\x97 15</div>')
new_sub = (b'class="db-sub">BANKNIFTY &middot; BHAV V3 &middot; <strong>${mode2}</strong>'
           b' &middot; 30 qty &middot; SL: ${_slPts2ssr} pts &middot; Entry: PDH/PDL Break'
           b' &middot; Candle-close SL &middot; Max 5 trades/day</div>\n'
           b'        <div class="db-sub" style="margin-top:3px">'
           b'PDH: <span id="db-pdh" style="color:#10b981;font-weight:600">${hb2?.bhavPrevDayHigh ?? "&mdash;"}</span>'
           b' &middot; PDL: <span id="db-pdl" style="color:#ef4444;font-weight:600">${hb2?.bhavPrevDayLow ?? "&mdash;"}</span>'
           b' &middot; Candles today: <span id="db-cndl">${hb2?.bhavCandles ?? "&mdash;"}</span>'
           b' &middot; &#8377; P&amp;L: idx pts &times; 15 &middot; prem pts &times; 30</div>\n'
           b'        <div class="db-sub" style="margin-top:3px">'
           b'5yr Backtest (Jan&rsquo;21&ndash;May&rsquo;26): <strong style="color:#10b981">&#8377;31.07L</strong>'
           b' &middot; 74.6% WR &middot; &#8377;2,583 avg/trade &middot; MaxDD &#8377;11,027</div>')
if old_sub in c: c = c.replace(old_sub, new_sub, 1); print("S1 subtitle: OK")
else: errors.append("S1-subtitle")

# ══ PATCH S1 PDH/PDL live JS ═════════════════════════════════════════════════
old_pdh = b"ge('db-upd').textContent='Updated '+new Date("
new_pdh = (b"var _pd=d.heartbeat||{};"
           b"if(document.getElementById('db-pdh')&&_pd.bhavPrevDayHigh)document.getElementById('db-pdh').textContent=_pd.bhavPrevDayHigh;"
           b"if(document.getElementById('db-pdl')&&_pd.bhavPrevDayLow)document.getElementById('db-pdl').textContent=_pd.bhavPrevDayLow;"
           b"if(document.getElementById('db-cndl')&&_pd.bhavCandles!==undefined)document.getElementById('db-cndl').textContent=_pd.bhavCandles;"
           b"\n      ge('db-upd').textContent='Updated '+new Date(")
if old_pdh in c: c = c.replace(old_pdh, new_pdh, 1); print("S1 PDH JS: OK")
else: errors.append("S1-pdh-js")

# ══ PATCH S4: Timeline HTML rows (BHAV V3 steps) ════════════════════════════
old_row0_anchor = (b'<div class="pm-tl" id="atl-tl">\n'
    b'                    <div class="pm-tl-row" id="atl-row-0">')
new_row0_anchor = (b'<div class="pm-tl" id="atl-tl">\n'
    b'          <div class="pm-tl-row" id="atl-row-0">')
if old_row0_anchor in c: c = c.replace(old_row0_anchor, new_row0_anchor, 1); print("S4 row0 anchor: OK")
else: errors.append("S4-row0")

old_rows18 = (b'          <div class="pm-tl-row" id="atl-row-1">\n'
    b'            <div class="pm-tl-dot" id="atl-dot-1"></div>\n'
    b'            <div class="pm-tl-txt">\n'
    b'              <div class="pm-tl-time">8:30 AM &mdash; Global Cues</div>\n'
    b'              <div class="pm-tl-label">Check Gift Nifty / SGX Nifty for BNF gap-up or gap-down bias</div>\n'
    b'            </div>\n'
    b'          </div>\n'
    b'          <div class="pm-tl-row" id="atl-row-2">\n'
    b'            <div class="pm-tl-dot" id="atl-dot-2"></div>\n'
    b'            <div class="pm-tl-txt">\n'
    b'              <div class="pm-tl-time">9:15 AM &mdash; Market Opens &mdash; Bot Active</div>\n'
    b'              <div class="pm-tl-label">Bot begins scanning. First 15-min candle (C1) starts forming</div>\n'
    b'            </div>\n'
    b'          </div>\n'
    b'          <div class="pm-tl-row" id="atl-row-3">\n'
    b'            <div class="pm-tl-dot" id="atl-dot-3"></div>\n'
    b'            <div class="pm-tl-txt">\n'
    b'              <div class="pm-tl-time">9:15 &ndash; 9:30 AM &mdash; C1 Candle Watch</div>\n'
    b'              <div class="pm-tl-label">Bot records C1 high &amp; low. No entries during this window</div>\n'
    b'            </div>\n'
    b'          </div>\n'
    b'          <div class="pm-tl-row" id="atl-row-4">\n'
    b'            <div class="pm-tl-dot" id="atl-dot-4"></div>\n'
    b'            <div class="pm-tl-txt">\n'
    b'              <div class="pm-tl-time">9:30 AM &mdash; C1 Level Locked</div>\n'
    b'              <div class="pm-tl-label">C1 high/low fixed. C2 early-entry scan begins immediately</div>\n'
    b'              <div class="pm-tl-note show" style="display:block;font-size:.61rem;color:#7c3aed;font-weight:600;margin-top:2px">C2 breaks C1 level at close &rarr; enter at C2.close &rarr; SL: &minus;60 pts, trail 100 pts behind peak</div>\n'
    b'            </div>\n'
    b'          </div>\n'
    b'          <div class="pm-tl-row" id="atl-row-5">\n'
    b'            <div class="pm-tl-dot" id="atl-dot-5"></div>\n'
    b'            <div class="pm-tl-txt">\n'
    b'              <div class="pm-tl-time">9:30 &ndash; 9:45 AM &mdash; C2 Early Entry Window</div>\n'
    b'              <div class="pm-tl-label">If C2.close breaks C1 level &rarr; enter at C2.close. SL: &minus;60 pts</div>\n'
    b'            </div>\n'
    b'          </div>\n'
    b'          <div class="pm-tl-row" id="atl-row-6">\n'
    b'            <div class="pm-tl-dot" id="atl-dot-6"></div>\n'
    b'            <div class="pm-tl-txt">\n'
    b'              <div class="pm-tl-time">9:45 AM &mdash; C3+ Rolling Scan Active</div>\n'
    b'              <div class="pm-tl-label">No C2 entry? Bot watches every candle to break max(C1, C2) level</div>\n'
    b'            </div>\n'
    b'          </div>\n'
    b'          <div class="pm-tl-row" id="atl-row-7">\n'
    b'            <div class="pm-tl-dot" id="atl-dot-7"></div>\n'
    b'            <div class="pm-tl-txt">\n'
    b'              <div class="pm-tl-time">3:14 PM &mdash; EOD Exit</div>\n'
    b'              <div class="pm-tl-label">Bot exits all open positions at market. P&amp;L locked for the day</div>\n'
    b'            </div>\n'
    b'          </div>\n'
    b'          <div class="pm-tl-row" id="atl-row-8">\n'
    b'            <div class="pm-tl-dot" id="atl-dot-8"></div>\n'
    b'            <div class="pm-tl-txt">\n'
    b'              <div class="pm-tl-time">3:30 PM &mdash; Market Closes</div>\n'
    b'              <div class="pm-tl-label">Session complete. Bot sleeping until next trading day</div>\n'
    b'            </div>\n'
    b'          </div>\n'
    b'        </div>')
new_rows18 = (b'          <div class="pm-tl-row" id="atl-row-1">\n'
    b'            <div class="pm-tl-dot" id="atl-dot-1"></div>\n'
    b'            <div class="pm-tl-txt">\n'
    b'              <div class="pm-tl-time">8:30 AM &mdash; Global Cues</div>\n'
    b'              <div class="pm-tl-label">Check Gift Nifty / SGX Nifty for BNF gap-up or gap-down bias</div>\n'
    b'            </div>\n'
    b'          </div>\n'
    b'          <div class="pm-tl-row" id="atl-row-2">\n'
    b'            <div class="pm-tl-dot" id="atl-dot-2"></div>\n'
    b'            <div class="pm-tl-txt">\n'
    b'              <div class="pm-tl-time">9:00 AM &mdash; PDH/PDL Levels Ready</div>\n'
    b'              <div class="pm-tl-label">Previous Day High &amp; Low loaded. CE trigger: close &gt; PDH &bull; PE trigger: close &lt; PDL</div>\n'
    b'            </div>\n'
    b'          </div>\n'
    b'          <div class="pm-tl-row" id="atl-row-3">\n'
    b'            <div class="pm-tl-dot" id="atl-dot-3"></div>\n'
    b'            <div class="pm-tl-txt">\n'
    b'              <div class="pm-tl-time">9:15 AM &mdash; Market Opens &mdash; Bot Active</div>\n'
    b'              <div class="pm-tl-label">Bot scanning every 15-min candle for PDH/PDL breakout at close</div>\n'
    b'            </div>\n'
    b'          </div>\n'
    b'          <div class="pm-tl-row" id="atl-row-4">\n'
    b'            <div class="pm-tl-dot" id="atl-dot-4"></div>\n'
    b'            <div class="pm-tl-txt">\n'
    b'              <div class="pm-tl-time">9:30 AM &mdash; C1 Closes &mdash; First Signal Check</div>\n'
    b'              <div class="pm-tl-label">C1.close &gt; PDH &rarr; CE entry &bull; C1.close &lt; PDL &rarr; PE entry &bull; SL: candle-close</div>\n'
    b'            </div>\n'
    b'          </div>\n'
    b'          <div class="pm-tl-row" id="atl-row-5">\n'
    b'            <div class="pm-tl-dot" id="atl-dot-5"></div>\n'
    b'            <div class="pm-tl-txt">\n'
    b'              <div class="pm-tl-time">9:30 AM onwards &mdash; Rolling Candle Scan Active</div>\n'
    b'              <div class="pm-tl-label" id="atl-lbl-5">Every 15-min candle: close &gt; PDH &rarr; CE &bull; close &lt; PDL &rarr; PE &bull; Max 5 trades/day</div>\n'
    b'            </div>\n'
    b'          </div>\n'
    b'          <div class="pm-tl-row" id="atl-row-6">\n'
    b'            <div class="pm-tl-dot" id="atl-dot-6"></div>\n'
    b'            <div class="pm-tl-txt">\n'
    b'              <div class="pm-tl-time">9:45 AM &mdash; Scan Continues</div>\n'
    b'              <div class="pm-tl-label">SL checked only at candle close &mdash; no intrabar wick stop</div>\n'
    b'            </div>\n'
    b'          </div>\n'
    b'          <div class="pm-tl-row" id="atl-row-7">\n'
    b'            <div class="pm-tl-dot" id="atl-dot-7"></div>\n'
    b'            <div class="pm-tl-txt">\n'
    b'              <div class="pm-tl-time">3:14 PM &mdash; EOD Exit</div>\n'
    b'              <div class="pm-tl-label">Bot exits all open positions at market. P&amp;L locked for the day</div>\n'
    b'            </div>\n'
    b'          </div>\n'
    b'          <div class="pm-tl-row" id="atl-row-8">\n'
    b'            <div class="pm-tl-dot" id="atl-dot-8"></div>\n'
    b'            <div class="pm-tl-txt">\n'
    b'              <div class="pm-tl-time">3:30 PM &mdash; Market Closes</div>\n'
    b'              <div class="pm-tl-label">Session complete. Bot sleeping until next trading day</div>\n'
    b'            </div>\n'
    b'          </div>\n'
    b'          <!-- trade events injected by JS -->\n'
    b'          <div id="atl-trades"></div>\n'
    b'        </div>')
if old_rows18 in c: c = c.replace(old_rows18, new_rows18, 1); print("S4 rows 1-8: OK")
else: errors.append("S4-rows")

# ══ PATCH S4: _ATL timing + _ATLPH badges + row2 isActive ════════════════════
old_atl = b'var _ATL=[{id:0,h:7,m:30},{id:1,h:8,m:30},{id:2,h:9,m:15},{id:3,h:9,m:15},{id:4,h:9,m:30},{id:5,h:9,m:30},{id:6,h:9,m:45},{id:7,h:15,m:14},{id:8,h:15,m:30}];'
new_atl = b'var _ATL=[{id:0,h:7,m:30},{id:1,h:8,m:30},{id:2,h:9,m:0},{id:3,h:9,m:15},{id:4,h:9,m:30},{id:5,h:9,m:30},{id:6,h:9,m:45},{id:7,h:15,m:14},{id:8,h:15,m:30}];'
if old_atl in c: c = c.replace(old_atl, new_atl, 1); print("S4 _ATL: OK")
else: errors.append("S4-atl")

old_ph = b"var _ATLPH=[[7,30,'Token Refresh',''],[8,30,'Pre-Market',''],[9,15,'Global Cues',''],[9,30,'C1 Forming','live'],[9,45,'C2 Entry','live'],[15,14,'C3+ Scan','live'],[15,30,'EOD Exit','live'],[24,0,'Closed','closed']];"
new_ph = b"var _ATLPH=[[7,30,'Token Refresh',''],[8,30,'Pre-Market',''],[9,0,'Levels Ready',''],[9,15,'Mkt Open','live'],[9,30,'PDH/PDL Scan','live'],[9,45,'Rolling Scan','live'],[15,14,'EOD Exit','live'],[15,30,'Closed','closed'],[24,0,'Closed','closed']];"
if old_ph in c: c = c.replace(old_ph, new_ph, 1); print("S4 _ATLPH: OK")
else: errors.append("S4-atlph")

old_r2 = b'if(row.id===2){isActive=nowM>=_atlM(9,15)&&nowM<_atlM(9,30);isDone=nowM>=_atlM(9,30);}'
new_r2 = b'if(row.id===2){isActive=nowM>=_atlM(9,0)&&nowM<_atlM(9,15);isDone=nowM>=_atlM(9,15);}'
if old_r2 in c: c = c.replace(old_r2, new_r2, 1); print("S4 row2 timing: OK")
else: errors.append("S4-r2")

# ══ PATCH: Trade events injected into existing atl-tl via _dbRefresh JS ═════
# Inject after the todayTrades block in _dbRefresh
# Anchor: the closing } of if(d.todayTrades) block
idx_tt = c.find(b'if(d.todayTrades){')
block_close = c.find(b'\n\n      //', idx_tt)  # next double-newline comment after block
print(f"todayTrades block close at: {block_close}")
print(repr(c[block_close:block_close+40]))

trade_js = (
    b"\n      // trade events in timeline\n"
    b"      var _atlTr=document.getElementById('atl-trades');\n"
    b"      if(_atlTr){\n"
    b"        var _tds=(d.todayTrades||[]).filter(function(t){return t.exitPrice&&t.exitPrice>0;});\n"
    b"        var _html='';\n"
    b"        // live trade first\n"
    b"        if(d.inTrade&&parseFloat((d.heartbeat||{}).entryPrice||0)>0){\n"
    b"          var _ep=parseFloat(d.heartbeat.entryPrice);var _dr=(d.heartbeat.direction||'').toUpperCase();\n"
    b"          var _lp=parseFloat(d.heartbeat.lastPrice||0);var _unr=_lp>0?(_dr==='CE'?_lp-_ep:_ep-_lp):0;\n"
    b"          var _ucol=_unr>=0?'#10b981':'#ef4444';\n"
    b"          _html+='<div class=\"pm-tl-row\"><div class=\"pm-tl-dot active\">\u25c6</div>'\n"
    b"            +'<div class=\"pm-tl-txt\"><div class=\"pm-tl-time\" style=\"color:#f59e0b\">'\n"
    b"            +(_dr?'<b style=\"color:'+(_dr==='CE'?'#60a5fa':'#fca5a5')+'\">'+_dr+'</b> ':'')\n"
    b"            +'IN TRADE \u2014 Entry '+_ep.toFixed(0)+(_lp>0?' \u2192 LTP '+_lp.toFixed(0):'')+'</div>'\n"
    b"            +'<div class=\"pm-tl-label\"><b style=\"color:'+_ucol+'\">'+((_unr>=0?'+':'')+(_unr*15).toFixed(0))+'</b>'\n"
    b"            +' unrealised \u00b7 '+(_unr>=0?'+':'')+_unr.toFixed(0)+' pts</div></div></div>';\n"
    b"        }\n"
    b"        // closed trades\n"
    b"        _tds.slice().reverse().forEach(function(t){\n"
    b"          var _p=t.pnl||0;var _col=_p>=0?'#10b981':'#ef4444';\n"
    b"          var _pts=Math.round(_p/15);\n"
    b"          var _tm=t.date?new Date(t.date).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}):'';\n"
    b"          var _dur=t.duration?(t.duration<60?t.duration+'s':Math.round(t.duration/60)+'m'):'';\n"
    b"          _html+='<div class=\"pm-tl-row\">'\n"
    b"            +'<div class=\"pm-tl-dot '+(_p>=0?'done':'err')+'\" style=\"color:'+_col+';background:'+_col+'20\">'+(_p>=0?'\u2714':'\u2715')+'</div>'\n"
    b"            +'<div class=\"pm-tl-txt\"><div class=\"pm-tl-time\">'\n"
    b"            +(t.direction?'<b style=\"color:'+(t.direction==='CE'?'#60a5fa':'#fca5a5')+'\">'+t.direction+'</b> ':'')\n"
    b"            +_tm+' \u2014 Entry '+(t.entryPrice||0).toFixed(0)+' \u2192 Exit '+(t.exitPrice||0).toFixed(0)+'</div>'\n"
    b"            +'<div class=\"pm-tl-label\"><b style=\"color:'+_col+'\">'+((_p>=0?'+':'')+'\u20b9'+Math.abs(_p).toFixed(0))+'</b>'\n"
    b"            +' \u00b7 '+(_p>=0?'+':'')+_pts+' pts'\n"
    b"            +(_dur?' \u00b7 '+_dur:'')\n"
    b"            +(t.reasonExit?' \u00b7 <span style=\"font-size:.6rem;opacity:.75\">'+t.reasonExit+'</span>':'')+'</div></div></div>';\n"
    b"        });\n"
    b"        if(!_html&&!d.inTrade)_html='<div style=\"font-size:.72rem;color:#8b949e;padding:4px 0 0 28px\">No trades yet today</div>';\n"
    b"        _atlTr.innerHTML=_html;\n"
    b"      }\n"
)

if block_close != -1:
    c = c[:block_close] + trade_js + c[block_close:]
    print("Trade JS: OK")
else:
    errors.append("trade-js")

# ══ Add .pm-tl-dot.err CSS (for loss trades) ═════════════════════════════════
old_dot_css = b'.pm-tl-dot.done{background:#10b981;color:#fff}'
if old_dot_css in c:
    c = c.replace(old_dot_css, b'.pm-tl-dot.done{background:#10b981;color:#fff}.pm-tl-dot.err{background:#ef4444;color:#fff;font-size:.55rem;display:flex;align-items:center;justify-content:center}', 1)
    print("dot.err CSS: OK")

print(f"\nErrors: {errors}" if errors else "\nAll patches OK")
with open('/root/zeroscreen/dist/server.js', 'wb') as f:
    f.write(c)
print(f"Size: {len(c)}")
