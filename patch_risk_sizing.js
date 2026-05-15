// patch_risk_sizing.js — replace capital-per-pick with risk-based position sizing
const fs = require('fs');

// ══════════════════════════════════════════
// 1. db.js — add risk_pct alongside picks_capital
// ══════════════════════════════════════════
{
    const p = '/root/zeroscreen/dist/db.js';
    let s = fs.readFileSync(p, 'utf8');

    // 1a. Migration — add risk_pct column
    const M_OLD = `            db.run("ALTER TABLE paper_trade_config ADD COLUMN picks_capital REAL NOT NULL DEFAULT 0", () => { });`;
    const M_NEW = `            db.run("ALTER TABLE paper_trade_config ADD COLUMN picks_capital REAL NOT NULL DEFAULT 0", () => { });
            db.run("ALTER TABLE paper_trade_config ADD COLUMN risk_pct REAL NOT NULL DEFAULT 1.0", () => { });`;
    if (!s.includes(M_OLD)) { console.error('db.js: migration marker not found'); process.exit(1); }
    s = s.replace(M_OLD, M_NEW);

    // 1b. Default object — add risk_pct
    s = s.replace(
        `picks_capital: 0 };`,
        `picks_capital: 0, risk_pct: 1.0 };`
    );

    // 1c. INSERT OR IGNORE — add risk_pct (index-based to avoid backtick issues)
    {
        const OLD = '(user_id,trade_type,default_qty,default_sl_pct,default_tgt_pct,max_positions,auto_paper_mode,auto_paper_stocks,picks_capital) VALUES (?,?,?,?,?,?,?,?,?)";';
        const idx = s.indexOf('INSERT OR IGNORE INTO paper_trade_config');
        if (idx < 0) { console.error('db.js: INSERT OR IGNORE not found'); process.exit(1); }
        const closeIdx = s.indexOf(']);', idx);
        const origBlock = s.substring(idx, closeIdx + 3);
        const newBlock = origBlock
            .replace('picks_capital) VALUES (?,?,?,?,?,?,?,?,?)', 'picks_capital,risk_pct) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .replace('def.picks_capital])', 'def.picks_capital, def.risk_pct])');
        s = s.substring(0, idx) + newBlock + s.substring(idx + origBlock.length);
    }

    // 1d. row defaults
    s = s.replace(
        `    row.picks_capital = row.picks_capital || 0;`,
        `    row.picks_capital = row.picks_capital || 0;\n    row.risk_pct = row.risk_pct || 1.0;`
    );

    // 1e. INSERT OR REPLACE — use index approach for the multiline one
    const saveIdx = s.indexOf('INSERT OR REPLACE INTO paper_trade_config (user_id,trade_type,default_qty');
    if (saveIdx < 0) { console.error('db.js: INSERT OR REPLACE not found'); process.exit(1); }
    const closeIdx = s.indexOf(']);', saveIdx);
    const newBlock = `INSERT OR REPLACE INTO paper_trade_config (user_id,trade_type,default_qty,default_sl_pct,default_tgt_pct,max_positions,auto_paper_mode,auto_paper_stocks,picks_capital,risk_pct,updated_at)\n     VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))\`, [userId, m.trade_type, m.default_qty, m.default_sl_pct, m.default_tgt_pct, m.max_positions, m.auto_paper_mode ?? 'picks', m.auto_paper_stocks ?? '[]', m.picks_capital ?? 0, m.risk_pct ?? 1.0]);`;
    s = s.substring(0, saveIdx) + newBlock + s.substring(closeIdx + 3);

    fs.writeFileSync(p, s);
    console.log('db.js patched');
}

// ══════════════════════════════════════════
// 2. server.js — replace capital UI field with risk_pct field
// ══════════════════════════════════════════
{
    const p = '/root/zeroscreen/dist/server.js';
    let s = fs.readFileSync(p, 'utf8');

    // 2a. Replace config form field
    const UI_OLD = `      <div class="cfg-row">
        <label class="cfg-label">Capital per Pick <span style="font-size:.75rem;font-weight:400;color:var(--text-muted)">(auto-size qty = capital ÷ price, 0 = use default qty)</span></label>
        <input class="cfg-input" type="number" name="picks_capital" min="0" max="500000" step="100" value="\${cfg.picks_capital || 0}" placeholder="e.g. 5000">
      </div>`;
    const UI_NEW = `      <div class="cfg-row">
        <label class="cfg-label">Risk % per Trade <span style="font-size:.75rem;font-weight:400;color:var(--text-muted)">(qty = portfolio × risk% ÷ risk/share · 0 = use default qty)</span></label>
        <div style="display:flex;align-items:center;gap:8px">
          <input class="cfg-input" type="number" name="risk_pct" min="0" max="10" step="0.1" value="\${cfg.risk_pct || 1.0}" style="width:90px">
          <span style="color:var(--text-muted);font-size:.82rem">% of portfolio per trade (recommended: 0.5–2%)</span>
        </div>
      </div>`;
    if (!s.includes(UI_OLD)) { console.error('server.js: UI marker not found'); process.exit(1); }
    s = s.replace(UI_OLD, UI_NEW);

    // 2b. Replace save handler
    const SAVE_OLD = `    const picks_capital = Math.max(0, Math.min(500000, parseFloat(req.body.picks_capital) || 0));
    await (0, db_1.savePaperTradeConfig)(userId, { trade_type, default_qty, default_sl_pct, default_tgt_pct, max_positions, picks_capital });`;
    const SAVE_NEW = `    const risk_pct = Math.max(0, Math.min(10, parseFloat(req.body.risk_pct) || 0));
    await (0, db_1.savePaperTradeConfig)(userId, { trade_type, default_qty, default_sl_pct, default_tgt_pct, max_positions, risk_pct });`;
    if (!s.includes(SAVE_OLD)) { console.error('server.js: save handler marker not found'); process.exit(1); }
    s = s.replace(SAVE_OLD, SAVE_NEW);

    fs.writeFileSync(p, s);
    console.log('server.js patched');
}

// ══════════════════════════════════════════
// 3. scheduler.js — risk-based qty formula
// ══════════════════════════════════════════
{
    const p = '/root/zeroscreen/dist/scheduler.js';
    let s = fs.readFileSync(p, 'utf8');

    // 3a. Replace user config loading + picksCapital
    const CFG_OLD = `        // Load user paper trade config for capital-per-pick sizing
        const userCfg = await (0, db_1.getPaperTradeConfig)(user.id);
        const picksCapital = (userCfg.picks_capital || 0);`;
    const CFG_NEW = `        // Load user config + portfolio balance for risk-based position sizing
        const userCfg = await (0, db_1.getPaperTradeConfig)(user.id);
        const riskPct = userCfg.risk_pct || 0;
        const portRow = await (0, db_1.getPaperPortfolio)(user.id);
        const portBalance = portRow?.balance ?? 100000;`;
    if (!s.includes(CFG_OLD)) { console.error('scheduler.js: cfg marker not found'); process.exit(1); }
    s = s.replace(CFG_OLD, CFG_NEW);

    // 3b. Replace qty calculation
    const QTY_OLD = `            const priceRow = await (0, db_1.dbAll)("SELECT price FROM prices WHERE symbol = ?", [pick.stock_symbol]);
            const livePrice = priceRow[0]?.price ?? 0;
            // Capital-based qty: floor(capital / price), fallback to default_qty
            const qty = picksCapital > 0 && livePrice > 0
                ? Math.max(1, Math.floor(picksCapital / livePrice))
                : (userCfg.default_qty || 1);`;
    const QTY_NEW = `            const priceRow = await (0, db_1.dbAll)("SELECT price FROM prices WHERE symbol = ?", [pick.stock_symbol]);
            const livePrice = priceRow[0]?.price ?? 0;
            // Risk-based position sizing: qty = (portfolio * risk%) / (entry - SL)
            let qty = userCfg.default_qty || 1;
            if (riskPct > 0 && livePrice > 0 && pick.stop_loss) {
                const entryPrice = livePrice > 0 ? livePrice : parseFloat(((pick.entry_low + pick.entry_high) / 2).toFixed(2));
                const sl = parseFloat(pick.stop_loss);
                const riskPerShare = Math.abs(entryPrice - sl);
                if (riskPerShare > 0) {
                    const riskAmount = portBalance * (riskPct / 100);
                    qty = Math.max(1, Math.floor(riskAmount / riskPerShare));
                    console.log(\`[AutoPaper] \${pick.stock_symbol} risk=₹\${riskAmount.toFixed(0)} riskPerShare=₹\${riskPerShare.toFixed(2)} qty=\${qty}\`);
                }
            }`;
    if (!s.includes(QTY_OLD)) { console.error('scheduler.js: qty marker not found'); process.exit(1); }
    s = s.replace(QTY_OLD, QTY_NEW);

    fs.writeFileSync(p, s);
    console.log('scheduler.js patched');
}

console.log('\nAll patches applied successfully');
