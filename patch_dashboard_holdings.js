// patch_dashboard_holdings.js — add Penny Holdings section to /dashboard page
const fs = require('fs');
const p = '/home/ubuntu/trading-bot/dist/src/server.js';
let s = fs.readFileSync(p, 'utf8');

// ── 1. Load penny open trades in data section (after adminBotWins line) ────
const DATA_OLD = `    const adminBotWins = adminBotClosed.filter((t) => (t.pnl ?? 0) > 0).length;
    // ── Credits`;
const DATA_NEW = `    const adminBotWins = adminBotClosed.filter((t) => (t.pnl ?? 0) > 0).length;
    // Admin-only: penny/long-term paper holdings
    const adminPennyOpen = isAdmin ? (() => { try {
        const all = JSON.parse(fs_1.default.readFileSync(\`\${BOT_DIR}/paper-trades.json\`, "utf-8"));
        return all.filter((t) => t.status === 'OPEN');
    } catch { return []; } })() : [];
    const adminPennyClosed = isAdmin ? (() => { try {
        const all = JSON.parse(fs_1.default.readFileSync(\`\${BOT_DIR}/paper-trades.json\`, "utf-8"));
        return all.filter((t) => t.status !== 'OPEN');
    } catch { return []; } })() : [];
    // ── Credits`;

if (!s.includes(DATA_OLD)) { console.error('ERROR: data marker not found'); process.exit(1); }
s = s.replace(DATA_OLD, DATA_NEW);

// ── 2. Insert Penny Holdings HTML before the Bot Trade History section ──────
const HTML_OLD = `    <!-- ── ADMIN: BOT TRADE HISTORY`;
const HTML_NEW = `    <!-- ── ADMIN: PENNY / LONG-TERM HOLDINGS ── -->
    \${isAdmin && adminPennyOpen.length > 0 ? \`
    <div class="mpt-section" style="margin-top:32px">📈 Penny / Long-Term Holdings (\${adminPennyOpen.length} open)
      <span style="font-size:.72rem;font-weight:400;margin-left:10px;color:#f59e0b">paper · auto-exit on SL/Target each evening</span>
    </div>
    <div class="mpt-tbl-wrap" style="margin-bottom:8px"><table class="mpt-history-table">
      <thead><tr>
        <th>Entry Date</th><th>Symbol</th><th>Strategy</th><th>Qty</th>
        <th>Entry ₹</th><th>SL ₹</th><th>T1 ₹</th><th>T2 ₹</th><th>Capital ₹</th>
      </tr></thead>
      <tbody>
        \${adminPennyOpen.map(t => \`<tr>
          <td style="color:var(--text-muted);font-size:.78rem">\${t.entryDate||'—'}</td>
          <td style="font-weight:700;color:#f59e0b">\${t.symbol||'—'}</td>
          <td><span style="font-size:.7rem;padding:2px 7px;border-radius:4px;background:rgba(245,158,11,.12);color:#f59e0b;font-weight:700">\${t.strategy||'PENNY'}</span></td>
          <td>\${t.qty||'—'}</td>
          <td style="font-family:monospace">₹\${(t.entryPrice||0).toFixed(2)}</td>
          <td style="font-family:monospace;color:#f87171">₹\${(t.sl||0).toFixed(2)}</td>
          <td style="font-family:monospace;color:#34d399">₹\${(t.target1||0).toFixed(2)}</td>
          <td style="font-family:monospace;color:#6ee7b7">\${t.target2?'₹'+(t.target2).toFixed(2):'—'}</td>
          <td style="font-family:monospace">₹\${(t.capital||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
        </tr>\`).join('')}
      </tbody>
    </table></div>
    \${adminPennyClosed.length > 0 ? \`
    <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:20px">
      \${adminPennyClosed.length} closed · 
      ₹\${adminPennyClosed.reduce((s,t)=>s+(t.pnl||0),0).toLocaleString('en-IN',{maximumFractionDigits:0})} realized ·
      \${adminPennyClosed.filter(t=>(t.pnl||0)>0).length}W / \${adminPennyClosed.filter(t=>(t.pnl||0)<=0).length}L
    </div>\` : ''}
    \` : ""}

    <!-- ── ADMIN: BOT TRADE HISTORY`;

if (!s.includes(HTML_OLD)) { console.error('ERROR: HTML marker not found'); process.exit(1); }
s = s.replace(HTML_OLD, HTML_NEW);

fs.writeFileSync(p, s);
console.log('done: Penny Holdings section added to /dashboard');
