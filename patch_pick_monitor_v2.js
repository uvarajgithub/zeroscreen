// patch_pick_monitor_v2.js — replace pick monitor with full flow using index-based replacement
const fs = require('fs');
const p = '/root/zeroscreen/dist/server.js';
let s = fs.readFileSync(p, 'utf8');

// Find by unique substrings
const START_MARKER = 'async function autoResolvePicks()';
const END_MARKER = 'autoResolvePicks(); // run immediately on startup';

const startIdx = s.indexOf(START_MARKER);
if (startIdx < 0) { console.error('ERROR: start marker not found'); process.exit(1); }
// Go back to the newline before the comment line
const commentStart = s.lastIndexOf('\n', startIdx - 2) + 1; // start of the comment line

const endIdx = s.indexOf(END_MARKER);
if (endIdx < 0) { console.error('ERROR: end marker not found'); process.exit(1); }
const afterEnd = endIdx + END_MARKER.length;

console.log('Found monitor at chars', commentStart, '-', afterEnd);

const NEW_FUNC = `        // Auto pick flow: entry trigger + target/SL exit, runs every 5 min during market hours
        async function autoResolvePicks() {
            const now = new Date();
            const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
            const day = ist.getDay(); // 0=Sun, 6=Sat
            if (day === 0 || day === 6) return; // skip weekends
            const hm = ist.getHours() * 60 + ist.getMinutes();
            if (hm < 555 || hm > 930) return; // only 9:15 AM - 3:30 PM IST
            try {
                // Fetch all active + entry_triggered picks
                const allPicks = await (0, db_1.dbAll)(
                    "SELECT id, stock_symbol, direction, entry_low, entry_high, target, stop_loss, result FROM picks WHERE status='active' AND (result IS NULL OR result='entry_triggered')"
                );
                if (!allPicks.length) return;

                // Get live prices for all symbols
                const syms = [...new Set(allPicks.map(pk => pk.stock_symbol))];
                const priceRows = await (0, db_1.dbAll)(
                    \`SELECT symbol, price FROM prices WHERE symbol IN (\${syms.map(() => "?").join(",")}) AND price > 0\`,
                    syms
                );
                const priceMap = {};
                for (const r of priceRows) priceMap[r.symbol] = r.price;

                for (const pick of allPicks) {
                    const livePrice = priceMap[pick.stock_symbol];
                    if (!livePrice) continue;
                    const isShort = (pick.direction || '').toUpperCase() === 'SHORT' || (pick.direction || '').toUpperCase() === 'PE';

                    // STEP 1: Active but not triggered - check if price entered the entry zone
                    if (!pick.result) {
                        const lo = pick.entry_low  ? parseFloat(pick.entry_low)  : null;
                        const hi = pick.entry_high ? parseFloat(pick.entry_high) : null;
                        let inZone = false;
                        if (lo && hi)  inZone = livePrice >= lo && livePrice <= hi;
                        else if (lo)   inZone = livePrice <= lo * 1.01; // within 1% above low
                        else if (hi)   inZone = livePrice <= hi;
                        if (inZone) {
                            await (0, db_1.updatePickEntry)(pick.id, livePrice);
                            console.log(\`[PICK-MONITOR] \${pick.stock_symbol} ENTRY_TRIGGERED @ \${livePrice} (id:\${pick.id})\`);
                        }
                        continue; // don't check exit until in position
                    }

                    // STEP 2: In position - check target / SL
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
                        await (0, db_1.updatePickResult)(pick.id, resolved, livePrice);
                        console.log(\`[PICK-MONITOR] \${pick.stock_symbol} \${resolved} @ \${livePrice} (id:\${pick.id})\`);
                    }
                }
            } catch (e) {
                console.error("[PICK-MONITOR] error:", e.message);
            }
        }
        setInterval(autoResolvePicks, 5 * 60 * 1000); // every 5 minutes
        autoResolvePicks(); // run once immediately on startup`;

s = s.substring(0, commentStart) + NEW_FUNC + s.substring(afterEnd);
fs.writeFileSync(p, s);
console.log('Done: full pick flow installed');
