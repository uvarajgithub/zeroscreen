'use strict';
/**
 * patch_signals_vmt.js
 * Adds a 4th "VMT" strategy tab to the /signals page in server.js
 * Run once on server: node /root/zeroscreen/patch_signals_vmt.js
 */

const fs   = require('fs');
const FILE = '/root/zeroscreen/dist/server.js';

let src = fs.readFileSync(FILE, 'utf8');

if (src.includes('stab-vmt') || src.includes('panel-vmt')) {
    console.log('Already patched — skipping.');
    process.exit(0);
}

// ── PATCH 1: Add /api/vmt-shadow route in server.js ──────────────────────────
// Insert right after the sendTelegramNotification helper (near line 60)
const API_ANCHOR = `// ─── GET /signals `;

const API_NEW = `// ─── VMT Shadow proxy ───────────────────────────────────────────────────────
app.get('/api/vmt-shadow', async (_req, res) => {
    try {
        const VMT_FILE = '/home/ubuntu/trading-bot/dist/src/vmt-shadow.json';
        const fs2 = require('fs');
        if (!fs2.existsSync(VMT_FILE)) return res.json({ status: 'IDLE', error: 'VMT shadow not running' });
        res.json(JSON.parse(fs2.readFileSync(VMT_FILE, 'utf8')));
    } catch(e) { res.json({ status: 'IDLE', error: e.message }); }
});

// ─── GET /signals `;

src = src.replace(API_ANCHOR, API_NEW);
if (!src.includes('/api/vmt-shadow')) {
    // fallback: insert before app.get("/signals"
    src = src.replace(
        `app.get("/signals",`,
        `// ─── VMT Shadow proxy ───────────────────────────────────────────────────────
app.get('/api/vmt-shadow', async (_req, res) => {
    try {
        const VMT_FILE = '/home/ubuntu/trading-bot/dist/src/vmt-shadow.json';
        const fs2 = require('fs');
        if (!fs2.existsSync(VMT_FILE)) return res.json({ status: 'IDLE', error: 'VMT shadow not running' });
        res.json(JSON.parse(fs2.readFileSync(VMT_FILE, 'utf8')));
    } catch(e) { res.json({ status: 'IDLE', error: e.message }); }
});

app.get("/signals",`
    );
}
console.log('✓ Patch 1: /api/vmt-shadow endpoint added');

// ── PATCH 2: Add VMT tab button in stab-wrap ─────────────────────────────────
const TAB_ANCHOR = `      <button class="stab" id="stab-lock50old" type="button" onclick="_sTab('lock50old')">
        <span class="stab-name">&#9671; Lock50</span>
        <span class="stab-sub">Paper shadow</span>
        <span class="stab-pnl" id="stab-pnl-l50o"`;

// find and extend
const TAB_ANCHOR_CLOSE = `</span>
      </button>
    </div>
    <script>/* _sTab defined in main script below */</script>`;

const TAB_NEW_SUFFIX = `</span>
      </button>
      <button class="stab" id="stab-vmt" type="button" onclick="_sTab('vmt')">
        <span class="stab-name">&#128161; VMT</span>
        <span class="stab-sub">Option shadow</span>
        <span class="stab-pnl" id="stab-pnl-vmt" style="color:#8b949e">&#8212;</span>
      </button>
    </div>
    <script>/* _sTab defined in main script below */</script>`;

src = src.replace(TAB_ANCHOR_CLOSE, TAB_NEW_SUFFIX);
console.log('✓ Patch 2: VMT tab button added');

// ── PATCH 3: Add panel-vmt HTML after panel-lock50old ────────────────────────
const PANEL_ANCHOR = `    </div><!-- /panel-lock50old -->

  </div><!-- /db -->`;

const PANEL_NEW = `    </div><!-- /panel-lock50old -->

    <!-- ════════════════════════════════════════════════════════
         VMT SHADOW PANEL (Option Premium Breakout)
         ════════════════════════════════════════════════════════ -->
    <div id="panel-vmt" style="display:none">
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
    </div><!-- /panel-vmt -->

  </div><!-- /db -->`;

src = src.replace(PANEL_ANCHOR, PANEL_NEW);
console.log('✓ Patch 3: VMT panel HTML added');

// ── PATCH 4: Update _sTab to include 'vmt' ───────────────────────────────────
src = src.replace(
    `['lock50','trail','lock50old'].forEach(function(id){`,
    `['lock50','trail','lock50old','vmt'].forEach(function(id){`
);
src = src.replace(
    `var tabMap={'stab-lock50':'lock50','stab-trail':'trail','stab-lock50old':'lock50old'};`,
    `var tabMap={'stab-lock50':'lock50','stab-trail':'trail','stab-lock50old':'lock50old','stab-vmt':'vmt'};`
);
console.log('✓ Patch 4: _sTab updated to include vmt');

// ── PATCH 5: Add VMT refresh block in _dbRefresh ─────────────────────────────
const REFRESH_ANCHOR = `    }catch(e){console.error('LOCK50 err',e);}

    }catch(e){console.error('refresh error',e);}
  }
  setInterval(_dbRefresh,3000);`;

const REFRESH_NEW = `    }catch(e){console.error('LOCK50 err',e);}

    }catch(e){console.error('refresh error',e);}
  }

  // ─── VMT Shadow refresh (separate poll, every 5s) ──────────────────────────
  async function _vmtRefresh(){
    try{
      const r=await fetch('/api/vmt-shadow');
      const v=await r.json();
      if(!v)return;
      const st=v.status||'IDLE';

      // Tab P&L badge
      const fp=v.finalPnl||v.livePnl||0;
      const vmtPnlEl=ge('stab-pnl-vmt');
      if(vmtPnlEl){vmtPnlEl.textContent=st==='IDLE'||st==='WAITING'?'&#8212;':fR(fp);vmtPnlEl.style.color=gc(fp);}

      // Stats panel
      if(ge('vmt-ss-status'))ge('vmt-ss-status').textContent=st;
      if(ge('vmt-ss-ts'))ge('vmt-ss-ts').textContent=v.ts||'&#8212;';
      if(ge('vmt-ss-fired'))ge('vmt-ss-fired').textContent=v.tradeDir?'Yes &#10003;':'No';
      if(ge('vmt-ss-dir')){
        ge('vmt-ss-dir').innerHTML=v.tradeDir
          ?'<span class="db-badge '+(v.tradeDir==='CE'?'ce':'pe')+'">'+v.tradeDir+'</span>'
          :'&#8212;';
      }
      if(ge('vmt-ss-today-rs')){
        const p2=v.finalPnl!=null?v.finalPnl:(v.livePnl||0);
        ge('vmt-ss-today-rs').textContent=st==='DONE'||st==='IN_TRADE'?fR(p2):'&#8212;';
        ge('vmt-ss-today-rs').style.color=gc(p2);
        if(ge('vmt-ss-today-pts'))ge('vmt-ss-today-pts').textContent=st==='DONE'||st==='IN_TRADE'?fP(p2):'';
      }

      // Show/hide cards based on state
      const flatCard =ge('vmt-flat-card');
      const tradeCard=ge('vmt-trade-card');
      const doneCard =ge('vmt-done-card');
      const setupDet =ge('vmt-setup-detail');
      const trigDet  =ge('vmt-trigger-detail');
      const noTrade  =ge('vmt-notrade-detail');

      if(st==='IDLE'||st==='WAITING'){
        if(flatCard) flatCard.style.display='';
        if(tradeCard)tradeCard.style.display='none';
        if(doneCard) doneCard.style.display='none';
        if(ge('vmt-status-txt'))ge('vmt-status-txt').textContent='Waiting for market open';
        if(setupDet) setupDet.style.display='none';
        if(trigDet)  trigDet.style.display='none';
        if(noTrade)  noTrade.style.display='none';
      } else if(st==='READY'){
        if(flatCard) flatCard.style.display='';
        if(tradeCard)tradeCard.style.display='none';
        if(doneCard) doneCard.style.display='none';
        if(ge('vmt-status-txt'))ge('vmt-status-txt').textContent='Setup complete &#8212; watching for trigger';
        // show setup
        if(setupDet) setupDet.style.display='';
        if(v.atmStrike)ge('vmt-atm-val')&&(ge('vmt-atm-val').textContent=v.atmStrike);
        if(v.dte)ge('vmt-dte-val')&&(ge('vmt-dte-val').textContent=v.dte+'d');
        if(v.ceEntry!=null)ge('vmt-ce-levels')&&(ge('vmt-ce-levels').textContent=(v.cePremium||0).toFixed(1)+' / '+(v.ceEntry||0).toFixed(1)+' / '+(v.ceTarget||0).toFixed(1));
        if(v.peEntry!=null)ge('vmt-pe-levels')&&(ge('vmt-pe-levels').textContent=(v.pePremium||0).toFixed(1)+' / '+(v.peEntry||0).toFixed(1)+' / '+(v.peTarget||0).toFixed(1));
        // show trigger live prices
        if(v.ceNow!=null){
          if(trigDet)trigDet.style.display='';
          if(ge('vmt-ce-now'))ge('vmt-ce-now').textContent=(v.ceNow).toFixed(1);
          if(ge('vmt-pe-now'))ge('vmt-pe-now').textContent=(v.peNow||0).toFixed(1);
          var ceD=(v.ceNow-(v.ceEntry||0));
          var peD=(v.peNow-(v.peEntry||0));
          if(ge('vmt-ce-dist')){ge('vmt-ce-dist').textContent=(ceD>=0?'+':'')+ceD.toFixed(1)+' pts';ge('vmt-ce-dist').style.color=ceD>=0?'#10b981':'#94a3b8';}
          if(ge('vmt-pe-dist')){ge('vmt-pe-dist').textContent=(peD>=0?'+':'')+peD.toFixed(1)+' pts';ge('vmt-pe-dist').style.color=peD>=0?'#10b981':'#94a3b8';}
        } else {
          if(trigDet)trigDet.style.display='none';
        }
        if(noTrade)noTrade.style.display='none';
      } else if(st==='IN_TRADE'){
        if(flatCard) flatCard.style.display='none';
        if(doneCard) doneCard.style.display='none';
        if(tradeCard){
          tradeCard.style.display='';
          var tdir=(v.tradeDir||'CE').toUpperCase();
          tradeCard.className='pos-card pos-'+(tdir==='CE'?'ce':'pe');
          if(ge('vmt-trade-badge')){ge('vmt-trade-badge').className='pos-badge pos-b-'+(tdir==='CE'?'ce':'pe');ge('vmt-trade-badge').textContent=tdir+' OPTION';}
          var lunr=v.livePnl||0;
          if(ge('vmt-trade-rs')){ge('vmt-trade-rs').textContent=fR(lunr);ge('vmt-trade-rs').className='pos-pnl-rs '+(lunr>=0?'g':'r');}
          if(ge('vmt-trade-pts')){ge('vmt-trade-pts').textContent=fP(lunr)+' unrealised';ge('vmt-trade-pts').className='pos-pnl-pts '+(lunr>=0?'g':'r');}
          if(ge('vmt-trade-ep'))ge('vmt-trade-ep').textContent=(v.tradeEntry||0).toFixed(1);
          if(ge('vmt-trade-lp'))ge('vmt-trade-lp').textContent=(v.liveOptPrice||0).toFixed(1);
          if(ge('vmt-trade-sl'))ge('vmt-trade-sl').textContent=(v.tradeSL||0).toFixed(1);
          if(ge('vmt-trade-tgt'))ge('vmt-trade-tgt').textContent=(v.tradeTarget||0).toFixed(1);
        }
      } else if(st==='DONE'){
        if(flatCard) flatCard.style.display='none';
        if(tradeCard)tradeCard.style.display='none';
        if(doneCard) doneCard.style.display='';
        var reasonMap={TARGET:'&#9989; TARGET HIT',SL:'&#10060; SL HIT',TIME_EXIT:'&#9200; TIME EXIT',NO_TRADE:'&#9208; NO TRADE'};
        var doneIconMap={TARGET:'&#9989;',SL:'&#10060;',TIME_EXIT:'&#9200;',NO_TRADE:'&#9208;'};
        if(ge('vmt-done-reason'))ge('vmt-done-reason').innerHTML=reasonMap[v.exitReason]||v.exitReason||'Done';
        if(ge('vmt-done-icon'))ge('vmt-done-icon').innerHTML=doneIconMap[v.exitReason]||'&#128161;';
        var fdp=v.finalPnl||0;
        if(ge('vmt-done-dir')){
          var ddir=(v.tradeDir||'');
          ge('vmt-done-dir').innerHTML=ddir?'<span class="db-badge '+(ddir==='CE'?'ce':'pe')+'">'+ddir+'</span>':'&#8212;';
        }
        if(ge('vmt-done-ep'))ge('vmt-done-ep').textContent=(v.tradeEntry||0).toFixed(1);
        if(ge('vmt-done-pts')){ge('vmt-done-pts').textContent=fP(fdp);ge('vmt-done-pts').style.color=gc(fdp);}
        if(ge('vmt-done-rs')){var fdRs=Math.round(fdp*15);ge('vmt-done-rs').textContent=(fdRs>=0?'+':'&#8722;')+'&#8377;'+Math.abs(fdRs).toLocaleString('en-IN');ge('vmt-done-rs').style.color=gc(fdp);}
        if(v.exitReason==='NO_TRADE'){if(noTrade)noTrade.style.display='';if(ge('vmt-status-txt'))ge('vmt-status-txt').textContent='No trade fired today';}
      }
    }catch(e){}
  }
  setInterval(_vmtRefresh,5000);
  _vmtRefresh();

  setInterval(_dbRefresh,3000);`;

src = src.replace(REFRESH_ANCHOR, REFRESH_NEW);
console.log('✓ Patch 5: VMT refresh JS added to _dbRefresh');

// ── Write ─────────────────────────────────────────────────────────────────────
fs.writeFileSync(FILE, src);
console.log('\n✅  server.js patched — VMT tab added to /signals page.');
