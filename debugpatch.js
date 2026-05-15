// Debug patch - better error logging in TICK_ERROR catch block
var fs = require('fs');
var f = '/home/ubuntu/trading-bot/dist/src/amina-live.js';
var c = fs.readFileSync(f, 'utf8');
var lines = c.split('\n');

// Find the TICK_ERROR line
var idx = -1;
for (var i = 0; i < lines.length; i++) {
  if (lines[i].indexOf('TICK_ERROR') !== -1) {
    idx = i;
    console.log('Found at line ' + (i+1) + ': ' + lines[i]);
  }
}

if (idx < 0) {
  console.log('TICK_ERROR not found!');
  process.exit(1);
}

// Replace with better logging
var oldLine = lines[idx];
var newLine = '        log("TICK_ERROR", { error: e instanceof Error ? e.message : (e && e.message ? e.message : JSON.stringify(e) ), errtype: e && e.error_type, errstatus: e && e.status });';
lines[idx] = newLine;
console.log('Replaced with: ' + newLine);
fs.writeFileSync(f, lines.join('\n'));
console.log('Patched successfully');
