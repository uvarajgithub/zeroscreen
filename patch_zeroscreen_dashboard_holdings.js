// patch_zeroscreen_dashboard_holdings.js — add Penny Holdings to /dashboard in ZEROSCREEN server
const fs = require('fs');
const p = '/root/zeroscreen/dist/server.js';
let s = fs.readFileSync(p, 'utf8');

// ── 1. Load penny open/closed trades in data section (after adminBotWins) ──
const DATA_OLD = `    const adminBotWins = adminBotClosed.filter((t) => (t.pnl ?? 0) > 0).length;
    // \u2500\u2500 Credits`;
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
    // \u2500\u2500 Credits`;

if (!s.includes(DATA_OLD)) { console.error('ERROR: data marker not found. Trying alternate...'); 
  // Try without the comment style
  const alt = `    const adminBotWins = adminBotClosed.filter((t) => (t.pnl ?? 0) > 0).length;`;
  const idx = s.indexOf(alt);
  if (idx < 0) { console.error('ERROR: adminBotWins line not found'); process.exit(1); }
  console.log('Found adminBotWins at position', idx);
  process.exit(1);
}
s = s.replace(DATA_OLD, DATA_NEW);
console.log('Step 1: data loading added');

// ── 2. Insert Penny Holdings HTML before "Auto Bot Trade History" section ──
const HTML_OLD = `    <!-- \u2500\u2500 ADMIN: BOT TRADE HISTORY`;
const HTML_NEW = `    <!-- \u2500\u2500 ADMIN: PENNY / LONG-TERM HOLDINGS \u2500\u2500 -->
    \${isAdmin && adminPennyOpen.length > 0 ? \`
    <div class="mpt-section" style="margin-top:32px">\u{1F4C8} Penny / Long-Term Holdings (\${adminPennyOpen.length} open)
      <span style="font-size:.72rem;font-weight:400;margin-left:10px;color:#f59e0b">paper \u00b7 auto-exit on SL/Target each evening</span>
    </div>
    <div class="mpt-tbl-wrap" style="margin-bottom:8px"><table class="mpt-history-table">
      <thead><tr>
        <th>Entry Date</th><th>Symbol</th><th>Strategy</th><th>Qty</th>
        <th>Entry \u20b9</th><th>SL \u20b9</th><th>T1 \u20b9</th><th>T2 \u20b9</th><th>Capital \u20b9</th>
      </tr></thead>
      <tbody>
        \${adminPennyOpen.map(t => \`<tr>
          <td style="color:var(--text-muted);font-size:.78rem">\${t.entryDate||'\u2014'}</td>
          <td style="font-weight:700;color:#f59e0b">\${t.symbol||'\u2014'}</td>
          <td><span style="font-size:.7rem;padding:2px 7px;border-radius:4px;background:rgba(245,158,11,.12);color:#f59e0b;font-weight:700">\${t.strategy||'PENNY'}</span></td>
          <td>\${t.qty||'\u2014'}</td>
          <td style="font-family:monospace">\u20b9\${(t.entryPrice||0).toFixed(2)}</td>
          <td style="font-family:monospace;color:#f87171">\u20b9\${(t.sl||0).toFixed(2)}</td>
          <td style="font-family:monospace;color:#34d399">\u20b9\${(t.target1||0).toFixed(2)}</td>
          <td style="font-family:monospace;color:#6ee7b7">\${t.target2?'\u20b9'+(t.target2).toFixed(2):'\u2014'}</td>
          <td style="font-family:monospace">\u20b9\${(t.capital||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
        </tr>\`).join('')}
      </tbody>
    </table></div>
    \${adminPennyClosed.length > 0 ? \`
    <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:20px">
      \${adminPennyClosed.length} closed \u00b7
      \u20b9\${adminPennyClosed.reduce((sum,t)=>sum+(t.pnl||0),0).toLocaleString('en-IN',{maximumFractionDigits:0})} realized \u00b7
      \${adminPennyClosed.filter(t=>(t.pnl||0)>0).length}W / \${adminPennyClosed.filter(t=>(t.pnl||0)<=0).length}L
    </div>\` : ''}
    \` : ""}

    <!-- \u2500\u2500 ADMIN: BOT TRADE HISTORY`;

if (!s.includes(HTML_OLD)) { console.error('ERROR: HTML marker not found'); process.exit(1); }
s = s.replace(HTML_OLD, HTML_NEW);
console.log('Step 2: HTML section added');

fs.writeFileSync(p, s);
console.log('Done: Penny Holdings added to /dashboard in zeroscreen server');
