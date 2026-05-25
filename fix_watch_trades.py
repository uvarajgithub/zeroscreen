with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8') as f:
    c = f.read()

OLD = (
    "          noEl.innerHTML=\n"
    "            '<div class=\"watch-lvl-row watch-ce-row\"><span class=\"watch-lvl-dir\" style=\"color:#60a5fa\">CE \u25b2</span><span class=\"watch-lvl-val\">'+ce+'</span><span class=\"watch-lvl-dist\">close \u2265'+ce+ceA+'</span></div>'+\n"
    "            '<div class=\"watch-lvl-row watch-pe-row\"><span class=\"watch-lvl-dir\" style=\"color:#fca5a5\">PE \u25bc</span><span class=\"watch-lvl-val\">'+pe+'</span><span class=\"watch-lvl-dist\">close \u2264'+pe+peA+'</span></div>'+\n"
    "            (lp>0?'<div style=\"font-size:.73rem;color:var(--muted);margin-top:7px\">Live index: <b style=\"color:var(--text-main)\">'+lp.toFixed(1)+'</b></div>':'');\n"
    "        } else if(noEl){\n"
    "          noEl.innerHTML='<span style=\"opacity:.4\">Waiting for first 15-min candle\u23f3</span>';\n"
    "        }"
)
NEW = (
    "          noEl.innerHTML=\n"
    "            '<div class=\"watch-lvl-row watch-ce-row\"><span class=\"watch-lvl-dir\" style=\"color:#60a5fa\">CE \u25b2</span><span class=\"watch-lvl-val\">'+ce+'</span><span class=\"watch-lvl-dist\">close \u2265'+ce+ceA+'</span></div>'+\n"
    "            '<div class=\"watch-lvl-row watch-pe-row\"><span class=\"watch-lvl-dir\" style=\"color:#fca5a5\">PE \u25bc</span><span class=\"watch-lvl-val\">'+pe+'</span><span class=\"watch-lvl-dist\">close \u2264'+pe+peA+'</span></div>'+\n"
    "            (lp>0?'<div style=\"font-size:.73rem;color:var(--muted);margin-top:7px\">Live index: <b style=\"color:var(--text-main)\">'+lp.toFixed(1)+'</b></div>':'');\n"
    "          _appendClosedTrades(noEl,d);\n"
    "        } else if(noEl){\n"
    "          noEl.innerHTML='<span style=\"opacity:.4\">Waiting for first 15-min candle\u23f3</span>';\n"
    "          _appendClosedTrades(noEl,d);\n"
    "        }"
)

if OLD in c:
    c = c.replace(OLD, NEW, 1)
    print('OK: watch card updated')
else:
    print('NOT FOUND - checking chars')
    idx = c.find("watch-lvl-row watch-ce-row")
    if idx >= 0:
        print(repr(c[idx-20:idx+100]))

# Now inject the helper function before the closing }) of the poll function
# Find a good anchor: the line after the closing brace of "if(!inT){"
HELPER = (
    "      function _appendClosedTrades(el,d){\n"
    "        var _td3=new Date().toISOString().slice(0,10);\n"
    "        var _ctds=(d.recentTrades||[]).filter(function(t){return t.exitPrice&&t.exitPrice>0&&(t.date||'').startsWith(_td3);});\n"
    "        if(!_ctds.length)return;\n"
    "        var _ch='<div style=\"margin-top:10px;border-top:1px solid #1e293b;padding-top:8px;font-size:.7rem\">';\n"
    "        _ctds.slice().reverse().forEach(function(t,i){\n"
    "          var _ti=(t.premiumEntry>0&&t.premiumExit>0)?Math.round((t.premiumExit-t.premiumEntry)*(t.qty||30)):Math.round((t.pnl||0)*15);\n"
    "          var _tc=_ti>=0?'#10b981':'#ef4444';\n"
    "          var _td=t.direction?'<b style=\"color:'+(t.direction==='CE'?'#60a5fa':'#fca5a5')+'\">'+t.direction+'</b> ':'';\n"
    "          var _tm=t.date?new Date(t.date).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}):'';\n"
    "          var _tp=(t.premiumEntry>0&&t.premiumExit>0)?' '+t.premiumEntry.toFixed(0)+'\u2192'+t.premiumExit.toFixed(0):'';\n"
    "          var _re=t.reasonExit?' \u00b7 <span style=\"opacity:.6\">'+t.reasonExit+'</span>':'';\n"
    "          _ch+='<div style=\"display:flex;justify-content:space-between;padding:2px 0\">'+'<span>'+_td+_tm+_tp+'</span>'+'<b style=\"color:'+_tc+'\">'+(_ti>=0?'+':'\u2212')+'\u20b9'+Math.abs(_ti)+'</b>'+_re+'</div>';\n"
    "        });\n"
    "        _ch+='</div>';\n"
    "        el.innerHTML+=_ch;\n"
    "      }\n"
)

# Inject just before "// Watching card trigger levels"
ANCHOR = "      // Watching card trigger levels\n"
if ANCHOR in c:
    c = c.replace(ANCHOR, HELPER + ANCHOR, 1)
    print('OK: helper function injected')
else:
    print('FAIL: anchor not found')

with open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8') as f:
    f.write(c)
print('server.js saved')
