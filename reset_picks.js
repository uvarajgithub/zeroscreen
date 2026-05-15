// reset_picks.js — 
// 1. Show all picks with result set
// 2. Clear entry_triggered picks back to null
// 3. Run the pick monitor right now (force, ignoring market hours) for all active picks
const db = require('/root/zeroscreen/dist/db');

async function main() {
    // Show current state
    const allWithResult = await db.dbAll("SELECT id, stock_symbol, result, status FROM picks WHERE result IS NOT NULL AND result != '' ORDER BY id DESC");
    console.log('\n=== Picks with result set ===');
    allWithResult.forEach(r => console.log(`  id:${r.id} ${r.stock_symbol} -> ${r.result} (${r.status})`));

    // Clear all entry_triggered picks back to NULL (reset to pending)
    const inPos = allWithResult.filter(r => r.result === 'entry_triggered');
    console.log(`\nClearing ${inPos.length} entry_triggered picks...`);
    for (const r of inPos) {
        await db.dbRun("UPDATE picks SET result=NULL, entry_price=NULL, entry_at=NULL WHERE id=?", [r.id]);
        console.log(`  Cleared ${r.stock_symbol} (id:${r.id})`);
    }

    // Now run the full pick monitor against ALL active picks (force, ignore market hours)
    const activePicks = await db.dbAll(
        "SELECT id, stock_symbol, direction, entry_low, entry_high, target, stop_loss, result FROM picks WHERE status='active' AND (result IS NULL OR result='entry_triggered')"
    );
    console.log(`\n=== Running pick monitor on ${activePicks.length} active picks ===`);

    const syms = [...new Set(activePicks.map(p => p.stock_symbol))];
    const priceRows = syms.length ? await db.dbAll(
        `SELECT symbol, price FROM prices WHERE symbol IN (${syms.map(() => '?').join(',')}) AND price > 0`,
        syms
    ) : [];
    const priceMap = {};
    for (const r of priceRows) priceMap[r.symbol] = r.price;

    for (const pick of activePicks) {
        const livePrice = priceMap[pick.stock_symbol];
        if (!livePrice) { console.log(`  ${pick.stock_symbol}: no live price`); continue; }

        const isShort = (pick.direction || '').toUpperCase() === 'SHORT' || (pick.direction || '').toUpperCase() === 'PE';

        // Step 1: pending -> check entry zone
        if (!pick.result) {
            const lo = pick.entry_low  ? parseFloat(pick.entry_low)  : null;
            const hi = pick.entry_high ? parseFloat(pick.entry_high) : null;
            let inZone = false;
            if (lo && hi) inZone = livePrice >= lo && livePrice <= hi;
            else if (lo)  inZone = livePrice <= lo * 1.01;
            else if (hi)  inZone = livePrice <= hi;

            if (inZone) {
                await db.updatePickEntry(pick.id, livePrice);
                console.log(`  ${pick.stock_symbol}: ENTRY_TRIGGERED @ ${livePrice} [zone: ${lo}-${hi}]`);
            } else {
                console.log(`  ${pick.stock_symbol}: pending, price=${livePrice} zone=[${lo}-${hi}] -> not in zone`);
            }
            continue;
        }

        // Step 2: in position -> check target/SL
        const target = pick.target    ? parseFloat(pick.target)    : null;
        const sl     = pick.stop_loss ? parseFloat(pick.stop_loss) : null;
        let resolved = null;
        if (!isShort) {
            if (target && livePrice >= target) resolved = 'target_hit';
            else if (sl && livePrice <= sl)    resolved = 'sl_hit';
        } else {
            if (target && livePrice <= target) resolved = 'target_hit';
            else if (sl && livePrice >= sl)    resolved = 'sl_hit';
        }
        if (resolved) {
            await db.updatePickResult(pick.id, resolved, livePrice);
            console.log(`  ${pick.stock_symbol}: ${resolved} @ ${livePrice}`);
        } else {
            console.log(`  ${pick.stock_symbol}: in-pos, price=${livePrice} tgt=${target} sl=${sl} -> holding`);
        }
    }

    console.log('\nDone.');
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
