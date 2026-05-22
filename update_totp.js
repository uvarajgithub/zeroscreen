const fs = require('fs');
const f = '/home/ubuntu/trading-bot/auto_token.js';
let c = fs.readFileSync(f, 'utf8');
c = c.replace('DCQX2EKIOS44DLTCD2YJYG26EAB5IGDE', '5WPWF3RZSEHY3B5KM2VVEHTU3JQWBXNS');
c = c.replace("'Uvi@janya12345'", "'Uvi@janya123456'");
fs.writeFileSync(f, c);
console.log('Updated: TOTP secret + password');
