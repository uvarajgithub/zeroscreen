'use strict';
const fs = require('fs');
const FILE = '/root/zeroscreen/dist/server.js';
let src = fs.readFileSync(FILE, 'utf8');

// Restore CE/PE cards as read-only display divs (not inputs), placed before NOTES
const OLD = `              <!-- NOTES -->
              <div>
                <div class="pm-pred-label">&#128221; Pre-Market Notes</div>`;

const NEW = `              <!-- CE SETUP (read-only, auto-filled at 9:15) -->
              <div class="pm-trade-card ce-card">
                <div class="pm-trade-hdr ce-hdr">&#128200; CE Setup</div>
                <div class="pm-inp-row" style="margin-bottom:6px">
                  <div>
                    <div class="pm-lbl green">Range High</div>
                    <div class="pm-inp-sm pm-ro" id="pm-cc-rh">&mdash;</div>
                  </div>
                  <div>
                    <div class="pm-lbl red">Range Low</div>
                    <div class="pm-inp-sm pm-ro" id="pm-cc-rl">&mdash;</div>
                  </div>
                </div>
                <div class="pm-inp-row" style="margin-bottom:6px">
                  <div>
                    <div class="pm-lbl muted">Premium (Open)</div>
                    <div class="pm-inp-sm pm-ro" id="pm-cc-prem">&mdash;</div>
                  </div>
                  <div>
                    <div class="pm-lbl amber">Entry</div>
                    <div class="pm-inp-sm pm-ro" id="pm-cc-entry">&mdash;</div>
                  </div>
                </div>
                <div class="pm-inp-row" style="margin-bottom:6px">
                  <div>
                    <div class="pm-lbl red">SL</div>
                    <div class="pm-inp-sm pm-ro" id="pm-cc-sl">&mdash;</div>
                  </div>
                  <div></div>
                </div>
                <div class="pm-3col">
                  <div>
                    <div class="pm-lbl green">T1</div>
                    <div class="pm-inp-sm pm-ro" id="pm-cc-t1">&mdash;</div>
                  </div>
                  <div>
                    <div class="pm-lbl green">T2</div>
                    <div class="pm-inp-sm pm-ro" id="pm-cc-t2">&mdash;</div>
                  </div>
                  <div>
                    <div class="pm-lbl green">T3</div>
                    <div class="pm-inp-sm pm-ro" id="pm-cc-t3">&mdash;</div>
                  </div>
                </div>
              </div>
              <!-- PE SETUP (read-only, auto-filled at 9:15) -->
              <div class="pm-trade-card pe-card">
                <div class="pm-trade-hdr pe-hdr">&#128201; PE Setup</div>
                <div class="pm-inp-row" style="margin-bottom:6px">
                  <div>
                    <div class="pm-lbl green">Range High</div>
                    <div class="pm-inp-sm pm-ro" id="pm-cp-rh">&mdash;</div>
                  </div>
                  <div>
                    <div class="pm-lbl red">Range Low</div>
                    <div class="pm-inp-sm pm-ro" id="pm-cp-rl">&mdash;</div>
                  </div>
                </div>
                <div class="pm-inp-row" style="margin-bottom:6px">
                  <div>
                    <div class="pm-lbl muted">Premium (Open)</div>
                    <div class="pm-inp-sm pm-ro" id="pm-cp-prem">&mdash;</div>
                  </div>
                  <div>
                    <div class="pm-lbl amber">Entry</div>
                    <div class="pm-inp-sm pm-ro" id="pm-cp-entry">&mdash;</div>
                  </div>
                </div>
                <div class="pm-inp-row" style="margin-bottom:6px">
                  <div>
                    <div class="pm-lbl red">SL</div>
                    <div class="pm-inp-sm pm-ro" id="pm-cp-sl">&mdash;</div>
                  </div>
                  <div></div>
                </div>
                <div class="pm-3col">
                  <div>
                    <div class="pm-lbl green">T1</div>
                    <div class="pm-inp-sm pm-ro" id="pm-cp-t1">&mdash;</div>
                  </div>
                  <div>
                    <div class="pm-lbl green">T2</div>
                    <div class="pm-inp-sm pm-ro" id="pm-cp-t2">&mdash;</div>
                  </div>
                  <div>
                    <div class="pm-lbl green">T3</div>
                    <div class="pm-inp-sm pm-ro" id="pm-cp-t3">&mdash;</div>
                  </div>
                </div>
              </div>
              <!-- NOTES -->
              <div>
                <div class="pm-pred-label">&#128221; Pre-Market Notes</div>`;

if (!src.includes(OLD)) { console.error('FAIL: anchor not found'); process.exit(1); }
src = src.replace(OLD, NEW);
console.log('✓ CE/PE read-only cards restored');

// Add CSS for pm-ro (read-only display style)
const OLD_CSS = `    .pm-inp-sm{width:100%;background:var(--bg);border:1.5px solid var(--border-c);border-radius:6px;padding:5px 8px;font-size:.74rem;color:var(--text-main);outline:none;font-family:monospace;box-sizing:border-box}
    .pm-inp-sm:focus{border-color:#7c3aed}`;
const NEW_CSS = `    .pm-inp-sm{width:100%;background:var(--bg);border:1.5px solid var(--border-c);border-radius:6px;padding:5px 8px;font-size:.74rem;color:var(--text-main);outline:none;font-family:monospace;box-sizing:border-box}
    .pm-inp-sm:focus{border-color:#7c3aed}
    .pm-inp-sm.pm-ro{cursor:default;user-select:none;color:var(--text-main);opacity:.85}`;
if (!src.includes(OLD_CSS)) { console.error('FAIL: CSS anchor not found'); process.exit(1); }
src = src.replace(OLD_CSS, NEW_CSS);
console.log('✓ pm-ro CSS added');

// Wire _pmUpdateAutoLevels to also fill the card display divs
const OLD_FILL = `      if(ge('pm-ce-rh'))ge('pm-ce-rh').textContent=v.ceRangeHigh?('\u20b9'+Number(v.ceRangeHigh).toFixed(1)):'\u2014';
      if(ge('pm-ce-rl'))ge('pm-ce-rl').textContent=v.ceRangeLow?('\u20b9'+Number(v.ceRangeLow).toFixed(1)):'\u2014';`;
const NEW_FILL = `      if(ge('pm-ce-rh'))ge('pm-ce-rh').textContent=v.ceRangeHigh?('\u20b9'+Number(v.ceRangeHigh).toFixed(1)):'\u2014';
      if(ge('pm-ce-rl'))ge('pm-ce-rl').textContent=v.ceRangeLow?('\u20b9'+Number(v.ceRangeLow).toFixed(1)):'\u2014';
      // Mirror to card divs
      if(ge('pm-cc-rh'))ge('pm-cc-rh').textContent=ge('pm-ce-rh').textContent;
      if(ge('pm-cc-rl'))ge('pm-cc-rl').textContent=ge('pm-ce-rl').textContent;
      if(ge('pm-cc-prem'))ge('pm-cc-prem').textContent='\u20b9'+ceOp.toFixed(1);
      if(ge('pm-cc-entry'))ge('pm-cc-entry').textContent='\u20b9'+ceEn.toFixed(1);
      if(ge('pm-cc-sl'))ge('pm-cc-sl').textContent='\u20b9'+ceSl.toFixed(1);
      if(ge('pm-cc-t1'))ge('pm-cc-t1').textContent='\u20b9'+ceT1.toFixed(1);
      if(ge('pm-cc-t2'))ge('pm-cc-t2').textContent='\u20b9'+ceT2.toFixed(1);
      if(ge('pm-cc-t3'))ge('pm-cc-t3').textContent='\u20b9'+ceT3.toFixed(1);`;
if (!src.includes(OLD_FILL)) { console.error('FAIL: CE fill anchor not found'); process.exit(1); }
src = src.replace(OLD_FILL, NEW_FILL);
console.log('✓ CE card wired to auto-levels');

const OLD_PE_FILL = `      if(ge('pm-pe-rh'))ge('pm-pe-rh').textContent=v.peRangeHigh?('\u20b9'+Number(v.peRangeHigh).toFixed(1)):'\u2014';
      if(ge('pm-pe-rl'))ge('pm-pe-rl').textContent=v.peRangeLow?('\u20b9'+Number(v.peRangeLow).toFixed(1)):'\u2014';`;
const NEW_PE_FILL = `      if(ge('pm-pe-rh'))ge('pm-pe-rh').textContent=v.peRangeHigh?('\u20b9'+Number(v.peRangeHigh).toFixed(1)):'\u2014';
      if(ge('pm-pe-rl'))ge('pm-pe-rl').textContent=v.peRangeLow?('\u20b9'+Number(v.peRangeLow).toFixed(1)):'\u2014';
      // Mirror to card divs
      if(ge('pm-cp-rh'))ge('pm-cp-rh').textContent=ge('pm-pe-rh').textContent;
      if(ge('pm-cp-rl'))ge('pm-cp-rl').textContent=ge('pm-pe-rl').textContent;
      if(ge('pm-cp-prem'))ge('pm-cp-prem').textContent='\u20b9'+peOp.toFixed(1);
      if(ge('pm-cp-entry'))ge('pm-cp-entry').textContent='\u20b9'+peEn.toFixed(1);
      if(ge('pm-cp-sl'))ge('pm-cp-sl').textContent='\u20b9'+peSl.toFixed(1);
      if(ge('pm-cp-t1'))ge('pm-cp-t1').textContent='\u20b9'+peT1.toFixed(1);
      if(ge('pm-cp-t2'))ge('pm-cp-t2').textContent='\u20b9'+peT2.toFixed(1);
      if(ge('pm-cp-t3'))ge('pm-cp-t3').textContent='\u20b9'+peT3.toFixed(1);`;
if (!src.includes(OLD_PE_FILL)) { console.error('FAIL: PE fill anchor not found'); process.exit(1); }
src = src.replace(OLD_PE_FILL, NEW_PE_FILL);
console.log('✓ PE card wired to auto-levels');

fs.writeFileSync(FILE, src);
console.log('✓ All done');
