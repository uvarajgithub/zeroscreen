'use strict';
/**
 * patch_setup_brief.js
 * Replaces the minimal pm-auto-box with a full trade setup brief:
 * BNF Open, ATM Strike, DTE, then CE + PE each with:
 *   Open Premium | Entry Trigger | Stop Loss | Target | ₹ Risk | ₹ Reward | R:R
 */
const fs   = require('fs');
const FILE = '/root/zeroscreen/dist/server.js';
let src = fs.readFileSync(FILE, 'utf8');

// ── 1. Replace CSS for pm-levels-auto to make room for the richer layout ─────
const OLD_CSS = `    .pm-levels-auto{background:rgba(99,102,241,.06);border:1px solid rgba(99,102,241,.2);border-radius:8px;padding:10px 12px;margin-top:2px}
    .pm-levels-auto-hdr{font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#818cf8;margin-bottom:7px}
    .pm-auto-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
    .pm-auto-lbl{font-size:.65rem;color:var(--muted)}
    .pm-auto-val{font-size:.75rem;font-weight:800;color:var(--text-main);font-family:monospace}`;

const NEW_CSS = `    .pm-levels-auto{background:rgba(99,102,241,.06);border:1px solid rgba(99,102,241,.2);border-radius:10px;padding:12px 14px;margin-top:2px}
    .pm-levels-auto-hdr{font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#818cf8;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between}
    .pm-auto-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
    .pm-auto-lbl{font-size:.65rem;color:var(--muted)}
    .pm-auto-val{font-size:.75rem;font-weight:800;color:var(--text-main);font-family:monospace}
    .pm-setup-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
    .pm-setup-side{border-radius:8px;padding:10px 11px;border:1.5px solid}
    .pm-setup-side.ce-side{background:rgba(37,99,235,.06);border-color:rgba(37,99,235,.25)}
    .pm-setup-side.pe-side{background:rgba(220,38,38,.06);border-color:rgba(220,38,38,.2)}
    .pm-setup-dir{font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px}
    .pm-setup-dir.ce{color:#60a5fa}.pm-setup-dir.pe{color:#fca5a5}
    .pm-setup-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
    .pm-setup-row:last-child{margin-bottom:0}
    .pm-setup-lbl{font-size:.6rem;color:var(--muted)}
    .pm-setup-val{font-size:.72rem;font-weight:800;font-family:monospace;color:var(--text-main)}
    .pm-setup-val.entry{color:#fbbf24}
    .pm-setup-val.sl{color:#ef4444}
    .pm-setup-val.tgt{color:#10b981}
    .pm-setup-divider{height:1px;background:rgba(255,255,255,.08);margin:6px 0}
    .pm-rr-badge{font-size:.62rem;font-weight:800;padding:2px 7px;border-radius:4px;background:rgba(99,102,241,.15);color:#818cf8}`;

if (!src.includes(OLD_CSS)) { console.error('CSS anchor not found'); process.exit(1); }
src = src.replace(OLD_CSS, NEW_CSS);
console.log('✓ CSS updated');

// ── 2. Replace HTML pm-auto-box ───────────────────────────────────────────────
const OLD_HTML = `              <!-- Auto-filled from VMT shadow once 9:15 hits -->
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
              </div>`;

const NEW_HTML = `              <!-- Auto-filled from VMT shadow once 9:15 hits -->
              <div class="pm-levels-auto" id="pm-auto-box" style="display:none">
                <div class="pm-levels-auto-hdr">
                  <span>&#9889; Today&rsquo;s Trade Setup &mdash; Calculated at 9:15 AM</span>
                  <span id="pm-auto-dte" style="font-size:.6rem;color:var(--muted);font-weight:600;text-transform:none;letter-spacing:0">&mdash;</span>
                </div>

                <!-- Top row: Open + ATM -->
                <div style="display:flex;gap:12px;margin-bottom:10px;flex-wrap:wrap">
                  <div>
                    <div class="pm-auto-lbl">BNF Open</div>
                    <div class="pm-auto-val" id="pm-auto-spot">&mdash;</div>
                  </div>
                  <div>
                    <div class="pm-auto-lbl">ATM Strike</div>
                    <div class="pm-auto-val" id="pm-auto-strike">&mdash;</div>
                  </div>
                  <div style="margin-left:auto;text-align:right">
                    <div class="pm-auto-lbl">Lot size &times; Risk per pt</div>
                    <div style="font-size:.7rem;font-weight:700;color:var(--muted)">15 qty &times; &#8377;1</div>
                  </div>
                </div>

                <!-- CE + PE side-by-side setup cards -->
                <div class="pm-setup-grid">

                  <!-- CE side -->
                  <div class="pm-setup-side ce-side">
                    <div class="pm-setup-dir ce">&#9651; CE Option</div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Open Premium</span>
                      <span class="pm-setup-val" id="pm-ce-open">&mdash;</span>
                    </div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Entry Trigger</span>
                      <span class="pm-setup-val entry" id="pm-ce-entry">&mdash;</span>
                    </div>
                    <div class="pm-setup-divider"></div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Stop Loss</span>
                      <span class="pm-setup-val sl" id="pm-ce-sl">&mdash;</span>
                    </div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Target</span>
                      <span class="pm-setup-val tgt" id="pm-ce-tgt">&mdash;</span>
                    </div>
                    <div class="pm-setup-divider"></div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">&#8377; Risk</span>
                      <span class="pm-setup-val sl" id="pm-ce-risk">&mdash;</span>
                    </div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">&#8377; Reward</span>
                      <span class="pm-setup-val tgt" id="pm-ce-reward">&mdash;</span>
                    </div>
                    <div class="pm-setup-row" style="margin-top:4px">
                      <span class="pm-setup-lbl">R : R</span>
                      <span class="pm-rr-badge" id="pm-ce-rr">&mdash;</span>
                    </div>
                  </div>

                  <!-- PE side -->
                  <div class="pm-setup-side pe-side">
                    <div class="pm-setup-dir pe">&#9661; PE Option</div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Open Premium</span>
                      <span class="pm-setup-val" id="pm-pe-open">&mdash;</span>
                    </div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Entry Trigger</span>
                      <span class="pm-setup-val entry" id="pm-pe-entry">&mdash;</span>
                    </div>
                    <div class="pm-setup-divider"></div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Stop Loss</span>
                      <span class="pm-setup-val sl" id="pm-pe-sl">&mdash;</span>
                    </div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Target</span>
                      <span class="pm-setup-val tgt" id="pm-pe-tgt">&mdash;</span>
                    </div>
                    <div class="pm-setup-divider"></div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">&#8377; Risk</span>
                      <span class="pm-setup-val sl" id="pm-pe-risk">&mdash;</span>
                    </div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">&#8377; Reward</span>
                      <span class="pm-setup-val tgt" id="pm-pe-reward">&mdash;</span>
                    </div>
                    <div class="pm-setup-row" style="margin-top:4px">
                      <span class="pm-setup-lbl">R : R</span>
                      <span class="pm-rr-badge" id="pm-pe-rr">&mdash;</span>
                    </div>
                  </div>

                </div><!-- /pm-setup-grid -->
                <div style="font-size:.58rem;color:var(--muted);margin-top:8px;text-align:center">SL = Open Premium &nbsp;&#183;&nbsp; Entry = Open + 7 pts &nbsp;&#183;&nbsp; Target = Entry + 21 pts (3R)</div>
              </div>`;

if (!src.includes(OLD_HTML)) { console.error('HTML anchor not found'); process.exit(1); }
src = src.replace(OLD_HTML, NEW_HTML);
console.log('✓ HTML updated');

// ── 3. Replace _pmUpdateAutoLevels JS ────────────────────────────────────────
const OLD_JS = `    // Update auto-levels from VMT shadow (piggybacks the _vmtRefresh poll)
    window._pmUpdateAutoLevels=function(v){
      if(!v||!v.atmStrike)return;
      var box=ge('pm-auto-box');if(box)box.style.display='';
      if(ge('pm-auto-spot'))ge('pm-auto-spot').textContent=v.spotOpen?Number(v.spotOpen).toFixed(0):'\u2014';
      if(ge('pm-auto-strike'))ge('pm-auto-strike').textContent=v.atmStrike||'\u2014';
      if(ge('pm-auto-ce'))ge('pm-auto-ce').textContent=v.cePremium!=null?'\u20b9'+v.cePremium.toFixed(1)+' \u21d2 \u20b9'+(v.ceEntry||0).toFixed(1):'\u2014';
      if(ge('pm-auto-pe'))ge('pm-auto-pe').textContent=v.pePremium!=null?'\u20b9'+v.pePremium.toFixed(1)+' \u21d2 \u20b9'+(v.peEntry||0).toFixed(1):'\u2014';
      if(ge('pm-auto-dte'))ge('pm-auto-dte').textContent=v.dte?v.dte+' days (Thu weekly)':'\u2014';
    };`;

// The file has garbled encoding for some chars — find by unique surrounding text
const OLD_JS_SEARCH = '    // Update auto-levels from VMT shadow (piggybacks the _vmtRefresh poll)\n    window._pmUpdateAutoLevels=function(v){';
const oldJsStart = src.indexOf(OLD_JS_SEARCH);
if (oldJsStart === -1) { console.error('JS anchor not found'); process.exit(1); }
// Find end: closing };  followed by newline + '  })();'
const oldJsEnd = src.indexOf('\n    };\n  })();', oldJsStart);
if (oldJsEnd === -1) { console.error('JS end anchor not found'); process.exit(1); }
const oldJsBlock = src.slice(oldJsStart, oldJsEnd + '    };'.length + 1);

const NEW_JS = `    // Update auto-levels from VMT shadow (piggybacks the _vmtRefresh poll)
    window._pmUpdateAutoLevels=function(v){
      if(!v||!v.atmStrike)return;
      var box=ge('pm-auto-box');if(box)box.style.display='';
      // Top row
      if(ge('pm-auto-spot'))ge('pm-auto-spot').textContent=v.spotOpen?('\u20b9'+Number(v.spotOpen).toFixed(0)):'\u2014';
      if(ge('pm-auto-strike'))ge('pm-auto-strike').textContent=v.atmStrike||'\u2014';
      if(ge('pm-auto-dte'))ge('pm-auto-dte').textContent=v.dte?(v.dte+' days to Thu expiry'):'\u2014';
      // CE setup
      var ceOp=v.cePremium||0,ceEn=v.ceEntry||0,ceSl=v.ceSL||ceOp,ceTg=v.ceTarget||0;
      var ceRisk=Math.round(Math.abs(ceEn-ceSl)*15),ceReward=Math.round(Math.abs(ceTg-ceEn)*15);
      var ceRR=ceRisk>0?(ceReward/ceRisk).toFixed(1)+'R':'\u2014';
      if(ge('pm-ce-open'))ge('pm-ce-open').textContent='\u20b9'+ceOp.toFixed(1);
      if(ge('pm-ce-entry'))ge('pm-ce-entry').textContent='\u20b9'+ceEn.toFixed(1);
      if(ge('pm-ce-sl'))ge('pm-ce-sl').textContent='\u20b9'+ceSl.toFixed(1);
      if(ge('pm-ce-tgt'))ge('pm-ce-tgt').textContent='\u20b9'+ceTg.toFixed(1);
      if(ge('pm-ce-risk'))ge('pm-ce-risk').textContent='\u20b9'+ceRisk.toLocaleString('en-IN');
      if(ge('pm-ce-reward'))ge('pm-ce-reward').textContent='\u20b9'+ceReward.toLocaleString('en-IN');
      if(ge('pm-ce-rr'))ge('pm-ce-rr').textContent='1 : '+ceRR;
      // PE setup
      var peOp=v.pePremium||0,peEn=v.peEntry||0,peSl=v.peSL||peOp,peTg=v.peTarget||0;
      var peRisk=Math.round(Math.abs(peEn-peSl)*15),peReward=Math.round(Math.abs(peTg-peEn)*15);
      var peRR=peRisk>0?(peReward/peRisk).toFixed(1)+'R':'\u2014';
      if(ge('pm-pe-open'))ge('pm-pe-open').textContent='\u20b9'+peOp.toFixed(1);
      if(ge('pm-pe-entry'))ge('pm-pe-entry').textContent='\u20b9'+peEn.toFixed(1);
      if(ge('pm-pe-sl'))ge('pm-pe-sl').textContent='\u20b9'+peSl.toFixed(1);
      if(ge('pm-pe-tgt'))ge('pm-pe-tgt').textContent='\u20b9'+peTg.toFixed(1);
      if(ge('pm-pe-risk'))ge('pm-pe-risk').textContent='\u20b9'+peRisk.toLocaleString('en-IN');
      if(ge('pm-pe-reward'))ge('pm-pe-reward').textContent='\u20b9'+peReward.toLocaleString('en-IN');
      if(ge('pm-pe-rr'))ge('pm-pe-rr').textContent='1 : '+peRR;
    };`;

src = src.slice(0, oldJsStart) + NEW_JS + src.slice(oldJsStart + oldJsBlock.length);
console.log('✓ JS updated');

fs.writeFileSync(FILE, src);
console.log('\n✅  Done. Full trade setup brief added to pre-market section.');
