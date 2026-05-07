/**
 * Token Refresh Server — runs on VPS port 3000
 *
 * Daily flow (before 9:15 AM IST):
 *   1. Open browser → http://YOUR_VPS_IP:3000/login
 *   2. Logs in via Kite → redirects back to /callback
 *   3. Server exchanges request_token → writes new ACCESS_TOKEN to .env
 *   4. Restarts the trading bot via PM2
 *
 * IMPORTANT: Register http://YOUR_VPS_IP:3000/callback as the
 * redirect URL in your Kite developer console.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

const KiteConnect = require('kiteconnect').KiteConnect;

const PORT       = parseInt(process.env.TOKEN_SERVER_PORT ?? '3000', 10);
const AUTH_PASS  = process.env.TOKEN_SERVER_PASS ?? '';   // set TOKEN_SERVER_PASS in .env
// Fix: token-server compiles to dist/token-server.js, so __dirname = dist/
// We need to write to the root .env which the bot reads via dotenv.config() from cwd
const ENV_PATH   = path.resolve(__dirname, '..', '.env');
const BOT_NAME   = 'trading-bot';                         // PM2 process name

const kite = new KiteConnect({ api_key: process.env.API_KEY });

const app = express();

// ── Simple passphrase guard ──────────────────────────────────────────────────
function checkAuth(req: express.Request, res: express.Response): boolean {
  if (!AUTH_PASS) return true;                       // no password configured → open
  if (req.query.pass === AUTH_PASS) return true;
  res.status(401).send('<h2>401 Unauthorized — add ?pass=YOUR_PASS to the URL</h2>');
  return false;
}

// ── Dashboard helpers ─────────────────────────────────────────────────────────
function readTrades(): any[] {
  const p = path.resolve(__dirname, 'trades.json');
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return []; }
}

function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

function getBotStatus(): { label: string; color: string; detail: string } {
  // Read trade-state.json for trade info
  const stateFile = path.resolve(__dirname, 'trade-state.json');
  let state: any = null;
  try {
    if (fs.existsSync(stateFile)) state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  } catch { /* ignore */ }

  // Read bot-heartbeat.json for liveness — bot writes this every 15s cycle
  const hbFile = path.resolve(__dirname, 'bot-heartbeat.json');
  let hb: any = null;
  try {
    if (fs.existsSync(hbFile)) hb = JSON.parse(fs.readFileSync(hbFile, 'utf-8'));
  } catch { /* ignore */ }

  // Check PM2 process
  let pm2Status = 'unknown';
  try {
    const out = execSync('pm2 jlist', { stdio: 'pipe' }).toString();
    const list: any[] = JSON.parse(out);
    const bot = list.find((p: any) => p.name === BOT_NAME);
    pm2Status = bot?.pm2_env?.status ?? 'unknown';
  } catch { /* ignore */ }

  // Heartbeat: bot is alive if bot-heartbeat.json was written within last 3 minutes
  const hbTime = hb?.at ? new Date(hb.at).getTime() : 0;
  const isAlive = hbTime > 0 ? (Date.now() - hbTime) < 3 * 60 * 1000 : false;

  if (!isAlive && pm2Status !== 'online') {
    return { label: 'STOPPED', color: '#ff1744', detail: 'Bot not running' };
  }

  if (pm2Status === 'online' && !isAlive) {
    return { label: 'STARTING', color: '#ff9800', detail: 'PM2 online — waiting for first cycle' };
  }

  // Bot is alive — show trade state from heartbeat (live) + trade-state (entry details)
  const inTrade = hb?.inTrade || state?.activeTrade || state?.mainEntryDone;
  const dir = hb?.direction || state?.tradeDirection;
  if (inTrade && dir) {
    const entry = (hb?.entryPrice ?? state?.entryPrice) ? `@ ${hb?.entryPrice ?? state?.entryPrice}` : '';
    const livePrice = hb?.livePrice ? ` | Live: ${hb.livePrice}` : '';
    const unrealised = hb?.unrealisedPnL !== undefined
      ? ` | Unrealised: ${hb.unrealisedPnL >= 0 ? '+' : ''}${hb.unrealisedPnL} pts`
      : (hb?.dailyPnL !== undefined ? ` | P&L: ${hb.dailyPnL >= 0 ? '+' : ''}${hb.dailyPnL} pts` : '');
    const sl = hb?.entryPrice
      ? ` | SL: ${dir === 'CE' ? (hb.entryPrice - 100) : (hb.entryPrice + 100)}`
      : '';
    return {
      label: `IN TRADE · ${dir}`,
      color: dir === 'CE' ? '#58a6ff' : '#ff7b72',
      detail: `Entry ${entry}${livePrice}${unrealised}${sl}`,
    };
  }

  const pnlPts = hb?.dailyPnL !== undefined ? ` | Day: ${hb.dailyPnL >= 0 ? '+' : ''}${hb.dailyPnL} pts` : '';
  const trades = hb?.tradeCount ? ` | Trades: ${hb.tradeCount}` : (state?.tradeCount ? ` | Trades: ${state.tradeCount}` : '');
  return { label: 'RUNNING · FLAT', color: '#3fb950', detail: `Watching for signal${trades}${pnlPts}` };
}

function monthLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Root → redirect to dashboard ─────────────────────────────────────────────
app.get('/', (_req, res) => res.redirect('/dashboard'));

// ── Dashboard ─────────────────────────────────────────────────────────────────
app.get('/dashboard', (_req, res) => {
  const trades = readTrades();
  const today  = todayIST();
  const curMonth = today.slice(0, 7);
  const botStatus = getBotStatus();

  // Read heartbeat + state
  const hbFile = path.resolve(__dirname, 'bot-heartbeat.json');
  const stateFile = path.resolve(__dirname, 'trade-state.json');
  let hb: any = null;
  let state: any = null;
  try { if (fs.existsSync(hbFile)) hb = JSON.parse(fs.readFileSync(hbFile, 'utf-8')); } catch {}
  try { if (fs.existsSync(stateFile)) state = JSON.parse(fs.readFileSync(stateFile, 'utf-8')); } catch {}

  const pnlColor = (v: number) => v >= 0 ? '#3fb950' : '#ff7b72';
  const QTY_MULT = 15; // 30 qty × 0.5 delta — option premium ₹ per index pt
  const fmtPts   = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)} pts`;
  const fmtRs    = (v: number) => { const r = Math.round(v * QTY_MULT); return `${r >= 0 ? '+' : '−'}₹${Math.abs(r).toLocaleString('en-IN')}`; };
  const fmtBoth  = (v: number) => `${fmtPts(v)} <span class="rs-sub">${fmtRs(v)}</span>`;

  // Closed today trades only
  const todayTrades = trades.filter((t: any) => (t.date ?? '').startsWith(today));
  const closedTodayTrades = todayTrades.filter((t: any) => t.exitPrice && t.exitPrice > 0);

  // Stats
  const todayPnl  = closedTodayTrades.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);
  const monthTrades = trades.filter((t: any) => monthLabel(t.date ?? '') === curMonth);
  const monthPnl  = monthTrades.filter((t: any) => t.exitPrice > 0).reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);
  const allClosed = trades.filter((t: any) => t.exitPrice && t.exitPrice > 0);
  const totalPnl  = allClosed.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);
  const wins      = allClosed.filter((t: any) => t.pnl > 0).length;
  const winRate   = allClosed.length ? ((wins / allClosed.length) * 100).toFixed(0) : '0';

  // Active position data
  const inTrade  = !!(hb?.inTrade || state?.activeTrade || state?.mainEntryDone);
  const dir      = hb?.direction ?? state?.tradeDirection ?? null;
  const ep       = hb?.entryPrice ?? state?.entryPrice ?? 0;
  const live     = hb?.livePrice ?? 0;
  const unreal   = hb?.unrealisedPnL ?? 0;
  const slLevel  = ep > 0 && dir ? (dir === 'CE' ? ep - 100 : ep + 100) : 0;
  const sym      = state?.tradeSymbol ?? hb?.symbol ?? '';
  const qty      = state?.mainQty ?? state?.earlyQty ?? 0;
  const entryMs  = state?.entryTime ?? 0;
  const durationMin = entryMs > 0 ? Math.floor((Date.now() - entryMs) / 60000) : 0;
  const durationStr = durationMin >= 60
    ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
    : durationMin > 0 ? `${durationMin}m` : '—';
  const entryIST = entryMs > 0
    ? new Date(entryMs).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
    : '—';
  const mode = hb?.mode ?? state?.mode ?? 'PAPER';

  // Active position block
  const activeSection = inTrade && dir && ep > 0 ? `
  <div class="pos-card ${dir === 'CE' ? 'pos-ce' : 'pos-pe'}">
    <div class="pos-header">
      <span class="pos-live-dot"></span>
      <span class="pos-dir">${dir}</span>
      <span class="pos-symbol">${sym || 'BANKNIFTY'}</span>
      <span class="pos-mode">${mode.toUpperCase()}</span>
      <span class="pos-dur">${durationStr}</span>
    </div>
    <div class="pos-pnl" style="color:${pnlColor(unreal)}">${unreal >= 0 ? '+' : ''}${unreal.toFixed(0)} pts</div>
    <div class="pos-rupee" style="color:${pnlColor(unreal)}">${fmtRs(unreal)} <span style="font-size:.6rem;color:#8b949e">est. option P&L</span></div>
    <div class="pos-grid">
      <div class="pos-item"><span class="pi-label">Entry</span><span class="pi-val">${ep.toFixed(1)}</span></div>
      <div class="pos-item"><span class="pi-label">Live</span><span class="pi-val" style="color:#58a6ff">${live > 0 ? live.toFixed(1) : '…'}</span></div>
      <div class="pos-item"><span class="pi-label">SL</span><span class="pi-val" style="color:#ff7b72">${slLevel > 0 ? slLevel.toFixed(1) : '—'}</span></div>
      <div class="pos-item"><span class="pi-label">Qty</span><span class="pi-val">${qty > 0 ? qty : '—'}</span></div>
      <div class="pos-item"><span class="pi-label">In at</span><span class="pi-val">${entryIST}</span></div>
      <div class="pos-item"><span class="pi-label">Risk</span><span class="pi-val" style="color:#ff7b72">−100 pts</span></div>
    </div>
  </div>` : '';

  // Today's closed trades — single line
  const todayRows = [...closedTodayTrades].reverse().map((t: any) => {
    const tm = new Date(t.date).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
    const ep2 = (t.entryPrice ?? 0).toFixed(1);
    const xp  = (t.exitPrice  ?? 0).toFixed(1);
    const pts = t.pnl ?? 0;
    const reason = t.reasonExit ? `<span class="reason">${t.reasonExit}</span>` : '';
    return `<tr>
      <td class="tm">${tm}</td>
      <td><span class="badge ${t.direction === 'CE' ? 'ce' : 'pe'}">${t.direction ?? '—'}</span></td>
      <td class="mono">${ep2} → ${xp}</td>
      <td class="mono" style="color:${pnlColor(pts)};font-weight:600">${fmtBoth(pts)}</td>
      <td>${reason}</td>
    </tr>`;
  }).join('');

  const todayEmpty = !todayRows && !inTrade
    ? `<tr><td colspan="5" class="empty">No trades today</td></tr>` : '';

  // History — all non-today closed trades, newest first, single compact line
  const histTrades = allClosed.filter((t: any) => !(t.date ?? '').startsWith(today));
  const histRows = [...histTrades].reverse().map((t: any) => {
    const dt  = new Date(t.date);
    const dStr = dt.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });
    const tm  = dt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
    const ep2 = (t.entryPrice ?? 0).toFixed(0);
    const xp  = (t.exitPrice  ?? 0).toFixed(0);
    const pts = t.pnl ?? 0;
    return `<tr>
      <td class="tm">${dStr} ${tm}</td>
      <td><span class="badge ${t.direction === 'CE' ? 'ce' : 'pe'}">${t.direction ?? '—'}</span></td>
      <td class="mono">${ep2}→${xp}</td>
      <td class="mono" style="color:${pnlColor(pts)}">${fmtBoth(pts)}</td>
    </tr>`;
  }).join('');

  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="15">
  <title>Bot Dashboard</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',monospace;font-size:13px;padding:.75rem}
    /* ── Nav ── */
    .nav{display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.75rem}
    .nav a{padding:.3rem .7rem;background:#161b22;border:1px solid #30363d;border-radius:5px;color:#8b949e;text-decoration:none;font-size:.75rem}
    .nav a.cur{background:#1f3a5f;border-color:#58a6ff;color:#58a6ff}
    .nav a:hover{background:#21262d;color:#e6edf3}
    /* ── Title row ── */
    .title-row{display:flex;align-items:center;gap:.5rem;margin-bottom:.6rem}
    .title-row h1{font-size:.95rem;color:#e6edf3;font-weight:600}
    .sdot{width:8px;height:8px;border-radius:50%;background:${botStatus.color};flex-shrink:0}
    .slabel{font-size:.72rem;color:${botStatus.color};font-weight:600}
    /* ── Stats bar ── */
    .stats{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.75rem}
    .stat{background:#161b22;border:1px solid #30363d;border-radius:5px;padding:.3rem .6rem;display:flex;flex-direction:column;min-width:80px}
    .stat .sl{font-size:.65rem;color:#8b949e;margin-bottom:1px}
    .stat .sv{font-size:.85rem;font-weight:700}
    /* ── Active Position card ── */
    .pos-card{border-radius:8px;padding:.7rem .85rem;margin-bottom:.75rem;border:1px solid}
    .pos-ce{background:rgba(31,58,95,.35);border-color:#58a6ff55}
    .pos-pe{background:rgba(58,31,31,.35);border-color:#ff7b7255}
    .pos-header{display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem;flex-wrap:wrap}
    .pos-live-dot{width:7px;height:7px;border-radius:50%;background:#3fb950;animation:pulse 1.5s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    .pos-dir{font-size:.8rem;font-weight:700;padding:.15rem .45rem;border-radius:4px}
    .pos-ce .pos-dir{background:#1f3a5f;color:#58a6ff}
    .pos-pe .pos-dir{background:#3a1f1f;color:#ff7b72}
    .pos-symbol{font-size:.72rem;color:#8b949e;font-family:monospace}
    .pos-mode{font-size:.6rem;background:#2d333b;color:#8b949e;padding:.1rem .35rem;border-radius:3px}
    .pos-dur{font-size:.65rem;color:#8b949e;margin-left:auto}
    .pos-pnl{font-size:1.6rem;font-weight:700;letter-spacing:-.5px;margin:.2rem 0 .5rem}
    .pos-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.3rem .5rem}
    @media(min-width:420px){.pos-grid{grid-template-columns:repeat(6,1fr)}}
    .pos-item{display:flex;flex-direction:column}
    .pi-label{font-size:.6rem;color:#8b949e;text-transform:uppercase}
    .pi-val{font-size:.8rem;font-weight:600}
    /* ── Section ── */
    .section{background:#161b22;border:1px solid #30363d;border-radius:7px;padding:.5rem .7rem;margin-bottom:.65rem}
    .sec-title{font-size:.65rem;color:#8b949e;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem;font-weight:600}
    /* ── Tables ── */
    table{width:100%;border-collapse:collapse}
    td{padding:.3rem .4rem;border-bottom:1px solid #21262d;vertical-align:middle}
    tr:last-child td{border-bottom:none}
    .tm{color:#8b949e;font-size:.72rem;white-space:nowrap}
    .mono{font-family:monospace;font-size:.8rem}
    .badge{padding:.1rem .35rem;border-radius:3px;font-size:.68rem;font-weight:700}
    .ce{background:#1f3a5f;color:#58a6ff}
    .pe{background:#3a1f1f;color:#ff7b72}
    .reason{font-size:.68rem;color:#8b949e;background:#21262d;padding:.1rem .3rem;border-radius:3px}
    .empty{text-align:center;color:#444;padding:.8rem;font-size:.8rem}
    .rs-sub{font-size:.68rem;opacity:.8}
    .sv-sub{font-size:.65rem;opacity:.85;margin-top:1px}
    .pos-rupee{font-size:.82rem;font-weight:600;margin-top:.1rem}
    /* ── Footer ── */
    .footer{color:#30363d;font-size:.65rem;text-align:right;margin-top:.5rem}
  </style>
</head>
<body>
  <div class="nav">
    <a href="/dashboard" class="cur">⚡ BNF Bot</a>
    <a href="/equity">📈 Equity</a>
    <a href="/penny">💎 Penny</a>
    <a href="/core">⭐ Core</a>
    <a href="/paper-trades">📊 Paper</a>
    <a href="/submit">🔑 Token</a>
  </div>

  <div class="title-row">
    <span class="sdot"></span>
    <h1>BANKNIFTY Bot</h1>
    <span class="slabel">${botStatus.label}</span>
  </div>

  <div class="stats">
    <div class="stat"><span class="sl">Today P&amp;L</span><span class="sv" style="color:${pnlColor(todayPnl)}">${fmtPts(todayPnl)}</span><span class="sv-sub" style="color:${pnlColor(todayPnl)}">${fmtRs(todayPnl)}</span></div>
    <div class="stat"><span class="sl">Month (${curMonth.slice(5)})</span><span class="sv" style="color:${pnlColor(monthPnl)}">${fmtPts(monthPnl)}</span><span class="sv-sub" style="color:${pnlColor(monthPnl)}">${fmtRs(monthPnl)}</span></div>
    <div class="stat"><span class="sl">Total P&amp;L</span><span class="sv" style="color:${pnlColor(totalPnl)}">${fmtPts(totalPnl)}</span><span class="sv-sub" style="color:${pnlColor(totalPnl)}">${fmtRs(totalPnl)}</span></div>
    <div class="stat"><span class="sl">Win Rate</span><span class="sv">${winRate}%</span></div>
    <div class="stat"><span class="sl">Today Trades</span><span class="sv">${closedTodayTrades.length}${inTrade ? '<span style="color:#3fb950;font-size:.65rem"> +1 live</span>' : ''}</span></div>
    <div class="stat"><span class="sl">All Trades</span><span class="sv">${allClosed.length}</span></div>
  </div>

  ${activeSection}

  <div class="section">
    <div class="sec-title">Today — ${today}</div>
    <table>
      <tbody>
        ${todayRows}
        ${todayEmpty}
      </tbody>
    </table>
  </div>

  ${histTrades.length > 0 ? `
  <div class="section">
    <div class="sec-title">History (${histTrades.length} trades)</div>
    <table>
      <tbody>${histRows}</tbody>
    </table>
  </div>` : ''}

  <div class="footer">↻ 15s · ${now} IST</div>
</body>
</html>`);
});

// ── Step 1: Redirect to Kite login ───────────────────────────────────────────
app.get('/login', (req, res) => {
  if (!checkAuth(req, res)) return;
  const loginURL = kite.getLoginURL();
  console.log(`[token-server] Redirecting to Kite login: ${loginURL}`);
  res.redirect(loginURL);
});

// ── Step 2: Handle OAuth callback ────────────────────────────────────────────
app.get('/callback', async (req, res) => {
  const requestToken = req.query.request_token as string;
  const status       = req.query.status as string;

  if (status !== 'success' || !requestToken) {
    console.error('[token-server] Kite login failed or cancelled:', req.query);
    res.status(400).send('<h2>Login failed or cancelled. Try /login again.</h2>');
    return;
  }

  try {
    console.log('[token-server] Exchanging request_token for access_token...');
    const session     = await kite.generateSession(requestToken, process.env.API_SECRET!);
    const accessToken = session.access_token as string;

    // Write new token to .env
    let envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
    if (envContent.match(/^ACCESS_TOKEN=.*/m)) {
      envContent = envContent.replace(/^ACCESS_TOKEN=.*/m, `ACCESS_TOKEN=${accessToken}`);
    } else {
      envContent += `\nACCESS_TOKEN=${accessToken}`;
    }
    fs.writeFileSync(ENV_PATH, envContent, 'utf-8');
    console.log('[token-server] ✅ .env updated with new ACCESS_TOKEN');

    // Restart bot via PM2
    try {
      execSync(`pm2 restart ${BOT_NAME} --update-env`, { stdio: 'pipe' });
      console.log(`[token-server] ✅ PM2 process "${BOT_NAME}" restarted`);
    } catch (pmErr: any) {
      console.warn('[token-server] PM2 restart warning (bot may not be running yet):', pmErr?.message);
    }

    res.send(`
      <html><body style="font-family:monospace;padding:2rem;color:green">
      <h2>✅ Token refreshed successfully!</h2>
      <p>New token written to .env</p>
      <p>Trading bot restarted via PM2</p>
      <p style="color:#888;font-size:0.9em">Token starts with: ${accessToken.slice(0, 8)}...</p>
      <p><a href="/">← Back to home</a></p>
      </body></html>
    `);
  } catch (e: any) {
    console.error('[token-server] ❌ Token exchange failed:', e?.message ?? String(e));
    res.status(500).send(`<h2>Token exchange failed</h2><pre>${e?.message}</pre>`);
  }
});

// ── Step 2 (Option D): Manual token paste form ───────────────────────────────
app.use(express.urlencoded({ extended: true }));

const SUBMIT_HTML = `
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body{font-family:monospace;padding:1.5rem;max-width:520px;margin:auto;background:#0d1117;color:#e6edf3}
    h2{font-size:1.2rem;color:#f0c040}
    input[type=text]{width:100%;padding:0.7rem;font-size:0.95rem;box-sizing:border-box;margin:0.5rem 0;background:#161b22;border:1px solid #30363d;color:#e6edf3;border-radius:6px}
    input[type=text]:focus{outline:none;border-color:#58a6ff}
    button{width:100%;padding:0.9rem;font-size:1rem;background:#238636;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600}
    button:hover{background:#2ea043}
    .hint{color:#8b949e;font-size:0.83rem;margin-top:0.8rem}
    .steps{background:#161b22;border:1px solid #30363d;padding:1rem;border-radius:6px;margin-bottom:1.2rem;font-size:0.85rem;line-height:2}
    .steps a{color:#58a6ff}
    .label{font-size:0.85rem;color:#8b949e;margin-bottom:2px}
  </style>
</head>
<body>
  <h2>🔑 Zerodha Token Refresh</h2>
  <div class="steps">
    <b>Steps:</b><br>
    1. Click → <a href="https://kite.zerodha.com/connect/login?v=3&api_key=7an6kfp8opzq0zai" target="_blank">Login to Zerodha ↗</a><br>
    2. Login with your PIN &amp; TOTP<br>
    3. After login, browser shows an error page — that is OK<br>
    4. <b>Copy the full URL</b> from the address bar<br>
    5. Paste the URL below and click Submit
  </div>
  <div class="label">Paste the full redirect URL here:</div>
  <form method="POST" action="/submit">
    <input type="text" name="token" placeholder="https://127.0.0.1/?request_token=xxxxx&action=login&status=success" autofocus autocomplete="off" />
    <button type="submit">✅ Submit &amp; Restart Bot</button>
  </form>
  <p class="hint">You can paste the full URL — the token will be extracted automatically.</p>
</body>
</html>`;

app.get('/submit', (_req, res) => {
  res.send(SUBMIT_HTML);
});

app.post('/submit', async (req, res) => {
  const raw = (req.body.token as string ?? '').trim();
  // Accept either a full URL or a raw token
  let requestToken = raw;
  if (raw.includes('request_token=')) {
    try {
      const u = new URL(raw.startsWith('http') ? raw : 'http://x?' + raw.split('?')[1]);
      requestToken = u.searchParams.get('request_token') ?? raw;
    } catch { /* fall through — use raw */ }
  }
  requestToken = requestToken.split('&')[0]; // strip trailing params if URL parse failed
  if (!requestToken) {
    res.status(400).send('<h2>No token found. <a href="/submit">Go back</a></h2>');
    return;
  }

  try {
    console.log('[token-server] Exchanging pasted request_token...');
    const session     = await kite.generateSession(requestToken, process.env.API_SECRET!);
    const accessToken = session.access_token as string;

    let envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
    if (envContent.match(/^ACCESS_TOKEN=.*/m)) {
      envContent = envContent.replace(/^ACCESS_TOKEN=.*/m, `ACCESS_TOKEN=${accessToken}`);
    } else {
      envContent += `\nACCESS_TOKEN=${accessToken}`;
    }
    fs.writeFileSync(ENV_PATH, envContent, 'utf-8');
    console.log('[token-server] ✅ .env updated with new ACCESS_TOKEN');

    try {
      execSync('git pull', { stdio: 'pipe', cwd: process.cwd() });
      console.log('[token-server] ✅ git pull done');
    } catch (gitErr: any) {
      console.warn('[token-server] git pull warning:', gitErr?.message);
    }

    try {
      execSync(`pm2 restart ${BOT_NAME} --update-env`, { stdio: 'pipe' });
      console.log(`[token-server] ✅ PM2 process "${BOT_NAME}" restarted`);
    } catch (pmErr: any) {
      console.warn('[token-server] PM2 restart warning:', pmErr?.message);
    }

    res.send(`
      <html>
      <head><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{font-family:monospace;padding:1.5rem;max-width:480px;margin:auto}</style>
      </head>
      <body style="color:green">
        <h2>✅ Token refreshed!</h2>
        <p>Bot restarted via PM2.</p>
        <p style="color:#888;font-size:0.9em">Token: ${accessToken.slice(0, 8)}...</p>
        <p><a href="/submit">← Submit another</a></p>
      </body></html>
    `);
  } catch (e: any) {
    console.error('[token-server] ❌ Token exchange failed:', e?.message ?? String(e));
    res.status(500).send(`
      <html>
      <head><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{font-family:monospace;padding:1.5rem;max-width:480px;margin:auto}</style>
      </head>
      <body style="color:red">
        <h2>❌ Failed: ${e?.message}</h2>
        <p>Token may have expired (they last ~60 seconds). <a href="/submit">Try again</a>.</p>
      </body></html>
    `);
  }
});

// ── Equity Dashboard helpers ──────────────────────────────────────────────────
function readEquityWatchlist(): any[] {
  const p = path.resolve(__dirname, 'equity-watchlist.json');
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return []; }
}
function readEquityTrades(): any[] {
  const p = path.resolve(__dirname, 'equity-trades.json');
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return []; }
}
function readEquityLog(): any[] {
  const p = path.resolve(__dirname, 'equity-tradelog.json');
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return []; }
}

// ── Equity Swing Dashboard ────────────────────────────────────────────────────
app.get('/equity', (_req, res) => {
  const pnlColor = (v: number) => v >= 0 ? '#3fb950' : '#ff7b72';

  const watchlist    = readEquityWatchlist();
  const activeTrades = readEquityTrades().filter((t: any) => !t.exitDone);
  const closedTrades = readEquityLog();

  const tomorrow = watchlist.filter((w: any) => !w.entryDone && !w.exitDone);

  const totalEquityPnl = closedTrades.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);
  const equityWins     = closedTrades.filter((t: any) => (t.pnl ?? 0) > 0).length;
  const equityWinRate  = closedTrades.length ? ((equityWins / closedTrades.length) * 100).toFixed(1) : '0.0';
  const scanDate       = tomorrow.length > 0 ? (tomorrow[0].addedDate ?? '—') : '—';

  // ── Tomorrow's picks cards ────────────────────────────────────────────────
  const watchCards = tomorrow.length === 0
    ? '<p style="color:#555;padding:1.5rem 0.5rem;font-size:0.9rem">⏳ No signals yet. Scanner runs at 7:30 PM IST.</p>'
    : tomorrow.map((w: any) => {
        const isBull = w.direction === 'BULLISH';
        const dirBadge = isBull
          ? '<span style="background:#1a3a2a;color:#3fb950;padding:0.2rem 0.7rem;border-radius:4px;font-size:0.8rem;font-weight:700">▲ BULLISH</span>'
          : '<span style="background:#3a1f1f;color:#ff7b72;padding:0.2rem 0.7rem;border-radius:4px;font-size:0.8rem;font-weight:700">▼ BEARISH</span>';
        const fnoTag = w.isFno ? '' : ' <span style="color:#e3b341;font-size:0.75rem">⚠ not F&O</span>';
        const reasons = (w.reasons ?? []).slice(0, 3).join(' &nbsp;·&nbsp; ');
        const entryNote = isBull
          ? '📦 Equity BUY (CNC) · Capital ₹50,000 · Qty set at 9:20 AM open price'
          : '📉 PE option BUY · Strike ~2% OTM · Max premium ₹200/share';
        return `
        <div style="background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:1rem;margin-bottom:0.75rem">
          <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.7rem">
            <span style="font-size:1.25rem;font-weight:700">${w.symbol}</span>
            ${dirBadge}${fnoTag}
            <span style="margin-left:auto;color:#8b949e;font-size:0.85rem">Score: <b style="color:#e6edf3">${w.score >= 0 ? '+' : ''}${w.score}</b></span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.5rem;margin-bottom:0.7rem;text-align:center">
            <div style="background:#161b22;border-radius:6px;padding:0.5rem">
              <div style="color:#8b949e;font-size:0.7rem;margin-bottom:0.2rem">CAPITAL</div>
              <div style="font-weight:700;color:#58a6ff;font-size:0.95rem">₹50,000</div>
            </div>
            <div style="background:#161b22;border-radius:6px;padding:0.5rem">
              <div style="color:#8b949e;font-size:0.7rem;margin-bottom:0.2rem">TARGET</div>
              <div style="font-weight:700;color:#3fb950;font-size:0.95rem">+4%</div>
            </div>
            <div style="background:#161b22;border-radius:6px;padding:0.5rem">
              <div style="color:#8b949e;font-size:0.7rem;margin-bottom:0.2rem">STOP LOSS</div>
              <div style="font-weight:700;color:#ff7b72;font-size:0.95rem">−1.5%</div>
            </div>
            <div style="background:#161b22;border-radius:6px;padding:0.5rem">
              <div style="color:#8b949e;font-size:0.7rem;margin-bottom:0.2rem">MAX HOLD</div>
              <div style="font-weight:700;color:#e6edf3;font-size:0.95rem">5 days</div>
            </div>
          </div>
          <div style="color:#6e7681;font-size:0.8rem">${entryNote}</div>
          ${reasons ? `<div style="color:#8b949e;font-size:0.78rem;margin-top:0.4rem">📌 ${reasons}</div>` : ''}
        </div>`;
      }).join('');

  // ── Active positions table ────────────────────────────────────────────────
  const activeRows = activeTrades.length === 0
    ? '<tr><td colspan="9" style="text-align:center;color:#555;padding:1.5rem">No open positions</td></tr>'
    : activeTrades.map((t: any) => {
        const daysHeld = Math.floor((Date.now() - new Date(t.entryDate).getTime()) / 86400000);
        const capital  = ((t.entryPrice ?? 0) * (t.qty ?? 0)).toFixed(0);
        const isBull   = t.direction === 'BULLISH';
        const badge    = isBull
          ? '<span class="badge bull">▲ BULL</span>'
          : '<span class="badge bear">▼ BEAR</span>';
        const targetPct = t.entryPrice ? (((t.target - t.entryPrice) / t.entryPrice) * 100).toFixed(1) : '';
        return `<tr>
          <td><b>${t.symbol}</b></td>
          <td>${badge}</td>
          <td>${t.entryDate?.slice(5) ?? '—'}</td>
          <td>₹${(t.entryPrice ?? 0).toFixed(2)}</td>
          <td>${t.qty ?? '—'}</td>
          <td>₹${capital}</td>
          <td style="color:#3fb950">₹${(t.target ?? 0).toFixed(2)}<span style="color:#555;font-size:0.75rem"> (+${targetPct}%)</span></td>
          <td style="color:#ff7b72">₹${(t.sl ?? 0).toFixed(2)}</td>
          <td>${daysHeld}d</td>
        </tr>`;
      }).join('');

  // ── Closed trades table ───────────────────────────────────────────────────
  const closedRows = closedTrades.length === 0
    ? '<tr><td colspan="6" style="text-align:center;color:#555;padding:1.5rem">No completed trades yet</td></tr>'
    : [...closedTrades].reverse().slice(0, 25).map((t: any) => {
        const pnl = t.pnl ?? 0;
        return `<tr>
          <td><b>${t.symbol}</b></td>
          <td style="color:#8b949e;font-size:0.8rem">${t.entryDate?.slice(5) ?? '—'} → ${t.exitDate?.slice(5) ?? '—'}</td>
          <td>${t.qty ?? '—'}</td>
          <td>₹${(t.entryPrice ?? 0).toFixed(1)} → ₹${(t.exitPrice ?? 0).toFixed(1)}</td>
          <td style="color:${pnlColor(pnl)};font-weight:700">${pnl >= 0 ? '+' : ''}₹${pnl.toFixed(0)}</td>
          <td style="color:#6e7681;font-size:0.8rem">${t.exitReason ?? '—'}</td>
        </tr>`;
      }).join('');

  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="60">
  <title>Equity Swing Dashboard</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:1rem;max-width:960px;margin:0 auto}
    h1{font-size:1.25rem;margin-bottom:1rem;color:#58a6ff}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem;margin-bottom:1rem}
    @media(min-width:600px){.grid{grid-template-columns:repeat(4,1fr)}}
    .card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem}
    .card .label{font-size:0.75rem;color:#8b949e;margin-bottom:0.3rem}
    .card .value{font-size:1.4rem;font-weight:700}
    .section{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem;margin-bottom:1rem}
    .section h2{font-size:0.82rem;color:#8b949e;margin-bottom:0.85rem;text-transform:uppercase;letter-spacing:0.05em}
    table{width:100%;border-collapse:collapse;font-size:0.85rem}
    th{text-align:left;color:#8b949e;font-weight:500;padding:0.4rem 0.5rem;border-bottom:1px solid #30363d}
    td{padding:0.5rem;border-bottom:1px solid #21262d;vertical-align:middle}
    .badge{padding:0.15rem 0.5rem;border-radius:4px;font-size:0.75rem;font-weight:700}
    .bull{background:#1a3a2a;color:#3fb950}
    .bear{background:#3a1f1f;color:#ff7b72}
    .nav{display:flex;gap:0.5rem;margin-bottom:1rem;flex-wrap:wrap}
    .nav a{padding:0.4rem 0.9rem;background:#21262d;border:1px solid #30363d;border-radius:6px;color:#e6edf3;text-decoration:none;font-size:0.85rem}
    .nav a.active{background:#58a6ff;color:#0d1117;border-color:#58a6ff;font-weight:600}
    .nav a:hover{background:#30363d}
  </style>
</head>
<body>
  <h1>📈 Equity Swing Dashboard</h1>
  <div class="nav">
    <a href="/dashboard">⚡ BANKNIFTY Bot</a>
    <a href="/equity" class="active">📈 Equity Swing</a>
    <a href="/penny">💎 Penny Stocks</a>
    <a href="/core">⭐ Core Stocks</a>
    <a href="/paper-trades">📊 Paper Trades</a>
    <a href="/checklist">📋 Checklist</a>
    <a href="/submit">🔑 Token</a>
  </div>

  <div class="grid">
    <div class="card">
      <div class="label">Tomorrow's Picks</div>
      <div class="value" style="color:#58a6ff">${tomorrow.length}</div>
    </div>
    <div class="card">
      <div class="label">Open Positions</div>
      <div class="value">${activeTrades.length}</div>
    </div>
    <div class="card">
      <div class="label">Total Equity P&L</div>
      <div class="value" style="color:${pnlColor(totalEquityPnl)}">${totalEquityPnl >= 0 ? '+' : ''}₹${totalEquityPnl.toFixed(0)}</div>
    </div>
    <div class="card">
      <div class="label">Win Rate (${closedTrades.length} trades)</div>
      <div class="value">${equityWinRate}%</div>
    </div>
  </div>

  <div class="section">
    <h2>📅 Tomorrow's Trade Picks &nbsp;<span style="color:#444;font-weight:400;text-transform:none">scanned ${scanDate}</span></h2>
    ${watchCards}
  </div>

  <div class="section">
    <h2>⚡ Open Positions (${activeTrades.length})</h2>
    <div style="overflow-x:auto">
    <table>
      <thead><tr>
        <th>Symbol</th><th>Dir</th><th>Entry Date</th><th>Entry ₹</th>
        <th>Qty</th><th>Capital</th><th>Target</th><th>Stop Loss</th><th>Days</th>
      </tr></thead>
      <tbody>${activeRows}</tbody>
    </table>
    </div>
  </div>

  <div class="section">
    <h2>✅ Completed Trades</h2>
    <div style="overflow-x:auto">
    <table>
      <thead><tr><th>Symbol</th><th>Period</th><th>Qty</th><th>Price</th><th>P&L</th><th>Exit Reason</th></tr></thead>
      <tbody>${closedRows}</tbody>
    </table>
    </div>
  </div>

  <p style="color:#333;font-size:0.75rem;text-align:center;margin-top:1rem">
    Auto-refreshes every 60s &nbsp;·&nbsp; ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
  </p>
</body>
</html>`);
});

function readPennyWatchlist(): any[] {
  const p = path.resolve(__dirname, 'penny-watchlist.json');
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return []; }
}

// ── Penny Stock Dashboard ─────────────────────────────────────────────────────
app.get('/penny', (_req, res) => {
  const pnlColor = (v: number) => v >= 0 ? '#3fb950' : '#ff7b72';
  const picks = readPennyWatchlist();
  const scanDate = picks.length > 0 ? (picks[0].scannedDate ?? '—') : '—';

  const pickCards = picks.length === 0
    ? '<p style="color:#555;padding:1.5rem 0.5rem;font-size:0.9rem">⏳ No data. Run: <code style="background:#161b22;padding:0.1rem 0.4rem;border-radius:4px">npm run penny-scan</code></p>'
    : picks.map((p: any, idx: number) => {
        const volK = p.volume >= 1000000
          ? (p.volume / 1000000).toFixed(1) + 'M'
          : (p.volume / 1000).toFixed(0) + 'K';
        const upside100 = (((p.target100 - p.price) / p.price) * 100).toFixed(0);
        const reasons = (p.reasons ?? []).slice(0, 3).join(' &nbsp;·&nbsp; ');
        const f = p.fundamentals;
        const fundHtml = !f ? '' :
          !f.fetched ? '<span style="color:#555;font-size:0.75rem">no data</span>' :
          f.rejected  ? `<span style="color:#f85149;font-size:0.75rem">❌ ${f.rejectReason}</span>` :
          f.fundFlags.slice(0,2).map((fl: string) =>
            `<span style="font-size:0.73rem;color:${fl.includes('✅')?'#3fb950':fl.includes('❌')?'#f85149':'#e3b341'}">${fl}</span>`
          ).join(' ');
        return `
        <tr data-price="${p.price}" data-score="${p.score}">
          <td><span style="color:#8b949e;font-size:0.8rem">${idx + 1}.</span> <b>${p.symbol}</b><br>
              <span style="color:#6e7681;font-size:0.78rem">${p.name ?? ''}</span></td>
          <td style="font-weight:700;color:#58a6ff">₹${p.price}</td>
          <td>${volK}</td>
          <td style="color:#3fb950;font-weight:600">+${p.score}</td>
          <td style="color:#3fb950">₹${p.target50}</td>
          <td style="color:#e3b341">₹${p.target100} <span style="color:#555;font-size:0.75rem">(${upside100}%)</span></td>
          <td style="color:#ff7b72">₹${p.sl}</td>
          <td class="qty-cell" style="color:#58a6ff;font-weight:600">—</td>
          <td class="amt-cell" style="color:#8b949e;font-size:0.8rem">—</td>
          <td style="color:#6e7681;font-size:0.78rem">${reasons}</td>
          <td>${fundHtml}</td>
        </tr>`;
      }).join('');

  // Build JSON of picks for JS calculator
  const picksJson = JSON.stringify(picks.map((p: any) => ({ symbol: p.symbol, price: p.price, score: p.score })));

  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="300">
  <title>Penny Stock Scanner</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:1rem;max-width:1200px;margin:0 auto}
    h1{font-size:1.25rem;margin-bottom:0.3rem;color:#58a6ff}
    .subtitle{color:#6e7681;font-size:0.85rem;margin-bottom:1rem}
    .warning{background:#2d1a00;border:1px solid #e3b341;border-radius:8px;padding:0.75rem 1rem;margin-bottom:1rem;font-size:0.85rem;color:#e3b341}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem;margin-bottom:1rem}
    @media(min-width:600px){.grid{grid-template-columns:repeat(4,1fr)}}
    .card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem}
    .card .label{font-size:0.75rem;color:#8b949e;margin-bottom:0.3rem}
    .card .value{font-size:1.4rem;font-weight:700}
    .section{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem;margin-bottom:1rem}
    .section h2{font-size:0.82rem;color:#8b949e;margin-bottom:0.85rem;text-transform:uppercase;letter-spacing:0.05em}
    table{width:100%;border-collapse:collapse;font-size:0.85rem}
    th{text-align:left;color:#8b949e;font-weight:500;padding:0.4rem 0.5rem;border-bottom:1px solid #30363d}
    td{padding:0.55rem 0.5rem;border-bottom:1px solid #21262d;vertical-align:top}
    .nav{display:flex;gap:0.5rem;margin-bottom:1rem;flex-wrap:wrap}
    .nav a{padding:0.4rem 0.9rem;background:#21262d;border:1px solid #30363d;border-radius:6px;color:#e6edf3;text-decoration:none;font-size:0.85rem}
    .nav a.active{background:#e3b341;color:#0d1117;border-color:#e3b341;font-weight:600}
    .nav a:hover{background:#30363d}
    code{background:#161b22;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.85rem;color:#79c0ff}
    .calc-box{background:#0d1117;border:1px solid #e3b341;border-radius:8px;padding:1rem;margin-bottom:1rem}
    .calc-box h2{color:#e3b341;font-size:0.9rem;margin-bottom:0.75rem}
    .calc-row{display:flex;flex-wrap:wrap;gap:0.75rem;align-items:flex-end}
    .calc-field{display:flex;flex-direction:column;gap:0.3rem}
    .calc-field label{font-size:0.75rem;color:#8b949e}
    .calc-field input,.calc-field select{background:#161b22;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:0.45rem 0.7rem;font-size:0.9rem;width:160px}
    .calc-btn{background:#e3b341;color:#0d1117;border:none;border-radius:6px;padding:0.5rem 1.2rem;font-size:0.9rem;font-weight:700;cursor:pointer}
    .calc-summary{margin-top:0.85rem;background:#161b22;border-radius:6px;padding:0.75rem 1rem;font-size:0.85rem;color:#8b949e;display:none}
    .calc-summary.show{display:block}
    .calc-summary b{color:#e6edf3}
  </style>
</head>
<body>
  <h1>💎 Penny Stock Scanner</h1>
  <p class="subtitle">Zero-to-Hero picks · ₹1–₹100 · NSE filings based · Long-term hold (6 months–2 years)</p>
  <div class="nav">
    <a href="/dashboard">⚡ BANKNIFTY Bot</a>
    <a href="/equity">📈 Equity Swing</a>
    <a href="/penny" class="active">💎 Penny Stocks</a>
    <a href="/core">⭐ Core Stocks</a>
    <a href="/paper-trades">📊 Paper Trades</a>
    <a href="/checklist">📋 Checklist</a>
    <a href="/submit">🔑 Token</a>
  </div>

  <div class="warning">
    ⚠️ <b>High Risk Warning:</b> Penny stocks are speculative. Many are illiquid or manipulated.
    This scanner uses NSE filing signals + Yahoo Finance fundamentals (D/E, ROE, profit). Loss-making and high-debt stocks are automatically filtered out. Always verify before investing.
    Never invest money you can't afford to lose.
  </div>

  <div class="grid">
    <div class="card">
      <div class="label">Total Picks</div>
      <div class="value" style="color:#e3b341">${picks.length}</div>
    </div>
    <div class="card">
      <div class="label">Last Scanned</div>
      <div class="value" style="font-size:1rem">${scanDate}</div>
    </div>
    <div class="card">
      <div class="label">Price Range</div>
      <div class="value" style="font-size:1rem">₹1 – ₹100</div>
    </div>
    <div class="card">
      <div class="label">Targets</div>
      <div class="value" style="font-size:1rem;color:#3fb950">+50% / +100%</div>
    </div>
  </div>

  <!-- ── Quantity Calculator ── -->
  <div class="calc-box">
    <h2>🧮 Quantity &amp; Budget Calculator</h2>
    <div class="calc-row">
      <div class="calc-field">
        <label>Total Budget (₹)</label>
        <input type="number" id="budget" value="50000" min="1000" step="1000">
      </div>
      <div class="calc-field">
        <label>Allocate by</label>
        <select id="allocMode">
          <option value="equal">Equal split across all picks</option>
          <option value="score">Weighted by score (higher score = more ₹)</option>
        </select>
      </div>
      <div class="calc-field">
        <label>Max stocks</label>
        <select id="maxStocks">
          <option value="5">Top 5</option>
          <option value="10" selected>Top 10</option>
          <option value="15">Top 15</option>
          <option value="999">All</option>
        </select>
      </div>
      <button class="calc-btn" onclick="calculate()">Calculate</button>
    </div>
    <div class="calc-summary" id="calcSummary"></div>
  </div>

  <div class="section">
    <h2>💎 Top Penny Picks &nbsp;<span style="color:#444;font-weight:400;text-transform:none;font-size:0.8rem">Run <code>npm run penny-scan</code> to refresh</span></h2>
    <div style="overflow-x:auto">
    <table id="pennyTable">
      <thead><tr>
        <th>Symbol</th>
        <th>Price</th>
        <th>Volume</th>
        <th>Score</th>
        <th>Target +50%</th>
        <th>Target +100%</th>
        <th>SL −20%</th>
        <th>Qty</th>
        <th>Amount</th>
        <th>Signals</th>
        <th>Fundamentals</th>
      </tr></thead>
      <tbody>${pickCards}</tbody>
    </table>
    </div>
  </div>

  <div class="section" style="background:#0d1117;border:1px solid #21262d">
    <h2>📖 How to Use</h2>
    <div style="font-size:0.85rem;color:#8b949e;line-height:1.8">
      <b style="color:#e6edf3">Step 1:</b> Run <code>npm run penny-scan</code> any evening to get fresh picks.<br>
      <b style="color:#e6edf3">Step 2:</b> Enter your budget above and click Calculate to see qty per stock.<br>
      <b style="color:#e6edf3">Step 3:</b> Research each stock (balance sheet, promoter %, debt) before buying.<br>
      <b style="color:#e6edf3">Step 4:</b> Hold 6 months–2 years. Exit at +50% (sell half) or +100% (exit all). Cut at −20% SL.<br>
      <b style="color:#e6edf3">Score guide:</b> +4 = buyback/promoter buy (strongest) · +3 = order/contract · +2 = dividend · +1 = mild signal
    </div>
  </div>

  <p style="color:#333;font-size:0.75rem;text-align:center;margin-top:1rem">
    Auto-refreshes every 5 min &nbsp;·&nbsp; ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
  </p>

<script>
const PICKS = ${picksJson};

function calculate() {
  const budget    = parseFloat(document.getElementById('budget').value) || 50000;
  const mode      = document.getElementById('allocMode').value;
  const maxN      = parseInt(document.getElementById('maxStocks').value) || 10;
  const picks     = PICKS.slice(0, maxN);
  if (!picks.length) return;

  // Compute per-stock allocation
  let allocs = [];
  if (mode === 'equal') {
    const perStock = budget / picks.length;
    allocs = picks.map(p => ({ ...p, alloc: perStock }));
  } else {
    const totalScore = picks.reduce((s, p) => s + p.score, 0);
    allocs = picks.map(p => ({ ...p, alloc: (p.score / totalScore) * budget }));
  }

  // Update table rows
  const rows = document.querySelectorAll('#pennyTable tbody tr');
  let usedTotal = 0;
  rows.forEach((row, idx) => {
    const qtdCell = row.querySelector('.qty-cell');
    const amtCell = row.querySelector('.amt-cell');
    if (!qtdCell || !amtCell) return;
    const pick = allocs.find(a => a.symbol === row.querySelector('b')?.textContent);
    if (pick) {
      const qty = Math.floor(pick.alloc / pick.price);
      const amt = qty * pick.price;
      usedTotal += amt;
      qtdCell.textContent = qty > 0 ? qty.toString() : '—';
      qtdCell.style.color = qty > 0 ? '#58a6ff' : '#555';
      amtCell.textContent = qty > 0 ? '₹' + amt.toFixed(0) : '—';
    } else {
      qtdCell.textContent = '—'; qtdCell.style.color = '#555';
      amtCell.textContent = '—';
    }
  });

  // Summary
  const perStockAvg = usedTotal / picks.length;
  const summary = document.getElementById('calcSummary');
  summary.className = 'calc-summary show';
  summary.innerHTML =
    '<b>Budget: ₹' + budget.toLocaleString('en-IN') + '</b> across <b>' + picks.length + ' stocks</b>' +
    ' &nbsp;·&nbsp; Deployed: <b style="color:#3fb950">₹' + usedTotal.toFixed(0) + '</b>' +
    ' &nbsp;·&nbsp; Avg per stock: <b>₹' + perStockAvg.toFixed(0) + '</b>' +
    ' &nbsp;·&nbsp; Leftover: <b style="color:#8b949e">₹' + (budget - usedTotal).toFixed(0) + '</b><br>' +
    '<span style="font-size:0.8rem;color:#6e7681">Hold 6 months–2 years · Exit at +50% (sell half) or +100% (exit all) · Cut at −20% SL</span>';
}
// Auto-calculate on load
window.onload = calculate;
</script>
</body>
</html>`);
});

// ── Daily Checklist Page ──────────────────────────────────────────────────────
app.get('/checklist', (req, res) => {
  const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const hhmm = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
  const [hh] = hhmm.split(':').map(Number);

  const done  = (t: string) => `<span style="color:#3fb950">✅</span> ${t}`;
  const now_  = (t: string) => `<span style="color:#e3b341">▶</span> <b>${t}</b>`;
  const todo_ = (t: string) => `<span style="color:#555">○</span> <span style="color:#8b949e">${t}</span>`;

  function step(minH: number, maxH: number, text: string): string {
    if (hh > maxH) return done(text);
    if (hh >= minH) return now_(text);
    return todo_(text);
  }

  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="60">
  <title>Daily Trading Checklist</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:1rem;max-width:700px;margin:0 auto}
    h1{font-size:1.2rem;color:#58a6ff;margin-bottom:0.3rem}
    .subtitle{color:#6e7681;font-size:0.82rem;margin-bottom:1rem}
    .nav{display:flex;gap:0.5rem;margin-bottom:1rem;flex-wrap:wrap}
    .nav a{padding:0.4rem 0.9rem;background:#21262d;border:1px solid #30363d;border-radius:6px;color:#e6edf3;text-decoration:none;font-size:0.85rem}
    .nav a.active{background:#58a6ff;color:#0d1117;font-weight:600;border-color:#58a6ff}
    .nav a:hover{background:#30363d}
    .block{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem;margin-bottom:0.75rem}
    .block .time{font-size:0.75rem;color:#58a6ff;font-weight:700;margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.05em}
    .block .title{font-size:1rem;font-weight:700;margin-bottom:0.6rem}
    .block ul{list-style:none;padding:0}
    .block ul li{padding:0.3rem 0;font-size:0.88rem;line-height:1.5;border-bottom:1px solid #21262d}
    .block ul li:last-child{border:none}
    .block a{color:#58a6ff;font-size:0.82rem}
    .tag{display:inline-block;padding:0.1rem 0.45rem;border-radius:4px;font-size:0.72rem;font-weight:700;margin-left:0.4rem;vertical-align:middle}
    .tag-auto{background:#1a3a2a;color:#3fb950}
    .tag-manual{background:#1f2a3a;color:#58a6ff}
    .tag-now{background:#3a2a00;color:#e3b341}
  </style>
</head>
<body>
  <h1>📋 Daily Trading Checklist</h1>
  <p class="subtitle">Current time: ${nowIST} &nbsp;·&nbsp; Auto-refreshes every 60s</p>
  <div class="nav">
    <a href="/dashboard">⚡ BANKNIFTY</a>
    <a href="/equity">📈 Equity</a>
    <a href="/penny">💎 Penny</a>
    <a href="/core">⭐ Core</a>
    <a href="/paper-trades">📊 Paper Trades</a>
    <a href="/checklist" class="active">📋 Checklist</a>
    <a href="/submit">🔑 Token</a>
  </div>

  <!-- PRE-MARKET -->
  <div class="block">
    <div class="time">⏰ Before 9:15 AM</div>
    <div class="title">Pre-Market Setup</div>
    <ul>
      <li>${step(0, 8, 'Refresh Zerodha access token')} <span class="tag tag-manual">MANUAL</span><br>
        <a href="/submit">→ http://${req.headers.host}/submit</a></li>
      <li>${step(0, 8, 'Check equity picks for today')} <span class="tag tag-auto">AUTO (scanner ran 7:30 PM)</span><br>
        <a href="/equity">→ http://${req.headers.host}/equity</a></li>
      <li>${step(0, 8, 'Check penny watchlist (no daily action needed)')} <span class="tag tag-auto">LONG-TERM</span><br>
        <a href="/penny">→ http://${req.headers.host}/penny</a></li>
      <li>${step(0, 8, 'Ensure PM2 processes are running')} <span class="tag tag-auto">AUTO</span></li>
    </ul>
  </div>

  <!-- MARKET OPEN -->
  <div class="block">
    <div class="time">🟢 9:15 AM — Market Open</div>
    <div class="title">BANKNIFTY + Equity Entries</div>
    <ul>
      <li>${step(9, 9, 'BANKNIFTY bot starts automatically (HYBRID_REVERSE)')} <span class="tag tag-auto">AUTO</span><br>
        <span style="color:#6e7681;font-size:0.8rem">Qty: 30 | Capital: ₹2L | SL: 100 pts | Target: EOD</span></li>
      <li>${step(9, 9, 'Equity entry window: 9:15 AM – 9:45 AM')} <span class="tag tag-auto">AUTO</span><br>
        <span style="color:#6e7681;font-size:0.8rem">Bot checks gap-up (BULLISH) or gap-down (BEARISH → PE option)</span></li>
      <li>${step(9, 9, 'Monitor first candle — no manual intervention needed')} <span class="tag tag-manual">WATCH</span></li>
    </ul>
  </div>

  <!-- MID-DAY -->
  <div class="block">
    <div class="time">☀️ 9:45 AM – 3:15 PM — Intraday</div>
    <div class="title">Monitor & Wait</div>
    <ul>
      <li>${step(10, 14, 'BANKNIFTY: bot manages SL, reverse, C1 exits — no action')} <span class="tag tag-auto">AUTO</span></li>
      <li>${step(10, 14, 'Equity swing: SL/target monitor runs every 15 min')} <span class="tag tag-auto">AUTO</span></li>
      <li>${step(10, 14, 'Check midday P&L if curious')} <span class="tag tag-manual">OPTIONAL</span><br>
        <a href="/dashboard">→ Dashboard</a></li>
      <li>${todo_('Do NOT override bot decisions — trust the strategy')}</li>
    </ul>
  </div>

  <!-- PRE-CLOSE -->
  <div class="block">
    <div class="time">⚠️ 3:15 PM – 3:30 PM — Pre-Close</div>
    <div class="title">Square-Off Window</div>
    <ul>
      <li>${step(15, 15, 'BANKNIFTY bot exits at 3:15 PM (EOD exit)')} <span class="tag tag-auto">AUTO</span></li>
      <li>${step(15, 15, 'PE options (MIS) auto sq-off by broker at 3:25 PM')} <span class="tag tag-auto">AUTO</span></li>
      <li>${step(15, 15, 'CNC equity positions carry over to next day')} <span class="tag tag-auto">HOLD</span></li>
    </ul>
  </div>

  <!-- EOD -->
  <div class="block">
    <div class="time">🔴 3:30 PM – 7:30 PM — End of Day</div>
    <div class="title">Review & Prepare</div>
    <ul>
      <li>${step(16, 18, 'Check today\'s P&L on dashboard')} <span class="tag tag-manual">MANUAL</span><br>
        <a href="/dashboard">→ Dashboard</a></li>
      <li>${step(16, 18, 'Review equity open positions: SL / target / days held')} <span class="tag tag-manual">MANUAL</span><br>
        <a href="/equity">→ Equity</a></li>
      <li>${step(16, 18, 'No action on penny stocks unless target/SL hit')} <span class="tag tag-auto">LONG-TERM</span></li>
    </ul>
  </div>

  <!-- EVENING -->
  <div class="block">
    <div class="time">🌙 7:30 PM – 8:00 PM — Evening Scan</div>
    <div class="title">Prepare for Tomorrow</div>
    <ul>
      <li>${step(19, 20, 'Equity scanner runs at 7:30 PM (auto)')} <span class="tag tag-auto">AUTO</span><br>
        <span style="color:#6e7681;font-size:0.8rem">Scans NSE filings + news → picks bullish/bearish stocks → sends Telegram</span></li>
      <li>${step(19, 20, 'Run penny scan for weekly long-term picks')} <span class="tag tag-manual">MANUAL (weekly)</span><br>
        <span style="color:#6e7681;font-size:0.8rem">Command: <code style="background:#0d1117;padding:0.1rem 0.4rem;border-radius:4px">npm run penny-scan</code></span></li>
      <li>${step(19, 20, 'Check tomorrow\'s equity picks on dashboard')} <span class="tag tag-manual">OPTIONAL</span><br>
        <a href="/equity">→ Equity picks</a></li>
    </ul>
  </div>

  <!-- SUMMARY -->
  <div class="block" style="background:#0d1117;border-color:#21262d">
    <div class="time">📊 Strategy Summary</div>
    <ul>
      <li><b>BANKNIFTY HYBRID_REVERSE</b> — Fully automatic. 5yr backtest: +₹16.4L (qty=30).</li>
      <li><b>Equity Swing</b> — News-driven. 5 day hold. +4% target, −1.5% SL. ₹50k/stock.</li>
      <li><b>Penny Stocks</b> — Long-term 6m–2yr hold. +50%/+100% target. −20% SL. ₹5k/stock.</li>
      <li><b>Telegram alerts</b> — Auto reminders at 8:45, 9:15, 9:45, 1:00, 3:20, 3:35, 7:30, 7:45 PM IST.</li>
    </ul>
  </div>

  <p style="color:#333;font-size:0.75rem;text-align:center;margin-top:1rem">
    Auto-refreshes every 60s &nbsp;·&nbsp; ${nowIST}
  </p>
</body>
</html>`);
});

// ── Paper Trades Dashboard ────────────────────────────────────────────────────
app.get('/paper-trades', (_req, res) => {
  function readJson(file: string): any {
    try { if (fs.existsSync(path.resolve(__dirname, file))) return JSON.parse(fs.readFileSync(path.resolve(__dirname, file), 'utf-8')); } catch (_) {}
    return null;
  }

  const trades: any[]  = readJson('paper-trades.json')  ?? [];
  const records: any   = readJson('paper-records.json') ?? { daily: [], weekly: [], monthly: [] };

  const open   = trades.filter((t: any) => t.status === 'OPEN' || t.status === 'HIT_TARGET1');
  const closed = trades.filter((t: any) => t.exitDate).sort((a: any, b: any) => b.exitDate.localeCompare(a.exitDate));

  const totalPnl    = closed.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);
  const wins        = closed.filter((t: any) => (t.pnl ?? 0) > 0).length;
  const losses      = closed.filter((t: any) => (t.pnl ?? 0) < 0).length;
  const winRate     = closed.length ? ((wins / closed.length) * 100).toFixed(1) : '0.0';

  const byStrat = (s: string) => {
    const st = closed.filter((t: any) => t.strategy === s);
    return { trades: st.length, wins: st.filter((t: any) => (t.pnl ?? 0) > 0).length, pnl: st.reduce((x: number, t: any) => x + (t.pnl ?? 0), 0) };
  };
  const bn = byStrat('BANKNIFTY'); const eq = byStrat('EQUITY_SWING'); const pe = byStrat('PENNY');

  const pnlColor = (v: number) => v >= 0 ? '#3fb950' : '#f85149';
  const fmt = (v: number) => `${v >= 0 ? '+' : ''}₹${Math.abs(v).toFixed(0)}`;

  const stratBadge: Record<string, string> = { BANKNIFTY: '⚡', EQUITY_SWING: '📈', PENNY: '💎' };

  const openRows = open.map((t: any) => `
    <tr>
      <td>${stratBadge[t.strategy] ?? ''} ${t.strategy.replace('_',' ')}</td>
      <td><b>${t.symbol}</b></td>
      <td><span style="color:${t.direction==='LONG'?'#3fb950':'#f85149'}">${t.direction}</span></td>
      <td>₹${(t.entryPrice ?? 0).toFixed(2)}</td>
      <td style="color:#f85149">₹${(t.sl ?? 0).toFixed(2)}</td>
      <td style="color:#3fb950">₹${(t.target1 ?? 0).toFixed(2)}</td>
      <td>${t.entryDate}</td>
      <td style="color:#8b949e">${t.score ?? 0}</td>
    </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:#666;padding:1.5rem">No open positions</td></tr>';

  const closedRows = closed.slice(0, 50).map((t: any) => `
    <tr>
      <td>${stratBadge[t.strategy] ?? ''} ${t.strategy.replace('_',' ')}</td>
      <td><b>${t.symbol}</b></td>
      <td><span style="color:${t.direction==='LONG'?'#3fb950':'#f85149'}">${t.direction}</span></td>
      <td>₹${(t.entryPrice ?? 0).toFixed(2)}</td>
      <td>₹${(t.exitPrice ?? 0).toFixed(2)}</td>
      <td style="color:${pnlColor(t.pnl ?? 0)};font-weight:600">${fmt(t.pnl ?? 0)}</td>
      <td style="color:${pnlColor(t.pnl ?? 0)}">${(t.pnl ?? 0) >= 0 ? '+' : ''}${(t.pnlPct ?? 0).toFixed(2)}%</td>
      <td style="font-size:0.8rem;color:#8b949e">${t.status.replace(/_/g,' ')}</td>
      <td style="font-size:0.8rem">${t.exitDate ?? '-'}</td>
    </tr>`).join('') || '<tr><td colspan="9" style="text-align:center;color:#666;padding:1.5rem">No closed trades yet</td></tr>';

  const dailyRows = [...(records.daily ?? [])].reverse().slice(0, 30).map((r: any) => `
    <tr>
      <td>${r.date}</td>
      <td>${r.newTrades}</td>
      <td>${r.closedTrades}</td>
      <td style="color:${pnlColor(r.realizedPnl)};font-weight:600">${fmt(r.realizedPnl)}</td>
      <td>${r.wins} / ${r.losses}</td>
      <td style="color:#8b949e">${r.openPositions}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:#666;padding:1rem">No daily records yet</td></tr>';

  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="120">
  <title>Paper Trades</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:1rem;max-width:1100px;margin:0 auto}
    h1{font-size:1.2rem;color:#58a6ff;margin-bottom:0.3rem}
    .subtitle{color:#6e7681;font-size:0.82rem;margin-bottom:1rem}
    .nav{display:flex;gap:0.5rem;margin-bottom:1rem;flex-wrap:wrap}
    .nav a{padding:0.4rem 0.9rem;background:#21262d;border:1px solid #30363d;border-radius:6px;color:#e6edf3;text-decoration:none;font-size:0.85rem}
    .nav a.active{background:#58a6ff;color:#0d1117;font-weight:600;border-color:#58a6ff}
    .nav a:hover{background:#30363d}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0.75rem;margin-bottom:1.2rem}
    .card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:0.9rem;text-align:center}
    .card .label{font-size:0.75rem;color:#6e7681;margin-bottom:0.3rem;text-transform:uppercase;letter-spacing:.05em}
    .card .value{font-size:1.5rem;font-weight:700}
    .strat-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1.2rem}
    .strat-card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:0.9rem}
    .strat-card .name{font-size:0.8rem;color:#8b949e;margin-bottom:0.5rem}
    .strat-card .row{display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:0.2rem}
    .section{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem;margin-bottom:1rem}
    .section h2{font-size:0.9rem;color:#58a6ff;margin-bottom:0.8rem;text-transform:uppercase;letter-spacing:.05em}
    table{width:100%;border-collapse:collapse;font-size:0.82rem}
    th{text-align:left;padding:0.5rem 0.6rem;color:#8b949e;font-weight:600;border-bottom:1px solid #21262d;font-size:0.75rem;text-transform:uppercase}
    td{padding:0.45rem 0.6rem;border-bottom:1px solid #0d1117}
    tr:hover td{background:#1c2128}
    .badge{padding:0.15rem 0.5rem;border-radius:4px;font-size:0.72rem;font-weight:700}
    @media(max-width:600px){.strat-cards{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <h1>📊 Paper Trade Dashboard</h1>
  <p class="subtitle">Simulation only — no real orders · Refreshes every 2 min</p>
  <div class="nav">
    <a href="/dashboard">⚡ BANKNIFTY</a>
    <a href="/equity">📈 Equity</a>
    <a href="/penny">💎 Penny</a>
    <a href="/core">⭐ Core Stocks</a>
    <a href="/paper-trades" class="active">📊 Paper Trades</a>
    <a href="/checklist">📋 Checklist</a>
    <a href="/submit">🔑 Token</a>
  </div>

  <!-- Summary cards -->
  <div class="cards">
    <div class="card">
      <div class="label">Total P&amp;L</div>
      <div class="value" style="color:${pnlColor(totalPnl)}">${fmt(totalPnl)}</div>
    </div>
    <div class="card">
      <div class="label">Trades Closed</div>
      <div class="value">${closed.length}</div>
    </div>
    <div class="card">
      <div class="label">Win Rate</div>
      <div class="value" style="color:${parseFloat(winRate)>=50?'#3fb950':'#f85149'}">${winRate}%</div>
    </div>
    <div class="card">
      <div class="label">Wins / Losses</div>
      <div class="value">${wins} <span style="color:#6e7681;font-size:1rem">/</span> ${losses}</div>
    </div>
    <div class="card">
      <div class="label">Open Positions</div>
      <div class="value" style="color:#e3b341">${open.length}</div>
    </div>
    <div class="card">
      <div class="label">Avg P&amp;L/Trade</div>
      <div class="value" style="color:${pnlColor(totalPnl)};font-size:1.1rem">${closed.length ? fmt(totalPnl/closed.length) : '₹0'}</div>
    </div>
  </div>

  <!-- Per-strategy breakdown -->
  <div class="strat-cards">
    <div class="strat-card">
      <div class="name">⚡ BANKNIFTY (intraday)</div>
      <div class="row"><span>Trades</span><b>${bn.trades}</b></div>
      <div class="row"><span>Win Rate</span><b>${bn.trades ? ((bn.wins/bn.trades)*100).toFixed(0) : 0}%</b></div>
      <div class="row"><span>P&amp;L</span><b style="color:${pnlColor(bn.pnl)}">${fmt(bn.pnl)}</b></div>
    </div>
    <div class="strat-card">
      <div class="name">📈 Equity Swing (5-day)</div>
      <div class="row"><span>Trades</span><b>${eq.trades}</b></div>
      <div class="row"><span>Win Rate</span><b>${eq.trades ? ((eq.wins/eq.trades)*100).toFixed(0) : 0}%</b></div>
      <div class="row"><span>P&amp;L</span><b style="color:${pnlColor(eq.pnl)}">${fmt(eq.pnl)}</b></div>
    </div>
    <div class="strat-card">
      <div class="name">💎 Penny Stocks (long-term)</div>
      <div class="row"><span>Positions</span><b>${pe.trades + open.filter((t:any)=>t.strategy==='PENNY').length}</b></div>
      <div class="row"><span>Exited</span><b>${pe.trades}</b></div>
      <div class="row"><span>P&amp;L (realized)</span><b style="color:${pnlColor(pe.pnl)}">${fmt(pe.pnl)}</b></div>
    </div>
  </div>

  <!-- Open positions -->
  <div class="section">
    <h2>📂 Open Positions (${open.length})</h2>
    <div style="overflow-x:auto">
    <table>
      <thead><tr>
        <th>Strategy</th><th>Symbol</th><th>Dir</th><th>Entry</th><th>SL</th><th>Target</th><th>Date</th><th>Score</th>
      </tr></thead>
      <tbody>${openRows}</tbody>
    </table>
    </div>
  </div>

  <!-- Closed trades -->
  <div class="section">
    <h2>📜 Closed Trades (last 50)</h2>
    <div style="overflow-x:auto">
    <table>
      <thead><tr>
        <th>Strategy</th><th>Symbol</th><th>Dir</th><th>Entry</th><th>Exit</th><th>P&amp;L</th><th>P&amp;L%</th><th>Result</th><th>Date</th>
      </tr></thead>
      <tbody>${closedRows}</tbody>
    </table>
    </div>
  </div>

  <!-- Daily records -->
  <div class="section">
    <h2>📅 Daily Records (last 30 days)</h2>
    <div style="overflow-x:auto">
    <table>
      <thead><tr>
        <th>Date</th><th>Entered</th><th>Closed</th><th>Realized P&amp;L</th><th>W/L</th><th>Open</th>
      </tr></thead>
      <tbody>${dailyRows}</tbody>
    </table>
    </div>
  </div>

  <p style="color:#333;font-size:0.75rem;text-align:center;margin-top:1rem">
    Paper mode · Updated ${new Date().toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'})} IST
  </p>
</body>
</html>`);
});

// ── Core Stocks Dashboard ────────────────────────────────────────────────────
app.get('/core', (_req, res) => {
  const picks: any[] = (() => {
    try { return JSON.parse(fs.readFileSync('core-watchlist.json', 'utf8')) ?? []; }
    catch { return []; }
  })();
  const scanDate = picks[0]?.scannedDate ?? 'Not yet scanned';
  const volFmt = (v: number) =>
    v >= 1e7 ? `${(v/1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v/1e5).toFixed(1)}L` : v.toString();

  const rows = picks.map((p: any, idx: number) => {
    const f = p.fundamentals;
    const flagHtml = (f?.fundFlags ?? []).map((fl: string) =>
      `<span style="font-size:0.73rem;color:${fl.includes('✅')||fl.includes('💎')?'#3fb950':fl.includes('❌')?'#f85149':'#e3b341'}">${fl}</span>`
    ).join(' ');
    const npArr: number[] = f?.netProfits ?? [];
    const npStr = npArr.length ? npArr.map(n => (n>0?'<span style="color:#3fb950">':' <span style="color:#f85149">')+n+'Cr</span>').join(' → ') : '—';
    return `
    <tr>
      <td><span style="color:#8b949e;font-size:0.8rem">${idx+1}.</span> <b>${p.symbol}</b></td>
      <td style="color:#58a6ff;font-weight:700">₹${p.price.toFixed(2)}</td>
      <td>${volFmt(p.volume)}</td>
      <td style="color:#3fb950;font-weight:600">+${p.score}</td>
      <td>${f?.roce != null ? f.roce.toFixed(1)+'%' : '—'}</td>
      <td>${f?.deRatio != null ? f.deRatio.toFixed(2) : '—'}</td>
      <td>${f?.promoterPct != null ? f.promoterPct+'%' : '—'}</td>
      <td style="font-size:0.78rem">${npStr}</td>
      <td>${flagHtml}</td>
    </tr>`;
  }).join('');

  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="600">
  <title>Core Stocks — Forever Holdings</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:1rem;max-width:1300px;margin:0 auto}
    h1{font-size:1.25rem;margin-bottom:0.3rem;color:#f0c040}
    .subtitle{color:#6e7681;font-size:0.85rem;margin-bottom:1rem}
    .nav{display:flex;gap:0.5rem;margin-bottom:1rem;flex-wrap:wrap}
    .nav a{padding:0.4rem 0.9rem;background:#21262d;border:1px solid #30363d;border-radius:6px;color:#e6edf3;text-decoration:none;font-size:0.85rem}
    .nav a.active{background:#f0c040;color:#0d1117;border-color:#f0c040;font-weight:600}
    .nav a:hover{background:#30363d}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem;margin-bottom:1rem}
    @media(min-width:600px){.grid{grid-template-columns:repeat(4,1fr)}}
    .card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem}
    .card .label{font-size:0.75rem;color:#8b949e;margin-bottom:0.3rem}
    .card .value{font-size:1.4rem;font-weight:700}
    .section{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem;margin-bottom:1rem}
    .section h2{font-size:0.82rem;color:#8b949e;margin-bottom:0.85rem;text-transform:uppercase;letter-spacing:0.05em}
    table{width:100%;border-collapse:collapse;font-size:0.82rem}
    th{text-align:left;color:#8b949e;font-weight:500;padding:0.4rem 0.5rem;border-bottom:1px solid #30363d;white-space:nowrap}
    td{padding:0.5rem 0.5rem;border-bottom:1px solid #21262d;vertical-align:middle}
    .info-box{background:#1a2a0a;border:1px solid #3fb950;border-radius:8px;padding:0.75rem 1rem;margin-bottom:1rem;font-size:0.85rem;color:#3fb950}
  </style>
</head>
<body>
  <h1>⭐ Core Stocks — Forever Holdings</h1>
  <p class="subtitle">100% confidence buy-and-hold for life · ROCE≥8% · D/E≤1 · 3yr profitable · Promoter≥20%</p>
  <div class="nav">
    <a href="/dashboard">⚡ BANKNIFTY Bot</a>
    <a href="/equity">📈 Equity Swing</a>
    <a href="/penny">💎 Penny Stocks</a>
    <a href="/core" class="active">⭐ Core Stocks</a>
    <a href="/paper-trades">📊 Paper Trades</a>
    <a href="/checklist">📋 Checklist</a>
    <a href="/submit">🔑 Token</a>
  </div>

  <div class="info-box">
    ⭐ <b>These are fundamentally bulletproof companies.</b> ROCE consistently high, low/zero debt, profits every year, promoters with strong skin in the game.
    Buy on dips and hold for life. No stop-loss needed — these are businesses, not trades.
  </div>

  <div class="grid">
    <div class="card">
      <div class="label">Total Core Picks</div>
      <div class="value" style="color:#f0c040">${picks.length}</div>
    </div>
    <div class="card">
      <div class="label">Last Scanned</div>
      <div class="value" style="font-size:1rem">${scanDate}</div>
    </div>
    <div class="card">
      <div class="label">Price Range</div>
      <div class="value" style="font-size:1rem">₹100 – ₹10,000</div>
    </div>
    <div class="card">
      <div class="label">Hold Period</div>
      <div class="value" style="font-size:1rem">Lifetime ♾️</div>
    </div>
  </div>

  <div class="section">
    <h2>⭐ Top ${picks.length} Core Stocks — Ranked by Fundamental Score</h2>
    ${picks.length === 0 ? '<p style="color:#555;padding:1rem">No data yet. Run: <code>npx ts-node src/core-scanner.ts</code></p>' : `
    <div style="overflow-x:auto">
    <table>
      <thead><tr>
        <th>#&nbsp;Symbol</th><th>Price</th><th>Volume</th><th>Score</th>
        <th>ROCE</th><th>D/E</th><th>Promoter</th><th>Net Profit (3yr)</th><th>Flags</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`}
  </div>

  <p style="color:#333;font-size:0.75rem;text-align:center;margin-top:1rem">
    Scanned weekly every Sunday · ${new Date().toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'})} IST
  </p>
</body>
</html>`);
});

// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`  Token Refresh Server started on port ${PORT}`);
  console.log(`  Submit form: http://YOUR_VPS_IP:${PORT}/submit`);
  if (AUTH_PASS) console.log(`  Password protected (TOKEN_SERVER_PASS is set)`);
  else           console.log(`  ⚠  No password set — add TOKEN_SERVER_PASS to .env`);
  console.log('='.repeat(55));
});
