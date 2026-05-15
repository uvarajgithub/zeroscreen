// patch_qty_fix.js — update qty for risk-sized positions, fitting within ₹1L portfolio
const sqlite3 = require('/root/zeroscreen/node_modules/sqlite3');
const db = new sqlite3.Database('/root/zeroscreen/zeroscreen.db');

// Risk-based qty (₹1,00,000 portfolio, 1% risk = ₹1,000/trade)
// CUMMINSIND skipped — would need ₹48,481 alone, too large for remaining budget
const updates = [
    { id: 7,  symbol: 'GKSL',       qty: 148, avg_price: 130.37 },  // invested: 19,295
    { id: 6,  symbol: 'DAMCAPITAL', qty: 151, avg_price: 163.51 },  // invested: 24,690
    { id: 8,  symbol: 'BSE',        qty: 8,   avg_price: 3951.71 }, // invested: 31,614
];

db.serialize(() => {
    db.all("SELECT id, symbol, qty, avg_price, invested FROM paper_positions ORDER BY id", (err, rows) => {
        if (err) return console.error(err);
        console.log('Before:'); rows.forEach(r => console.log(r));
    });

    for (const u of updates) {
        const newInvested = parseFloat((u.qty * u.avg_price).toFixed(2));
        const oldInvested = parseFloat((1 * u.avg_price).toFixed(2));
        const delta = newInvested - oldInvested;
        db.run("UPDATE paper_positions SET qty=?, invested=? WHERE id=?", [u.qty, newInvested, u.id], function(err) {
            if (err) console.error(u.symbol, err);
            else console.log(`${u.symbol}: qty 1->${u.qty}, invested Rs${oldInvested}->Rs${newInvested}`);
        });
        db.run("UPDATE paper_portfolio SET balance = balance - ? WHERE user_id = 1", [delta], function(err) {
            if (err) console.error('balance update error:', err);
        });
    }

    db.get("SELECT balance FROM paper_portfolio WHERE user_id=1", (err, row) => {
        if (err) return console.error(err);
        console.log('New balance: Rs' + (row?.balance || 0).toFixed(2));
    });

    db.close(() => console.log('Done'));
});
