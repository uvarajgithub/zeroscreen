const s = require('/root/zeroscreen/node_modules/sqlite3').verbose();
const db = new s.Database('/root/zeroscreen/zeroscreen.db');
db.all(`SELECT trade_date, direction, entry_price, exit_price, pnl, exit_reason, symbol 
        FROM bot_trades 
        ORDER BY trade_date DESC LIMIT 60`, (e, rows) => {
    if (e) { console.error(e); db.close(); return; }
    console.log(JSON.stringify(rows, null, 2));
    db.close();
});
