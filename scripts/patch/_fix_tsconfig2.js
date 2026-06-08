const path = require('path');
const fs = require('fs');
const filePath = path.join(process.cwd(), 'tsconfig.json');
const c = JSON.parse(fs.readFileSync(filePath, 'utf8'));
c.compilerOptions.noEmitOnError = false;
fs.writeFileSync(filePath, JSON.stringify(c, null, 2));
console.log('tsconfig.json: noEmitOnError=false set');
