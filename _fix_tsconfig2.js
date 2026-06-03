const fs = require('fs');
const path = '/home/ubuntu/trading-bot/tsconfig.json';
const c = JSON.parse(fs.readFileSync(path, 'utf8'));
c.compilerOptions.noEmitOnError = false;
fs.writeFileSync(path, JSON.stringify(c, null, 2));
console.log('tsconfig.json: noEmitOnError=false set');
