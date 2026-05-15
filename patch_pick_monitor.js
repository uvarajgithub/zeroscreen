// patch_pick_monitor.js — add background pick price monitor to auto-close picks at target/SL
const fs = require('fs');
const p = '/root/zeroscreen/dist/server.js';
let s = fs.readFileSync(p, 'utf8');

// Insert the monitoring function + interval just before app.listen startup
const MARKER = `        (0, scheduler_1.startScheduler)();
    });
}).catch(err => { console.error("DB init failed:", err); process.exit(1); });`;

const MONITOR_CODE = `        (0, scheduler_1.startScheduler)();

        // ── Auto-resolve picks: check target/SL every 5 min during market hours ──
        async function autoResolvePicks() {
            const now = new Date();
            const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
            const day = ist.getDay(); // 0=Sun,6=Sat
            if (day === 0 || day === 6) return; // skip weekends
            const hm = ist.getHours() * 60 + ist.getMinutes();
            if (hm < 555 || hm > 930) return; // only 9:15 AM – 3:30 PM IST
            try {
                // Get all entry_triggered picks with target or SL set
                const inPosPicks = await (0, db_1.dbAll)(
                    "SELECT id, stock_symbol, target, stop_loss, direction FROM picks WHERE result='entry_triggered' AND (target IS NOT NULL OR stop_loss IS NOT NULL)"
                );
                if (!inPosPicks.length) return;
                // Get live prices for those symbols
                const syms = [...new Set(inPosPicks.map(p => p.stock_symbol))];
                const priceRows = await (0, db_1.dbAll)(
                    \`SELECT symbol, price FROM prices WHERE symbol IN (\${syms.map(() => "?").join(",")}) AND price > 0\`,
                    syms
                );
                const priceMap = {};
                for (const r of priceRows) priceMap[r.symbol] = r.price;
                for (const pick of inPosPicks) {
                    const livePrice = priceMap[pick.stock_symbol];
                    if (!livePrice) continue;
                    const target = pick.target ? parseFloat(pick.target) : null;
                    const sl = pick.stop_loss ? parseFloat(pick.stop_loss) : null;
                    // For LONG picks: target hit if price >= target, SL hit if price <= SL
                    // For SHORT picks: target hit if price <= target, SL hit if price >= SL
                    const isShort = (pick.direction || '').toUpperCase() === 'SHORT' || (pick.direction || '').toUpperCase() === 'PE';
                    let resolved = null;
                    if (!isShort) {
                        if (target && livePrice >= target) resolved = 'target_hit';
                        else if (sl && livePrice <= sl) resolved = 'sl_hit';
                    } else {
                        if (target && livePrice <= target) resolved = 'target_hit';
                        else if (sl && livePrice >= sl) resolved = 'sl_hit';
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
        autoResolvePicks(); // run immediately on startup
    });
}).catch(err => { console.error("DB init failed:", err); process.exit(1); });`;

if (!s.includes(MARKER)) { console.error('ERROR: marker not found'); process.exit(1); }
s = s.replace(MARKER, MONITOR_CODE);
console.log('Step 1: pick monitor interval added');

// Also ensure updatePickResult is exported from db_1 (it should be, verify)
const hasUpdatePickResult = s.includes('updatePickResult');
console.log('updatePickResult present in compiled file:', hasUpdatePickResult);

fs.writeFileSync(p, s);
console.log('Done: pick auto-resolution background job added');
