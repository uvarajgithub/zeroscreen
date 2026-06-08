const { execSync } = require('child_process');

// Paper trades around late May
const pt = execSync(`sqlite3 /root/zeroscreen/zeroscreen.db "SELECT substr(traded_at,1,10) as d, user_id, action, symbol, pnl FROM paper_trades WHERE traded_at LIKE '2026-05%' ORDER BY traded_at DESC LIMIT 30;"`, { encoding: 'utf8' });
console.log('Paper trades May:\n', pt || '(none)');

// Also check what the dashboard route reads — look at an2/analytics
// The dashboard reads from paper_reports or similar
const pr = execSync(`sqlite3 /root/zeroscreen/zeroscreen.db "PRAGMA table_info(paper_reports);"`, { encoding: 'utf8' });
console.log('\npaper_reports cols:', pr.trim());

const prData = execSync(`sqlite3 /root/zeroscreen/zeroscreen.db "SELECT * FROM paper_reports WHERE report_date LIKE '2026-05%' ORDER BY report_date DESC LIMIT 10;"`, { encoding: 'utf8' });
console.log('\npaper_reports May:\n', prData || '(none)');
