// patch_stab_names.js — rename strategy tabs in zeroscreen dashboard
const fs = require('fs');
const path = '/root/zeroscreen/dist/server.js';
let s = fs.readFileSync(path, 'utf8');

// Replace each stab-name span content
// The original has unicode bullet chars before the name
s = s.replace(/<span class="stab-name">[^<]*TICK TRAIL<\/span>/, '<span class="stab-name">&#9679; AMINA</span>');
s = s.replace(/<span class="stab-name">[^<]*(?<!LOCK50 )TRAIL<\/span>/, '<span class="stab-name">&#9670; AMINA Trail</span>');
s = s.replace(/<span class="stab-name">[^<]*LOCK50 Old<\/span>/, '<span class="stab-name">&#9671; AMINA Lock50</span>');

fs.writeFileSync(path, s);

// Verify
const lines = s.split('\n').filter(l => l.includes('stab-name') && l.includes('span>') && !l.includes('display:'));
lines.slice(0, 6).forEach(l => console.log(l.trim()));
console.log('done');
