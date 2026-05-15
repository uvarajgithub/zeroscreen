// patch_server_5k_ui.js — update config UI: picks_capital as primary field
const fs = require('fs');
const p = '/root/zeroscreen/dist/server.js';
let s = fs.readFileSync(p, 'utf8');

// Find and replace the risk_pct field with picks_capital (primary) + risk_pct (advanced)
const idx = s.indexOf('<label class="cfg-label">Risk % per Trade');
if (idx < 0) { console.error('UI field not found'); process.exit(1); }
const closingDiv = s.indexOf('</div>\n      <div class="cfg-row">\n        <label class="cfg-label">Default Stop Loss', idx);
if (closingDiv < 0) { console.error('closing div not found'); process.exit(1); }

const OLD_BLOCK = s.substring(s.lastIndexOf('<div class="cfg-row">', idx), closingDiv + 6);
const NEW_BLOCK = `<div class="cfg-row">
        <label class="cfg-label">Capital per Pick <span style="font-size:.75rem;font-weight:400;color:var(--text-muted)">(fixed Rs per trade · qty = capital ÷ price · 0 = use risk% or default qty)</span></label>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="color:var(--text-muted);font-size:.85rem">Rs</span>
          <input class="cfg-input" type="number" name="picks_capital" min="0" max="500000" step="500" value="\${cfg.picks_capital || 5000}" style="width:100px">
          <span style="color:var(--text-muted);font-size:.82rem">(e.g. 5000 = Rs5K per pick)</span>
        </div>
      </div>
      <div class="cfg-row">
        <label class="cfg-label">Risk % per Trade <span style="font-size:.75rem;font-weight:400;color:var(--text-muted)">(advanced · used only if capital/pick = 0)</span></label>
        <div style="display:flex;align-items:center;gap:8px">
          <input class="cfg-input" type="number" name="risk_pct" min="0" max="10" step="0.1" value="\${cfg.risk_pct || 0}" style="width:90px">
          <span style="color:var(--text-muted);font-size:.82rem">% of portfolio per trade</span>
        </div>
      </div>`;

s = s.replace(OLD_BLOCK, NEW_BLOCK);

// Also update save handler to parse picks_capital again (it currently parses risk_pct, need both)
// Find the risk_pct save line
const saveIdx = s.indexOf('const risk_pct = Math.max(0, Math.min(10, parseFloat(req.body.risk_pct) || 0));');
if (saveIdx < 0) { console.error('save handler not found'); process.exit(1); }
s = s.substring(0, saveIdx) +
    `const picks_capital = Math.max(0, Math.min(500000, parseFloat(req.body.picks_capital) || 0));\n    const risk_pct = Math.max(0, Math.min(10, parseFloat(req.body.risk_pct) || 0));` +
    s.substring(saveIdx + 'const risk_pct = Math.max(0, Math.min(10, parseFloat(req.body.risk_pct) || 0));'.length);

// Update save call to include picks_capital
s = s.replace(
    'await (0, db_1.savePaperTradeConfig)(userId, { trade_type, default_qty, default_sl_pct, default_tgt_pct, max_positions, risk_pct });',
    'await (0, db_1.savePaperTradeConfig)(userId, { trade_type, default_qty, default_sl_pct, default_tgt_pct, max_positions, picks_capital, risk_pct });'
);

fs.writeFileSync(p, s);
console.log('server.js patched — picks_capital field restored to config UI');
