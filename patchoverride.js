// Patch config.js to use dotenv override:true so .env ALWAYS wins over stale PM2 env
var fs = require('fs');
var f = '/home/ubuntu/trading-bot/dist/src/config.js';
var c = fs.readFileSync(f, 'utf8');
var old = 'dotenv_1.default.config();';
var nw  = 'dotenv_1.default.config({ override: true });';
console.log('found:', c.includes(old));
var patched = c.replace(old, nw);
fs.writeFileSync(f, patched);
console.log('patched config.js with override:true');

// Also verify what the token should be
var env = fs.readFileSync('/home/ubuntu/trading-bot/.env', 'utf8');
var match = env.match(/ACCESS_TOKEN=(.+)/);
if (match) console.log('Correct token from .env:', match[1].trim());
