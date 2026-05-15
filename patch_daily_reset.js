const fs = require('fs');
const p = '/home/ubuntu/trading-bot/dist/src/index.js';
let s = fs.readFileSync(p, 'utf8');

const OLD = `        log("STATE_RESET", { strategy: "HYBRID_REVERSE" });\n    }`;
const NEW = `        log("STATE_RESET", { strategy: "HYBRID_REVERSE" });\n        saveTradeState(); // auto-reset file on new day\n    }`;

if (!s.includes(OLD)) {
  console.error('ERROR: marker not found');
  process.exit(1);
}
s = s.replace(OLD, NEW);
fs.writeFileSync(p, s);
console.log('done: saveTradeState() added at daily 9:15 reset');
