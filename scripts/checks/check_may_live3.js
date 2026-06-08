const { execSync } = require('child_process');

// Check column names in paper_trades and bot_trades
const cols1 = execSync('sqlite3 /root/zeroscreen/zeroscreen.db "PRAGMA table_info(paper_trades);"', { encoding: 'utf8' });
console.log('paper_trades cols:', cols1.trim());

const cols2 = execSync('sqlite3 /root/zeroscreen/zeroscreen.db "PRAGMA table_info(bot_trades);"', { encoding: 'utf8' });
console.log('\nbot_trades cols:', cols2.trim());

// Query bot_trades for May
try {
  const bt = execSync(`sqlite3 /root/zeroscreen/zeroscreen.db "SELECT * FROM bot_trades LIMIT 3;"`, { encoding: 'utf8' });
  console.log('\nbot_trades sample:', bt);
} catch(e) { console.log('bot_trades error:', e.message); }
