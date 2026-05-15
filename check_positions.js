// check_positions.js
const db = require('/root/zeroscreen/dist/db');
async function main() {
    const pos = await db.dbAll('SELECT user_id, symbol, qty, avg_price, invested FROM paper_positions ORDER BY user_id, symbol');
    console.log('Open positions:');
    pos.forEach(p => console.log(`  user:${p.user_id} ${p.symbol} qty=${p.qty} avg=₹${p.avg_price} invested=₹${p.invested}`));

    // Also check picks_capital setting for each user
    const cfgs = await db.dbAll('SELECT user_id, default_qty, picks_capital FROM paper_trade_config');
    console.log('\nUser config:');
    cfgs.forEach(c => console.log(`  user:${c.user_id} default_qty=${c.default_qty} picks_capital=₹${c.picks_capital || 0}`));
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
