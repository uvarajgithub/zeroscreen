// patch_picks_capital.js — add "Capital per Pick" setting across db.js, server.js, scheduler.js
const fs = require('fs');

// ════════════════════════════════════════════════════════════
// 1. PATCH db.js — migration + getPaperTradeConfig + savePaperTradeConfig
// ════════════════════════════════════════════════════════════
{
  const p = '/root/zeroscreen/dist/db.js';
  let s = fs.readFileSync(p, 'utf8');

  // 1a. Add migration to create column
  const M_OLD = `            db.run("ALTER TABLE paper_trade_config ADD COLUMN auto_paper_stocks TEXT NOT NULL DEFAULT '[]'", () => { });
            // Telegram chat ID`;
  const M_NEW = `            db.run("ALTER TABLE paper_trade_config ADD COLUMN auto_paper_stocks TEXT NOT NULL DEFAULT '[]'", () => { });
            // Capital per pick for auto-trade sizing
            db.run("ALTER TABLE paper_trade_config ADD COLUMN picks_capital REAL NOT NULL DEFAULT 0", () => { });
            // Telegram chat ID`;
  if (!s.includes(M_OLD)) { console.error('db.js: migration marker not found'); process.exit(1); }
  s = s.replace(M_OLD, M_NEW);

  // 1b. getPaperTradeConfig — add picks_capital to default + INSERT
  const G_OLD = `        const def = { user_id: userId, trade_type: 'INTRADAY', default_qty: 1, default_sl_pct: 2.0, default_tgt_pct: 4.0, max_positions: 10, auto_paper_mode: 'picks', auto_paper_stocks: '[]' };
        await dbRun("INSERT OR IGNORE INTO paper_trade_config (user_id,trade_type,default_qty,default_sl_pct,default_tgt_pct,max_positions,auto_paper_mode,auto_paper_stocks) VALUES (?,?,?,?,?,?,?,?)", [userId, def.trade_type, def.default_qty, def.default_sl_pct, def.default_tgt_pct, def.max_positions, def.auto_paper_mode, def.auto_paper_stocks]);
        return def;
    }
    row.auto_paper_mode = row.auto_paper_mode || 'picks';
    row.auto_paper_stocks = row.auto_paper_stocks || '[]';
    return row;`;
  const G_NEW = `        const def = { user_id: userId, trade_type: 'INTRADAY', default_qty: 1, default_sl_pct: 2.0, default_tgt_pct: 4.0, max_positions: 10, auto_paper_mode: 'picks', auto_paper_stocks: '[]', picks_capital: 0 };
        await dbRun("INSERT OR IGNORE INTO paper_trade_config (user_id,trade_type,default_qty,default_sl_pct,default_tgt_pct,max_positions,auto_paper_mode,auto_paper_stocks,picks_capital) VALUES (?,?,?,?,?,?,?,?,?)", [userId, def.trade_type, def.default_qty, def.default_sl_pct, def.default_tgt_pct, def.max_positions, def.auto_paper_mode, def.auto_paper_stocks, def.picks_capital]);
        return def;
    }
    row.auto_paper_mode = row.auto_paper_mode || 'picks';
    row.auto_paper_stocks = row.auto_paper_stocks || '[]';
    row.picks_capital = row.picks_capital || 0;
    return row;`;
  if (!s.includes(G_OLD)) { console.error('db.js: getPaperTradeConfig marker not found'); process.exit(1); }
  s = s.replace(G_OLD, G_NEW);

  // 1c. savePaperTradeConfig — add picks_capital to INSERT OR REPLACE (handle \r\n in file)
  const saveIdx = s.indexOf("async function savePaperTradeConfig(");
  if (saveIdx < 0) { console.error('db.js: savePaperTradeConfig function not found'); process.exit(1); }
  const insertIdx = s.indexOf('INSERT OR REPLACE INTO paper_trade_config', saveIdx);
  if (insertIdx < 0) { console.error('db.js: INSERT OR REPLACE not found in savePaperTradeConfig'); process.exit(1); }
  // Find the end of this dbRun call — closing ]);
  const closeIdx = s.indexOf(']);', insertIdx);
  if (closeIdx < 0) { console.error('db.js: could not find ]); after INSERT'); process.exit(1); }
  const oldBlock = s.substring(insertIdx, closeIdx + 3);
  const newBlock = `INSERT OR REPLACE INTO paper_trade_config (user_id,trade_type,default_qty,default_sl_pct,default_tgt_pct,max_positions,auto_paper_mode,auto_paper_stocks,picks_capital,updated_at)\n     VALUES (?,?,?,?,?,?,?,?,?,datetime('now','localtime'))\`, [userId, m.trade_type, m.default_qty, m.default_sl_pct, m.default_tgt_pct, m.max_positions, m.auto_paper_mode ?? 'picks', m.auto_paper_stocks ?? '[]', m.picks_capital ?? 0]);`;
  // Replace only this block inside the backtick template
  s = s.substring(0, insertIdx) + newBlock + s.substring(closeIdx + 3);
  console.log('  savePaperTradeConfig patched via index');

  fs.writeFileSync(p, s);
  console.log('db.js patched');
}

// ════════════════════════════════════════════════════════════
// 2. PATCH server.js — config form UI + save handler
// ════════════════════════════════════════════════════════════
{
  const p = '/root/zeroscreen/dist/server.js';
  let s = fs.readFileSync(p, 'utf8');

  // 2a. Config form — add picks_capital field after "Default Quantity" row
  const UI_OLD = `      <div class="cfg-row">
        <label class="cfg-label">Default Quantity</label>
        <input class="cfg-input" type="number" name="default_qty" min="1" max="10000" value="\${cfg.default_qty}">
      </div>
      <div class="cfg-row">
        <label class="cfg-label">Default Stop Loss %</label>`;
  const UI_NEW = `      <div class="cfg-row">
        <label class="cfg-label">Default Quantity</label>
        <input class="cfg-input" type="number" name="default_qty" min="1" max="10000" value="\${cfg.default_qty}">
      </div>
      <div class="cfg-row">
        <label class="cfg-label">Capital per Pick <span style="font-size:.75rem;font-weight:400;color:var(--text-muted)">(auto-size qty = capital ÷ price, 0 = use default qty)</span></label>
        <input class="cfg-input" type="number" name="picks_capital" min="0" max="500000" step="100" value="\${cfg.picks_capital || 0}" placeholder="e.g. 5000">
      </div>
      <div class="cfg-row">
        <label class="cfg-label">Default Stop Loss %</label>`;
  if (!s.includes(UI_OLD)) { console.error('server.js: config form UI marker not found'); process.exit(1); }
  s = s.replace(UI_OLD, UI_NEW);

  // 2b. Save handler — parse picks_capital and pass to savePaperTradeConfig
  const SAVE_OLD = `    const max_positions = Math.max(1, Math.min(50, parseInt(req.body.max_positions, 10) || 10));
    await (0, db_1.savePaperTradeConfig)(userId, { trade_type, default_qty, default_sl_pct, default_tgt_pct, max_positions });`;
  const SAVE_NEW = `    const max_positions = Math.max(1, Math.min(50, parseInt(req.body.max_positions, 10) || 10));
    const picks_capital = Math.max(0, Math.min(500000, parseFloat(req.body.picks_capital) || 0));
    await (0, db_1.savePaperTradeConfig)(userId, { trade_type, default_qty, default_sl_pct, default_tgt_pct, max_positions, picks_capital });`;
  if (!s.includes(SAVE_OLD)) { console.error('server.js: save handler marker not found'); process.exit(1); }
  s = s.replace(SAVE_OLD, SAVE_NEW);

  fs.writeFileSync(p, s);
  console.log('server.js patched');
}

// ════════════════════════════════════════════════════════════
// 3. PATCH scheduler.js — capital-based qty calculation
// ════════════════════════════════════════════════════════════
{
  const p = '/root/zeroscreen/dist/scheduler.js';
  let s = fs.readFileSync(p, 'utf8');

  // 3a. Load user config before the per-pick loop
  const LOOP_OLD = `        // Fetch all open positions for this user once per user (avoid per-pick DB calls)
        const openPositions = await (0, db_1.getPaperPositions)(user.id);`;
  const LOOP_NEW = `        // Load user paper trade config for capital-per-pick sizing
        const userCfg = await (0, db_1.getPaperTradeConfig)(user.id);
        const picksCapital = (userCfg.picks_capital || 0);
        // Fetch all open positions for this user once per user (avoid per-pick DB calls)
        const openPositions = await (0, db_1.getPaperPositions)(user.id);`;
  if (!s.includes(LOOP_OLD)) { console.error('scheduler.js: loop marker not found'); process.exit(1); }
  s = s.replace(LOOP_OLD, LOOP_NEW);

  // 3b. Replace hardcoded qty = 1 with capital-based calc
  const QTY_OLD = `            const qty = 1;
            const priceRow = await (0, db_1.dbAll)("SELECT price FROM prices WHERE symbol = ?", [pick.stock_symbol]);
            const livePrice = priceRow[0]?.price ?? 0;`;
  const QTY_NEW = `            const priceRow = await (0, db_1.dbAll)("SELECT price FROM prices WHERE symbol = ?", [pick.stock_symbol]);
            const livePrice = priceRow[0]?.price ?? 0;
            // Capital-based qty: floor(capital / price), fallback to default_qty
            const qty = picksCapital > 0 && livePrice > 0
                ? Math.max(1, Math.floor(picksCapital / livePrice))
                : (userCfg.default_qty || 1);`;
  if (!s.includes(QTY_OLD)) { console.error('scheduler.js: qty marker not found'); process.exit(1); }
  s = s.replace(QTY_OLD, QTY_NEW);

  fs.writeFileSync(p, s);
  console.log('scheduler.js patched');
}

console.log('All patches applied successfully');
