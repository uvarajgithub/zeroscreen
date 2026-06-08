const path = require('path');
const fs = require('fs');
const filePath = path.join(process.cwd(), 'tsconfig.json');
const c = JSON.parse(fs.readFileSync(filePath, 'utf8'));
if (!c.exclude.includes('src/server.ts')) {
  c.exclude.push('src/server.ts');
  fs.writeFileSync(filePath, JSON.stringify(c, null, 2));
  console.log('tsconfig.json updated: excluded src/server.ts');
} else {
  console.log('already excluded');
}
