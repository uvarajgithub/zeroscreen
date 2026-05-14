#!/usr/bin/env python3
"""
Comprehensive fix for TRAIL/LOCK50 shadow tabs - using exact byte matching
"""
FILE = '/root/zeroscreen/dist/server.js'
src = open(FILE, 'rb').read()
fixes = 0

def rb(old, new, label):
    global src, fixes
    if old not in src:
        print(f'WARN not found: {label}')
        return False
    src = src.replace(old, new, 1)
    fixes += 1
    print(f'OK: {label}')
    return True

# ── Fix 1: Add unrealised row + watch div to TRAIL stats + position ──────────
rb(
    b'              <div style="text-align:right"><div class="ss-val" id="sh-trail-wr">\xe2\x80\x94</div></div>\n            </div>\n          </div>\n          <div style="font-size:.67rem;color:var(--muted);padding:4px 2px">Shadow paper strategy \xe2\x80\x94 trailDefault',
    b'              <div style="text-align:right"><div class="ss-val" id="sh-trail-wr">\xe2\x80\x94</div></div>\n            </div>\n            <div class="ss-row" id="sh-trail-unr-row" style="display:none">\n              <div class="ss-lbl" style="color:var(--muted);font-style:italic">\xe2\x86\xb3 Unrealised</div>\n              <div style="text-align:right"><div class="ss-val" id="sh-trail-unr-rs"></div><div class="ss-sub" id="sh-trail-unr-pts"></div></div>\n            </div>\n          </div>\n          <div style="font-size:.67rem;color:var(--muted);padding:4px 2px">Shadow paper strategy \xe2\x80\x94 trailDefault',
    'TRAIL unrealised row'
)

# ── Fix 2: Add watch div to TRAIL position card ───────────────────────────────
rb(
    b'          <div class="sh-pos sh-pos-watch" id="sh-pos-trail-flat">\n            <div class="watch-title"><span>\xf0\x9f\x94\xb5</span> TRAIL Shadow \xe2\x80\x94 <span id="sh-trail-status">Watching</span></div>\n            <div id="sh-trail-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)">Waiting for first candle signal\xe2\x80\xa6</div>\n          </div>',
    b'          <div class="sh-pos sh-pos-watch" id="sh-pos-trail-flat">\n            <div class="watch-title"><span>\xf0\x9f\x94\xb5</span> TRAIL Shadow \xe2\x80\x94 <span id="sh-trail-status">Watching</span></div>\n            <div id="sh-trail-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)">Waiting for first candle signal\xe2\x80\xa6</div>\n            <div id="sh-trail-watch" style="margin-top:10px"></div>\n          </div>',
    'TRAIL watch div'
)

# ── Fix 3: Add unrealised row to LOCK50 Old stats ────────────────────────────
rb(
    b'              <div style="text-align:right"><div class="ss-val" id="sh-l50o-wr">\xe2\x80\x94</div></div>\n            </div>\n          </div>\n          <div style="font-size:.67rem;color:var(--muted);padding:4px 2px">Shadow paper strategy \xe2\x80\x94 trailLock50Old',
    b'              <div style="text-align:right"><div class="ss-val" id="sh-l50o-wr">\xe2\x80\x94</div></div>\n            </div>\n            <div class="ss-row" id="sh-l50o-unr-row" style="display:none">\n              <div class="ss-lbl" style="color:var(--muted);font-style:italic">\xe2\x86\xb3 Unrealised</div>\n              <div style="text-align:right"><div class="ss-val" id="sh-l50o-unr-rs"></div><div class="ss-sub" id="sh-l50o-unr-pts"></div></div>\n            </div>\n          </div>\n          <div style="font-size:.67rem;color:var(--muted);padding:4px 2px">Shadow paper strategy \xe2\x80\x94 trailLock50Old',
    'LOCK50 unrealised row'
)

# ── Fix 4: Add watch div to LOCK50 Old position card ─────────────────────────
rb(
    b'            <div id="sh-l50o-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)">Waiting for first candle signal\xe2\x80\xa6</div>\n          </div>',
    b'            <div id="sh-l50o-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)">Waiting for first candle signal\xe2\x80\xa6</div>\n            <div id="sh-l50o-watch" style="margin-top:10px"></div>\n          </div>',
    'LOCK50 watch div'
)

# ── Fix 5: Replace TRAIL shadow JS section ────────────────────────────────────
# Find the comment header bytes
TRAIL_COMMENT_START = b'      // \xe2\x94\x80\xe2\x94\x80 TRAIL shadow'
idx = src.find(TRAIL_COMMENT_START)
if idx < 0:
    print("WARN: TRAIL shadow JS comment not found, trying alternate...")
    idx = src.find(b'TRAIL shadow \xe2\x94\x80')
    if idx > 0:
        # Find the line start
        ls = src.rfind(b'\n', 0, idx) + 1
        print(f'  Found at offset {ls}: {repr(src[ls:ls+80])}')

if idx >= 0:
    # Find end = '_renderShLog(\'sh-trail-body\'' ... ');'
    end_marker = b"_renderShLog('sh-trail-body'"
    end_pos = src.find(end_marker, idx)
    if end_pos >= 0:
        # Find the next ');\n' after end_marker
        close = src.find(b',alive);\n', end_pos)
        if close >= 0:
            old_block = src[idx:close+9]  # includes ',alive);\n'
            new_block = (
                b"      // \xe2\x94\x80\xe2\x94\x80 TRAIL shadow \xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\n"
                b"      try{\n"
                b"        const shTr=hb.shadowTrades||0;const shW=hb.shadowWins||0;const shL=hb.shadowLosses||0;\n"
                b"        const shInT=!!(hb.shadowInTrade);const shDir=(hb.shadowDir||'').toUpperCase();const shEp=parseFloat(hb.shadowEntry||0);\n"
                b"        const shUnr=shInT&&lp>0&&shEp>0?(shDir==='CE'?lp-shEp:shEp-lp):0;\n"
                b"        const shTotal=shPnl+shUnr;\n"
                b"        const tpT2=ge('stab-pnl-trail');if(tpT2){tpT2.textContent=fR(shTotal);tpT2.style.color=gc(shTotal);}\n"
                b"        if(ge('sh-trail-pnl-rs')){ge('sh-trail-pnl-rs').textContent=fR(shTotal);ge('sh-trail-pnl-rs').style.color=gc(shTotal);}\n"
                b"        if(ge('sh-trail-pnl-pts'))ge('sh-trail-pnl-pts').textContent=fP(shTotal);\n"
                b"        if(ge('sh-trail-tc'))ge('sh-trail-tc').textContent=shTr;\n"
                b"        if(ge('sh-trail-w'))ge('sh-trail-w').textContent=shW+'W';\n"
                b"        if(ge('sh-trail-l'))ge('sh-trail-l').textContent=shL+'L';\n"
                b"        if(ge('sh-trail-wr'))ge('sh-trail-wr').textContent=(shW+shL)>0?Math.round(shW/(shW+shL)*100)+'%':'\xe2\x80\x94';\n"
                b"        if(ge('sh-trail-today-count'))ge('sh-trail-today-count').textContent='('+shTr+' trade'+(shTr!==1?'s':'')+');\n"
                b"        var shUnrRow=ge('sh-trail-unr-row');if(shUnrRow){shUnrRow.style.display=shInT?'':'none';if(shInT){var rA=ge('sh-trail-unr-rs');var pA=ge('sh-trail-unr-pts');if(rA){rA.textContent=fR(shUnr);rA.style.color=gc(shUnr);}if(pA){pA.textContent=fP(shUnr);pA.style.color=gc(shUnr);}}}\n"
                b"        if(ge('sh-trail-status'))ge('sh-trail-status').textContent=shInT&&shDir?shDir+' In Trade':'Watching';\n"
                b"        if(ge('sh-trail-detail')){if(shInT&&shEp>0&&lp>0){ge('sh-trail-detail').innerHTML='<b style=\"color:'+gc(shUnr)+'\">'+fP(shUnr)+'</b> unrealised \xc2\xb7 Entry: '+shEp.toFixed(0)+' \xc2\xb7 SL: '+parseFloat(hb.shadowSL||0).toFixed(0);}else{ge('sh-trail-detail').textContent='Watching for next signal\xe2\x80\xa6';}}\n"
                b"        var shWE=ge('sh-trail-watch');if(shWE){if(!shInT&&hb.lastCandle&&lp>0){var lc2=hb.lastCandle;var bH2=Math.max(lc2.open,lc2.close);var bL2=Math.min(lc2.open,lc2.close);var ce2=(bH2+25).toFixed(0);var pe2=(bL2-25).toFixed(0);var ceD2=lp-(bH2+25);var peD2=(bL2-25)-lp;shWE.innerHTML='<div class=\"watch-lvl-row watch-ce-row\"><span class=\"watch-lvl-dir\" style=\"color:#60a5fa\">CE \xe2\x96\xb2</span><span class=\"watch-lvl-val\">'+ce2+'</span><span class=\"watch-lvl-dist\">close \xe2\x89\xa5'+ce2+' <span style=\"color:'+(ceD2>=0?'#10b981':'#94a3b8')+'\">'+(ceD2>=0?'\xe2\x9c\x93 past':'\xe2\x86\x91 '+Math.abs(ceD2).toFixed(0)+' pts away')+'</span></span></div><div class=\"watch-lvl-row watch-pe-row\"><span class=\"watch-lvl-dir\" style=\"color:#fca5a5\">PE \xe2\x96\xbc</span><span class=\"watch-lvl-val\">'+pe2+'</span><span class=\"watch-lvl-dist\">close \xe2\x89\xa4'+pe2+' <span style=\"color:'+(peD2>=0?'#10b981':'#94a3b8')+'\">'+(peD2>=0?'\xe2\x9c\x93 past':'\xe2\x86\x93 '+Math.abs(peD2).toFixed(0)+' pts away')+'</span></span></div>';}else{shWE.innerHTML='';}} \n"
                b"        _renderShLog('sh-trail-body',hb.shadowTradeLog||[],alive);\n"
                b"      }catch(e){console.error('TRAIL err',e);}\n"
            )
            src = src[:idx] + new_block + src[idx+len(old_block):]
            fixes += 1
            print("OK: TRAIL shadow JS rewritten")
        else:
            print("WARN: TRAIL renderShLog end not found")
    else:
        print("WARN: TRAIL renderShLog call not found")

# ── Fix 6: Replace LOCK50 Old shadow JS section ───────────────────────────────
L50O_COMMENT_START = b'      // \xe2\x94\x80\xe2\x94\x80 LOCK50 Old shadow'
idx2 = src.find(L50O_COMMENT_START)
if idx2 < 0:
    print("WARN: LOCK50 Old shadow JS comment not found")
else:
    end_marker2 = b"_renderShLog('sh-l50o-body'"
    end_pos2 = src.find(end_marker2, idx2)
    if end_pos2 >= 0:
        close2 = src.find(b',alive);\n', end_pos2)
        if close2 >= 0:
            old_block2 = src[idx2:close2+9]
            new_block2 = (
                b"      // \xe2\x94\x80\xe2\x94\x80 LOCK50 Old shadow \xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\n"
                b"      try{\n"
                b"        const s1Tr=hb.scalp1Trades||0;const s1W=hb.scalp1Wins||0;const s1L=hb.scalp1Losses||0;\n"
                b"        const s1InT=!!(hb.scalp1InTrade);const s1Dir=(hb.scalp1Dir||'').toUpperCase();const s1Ep=parseFloat(hb.scalp1Entry||0);\n"
                b"        const s1Unr=s1InT&&lp>0&&s1Ep>0?(s1Dir==='CE'?lp-s1Ep:s1Ep-lp):0;\n"
                b"        const s1Total=s1Pnl+s1Unr;\n"
                b"        const tpL2=ge('stab-pnl-l50o');if(tpL2){tpL2.textContent=fR(s1Total);tpL2.style.color=gc(s1Total);}\n"
                b"        if(ge('sh-l50o-pnl-rs')){ge('sh-l50o-pnl-rs').textContent=fR(s1Total);ge('sh-l50o-pnl-rs').style.color=gc(s1Total);}\n"
                b"        if(ge('sh-l50o-pnl-pts'))ge('sh-l50o-pnl-pts').textContent=fP(s1Total);\n"
                b"        if(ge('sh-l50o-tc'))ge('sh-l50o-tc').textContent=s1Tr;\n"
                b"        if(ge('sh-l50o-w'))ge('sh-l50o-w').textContent=s1W+'W';\n"
                b"        if(ge('sh-l50o-l'))ge('sh-l50o-l').textContent=s1L+'L';\n"
                b"        if(ge('sh-l50o-wr'))ge('sh-l50o-wr').textContent=(s1W+s1L)>0?Math.round(s1W/(s1W+s1L)*100)+'%':'\xe2\x80\x94';\n"
                b"        if(ge('sh-l50o-today-count'))ge('sh-l50o-today-count').textContent='('+s1Tr+' trade'+(s1Tr!==1?'s':'')+');\n"
                b"        var s1UnrRow=ge('sh-l50o-unr-row');if(s1UnrRow){s1UnrRow.style.display=s1InT?'':'none';if(s1InT){var rB=ge('sh-l50o-unr-rs');var pB=ge('sh-l50o-unr-pts');if(rB){rB.textContent=fR(s1Unr);rB.style.color=gc(s1Unr);}if(pB){pB.textContent=fP(s1Unr);pB.style.color=gc(s1Unr);}}}\n"
                b"        if(ge('sh-l50o-status'))ge('sh-l50o-status').textContent=s1InT&&s1Dir?s1Dir+' In Trade':'Watching';\n"
                b"        if(ge('sh-l50o-detail')){if(s1InT&&s1Ep>0&&lp>0){ge('sh-l50o-detail').innerHTML='<b style=\"color:'+gc(s1Unr)+'\">'+fP(s1Unr)+'</b> unrealised \xc2\xb7 Entry: '+s1Ep.toFixed(0)+' \xc2\xb7 SL: '+parseFloat(hb.scalp1SL||0).toFixed(0);}else{ge('sh-l50o-detail').textContent='Watching for next signal\xe2\x80\xa6';}}\n"
                b"        var s1WE=ge('sh-l50o-watch');if(s1WE){if(!s1InT&&hb.lastCandle&&lp>0){var lc3=hb.lastCandle;var bH3=Math.max(lc3.open,lc3.close);var bL3=Math.min(lc3.open,lc3.close);var ce3=(bH3+25).toFixed(0);var pe3=(bL3-25).toFixed(0);var ceD3=lp-(bH3+25);var peD3=(bL3-25)-lp;s1WE.innerHTML='<div class=\"watch-lvl-row watch-ce-row\"><span class=\"watch-lvl-dir\" style=\"color:#60a5fa\">CE \xe2\x96\xb2</span><span class=\"watch-lvl-val\">'+ce3+'</span><span class=\"watch-lvl-dist\">close \xe2\x89\xa5'+ce3+' <span style=\"color:'+(ceD3>=0?'#10b981':'#94a3b8')+'\">'+(ceD3>=0?'\xe2\x9c\x93 past':'\xe2\x86\x91 '+Math.abs(ceD3).toFixed(0)+' pts away')+'</span></span></div><div class=\"watch-lvl-row watch-pe-row\"><span class=\"watch-lvl-dir\" style=\"color:#fca5a5\">PE \xe2\x96\xbc</span><span class=\"watch-lvl-val\">'+pe3+'</span><span class=\"watch-lvl-dist\">close \xe2\x89\xa4'+pe3+' <span style=\"color:'+(peD3>=0?'#10b981':'#94a3b8')+'\">'+(peD3>=0?'\xe2\x9c\x93 past':'\xe2\x86\x93 '+Math.abs(peD3).toFixed(0)+' pts away')+'</span></span></div>';}else{s1WE.innerHTML='';}} \n"
                b"        _renderShLog('sh-l50o-body',hb.scalp1TradeLog||[],alive);\n"
                b"      }catch(e){console.error('LOCK50 err',e);}\n"
            )
            src = src[:idx2] + new_block2 + src[idx2+len(old_block2):]
            fixes += 1
            print("OK: LOCK50 Old shadow JS rewritten")
        else:
            print("WARN: LOCK50 renderShLog end not found")
    else:
        print("WARN: LOCK50 renderShLog call not found")

open(FILE, 'wb').write(src)
print(f"\nDONE — {fixes} fixes applied")
