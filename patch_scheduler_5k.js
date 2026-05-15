// patch_scheduler_5k.js — update scheduler: picks_capital first, risk_pct as fallback
const fs = require('fs');
const p = '/root/zeroscreen/dist/scheduler.js';
let s = fs.readFileSync(p, 'utf8');

// Use index-based approach to avoid multi-byte char issues
{
    const ANCHOR = 'const userCfg = await (0, db_1.getPaperTradeConfig)(user.id);';
    const idx = s.indexOf(ANCHOR);
    if (idx < 0) { console.error('config anchor not found'); process.exit(1); }
    const blockStart = s.lastIndexOf('// Load user config', idx);
    // Find end: the line "const totalPortfolio = Math.max..."
    const totalEnd = s.indexOf('\n        for (const pick of picks)', blockStart);
    if (totalEnd < 0) { console.error('block end not found'); process.exit(1); }
    const NEW_CFG = `        // Load user config + portfolio balance for position sizing
        const userCfg = await (0, db_1.getPaperTradeConfig)(user.id);
        const picksCapital = userCfg.picks_capital || 0;  // fixed Rs per pick (e.g. 5000)
        const riskPct = userCfg.risk_pct || 0;            // % of portfolio fallback
        const portRow = await (0, db_1.getPaperPortfolio)(user.id);
        const cashBalance = portRow?.balance ?? 1000000;
        // Fetch all open positions for this user once per user (avoid per-pick DB calls)
        const openPositions = await (0, db_1.getPaperPositions)(user.id);
        const openSymbols = new Set(openPositions.map((p) => p.symbol.toUpperCase()));
        // Total portfolio = cash + invested; used for risk_pct fallback
        const invested = openPositions.reduce((sum, pos) => sum + (pos.invested || 0), 0);
        const totalPortfolio = Math.max(cashBalance + invested, 1000000);`;
    s = s.substring(0, blockStart) + NEW_CFG + s.substring(totalEnd);
}

// Now replace the qty sizing block (use index approach to avoid multi-byte chars)
const QTY_MARKER = '// Risk-based position sizing: qty = (portfolio * risk%) / (entry - SL)';
const qtyIdx = s.indexOf(QTY_MARKER);
if (qtyIdx < 0) { console.error('qty marker not found'); process.exit(1); }
const qtyEnd = s.indexOf('\n            }', qtyIdx) + '\n            }'.length;

const NEW_QTY = `// Position sizing: picks_capital (fixed Rs/pick) → risk_pct (% of portfolio) → default_qty
            let qty = userCfg.default_qty || 1;
            if (picksCapital > 0 && livePrice > 0) {
                // Fixed capital per pick: qty = floor(capital / price)
                qty = Math.max(1, Math.floor(picksCapital / livePrice));
                console.log(\`[AutoPaper] \${pick.stock_symbol} capital=\${picksCapital} price=\${livePrice} -> qty=\${qty}\`);
            } else if (riskPct > 0 && livePrice > 0 && pick.stop_loss) {
                const entryPrice = livePrice;
                const sl = parseFloat(pick.stop_loss);
                const riskPerShare = Math.abs(entryPrice - sl);
                if (riskPerShare > 0) {
                    const riskAmount = totalPortfolio * (riskPct / 100);
                    const riskQty = Math.floor(riskAmount / riskPerShare);
                    const cashQty = cashBalance > 0 ? Math.floor(cashBalance / entryPrice) : 0;
                    qty = Math.max(1, Math.min(riskQty, cashQty));
                    console.log(\`[AutoPaper] \${pick.stock_symbol} riskPct=\${riskPct}% riskQty=\${riskQty} cashQty=\${cashQty} -> qty=\${qty}\`);
                }
            }`;

s = s.substring(0, qtyIdx) + NEW_QTY + s.substring(qtyEnd);

fs.writeFileSync(p, s);
console.log('scheduler.js patched — picks_capital=5000 sizing active');
