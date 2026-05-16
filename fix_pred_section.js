'use strict';
const fs = require('fs');
const FILE = '/root/zeroscreen/dist/server.js';
let src = fs.readFileSync(FILE, 'utf8');

// ─── 1. ADD CSS ──────────────────────────────────────────────────────────────
const OLD_CSS = `    .pm-notes{width:100%;background:var(--bg);border:1.5px solid var(--border-c);border-radius:7px;padding:8px 10px;font-size:.73rem;color:var(--text-main);outline:none;resize:none;min-height:64px;box-sizing:border-box;font-family:inherit}
    .pm-notes:focus{border-color:#7c3aed}`;

const NEW_CSS = `    .pm-notes{width:100%;background:var(--bg);border:1.5px solid var(--border-c);border-radius:7px;padding:8px 10px;font-size:.73rem;color:var(--text-main);outline:none;resize:none;min-height:64px;box-sizing:border-box;font-family:inherit}
    .pm-notes:focus{border-color:#7c3aed}
    .pm-trade-card{border-radius:9px;padding:10px 12px;margin-top:2px}
    .pm-trade-card.ce-card{background:rgba(5,150,105,.07);border:1.5px solid rgba(5,150,105,.25)}
    .pm-trade-card.pe-card{background:rgba(239,68,68,.07);border:1.5px solid rgba(239,68,68,.22)}
    .pm-trade-hdr{font-size:.62rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:6px}
    .pm-trade-hdr.ce-hdr{color:#059669}
    .pm-trade-hdr.pe-hdr{color:#ef4444}
    .pm-3col{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
    .pm-lbl{font-size:.56rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
    .pm-lbl.green{color:#10b981}
    .pm-lbl.red{color:#ef4444}
    .pm-lbl.amber{color:#f59e0b}
    .pm-lbl.blue{color:#6366f1}
    .pm-lbl.muted{color:var(--muted)}
    .pm-inp-sm{width:100%;background:var(--bg);border:1.5px solid var(--border-c);border-radius:6px;padding:5px 8px;font-size:.74rem;color:var(--text-main);outline:none;font-family:monospace;box-sizing:border-box}
    .pm-inp-sm:focus{border-color:#7c3aed}`;

if (!src.includes(OLD_CSS)) { console.error('CSS anchor not found'); process.exit(1); }
src = src.replace(OLD_CSS, NEW_CSS);
console.log('✓ CSS added');

// ─── 2. REPLACE HTML PREDICTIONS BLOCK ───────────────────────────────────────
const OLD_HTML = `            <div class="pm-pred">
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
              </div>`;

const NEW_HTML = `            <div class="pm-pred">
              <!-- BIAS -->
              <div>
                <div class="pm-pred-label">&#127919; Today&rsquo;s Bias</div>
                <div class="pm-bias-btns">
                  <button class="pm-bias-btn" id="pm-bias-bull" onclick="_pmBias('BULLISH')" type="button">&#128200; Bullish</button>
                  <button class="pm-bias-btn" id="pm-bias-neut" onclick="_pmBias('NEUTRAL')" type="button">&#8596; Neutral</button>
                  <button class="pm-bias-btn" id="pm-bias-bear" onclick="_pmBias('BEARISH')" type="button">&#128201; Bearish</button>
                </div>
              </div>
              <!-- SPOT + STRIKE -->
              <div>
                <div class="pm-pred-label">&#127988; BNF Spot &amp; Strike</div>
                <div class="pm-inp-row">
                  <div>
                    <div class="pm-lbl blue">BNF Current Price</div>
                    <input class="pm-inp" id="pm-spot" type="number" placeholder="e.g. 49850" oninput="_pmSave()" />
                  </div>
                  <div>
                    <div class="pm-lbl muted">Strike Price (ATM)</div>
                    <input class="pm-inp" id="pm-strike" type="number" placeholder="e.g. 49800" oninput="_pmSave()" />
                  </div>
                </div>
              </div>
              <!-- KEY LEVELS -->
              <div>
                <div class="pm-pred-label">&#128269; Key Levels</div>
                <div class="pm-inp-row">
                  <div>
                    <div class="pm-lbl green">RESISTANCE &#9651;</div>
                    <input class="pm-inp" id="pm-res" type="number" placeholder="e.g. 50200" oninput="_pmSave()" />
                  </div>
                  <div>
                    <div class="pm-lbl red">SUPPORT &#9661;</div>
                    <input class="pm-inp" id="pm-sup" type="number" placeholder="e.g. 49600" oninput="_pmSave()" />
                  </div>
                </div>
              </div>
              <!-- CE SETUP -->
              <div class="pm-trade-card ce-card">
                <div class="pm-trade-hdr ce-hdr">&#128200; CE Setup</div>
                <div class="pm-inp-row" style="margin-bottom:6px">
                  <div>
                    <div class="pm-lbl green">Range High</div>
                    <input class="pm-inp-sm" id="pm-ce-rh" type="number" placeholder="e.g. 320" oninput="_pmSave()" />
                  </div>
                  <div>
                    <div class="pm-lbl red">Range Low</div>
                    <input class="pm-inp-sm" id="pm-ce-rl" type="number" placeholder="e.g. 280" oninput="_pmSave()" />
                  </div>
                </div>
                <div class="pm-inp-row" style="margin-bottom:6px">
                  <div>
                    <div class="pm-lbl muted">Premium (Open)</div>
                    <input class="pm-inp-sm" id="pm-ce-prem" type="number" placeholder="e.g. 295" oninput="_pmSave()" />
                  </div>
                  <div>
                    <div class="pm-lbl amber">Entry</div>
                    <input class="pm-inp-sm" id="pm-ce-entry" type="number" placeholder="e.g. 302" oninput="_pmSave()" />
                  </div>
                </div>
                <div class="pm-inp-row" style="margin-bottom:6px">
                  <div>
                    <div class="pm-lbl red">SL</div>
                    <input class="pm-inp-sm" id="pm-ce-sl" type="number" placeholder="e.g. 250" oninput="_pmSave()" />
                  </div>
                  <div></div>
                </div>
                <div class="pm-3col">
                  <div>
                    <div class="pm-lbl green">T1</div>
                    <input class="pm-inp-sm" id="pm-ce-t1" type="number" placeholder="e.g. 330" oninput="_pmSave()" />
                  </div>
                  <div>
                    <div class="pm-lbl green">T2</div>
                    <input class="pm-inp-sm" id="pm-ce-t2" type="number" placeholder="e.g. 360" oninput="_pmSave()" />
                  </div>
                  <div>
                    <div class="pm-lbl green">T3</div>
                    <input class="pm-inp-sm" id="pm-ce-t3" type="number" placeholder="e.g. 400" oninput="_pmSave()" />
                  </div>
                </div>
              </div>
              <!-- PE SETUP -->
              <div class="pm-trade-card pe-card">
                <div class="pm-trade-hdr pe-hdr">&#128201; PE Setup</div>
                <div class="pm-inp-row" style="margin-bottom:6px">
                  <div>
                    <div class="pm-lbl green">Range High</div>
                    <input class="pm-inp-sm" id="pm-pe-rh" type="number" placeholder="e.g. 350" oninput="_pmSave()" />
                  </div>
                  <div>
                    <div class="pm-lbl red">Range Low</div>
                    <input class="pm-inp-sm" id="pm-pe-rl" type="number" placeholder="e.g. 290" oninput="_pmSave()" />
                  </div>
                </div>
                <div class="pm-inp-row" style="margin-bottom:6px">
                  <div>
                    <div class="pm-lbl muted">Premium (Open)</div>
                    <input class="pm-inp-sm" id="pm-pe-prem" type="number" placeholder="e.g. 310" oninput="_pmSave()" />
                  </div>
                  <div>
                    <div class="pm-lbl amber">Entry</div>
                    <input class="pm-inp-sm" id="pm-pe-entry" type="number" placeholder="e.g. 318" oninput="_pmSave()" />
                  </div>
                </div>
                <div class="pm-inp-row" style="margin-bottom:6px">
                  <div>
                    <div class="pm-lbl red">SL</div>
                    <input class="pm-inp-sm" id="pm-pe-sl" type="number" placeholder="e.g. 260" oninput="_pmSave()" />
                  </div>
                  <div></div>
                </div>
                <div class="pm-3col">
                  <div>
                    <div class="pm-lbl green">T1</div>
                    <input class="pm-inp-sm" id="pm-pe-t1" type="number" placeholder="e.g. 350" oninput="_pmSave()" />
                  </div>
                  <div>
                    <div class="pm-lbl green">T2</div>
                    <input class="pm-inp-sm" id="pm-pe-t2" type="number" placeholder="e.g. 390" oninput="_pmSave()" />
                  </div>
                  <div>
                    <div class="pm-lbl green">T3</div>
                    <input class="pm-inp-sm" id="pm-pe-t3" type="number" placeholder="e.g. 430" oninput="_pmSave()" />
                  </div>
                </div>
              </div>
              <!-- NOTES -->
              <div>
                <div class="pm-pred-label">&#128221; Pre-Market Notes</div>
                <textarea class="pm-notes" id="pm-notes" placeholder="e.g. BNF flat open expected. If 49800 holds as support, CE trade. Gap down risk if Gift Nifty negative..." oninput="_pmSave()"></textarea>
              </div>`;

if (!src.includes(OLD_HTML)) { console.error('HTML anchor not found'); process.exit(1); }
src = src.replace(OLD_HTML, NEW_HTML);
console.log('✓ HTML expanded');

// ─── 3. UPDATE _pmSave() JS ───────────────────────────────────────────────────
const OLD_SAVE = `    window._pmSave=function(){
      var d=loadData();
      var r=ge('pm-res'),s=ge('pm-sup'),n=ge('pm-notes');
      if(r)d.res=r.value;if(s)d.sup=s.value;if(n)d.notes=n.value;
      saveData(d);
    };`;

const NEW_SAVE = `    window._pmSave=function(){
      var d=loadData();
      var ids=['pm-res','pm-sup','pm-notes','pm-spot','pm-strike',
               'pm-ce-rh','pm-ce-rl','pm-ce-prem','pm-ce-entry','pm-ce-sl','pm-ce-t1','pm-ce-t2','pm-ce-t3',
               'pm-pe-rh','pm-pe-rl','pm-pe-prem','pm-pe-entry','pm-pe-sl','pm-pe-t1','pm-pe-t2','pm-pe-t3'];
      ids.forEach(function(id){var el=ge(id);if(el)d[id.replace(/-/g,'_')]=el.value;});
      saveData(d);
    };`;

if (!src.includes(OLD_SAVE)) { console.error('_pmSave anchor not found'); process.exit(1); }
src = src.replace(OLD_SAVE, NEW_SAVE);
console.log('✓ _pmSave updated');

// ─── 4. UPDATE RESTORE INPUTS ─────────────────────────────────────────────────
const OLD_RESTORE = `    // Restore inputs
    if(saved.res&&ge('pm-res'))ge('pm-res').value=saved.res;
    if(saved.sup&&ge('pm-sup'))ge('pm-sup').value=saved.sup;
    if(saved.notes&&ge('pm-notes'))ge('pm-notes').value=saved.notes;
    if(saved.bias)_pmSetBiasUI(saved.bias);`;

const NEW_RESTORE = `    // Restore inputs
    var _restoreIds=['pm-res','pm-sup','pm-notes','pm-spot','pm-strike',
      'pm-ce-rh','pm-ce-rl','pm-ce-prem','pm-ce-entry','pm-ce-sl','pm-ce-t1','pm-ce-t2','pm-ce-t3',
      'pm-pe-rh','pm-pe-rl','pm-pe-prem','pm-pe-entry','pm-pe-sl','pm-pe-t1','pm-pe-t2','pm-pe-t3'];
    _restoreIds.forEach(function(id){var k=id.replace(/-/g,'_');if(saved[k]&&ge(id))ge(id).value=saved[k];});
    if(saved.bias)_pmSetBiasUI(saved.bias);`;

if (!src.includes(OLD_RESTORE)) { console.error('restore anchor not found'); process.exit(1); }
src = src.replace(OLD_RESTORE, NEW_RESTORE);
console.log('✓ restore inputs updated');

fs.writeFileSync(FILE, src);
console.log('✓ All done — file saved');
