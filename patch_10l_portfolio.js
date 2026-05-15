// patch_10l_portfolio.js — reset portfolio to ₹10L and recalculate open positions with risk-based sizing
const sqlite3 = require('/root/zeroscreen/node_modules/sqlite3');
const db = new sqlite3.Database('/root/zeroscreen/zeroscreen.db');

const PORTFOLIO = 1000000; // ₹10 lakhs
const RISK_PCT = 1.0;      // 1% risk per trade
const riskAmount = PORTFOLIO * (RISK_PCT / 100); // ₹10,000 per trade

// Open positions with entry_price and SL (from paper_positions)
// Order by id (entry order) for sequential cash allocation
const positions = [
    { id: 6,  symbol: 'DAMCAPITAL', avg_price: 163.51,  sl_price: 156.90  },
    { id: 7,  symbol: 'GKSL',       avg_price: 130.37,  sl_price: 123.63  },
    { id: 8,  symbol: 'BSE',        avg_price: 3951.71, sl_price: 3837.85 },
    { id: 9,  symbol: 'CUMMINSIND', avg_price: 5386.80, sl_price: 5280.28 },
];

let cash = PORTFOLIO;
const updates = [];

for (const pos of positions) {
    const riskPerShare = Math.abs(pos.avg_price - pos.sl_price);
    const riskQty = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 1;
    const cashQty = cash > 0 ? Math.floor(cash / pos.avg_price) : 0;
    const qty = Math.max(1, Math.min(riskQty, cashQty));
    const invested = parseFloat((qty * pos.avg_price).toFixed(2));
    cash -= invested;
    updates.push({ ...pos, qty, invested, riskPerShare: riskPerShare.toFixed(2), riskQty, cashQty });
    console.log(`${pos.symbol}: risk/share=₹${riskPerShare.toFixed(2)} riskQty=${riskQty} cashQty=${cashQty} -> qty=${qty} invested=₹${invested.toFixed(0)} cash_left=₹${cash.toFixed(0)}`);
}

const finalCash = parseFloat(cash.toFixed(2));
console.log(`\nTotal invested: ₹${(PORTFOLIO - finalCash).toFixed(0)}`);
console.log(`Final cash balance: ₹${finalCash.toFixed(0)}`);

db.serialize(() => {
    for (const u of updates) {
        db.run("UPDATE paper_positions SET qty=?, invested=? WHERE id=?", [u.qty, u.invested, u.id], function(err) {
            if (err) console.error(u.symbol, err);
            else console.log(`DB: ${u.symbol} qty=${u.qty} invested=₹${u.invested}`);
        });
    }
    db.run("UPDATE paper_portfolio SET balance=? WHERE user_id=1", [finalCash], function(err) {
        if (err) console.error('balance update error:', err);
        else console.log(`DB: portfolio balance set to ₹${finalCash}`);
    });
    db.close(() => console.log('Done'));
});
