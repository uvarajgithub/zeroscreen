// patch_5k_per_pick.js — reset positions to ₹5000 capital per pick
const sqlite3 = require('/root/zeroscreen/node_modules/sqlite3');
const db = new sqlite3.Database('/root/zeroscreen/zeroscreen.db');

const PORTFOLIO = 1000000; // ₹10L total portfolio
const CAPITAL_PER_PICK = 5000;

const positions = [
    { id: 6,  symbol: 'DAMCAPITAL', avg_price: 163.51  },
    { id: 7,  symbol: 'GKSL',       avg_price: 130.37  },
    { id: 8,  symbol: 'BSE',        avg_price: 3951.71 },
    { id: 9,  symbol: 'CUMMINSIND', avg_price: 5386.80 },
];

let totalInvested = 0;
const updates = [];
for (const pos of positions) {
    const qty = Math.max(1, Math.floor(CAPITAL_PER_PICK / pos.avg_price));
    const invested = parseFloat((qty * pos.avg_price).toFixed(2));
    totalInvested += invested;
    updates.push({ ...pos, qty, invested });
    console.log(`${pos.symbol}: qty=${qty} invested=Rs${invested}`);
}
const newBalance = parseFloat((PORTFOLIO - totalInvested).toFixed(2));
console.log(`\nTotal invested: Rs${totalInvested.toFixed(0)} | Cash: Rs${newBalance.toFixed(0)}`);

db.serialize(() => {
    for (const u of updates) {
        db.run("UPDATE paper_positions SET qty=?, invested=? WHERE id=?", [u.qty, u.invested, u.id], function(err) {
            if (err) console.error(u.symbol, err);
            else console.log(`DB: ${u.symbol} qty=${u.qty} invested=Rs${u.invested}`);
        });
    }
    db.run("UPDATE paper_portfolio SET balance=? WHERE user_id=1", [newBalance], function(err) {
        if (err) console.error('balance update error:', err);
        else console.log(`DB: portfolio balance -> Rs${newBalance}`);
    });
    // Set picks_capital=5000 for all users so future picks also use Rs5K/pick
    db.run("UPDATE paper_trade_config SET picks_capital=5000, risk_pct=0", function(err) {
        if (err) console.error('config update error:', err);
        else console.log(`DB: picks_capital=5000, risk_pct=0 for all users`);
    });
    db.close(() => console.log('Done'));
});
