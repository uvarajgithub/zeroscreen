'use strict';
const fs = require('fs');
const FILE = '/root/zeroscreen/dist/server.js';
let src = fs.readFileSync(FILE, 'utf8');

// ─── 1. Replace manual bias buttons with auto-badge ──────────────────────────
const OLD_BIAS_HTML = `              <!-- BIAS -->
              <div>
                <div class="pm-pred-label">&#127919; Today&rsquo;s Bias</div>
                <div class="pm-bias-btns">
                  <button class="pm-bias-btn" id="pm-bias-bull" onclick="_pmBias('BULLISH')" type="button">&#128200; Bullish</button>
                  <button class="pm-bias-btn" id="pm-bias-neut" onclick="_pmBias('NEUTRAL')" type="button">&#8596; Neutral</button>
                  <button class="pm-bias-btn" id="pm-bias-bear" onclick="_pmBias('BEARISH')" type="button">&#128201; Bearish</button>
                </div>
              </div>`;

const NEW_BIAS_HTML = `              <!-- BIAS (auto from tradeDir) -->
              <div>
                <div class="pm-pred-label">&#127919; Today&rsquo;s Bias</div>
                <div id="pm-bias-display" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;background:var(--bg);border:1.5px solid var(--border-c)">
                  <span id="pm-bias-icon" style="font-size:1rem">&#8987;</span>
                  <span id="pm-bias-text" style="font-size:.78rem;font-weight:700;color:var(--muted)">Waiting for market open&hellip;</span>
                </div>
              </div>`;

if (!src.includes(OLD_BIAS_HTML)) { console.error('FAIL: bias HTML not found'); process.exit(1); }
src = src.replace(OLD_BIAS_HTML, NEW_BIAS_HTML);
console.log('✓ Bias buttons replaced with auto-badge');

// ─── 2. Remove bias CSS ────────────────────────────────────────────────────────
const OLD_BIAS_CSS = `    .pm-bias-btns{display:flex;gap:6px}
    .pm-bias-btn{flex:1;padding:6px 4px;border-radius:7px;font-size:.7rem;font-weight:700;cursor:pointer;border:1.5px solid var(--border-c);background:transparent;color:var(--muted);transition:all .15s}
    .pm-bias-btn.bull-sel{background:rgba(5,150,105,.12);border-color:#059669;color:#059669}
    .pm-bias-btn.bear-sel{background:rgba(239,68,68,.1);border-color:#ef4444;color:#ef4444}
    .pm-bias-btn.neut-sel{background:rgba(100,116,139,.1);border-color:#64748b;color:#94a3b8}`;
if (!src.includes(OLD_BIAS_CSS)) { console.error('FAIL: bias CSS not found'); process.exit(1); }
src = src.replace(OLD_BIAS_CSS, '');
console.log('✓ Bias CSS removed');

// ─── 3. Remove bias JS (restore, _pmBias, _pmSetBiasUI) ──────────────────────
const OLD_BIAS_JS = `    if(saved.bias)_pmSetBiasUI(saved.bias);
    if(saved.collapsed){`;
const NEW_BIAS_JS = `    if(saved.collapsed){`;
if (!src.includes(OLD_BIAS_JS)) { console.error('FAIL: bias restore JS not found'); process.exit(1); }
src = src.replace(OLD_BIAS_JS, NEW_BIAS_JS);
console.log('✓ Bias restore JS removed');

const OLD_PMBIASF = `    window._pmBias=function(b){
      _pmSetBiasUI(b);
      var d=loadData();d.bias=b;saveData(d);
    };
    window._pmSave=function(){`;
const NEW_PMBIASF = `    window._pmSave=function(){`;
if (!src.includes(OLD_PMBIASF)) { console.error('FAIL: _pmBias fn not found'); process.exit(1); }
src = src.replace(OLD_PMBIASF, NEW_PMBIASF);
console.log('✓ _pmBias function removed');

const OLD_SETBIAS = `    function _pmSetBiasUI(b){
      var btns={'BULLISH':'pm-bias-bull','NEUTRAL':'pm-bias-neut','BEARISH':'pm-bias-bear'};
      var cls={'BULLISH':'bull-sel','NEUTRAL':'neut-sel','BEARISH':'bear-sel'};
      Object.keys(btns).forEach(function(k){
        var el=ge(btns[k]);
        if(el){el.className='pm-bias-btn'+(k===b?' '+cls[k]:'');}
      });
    }

    // Timeline + phase update (run every 30s)`;
const NEW_SETBIAS = `    // Timeline + phase update (run every 30s)`;
if (!src.includes(OLD_SETBIAS)) { console.error('FAIL: _pmSetBiasUI not found'); process.exit(1); }
src = src.replace(OLD_SETBIAS, NEW_SETBIAS);
console.log('✓ _pmSetBiasUI removed');

// ─── 4. Wire bias badge in _pmUpdateAutoLevels ────────────────────────────────
const OLD_AUTO_START = `    window._pmUpdateAutoLevels=function(v){
      if(!v||!v.atmStrike)return;
      var box=ge('pm-auto-box');if(box)box.style.display='';`;
const NEW_AUTO_START = `    window._pmUpdateAutoLevels=function(v){
      if(!v||!v.atmStrike)return;
      var box=ge('pm-auto-box');if(box)box.style.display='';
      // Auto bias from tradeDir
      var biasIcon=ge('pm-bias-icon'),biasText=ge('pm-bias-text'),biasDis=ge('pm-bias-display');
      if(biasIcon&&biasText&&biasDis){
        var dir=v.tradeDir;
        if(dir==='CE'){
          biasIcon.textContent='\uD83D\uDCC8';biasText.textContent='Bullish \u2014 CE trade signalled';
          biasText.style.color='#059669';biasDis.style.borderColor='rgba(5,150,105,.4)';biasDis.style.background='rgba(5,150,105,.07)';
        } else if(dir==='PE'){
          biasIcon.textContent='\uD83D\uDCC9';biasText.textContent='Bearish \u2014 PE trade signalled';
          biasText.style.color='#ef4444';biasDis.style.borderColor='rgba(239,68,68,.35)';biasDis.style.background='rgba(239,68,68,.07)';
        } else if(v.cePremium||v.pePremium){
          var ceP=v.cePremium||0,peP=v.pePremium||0,diff=Math.abs(ceP-peP);
          var pct=((ceP+peP)>0)?diff/(ceP+peP)*100:0;
          if(pct>5&&ceP>peP){
            biasIcon.textContent='\uD83D\uDCC8';biasText.textContent='Bullish \u2014 CE premium dominant';
            biasText.style.color='#059669';biasDis.style.borderColor='rgba(5,150,105,.3)';biasDis.style.background='rgba(5,150,105,.05)';
          } else if(pct>5&&peP>ceP){
            biasIcon.textContent='\uD83D\uDCC9';biasText.textContent='Bearish \u2014 PE premium dominant';
            biasText.style.color='#ef4444';biasDis.style.borderColor='rgba(239,68,68,.3)';biasDis.style.background='rgba(239,68,68,.05)';
          } else {
            biasIcon.textContent='\u2194\uFE0F';biasText.textContent='Neutral \u2014 CE \u2248 PE premium';
            biasText.style.color='#94a3b8';biasDis.style.borderColor='var(--border-c)';biasDis.style.background='var(--bg)';
          }
        }
      }`;
if (!src.includes(OLD_AUTO_START)) { console.error('FAIL: _pmUpdateAutoLevels start not found'); process.exit(1); }
src = src.replace(OLD_AUTO_START, NEW_AUTO_START);
console.log('✓ Bias auto-wired to _pmUpdateAutoLevels');

fs.writeFileSync(FILE, src);
console.log('✓ All done');
