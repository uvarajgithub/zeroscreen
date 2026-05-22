const fs = require('fs');
const s = JSON.parse(fs.readFileSync('user-settings.json', 'utf-8'));
s.mode = 'PAPER';
fs.writeFileSync('user-settings.json', JSON.stringify(s, null, 2));
console.log('Done. mode =', s.mode);
