const { execSync } = require('child_process');

// Get picks schema
const picksCols = execSync(`sqlite3 /root/zeroscreen/zeroscreen.db "PRAGMA table_info(picks);"`, { encoding: 'utf8' });
console.log('picks cols:', picksCols.trim());

// Get bot_trades schema
const btCols = execSync(`sqlite3 /root/zeroscreen/zeroscreen.db "PRAGMA table_info(bot_trades);"`, { encoding: 'utf8' });
console.log('bot_trades cols:', btCols.trim());

// Check bot_trades for all dates
const all = execSync(`sqlite3 /root/zeroscreen/zeroscreen.db "SELECT trade_date, direction, pnl, exit_reason FROM bot_trades ORDER BY trade_date DESC LIMIT 20;"`, { encoding: 'utf8' });
console.log('\nAll recent bot_trades:\n', all || '(none)');
