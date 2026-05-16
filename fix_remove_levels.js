'use strict';
const fs = require('fs');
const FILE = '/root/zeroscreen/dist/server.js';
let src = fs.readFileSync(FILE, 'utf8');

// ─── 1. Remove Spot+Strike and Key Levels HTML blocks ────────────────────────
const OLD_HTML = `              <!-- SPOT + STRIKE -->
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
              <!-- CE SETUP -->`;

const NEW_HTML = `              <!-- CE SETUP -->`;

if (!src.includes(OLD_HTML)) { console.error('HTML anchor not found'); process.exit(1); }
src = src.replace(OLD_HTML, NEW_HTML);
console.log('✓ HTML blocks removed');

// ─── 2. Remove pm-res/pm-sup/pm-spot/pm-strike from _restoreIds ──────────────
const OLD_RESTORE = `    var _restoreIds=['pm-res','pm-sup','pm-notes','pm-spot','pm-strike',`;
const NEW_RESTORE = `    var _restoreIds=['pm-notes',`;
if (!src.includes(OLD_RESTORE)) { console.error('restore anchor not found'); process.exit(1); }
src = src.replace(OLD_RESTORE, NEW_RESTORE);
console.log('✓ restore list trimmed');

// ─── 3. Remove pm-res/pm-sup/pm-spot/pm-strike from _pmSave ids ──────────────
const OLD_IDS = `      var ids=['pm-res','pm-sup','pm-notes','pm-spot','pm-strike',`;
const NEW_IDS = `      var ids=['pm-notes',`;
if (!src.includes(OLD_IDS)) { console.error('save ids anchor not found'); process.exit(1); }
src = src.replace(OLD_IDS, NEW_IDS);
console.log('✓ save ids trimmed');

fs.writeFileSync(FILE, src);
console.log('✓ Done');
