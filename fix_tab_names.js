const fs = require('fs');
const p = '/root/zeroscreen/dist/server.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace('&#9670; AMINA Trail#9670; Trail', '&#9670; Trail');
s = s.replace('&#9671; AMINA Lock50#9671; Lock50', '&#9671; Lock50');
fs.writeFileSync(p, s);
console.log('done');
