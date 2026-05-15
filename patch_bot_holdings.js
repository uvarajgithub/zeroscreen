// patch_bot_holdings.js — add separate Bot Holdings section to paper-trade page
const fs = require('fs');
const p = '/root/zeroscreen/dist/server.js';
let s = fs.readFileSync(p, 'utf8');

// ── Find the "Recent Bot Trades" comment to insert before it ────────────────
const marker = `      <!-- Recent Trades -->
      \${closed.length > 0 ? \`
      <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:12px">Recent Bot Trades</div>`;

if (!s.includes(marker)) {
  console.error('ERROR: marker not found');
  process.exit(1);
}

// ── Build the Bot Holdings HTML to insert before ────────────────────────────
// Uses botTrades (already available in scope) filtered to OPEN
const insertion = `      <!-- Bot Holdings (OPEN Penny positions) -->
      \${botTrades.filter(t => t.status === 'OPEN').length > 0 ? \`
      <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#f59e0b;border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:12px;margin-top:24px">
        ≡ƒôà Bot Holdings &mdash; Long Term &nbsp;<span style="font-weight:400;color:var(--text-muted)">(paper · auto-exit on SL/Target)</span>
        <span style="float:right;color:var(--text-muted);">\${botTrades.filter(t=>t.status==='OPEN').length} open</span>
      </div>
      <div style="overflow-x:auto;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
          <thead><tr style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:.05em">
            <th style="padding:6px 10px;text-align:left;font-weight:700">Entry Date</th>
            <th style="padding:6px 10px;text-align:left;font-weight:700">Symbol</th>
            <th style="padding:6px 10px;text-align:right;font-weight:700">Entry</th>
            <th style="padding:6px 10px;text-align:right;font-weight:700">Qty</th>
            <th style="padding:6px 10px;text-align:right;font-weight:700">SL</th>
            <th style="padding:6px 10px;text-align:right;font-weight:700">T1</th>
            <th style="padding:6px 10px;text-align:right;font-weight:700">T2</th>
            <th style="padding:6px 10px;text-align:right;font-weight:700">Capital</th>
          </tr></thead>
          <tbody>
            \${botTrades.filter(t => t.status === 'OPEN').map(t => \`
            <tr style="border-top:1px solid var(--border)">
              <td style="padding:7px 10px;color:var(--text-muted);font-size:0.76rem">\${t.entryDate || '—'}</td>
              <td style="padding:7px 10px;font-weight:700;font-size:0.82rem;color:#f59e0b">\${t.symbol || '—'}</td>
              <td style="padding:7px 10px;text-align:right;font-family:monospace">&#8377;\${(t.entryPrice||0).toFixed(2)}</td>
              <td style="padding:7px 10px;text-align:right">\${t.qty||'—'}</td>
              <td style="padding:7px 10px;text-align:right;color:#f87171;font-family:monospace">&#8377;\${(t.sl||0).toFixed(2)}</td>
              <td style="padding:7px 10px;text-align:right;color:#34d399;font-family:monospace">&#8377;\${(t.target1||0).toFixed(2)}</td>
              <td style="padding:7px 10px;text-align:right;color:#6ee7b7;font-family:monospace">\${t.target2 ? '&#8377;'+(t.target2).toFixed(2) : '—'}</td>
              <td style="padding:7px 10px;text-align:right;font-family:monospace">&#8377;\${(t.capital||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
            </tr>\`).join('')}
          </tbody>
        </table>
      </div>
      \` : ''}

      <!-- Recent Trades -->
      \${closed.length > 0 ? \`
      <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:12px">Recent Bot Trades</div>`;

s = s.replace(marker, insertion);
fs.writeFileSync(p, s);
console.log('done: Bot Holdings section added');
