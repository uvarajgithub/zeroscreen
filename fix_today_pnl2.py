with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8') as f:
    c = f.read()

# Match on the code body, not the comment line
OLD_STATS = (
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
    print('OK: session stats updated')
else:
    print('NOT FOUND - showing actual block:')
    idx = c.find("if(d.today){")
    # find the right one (after session stats comment)
    sidx = c.find('Session stats')
    if sidx >= 0:
        block_start = c.find("if(d.today){", sidx)
        if block_start >= 0:
            print(repr(c[block_start:block_start+300]))

with open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8') as f:
    f.write(c)
print('server.js saved')
