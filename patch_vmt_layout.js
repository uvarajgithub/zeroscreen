'use strict';
/**
 * patch_vmt_layout.js
 * Makes VMT panel PIXEL-PERFECT identical to AMINA panel structure.
 * Same: db-main grid, ss-card rows, Trade History section with Daily/Weekly/Monthly buttons.
 * Run once: node /root/zeroscreen/patch_vmt_layout.js
 */

const fs   = require('fs');
const FILE = '/root/zeroscreen/dist/server.js';
let src = fs.readFileSync(FILE, 'utf8');

// ── Find and replace the entire panel-vmt block ───────────────────────────────
const START_MARKER = '    <div id="panel-vmt" style="display:none">';
const END_MARKER   = '    </div><!-- /panel-vmt -->';

const startIdx = src.indexOf(START_MARKER);
const endIdx   = src.indexOf(END_MARKER);
if (startIdx === -1 || endIdx === -1) {
    console.error('Cannot find panel-vmt block. startIdx='+startIdx+', endIdx='+endIdx);
    process.exit(1);
}
const oldBlock = src.slice(startIdx, endIdx + END_MARKER.length);

const NEW_PANEL = `    <div id="panel-vmt" style="display:none">

      <div class="db-main">

        <!-- LEFT: VMT Position card — same structure as AMINA -->
        <div id="vmt-pos-wrap">
          <!-- IN-TRADE pos-card (hidden when flat) -->
          <div class="pos-card pos-ce" id="vmt-pos-card" style="display:none">
            <div class="pos-hdr">
              <span class="pos-live-dot"></span>
              <span class="pos-badge pos-b-ce" id="vmt-card-badge">CE OPTION</span>
              <span class="pos-sym">BANKNIFTY</span>
              <span class="pos-mode">PAPER</span>
            </div>
            <div class="pos-pnl-rs g" id="vmt-card-rs">&#8212;</div>
            <div class="pos-pnl-pts g" id="vmt-card-pts">&#8212; premium pts unrealised</div>
            <div class="pos-gauge"><div class="pos-gauge-fill" id="vmt-card-gauge" style="width:50%;background:#10b981"></div></div>
            <div class="pos-grid">
              <div><div class="pos-lbl">Entry Premium</div><div class="pos-val mono" id="vmt-card-ep">&#8212;</div></div>
              <div><div class="pos-lbl">Live Premium</div><div class="pos-val g mono" id="vmt-card-lp">&#8212;</div></div>
              <div><div class="pos-lbl">SL Premium</div><div class="pos-val r mono" id="vmt-card-sl">&#8212;</div></div>
              <div><div class="pos-lbl">SL Risk &#8377;</div><div class="pos-val r" id="vmt-card-slrs">&#8212;</div></div>
              <div><div class="pos-lbl">Target</div><div class="pos-val mono" style="color:#fbbf24" id="vmt-card-tgt">&#8212;</div></div>
              <div><div class="pos-lbl">ATM Strike</div><div class="pos-val mono" id="vmt-card-strike">&#8212;</div></div>
            </div>
            <div class="pos-divider"></div>
            <div class="pos-prem-row">
              <div class="pos-prem-cell"><span class="pos-prem-tag buy-tag">OPEN Premium</span><span class="pos-prem-val" id="vmt-card-open-prem">&#8212;</span></div>
              <div class="pos-prem-cell"><span class="pos-prem-tag" style="background:rgba(251,191,36,.15);color:#fbbf24">LIVE Premium</span><span class="pos-prem-val" id="vmt-card-live-prem">&#8212;</span></div>
            </div>
          </div>
          <!-- WATCHING / FLAT card (shown when not in trade) -->
          <div class="watch-card" id="vmt-pos-flat">
            <div class="watch-title"><span>&#128161;</span>VMT Shadow &#8212; <span id="vmt-status-txt">Waiting for market open</span></div>
            <div id="vmt-watch-levels" style="font-size:.78rem;color:var(--muted);margin-top:8px">
              <span style="opacity:.4">Calculating setup levels&#8230;</span>
            </div>
          </div>
        </div>

        <!-- RIGHT: Session Stats — same 6-row ss-card structure as AMINA -->
        <div>
          <div class="ss-card">
            <div class="ss-row">
              <div><div class="ss-lbl">Today P&amp;L</div></div>
              <div style="text-align:right">
                <div class="ss-val g" id="vmt-ss-today-rs">&#8212;</div>
                <div class="ss-sub" id="vmt-ss-today-pts"></div>
              </div>
            </div>
            <div class="ss-row" id="vmt-ss-unr-row" style="display:none">
              <div><div class="ss-lbl" style="color:var(--muted);font-style:italic">&#8517; Unrealised</div></div>
              <div style="text-align:right">
                <div class="ss-val" id="vmt-ss-unr-rs">&#8212;</div>
                <div class="ss-sub" id="vmt-ss-unr-pts"></div>
              </div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">Trade Status</div></div>
              <div style="text-align:right">
                <div class="ss-val" id="vmt-ss-status">Idle</div>
                <div class="ss-sub" id="vmt-ss-dir"></div>
              </div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">ATM Strike / DTE</div></div>
              <div style="text-align:right">
                <div class="ss-val mono" id="vmt-ss-strike">&#8212;</div>
                <div class="ss-sub" id="vmt-ss-dte"></div>
              </div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">CE Open Prem &#8594; Entry</div></div>
              <div style="text-align:right">
                <div class="ss-val" id="vmt-ss-ce" style="font-size:.82rem">&#8212;</div>
              </div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">PE Open Prem &#8594; Entry</div></div>
              <div style="text-align:right">
                <div class="ss-val" id="vmt-ss-pe" style="font-size:.82rem">&#8212;</div>
              </div>
            </div>
          </div>
        </div>

      </div><!-- /db-main -->

      <!-- Trade History — same section header + Daily/Weekly/Monthly as AMINA -->
      <div style="display:flex;align-items:center;gap:8px;margin-top:1.5rem;margin-bottom:.6rem;flex-wrap:wrap">
        <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:1px;color:#8b949e;font-weight:700">Trade History</span>
        <div style="display:flex;gap:4px;margin-left:auto">
          <button id="vmt-th-btn-d" onclick="_vmtThFilter('d')" style="padding:3px 12px;border-radius:5px;font-size:.72rem;font-weight:700;cursor:pointer;border:1px solid #7c3aed;background:rgba(124,58,237,.2);color:#a78bfa">Daily</button>
          <button id="vmt-th-btn-w" onclick="_vmtThFilter('w')" style="padding:3px 12px;border-radius:5px;font-size:.72rem;font-weight:700;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text-muted)">Weekly</button>
          <button id="vmt-th-btn-m" onclick="_vmtThFilter('m')" style="padding:3px 12px;border-radius:5px;font-size:.72rem;font-weight:700;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text-muted)">Monthly</button>
        </div>
        <span class="sec-count" id="vmt-th-count" style="margin:0"></span>
      </div>

      <!-- DAILY panel -->
      <div id="vmt-th-panel-d">
        <div class="tw"><table class="tt">
          <thead><tr><th>Time</th><th>Dir</th><th>Strike</th><th>Open Prem</th><th>Entry Prem</th><th>Exit Prem</th><th>Prem P&amp;L</th><th>&#8377; P&amp;L</th><th>Reason</th></tr></thead>
          <tbody id="vmt-tbody-d"><tr><td colspan="9" class="tt-e">No VMT trades today</td></tr></tbody>
        </table></div>
      </div>

      <!-- WEEKLY panel -->
      <div id="vmt-th-panel-w" style="display:none">
        <div class="tw"><table class="tt">
          <thead><tr><th>Date</th><th>Dir</th><th>Strike</th><th>Open Prem</th><th>Entry Prem</th><th>Prem P&amp;L</th><th>&#8377; P&amp;L</th><th>Reason</th></tr></thead>
          <tbody id="vmt-tbody-w"><tr><td colspan="8" class="tt-e">No VMT trades in last 7 days</td></tr></tbody>
        </table></div>
      </div>

      <!-- MONTHLY panel -->
      <div id="vmt-th-panel-m" style="display:none">
        <div class="tw"><table class="tt">
          <thead><tr><th>Month</th><th>&#8377; P&amp;L</th><th>Prem P&amp;L</th><th>Trades</th><th>W/L</th></tr></thead>
          <tbody id="vmt-tbody-m"><tr><td colspan="5" class="tt-e">No monthly data yet</td></tr></tbody>
        </table></div>
      </div>

      <script>
      (function(){
        function _vmtThFilter(f){
          ['d','w','m'].forEach(function(x){
            var p=document.getElementById('vmt-th-panel-'+x);
            var b=document.getElementById('vmt-th-btn-'+x);
            if(p) p.style.display=(x===f)?'':'none';
            if(b){
              if(x===f){b.style.background='rgba(124,58,237,.2)';b.style.borderColor='#7c3aed';b.style.color='#a78bfa';}
              else{b.style.background='transparent';b.style.borderColor='';b.style.color='';}
            }
          });
          var rows=document.querySelectorAll('#vmt-th-panel-'+f+' tbody tr:not(.tt-e)');
          var cnt=document.getElementById('vmt-th-count');
          if(cnt) cnt.textContent=rows.length?'('+rows.length+' trade'+(rows.length!==1?'s':'')+')':'';
        }
        window._vmtThFilter=_vmtThFilter;
        _vmtThFilter('d');
      })();
      </script>

    </div><!-- /panel-vmt -->`;

src = src.replace(oldBlock, NEW_PANEL);
console.log('✓ Patch 1: VMT panel HTML replaced — now identical structure to AMINA');

// ── Replace _vmtRefresh JS ────────────────────────────────────────────────────
const VMT_JS_START = '  // ─── VMT Shadow refresh (separate poll, every 5s) ──────────────────────────';
const VMT_JS_END   = '  setInterval(_dbRefresh,3000);';

const jsStart = src.indexOf(VMT_JS_START);
const jsEnd   = src.indexOf(VMT_JS_END, jsStart);
if (jsStart === -1 || jsEnd === -1) {
    console.error('Cannot find _vmtRefresh block');
    process.exit(1);
}

const NEW_VMT_JS = `  // ─── VMT Shadow refresh (separate poll, every 5s) ──────────────────────────
  var _vmtDailyLog=[];
  async function _vmtRefresh(){
    try{
      const r=await fetch('/api/vmt-shadow');
      const v=await r.json();
      if(!v)return;
      const st=v.status||'IDLE';
      const inT=(st==='IN_TRADE');
      const isDone=(st==='DONE');
      const hasSetup=!!(v.atmStrike);

      // ── Tab P&L badge ─────────────────────────────────────────────────────
      const fp=isDone?(v.finalPnl||0):(inT?(v.livePnl||0):0);
      const vmtPnlEl=ge('stab-pnl-vmt');
      if(vmtPnlEl){
        if(st==='IDLE'||st==='WAITING'||(!inT&&!isDone)){vmtPnlEl.innerHTML='&mdash;';vmtPnlEl.style.color='#8b949e';}
        else{vmtPnlEl.textContent=fR(fp);vmtPnlEl.style.color=gc(fp);}
      }

      // ── Right stats card ──────────────────────────────────────────────────
      var totPnl=isDone?(v.finalPnl||0):(inT?(v.livePnl||0):0);
      var todRs=ge('vmt-ss-today-rs'),todPts=ge('vmt-ss-today-pts');
      if(todRs){
        if(!inT&&!isDone){todRs.innerHTML='&mdash;';todRs.style.color='';}
        else{todRs.textContent=fR(totPnl);todRs.style.color=gc(totPnl);}
      }
      if(todPts)todPts.textContent=(inT||isDone)?fP(totPnl):'';

      var unrRow=ge('vmt-ss-unr-row');
      if(unrRow){
        unrRow.style.display=inT?'':'none';
        if(inT){
          var ruR=ge('vmt-ss-unr-rs'),ruP=ge('vmt-ss-unr-pts');
          if(ruR){ruR.textContent=fR(v.livePnl||0);ruR.style.color=gc(v.livePnl||0);}
          if(ruP){ruP.textContent=fP(v.livePnl||0);ruP.style.color=gc(v.livePnl||0);}
        }
      }

      // Trade Status row
      var ssStatus=ge('vmt-ss-status'),ssDirEl=ge('vmt-ss-dir');
      if(ssStatus){
        if(isDone){var rm={TARGET:'&#9989; Target Hit',SL:'&#10060; SL Hit',TIME_EXIT:'&#9200; Time Exit',NO_TRADE:'&#9208; No Trade'};ssStatus.innerHTML=rm[v.exitReason]||v.exitReason||'Done';}
        else if(inT){ssStatus.textContent='In Trade';}
        else if(st==='READY'){ssStatus.textContent='Watching for trigger';}
        else{ssStatus.textContent='Waiting';}
      }
      if(ssDirEl){
        ssDirEl.innerHTML=v.tradeDir?('<span class="db-badge '+(v.tradeDir==='CE'?'ce':'pe')+'">'+v.tradeDir+'</span>'):'';
      }

      // ATM / DTE row
      if(ge('vmt-ss-strike'))ge('vmt-ss-strike').textContent=hasSetup?(v.atmStrike||'&mdash;'):'&mdash;';
      if(ge('vmt-ss-dte'))ge('vmt-ss-dte').textContent=hasSetup?(v.dte?v.dte+'d to expiry'):'':'';

      // CE/PE setup rows
      if(ge('vmt-ss-ce'))ge('vmt-ss-ce').textContent=hasSetup&&v.ceEntry!=null?('\u20B9'+(v.cePremium||0).toFixed(1)+' \u2192 Entry \u20B9'+(v.ceEntry||0).toFixed(1)):'&mdash;';
      if(ge('vmt-ss-pe'))ge('vmt-ss-pe').textContent=hasSetup&&v.peEntry!=null?('\u20B9'+(v.pePremium||0).toFixed(1)+' \u2192 Entry \u20B9'+(v.peEntry||0).toFixed(1)):'&mdash;';

      // ── Left position card ─────────────────────────────────────────────────
      var posCard=ge('vmt-pos-card');
      var flatCard=ge('vmt-pos-flat');
      var watchLvl=ge('vmt-watch-levels');
      var statusTxt=ge('vmt-status-txt');

      if(inT&&(v.tradeEntry||0)>0){
        // Show active position card
        if(flatCard)flatCard.style.display='none';
        if(posCard){
          posCard.style.display='';
          var tdir=(v.tradeDir||'CE').toUpperCase();
          posCard.className='pos-card pos-'+(tdir==='CE'?'ce':'pe');
          var badge=ge('vmt-card-badge');
          if(badge){badge.className='pos-badge pos-b-'+(tdir==='CE'?'ce':'pe');badge.textContent=tdir+' OPTION';}
          var lunr=v.livePnl||0;
          var rsEl=ge('vmt-card-rs'),ptsEl=ge('vmt-card-pts');
          if(rsEl){rsEl.textContent=fR(lunr);rsEl.className='pos-pnl-rs '+(lunr>=0?'g':'r');}
          if(ptsEl){ptsEl.textContent=(lunr>=0?'+':'')+lunr.toFixed(1)+' premium pts unrealised';ptsEl.className='pos-pnl-pts '+(lunr>=0?'g':'r');}
          // Gauge (SL dist = entry - SL; range = SL dist * 4; 0%=SL, 50%=entry, 100%=target)
          var slD=Math.abs((v.tradeEntry||0)-(v.tradeSL||0));
          var gf=ge('vmt-card-gauge');
          if(gf&&slD>0){var pct=Math.min(100,Math.max(0,Math.round(((lunr+slD)/(slD*4))*100)));gf.style.width=pct+'%';gf.style.background=lunr>=0?'#10b981':'#ef4444';}
          if(ge('vmt-card-ep'))ge('vmt-card-ep').textContent=(v.tradeEntry||0).toFixed(1);
          if(ge('vmt-card-lp'))ge('vmt-card-lp').textContent=(v.liveOptPrice||0).toFixed(1);
          if(ge('vmt-card-sl'))ge('vmt-card-sl').textContent=(v.tradeSL||0).toFixed(1);
          if(ge('vmt-card-slrs'))ge('vmt-card-slrs').textContent='\u20B9'+Math.abs(Math.round(slD*15)).toLocaleString('en-IN');
          if(ge('vmt-card-tgt'))ge('vmt-card-tgt').textContent=(v.tradeTarget||0).toFixed(1);
          if(ge('vmt-card-strike'))ge('vmt-card-strike').textContent=v.atmStrike||'&mdash;';
          var openPrem=(tdir==='CE'?(v.cePremium||0):(v.pePremium||0));
          if(ge('vmt-card-open-prem'))ge('vmt-card-open-prem').textContent='\u20B9'+openPrem.toFixed(1);
          if(ge('vmt-card-live-prem'))ge('vmt-card-live-prem').textContent='\u20B9'+(v.liveOptPrice||0).toFixed(1);
        }
      } else {
        // Show watching / flat card
        if(posCard)posCard.style.display='none';
        if(flatCard)flatCard.style.display='';
        if(statusTxt){
          if(isDone){
            var rm2={TARGET:'&#9989; Target Hit',SL:'&#10060; SL Hit',TIME_EXIT:'&#9200; Time Exit',NO_TRADE:'&#9208; No Trade Fired'};
            statusTxt.innerHTML=rm2[v.exitReason]||v.exitReason||'Done';
          } else if(st==='READY'){
            statusTxt.textContent='Setup ready \u2014 watching for trigger';
          } else {
            statusTxt.textContent='Waiting for market open';
          }
        }
        // Watch levels in flat card
        if(watchLvl){
          if(st==='READY'&&v.ceEntry!=null){
            var ceD=(v.ceNow||0)-(v.ceEntry||0);
            var peD=(v.peNow||0)-(v.peEntry||0);
            watchLvl.innerHTML=
              '<div class="watch-lvl-row watch-ce-row"><span class="watch-lvl-dir" style="color:#60a5fa">CE &#9651;</span><span class="watch-lvl-val">Entry \u20B9'+(v.ceEntry||0).toFixed(1)+'</span><span class="watch-lvl-dist">Live \u20B9'+(v.ceNow||0).toFixed(1)+' <span style="color:'+(ceD>=0?'#10b981':'#94a3b8')+'">'+(ceD>=0?'&#10003; triggered':'\u21D1 '+Math.abs(ceD).toFixed(1)+' away')+'</span></span></div>'+
              '<div class="watch-lvl-row watch-pe-row"><span class="watch-lvl-dir" style="color:#fca5a5">PE &#9661;</span><span class="watch-lvl-val">Entry \u20B9'+(v.peEntry||0).toFixed(1)+'</span><span class="watch-lvl-dist">Live \u20B9'+(v.peNow||0).toFixed(1)+' <span style="color:'+(peD>=0?'#10b981':'#94a3b8')+'">'+(peD>=0?'&#10003; triggered':'\u21D1 '+Math.abs(peD).toFixed(1)+' away')+'</span></span></div>';
          } else if(isDone&&v.tradeDir){
            var fp2=v.finalPnl||0;
            watchLvl.innerHTML='Final: <span style="color:'+gc(fp2)+'">'+fR(fp2)+'</span> &nbsp;&#183;&nbsp; <span style="color:'+gc(fp2)+'">'+fP(fp2)+'</span>';
          } else if(isDone&&v.exitReason==='NO_TRADE'){
            watchLvl.innerHTML='<span style="color:#8b949e">Entry window (9:15\u20139:45) closed without trigger.</span>';
          } else if(hasSetup){
            watchLvl.innerHTML='<span style="opacity:.7">ATM '+v.atmStrike+' &nbsp;&#183;&nbsp; CE \u20B9'+(v.cePremium||0).toFixed(1)+' &rarr; \u20B9'+(v.ceEntry||0).toFixed(1)+' entry</span>';
          } else {
            watchLvl.innerHTML='<span style="opacity:.4">Calculating setup levels\u2026</span>';
          }
        }
      }

      // ── Trade table (Daily only — VMT fires max 1 trade per day) ─────────
      var tbody=ge('vmt-tbody-d');
      var cntEl=ge('vmt-th-count');
      if(tbody){
        if((inT||isDone)&&v.tradeDir){
          var tdir2=v.tradeDir;
          var pnlV=isDone?(v.finalPnl||0):(v.livePnl||0);
          var reasonMap={TARGET:'Target Hit',SL:'SL Hit',TIME_EXIT:'Time Exit',NO_TRADE:'No Trade'};
          var rTagMap={TARGET:'rc-eod',SL:'rc-sl',TIME_EXIT:'rc-trail',NO_TRADE:'rc-eod'};
          var reasonTxt=isDone?(reasonMap[v.exitReason]||v.exitReason):'Live';
          var rTagCls=isDone?(rTagMap[v.exitReason]||'rc-eod'):'rc-trail';
          var openPrem2=(tdir2==='CE'?(v.cePremium||0):(v.pePremium||0));
          var exitPrem=(isDone&&v.liveOptPrice)?v.liveOptPrice:0;
          var timeStr=new Date().toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'});
          tbody.innerHTML='<tr>'+
            '<td class="tc">'+timeStr+'</td>'+
            '<td><span class="db-badge '+(tdir2==='CE'?'ce':'pe')+'">'+tdir2+'</span></td>'+
            '<td class="mono">'+(v.atmStrike||'&mdash;')+'</td>'+
            '<td class="mono">\u20B9'+openPrem2.toFixed(1)+'</td>'+
            '<td class="mono">\u20B9'+(v.tradeEntry||0).toFixed(1)+'</td>'+
            '<td class="mono">'+(exitPrem>0?'\u20B9'+exitPrem.toFixed(1):(isDone?'&mdash;':'live'))+'</td>'+
            '<td class="'+(pnlV>=0?'g':'r')+'" style="font-weight:800">'+(pnlV>=0?'+':'')+pnlV.toFixed(1)+' pts</td>'+
            '<td><span class="pnl-rs '+(pnlV>=0?'g':'r')+'">'+(Math.round(pnlV*15)>=0?'+':'&minus;')+'\u20B9'+Math.abs(Math.round(pnlV*15)).toLocaleString('en-IN')+'</span></td>'+
            '<td><span class="rc-b '+rTagCls+'">'+reasonTxt+'</span></td>'+
          '</tr>';
          if(cntEl)cntEl.textContent='(1 trade)';
        } else if(isDone&&v.exitReason==='NO_TRADE'){
          tbody.innerHTML='<tr><td colspan="9" class="tt-e">No trade fired today (9:15\u20139:45 window passed)</td></tr>';
          if(cntEl)cntEl.textContent='';
        } else {
          tbody.innerHTML='<tr><td colspan="9" class="tt-e">No VMT trades today</td></tr>';
          if(cntEl)cntEl.textContent='';
        }
      }
    }catch(e){console.error('VMT refresh err',e);}
  }
  setInterval(_vmtRefresh,5000);
  _vmtRefresh();

  setInterval(_dbRefresh,3000);`;

const oldJsBlock = src.slice(jsStart, jsEnd + VMT_JS_END.length);
src = src.replace(oldJsBlock, NEW_VMT_JS);
console.log('✓ Patch 2: _vmtRefresh JS updated to match AMINA structure');

fs.writeFileSync(FILE, src);
console.log('\n✅  Done. VMT tab now has pixel-perfect AMINA layout.');
