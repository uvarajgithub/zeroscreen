'use strict';
const fs = require('fs');
const FILE = '/root/zeroscreen/dist/server.js';
let src = fs.readFileSync(FILE, 'utf8');

// ── 1. Clear hardcoded ✓ from all 10 dot divs so they start empty ─────────────
let count = 0;
// Each dot is: <div class="pm-tl-dot" id="pm-dot-N">&#10003;</div>
src = src.replace(/<div class="pm-tl-dot" id="pm-dot-\d+">[^<]*<\/div>/g, function(m) {
    const idMatch = m.match(/id="(pm-dot-\d+)"/);
    if (idMatch) { count++; return `<div class="pm-tl-dot" id="${idMatch[1]}"></div>`; }
    return m;
});
console.log('\u2713 Cleared hardcoded ticks from ' + count + ' dot divs');

// ── 2. Fix JS timeline logic ──────────────────────────────────────────────────
const OLD_JS = `        var isActive=(Math.abs(nowM-rowM)<=7)&&nowM>=rowM;
        var isDone=nowM>rowM+7;`;
const NEW_JS = `        var isActive=nowM>=rowM&&nowM<rowM+3;
        var isDone=nowM>=rowM+3;`;

if (!src.includes(OLD_JS)) { console.error('JS anchor not found'); process.exit(1); }
src = src.replace(OLD_JS, NEW_JS);
console.log('\u2713 Timeline logic updated: green=past(+3min), amber=current, empty=future');

fs.writeFileSync(FILE, src);
console.log('\n\u2705  Done.');
