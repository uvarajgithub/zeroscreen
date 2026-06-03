const fs = require('fs');
const path = '/home/ubuntu/trading-bot/tsconfig.json';
const c = JSON.parse(fs.readFileSync(path, 'utf8'));
if (!c.exclude.includes('src/server.ts')) {
  c.exclude.push('src/server.ts');
  fs.writeFileSync(path, JSON.stringify(c, null, 2));
  console.log('tsconfig.json updated: excluded src/server.ts');
} else {
  console.log('already excluded');
}
