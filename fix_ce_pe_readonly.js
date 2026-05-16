'use strict';
const fs = require('fs');
const FILE = '/root/zeroscreen/dist/server.js';
let src = fs.readFileSync(FILE, 'utf8');

// ─── 1. Remove editable CE/PE input cards ─────────────────────────────────────
const OLD_CARDS = `              <!-- CE SETUP -->
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
              <!-- NOTES -->`;
const NEW_CARDS = `              <!-- NOTES -->`;
if (!src.includes(OLD_CARDS)) { console.error('FAIL: editable cards not found'); process.exit(1); }
src = src.replace(OLD_CARDS, NEW_CARDS);
console.log('✓ Editable CE/PE input cards removed');

// ─── 2. Replace single "Target" row with Range High/Low + T1/T2/T3 in CE side ─
const OLD_CE = `                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Stop Loss</span>
                      <span class="pm-setup-val sl" id="pm-ce-sl">&mdash;</span>
                    </div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Target</span>
                      <span class="pm-setup-val tgt" id="pm-ce-tgt">&mdash;</span>
                    </div>
                    <div class="pm-setup-divider"></div>`;
const NEW_CE = `                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Stop Loss</span>
                      <span class="pm-setup-val sl" id="pm-ce-sl">&mdash;</span>
                    </div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">T1 &nbsp;<span style="font-size:.55rem;opacity:.6">(1R)</span></span>
                      <span class="pm-setup-val tgt" id="pm-ce-t1">&mdash;</span>
                    </div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">T2 &nbsp;<span style="font-size:.55rem;opacity:.6">(2R)</span></span>
                      <span class="pm-setup-val tgt" id="pm-ce-t2">&mdash;</span>
                    </div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">T3 &nbsp;<span style="font-size:.55rem;opacity:.6">(3R)</span></span>
                      <span class="pm-setup-val tgt" id="pm-ce-t3">&mdash;</span>
                    </div>
                    <div class="pm-setup-divider"></div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Range High</span>
                      <span class="pm-setup-val" id="pm-ce-rh">&mdash;</span>
                    </div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Range Low</span>
                      <span class="pm-setup-val" id="pm-ce-rl">&mdash;</span>
                    </div>
                    <div class="pm-setup-divider"></div>`;
if (!src.includes(OLD_CE)) { console.error('FAIL: CE target row not found'); process.exit(1); }
src = src.replace(OLD_CE, NEW_CE);
console.log('✓ CE side: T1/T2/T3 + Range added');

// ─── 3. Replace single "Target" row with Range High/Low + T1/T2/T3 in PE side ─
const OLD_PE = `                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Stop Loss</span>
                      <span class="pm-setup-val sl" id="pm-pe-sl">&mdash;</span>
                    </div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Target</span>
                      <span class="pm-setup-val tgt" id="pm-pe-tgt">&mdash;</span>
                    </div>
                    <div class="pm-setup-divider"></div>`;
const NEW_PE = `                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Stop Loss</span>
                      <span class="pm-setup-val sl" id="pm-pe-sl">&mdash;</span>
                    </div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">T1 &nbsp;<span style="font-size:.55rem;opacity:.6">(1R)</span></span>
                      <span class="pm-setup-val tgt" id="pm-pe-t1">&mdash;</span>
                    </div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">T2 &nbsp;<span style="font-size:.55rem;opacity:.6">(2R)</span></span>
                      <span class="pm-setup-val tgt" id="pm-pe-t2">&mdash;</span>
                    </div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">T3 &nbsp;<span style="font-size:.55rem;opacity:.6">(3R)</span></span>
                      <span class="pm-setup-val tgt" id="pm-pe-t3">&mdash;</span>
                    </div>
                    <div class="pm-setup-divider"></div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Range High</span>
                      <span class="pm-setup-val" id="pm-pe-rh">&mdash;</span>
                    </div>
                    <div class="pm-setup-row">
                      <span class="pm-setup-lbl">Range Low</span>
                      <span class="pm-setup-val" id="pm-pe-rl">&mdash;</span>
                    </div>
                    <div class="pm-setup-divider"></div>`;
if (!src.includes(OLD_PE)) { console.error('FAIL: PE target row not found'); process.exit(1); }
src = src.replace(OLD_PE, NEW_PE);
console.log('✓ PE side: T1/T2/T3 + Range added');

// ─── 4. Update _pmUpdateAutoLevels to calculate T1/T2/T3 ─────────────────────
const OLD_AUTO = `      if(ge('pm-ce-open'))ge('pm-ce-open').textContent='\u20b9'+ceOp.toFixed(1);
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
      if(ge('pm-pe-rr'))ge('pm-pe-rr').textContent='1 : '+peRR;`;
const NEW_AUTO = `      var ceRisk1=Math.abs(ceEn-ceSl);
      var ceT1=ceEn+ceRisk1,ceT2=ceEn+ceRisk1*2,ceT3=ceEn+ceRisk1*3;
      if(ge('pm-ce-open'))ge('pm-ce-open').textContent='\u20b9'+ceOp.toFixed(1);
      if(ge('pm-ce-entry'))ge('pm-ce-entry').textContent='\u20b9'+ceEn.toFixed(1);
      if(ge('pm-ce-sl'))ge('pm-ce-sl').textContent='\u20b9'+ceSl.toFixed(1);
      if(ge('pm-ce-t1'))ge('pm-ce-t1').textContent='\u20b9'+ceT1.toFixed(1);
      if(ge('pm-ce-t2'))ge('pm-ce-t2').textContent='\u20b9'+ceT2.toFixed(1);
      if(ge('pm-ce-t3'))ge('pm-ce-t3').textContent='\u20b9'+ceT3.toFixed(1);
      if(ge('pm-ce-rh'))ge('pm-ce-rh').textContent=v.ceRangeHigh?('\u20b9'+Number(v.ceRangeHigh).toFixed(1)):'\u2014';
      if(ge('pm-ce-rl'))ge('pm-ce-rl').textContent=v.ceRangeLow?('\u20b9'+Number(v.ceRangeLow).toFixed(1)):'\u2014';
      if(ge('pm-ce-risk'))ge('pm-ce-risk').textContent='\u20b9'+ceRisk.toLocaleString('en-IN');
      if(ge('pm-ce-reward'))ge('pm-ce-reward').textContent='\u20b9'+Math.round(ceRisk1*3*15).toLocaleString('en-IN');
      if(ge('pm-ce-rr'))ge('pm-ce-rr').textContent='1 : '+(ceRisk>0?((ceRisk1*3*15/ceRisk).toFixed(1)+'R'):'\u2014');
      // PE setup
      var peOp=v.pePremium||0,peEn=v.peEntry||0,peSl=v.peSL||peOp,peTg=v.peTarget||0;
      var peRisk=Math.round(Math.abs(peEn-peSl)*15),peReward=Math.round(Math.abs(peTg-peEn)*15);
      var peRR=peRisk>0?(peReward/peRisk).toFixed(1)+'R':'\u2014';
      var peRisk1=Math.abs(peEn-peSl);
      var peT1=peEn+peRisk1,peT2=peEn+peRisk1*2,peT3=peEn+peRisk1*3;
      if(ge('pm-pe-open'))ge('pm-pe-open').textContent='\u20b9'+peOp.toFixed(1);
      if(ge('pm-pe-entry'))ge('pm-pe-entry').textContent='\u20b9'+peEn.toFixed(1);
      if(ge('pm-pe-sl'))ge('pm-pe-sl').textContent='\u20b9'+peSl.toFixed(1);
      if(ge('pm-pe-t1'))ge('pm-pe-t1').textContent='\u20b9'+peT1.toFixed(1);
      if(ge('pm-pe-t2'))ge('pm-pe-t2').textContent='\u20b9'+peT2.toFixed(1);
      if(ge('pm-pe-t3'))ge('pm-pe-t3').textContent='\u20b9'+peT3.toFixed(1);
      if(ge('pm-pe-rh'))ge('pm-pe-rh').textContent=v.peRangeHigh?('\u20b9'+Number(v.peRangeHigh).toFixed(1)):'\u2014';
      if(ge('pm-pe-rl'))ge('pm-pe-rl').textContent=v.peRangeLow?('\u20b9'+Number(v.peRangeLow).toFixed(1)):'\u2014';
      if(ge('pm-pe-risk'))ge('pm-pe-risk').textContent='\u20b9'+peRisk.toLocaleString('en-IN');
      if(ge('pm-pe-reward'))ge('pm-pe-reward').textContent='\u20b9'+Math.round(peRisk1*3*15).toLocaleString('en-IN');
      if(ge('pm-pe-rr'))ge('pm-pe-rr').textContent='1 : '+(peRisk>0?((peRisk1*3*15/peRisk).toFixed(1)+'R'):'\u2014');`;
if (!src.includes(OLD_AUTO)) { console.error('FAIL: _pmUpdateAutoLevels body not found'); process.exit(1); }
src = src.replace(OLD_AUTO, NEW_AUTO);
console.log('✓ _pmUpdateAutoLevels: T1/T2/T3 + Range logic added');

// ─── 5. Update footer text ─────────────────────────────────────────────────────
const OLD_FOOTER = `SL = Open Premium &nbsp;&#183;&nbsp; Entry = Open + 7 pts &nbsp;&#183;&nbsp; Target = Entry + 21 pts (3R)`;
const NEW_FOOTER = `SL = Open Premium &nbsp;&#183;&nbsp; Entry = Open + 7 pts &nbsp;&#183;&nbsp; T1 = 1R &nbsp;&#183;&nbsp; T2 = 2R &nbsp;&#183;&nbsp; T3 = 3R &nbsp;&#183;&nbsp; Range = First 15-min candle`;
if (!src.includes(OLD_FOOTER)) { console.error('FAIL: footer not found'); process.exit(1); }
src = src.replace(OLD_FOOTER, NEW_FOOTER);
console.log('✓ Footer updated');

// ─── 6. Clean up save/restore ids (remove CE/PE input ids) ────────────────────
const OLD_RESTORE = `    var _restoreIds=['pm-notes',
      'pm-ce-rh','pm-ce-rl','pm-ce-prem','pm-ce-entry','pm-ce-sl','pm-ce-t1','pm-ce-t2','pm-ce-t3',
      'pm-pe-rh','pm-pe-rl','pm-pe-prem','pm-pe-entry','pm-pe-sl','pm-pe-t1','pm-pe-t2','pm-pe-t3'];
    _restoreIds.forEach(function(id){var k=id.replace(/-/g,'_');if(saved[k]&&ge(id))ge(id).value=saved[k];});`;
const NEW_RESTORE = `    var _restoreIds=['pm-notes'];
    _restoreIds.forEach(function(id){var k=id.replace(/-/g,'_');if(saved[k]&&ge(id))ge(id).value=saved[k];});`;
if (!src.includes(OLD_RESTORE)) { console.error('FAIL: restore ids not found'); process.exit(1); }
src = src.replace(OLD_RESTORE, NEW_RESTORE);
console.log('✓ restore ids cleaned');

const OLD_SAVE_IDS = `      var ids=['pm-notes',
               'pm-ce-rh','pm-ce-rl','pm-ce-prem','pm-ce-entry','pm-ce-sl','pm-ce-t1','pm-ce-t2','pm-ce-t3',
               'pm-pe-rh','pm-pe-rl','pm-pe-prem','pm-pe-entry','pm-pe-sl','pm-pe-t1','pm-pe-t2','pm-pe-t3'];`;
const NEW_SAVE_IDS = `      var ids=['pm-notes'];`;
if (!src.includes(OLD_SAVE_IDS)) { console.error('FAIL: save ids not found'); process.exit(1); }
src = src.replace(OLD_SAVE_IDS, NEW_SAVE_IDS);
console.log('✓ save ids cleaned');

fs.writeFileSync(FILE, src);
console.log('✓ All done');
