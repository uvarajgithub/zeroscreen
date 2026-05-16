'use strict';
const fs = require('fs');
const FILE = '/root/zeroscreen/dist/server.js';
let s = fs.readFileSync(FILE, 'utf8');
const OLD = "if(ge('vmt-ss-dte'))ge('vmt-ss-dte').textContent=hasSetup?(v.dte?v.dte+'d to expiry'):'':'';";
const NEW = "if(ge('vmt-ss-dte'))ge('vmt-ss-dte').textContent=hasSetup?(v.dte?v.dte+'d to expiry':''):'';";
if (s.includes(OLD)) {
    fs.writeFileSync(FILE, s.replace(OLD, NEW));
    console.log('✓ Fixed ternary syntax error');
} else {
    console.error('String not found — checking actual line:');
    const lines = s.split('\n');
    const idx = lines.findIndex(l => l.includes('vmt-ss-dte') && l.includes('textContent'));
    if (idx !== -1) console.log('Line '+(idx+1)+':', lines[idx]);
}
