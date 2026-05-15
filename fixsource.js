// Fix source config.ts and remove debug lines from compiled JS
var fs = require('fs');

// 1. Fix source config.ts - change dotenv.config() to dotenv.config({ override: true })
var configSrc = '/home/ubuntu/trading-bot/src/config.ts';
var c = fs.readFileSync(configSrc, 'utf8');
c = c.replace('dotenv.config();', 'dotenv.config({ override: true });');
fs.writeFileSync(configSrc, c);
console.log('Fixed src/config.ts with override:true');

// 2. Remove debug line from compiled amina-live.js
var aminaJs = '/home/ubuntu/trading-bot/dist/src/amina-live.js';
var a = fs.readFileSync(aminaJs, 'utf8');
a = a.split('\n').filter(function(line) { return line.indexOf('[DEBUG] apiKey=') === -1; }).join('\n');
fs.writeFileSync(aminaJs, a);
console.log('Removed debug line from amina-live.js');

// 3. Verify config.js still has override:true
var configJs = '/home/ubuntu/trading-bot/dist/src/config.js';
var cj = fs.readFileSync(configJs, 'utf8');
console.log('config.js override:', cj.includes('override: true') ? 'YES' : 'NO');
