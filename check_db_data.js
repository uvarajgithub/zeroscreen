// Check what BNF/price data we have in DB
const s = require('/root/zeroscreen/node_modules/sqlite3').verbose();
const db = new s.Database('/root/zeroscreen/zeroscreen.db');

db.all("SELECT name FROM sqlite_master WHERE type='table'", (e, tables) => {
    console.log('Tables:', tables.map(x => x.name).join(', '));
    
    // Check prices table
    db.get("SELECT COUNT(*) as c, MIN(updated_at) as oldest, MAX(updated_at) as newest FROM prices", (e, r) => {
        console.log('prices table:', JSON.stringify(r));
        
        // Check for any candle/historical tables
        db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%candle%' OR name LIKE '%hist%' OR name LIKE '%ohlc%' OR name LIKE '%bnf%'", (e, r2) => {
            console.log('Candle/hist tables:', JSON.stringify(r2));
            db.close();
        });
    });
});
