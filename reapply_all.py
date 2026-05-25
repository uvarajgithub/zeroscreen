"""Re-apply all session patches to server.ts using binary mode (safe for surrogate chars)"""
path = '/root/zeroscreen/src/server.ts'

with open(path, 'rb') as f:
    c = f.read()

patches = []

# ── PATCH 1: subtitle HYBRID_REVERSE → BHAV V3 ──────────────────────────────
p1_old = b'BANKNIFTY &middot; HYBRID_REVERSE &middot; <strong>${mode2.toUpperCase()}</strong>'
p1_new = b'BANKNIFTY &middot; BHAV V3 &middot; <strong>${mode2.toUpperCase()}</strong>'
if p1_old in c:
    c = c.replace(p1_old, p1_new, 1); patches.append('P1 HYBRID_REVERSE→BHAV V3 OK')
else:
    patches.append('P1 SKIP (already done or not found)')

# ── PATCH 2: expand sig3-sub row 1 ──────────────────────────────────────────
p2_old = (b'BANKNIFTY &middot; BHAV V3 &middot; <strong>${mode2.toUpperCase()}</strong>'
          b' &middot; 30 qty &middot; '
          b'&#8377; P&amp;L = index pts &times; 30 qty &times; 0.5&#948; = pts &times; 15</div>')
p2_new = (b'BANKNIFTY &middot; BHAV V3 &middot; <strong>${mode2.toUpperCase()}</strong>'
          b' &middot; 30 qty'
          b' &middot; SL: <strong>${_slPts2ssr} pts</strong>'
          b' &middot; Entry: PDH/PDL Break &middot; Candle-close SL &middot; Max 5 trades/day</div>')
if p2_old in c:
    c = c.replace(p2_old, p2_new, 1); patches.append('P2 subtitle row1 OK')
else:
    patches.append('P2 SKIP')

# ── PATCH 3: add subtitle rows 2 and 3 (after row 1) ────────────────────────
p3_old = (b' &middot; SL: <strong>${_slPts2ssr} pts</strong>'
          b' &middot; Entry: PDH/PDL Break &middot; Candle-close SL &middot; Max 5 trades/day</div>\n'
          b'      <div class="sig3-live">')
p3_new = (b' &middot; SL: <strong>${_slPts2ssr} pts</strong>'
          b' &middot; Entry: PDH/PDL Break &middot; Candle-close SL &middot; Max 5 trades/day</div>\n'
          b'        <div class="sig3-sub" style="margin-top:3px">'
          b'PDH: <span id="sig3-pdh" style="color:#10b981;font-weight:600">'
          b'${hb2?.bhavPrevDayHigh ?? "&mdash;"}</span>'
          b' &middot; PDL: <span id="sig3-pdl" style="color:#ef4444;font-weight:600">'
          b'${hb2?.bhavPrevDayLow ?? "&mdash;"}</span>'
          b' &middot; Candles today: <span id="sig3-cndl">${hb2?.bhavCandles ?? "&mdash;"}</span>'
          b' &middot; &#8377; P&amp;L: idx pts &times; 15 &middot; prem pts &times; 30</div>\n'
          b'        <div class="sig3-sub" style="margin-top:3px">'
          b'5yr Backtest (Jan&rsquo;21&ndash;May&rsquo;26):'
          b' <strong style="color:#10b981">&#8377;31.07L</strong>'
          b' &middot; 74.6% WR &middot; &#8377;2,583 avg/trade &middot; MaxDD &#8377;11,027</div>\n'
          b'      <div class="sig3-live">')
if p3_old in c:
    c = c.replace(p3_old, p3_new, 1); patches.append('P3 subtitle rows 2+3 OK')
else:
    patches.append('P3 SKIP')

# ── PATCH 4: add PDH/PDL/candles live update in _sig3Refresh ─────────────────
p4_old = b'      const shPnl=parseFloat((d.heartbeat?.shadowPnL??0).toFixed(0));'
p4_new = (b'      if(_ge("sig3-pdh")&&d.heartbeat?.bhavPrevDayHigh!=null)'
          b'_ge("sig3-pdh").textContent=d.heartbeat.bhavPrevDayHigh;\n'
          b'      if(_ge("sig3-pdl")&&d.heartbeat?.bhavPrevDayLow!=null)'
          b'_ge("sig3-pdl").textContent=d.heartbeat.bhavPrevDayLow;\n'
          b'      if(_ge("sig3-cndl")&&d.heartbeat?.bhavCandles!=null)'
          b'_ge("sig3-cndl").textContent=d.heartbeat.bhavCandles+" candles";\n'
          b'      const shPnl=parseFloat((d.heartbeat?.shadowPnL??0).toFixed(0));')
if p4_old in c:
    c = c.replace(p4_old, p4_new, 1); patches.append('P4 live PDH/PDL update OK')
else:
    patches.append('P4 SKIP')

# ── PATCH 5: inject hm CSS into sig3 style block ─────────────────────────────
# Find the sig3-sub CSS rule and the closing </style> right after sig3-dot rule
# The sig3 CSS block has sig3-dot near the end. Insert hm- classes before </style>
p5_old = (b'    .sig3-dot{width:8px;height:8px;border-radius:50%;'
          b'background:#10b981;box-shadow:0 0 6px #10b98188;animation:sig3p 1.4s infinite}\n'
          b'    </style>')
p5_new = (b'    .sig3-dot{width:8px;height:8px;border-radius:50%;'
          b'background:#10b981;box-shadow:0 0 6px #10b98188;animation:sig3p 1.4s infinite}\n'
          b'    .sig3-hm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-bottom:1rem;margin-top:.75rem}\n'
          b'    .sig3-hm-card{background:var(--card-bg,#1e293b);border:1px solid var(--border,#334155);border-radius:10px;padding:13px 16px;display:flex;align-items:center;gap:11px;transition:border-color .3s}\n'
          b'    .sig3-hm-card.hm-ok{border-color:rgba(16,185,129,.4)}\n'
          b'    .sig3-hm-card.hm-warn{border-color:rgba(251,191,36,.5)}\n'
          b'    .sig3-hm-card.hm-err{border-color:rgba(239,68,68,.5)}\n'
          b'    .sig3-hm-card.hm-dim{border-color:var(--border,#334155)}\n'
          b'    .sig3-hm-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;background:#475569}\n'
          b'    .sig3-hm-card.hm-ok .sig3-hm-dot{background:#10b981}\n'
          b'    .sig3-hm-card.hm-warn .sig3-hm-dot{background:#fbbf24;box-shadow:0 0 6px rgba(251,191,36,.6)}\n'
          b'    .sig3-hm-card.hm-err .sig3-hm-dot{background:#ef4444;box-shadow:0 0 7px rgba(239,68,68,.7);animation:sig3hmBlink 1s infinite}\n'
          b'    @keyframes sig3hmBlink{0%,100%{opacity:1}50%{opacity:.25}}\n'
          b'    .sig3-hm-label{font-size:.67rem;color:var(--text-muted,#94a3b8);text-transform:uppercase;letter-spacing:.05em;line-height:1}\n'
          b'    .sig3-hm-val{font-size:.82rem;font-weight:700;margin-top:4px;line-height:1.2}\n'
          b'    .sig3-hm-sub{font-size:.7rem;opacity:.65;margin-top:3px;line-height:1.2}\n'
          b'    .sig3-hm-fix button,.sig3-hm-fix a{font-size:.7rem;padding:2px 8px;border-radius:4px;cursor:pointer;border:1px solid currentColor;background:transparent;text-decoration:none;margin-top:4px;display:inline-block}\n'
          b'    .sig3-hm-alerts{display:flex;flex-direction:column;gap:8px;margin-bottom:1rem}\n'
          b'    .sig3-hm-alert{border-radius:10px;padding:11px 16px;border:1px solid;display:flex;align-items:flex-start;gap:12px}\n'
          b'    .sig3-hm-alert.hm-alert-err{background:rgba(239,68,68,.07);border-color:rgba(239,68,68,.4);color:#fca5a5}\n'
          b'    .sig3-hm-alert.hm-alert-warn{background:rgba(251,191,36,.07);border-color:rgba(251,191,36,.4);color:#fde68a}\n'
          b'    .sig3-hm-alert-title{font-weight:700;font-size:.82rem}\n'
          b'    .sig3-hm-alert-msg{font-size:.73rem;opacity:.8;margin-top:2px}\n'
          b'    .sig3-hm-alert-btn{display:inline-block;margin-top:7px;padding:3px 11px;border-radius:5px;font-size:.71rem;font-weight:700;cursor:pointer;border:1px solid currentColor;background:transparent;color:inherit;text-decoration:none}\n'
          b'    </style>')
if p5_old in c:
    c = c.replace(p5_old, p5_new, 1); patches.append('P5 hm CSS OK')
else:
    patches.append('P5 CSS SKIP (not found)')

# ── PATCH 6: add health monitor grid HTML after status bar ───────────────────
p6_old = (b'    </div>\n\n'
          b'    <!-- Strategy Tab Switcher -->')
# Find it after sig3-bot-status
bot_pos = c.find(b'id="sig3-bot-status"')
if bot_pos != -1:
    search_from = bot_pos
    p6_pos = c.find(p6_old, search_from)
    if p6_pos != -1 and p6_pos < bot_pos + 5000:
        hm_html = (
          b'\n    <!-- Health Monitor Grid -->\n'
          b'    <div class="sig3-hm-grid">\n'
          b'      <div class="sig3-hm-card hm-dim" id="s3hm-bot"><div class="sig3-hm-dot"></div><div><div class="sig3-hm-label">Bot Heartbeat</div><div class="sig3-hm-val" id="s3hm-bot-v">&mdash;</div><div class="sig3-hm-fix" id="s3hm-bot-fix" style="display:none"></div></div></div>\n'
          b'      <div class="sig3-hm-card hm-dim" id="s3hm-tok"><div class="sig3-hm-dot"></div><div><div class="sig3-hm-label">Zerodha Token</div><div class="sig3-hm-val" id="s3hm-tok-v">&mdash;</div><div class="sig3-hm-fix" id="s3hm-tok-fix" style="display:none"></div></div></div>\n'
          b'      <div class="sig3-hm-card hm-dim" id="s3hm-mkt"><div class="sig3-hm-dot"></div><div><div class="sig3-hm-label">Market</div><div class="sig3-hm-val" id="s3hm-mkt-v">&mdash;</div></div></div>\n'
          b'      <div class="sig3-hm-card hm-dim" id="s3hm-pos"><div class="sig3-hm-dot"></div><div><div class="sig3-hm-label">Position (BHAV)</div><div class="sig3-hm-val" id="s3hm-pos-v">&mdash;</div></div></div>\n'
          b'      <div class="sig3-hm-card hm-dim" id="s3hm-cnd"><div class="sig3-hm-dot"></div><div><div class="sig3-hm-label">Last 15-Min Candle</div><div class="sig3-hm-val" id="s3hm-cnd-v">&mdash;</div><div class="sig3-hm-sub" id="s3hm-cnd-s"></div></div></div>\n'
          b'      <div class="sig3-hm-card hm-dim" id="s3hm-pnl"><div class="sig3-hm-dot"></div><div><div class="sig3-hm-label">Today P&amp;L (BHAV)</div><div class="sig3-hm-val" id="s3hm-pnl-v">&mdash;</div></div></div>\n'
          b'      <div class="sig3-hm-card hm-dim" id="s3hm-trds"><div class="sig3-hm-dot"></div><div><div class="sig3-hm-label">Trades Today</div><div class="sig3-hm-val" id="s3hm-trds-v">&mdash;</div></div></div>\n'
          b'      <div class="sig3-hm-card hm-dim" id="s3hm-pdh"><div class="sig3-hm-dot"></div><div><div class="sig3-hm-label">PDH / PDL</div><div class="sig3-hm-val" id="s3hm-pdh-v">&mdash;</div><div class="sig3-hm-sub" id="s3hm-pdh-s"></div></div></div>\n'
          b'    </div>\n'
          b'    <div class="sig3-hm-alerts" id="s3hm-alerts" style="display:none"></div>\n'
        )
        p6_new = b'    </div>' + hm_html + b'\n    <!-- Strategy Tab Switcher -->'
        c = c[:p6_pos] + p6_new + c[p6_pos+len(p6_old):]
        patches.append('P6 hm grid HTML OK')
    else:
        patches.append('P6 HTML SKIP (pos not found near sig3-bot-status)')
else:
    patches.append('P6 HTML SKIP (sig3-bot-status not found)')

# ── PATCH 7: add health monitor JS update in _sig3Refresh ───────────────────
# Using a separate JS file approach to avoid escape issues
p7_old = b'      // \xe2\x94\x80\xe2\x94\x80 BHAV KPI\n      if(_ge("k3-today-rs")){'
hm_js = b"""      // Health Monitor update
      (function(){
        function s3hm(id,st,val){var c=_ge(id);if(!c)return;c.className="sig3-hm-card hm-"+st;var v=_ge(id+"-v");if(v)v.textContent=val;}
        var _hbAt=d.heartbeat&&d.heartbeat.at?new Date(d.heartbeat.at).getTime():0;
        var _hbAgo=_hbAt?(Date.now()-_hbAt):Infinity;
        var _hbMin=Math.round(_hbAgo/60000);
        var _alive=d.isAlive!==false;
        var _tk=!!d.tokenOK;
        var _ni=new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
        var _iH=_ni.getHours(),_iM=_ni.getMinutes();
        var _mO=(_iH>9||(_iH===9&&_iM>=15))&&(_iH<15||(_iH===15&&_iM<=30));
        var _a9=_iH>9||(_iH===9&&_iM>=15);
        var _iP=d.activeState&&!!(d.activeState.inTrade||d.activeState.activeTrade||d.activeState.mainEntryDone);
        var _pD=(d.activeState&&(d.activeState.tradeDirection||d.activeState.direction)||"").toUpperCase();
        var _lc=d.heartbeat&&d.heartbeat.lastCandle;
        var _tP=parseFloat(((d.today&&d.today.pnl||0)+(_iP?(d.activeState&&d.activeState.unrealisedPnL||0):0)).toFixed(0));
        var _tR=Math.round(_tP*15);
        var _tr=d.today&&d.today.trades||0;
        var _pdh=d.heartbeat&&d.heartbeat.bhavPrevDayHigh;
        var _pdl=d.heartbeat&&d.heartbeat.bhavPrevDayLow;
        var _cnd=d.heartbeat&&d.heartbeat.bhavCandles!=null?d.heartbeat.bhavCandles:null;
        s3hm("s3hm-bot",_alive?"ok":"err",_alive?(_hbAgo<90000?"Just now":_hbMin+"m ago"):"Offline"+(_hbAt?" ("+_hbMin+"m ago)":""));
        var _bf=_ge("s3hm-bot-fix");if(_bf){_bf.style.display=_alive?"none":"";if(!_alive)_bf.innerHTML='<button onclick="_botAction(\'restart\')">&#x21BB; Restart Bot</button>';}
        s3hm("s3hm-tok",_tk?"ok":"err",_tk?"Valid \u2713":"Expired \u2717");
        var _tf=_ge("s3hm-tok-fix");if(_tf){_tf.style.display=_tk?"none":"";if(!_tk)_tf.innerHTML='<a href="https://139-59-18-52.nip.io/login" target="_blank">&#128273; Refresh</a>';}
        s3hm("s3hm-mkt",_mO?"ok":"dim",_mO?"Open \u2014 closes 3:30 PM":"Closed");
        s3hm("s3hm-pos",_iP?"ok":"dim",_iP?(_pD||"?")+" OPTION \u25CF":"Flat \u2014 watching");
        var _cb=_lc&&_lc.colour==="bull";
        s3hm("s3hm-cnd",_lc?"ok":(_mO?"warn":"dim"),_lc?_lc.time+" "+(_cb?"\u25B2 Bull":"\u25BC Bear"):(_mO?"Awaiting candle":"No candle"));
        var _cs=_ge("s3hm-cnd-s");if(_cs)_cs.textContent=_cnd!=null?_cnd+" candles today":"";
        s3hm("s3hm-pnl",_tP>0?"ok":_tP<0?"err":"dim",(_tP>=0?"+":"-")+"\u20B9"+Math.abs(_tR).toLocaleString("en-IN")+" "+(_tP>=0?"+":"")+_tP+" pts");
        s3hm("s3hm-trds",_tr>0?"ok":"dim",_tr+" trade"+(_tr!==1?"s":"")+" ("+(d.today&&d.today.wins||0)+"W/"+(d.today&&d.today.losses||0)+"L)");
        if(_pdh&&_pdl){s3hm("s3hm-pdh","ok","\u25B2 "+_pdh);var _ps=_ge("s3hm-pdh-s");if(_ps)_ps.textContent="\u25BC "+_pdl;}
        var _ac=_ge("s3hm-alerts");if(_ac){
          var _is=[];
          if(_a9&&_mO){
            if(!_alive)_is.push({t:"err",tt:"\u26A0 Bot Offline",m:"No heartbeat"+(_hbAt?" ("+_hbMin+"m ago)":"")+".",fn:"_botAction('restart')",bl:"\u21BB Restart"});
            if(!_tk)_is.push({t:"warn",tt:"\uD83D\uDD11 Token Expired",m:"Submit fresh token.",href:"https://139-59-18-52.nip.io/login",bl:"\u2192 Refresh Token"});
            if(_alive&&_hbAgo>4*60*1000)_is.push({t:"warn",tt:"\u23F0 Stale Heartbeat",m:"Last hb "+_hbMin+"m ago.",fn:"_botAction('restart')",bl:"\u21BB Restart"});
          }
          if(_is.length){_ac.style.display="flex";_ac.innerHTML=_is.map(function(x){var b=x.href?'<a class="sig3-hm-alert-btn" href="'+x.href+'" target="_blank">'+x.bl+'</a>':'<button class="sig3-hm-alert-btn" onclick="'+x.fn+'">'+x.bl+'</button>';return '<div class="sig3-hm-alert hm-alert-'+x.t+'"><div><div class="sig3-hm-alert-title">'+x.tt+'</div><div class="sig3-hm-alert-msg">'+x.m+'</div>'+b+'</div></div>';}).join("");}
          else{_ac.style.display="none";_ac.innerHTML="";}
        }
      })();
      // \xe2\x94\x80\xe2\x94\x80 BHAV KPI
      if(_ge("k3-today-rs")){"""
if p7_old in c:
    c = c.replace(p7_old, hm_js, 1); patches.append('P7 hm JS OK')
else:
    patches.append('P7 JS SKIP (not found)')

with open(path, 'wb') as f:
    f.write(c)

print('\n'.join(patches))
print('\nWRITTEN OK')
