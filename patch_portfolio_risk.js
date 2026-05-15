// patch_portfolio_risk.js — fix scheduler to use total portfolio value for risk sizing
const fs = require('fs');
const p = '/root/zeroscreen/dist/scheduler.js';
let s = fs.readFileSync(p, 'utf8');

// Fix 1: rename portBalance -> cashBalance and compute totalPortfolio after openPositions
const OLD1 = `        const portBalance = portRow?.balance ?? 100000;
        // Fetch all open positions for this user once per user (avoid per-pick DB calls)
        const openPositions = await (0, db_1.getPaperPositions)(user.id);
        const openSymbols = new Set(openPositions.map((p) => p.symbol.toUpperCase()));`;
const NEW1 = `        const cashBalance = portRow?.balance ?? 100000;
        // Fetch all open positions for this user once per user (avoid per-pick DB calls)
        const openPositions = await (0, db_1.getPaperPositions)(user.id);
        const openSymbols = new Set(openPositions.map((p) => p.symbol.toUpperCase()));
        // Total portfolio = cash + invested; risk base = max(total, ₹1L starting capital)
        const invested = openPositions.reduce((sum, pos) => sum + (pos.invested || 0), 0);
        const totalPortfolio = Math.max(cashBalance + invested, 100000);`;
if (!s.includes(OLD1)) { console.error('patch1 not found'); process.exit(1); }
s = s.replace(OLD1, NEW1);

// Fix 2: use index-based replacement for the riskAmount block (avoids multi-byte char issues)
{
    const MARKER = 'const riskAmount = portBalance * (riskPct / 100);';
    const idx = s.indexOf(MARKER);
    if (idx < 0) { console.error('patch2 marker not found'); process.exit(1); }
    // Find enclosing `if (riskPerShare > 0) {` block end
    const blockStart = s.lastIndexOf('if (riskPerShare > 0) {', idx);
    const blockEnd = s.indexOf('\n                }', idx) + '\n                }'.length;
    const newBlock = `if (riskPerShare > 0) {
                    const riskAmount = totalPortfolio * (riskPct / 100);
                    const riskQty = Math.floor(riskAmount / riskPerShare);
                    // Cap qty to what available cash can actually buy (never go negative)
                    const cashQty = cashBalance > 0 ? Math.floor(cashBalance / entryPrice) : 0;
                    qty = Math.max(1, Math.min(riskQty, cashQty));
                    console.log(\`[AutoPaper] \${pick.stock_symbol} total=\${totalPortfolio.toFixed(0)} risk=\${riskAmount.toFixed(0)} riskQty=\${riskQty} cashQty=\${cashQty} -> qty=\${qty}\`);
                }`;
    s = s.substring(0, blockStart) + newBlock + s.substring(blockEnd);
}

fs.writeFileSync(p, s);
console.log('scheduler.js patched — risk now uses total portfolio, capped by available cash');
