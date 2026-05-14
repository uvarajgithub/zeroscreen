const fs = require('fs');
const d = JSON.parse(fs.readFileSync('user-settings.json', 'utf8'));
d.risk.maxTradesPerDay = 999;
fs.writeFileSync('user-settings.json', JSON.stringify(d, null, 2));
console.log('Updated maxTradesPerDay to', d.risk.maxTradesPerDay);
console.log(JSON.stringify(d, null, 2));
