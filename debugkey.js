// Debug script to print what config values are being used in amina-live.js
var fs = require('fs');
var f = '/home/ubuntu/trading-bot/dist/src/amina-live.js';
var c = fs.readFileSync(f, 'utf8');
var lines = c.split('\n');

// Find line 28-29 (kite init)
for (var i = 25; i < 35; i++) {
  console.log('line ' + (i+1) + ': ' + lines[i]);
}

// Add debug log after line 29 (kite.setAccessToken)
var targetLine = null;
for (var i = 0; i < lines.length; i++) {
  if (lines[i].indexOf('kite.setAccessToken') !== -1) {
    targetLine = i;
    console.log('Found setAccessToken at line ' + (i+1));
    break;
  }
}

if (targetLine !== null) {
  var debugLine = 'console.log("[DEBUG] apiKey="+config_1.config.apiKey+" accessToken="+config_1.config.accessToken);';
  lines.splice(targetLine + 1, 0, debugLine);
  fs.writeFileSync(f, lines.join('\n'));
  console.log('Debug line inserted after line ' + (targetLine+1));
}
