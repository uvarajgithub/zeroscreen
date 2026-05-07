const fs = require('fs');
const f = '/home/ubuntu/trading-bot/token-server.ts';
let c = fs.readFileSync(f, 'utf8');
const old = "pm2 restart ${BOT_NAME}`";
const rep = "pm2 restart ${BOT_NAME} --update-env`";
const n = c.split(old).length - 1;
c = c.split(old).join(rep);
fs.writeFileSync(f, c);
console.log('Replaced', n, 'occurrences');
