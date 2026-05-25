with open('/root/zeroscreen/dist/server.js', 'r') as f:
    c = f.read()

# 1. Add breakdown div after the 2-col grid
OLD_HTML = (
    '            <div class="kpi-m-s"><span class="g" id="ss-wins">${an2.today.wins}W</span>'
    ' / <span class="r" id="ss-losses">${an2.today.losses}L</span></div>\n'
    '          </div>\n'
    '        </div>\n'
    '      </div>\n'
    '\n'
    '    </div><!-- /atl-top-grid -->'
)
NEW_HTML = (
    '            <div class="kpi-m-s"><span class="g" id="ss-wins">${an2.today.wins}W</span>'
    ' / <span class="r" id="ss-losses">${an2.today.losses}L</span></div>\n'
    '          </div>\n'
    '        </div>\n'
    '        <div id="ss-trade-breakdown" style="margin-top:6px;font-size:.65rem;color:#8b949e;line-height:1.7"></div>\n'
    '      </div>\n'
    '\n'
    '    </div><!-- /atl-top-grid -->'
)

if OLD_HTML in c:
    c = c.replace(OLD_HTML, NEW_HTML, 1)
    print('OK: added ss-trade-breakdown div')
else:
    print('FAIL: HTML div not found')

# 2. Replace session stats block to use premium-based total + populate breakdown
OLD_STATS = (
    "      // \u2500\u2500 Session stats \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n"
    "      if(d.today){\n"
    "        const tot=parseFloat(((d.today.pnl||0)+(inT?unr:0)).toFixed(0));\n"
    "        if(ge('ss-today-rs')){ge('ss-today-rs').textContent=fR(tot);ge('ss-today-rs').style.color=gc(tot);}\n"
    "        // Unrealised sub-row\n"
    "        var unrRow=ge('ss-unr-row');\n"
    "        if(unrRow){\n"
    "          unrRow.style.display=inT?'':'none';\n"
    "          if(inT){\n"
    "            const rR=ge('ss-unr-rs');const rP=ge('ss-unr-pts');\n"
    "            if(rR){rR.textContent=fR(unr);rR.style.color=gc(unr);}\n"
    "            if(rP){rP.textContent=fP(unr);rP.style.color=gc(unr);}\n"
    "          }\n"
    "        }\n"
    "        if(ge('ss-today-pts'))ge('ss-today-pts').textContent=fP(tot);\n"
    "        if(ge('ss-tc'))ge('ss-tc').innerHTML=hb.tradeCount+(inT?'<span style=\"font-size:.6rem;color:#10b981\"> +live</span>':'');\n"
    "        if(ge('ss-wins'))ge('ss-wins').textContent=d.today.wins+'W';\n"
    "        if(ge('ss-losses'))ge('ss-losses').textContent=d.today.losses+'L';\n"
    "      }"
)
NEW_STATS = (
    "      // \u2500\u2500 Session stats \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n"
    "      if(d.today){\n"
    "        var _today2=new Date().toISOString().slice(0,10);\n"
    "        var _todayTds=(d.recentTrades||[]).filter(function(t){return t.exitPrice&&t.exitPrice>0&&(t.date||'').startsWith(_today2);});\n"
    "        var _premTot=_todayTds.reduce(function(s,t){return s+((t.premiumEntry>0&&t.premiumExit>0)?Math.round((t.premiumExit-t.premiumEntry)*(t.qty||30)):Math.round((t.pnl||0)*15));},0);\n"
    "        var _ep2h=parseFloat(hb.entryPremium||0);var _lp2h=parseFloat(hb.livePremium||0);\n"
    "        var _livePremUnr2=inT?(_ep2h>0&&_lp2h>0?Math.round((_lp2h-_ep2h)*(qty||30)):Math.round(unr*15)):0;\n"
    "        var _totInr=_premTot+_livePremUnr2;\n"
    "        const tot=parseFloat(((d.today.pnl||0)+(inT?unr:0)).toFixed(0));\n"
    "        if(ge('ss-today-rs')){var _rs=(_totInr>=0?'+':'\u2212')+'\u20b9'+Math.abs(_totInr).toLocaleString('en-IN');ge('ss-today-rs').textContent=_rs;ge('ss-today-rs').style.color=gc(_totInr);}\n"
    "        // Unrealised sub-row\n"
    "        var unrRow=ge('ss-unr-row');\n"
    "        if(unrRow){\n"
    "          unrRow.style.display=inT?'':'none';\n"
    "          if(inT){\n"
    "            const rR=ge('ss-unr-rs');const rP=ge('ss-unr-pts');\n"
    "            if(rR){rR.textContent=fR(unr);rR.style.color=gc(unr);}\n"
    "            if(rP){rP.textContent=fP(unr);rP.style.color=gc(unr);}\n"
    "          }\n"
    "        }\n"
    "        if(ge('ss-today-pts'))ge('ss-today-pts').textContent=fP(tot);\n"
    "        if(ge('ss-tc'))ge('ss-tc').innerHTML=hb.tradeCount+(inT?'<span style=\"font-size:.6rem;color:#10b981\"> +live</span>':'');\n"
    "        if(ge('ss-wins'))ge('ss-wins').textContent=d.today.wins+'W';\n"
    "        if(ge('ss-losses'))ge('ss-losses').textContent=d.today.losses+'L';\n"
    "        // Per-trade breakdown\n"
    "        var _bdEl=ge('ss-trade-breakdown');\n"
    "        if(_bdEl){\n"
    "          if(_todayTds.length===0&&!inT){_bdEl.innerHTML='';}\n"
    "          else{\n"
    "            var _bdHtml='';\n"
    "            _todayTds.forEach(function(t,i){\n"
    "              var _ti=(t.premiumEntry>0&&t.premiumExit>0)?Math.round((t.premiumExit-t.premiumEntry)*(t.qty||30)):Math.round((t.pnl||0)*15);\n"
    "              var _tc=_ti>=0?'#10b981':'#ef4444';\n"
    "              var _td=t.direction?'<span style=\"color:'+(t.direction==='CE'?'#60a5fa':'#fca5a5')+'\">'+t.direction+'</span> ':'';\n"
    "              var _tm=t.date?new Date(t.date).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}):'';\n"
    "              var _tp=(t.premiumEntry>0&&t.premiumExit>0)?' ('+t.premiumEntry.toFixed(0)+'\u2192'+t.premiumExit.toFixed(0)+')':'';\n"
    "              _bdHtml+='<div>Trade '+(i+1)+': '+_td+'<b style=\"color:'+_tc+'\">'+((_ti>=0?'+':'\u2212')+'\u20b9'+Math.abs(_ti))+'</b>'+_tp+(_tm?' \u00b7 '+_tm:'')+'</div>';\n"
    "            });\n"
    "            if(inT){\n"
    "              var _lti=_ep2h>0&&_lp2h>0?Math.round((_lp2h-_ep2h)*(qty||30)):Math.round(unr*15);\n"
    "              var _ltc=_lti>=0?'#10b981':'#ef4444';\n"
    "              var _ldir=(hb.direction||'').toUpperCase();\n"
    "              var _ldirHtml=_ldir?'<span style=\"color:'+(_ldir==='CE'?'#60a5fa':'#fca5a5')+'\">'+_ldir+'</span> ':'';\n"
    "              _bdHtml+='<div>Trade '+(_todayTds.length+1)+': '+_ldirHtml+'<b style=\"color:'+_ltc+'\">'+((_lti>=0?'+':'\u2212')+'\u20b9'+Math.abs(_lti))+'</b> \u25cf live</div>';\n"
    "            }\n"
    "            _bdEl.innerHTML=_bdHtml;\n"
    "          }\n"
    "        }\n"
    "      }"
)

if OLD_STATS in c:
    c = c.replace(OLD_STATS, NEW_STATS, 1)
    print('OK: session stats updated with premium total + per-trade breakdown')
else:
    print('FAIL: session stats block not found')
    # debug: show actual chars around the section
    idx = c.find('Session stats')
    if idx > 0:
        print('Found "Session stats" at char', idx)
        print(repr(c[idx-6:idx+80]))

with open('/root/zeroscreen/dist/server.js', 'w') as f:
    f.write(c)
print('server.js saved')
