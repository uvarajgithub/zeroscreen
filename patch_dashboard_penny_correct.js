// patch_dashboard_penny_correct.js — insert penny holdings into CORRECT /dashboard handler
const fs = require('fs');
const p = '/root/zeroscreen/dist/server.js';
let s = fs.readFileSync(p, 'utf8');

// ── 1. Add penny data loading after botMonthKeys (inside /dashboard handler at line ~8332) ──
const DATA_OLD = `        const botMonthKeys = Object.keys(botMonthMap).sort().slice(-6);
        const marketOpen = isMarketHours();`;
const DATA_NEW = `        const botMonthKeys = Object.keys(botMonthMap).sort().slice(-6);
        // Penny / long-term bot holdings
        const pennyOpen = isAdmin ? (() => { try {
            const all = JSON.parse(fs_1.default.readFileSync(\`\${BOT_DIR}/paper-trades.json\`, "utf-8"));
            return all.filter((t) => t.status === 'OPEN');
        } catch { return []; } })() : [];
        const pennyClosed = isAdmin ? (() => { try {
            const all = JSON.parse(fs_1.default.readFileSync(\`\${BOT_DIR}/paper-trades.json\`, "utf-8"));
            return all.filter((t) => t.status !== 'OPEN');
        } catch { return []; } })() : [];
        const marketOpen = isMarketHours();`;

if (!s.includes(DATA_OLD)) { console.error('ERROR: data marker not found'); process.exit(1); }
s = s.replace(DATA_OLD, DATA_NEW);
console.log('Step 1: penny data loading added');

// ── 2. Insert Penny Holdings panel before the BOT TRADES panel comment ──
const HTML_OLD = `    <!-- \u2500\u2500 PANEL: BOT TRADES (removed - admin uses /my-paper-trade) \u2500\u2500 -->`;
const HTML_NEW = `    <!-- \u2500\u2500 PANEL: PENNY / LONG-TERM BOT HOLDINGS \u2500\u2500 -->
    \${isAdmin && pennyOpen.length > 0 ? \`
    <div class="db-panel" id="dbp-penny" style="margin-bottom:20px">
      <div class="db-section" style="color:#f59e0b">
        \u{1F4C8} Penny / Long-Term Holdings
        <span style="font-size:.72rem;font-weight:400;color:var(--text-muted);margin-left:8px">paper \u00b7 \${pennyOpen.length} open\${pennyClosed.length > 0 ? ' \u00b7 '+pennyClosed.length+' closed' : ''}</span>
      </div>
      <div style="overflow-x:auto">
        <table class="db-tbl">
          <thead><tr>
            <th>Entry Date</th><th>Symbol</th><th>Strategy</th><th>Qty</th>
            <th>Entry \u20b9</th><th>SL \u20b9</th><th>T1 \u20b9</th><th>T2 \u20b9</th><th>Capital \u20b9</th>
          </tr></thead>
          <tbody>
            \${pennyOpen.map(t => \`<tr>
              <td class="db-muted" style="font-size:.78rem">\${t.entryDate||'\u2014'}</td>
              <td style="font-weight:700;color:#f59e0b">\${t.symbol||'\u2014'}</td>
              <td><span style="font-size:.7rem;padding:2px 7px;border-radius:4px;background:rgba(245,158,11,.15);color:#f59e0b;font-weight:700">\${t.strategy||'PENNY'}</span></td>
              <td>\${t.qty||'\u2014'}</td>
              <td style="font-family:monospace">\u20b9\${(t.entryPrice||0).toFixed(2)}</td>
              <td style="font-family:monospace;color:#f87171">\u20b9\${(t.sl||0).toFixed(2)}</td>
              <td style="font-family:monospace;color:#34d399">\u20b9\${(t.target1||0).toFixed(2)}</td>
              <td style="font-family:monospace;color:#6ee7b7">\${t.target2?'\u20b9'+(t.target2).toFixed(2):'\u2014'}</td>
              <td style="font-family:monospace">\u20b9\${(t.capital||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
            </tr>\`).join('')}
          </tbody>
        </table>
      </div>
      \${pennyClosed.length > 0 ? \`<div class="db-muted" style="font-size:.72rem;margin-top:8px">
        \${pennyClosed.length} closed \u00b7 
        \u20b9\${pennyClosed.reduce((sum,t)=>sum+(t.pnl||0),0).toLocaleString('en-IN',{maximumFractionDigits:0})} realized \u00b7
        \${pennyClosed.filter(t=>(t.pnl||0)>0).length}W / \${pennyClosed.filter(t=>(t.pnl||0)<=0).length}L
      </div>\` : ''}
    </div>
    \` : ""}

    <!-- \u2500\u2500 PANEL: BOT TRADES (removed - admin uses /my-paper-trade) \u2500\u2500 -->`;

if (!s.includes(HTML_OLD)) { console.error('ERROR: HTML marker not found'); process.exit(1); }
s = s.replace(HTML_OLD, HTML_NEW);
console.log('Step 2: Penny Holdings panel HTML added');

fs.writeFileSync(p, s);
console.log('Done: Penny Holdings added to /dashboard (correct handler)');
