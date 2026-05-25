with open('/root/zeroscreen/dist/server.js', 'r') as f:
    c = f.read()

OLD = (
    "          var _lp=parseFloat(d.heartbeat.livePrice||0);var _unr=_lp>0?(_dr==='CE'?_lp-_ep:_ep-_lp):0;\n"
    "          var _ucol=_unr>=0?'#10b981':'#ef4444';\n"
    "          _html+='<div class=\"pm-tl-row\"><div class=\"pm-tl-dot active\">\\u25c6</div>'\n"
    "            +'<div class=\"pm-tl-txt\"><div class=\"pm-tl-time\" style=\"color:#f59e0b\">'\n"
    "            +(_dr?'<b style=\"color:'+(_dr==='CE'?'#60a5fa':'#fca5a5')+'\">'+_dr+'</b> ':'')\n"
    "            +'IN TRADE \\u2014 Entry '+_ep.toFixed(0)+(_lp>0?' \\u2192 LTP '+_lp.toFixed(0):'')+'</div>'\n"
    "            +'<div class=\"pm-tl-label\"><b style=\"color:'+_ucol+'\">'+((_unr>=0?'+':'')+(_unr*15).toFixed(0))+'</b>'\n"
    "            +' unrealised \\u00b7 '+(_unr>=0?'+':'')+_unr.toFixed(0)+' pts</div></div></div>';"
)

NEW = (
    "          var _lp=parseFloat(d.heartbeat.livePrice||0);var _unr=_lp>0?(_dr==='CE'?_lp-_ep:_ep-_lp):0;\n"
    "          var _ep2=parseFloat(d.heartbeat.entryPremium||0);var _lp2=parseFloat(d.heartbeat.livePremium||0);\n"
    "          var _qty2=d.heartbeat.qty||30;\n"
    "          var _unrInr=(_ep2>0&&_lp2>0)?Math.round((_lp2-_ep2)*_qty2):Math.round(_unr*15);\n"
    "          var _ucol=_unrInr>=0?'#10b981':'#ef4444';\n"
    "          _html+='<div class=\"pm-tl-row\"><div class=\"pm-tl-dot active\">\\u25c6</div>'\n"
    "            +'<div class=\"pm-tl-txt\"><div class=\"pm-tl-time\" style=\"color:#f59e0b\">'\n"
    "            +(_dr?'<b style=\"color:'+(_dr==='CE'?'#60a5fa':'#fca5a5')+'\">'+_dr+'</b> ':'')\n"
    "            +'IN TRADE \\u2014 Entry '+_ep.toFixed(0)+(_lp>0?' \\u2192 LTP '+_lp.toFixed(0):'')+'</div>'\n"
    "            +'<div class=\"pm-tl-label\"><b style=\"color:'+_ucol+'\">'+(_unrInr>=0?'+':'-')+'\\u20b9'+Math.abs(_unrInr)+'</b>'\n"
    "            +' unrealised'+(_ep2>0&&_lp2>0?' (opt '+_ep2.toFixed(0)+'\\u2192'+_lp2.toFixed(0)+')':' \\u00b7 '+(_unr>=0?'+':'')+_unr.toFixed(0)+' pts')+'</div></div></div>';"
)

if OLD in c:
    c = c.replace(OLD, NEW, 1)
    with open('/root/zeroscreen/dist/server.js', 'w') as f:
        f.write(c)
    print('OK: live block updated')
else:
    print('NOT FOUND - printing actual lines 12046-12054:')
    lines = c.split('\n')
    for i, ln in enumerate(lines[12044:12054], 12045):
        print(f'{i}: {repr(ln)}')
