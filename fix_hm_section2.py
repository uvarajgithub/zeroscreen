path = '/root/zeroscreen/src/server.ts'
with open(path, encoding='utf-8', errors='surrogatepass') as f:
    c = f.read()

# ── CSS: inject hm- classes into sig3 style block ──────────────────────────
OLD_CSS = '    .sig3-sub{font-size:.72rem;color:var(--text-muted);margin-top:2px}\n    </style>'
NEW_CSS = '''    .sig3-sub{font-size:.72rem;color:var(--text-muted);margin-top:2px}
    .sig3-hm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-bottom:1rem;margin-top:.75rem}
    .sig3-hm-card{background:var(--card-bg,#1e293b);border:1px solid var(--border,#334155);border-radius:10px;padding:13px 16px;display:flex;align-items:center;gap:11px;transition:border-color .3s}
    .sig3-hm-card.hm-ok{border-color:rgba(16,185,129,.4)}
    .sig3-hm-card.hm-warn{border-color:rgba(251,191,36,.5)}
    .sig3-hm-card.hm-err{border-color:rgba(239,68,68,.5)}
    .sig3-hm-card.hm-dim{border-color:var(--border,#334155)}
    .sig3-hm-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;background:#475569}
    .sig3-hm-card.hm-ok .sig3-hm-dot{background:#10b981}
    .sig3-hm-card.hm-warn .sig3-hm-dot{background:#fbbf24;box-shadow:0 0 6px rgba(251,191,36,.6)}
    .sig3-hm-card.hm-err .sig3-hm-dot{background:#ef4444;box-shadow:0 0 7px rgba(239,68,68,.7);animation:sig3hmBlink 1s infinite}
    @keyframes sig3hmBlink{0%,100%{opacity:1}50%{opacity:.25}}
    .sig3-hm-label{font-size:.67rem;color:var(--text-muted,#94a3b8);text-transform:uppercase;letter-spacing:.05em;line-height:1}
    .sig3-hm-val{font-size:.82rem;font-weight:700;margin-top:4px;line-height:1.2}
    .sig3-hm-sub{font-size:.7rem;opacity:.65;margin-top:3px;line-height:1.2}
    .sig3-hm-fix button,.sig3-hm-fix a{font-size:.7rem;padding:2px 8px;border-radius:4px;cursor:pointer;border:1px solid currentColor;background:transparent;text-decoration:none;margin-top:4px;display:inline-block}
    .sig3-hm-alerts{display:flex;flex-direction:column;gap:8px;margin-bottom:1rem}
    .sig3-hm-alert{border-radius:10px;padding:11px 16px;border:1px solid;display:flex;align-items:flex-start;gap:12px}
    .sig3-hm-alert.hm-alert-err{background:rgba(239,68,68,.07);border-color:rgba(239,68,68,.4);color:#fca5a5}
    .sig3-hm-alert.hm-alert-warn{background:rgba(251,191,36,.07);border-color:rgba(251,191,36,.4);color:#fde68a}
    .sig3-hm-alert-title{font-weight:700;font-size:.82rem}
    .sig3-hm-alert-msg{font-size:.73rem;opacity:.8;margin-top:2px}
    .sig3-hm-alert-btn{display:inline-block;margin-top:7px;padding:3px 11px;border-radius:5px;font-size:.71rem;font-weight:700;cursor:pointer;border:1px solid currentColor;background:transparent;color:inherit;text-decoration:none}
    </style>'''

if OLD_CSS in c:
    c = c.replace(OLD_CSS, NEW_CSS, 1)
    print('CSS patch OK')
else:
    print('CSS patch NOT FOUND')

# ── HTML: add health monitor grid after sig3-bot-status closing div ─────────
OLD_HTML = '''    </div>

    <!-- Strategy Tab Switcher -->'''
NEW_HTML = '''    </div>

    <!-- ⚡ Health Monitor Grid -->
    <div class="sig3-hm-grid" id="sig3-hmg">
      <div class="sig3-hm-card hm-dim" id="s3hm-bot"><div class="sig3-hm-dot"></div><div><div class="sig3-hm-label">Bot Heartbeat</div><div class="sig3-hm-val" id="s3hm-bot-v">&mdash;</div><div class="sig3-hm-fix" id="s3hm-bot-fix" style="display:none"></div></div></div>
      <div class="sig3-hm-card hm-dim" id="s3hm-tok"><div class="sig3-hm-dot"></div><div><div class="sig3-hm-label">Zerodha Token</div><div class="sig3-hm-val" id="s3hm-tok-v">&mdash;</div><div class="sig3-hm-fix" id="s3hm-tok-fix" style="display:none"></div></div></div>
      <div class="sig3-hm-card hm-dim" id="s3hm-mkt"><div class="sig3-hm-dot"></div><div><div class="sig3-hm-label">Market</div><div class="sig3-hm-val" id="s3hm-mkt-v">&mdash;</div></div></div>
      <div class="sig3-hm-card hm-dim" id="s3hm-pos"><div class="sig3-hm-dot"></div><div><div class="sig3-hm-label">Position (BHAV)</div><div class="sig3-hm-val" id="s3hm-pos-v">&mdash;</div></div></div>
      <div class="sig3-hm-card hm-dim" id="s3hm-cnd"><div class="sig3-hm-dot"></div><div><div class="sig3-hm-label">Last 15-Min Candle</div><div class="sig3-hm-val" id="s3hm-cnd-v">&mdash;</div><div class="sig3-hm-sub" id="s3hm-cnd-s"></div></div></div>
      <div class="sig3-hm-card hm-dim" id="s3hm-pnl"><div class="sig3-hm-dot"></div><div><div class="sig3-hm-label">Today P&amp;L (BHAV)</div><div class="sig3-hm-val" id="s3hm-pnl-v">&mdash;</div></div></div>
      <div class="sig3-hm-card hm-dim" id="s3hm-trds"><div class="sig3-hm-dot"></div><div><div class="sig3-hm-label">Trades Today</div><div class="sig3-hm-val" id="s3hm-trds-v">&mdash;</div></div></div>
      <div class="sig3-hm-card hm-dim" id="s3hm-pdh"><div class="sig3-hm-dot"></div><div><div class="sig3-hm-label">PDH / PDL</div><div class="sig3-hm-val" id="s3hm-pdh-v">&mdash;</div><div class="sig3-hm-sub" id="s3hm-pdh-s"></div></div></div>
    </div>
    <div class="sig3-hm-alerts" id="s3hm-alerts" style="display:none"></div>

    <!-- Strategy Tab Switcher -->'''

# Find the right instance - the one that closes sig3-bot-status
# It's the first occurrence after sig3-bot-status
bot_status_pos = c.find('id="sig3-bot-status"')
if bot_status_pos == -1:
    print('ERROR: sig3-bot-status not found')
else:
    search_from = bot_status_pos
    old_pos = c.find(OLD_HTML, search_from)
    if old_pos != -1:
        c = c[:old_pos] + NEW_HTML + c[old_pos+len(OLD_HTML):]
        print('HTML patch OK')
    else:
        print('HTML patch NOT FOUND')

# ── JS: add health monitor updates at start of _sig3Refresh success handler ─
OLD_JS = '''      // ── BHAV KPI
      if(_ge("k3-today-rs")){'''
NEW_JS = '''      // ── Health Monitor update
      (function(){
        function s3hm(id,state,val){var c=_ge(id);if(!c)return;c.className="sig3-hm-card hm-"+state;var v=_ge(id+"-v");if(v)v.textContent=val;}
        var hbAt=d.heartbeat&&d.heartbeat.at?new Date(d.heartbeat.at).getTime():0;
        var hbAgo=hbAt?(Date.now()-hbAt):Infinity;
        var hbMin=Math.round(hbAgo/60000);
        var alive=d.isAlive!==false;
        var tkOK=!!d.tokenOK;
        var nowI=new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
        var iH=nowI.getHours(),iM=nowI.getMinutes();
        var mktOpen=(iH>9||(iH===9&&iM>=15))&&(iH<15||(iH===15&&iM<=30));
        var after915=iH>9||(iH===9&&iM>=15);
        var inPos=d.activeState&&!!(d.activeState.inTrade||d.activeState.activeTrade||d.activeState.mainEntryDone);
        var posDir=(d.activeState&&(d.activeState.tradeDirection||d.activeState.direction)||"").toUpperCase();
        var lc=d.heartbeat&&d.heartbeat.lastCandle;
        var todayPnl=parseFloat(((d.today&&d.today.pnl||0)+(inPos?(d.activeState&&d.activeState.unrealisedPnL||0):0)).toFixed(0));
        var todayRs=Math.round(todayPnl*15);
        var trades=d.today&&d.today.trades||0;
        var pdh=d.heartbeat&&d.heartbeat.bhavPrevDayHigh;
        var pdl=d.heartbeat&&d.heartbeat.bhavPrevDayLow;
        var cndls=d.heartbeat&&d.heartbeat.bhavCandles!=null?d.heartbeat.bhavCandles:null;
        // bot heartbeat
        s3hm("s3hm-bot",alive?"ok":"err",alive?(hbAgo<90000?"Just now":hbMin+"m ago"):"Offline"+(hbAt?" ("+hbMin+"m ago)":""));
        var bf=_ge("s3hm-bot-fix");if(bf){bf.innerHTML=alive?"":'<button onclick="_botAction(\'restart\')">\u21BB Restart Bot</button>';bf.style.display=alive?"none":"";}
        // token
        s3hm("s3hm-tok",tkOK?"ok":"err",tkOK?"Valid \u2713":"Expired \u2717");
        var tf=_ge("s3hm-tok-fix");if(tf){tf.innerHTML=tkOK?"":'<a href="https://139-59-18-52.nip.io/login" target="_blank">\uD83D\uDD11 Refresh</a>';tf.style.display=tkOK?"none":"";}
        // market
        s3hm("s3hm-mkt",mktOpen?"ok":"dim",mktOpen?"Open \u2014 closes 3:30 PM":"Closed");
        // position
        s3hm("s3hm-pos",inPos?"ok":"dim",inPos?(posDir||"?")+" OPTION \u25CF":"Flat \u2014 watching");
        // last candle
        var cndBull=lc&&lc.colour==="bull";
        var cndMain=lc?lc.time+" ("+(cndBull?"\u25B2 Bull":"\u25BC Bear")+")":mktOpen?"Awaiting next candle":"No candle";
        s3hm("s3hm-cnd",lc?"ok":(mktOpen?"warn":"dim"),cndMain);
        var cs=_ge("s3hm-cnd-s");if(cs)cs.textContent=cndls!=null?cndls+" candles today":"";
        // today P&L
        s3hm("s3hm-pnl",todayPnl>0?"ok":todayPnl<0?"err":"dim",(todayPnl>=0?"+":"-")+"\u20B9"+Math.abs(todayRs).toLocaleString("en-IN")+" ("+(todayPnl>=0?"+":"")+todayPnl+" pts)");
        // trades today
        s3hm("s3hm-trds",trades>0?"ok":"dim",trades+" trade"+(trades!==1?"s":"")+" ("+(d.today&&d.today.wins||0)+"W/"+(d.today&&d.today.losses||0)+"L)");
        // PDH / PDL
        if(pdh&&pdl){s3hm("s3hm-pdh","ok","\u25B2 "+pdh);var ps=_ge("s3hm-pdh-s");if(ps)ps.textContent="\u25BC "+pdl;}
        // alerts
        var ac=_ge("s3hm-alerts");if(ac){
          var issues=[];
          if(after915&&mktOpen){
            if(!alive)issues.push({t:"err",i:"\u26A0\uFE0F",tt:"Bot Offline",m:"No heartbeat"+(hbAt?" ("+hbMin+"m ago)":"")+".",fn:"_botAction('restart')",bl:"\u21BB Restart"});
            if(!tkOK)issues.push({t:"warn",i:"\uD83D\uDD11",tt:"Token Expired",m:"Submit fresh token.",href:"https://139-59-18-52.nip.io/login",bl:"\u2192 Refresh Token"});
            if(alive&&hbAgo>4*60*1000)issues.push({t:"warn",i:"\u23F0",tt:"Heartbeat Stale",m:"Last hb "+hbMin+"m ago.",fn:"_botAction('restart')",bl:"\u21BB Restart"});
          }
          if(issues.length){
            ac.style.display="flex";
            ac.innerHTML=issues.map(function(iss){
              var btn=iss.href?'<a class="sig3-hm-alert-btn" href="'+iss.href+'" target="_blank">'+iss.bl+'</a>':'<button class="sig3-hm-alert-btn" onclick="'+iss.fn+'">'+iss.bl+'</button>';
              return '<div class="sig3-hm-alert hm-alert-'+iss.t+'"><div><div class="sig3-hm-alert-title">'+iss.i+" "+iss.tt+'</div><div class="sig3-hm-alert-msg">'+iss.m+'</div>'+btn+'</div></div>';
            }).join("");
          } else {
            ac.style.display="none";ac.innerHTML="";
          }
        }
      })();
      // ── BHAV KPI
      if(_ge("k3-today-rs")){'''

if OLD_JS in c:
    c = c.replace(OLD_JS, NEW_JS, 1)
    print('JS patch OK')
else:
    print('JS patch NOT FOUND')

with open(path, 'w', encoding='utf-8', errors='surrogatepass') as f:
    f.write(c)
print('ALL DONE')
