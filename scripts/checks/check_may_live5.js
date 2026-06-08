const { execSync } = require('child_process');

// Check picks for May 26/27
const picks = execSync(`sqlite3 /root/zeroscreen/zeroscreen.db "SELECT date, symbol, direction, result, pnl FROM picks WHERE date LIKE '2026-05-2%' ORDER BY date LIMIT 30;"`, { encoding: 'utf8' });
console.log('Picks May 20+:\n', picks || '(none)');

// Check paper_trades for May 26/27
const pt = execSync(`sqlite3 /root/zeroscreen/zeroscreen.db "SELECT substr(traded_at,1,10) as d, action, symbol, pnl FROM paper_trades WHERE traded_at LIKE '2026-05-2%' ORDER BY traded_at LIMIT 20;"`, { encoding: 'utf8' });
console.log('\nPaper trades May 20+:\n', pt || '(none)');

// Check bot_state for any reference to those dates
const bs = execSync(`sqlite3 /root/zeroscreen/zeroscreen.db "SELECT * FROM bot_state LIMIT 5;"`, { encoding: 'utf8' });
console.log('\nBot state sample:\n', bs);
