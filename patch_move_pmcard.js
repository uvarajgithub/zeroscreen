'use strict';
/**
 * patch_move_pmcard.js
 * Moves the pm-card from above the tab strip to INSIDE panel-vmt,
 * so it only shows when the VMT tab is active.
 */
const fs   = require('fs');
const FILE = '/root/zeroscreen/dist/server.js';
let src = fs.readFileSync(FILE, 'utf8');

// ── Locate the pm-card block (comment + div...closing div) ───────────────────
const PM_START_MARKER = '\n    <!-- \u2500\u2500 Pre-Market Analysis Card ';
const PM_END_MARKER   = '    </div><!-- /pm-card -->\n';

const pmStart = src.indexOf(PM_START_MARKER);
if (pmStart === -1) { console.error('pm-card start not found'); process.exit(1); }

const pmEnd = src.indexOf(PM_END_MARKER, pmStart);
if (pmEnd === -1) { console.error('pm-card end not found'); process.exit(1); }

// Extract the entire pm-card block (including trailing newline)
const pmBlock = src.slice(pmStart, pmEnd + PM_END_MARKER.length);

// ── Remove it from current position ──────────────────────────────────────────
src = src.slice(0, pmStart) + src.slice(pmEnd + PM_END_MARKER.length);

// ── Find the opening of panel-vmt and insert pm-card right after it ──────────
const VMT_PANEL_OPEN = '    <div id="panel-vmt" style="display:none">\n';
const vmtIdx = src.indexOf(VMT_PANEL_OPEN);
if (vmtIdx === -1) { console.error('panel-vmt not found'); process.exit(1); }

const insertAt = vmtIdx + VMT_PANEL_OPEN.length;
src = src.slice(0, insertAt) + pmBlock + '\n' + src.slice(insertAt);

fs.writeFileSync(FILE, src);
console.log('✅  pm-card moved inside panel-vmt. Now only shows on VMT tab.');
