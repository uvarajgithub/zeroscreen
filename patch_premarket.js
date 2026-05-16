'use strict';
/**
 * patch_premarket.js
 * Adds a Pre-Market Analysis section above the strategy tabs on /signals page.
 * - Session timeline with auto-checkmarks
 * - Manual predictions (bias, R/S levels, notes) stored in localStorage
 * - Auto shows VMT 9:15 setup levels once calculated
 * Run: node /root/zeroscreen/patch_premarket.js
 */
const fs   = require('fs');
const FILE = '/root/zeroscreen/dist/server.js';
let src = fs.readFileSync(FILE, 'utf8');

// ── 1. Add CSS for pre-market card ────────────────────────────────────────────
const CSS_ANCHOR = '    .prem-sell{font-size:.68rem;background:rgba(220,38,38,.1);color:#dc2626;border-radius:3px;padding:1px 4px;margin-right:2px;font-weight:700}';
const NEW_CSS = `    .prem-sell{font-size:.68rem;background:rgba(220,38,38,.1);color:#dc2626;border-radius:3px;padding:1px 4px;margin-right:2px;font-weight:700}
    /* Pre-Market Card */
    .pm-card{background:var(--card);border:1.5px solid var(--border-c);border-radius:14px;padding:0;margin-bottom:1rem;overflow:hidden}
    .pm-hdr{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;cursor:pointer;user-select:none;gap:10px;flex-wrap:wrap}
    .pm-hdr-left{display:flex;align-items:center;gap:10px}
    .pm-title{font-size:.73rem;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:var(--text-main)}
    .pm-phase{font-size:.62rem;font-weight:700;padding:2px 9px;border-radius:4px;background:rgba(251,191,36,.12);color:#fbbf24;border:1px solid rgba(251,191,36,.25)}
    .pm-phase.live{background:rgba(16,185,129,.1);color:#10b981;border-color:rgba(16,185,129,.3)}
    .pm-phase.closed{background:rgba(100,116,139,.1);color:#64748b;border-color:rgba(100,116,139,.2)}
    .pm-toggle{font-size:.68rem;color:var(--muted);transition:transform .2s}
    .pm-toggle.open{transform:rotate(180deg)}
    .pm-body{padding:14px 18px 16px;border-top:1px solid var(--border-c)}
    .pm-grid{display:grid;grid-template-columns:1fr;gap:14px}
    @media(min-width:700px){.pm-grid{grid-template-columns:1.1fr 1fr}}
    .pm-tl{display:flex;flex-direction:column;gap:0}
    .pm-tl-row{display:flex;align-items:flex-start;gap:10px;padding:5px 0;position:relative}
    .pm-tl-row:not(:last-child)::before{content:'';position:absolute;left:9px;top:20px;bottom:-4px;width:1.5px;background:var(--border-c)}
    .pm-tl-dot{width:20px;height:20px;border-radius:50%;border:2px solid var(--border-c);background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:.6rem;flex-shrink:0;margin-top:1px;z-index:1;position:relative}
    .pm-tl-dot.done{background:#059669;border-color:#059669;color:#fff}
    .pm-tl-dot.active{background:rgba(251,191,36,.15);border-color:#fbbf24;color:#fbbf24;box-shadow:0 0 0 3px rgba(251,191,36,.15);animation:pm-pulse 1.5s infinite}
    @keyframes pm-pulse{0%,100%{box-shadow:0 0 0 3px rgba(251,191,36,.15)}50%{box-shadow:0 0 0 6px rgba(251,191,36,.05)}}
    .pm-tl-txt{flex:1}
    .pm-tl-time{font-size:.63rem;font-weight:800;color:var(--text-main);font-variant-numeric:tabular-nums}
    .pm-tl-label{font-size:.68rem;color:var(--muted);margin-top:1px}
    .pm-tl-note{font-size:.62rem;color:#7c3aed;font-weight:600;margin-top:2px;display:none}
    .pm-tl-note.show{display:block}
    .pm-pred{display:flex;flex-direction:column;gap:10px}
    .pm-pred-label{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:4px}
    .pm-bias-btns{display:flex;gap:6px}
    .pm-bias-btn{flex:1;padding:6px 4px;border-radius:7px;font-size:.7rem;font-weight:700;cursor:pointer;border:1.5px solid var(--border-c);background:transparent;color:var(--muted);transition:all .15s}
    .pm-bias-btn.bull-sel{background:rgba(5,150,105,.12);border-color:#059669;color:#059669}
    .pm-bias-btn.bear-sel{background:rgba(239,68,68,.1);border-color:#ef4444;color:#ef4444}
    .pm-bias-btn.neut-sel{background:rgba(100,116,139,.1);border-color:#64748b;color:#94a3b8}
    .pm-inp-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .pm-inp{width:100%;background:var(--bg);border:1.5px solid var(--border-c);border-radius:7px;padding:6px 10px;font-size:.78rem;color:var(--text-main);outline:none;font-family:monospace;box-sizing:border-box}
    .pm-inp:focus{border-color:#7c3aed}
    .pm-notes{width:100%;background:var(--bg);border:1.5px solid var(--border-c);border-radius:7px;padding:8px 10px;font-size:.73rem;color:var(--text-main);outline:none;resize:none;min-height:64px;box-sizing:border-box;font-family:inherit}
    .pm-notes:focus{border-color:#7c3aed}
    .pm-levels-auto{background:rgba(99,102,241,.06);border:1px solid rgba(99,102,241,.2);border-radius:8px;padding:10px 12px;margin-top:2px}
    .pm-levels-auto-hdr{font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#818cf8;margin-bottom:7px}
    .pm-auto-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
    .pm-auto-lbl{font-size:.65rem;color:var(--muted)}
    .pm-auto-val{font-size:.75rem;font-weight:800;color:var(--text-main);font-family:monospace}`;

if (!src.includes(CSS_ANCHOR)) { console.error('CSS anchor not found'); process.exit(1); }
src = src.replace(CSS_ANCHOR, NEW_CSS);
console.log('✓ CSS added');

// ── 2. Add pre-market HTML card before .stab-wrap ─────────────────────────────
const HTML_ANCHOR = '\n    <!-- ── Strategy Tab Switcher';
// Find the comment before stab-wrap
const stabIdx = src.indexOf('    <div class="stab-wrap">');
if (stabIdx === -1) { console.error('stab-wrap anchor not found'); process.exit(1); }
// Insert before it
const PM_HTML = `
    <!-- ── Pre-Market Analysis Card ─────────────────────────────────────────── -->
    <div class="pm-card" id="pm-card">
      <div class="pm-hdr" onclick="_pmToggle()">
        <div class="pm-hdr-left">
          <span>&#128197;</span>
          <span class="pm-title">Pre-Market &amp; Session Plan</span>
          <span class="pm-phase" id="pm-phase-badge">Loading&hellip;</span>
        </div>
        <span class="pm-toggle" id="pm-toggle-arrow">&#9650;</span>
      </div>
      <div class="pm-body" id="pm-body">
        <div class="pm-grid">

          <!-- LEFT: Session Timeline -->
          <div>
            <div class="pm-pred-label" style="margin-bottom:8px">&#128336; Today&rsquo;s Session Timeline</div>
            <div class="pm-tl" id="pm-tl">
              <div class="pm-tl-row" id="pm-tl-0">
                <div class="pm-tl-dot" id="pm-dot-0">&#10003;</div>
                <div class="pm-tl-txt">
                  <div class="pm-tl-time">8:30 AM &mdash; Gift Nifty / Global Cues</div>
                  <div class="pm-tl-label">Check SGX Nifty / Dow futures for gap-up or gap-down bias</div>
                </div>
              </div>
              <div class="pm-tl-row" id="pm-tl-1">
                <div class="pm-tl-dot" id="pm-dot-1">&#10003;</div>
                <div class="pm-tl-txt">
                  <div class="pm-tl-time">8:55 AM &mdash; NSE Pre-Open Session</div>
                  <div class="pm-tl-label">Pre-open call auction begins &mdash; IEP starts forming</div>
                </div>
              </div>
              <div class="pm-tl-row" id="pm-tl-2">
                <div class="pm-tl-dot" id="pm-dot-2">&#10003;</div>
                <div class="pm-tl-txt">
                  <div class="pm-tl-time">9:00 AM &mdash; Fill Predictions</div>
                  <div class="pm-tl-label">Set your bias, key resistance / support levels, and notes</div>
                  <div class="pm-tl-note" id="pm-note-2">&#128276; Predictions panel on the right &#8594;</div>
                </div>
              </div>
              <div class="pm-tl-row" id="pm-tl-3">
                <div class="pm-tl-dot" id="pm-dot-3">&#10003;</div>
                <div class="pm-tl-txt">
                  <div class="pm-tl-time">9:07 AM &mdash; Pre-Open Auction Ends</div>
                  <div class="pm-tl-label">IEP locked. Orders in queue. Final pre-open price visible</div>
                </div>
              </div>
              <div class="pm-tl-row" id="pm-tl-4">
                <div class="pm-tl-dot" id="pm-dot-4">&#10003;</div>
                <div class="pm-tl-txt">
                  <div class="pm-tl-time">9:15 AM &mdash; Market Opens</div>
                  <div class="pm-tl-label">Bot resets. VMT shadow calculates ATM strike + option premiums</div>
                  <div class="pm-tl-note" id="pm-note-4">ATM levels auto-appear in &ldquo;Today&rsquo;s Setup&rdquo; below</div>
                </div>
              </div>
              <div class="pm-tl-row" id="pm-tl-5">
                <div class="pm-tl-dot" id="pm-dot-5">&#10003;</div>
                <div class="pm-tl-txt">
                  <div class="pm-tl-time">9:15 &ndash; 9:45 AM &mdash; VMT Entry Window</div>
                  <div class="pm-tl-label">Watching which side (CE or PE) hits entry premium first</div>
                </div>
              </div>
              <div class="pm-tl-row" id="pm-tl-6">
                <div class="pm-tl-dot" id="pm-dot-6">&#10003;</div>
                <div class="pm-tl-txt">
                  <div class="pm-tl-time">9:45 AM &mdash; Entry Window Closes</div>
                  <div class="pm-tl-label">If no trigger fired, VMT marks NO_TRADE for today</div>
                </div>
              </div>
              <div class="pm-tl-row" id="pm-tl-7">
                <div class="pm-tl-dot" id="pm-dot-7">&#10003;</div>
                <div class="pm-tl-txt">
                  <div class="pm-tl-time">11:30 AM &mdash; VMT Time Exit</div>
                  <div class="pm-tl-label">If trade is open at 11:30, force-close at market premium</div>
                </div>
              </div>
              <div class="pm-tl-row" id="pm-tl-8">
                <div class="pm-tl-dot" id="pm-dot-8">&#10003;</div>
                <div class="pm-tl-txt">
                  <div class="pm-tl-time">3:15 PM &mdash; AMINA Trail / SL Check</div>
                  <div class="pm-tl-label">If AMINA is still in trade, final trail tightens significantly</div>
                </div>
              </div>
              <div class="pm-tl-row" id="pm-tl-9">
                <div class="pm-tl-dot" id="pm-dot-9">&#10003;</div>
                <div class="pm-tl-txt">
                  <div class="pm-tl-time">3:30 PM &mdash; Market Closes</div>
                  <div class="pm-tl-label">All positions squared off. Daily P&amp;L finalised</div>
                </div>
              </div>
            </div>
          </div>

          <!-- RIGHT: Predictions -->
          <div>
            <div class="pm-pred">
              <div>
                <div class="pm-pred-label">&#127919; Today&rsquo;s Bias</div>
                <div class="pm-bias-btns">
                  <button class="pm-bias-btn" id="pm-bias-bull" onclick="_pmBias('BULLISH')" type="button">&#128200; Bullish</button>
                  <button class="pm-bias-btn" id="pm-bias-neut" onclick="_pmBias('NEUTRAL')" type="button">&#8596; Neutral</button>
                  <button class="pm-bias-btn" id="pm-bias-bear" onclick="_pmBias('BEARISH')" type="button">&#128201; Bearish</button>
                </div>
              </div>
              <div>
                <div class="pm-pred-label">&#128269; Key Levels</div>
                <div class="pm-inp-row">
                  <div>
                    <div style="font-size:.58rem;color:#10b981;font-weight:700;margin-bottom:3px">RESISTANCE &#9651;</div>
                    <input class="pm-inp" id="pm-res" type="number" placeholder="e.g. 50200" oninput="_pmSave()" />
                  </div>
                  <div>
                    <div style="font-size:.58rem;color:#ef4444;font-weight:700;margin-bottom:3px">SUPPORT &#9661;</div>
                    <input class="pm-inp" id="pm-sup" type="number" placeholder="e.g. 49600" oninput="_pmSave()" />
                  </div>
                </div>
              </div>
              <div>
                <div class="pm-pred-label">&#128221; Pre-Market Notes</div>
                <textarea class="pm-notes" id="pm-notes" placeholder="e.g. BNF flat open expected. If 49800 holds as support, CE trade. Gap down risk if Gift Nifty negative..." oninput="_pmSave()"></textarea>
              </div>

              <!-- Auto-filled from VMT shadow once 9:15 hits -->
              <div class="pm-levels-auto" id="pm-auto-box" style="display:none">
                <div class="pm-levels-auto-hdr">&#9889; Auto-Calculated at 9:15 AM (VMT Shadow)</div>
                <div class="pm-auto-row">
                  <span class="pm-auto-lbl">BNF Open Price</span>
                  <span class="pm-auto-val" id="pm-auto-spot">&mdash;</span>
                </div>
                <div class="pm-auto-row">
                  <span class="pm-auto-lbl">ATM Strike</span>
                  <span class="pm-auto-val" id="pm-auto-strike">&mdash;</span>
                </div>
                <div class="pm-auto-row">
                  <span class="pm-auto-lbl">CE Open Prem &rarr; Entry</span>
                  <span class="pm-auto-val" id="pm-auto-ce">&mdash;</span>
                </div>
                <div class="pm-auto-row">
                  <span class="pm-auto-lbl">PE Open Prem &rarr; Entry</span>
                  <span class="pm-auto-val" id="pm-auto-pe">&mdash;</span>
                </div>
                <div class="pm-auto-row" style="margin-bottom:0">
                  <span class="pm-auto-lbl">DTE / Expiry</span>
                  <span class="pm-auto-val" id="pm-auto-dte">&mdash;</span>
                </div>
              </div>

            </div>
          </div>

        </div><!-- /pm-grid -->
      </div><!-- /pm-body -->
    </div><!-- /pm-card -->

`;

src = src.slice(0, stabIdx) + PM_HTML + src.slice(stabIdx);
console.log('✓ Pre-market HTML card added');

// ── 3. Add JS for pre-market card in the main <script> block ─────────────────
const JS_ANCHOR = '  function _sTab(t){';
if (!src.includes(JS_ANCHOR)) { console.error('JS anchor not found'); process.exit(1); }

const NEW_JS = `  // ── Pre-Market card ──────────────────────────────────────────────────────────
  (function(){
    var STORE_KEY='pm_pred_v2';
    var TIMELINE=[
      {id:0, h:8,  m:30},
      {id:1, h:8,  m:55},
      {id:2, h:9,  m:0 },
      {id:3, h:9,  m:7 },
      {id:4, h:9,  m:15},
      {id:5, h:9,  m:15},
      {id:6, h:9,  m:45},
      {id:7, h:11, m:30},
      {id:8, h:15, m:15},
      {id:9, h:15, m:30}
    ];
    // Session phases: [endH, endM, label, cssClass]
    var PHASES=[
      [8,30,'Pre-Market',''],
      [8,55,'Global Cues',''],
      [9,0, 'Pre-Open',''],
      [9,7, 'Pre-Open Auction',''],
      [9,15,'Fill Predictions',''],
      [9,45,'Market Open','live'],
      [11,30,'Entry Window','live'],
      [15,15,'Session Live','live'],
      [15,30,'Near Close','live'],
      [24,0, 'Closed','closed']
    ];

    function nowIST(){
      var d=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
      return {h:d.getHours(),m:d.getMinutes()};
    }
    function toMins(h,m){return h*60+m;}
    function loadData(){
      try{return JSON.parse(localStorage.getItem(STORE_KEY)||'{}');}catch(e){return {};}
    }
    function saveData(d){localStorage.setItem(STORE_KEY,JSON.stringify(d));}

    // Restore saved state
    var saved=loadData();
    var todayKey=(function(){var d=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();})();
    // Reset if new day
    if(saved.date&&saved.date!==todayKey){saved={};saveData(saved);}
    saved.date=todayKey;

    // Restore inputs
    if(saved.res&&ge('pm-res'))ge('pm-res').value=saved.res;
    if(saved.sup&&ge('pm-sup'))ge('pm-sup').value=saved.sup;
    if(saved.notes&&ge('pm-notes'))ge('pm-notes').value=saved.notes;
    if(saved.bias)_pmSetBiasUI(saved.bias);
    if(saved.collapsed){var body=ge('pm-body');var arrow=ge('pm-toggle-arrow');if(body){body.style.display='none';}if(arrow)arrow.classList.remove('open');}
    else{var arrow=ge('pm-toggle-arrow');if(arrow)arrow.classList.add('open');}

    // Exported functions
    window._pmToggle=function(){
      var body=ge('pm-body');var arrow=ge('pm-toggle-arrow');
      if(!body)return;
      var collapsed=body.style.display==='none';
      body.style.display=collapsed?'':'none';
      if(arrow)arrow.classList.toggle('open',collapsed);
      var d=loadData();d.collapsed=!collapsed;saveData(d);
    };
    window._pmBias=function(b){
      _pmSetBiasUI(b);
      var d=loadData();d.bias=b;saveData(d);
    };
    window._pmSave=function(){
      var d=loadData();
      var r=ge('pm-res'),s=ge('pm-sup'),n=ge('pm-notes');
      if(r)d.res=r.value;if(s)d.sup=s.value;if(n)d.notes=n.value;
      saveData(d);
    };
    function _pmSetBiasUI(b){
      var btns={'BULLISH':'pm-bias-bull','NEUTRAL':'pm-bias-neut','BEARISH':'pm-bias-bear'};
      var cls={'BULLISH':'bull-sel','NEUTRAL':'neut-sel','BEARISH':'bear-sel'};
      Object.keys(btns).forEach(function(k){
        var el=ge(btns[k]);
        if(el){el.className='pm-bias-btn'+(k===b?' '+cls[k]:'');}
      });
    }

    // Timeline + phase update (run every 30s)
    function _pmUpdateTimeline(){
      var t=nowIST();
      var nowM=toMins(t.h,t.m);
      // Dots
      TIMELINE.forEach(function(row){
        var dot=ge('pm-dot-'+row.id);
        var rowEl=ge('pm-tl-'+row.id);
        if(!dot)return;
        var rowM=toMins(row.h,row.m);
        var isActive=nowM>=rowM&&nowM<rowM+3;
        var isDone=nowM>=rowM+3;
        if(isDone){dot.className='pm-tl-dot done';dot.textContent='✓';}
        else if(isActive){dot.className='pm-tl-dot active';dot.textContent='▶';}
        else{dot.className='pm-tl-dot';dot.textContent='';}
      });
      // Notes
      var note2=ge('pm-note-2');if(note2)note2.className='pm-tl-note'+(nowM>=540&&nowM<555?' show':'');
      var note4=ge('pm-note-4');if(note4)note4.className='pm-tl-note'+(nowM>=555?' show':'');
      // Phase badge
      var badge=ge('pm-phase-badge');
      if(badge){
        var label='Pre-Market',cls='';
        for(var i=0;i<PHASES.length;i++){
          if(nowM<toMins(PHASES[i][0],PHASES[i][1])){label=PHASES[i][2];cls=PHASES[i][3];break;}
        }
        badge.textContent=label;badge.className='pm-phase'+(cls?' '+cls:'');
      }
    }
    _pmUpdateTimeline();
    setInterval(_pmUpdateTimeline,30000);

    // Update auto-levels from VMT shadow (piggybacks the _vmtRefresh poll)
    window._pmUpdateAutoLevels=function(v){
      if(!v||!v.atmStrike)return;
      var box=ge('pm-auto-box');if(box)box.style.display='';
      if(ge('pm-auto-spot'))ge('pm-auto-spot').textContent=v.spotOpen?Number(v.spotOpen).toFixed(0):'—';
      if(ge('pm-auto-strike'))ge('pm-auto-strike').textContent=v.atmStrike||'—';
      if(ge('pm-auto-ce'))ge('pm-auto-ce').textContent=v.cePremium!=null?'₹'+v.cePremium.toFixed(1)+' → ₹'+(v.ceEntry||0).toFixed(1):'—';
      if(ge('pm-auto-pe'))ge('pm-auto-pe').textContent=v.pePremium!=null?'₹'+v.pePremium.toFixed(1)+' → ₹'+(v.peEntry||0).toFixed(1):'—';
      if(ge('pm-auto-dte'))ge('pm-auto-dte').textContent=v.dte?v.dte+' days (Thu weekly)':'—';
    };
  })();

  function _sTab(t){`;

src = src.replace(JS_ANCHOR, NEW_JS);
console.log('✓ Pre-market JS added');

// ── 4. Hook _pmUpdateAutoLevels into _vmtRefresh ─────────────────────────────
// Find the spot inside _vmtRefresh where we already have vmt data, add the call
const VMT_HOOK_ANCHOR = "      // ── Tab P&L badge ─────────────────────────────────────────────────────";
const NEW_VMT_HOOK = `      // Update pre-market auto-levels
      if(window._pmUpdateAutoLevels)_pmUpdateAutoLevels(v);

      // ── Tab P&L badge ─────────────────────────────────────────────────────`;

if (!src.includes(VMT_HOOK_ANCHOR)) {
    console.error('VMT hook anchor not found');
} else {
    src = src.replace(VMT_HOOK_ANCHOR, NEW_VMT_HOOK);
    console.log('✓ Pre-market auto-levels hooked into _vmtRefresh');
}

fs.writeFileSync(FILE, src);
console.log('\n✅  Done. Pre-market section added to /signals page.');
