'use strict';
/**
 * patch_vmt_design.js
 * Replaces the VMT panel HTML and JS with an AMINA-identical design.
 * Run once: node /root/zeroscreen/patch_vmt_design.js
 */

const fs   = require('fs');
const FILE = '/root/zeroscreen/dist/server.js';
let src = fs.readFileSync(FILE, 'utf8');

// ── PATCH 1: Replace panel-vmt HTML ──────────────────────────────────────────
const OLD_PANEL = `    <div id="panel-vmt" style="display:none">
      <div class="db-main">

        <!-- LEFT: VMT Position / Setup -->
        <div>
          <!-- Flat / Setup card -->
          <div class="watch-card" id="vmt-flat-card">
            <div class="watch-title"><span>&#128161;</span>VMT Shadow &mdash; <span id="vmt-status-txt">Waiting for market open</span></div>
            <!-- Pre-trade setup row -->
            <div id="vmt-setup-detail" style="margin-top:10px;display:none">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.78rem">
                <div><div class="pos-lbl">ATM Strike</div><div class="pos-val mono" id="vmt-atm-val">&#8212;</div></div>
                <div><div class="pos-lbl">Days to Expiry</div><div class="pos-val" id="vmt-dte-val">&#8212;</div></div>
                <div><div class="pos-lbl">CE: Prem / Entry / Target</div><div class="pos-val mono" id="vmt-ce-levels">&#8212;</div></div>
                <div><div class="pos-lbl">PE: Prem / Entry / Target</div><div class="pos-val mono" id="vmt-pe-levels">&#8212;</div></div>
              </div>
            </div>
            <!-- Live trigger watch (READY state) -->
            <div id="vmt-trigger-detail" style="margin-top:10px;display:none">
              <div style="font-size:.72rem;color:#8b949e;margin-bottom:6px;text-transform:uppercase;letter-spacing:.8px">Watching for entry trigger (9:15&#8211;9:45)</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.78rem">
                <div><div class="pos-lbl" style="color:#60a5fa">CE Live Price</div><div class="pos-val mono g" id="vmt-ce-now">&#8212;</div></div>
                <div><div class="pos-lbl" style="color:#60a5fa">CE Distance to Entry</div><div class="pos-val" id="vmt-ce-dist">&#8212;</div></div>
                <div><div class="pos-lbl" style="color:#fca5a5">PE Live Price</div><div class="pos-val mono g" id="vmt-pe-now">&#8212;</div></div>
                <div><div class="pos-lbl" style="color:#fca5a5">PE Distance to Entry</div><div class="pos-val" id="vmt-pe-dist">&#8212;</div></div>
              </div>
            </div>
            <!-- No-trade result -->
            <div id="vmt-notrade-detail" style="margin-top:10px;display:none;font-size:.8rem;color:#8b949e">No entry trigger fired today (9:15&#8211;9:45 window passed without trigger).</div>
          </div>
          <!-- In-trade card (hidden when flat/done) -->
          <div class="pos-card pos-ce" id="vmt-trade-card" style="display:none">
            <div class="pos-hdr">
              <span class="pos-live-dot"></span>
              <span class="pos-badge pos-b-ce" id="vmt-trade-badge">CE OPTION</span>
              <span class="pos-sym">BANKNIFTY</span>
              <span class="pos-mode">PAPER</span>
            </div>
            <div class="pos-pnl-rs g" id="vmt-trade-rs">&#8212;</div>
            <div class="pos-pnl-pts g" id="vmt-trade-pts">&#8212; unrealised</div>
            <div class="pos-grid">
              <div><div class="pos-lbl">Entry Premium</div><div class="pos-val mono" id="vmt-trade-ep">&#8212;</div></div>
              <div><div class="pos-lbl">Live Premium</div><div class="pos-val mono g" id="vmt-trade-lp">&#8212;</div></div>
              <div><div class="pos-lbl">SL Premium</div><div class="pos-val mono r" id="vmt-trade-sl">&#8212;</div></div>
              <div><div class="pos-lbl">Target Premium</div><div class="pos-val mono" style="color:#fbbf24" id="vmt-trade-tgt">&#8212;</div></div>
            </div>
          </div>
          <!-- Done card -->
          <div class="watch-card" id="vmt-done-card" style="display:none">
            <div class="watch-title"><span id="vmt-done-icon">&#128161;</span> VMT Result &mdash; <span id="vmt-done-reason">&#8212;</span></div>
            <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.78rem">
              <div><div class="pos-lbl">Direction</div><div class="pos-val" id="vmt-done-dir">&#8212;</div></div>
              <div><div class="pos-lbl">Entry Premium</div><div class="pos-val mono" id="vmt-done-ep">&#8212;</div></div>
              <div><div class="pos-lbl">Final P&amp;L (pts)</div><div class="pos-val" id="vmt-done-pts">&#8212;</div></div>
              <div><div class="pos-lbl">Final P&amp;L (&#8377;/lot)</div><div class="pos-val" id="vmt-done-rs">&#8212;</div></div>
            </div>
          </div>
        </div>

        <!-- RIGHT: VMT Session Stats -->
        <div>
          <div class="ss-card">
            <div class="ss-row">
              <div><div class="ss-lbl">Today P&amp;L</div></div>
              <div style="text-align:right">
                <div class="ss-val" id="vmt-ss-today-rs">&#8212;</div>
                <div class="ss-sub" id="vmt-ss-today-pts"></div>
              </div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">Status</div></div>
              <div style="text-align:right"><div class="ss-val" id="vmt-ss-status">Idle</div></div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">Trade Fired</div></div>
              <div style="text-align:right"><div class="ss-val" id="vmt-ss-fired">&#8212;</div></div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">Direction</div></div>
              <div style="text-align:right"><div class="ss-val" id="vmt-ss-dir">&#8212;</div></div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">Last Updated</div></div>
              <div style="text-align:right"><div class="ss-val" style="font-size:.78rem" id="vmt-ss-ts">&#8212;</div></div>
            </div>
          </div>
          <div style="margin-top:10px;padding:10px 14px;background:rgba(251,191,36,.07);border:1px solid rgba(251,191,36,.2);border-radius:8px;font-size:.72rem;color:#fbbf24;line-height:1.5">
            <strong>VMT Strategy:</strong> At 9:15 AM, ATM option premium is noted.
            Entry = Premium + 7 pts. SL = Premium. Target = 3R (+21 pts).
            First side (CE or PE) to reach entry level is traded.
            Time exit at 11:30 AM. Option prices via Black-Scholes.
          </div>
        </div>
      </div><!-- /db-main -->
    </div><!-- /panel-vmt -->`;

const NEW_PANEL = `    <div id="panel-vmt" style="display:none">

      <div class="db-main">

        <!-- LEFT: VMT Position card (mirrors AMINA pos-card design) -->
        <div id="vmt-pos-wrap">
          <!-- FLAT / WATCHING card -->
          <div class="watch-card" id="vmt-pos-flat">
            <div class="watch-title"><span>&#128161;</span>VMT Shadow &mdash; <span id="vmt-status-txt">Waiting for market open</span></div>
            <!-- Setup levels (shown after 9:15) -->
            <div id="vmt-watch-levels" style="font-size:.78rem;color:var(--muted);margin-top:8px">
              <span style="opacity:.4">Calculating setup levels&#8203;&#8230;</span>
            </div>
          </div>
          <!-- IN-TRADE card (hidden when flat) -->
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
              <div><div class="pos-lbl">Target Premium</div><div class="pos-val mono" style="color:#fbbf24" id="vmt-card-tgt">&#8212;</div></div>
              <div><div class="pos-lbl">ATM Strike</div><div class="pos-val mono" id="vmt-card-strike">&#8212;</div></div>
            </div>
            <div class="pos-divider"></div>
            <div class="pos-prem-row">
              <div class="pos-prem-cell"><span class="pos-prem-tag buy-tag">OPEN Premium</span><span class="pos-prem-val" id="vmt-card-open-prem">&#8212;</span></div>
              <div class="pos-prem-cell"><span class="pos-prem-tag" style="background:rgba(251,191,36,.15);color:#fbbf24">LIVE Premium</span><span class="pos-prem-val" id="vmt-card-live-prem">&#8212;</span></div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Session Stats (identical structure to AMINA) -->
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
              <div><div class="ss-lbl">ATM Strike</div></div>
              <div style="text-align:right"><div class="ss-val mono" id="vmt-ss-strike">&#8212;</div></div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">Open CE / PE Premium</div></div>
              <div style="text-align:right"><div class="ss-val" id="vmt-ss-prems" style="font-size:.82rem">&#8212;</div></div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">CE Entry / PE Entry</div></div>
              <div style="text-align:right"><div class="ss-val" id="vmt-ss-entries" style="font-size:.82rem">&#8212;</div></div>
            </div>
            <div class="ss-row">
              <div><div class="ss-lbl">Status</div></div>
              <div style="text-align:right"><div class="ss-val" id="vmt-ss-status">Idle</div></div>
            </div>
          </div>
          <div style="margin-top:10px;padding:10px 14px;background:rgba(251,191,36,.07);border:1px solid rgba(251,191,36,.2);border-radius:8px;font-size:.72rem;color:#fbbf24;line-height:1.6">
            <strong>VMT Strategy:</strong> At 9:15 AM open, ATM premium noted.
            Entry&nbsp;=&nbsp;Premium&nbsp;+&nbsp;7&nbsp;pts &nbsp;&#183;&nbsp; SL&nbsp;=&nbsp;Premium &nbsp;&#183;&nbsp; Target&nbsp;=&nbsp;3R&nbsp;(+21&nbsp;pts).
            Whichever side (CE/PE) hits entry first &rarr; take that trade.
            Time exit at 11:30 AM. Prices via Black-Scholes model.
          </div>
        </div>

      </div><!-- /db-main -->

      <!-- VMT Trade Log (same style as AMINA trade history) -->
      <div style="display:flex;align-items:center;gap:8px;margin-top:1.5rem;margin-bottom:.6rem;flex-wrap:wrap">
        <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:1px;color:#8b949e;font-weight:700">VMT Trade Log</span>
        <span class="sec-count" id="vmt-trade-count" style="margin:0"></span>
      </div>
      <div class="tw"><table class="tt">
        <thead><tr><th>Time</th><th>Dir</th><th>Strike</th><th>Open Prem</th><th>Entry Prem</th><th>Exit Prem</th><th>P&amp;L (pts)</th><th>&#8377; P&amp;L</th><th>Reason</th></tr></thead>
        <tbody id="vmt-trade-tbody">
          <tr><td colspan="9" class="tt-e">No VMT trades today</td></tr>
        </tbody>
      </table></div>

    </div><!-- /panel-vmt -->`;

if (!src.includes(OLD_PANEL.slice(0, 80))) {
    console.error('ERROR: Cannot find old VMT panel. Searching for alternate anchor...');
    // Try finding by just the opening line
    const idx = src.indexOf('    <div id="panel-vmt" style="display:none">');
    const endIdx = src.indexOf('    </div><!-- /panel-vmt -->');
    if (idx === -1 || endIdx === -1) {
        console.error('Cannot locate panel-vmt. Aborting.');
        process.exit(1);
    }
    const oldBlock = src.slice(idx, endIdx + '    </div><!-- /panel-vmt -->'.length);
    src = src.replace(oldBlock, NEW_PANEL);
} else {
    src = src.replace(OLD_PANEL, NEW_PANEL);
}
console.log('✓ Patch 1: VMT panel HTML replaced with AMINA-identical design');

// ── PATCH 2: Replace _vmtRefresh JS ──────────────────────────────────────────
// Find and replace the entire _vmtRefresh function
const VMT_JS_START = '  // ─── VMT Shadow refresh (separate poll, every 5s) ──────────────────────────\n  async function _vmtRefresh(){';
const VMT_JS_END   = '  _vmtRefresh();\n\n  setInterval(_dbRefresh,3000);';

const startIdx = src.indexOf(VMT_JS_START);
const endIdx2  = src.indexOf(VMT_JS_END);
if (startIdx === -1 || endIdx2 === -1) {
    console.error('Cannot find _vmtRefresh JS block. startIdx='+startIdx+' endIdx='+endIdx2);
    process.exit(1);
}

const NEW_VMT_JS = `  // ─── VMT Shadow refresh (separate poll, every 5s) ──────────────────────────
  async function _vmtRefresh(){
    try{
      const r=await fetch('/api/vmt-shadow');
      const v=await r.json();
      if(!v)return;
      const st=v.status||'IDLE';
      const inT=(st==='IN_TRADE');
      const isDone=(st==='DONE');

      // ── Tab P&L badge ──────────────────────────────────────────────────────
      const fp=isDone?(v.finalPnl||0):(inT?(v.livePnl||0):0);
      const vmtPnlEl=ge('stab-pnl-vmt');
      if(vmtPnlEl){
        vmtPnlEl.innerHTML=(st==='IDLE'||st==='WAITING')?'&mdash;':fR(fp);
        vmtPnlEl.style.color=gc(fp);
      }

      // ── Stats panel ────────────────────────────────────────────────────────
      if(ge('vmt-ss-status'))ge('vmt-ss-status').textContent=st;
      if(ge('vmt-ss-strike'))ge('vmt-ss-strike').textContent=v.atmStrike||'&mdash;';
      if(v.cePremium!=null&&ge('vmt-ss-prems'))ge('vmt-ss-prems').textContent='\u20B9'+(v.cePremium||0).toFixed(1)+' / \u20B9'+(v.pePremium||0).toFixed(1);
      if(v.ceEntry!=null&&ge('vmt-ss-entries'))ge('vmt-ss-entries').textContent='\u20B9'+(v.ceEntry||0).toFixed(1)+' / \u20B9'+(v.peEntry||0).toFixed(1);

      // Today P&L + unrealised
      var totPnl=isDone?(v.finalPnl||0):(inT?(v.livePnl||0):0);
      var todRsEl=ge('vmt-ss-today-rs'),todPtsEl=ge('vmt-ss-today-pts');
      if(todRsEl){
        todRsEl.textContent=(st==='IDLE'||st==='WAITING')?'&mdash;':fR(totPnl);
        todRsEl.style.color=gc(totPnl);
      }
      if(todPtsEl)todPtsEl.textContent=(st!=='IDLE'&&st!=='WAITING')?fP(totPnl):'';
      var unrRow=ge('vmt-ss-unr-row');
      if(unrRow){unrRow.style.display=inT?'':'none';if(inT){var ruR=ge('vmt-ss-unr-rs'),ruP=ge('vmt-ss-unr-pts');if(ruR){ruR.textContent=fR(v.livePnl||0);ruR.style.color=gc(v.livePnl||0);}if(ruP){ruP.textContent=fP(v.livePnl||0);ruP.style.color=gc(v.livePnl||0);}}}

      // ── Position card show/hide ────────────────────────────────────────────
      var flatCard=ge('vmt-pos-flat');
      var posCard=ge('vmt-pos-card');
      var watchLvl=ge('vmt-watch-levels');

      if(inT&&(v.tradeEntry||0)>0){
        // Show position card
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
          // Gauge: 0% at SL, 50% at entry, 100% at target
          var gf=ge('vmt-card-gauge');
          if(gf){var slDist=(v.tradeEntry||0)-(v.tradeSL||0);var range=slDist*4;var pct=Math.min(100,Math.max(0,Math.round(((lunr+slDist)/range)*100)));gf.style.width=pct+'%';gf.style.background=lunr>=0?'#10b981':'#ef4444';}
          if(ge('vmt-card-ep'))ge('vmt-card-ep').textContent=(v.tradeEntry||0).toFixed(1);
          if(ge('vmt-card-lp'))ge('vmt-card-lp').textContent=(v.liveOptPrice||0).toFixed(1);
          if(ge('vmt-card-sl'))ge('vmt-card-sl').textContent=(v.tradeSL||0).toFixed(1);
          var slRs=Math.round(Math.abs((v.tradeSL||0)-(v.tradeEntry||0))*15);
          if(ge('vmt-card-slrs'))ge('vmt-card-slrs').textContent='\u20B9'+slRs.toLocaleString('en-IN');
          if(ge('vmt-card-tgt'))ge('vmt-card-tgt').textContent=(v.tradeTarget||0).toFixed(1);
          if(ge('vmt-card-strike'))ge('vmt-card-strike').textContent=v.atmStrike||'&mdash;';
          if(ge('vmt-card-open-prem'))ge('vmt-card-open-prem').textContent='\u20B9'+(tdir==='CE'?(v.cePremium||0).toFixed(1):(v.pePremium||0).toFixed(1));
          if(ge('vmt-card-live-prem'))ge('vmt-card-live-prem').textContent='\u20B9'+(v.liveOptPrice||0).toFixed(1);
        }
      } else {
        // Show flat / watching card
        if(posCard)posCard.style.display='none';
        if(flatCard)flatCard.style.display='';
        var statusTxt=ge('vmt-status-txt');
        if(statusTxt){
          if(isDone){
            var reasonMap={TARGET:'&#9989; Target Hit',SL:'&#10060; SL Hit',TIME_EXIT:'&#9200; Time Exit',NO_TRADE:'&#9208; No Trade Fired'};
            statusTxt.innerHTML=reasonMap[v.exitReason]||v.exitReason||'Done';
          } else if(st==='READY'){
            statusTxt.textContent='Setup ready \u2014 watching for trigger (9:15\u20139:45)';
          } else {
            statusTxt.textContent='Waiting for market open';
          }
        }
        // Watch levels content
        if(watchLvl){
          if(st==='READY'&&v.ceEntry!=null){
            var ceD=(v.ceNow||0)-(v.ceEntry||0);
            var peD=(v.peNow||0)-(v.peEntry||0);
            watchLvl.innerHTML=
              '<div class="watch-lvl-row watch-ce-row"><span class="watch-lvl-dir" style="color:#60a5fa">CE &#9651;</span><span class="watch-lvl-val">Entry \u20B9'+(v.ceEntry||0).toFixed(1)+'</span><span class="watch-lvl-dist">Live \u20B9'+(v.ceNow||0).toFixed(1)+' <span style="color:'+(ceD>=0?'#10b981':'#94a3b8')+'">'+(ceD>=0?'&#10003; triggered':'\u21D1 '+(Math.abs(ceD)).toFixed(1)+' pts away')+'</span></span></div>'+
              '<div class="watch-lvl-row watch-pe-row"><span class="watch-lvl-dir" style="color:#fca5a5">PE &#9661;</span><span class="watch-lvl-val">Entry \u20B9'+(v.peEntry||0).toFixed(1)+'</span><span class="watch-lvl-dist">Live \u20B9'+(v.peNow||0).toFixed(1)+' <span style="color:'+(peD>=0?'#10b981':'#94a3b8')+'">'+(peD>=0?'&#10003; triggered':'\u21D1 '+(Math.abs(peD)).toFixed(1)+' pts away')+'</span></span></div>';
          } else if(v.spotOpen&&st==='DONE'&&v.exitReason==='NO_TRADE'){
            watchLvl.innerHTML='<span style="color:#8b949e;font-size:.8rem">Entry window (9:15&#8211;9:45) closed without trigger.</span>';
          } else if(v.spotOpen&&isDone&&v.tradeDir){
            var finPnl=v.finalPnl||0;
            watchLvl.innerHTML='<span style="color:'+gc(finPnl)+'">'+fP(finPnl)+'</span> &nbsp;&#183;&nbsp; <span style="color:'+gc(finPnl)+'">'+fR(finPnl)+'</span>';
          } else if(v.atmStrike){
            watchLvl.innerHTML='<span style="opacity:.7">ATM '+v.atmStrike+' &nbsp;&#183;&nbsp; CE \u20B9'+(v.cePremium||0).toFixed(1)+' &rarr; Entry \u20B9'+(v.ceEntry||0).toFixed(1)+'</span>';
          } else {
            watchLvl.innerHTML='<span style="opacity:.4">Calculating setup levels\u2026</span>';
          }
        }
      }

      // ── Trade log row ──────────────────────────────────────────────────────
      var tbody=ge('vmt-trade-tbody');
      var cntEl=ge('vmt-trade-count');
      if(tbody&&(isDone||inT)){
        var tdir2=(v.tradeDir||'');
        var pnlV=isDone?(v.finalPnl||0):(v.livePnl||0);
        var reasonTxt=isDone?({TARGET:'Target Hit',SL:'SL Hit',TIME_EXIT:'Time Exit',NO_TRADE:'No Trade'}[v.exitReason]||v.exitReason):'Live';
        var rTagCls=isDone?({TARGET:'rc-eod',SL:'rc-sl',TIME_EXIT:'rc-trail',NO_TRADE:'rc-eod'}[v.exitReason]||'rc-eod'):'rc-trail';
        var exitPrem=isDone?(v.liveOptPrice||0):(v.liveOptPrice||0);
        if(tdir2){
          tbody.innerHTML='<tr>'+
            '<td class="tc">'+new Date().toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'})+'</td>'+
            '<td><span class="db-badge '+(tdir2==='CE'?'ce':'pe')+'">'+tdir2+'</span></td>'+
            '<td class="mono">'+(v.atmStrike||'&mdash;')+'</td>'+
            '<td class="mono">\u20B9'+(tdir2==='CE'?(v.cePremium||0).toFixed(1):(v.pePremium||0).toFixed(1))+'</td>'+
            '<td class="mono">\u20B9'+(v.tradeEntry||0).toFixed(1)+'</td>'+
            '<td class="mono">'+(exitPrem>0?'\u20B9'+exitPrem.toFixed(1):'&mdash;')+'</td>'+
            '<td class="'+(pnlV>=0?'g':'r')+'" style="font-weight:800">'+(pnlV>=0?'+':'')+pnlV.toFixed(1)+' pts</td>'+
            '<td><span class="pnl-rs '+(pnlV>=0?'g':'r')+'">'+(Math.round(pnlV*15)>=0?'+':'&minus;')+'\u20B9'+Math.abs(Math.round(pnlV*15)).toLocaleString('en-IN')+'</span></td>'+
            '<td><span class="rc-b '+rTagCls+'">'+reasonTxt+'</span></td>'+
          '</tr>';
          if(cntEl)cntEl.textContent='(1 trade'+(isDone?')':' live)');
        } else if(isDone&&v.exitReason==='NO_TRADE'){
          tbody.innerHTML='<tr><td colspan="9" class="tt-e">No trade fired today (entry window missed)</td></tr>';
          if(cntEl)cntEl.textContent='(0 trades)';
        }
      } else if(tbody){
        tbody.innerHTML='<tr><td colspan="9" class="tt-e">No VMT trades today</td></tr>';
        if(cntEl)cntEl.textContent='';
      }
    }catch(e){console.error('VMT refresh err',e);}
  }
  setInterval(_vmtRefresh,5000);
  _vmtRefresh();

  setInterval(_dbRefresh,3000);`;

const oldJsBlock = src.slice(startIdx, endIdx2 + VMT_JS_END.length);
src = src.replace(oldJsBlock, NEW_VMT_JS);
console.log('✓ Patch 2: _vmtRefresh JS replaced with AMINA-style logic');

fs.writeFileSync(FILE, src);
console.log('\n✅  server.js patched — VMT tab now uses AMINA-identical design.');
