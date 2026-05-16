'use strict';
/**
 * fix_lock50old_structure.js
 * Removes the duplicate pos-card and extra closing div inside panel-lock50old
 * that were prematurely closing db-main, causing the "LOCK50 Old Trades Today"
 * table to render OUTSIDE the panel (always visible).
 */
const fs   = require('fs');
const FILE = '/root/zeroscreen/dist/server.js';
let src = fs.readFileSync(FILE, 'utf8');

const OLD = `        </div>
          <!-- In-trade card (hidden when flat) -->
          <div class="pos-card pos-ce" id="sh-pos-l50o-card" style="display:none">
            <div class="pos-hdr">
              <span class="pos-live-dot"></span>
              <span class="pos-badge pos-b-ce" id="sh-l50o-card-badge">CE OPTION</span>
              <span class="pos-sym">BANKNIFTY</span>
              <span class="pos-mode">PAPER</span>
            </div>
            <div class="pos-pnl-rs g" id="sh-l50o-card-rs">\u2014</div>
            <div class="pos-pnl-pts g" id="sh-l50o-card-pts">\u2014 unrealised</div>
            <div class="pos-grid">
              <div><div class="pos-lbl">Entry Index</div><div class="pos-val mono" id="sh-l50o-card-ep">\u2014</div></div>
              <div><div class="pos-lbl">Live Index</div><div class="pos-val g mono" id="sh-l50o-card-lp">\u2014</div></div>
              <div><div class="pos-lbl">Stop Loss</div><div class="pos-val r mono" id="sh-l50o-card-sl">\u2014</div></div>
              <div><div class="pos-lbl">SL Risk \u20b9</div><div class="pos-val r" id="sh-l50o-card-slrs">\u2014</div></div>
            </div>
          </div>
        </div>
        <div id="sh-l50o-signal"`;

// The garbled chars in file — search by surrounding unique text
const searchStart = '        </div>\n          <!-- In-trade card (hidden when flat) -->';
const searchEnd   = '        </div>\n        <div id="sh-l50o-signal"';

const si = src.indexOf(searchStart);
const ei = src.indexOf(searchEnd, si);

if (si === -1 || ei === -1) {
    console.error('Markers not found. si='+si+', ei='+ei);
    // Fallback: find by line numbers approach
    process.exit(1);
}

// We want to keep everything from `</div>` (closing sh-pos-l50o-wrap) up to the signal div
// The block to REMOVE is: searchStart ... up to (but not including) the final `</div>\n        <div id="sh-l50o-signal"`
// But we need to keep the first `</div>` (closing sh-pos-l50o-wrap)
// The searchStart INCLUDES that first </div>, so we keep it and remove everything after to just before searchEnd's second part

const keepPrefix = '        </div>';  // closing sh-pos-l50o-wrap
const keepSuffix = '\n        <div id="sh-l50o-signal"';

// Find the exact range: from (si + keepPrefix.length) to (ei + '        </div>'.length)
const removeFrom = si + keepPrefix.length;
const removeTo   = ei + '        </div>'.length;

src = src.slice(0, removeFrom) + src.slice(removeTo);
console.log('✓ Removed duplicate pos-card and extra </div> from panel-lock50old');
console.log('  Removed', removeTo - removeFrom, 'characters');

// Verify the result
const checkFrom = src.indexOf('        </div>\n        <div id="sh-l50o-signal"');
if (checkFrom === -1) { console.error('Verification failed'); process.exit(1); }
console.log('✓ Verified: sh-pos-l50o-wrap now closes directly into sh-l50o-signal');

fs.writeFileSync(FILE, src);
console.log('\n✅  Done. panel-lock50old structure fixed. Trades section now inside panel.');
