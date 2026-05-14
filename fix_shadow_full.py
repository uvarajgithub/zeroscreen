#!/usr/bin/env python3
"""
Comprehensive fix for TRAIL and LOCK50 Old tabs:
1. Add "Watching for Next Signal" logic to shadow tabs in _dbRefresh
2. Add unrealised P&L row to shadow stats cards (HTML)
3. Include unrealised in shadow tab badge P&L
4. Wrap each section in its own try/catch for crash isolation
5. Fix sh-trail-pnl-rs initial colour (was #818cf8 purple, should be dynamic)
"""
FILE = '/root/zeroscreen/dist/server.js'
with open(FILE, 'r', encoding='utf-8') as f:
    src = f.read()

fixes = 0

# ── Fix 1: Fix initial colour on sh-trail-pnl-rs (static HTML) ─────────────
OLD_PNL_COLOR = 'style="color:#818cf8">Γö</div>'
NEW_PNL_COLOR = '>—</div>'
if OLD_PNL_COLOR in src:
    src = src.replace(OLD_PNL_COLOR, NEW_PNL_COLOR, 1)
    fixes += 1; print("OK: fixed sh-trail-pnl-rs initial colour")

# ── Fix 2: Add unrealised rows to TRAIL shadow ss-card ──────────────────────
OLD_TRAIL_STATS = '''            <div class="ss-row">
              <div class="ss-lbl">Win Rate</div>
              <div style="text-align:right"><div class="ss-val" id="sh-trail-wr">Γö</div></div>
            </div>
          </div>
          <div style="font-size:.67rem;color:var(--muted);padding:4px 2px">Shadow paper strategy Γö trailDefault'''
NEW_TRAIL_STATS = '''            <div class="ss-row">
              <div class="ss-lbl">Win Rate</div>
              <div style="text-align:right"><div class="ss-val" id="sh-trail-wr">—</div></div>
            </div>
            <div class="ss-row" id="sh-trail-unr-row" style="display:none">
              <div class="ss-lbl" style="color:var(--muted);font-style:italic">↳ Unrealised</div>
              <div style="text-align:right"><div class="ss-val" id="sh-trail-unr-rs"></div><div class="ss-sub" id="sh-trail-unr-pts"></div></div>
            </div>
          </div>
          <div style="font-size:.67rem;color:var(--muted);padding:4px 2px">Shadow paper strategy — trailDefault'''
if OLD_TRAIL_STATS in src:
    src = src.replace(OLD_TRAIL_STATS, NEW_TRAIL_STATS, 1)
    fixes += 1; print("OK: added unrealised row to TRAIL stats")
else:
    print("WARN: TRAIL stats card not found")

# ── Fix 3: Add unrealised rows to LOCK50 Old shadow ss-card ─────────────────
OLD_L50O_STATS = '''            <div class="ss-row">
              <div class="ss-lbl">Win Rate</div>
              <div style="text-align:right"><div class="ss-val" id="sh-l50o-wr">Γö</div></div>
            </div>
          </div>
          <div style="font-size:.67rem;color:var(--muted);padding:4px 2px">Shadow paper strategy Γö trailLock50Old'''
NEW_L50O_STATS = '''            <div class="ss-row">
              <div class="ss-lbl">Win Rate</div>
              <div style="text-align:right"><div class="ss-val" id="sh-l50o-wr">—</div></div>
            </div>
            <div class="ss-row" id="sh-l50o-unr-row" style="display:none">
              <div class="ss-lbl" style="color:var(--muted);font-style:italic">↳ Unrealised</div>
              <div style="text-align:right"><div class="ss-val" id="sh-l50o-unr-rs"></div><div class="ss-sub" id="sh-l50o-unr-pts"></div></div>
            </div>
          </div>
          <div style="font-size:.67rem;color:var(--muted);padding:4px 2px">Shadow paper strategy — trailLock50Old'''
if OLD_L50O_STATS in src:
    src = src.replace(OLD_L50O_STATS, NEW_L50O_STATS, 1)
    fixes += 1; print("OK: added unrealised row to LOCK50 Old stats")
else:
    print("WARN: LOCK50 Old stats card not found")

# ── Fix 4: Add watch-card div to shadow panels ───────────────────────────────
# Add a watching/position detail card to each shadow tab's position section
OLD_TRAIL_POS = '''        <div id="sh-pos-trail-wrap">
          <div class="sh-pos sh-pos-watch" id="sh-pos-trail-flat">
            <div class="watch-title"><span>≡ƒö╡</span> TRAIL Shadow Γö <span id="sh-trail-status">Watching</span></div>
            <div id="sh-trail-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)">Waiting for first candle signalΓª</div>
          </div>
        </div>'''
NEW_TRAIL_POS = '''        <div id="sh-pos-trail-wrap">
          <div class="sh-pos sh-pos-watch" id="sh-pos-trail-flat">
            <div class="watch-title"><span>🧪</span> TRAIL Shadow — <span id="sh-trail-status">Watching</span></div>
            <div id="sh-trail-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)">Waiting for first candle signal…</div>
            <div id="sh-trail-watch" style="margin-top:10px"></div>
          </div>
        </div>'''
if OLD_TRAIL_POS in src:
    src = src.replace(OLD_TRAIL_POS, NEW_TRAIL_POS, 1)
    fixes += 1; print("OK: added sh-trail-watch div")
else:
    print("WARN: TRAIL pos section not found")

OLD_L50O_POS = '''        <div id="sh-pos-l50o-wrap">
          <div class="sh-pos sh-pos-watch" id="sh-pos-l50o-flat">
            <div class="watch-title"><span>≡ƒƒí</span> LOCK50 Old Shadow Γö <span id="sh-l50o-status">Watching</span></div>
            <div id="sh-l50o-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)">Waiting for first candle signalΓª</div>
          </div>
        </div>'''
NEW_L50O_POS = '''        <div id="sh-pos-l50o-wrap">
          <div class="sh-pos sh-pos-watch" id="sh-pos-l50o-flat">
            <div class="watch-title"><span>🔹</span> LOCK50 Old Shadow — <span id="sh-l50o-status">Watching</span></div>
            <div id="sh-l50o-detail" style="margin-top:8px;font-size:.8rem;color:var(--muted)">Waiting for first candle signal…</div>
            <div id="sh-l50o-watch" style="margin-top:10px"></div>
          </div>
        </div>'''
if OLD_L50O_POS in src:
    src = src.replace(OLD_L50O_POS, NEW_L50O_POS, 1)
    fixes += 1; print("OK: added sh-l50o-watch div")
else:
    print("WARN: LOCK50 Old pos section not found")

# ── Fix 5: Rewrite the TRAIL shadow _dbRefresh section ──────────────────────
OLD_TRAIL_JS = '''      // ΓöΓö TRAIL shadow ΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓö
      const shTr=hb.shadowTrades||0;
      const shW=hb.shadowWins||0;
      const shL=hb.shadowLosses||0;
      const shInT=!!(hb.shadowInTrade);
      const shDir=(hb.shadowDir||'').toUpperCase();
      const shEp=parseFloat(hb.shadowEntry||0);
      if(ge('sh-trail-pnl-rs')){ge('sh-trail-pnl-rs').textContent=fR(shPnl);}
      if(ge('sh-trail-pnl-pts'))ge('sh-trail-pnl-pts').textContent=fP(shPnl);
      if(ge('sh-trail-tc'))ge('sh-trail-tc').textContent=shTr;
      if(ge('sh-trail-w'))ge('sh-trail-w').textContent=shW+'W';
      if(ge('sh-trail-l'))ge('sh-trail-l').textContent=shL+'L';
      if(ge('sh-trail-wr'))ge('sh-trail-wr').textContent=shW+shL>0?Math.round(shW/(shW+shL)*100)+'%':'Γö';
      if(ge('sh-trail-today-count'))ge('sh-trail-today-count').textContent='('+shTr+' trade'+(shTr!==1?'s':'')+')';
      // Trail status + detail
      if(ge('sh-trail-status'))ge('sh-trail-status').textContent=shInT&&shDir?shDir+' In Trade':shTr>0?'Watching':'Watching';
      if(ge('sh-trail-detail')&&shInT&&shEp>0&&lp>0){
        const su=shDir==='CE'?lp-shEp:shEp-lp;
        ge('sh-trail-detail').innerHTML='<b style="color:'+gc(su)+'">'+fP(su)+'</b> unrealised ┬╖ Entry: '+shEp.toFixed(0)+' ┬╖ SL: '+(parseFloat(hb.shadowSL||0)).toFixed(0);
      }
      _renderShLog('sh-trail-body',hb.shadowTradeLog||[],alive);'''

NEW_TRAIL_JS = '''      // ── TRAIL shadow ─────────────────────────────────────────────────────────
      try{
        const shTr=hb.shadowTrades||0;
        const shW=hb.shadowWins||0;
        const shL=hb.shadowLosses||0;
        const shInT=!!(hb.shadowInTrade);
        const shDir=(hb.shadowDir||'').toUpperCase();
        const shEp=parseFloat(hb.shadowEntry||0);
        const shUnr=shInT&&lp>0&&shEp>0?(shDir==='CE'?lp-shEp:shEp-lp):0;
        const shTotal=shPnl+shUnr;
        // Tab badge: closed + unrealised
        const tpTrail2=ge('stab-pnl-trail');if(tpTrail2){tpTrail2.textContent=fR(shTotal);tpTrail2.style.color=gc(shTotal);}
        // Stats card
        if(ge('sh-trail-pnl-rs')){ge('sh-trail-pnl-rs').textContent=fR(shTotal);ge('sh-trail-pnl-rs').style.color=gc(shTotal);}
        if(ge('sh-trail-pnl-pts'))ge('sh-trail-pnl-pts').textContent=fP(shTotal);
        if(ge('sh-trail-tc'))ge('sh-trail-tc').textContent=shTr;
        if(ge('sh-trail-w'))ge('sh-trail-w').textContent=shW+'W';
        if(ge('sh-trail-l'))ge('sh-trail-l').textContent=shL+'L';
        if(ge('sh-trail-wr'))ge('sh-trail-wr').textContent=(shW+shL)>0?Math.round(shW/(shW+shL)*100)+'%':'—';
        if(ge('sh-trail-today-count'))ge('sh-trail-today-count').textContent='('+shTr+' trade'+(shTr!==1?'s':'')+')';
        // Unrealised row
        var shUnrRow=ge('sh-trail-unr-row');
        if(shUnrRow){
          shUnrRow.style.display=shInT?'':'none';
          if(shInT&&shUnr!==0){var r=ge('sh-trail-unr-rs');var p=ge('sh-trail-unr-pts');if(r){r.textContent=fR(shUnr);r.style.color=gc(shUnr);}if(p){p.textContent=fP(shUnr);p.style.color=gc(shUnr);}}
        }
        // Position status
        if(ge('sh-trail-status'))ge('sh-trail-status').textContent=shInT&&shDir?shDir+' In Trade':'Watching';
        if(ge('sh-trail-detail')){
          if(shInT&&shEp>0&&lp>0){
            ge('sh-trail-detail').innerHTML='<b style="color:'+gc(shUnr)+'">'+fP(shUnr)+'</b> unrealised · Entry: '+shEp.toFixed(0)+' · SL: '+(parseFloat(hb.shadowSL||0)).toFixed(0);
          } else {
            ge('sh-trail-detail').textContent='Watching for next signal…';
          }
        }
        // Watching trigger levels (same signals as TICK TRAIL)
        var shWatchEl=ge('sh-trail-watch');
        if(shWatchEl){
          if(!shInT&&hb.lastCandle&&lp>0){
            var lc2=hb.lastCandle;
            var bH2=Math.max(lc2.open,lc2.close);var bL2=Math.min(lc2.open,lc2.close);
            var ce2=(bH2+25).toFixed(0);var pe2=(bL2-25).toFixed(0);
            var ceD2=lp-(bH2+25);var peD2=(bL2-25)-lp;
            shWatchEl.innerHTML=
              '<div class="watch-lvl-row watch-ce-row"><span class="watch-lvl-dir" style="color:#60a5fa">CE ▲</span><span class="watch-lvl-val">'+ce2+'</span><span class="watch-lvl-dist">close ≥'+ce2+' <span style="color:'+(ceD2>=0?'#10b981':'#94a3b8')+'">'+(ceD2>=0?'✓ past':'↑ '+Math.abs(ceD2).toFixed(0)+' pts away')+'</span></span></div>'+
              '<div class="watch-lvl-row watch-pe-row"><span class="watch-lvl-dir" style="color:#fca5a5">PE ▼</span><span class="watch-lvl-val">'+pe2+'</span><span class="watch-lvl-dist">close ≤'+pe2+' <span style="color:'+(peD2>=0?'#10b981':'#94a3b8')+'">'+(peD2>=0?'✓ past':'↓ '+Math.abs(peD2).toFixed(0)+' pts away')+'</span></span></div>';
          } else {shWatchEl.innerHTML='';}
        }
        _renderShLog('sh-trail-body',hb.shadowTradeLog||[],alive);
      }catch(e){console.error('TRAIL shadow error',e);}'''

if OLD_TRAIL_JS in src:
    src = src.replace(OLD_TRAIL_JS, NEW_TRAIL_JS, 1)
    fixes += 1; print("OK: TRAIL shadow JS rewritten")
else:
    print("WARN: TRAIL shadow JS section not found")
    # Try to find it
    idx = src.find('TRAIL shadow')
    if idx > 0: print(repr(src[idx:idx+200]))

# ── Fix 6: Rewrite the LOCK50 Old shadow _dbRefresh section ─────────────────
OLD_L50O_JS = '''      // ΓöΓö LOCK50 Old shadow ΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓöΓö
      const s1Tr=hb.scalp1Trades||0;
      const s1W=hb.scalp1Wins||0;
      const s1L=hb.scalp1Losses||0;
      const s1InT=!!(hb.scalp1InTrade);
      const s1Dir=(hb.scalp1Dir||'').toUpperCase();
      const s1Ep=parseFloat(hb.scalp1Entry||0);
      if(ge('sh-l50o-pnl-rs'))ge('sh-l50o-pnl-rs').textContent=fR(s1Pnl);
      if(ge('sh-l50o-pnl-pts'))ge('sh-l50o-pnl-pts').textContent=fP(s1Pnl);
      if(ge('sh-l50o-tc'))ge('sh-l50o-tc').textContent=s1Tr;
      if(ge('sh-l50o-w'))ge('sh-l50o-w').textContent=s1W+'W';
      if(ge('sh-l50o-l'))ge('sh-l50o-l').textContent=s1L+'L';
      if(ge('sh-l50o-wr'))ge('sh-l50o-wr').textContent=s1W+s1L>0?Math.round(s1W/(s1W+s1L)*100)+'%':'Γö';
      if(ge('sh-l50o-today-count'))ge('sh-l50o-today-count').textContent='('+s1Tr+' trade'+(s1Tr!==1?'s':'')+')';
      if(ge('sh-l50o-status'))ge('sh-l50o-status').textContent=s1InT&&s1Dir?s1Dir+' In Trade':s1Tr>0?'Watching':'Watching';
      if(ge('sh-l50o-detail')&&s1InT&&s1Ep>0&&lp>0){
        const su=s1Dir==='CE'?lp-s1Ep:s1Ep-lp;
        ge('sh-l50o-detail').innerHTML='<b style="color:'+gc(su)+'">'+fP(su)+'</b> unrealised ┬╖ Entry: '+s1Ep.toFixed(0)+' ┬╖ SL: '+(parseFloat(hb.scalp1SL||0)).toFixed(0);
      }
      _renderShLog('sh-l50o-body',hb.scalp1TradeLog||[],alive);'''

NEW_L50O_JS = '''      // ── LOCK50 Old shadow ──────────────────────────────────────────────────────
      try{
        const s1Tr=hb.scalp1Trades||0;
        const s1W=hb.scalp1Wins||0;
        const s1L=hb.scalp1Losses||0;
        const s1InT=!!(hb.scalp1InTrade);
        const s1Dir=(hb.scalp1Dir||'').toUpperCase();
        const s1Ep=parseFloat(hb.scalp1Entry||0);
        const s1Unr=s1InT&&lp>0&&s1Ep>0?(s1Dir==='CE'?lp-s1Ep:s1Ep-lp):0;
        const s1Total=s1Pnl+s1Unr;
        // Tab badge: closed + unrealised
        const tpL50o2=ge('stab-pnl-l50o');if(tpL50o2){tpL50o2.textContent=fR(s1Total);tpL50o2.style.color=gc(s1Total);}
        // Stats card
        if(ge('sh-l50o-pnl-rs')){ge('sh-l50o-pnl-rs').textContent=fR(s1Total);ge('sh-l50o-pnl-rs').style.color=gc(s1Total);}
        if(ge('sh-l50o-pnl-pts'))ge('sh-l50o-pnl-pts').textContent=fP(s1Total);
        if(ge('sh-l50o-tc'))ge('sh-l50o-tc').textContent=s1Tr;
        if(ge('sh-l50o-w'))ge('sh-l50o-w').textContent=s1W+'W';
        if(ge('sh-l50o-l'))ge('sh-l50o-l').textContent=s1L+'L';
        if(ge('sh-l50o-wr'))ge('sh-l50o-wr').textContent=(s1W+s1L)>0?Math.round(s1W/(s1W+s1L)*100)+'%':'—';
        if(ge('sh-l50o-today-count'))ge('sh-l50o-today-count').textContent='('+s1Tr+' trade'+(s1Tr!==1?'s':'')+')';
        // Unrealised row
        var s1UnrRow=ge('sh-l50o-unr-row');
        if(s1UnrRow){
          s1UnrRow.style.display=s1InT?'':'none';
          if(s1InT&&s1Unr!==0){var r2=ge('sh-l50o-unr-rs');var p2=ge('sh-l50o-unr-pts');if(r2){r2.textContent=fR(s1Unr);r2.style.color=gc(s1Unr);}if(p2){p2.textContent=fP(s1Unr);p2.style.color=gc(s1Unr);}}
        }
        // Position status
        if(ge('sh-l50o-status'))ge('sh-l50o-status').textContent=s1InT&&s1Dir?s1Dir+' In Trade':'Watching';
        if(ge('sh-l50o-detail')){
          if(s1InT&&s1Ep>0&&lp>0){
            ge('sh-l50o-detail').innerHTML='<b style="color:'+gc(s1Unr)+'">'+fP(s1Unr)+'</b> unrealised · Entry: '+s1Ep.toFixed(0)+' · SL: '+(parseFloat(hb.scalp1SL||0)).toFixed(0);
          } else {
            ge('sh-l50o-detail').textContent='Watching for next signal…';
          }
        }
        // Watching trigger levels
        var s1WatchEl=ge('sh-l50o-watch');
        if(s1WatchEl){
          if(!s1InT&&hb.lastCandle&&lp>0){
            var lc3=hb.lastCandle;
            var bH3=Math.max(lc3.open,lc3.close);var bL3=Math.min(lc3.open,lc3.close);
            var ce3=(bH3+25).toFixed(0);var pe3=(bL3-25).toFixed(0);
            var ceD3=lp-(bH3+25);var peD3=(bL3-25)-lp;
            s1WatchEl.innerHTML=
              '<div class="watch-lvl-row watch-ce-row"><span class="watch-lvl-dir" style="color:#60a5fa">CE ▲</span><span class="watch-lvl-val">'+ce3+'</span><span class="watch-lvl-dist">close ≥'+ce3+' <span style="color:'+(ceD3>=0?'#10b981':'#94a3b8')+'">'+(ceD3>=0?'✓ past':'↑ '+Math.abs(ceD3).toFixed(0)+' pts away')+'</span></span></div>'+
              '<div class="watch-lvl-row watch-pe-row"><span class="watch-lvl-dir" style="color:#fca5a5">PE ▼</span><span class="watch-lvl-val">'+pe3+'</span><span class="watch-lvl-dist">close ≤'+pe3+' <span style="color:'+(peD3>=0?'#10b981':'#94a3b8')+'">'+(peD3>=0?'✓ past':'↓ '+Math.abs(peD3).toFixed(0)+' pts away')+'</span></span></div>';
          } else {s1WatchEl.innerHTML='';}
        }
        _renderShLog('sh-l50o-body',hb.scalp1TradeLog||[],alive);
      }catch(e){console.error('LOCK50 shadow error',e);}'''

if OLD_L50O_JS in src:
    src = src.replace(OLD_L50O_JS, NEW_L50O_JS, 1)
    fixes += 1; print("OK: LOCK50 Old shadow JS rewritten")
else:
    print("WARN: LOCK50 Old shadow JS section not found")
    idx = src.find('LOCK50 Old shadow')
    if idx > 0: print(repr(src[idx:idx+200]))

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"\nDONE — {fixes} fixes applied")
