/**
 * dashboard.ts — Local web dashboard for live bot monitoring (AMINA 100 + legacy)
 *
 * Serves a browser UI at http://localhost:3001
 * The bot writes state to bot-heartbeat.json (Amina) or trade-state.json + trades.json (legacy)
 * The dashboard reads every 3 seconds and serves fresh data.
 *
 * Run alongside the bot:
 *   npx ts-node src/dashboard.ts
 */

import express from "express";
import fs from "fs";

const app  = express();
const PORT = 3001;

// ── Read helpers ──────────────────────────────────────────────────────────────
function readJSON(file: string, fallback: any = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}

function getTodayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

// ── API: status (legacy trades.json) ──────────────────────────────────────────
app.get("/api/status", (_req, res) => {
  const state  = readJSON("trade-state.json", {});
  const trades: any[] = readJSON("trades.json", []);
  const today  = getTodayIST();
  const todayTrades = trades.filter((t: any) => t.date?.startsWith(today));

  const wins     = todayTrades.filter((t: any) => t.pnl > 0).length;
  const losses   = todayTrades.filter((t: any) => t.pnl <= 0).length;
  const totalPnl = todayTrades.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);

  let maxDD = 0, eq = 0, peak = 0;
  for (const t of todayTrades) {
    eq += t.pnl ?? 0;
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDD) maxDD = dd;
  }

  res.json({
    timestamp: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    activeState: state,
    todaySummary: { trades: todayTrades.length, wins, losses, totalPnl, maxDD },
    recentTrades: todayTrades.slice(-10).reverse(),
  });
});

// ── API: heartbeat (Amina + legacy) ──────────────────────────────────────────
app.get("/api/heartbeat", (_req, res) => {
  const hb = readJSON("bot-heartbeat.json", null);
  res.json(hb ?? { error: "No heartbeat file yet" });
});

// ── Dashboard HTML ────────────────────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BANKNIFTY Bot — AMINA 100 Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; background: #0d1117; color: #e6edf3; min-height: 100vh; }
    header { background: #161b22; padding: 14px 24px; border-bottom: 1px solid #30363d; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
    header h1 { font-size: 1.1rem; font-weight: 700; letter-spacing: 0.5px; }
    #strategy-badge { font-size: 0.72rem; padding: 2px 10px; border-radius: 20px; background: #1a2840; color: #58a6ff; font-weight: 700; letter-spacing: 1px; }
    #clock { font-size: 0.82rem; color: #8b949e; }
    #status-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #3fb950; margin-right: 8px; animation: pulse 1.5s infinite; }
    #status-text { font-size: 0.78rem; color: #8b949e; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; padding: 18px 24px 0; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px 16px; }
    .card-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 1px; color: #8b949e; margin-bottom: 4px; }
    .card-value { font-size: 1.55rem; font-weight: 700; }
    .green { color: #3fb950; } .red { color: #f85149; } .gray { color: #8b949e; } .yellow { color: #e3b341; } .cyan { color: #58a6ff; }
    .pos-section { padding: 14px 24px; }
    .pos-box { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px 20px; }
    .pos-box h2 { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px; color: #8b949e; margin-bottom: 12px; }
    .pos-row { display: flex; gap: 28px; flex-wrap: wrap; }
    .pos-field label { font-size: 0.68rem; color: #8b949e; text-transform: uppercase; }
    .pos-field span { font-size: 0.95rem; font-weight: 600; }
    .amina-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 0 24px 14px; }
    @media (max-width: 600px) { .amina-grid { grid-template-columns: 1fr; } }
    .amina-panel { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px 18px; }
    .amina-panel h3 { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 1px; color: #8b949e; margin-bottom: 10px; }
    .amina-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #21262d; font-size: 0.8rem; }
    .amina-row:last-child { border-bottom: none; }
    .amina-row .lbl { color: #8b949e; }
    .amina-row .val { font-weight: 600; }
    .trades-section { padding: 0 24px 14px; }
    .trades-section h2 { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px; color: #8b949e; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
    th { text-align: left; padding: 7px 9px; background: #161b22; color: #8b949e; border-bottom: 1px solid #30363d; font-weight: 500; }
    td { padding: 7px 9px; border-bottom: 1px solid #21262d; }
    tr:last-child td { border-bottom: none; }
    .badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 0.7rem; font-weight: 600; }
    .badge-ce { background: #1f4620; color: #3fb950; }
    .badge-pe { background: #3d1616; color: #f85149; }
    .badge-flat { background: #1c2128; color: #8b949e; }
    .badge-scanning { background: #1c2b3a; color: #58a6ff; }
    .badge-done { background: #2d2208; color: #e3b341; }
    footer { text-align: center; padding: 16px; color: #30363d; font-size: 0.72rem; }
  </style>
</head>
<body>
  <header>
    <div style="display:flex;align-items:center;gap:10px">
      <h1><span id="status-dot"></span>BANKNIFTY Bot</h1>
      <span id="strategy-badge">AMINA 100</span>
    </div>
    <div style="display:flex;align-items:center;gap:14px">
      <span id="status-text">Loading...</span>
      <span id="clock"></span>
    </div>
  </header>

  <div class="grid">
    <div class="card"><div class="card-label">Day P&L (pts)</div><div class="card-value gray" id="pnl-pts">—</div></div>
    <div class="card"><div class="card-label">Day P&L (Rs)</div><div class="card-value gray" id="pnl-rs">—</div></div>
    <div class="card"><div class="card-label">Live Price</div><div class="card-value cyan" id="live-price">—</div></div>
    <div class="card"><div class="card-label">Day Open</div><div class="card-value gray" id="day-open">—</div></div>
    <div class="card"><div class="card-label">Trades</div><div class="card-value" id="trade-count">—</div></div>
    <div class="card"><div class="card-label">Phase</div><div id="phase-val" style="margin-top:4px">—</div></div>
  </div>

  <div class="pos-section">
    <div class="pos-box">
      <h2>Active Position</h2>
      <div class="pos-row" id="pos-detail">
        <div class="badge badge-flat">FLAT — No open position</div>
      </div>
    </div>
  </div>

  <div class="amina-grid">
    <div class="amina-panel">
      <h3>T1 Trade (SL: −60 pts, trail)</h3>
      <div id="t1-rows"><div style="color:#8b949e;font-size:0.8rem">Scanning...</div></div>
    </div>
    <div class="amina-panel">
      <h3>Re-entry (SL: −60 pts, trail)</h3>
      <div id="re-rows"><div style="color:#8b949e;font-size:0.8rem">Waiting for T1 SL hit...</div></div>
    </div>
  </div>

  <div class="trades-section">
    <h2>Today's Trades</h2>
    <table>
      <thead>
        <tr><th>Time</th><th>Type</th><th>Dir</th><th>Entry</th><th>Exit</th><th>P&L</th><th>Reason</th></tr>
      </thead>
      <tbody id="trades-tbody">
        <tr><td colspan="7" style="color:#8b949e;text-align:center;padding:18px">No trades yet</td></tr>
      </tbody>
    </table>
  </div>

  <footer>Refreshes every 3s &nbsp;·&nbsp; AMINA 100 — Rs +19,25,692 over 5.5 years ✅</footer>

  <script>
    function fmt(v) { if (v == null) return '—'; return (v >= 0 ? '+' : '') + parseFloat(v).toFixed(0); }
    function clr(v) { return v > 0 ? 'green' : v < 0 ? 'red' : 'gray'; }
    function badge(dir) {
      if (!dir) return '<span class="badge badge-flat">—</span>';
      return dir === 'CE' ? '<span class="badge badge-ce">CE</span>' : '<span class="badge badge-pe">PE</span>';
    }
    function phaseBadge(phase) {
      if (!phase) return '<span class="badge badge-flat">—</span>';
      if (phase === 'SCANNING') return '<span class="badge badge-scanning">SCANNING</span>';
      if (phase === 'IN_T1')    return '<span class="badge badge-ce">IN T1</span>';
      if (phase === 'IN_RE')    return '<span class="badge badge-pe">IN RE-ENTRY</span>';
      if (phase === 'DONE')     return '<span class="badge badge-done">DONE</span>';
      return '<span class="badge badge-flat">' + phase + '</span>';
    }
    async function refresh() {
      try {
        const [hbR, stR] = await Promise.all([fetch('/api/heartbeat'), fetch('/api/status')]);
        const hb = await hbR.json();
        const d  = await stR.json();
        document.getElementById('clock').textContent = d.timestamp;
        const isAmina = hb && (hb.strategy === 'AMINA 100' || hb.strategy === 'AMINA');
        // strategy badge
        const sb = document.getElementById('strategy-badge');
        sb.textContent = hb && hb.strategy ? hb.strategy : 'BOT';
        sb.style.background = isAmina ? '#1a2840' : '#1f4620';
        sb.style.color      = isAmina ? '#58a6ff' : '#3fb950';
        // status
        document.getElementById('status-text').textContent = hb && hb.status ? hb.status : '—';
        // price
        const px = hb && hb.price ? hb.price : 0;
        document.getElementById('live-price').textContent = px ? px.toFixed(0) : '—';
        // day open
        const dop = hb && hb.dayOpen ? hb.dayOpen : 0;
        document.getElementById('day-open').textContent = dop ? dop.toFixed(0) : '—';
        // phase
        document.getElementById('phase-val').innerHTML = phaseBadge(hb && hb.phase);
        // P&L
        let pts = 0;
        if (isAmina) { pts = hb.dailyPnL != null ? hb.dailyPnL : (hb.dayPts || 0); }
        else { pts = d.todaySummary.totalPnl || 0; }
        const rs = pts * 15;
        const pPts = document.getElementById('pnl-pts');
        const pRs  = document.getElementById('pnl-rs');
        pPts.textContent = fmt(pts);
        pPts.className = 'card-value ' + clr(pts);
        pRs.textContent = (rs >= 0 ? '+' : '') + 'Rs ' + Math.abs(rs).toFixed(0);
        pRs.className = 'card-value ' + clr(rs);
        // trade count
        document.getElementById('trade-count').textContent = hb && hb.tradeCount != null ? hb.tradeCount : (d.todaySummary.trades || 0);
        // position
        const posBox = document.getElementById('pos-detail');
        if (isAmina && hb.inTrade && hb.direction) {
          const up = hb.unrealisedPnL || 0;
          posBox.innerHTML =
            '<div class="pos-field"><label>Symbol</label><br><span>' + (hb.tradeSymbol || '—') + '</span></div>' +
            '<div class="pos-field"><label>Direction</label><br><span class="' + (hb.direction === 'CE' ? 'green' : 'red') + '">' + hb.direction + '</span></div>' +
            '<div class="pos-field"><label>Entry</label><br><span>' + (hb.entryPrice || '—') + '</span></div>' +
            '<div class="pos-field"><label>SL</label><br><span class="red">' + (hb.sl || '—') + '</span></div>' +
            '<div class="pos-field"><label>Live P&L</label><br><span class="' + clr(up) + '">' + fmt(up) + ' pts</span></div>' +
            '<div class="pos-field"><label>Live Rs</label><br><span class="' + clr(up) + '">' + (up >= 0 ? '+' : '') + 'Rs ' + Math.abs(up * 15).toFixed(0) + '</span></div>';
        } else if (!isAmina && d.activeState && d.activeState.tradeDirection) {
          const st = d.activeState;
          posBox.innerHTML =
            '<div class="pos-field"><label>Symbol</label><br><span>' + (st.tradeSymbol || '—') + '</span></div>' +
            '<div class="pos-field"><label>Direction</label><br><span class="' + (st.tradeDirection === 'CE' ? 'green' : 'red') + '">' + st.tradeDirection + '</span></div>' +
            '<div class="pos-field"><label>Entry</label><br><span>' + st.entryPrice + '</span></div>' +
            '<div class="pos-field"><label>P&L (pts)</label><br><span class="' + clr(st.dailyPnL) + '">' + fmt(st.dailyPnL || 0) + '</span></div>';
        } else {
          posBox.innerHTML = '<div class="badge badge-flat">FLAT — No open position</div>';
        }
        // T1 panel
        const t1El = document.getElementById('t1-rows');
        if (isAmina && hb.t1Dir) {
          const sl1 = hb.t1SL != null ? hb.t1SL : (hb.t1Dir === 'CE' ? hb.t1Entry - 50 : hb.t1Entry + 50);
          t1El.innerHTML =
            '<div class="amina-row"><span class="lbl">Direction</span><span class="val ' + (hb.t1Dir === 'CE' ? 'green' : 'red') + '">' + hb.t1Dir + '</span></div>' +
            '<div class="amina-row"><span class="lbl">Entry</span><span class="val">' + (hb.t1Entry ? hb.t1Entry.toFixed(0) : '—') + '</span></div>' +
            '<div class="amina-row"><span class="lbl">SL</span><span class="val red">' + (sl1 ? sl1.toFixed(0) : '—') + '</span></div>' +
            '<div class="amina-row"><span class="lbl">Breakout Level</span><span class="val cyan">' + (hb.t1BreakLevel ? hb.t1BreakLevel.toFixed(0) : '—') + '</span></div>' +
            '<div class="amina-row"><span class="lbl">Rule</span><span class="val yellow">' + (hb.t1Rule ? 'Rule ' + hb.t1Rule : '—') + '</span></div>' +
            '<div class="amina-row"><span class="lbl">P&L (pts)</span><span class="val ' + clr(hb.t1Pts) + '">' + fmt(hb.t1Pts) + '</span></div>';
        } else if (isAmina) {
          t1El.innerHTML = '<div style="color:#8b949e;font-size:0.8rem">Scanning for entry signal...</div>';
        } else {
          t1El.innerHTML = '<div style="color:#8b949e;font-size:0.8rem">—</div>';
        }
        // Re-entry panel
        const reEl = document.getElementById('re-rows');
        if (isAmina && hb.reDir) {
          const sl2 = hb.reSL != null ? hb.reSL : (hb.reDir === 'CE' ? hb.reEntry - 100 : hb.reEntry + 100);
          reEl.innerHTML =
            '<div class="amina-row"><span class="lbl">Direction</span><span class="val ' + (hb.reDir === 'CE' ? 'green' : 'red') + '">' + hb.reDir + '</span></div>' +
            '<div class="amina-row"><span class="lbl">Entry</span><span class="val">' + (hb.reEntry ? hb.reEntry.toFixed(0) : '—') + '</span></div>' +
            '<div class="amina-row"><span class="lbl">SL</span><span class="val red">' + (sl2 ? sl2.toFixed(0) : '—') + '</span></div>' +
            '<div class="amina-row"><span class="lbl">Symbol</span><span class="val">' + (hb.reSymbol || '—') + '</span></div>' +
            '<div class="amina-row"><span class="lbl">P&L (pts)</span><span class="val ' + clr(hb.rePts) + '">' + fmt(hb.rePts) + '</span></div>';
        } else if (isAmina && hb.t1Dir) {
          reEl.innerHTML = '<div style="color:#8b949e;font-size:0.8rem">Waiting for T1 SL hit...</div>';
        } else if (isAmina) {
          reEl.innerHTML = '<div style="color:#8b949e;font-size:0.8rem">No T1 yet</div>';
        } else {
          reEl.innerHTML = '<div style="color:#8b949e;font-size:0.8rem">—</div>';
        }
        // Trades table
        const tbody = document.getElementById('trades-tbody');
        if (!d.recentTrades || !d.recentTrades.length) {
          tbody.innerHTML = '<tr><td colspan="7" style="color:#8b949e;text-align:center;padding:18px">No trades yet today</td></tr>';
        } else {
          tbody.innerHTML = d.recentTrades.map(function(t) {
            const pnl = t.pnl || 0;
            const time = t.date ? new Date(t.date).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—';
            const dir = t.direction === 'CE'
              ? '<span class="badge badge-ce">CE</span>'
              : '<span class="badge badge-pe">PE</span>';
            return '<tr><td>' + time + '</td><td>' + (t.type || '—') + '</td><td>' + dir +
              '</td><td>' + (t.entryPrice || '—') + '</td><td>' + (t.exitPrice || '—') +
              '</td><td class="' + clr(pnl) + '">' + fmt(pnl) + '</td><td>' + (t.reasonExit || '—') + '</td></tr>';
          }).join('');
        }
      } catch(e) {
        document.getElementById('clock').textContent = 'Connection error...';
      }
    }
    refresh();
    setInterval(refresh, 3000);
  </script>
</body>
</html>`;

app.get("/", (_req, res) => { res.send(HTML); });

app.listen(PORT, () => {
  console.log(`\n\u{1F310} Dashboard running at http://localhost:${PORT}`);
  console.log("   Open in browser while the bot is running.");
  console.log("   Auto-refreshes every 3 seconds.\n");
});
