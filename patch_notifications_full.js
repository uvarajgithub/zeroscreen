// Full notifications upgrade:
// 1. db.js     – seed 7 new tg_notify_* keys
// 2. server.js – new allowed keys + rebuilt notifications page (3 sections, 13 toggles)
// 3. notifier.js (trading-bot) – auto-classify message → toggle check
// 4. token-server.js – toggle check on token refresh
const fs = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
// 1. SEED NEW KEYS IN db.js
// ─────────────────────────────────────────────────────────────────────────────
{
    const p = '/root/zeroscreen/dist/db.js';
    let s = fs.readFileSync(p, 'utf8');
    const MARKER = `db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('tg_notify_system','false')")`;
    const NEW_SEEDS = `
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('tg_notify_bot_started','true')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('tg_notify_bot_stopped','true')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('tg_notify_candle','true')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('tg_notify_trade_entry','true')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('tg_notify_trade_exit','true')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('tg_notify_token_expired','true')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('tg_notify_token_refresh','true')");`;
    const idx = s.lastIndexOf(MARKER);
    if (idx < 0) { console.error('db.js seed marker not found'); process.exit(1); }
    const after = s.indexOf('\n', idx) + 1;
    s = s.slice(0, after) + NEW_SEEDS + '\n' + s.slice(after);
    fs.writeFileSync(p, s, 'utf8');
    console.log('✓ db.js – 7 new tg_notify keys seeded');
}

// Also insert them live into running DB
{
    const sqlite3 = require('/root/zeroscreen/node_modules/sqlite3').verbose();
    const db = new sqlite3.Database('/root/zeroscreen/zeroscreen.db');
    const newKeys = [
        ['tg_notify_bot_started','true'],
        ['tg_notify_bot_stopped','true'],
        ['tg_notify_candle','true'],
        ['tg_notify_trade_entry','true'],
        ['tg_notify_trade_exit','true'],
        ['tg_notify_token_expired','true'],
        ['tg_notify_token_refresh','true'],
    ];
    for (const [k,v] of newKeys) db.run('INSERT OR IGNORE INTO app_settings (key,value) VALUES (?,?)', [k,v]);
    db.close();
    console.log('✓ db.js – keys inserted into live DB');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. server.js – allowed keys + notifications page
// ─────────────────────────────────────────────────────────────────────────────
{
    const p = '/root/zeroscreen/dist/server.js';
    let s = fs.readFileSync(p, 'utf8');

    // ── 2a. Extend allowed list ──────────────────────────────────────────────
    const OLD_ALLOWED = `        "tg_notify_pick_entry", "tg_notify_pick_exit", "tg_notify_new_user",
        "tg_notify_daily_picks", "tg_notify_sl_breach", "tg_notify_system",
    ];`;
    const NEW_ALLOWED = `        "tg_notify_pick_entry", "tg_notify_pick_exit", "tg_notify_new_user",
        "tg_notify_daily_picks", "tg_notify_sl_breach", "tg_notify_system",
        "tg_notify_bot_started", "tg_notify_bot_stopped", "tg_notify_candle",
        "tg_notify_trade_entry", "tg_notify_trade_exit",
        "tg_notify_token_expired", "tg_notify_token_refresh",
    ];`;
    if (!s.includes(OLD_ALLOWED)) { console.error('allowed keys marker not found'); process.exit(1); }
    s = s.replace(OLD_ALLOWED, NEW_ALLOWED);
    console.log('✓ server.js – allowed keys extended');

    // ── 2b. Replace GET /admin/notifications route ───────────────────────────
    // Find start and end of the route
    const ROUTE_START = '// ── GET /admin/notifications';
    const ROUTE_END   = '// ── GET /admin/settings/telegram/status';
    const startIdx = s.indexOf(ROUTE_START);
    const endIdx   = s.indexOf(ROUTE_END);
    if (startIdx < 0 || endIdx < 0) { console.error('notifications route boundaries not found'); process.exit(1); }

    const NEW_ROUTE = `// ── GET /admin/notifications ────────────────────────────────────────────────
app.get("/admin/notifications", requireAdmin, async (req, res) => {
    const keys = [
        "tg_bot_token", "tg_chat_id",
        "tg_notify_pick_entry", "tg_notify_pick_exit", "tg_notify_new_user",
        "tg_notify_daily_picks", "tg_notify_sl_breach", "tg_notify_system",
        "tg_notify_bot_started", "tg_notify_bot_stopped", "tg_notify_candle",
        "tg_notify_trade_entry", "tg_notify_trade_exit",
        "tg_notify_token_expired", "tg_notify_token_refresh",
    ];
    const cfg = {};
    await Promise.all(keys.map(async (k) => { cfg[k] = await (0, db_1.getSetting)(k) || ""; }));
    const isOn = (k) => cfg[k] !== "false";
    function toggle(key, label, desc) {
        const on = isOn(key);
        return \`
    <div class="setting-row">
      <div class="setting-info">
        <div class="setting-title">\${label}</div>
        <div class="setting-desc">\${desc}</div>
      </div>
      <div class="toggle-wrap">
        <span class="toggle-label \${on ? "on" : "off"}" id="lbl-\${key}">\${on ? "ON" : "OFF"}</span>
        <label class="toggle-btn">
          <input type="checkbox" id="tog-\${key}" \${on ? "checked" : ""} onchange="save('\${key}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>\`;
    }
    res.send(\`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Notifications - ZeroScreen Admin</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .settings-section{margin-top:28px}
    .settings-section h2{font-size:15px;font-weight:700;margin-bottom:14px;color:var(--text-main);padding-bottom:8px;border-bottom:1px solid var(--border)}
    .section-sub{font-size:12px;color:var(--text-dim);margin:-8px 0 14px;line-height:1.5}
    .setting-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;margin-bottom:10px}
    .setting-info{flex:1;min-width:0}
    .setting-title{font-weight:600;font-size:14px;color:var(--text-main)}
    .setting-desc{font-size:12px;color:var(--text-dim);margin-top:3px;line-height:1.5}
    .toggle-wrap{display:flex;align-items:center;gap:10px;flex-shrink:0}
    .toggle-label{font-size:13px;font-weight:700;min-width:28px;text-align:right}
    .toggle-label.on{color:#16a34a}.toggle-label.off{color:#dc2626}
    .toggle-btn{position:relative;width:52px;height:28px;cursor:pointer}
    .toggle-btn input{opacity:0;width:0;height:0;position:absolute}
    .toggle-slider{position:absolute;inset:0;border-radius:28px;background:#cbd5e1;transition:.25s}
    .toggle-slider:before{content:"";position:absolute;height:20px;width:20px;left:4px;bottom:4px;border-radius:50%;background:#fff;transition:.25s}
    .toggle-btn input:checked + .toggle-slider{background:#16a34a}
    .toggle-btn input:checked + .toggle-slider:before{transform:translateX(24px)}
    .tg-cred-box{background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:20px 22px;margin-bottom:18px}
    .tg-cred-grid{display:grid;gap:12px;margin-bottom:16px}
    .tg-cred-label{font-size:12px;font-weight:600;color:var(--text-dim);display:block;margin-bottom:4px}
    .tg-cred-input{width:100%;padding:9px 13px;border-radius:7px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:13px;font-family:monospace;box-sizing:border-box}
    .tg-cred-input:focus{outline:none;border-color:var(--accent)}
    .tg-btn-row{display:flex;gap:10px;flex-wrap:wrap}
    .tg-btn-save{background:var(--accent);color:#fff;border:none;border-radius:7px;padding:9px 20px;font-size:13px;font-weight:600;cursor:pointer}
    .tg-btn-test{background:var(--card-bg);color:var(--text);border:1px solid var(--border);border-radius:7px;padding:9px 20px;font-size:13px;font-weight:600;cursor:pointer}
    .tg-status{margin-top:10px;font-size:12px;min-height:18px}
    .toast{position:fixed;bottom:24px;right:24px;background:#1e293b;color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;opacity:0;transition:opacity .3s;pointer-events:none;z-index:9999}
    .toast.show{opacity:1}
  </style>
</head>
<body>
  \${nav("admin-notifications", req)}
  <div class="container" style="max-width:720px">
    <div class="page-header">
      <div>
        <a href="/admin" class="back-link">&#x2190; Admin</a>
        <h1>&#x1F4E3; Notifications</h1>
        <p class="page-sub">Configure Telegram alerts for all events across ZeroScreen &amp; the trading bot</p>
      </div>
    </div>

    <!-- BOT CREDENTIALS -->
    <div class="settings-section">
      <h2>&#x1F916; Telegram Bot Credentials</h2>
      <div class="tg-cred-box">
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:14px;line-height:1.6">
          &#x2139;&#xFE0F; <strong>Setup:</strong> Create a bot via
          <a href="https://t.me/BotFather" target="_blank" style="color:var(--accent)">@BotFather</a> &rarr;
          copy the token &rarr; send your bot any message &rarr;
          visit <code style="font-size:11px">api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code> to find your Chat ID.
        </div>
        <div class="tg-cred-grid">
          <div>
            <label class="tg-cred-label">Bot Token</label>
            <input id="tg-token-inp" type="text" class="tg-cred-input" value="\${cfg.tg_bot_token || ""}" placeholder="1234567890:ABCdef...">
          </div>
          <div>
            <label class="tg-cred-label">Chat ID / Channel ID</label>
            <input id="tg-chatid-inp" type="text" class="tg-cred-input" value="\${cfg.tg_chat_id || ""}" placeholder="-1001234567890 or @yourchannel">
          </div>
        </div>
        <div class="tg-btn-row">
          <button class="tg-btn-save" onclick="saveCreds()">&#x1F4BE; Save Credentials</button>
          <button class="tg-btn-test" onclick="testTelegram()">&#x1F4E8; Send Test Message</button>
        </div>
        <div class="tg-status" id="tg-status"></div>
      </div>
    </div>

    <!-- PAPER PICKS & TRADES -->
    <div class="settings-section">
      <h2>&#x1F4C8; Paper Picks &amp; Trades</h2>
      <p class="section-sub">Alerts from ZeroScreen's pick engine and paper portfolio.</p>
      \${toggle("tg_notify_pick_entry", "&#x1F4CD; Pick Entry Triggered", "When a pick enters the buy zone and a paper trade is opened automatically.")}
      \${toggle("tg_notify_pick_exit", "&#x1F3AF; Pick Exit &mdash; Target / SL Hit", "When a pick hits its target price or stop-loss and the paper position closes.")}
      \${toggle("tg_notify_sl_breach", "&#x26A0;&#xFE0F; SL Breach / Target Hit (Tracker)", "From the pick result tracker: sends when any active pick's SL or target is breached.")}
      \${toggle("tg_notify_daily_picks", "&#x1F4C5; Daily Picks Summary", "Morning reminder (8:30 AM) + EOD summary (6:45 PM) with all active picks.")}
      \${toggle("tg_notify_new_user", "&#x1F465; New User Registration", "When a new user signs up via email or Google OAuth.")}
      \${toggle("tg_notify_system", "&#x2699;&#xFE0F; System Alerts", "Server errors and non-fatal issues. Keep OFF to reduce noise.")}
    </div>

    <!-- BANKNIFTY TRADING BOT -->
    <div class="settings-section">
      <h2>&#x1F916; BANKNIFTY Trading Bot</h2>
      <p class="section-sub">Alerts from the live Zerodha options trading bot.</p>
      \${toggle("tg_notify_bot_started", "&#x1F7E2; Bot Started / Restarted", "When the trading bot starts fresh or restarts (with or without an active trade restored).")}
      \${toggle("tg_notify_bot_stopped", "&#x1F534; Bot Stopped / Crashed / Daily Loss Limit", "When the bot stops due to daily loss limit, API failures, or a crash.")}
      \${toggle("tg_notify_candle", "&#x1F4CA; 15-Min Candle Update", "Status message after every 15-minute candle closes during market hours.")}
      \${toggle("tg_notify_trade_entry", "&#x1F680; Trade Entry Executed", "When a BANKNIFTY options trade is entered (breakout, reverse, or ITM hold).")}
      \${toggle("tg_notify_trade_exit", "&#x1F3F3;&#xFE0F; Trade Exit &mdash; SL / Target / Trail", "When a trade exits via stop-loss hit, trail SL, LOCK50, or ITM hold exit.")}
    </div>

    <!-- TOKEN & SYSTEM -->
    <div class="settings-section">
      <h2>&#x1F511; Token &amp; System</h2>
      <p class="section-sub">Zerodha API token lifecycle alerts.</p>
      \${toggle("tg_notify_token_expired", "&#x1F534; Token Expired &mdash; Action Required", "When the Zerodha API token expires during live trading. Urgent — keep ON.")}
      \${toggle("tg_notify_token_refresh", "&#x2705; Token Refreshed Successfully", "When a new Zerodha access token is submitted and the bot is restarted.")}
    </div>

  </div>
  <div class="toast" id="toast"></div>
  <script>
    async function saveCreds() {
      const token  = document.getElementById('tg-token-inp').value.trim();
      const chatId = document.getElementById('tg-chatid-inp').value.trim();
      const st = document.getElementById('tg-status');
      try {
        const r = await fetch('/admin/settings/telegram', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tg_bot_token: token, tg_chat_id: chatId })
        });
        if (r.ok) { st.innerHTML = '<span style="color:#16a34a">&#x2705; Saved</span>'; showToast('&#x2705; Credentials saved'); }
        else { st.innerHTML = '<span style="color:#dc2626">&#x26A0; Save failed</span>'; }
      } catch(e) { st.innerHTML = '<span style="color:#dc2626">&#x26A0; Network error</span>'; }
    }
    async function testTelegram() {
      const st = document.getElementById('tg-status');
      st.innerHTML = '<span style="color:var(--text-dim)">Sending...</span>';
      try {
        const r = await fetch('/admin/settings/telegram/test', { method: 'POST' });
        const d = await r.json();
        if (r.ok && d.ok) st.innerHTML = '<span style="color:#16a34a">&#x2705; Test sent! Check Telegram.</span>';
        else st.innerHTML = '<span style="color:#dc2626">&#x274C; ' + (d.error || 'Failed') + '</span>';
      } catch(e) { st.innerHTML = '<span style="color:#dc2626">&#x274C; Network error</span>'; }
    }
    async function save(key, value) {
      const lbl = document.getElementById('lbl-' + key);
      const chk = document.getElementById('tog-' + key);
      try {
        const r = await fetch('/admin/settings/toggle', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value: value ? 'true' : 'false' })
        });
        if (r.ok) {
          lbl.textContent = value ? 'ON' : 'OFF';
          lbl.className = 'toggle-label ' + (value ? 'on' : 'off');
          showToast('&#x2705; Saved');
        } else { chk.checked = !value; showToast('&#x26A0; Failed to save'); }
      } catch(e) { chk.checked = !value; showToast('&#x26A0; Network error'); }
    }
    function showToast(msg) {
      const t = document.getElementById('toast');
      t.innerHTML = msg; t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2200);
    }
  </script>
  <script src="/public/js/app.js"></script>
</body>
</html>\`);
});
`;

    s = s.slice(0, startIdx) + NEW_ROUTE + s.slice(endIdx);
    fs.writeFileSync(p, s, 'utf8');
    console.log('✓ server.js – notifications page rebuilt with 4 sections & 13 toggles');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. notifier.js – add getTgToggle() + auto-classify toggle key from message
// ─────────────────────────────────────────────────────────────────────────────
{
    const p = '/home/ubuntu/trading-bot/dist/src/notifier.js';
    let s = fs.readFileSync(p, 'utf8');

    // Add getTgToggle helper and wrap sendTelegram with toggle check
    const OLD_FN_START = 'async function sendTelegram(message, attempt = 1) {';
    if (!s.includes(OLD_FN_START)) { console.error('sendTelegram start not found in notifier.js'); process.exit(1); }

    const TOGGLE_HELPER = `
// Auto-classify message to a toggle key, check DB before sending
async function getTgToggle(key) {
    try {
        const sqlite3 = require('/root/zeroscreen/node_modules/sqlite3').verbose();
        return await new Promise((res, rej) => {
            const db = new sqlite3.Database('/root/zeroscreen/zeroscreen.db', 1, e => e ? rej(e) : null);
            db.get('SELECT value FROM app_settings WHERE key=?', [key], (e, r) => {
                db.close(); e ? rej(e) : res(r?.value || 'true');
            });
        });
    } catch(e) { return 'true'; }
}
function classifyToggle(msg) {
    if (/TOKEN EXPIRED/i.test(msg))                                return 'tg_notify_token_expired';
    if (/BOT STOPPED|Bot Stopped|BANKNIFTY Bot Stopped|BOT CRASHED|DAILY LOSS LIMIT/i.test(msg)) return 'tg_notify_bot_stopped';
    if (/Bot Started|Bot Restarted|BANKNIFTY Bot Started/i.test(msg)) return 'tg_notify_bot_started';
    if (/15-Min Candle/i.test(msg))                                return 'tg_notify_candle';
    if (/ENTRY EXECUTED|BREAKOUT.*ENTRY|REVERSE.*ENTRY|ITM Hold Entry/i.test(msg)) return 'tg_notify_trade_entry';
    if (/EXIT|STOP LOSS HIT|Trail Activated|Trail SL Updated|ITM Hold Exit|LOCK50/i.test(msg)) return 'tg_notify_trade_exit';
    if (/EOD STRIKE SUMMARY|DAILY SUMMARY/i.test(msg))            return 'tg_notify_daily_picks';
    return 'tg_notify_system';
}
`;

    // Insert helpers before sendTelegram
    s = s.replace(OLD_FN_START, TOGGLE_HELPER + OLD_FN_START);

    // Wrap the existing sendTelegram body to check toggle first
    // Add check at beginning of function after "attempt = 1"
    const AFTER_FN_START = `async function sendTelegram(message, attempt = 1) {
    const { token: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID } = await getTgCreds();`;
    const NEW_AFTER_FN_START = `async function sendTelegram(message, attempt = 1) {
    if (attempt === 1) {
        const toggleKey = classifyToggle(message);
        const enabled = await getTgToggle(toggleKey);
        if (enabled === 'false') return;
    }
    const { token: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID } = await getTgCreds();`;
    if (!s.includes(AFTER_FN_START)) { console.error('sendTelegram body start not found'); process.exit(1); }
    s = s.replace(AFTER_FN_START, NEW_AFTER_FN_START);

    fs.writeFileSync(p, s, 'utf8');
    console.log('✓ notifier.js – toggle classification added');
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. token-server.js – toggle check on token refresh
// ─────────────────────────────────────────────────────────────────────────────
{
    const p = '/home/ubuntu/trading-bot/dist/token-server.js';
    let s = fs.readFileSync(p, 'utf8');

    const OLD_SEND = `async function sendTgNotify(msg) {
    const { token, chat } = await getTgCreds_ts();`;
    const NEW_SEND = `async function getTgToggle_ts(key) {
    try {
        const sqlite3 = require('/root/zeroscreen/node_modules/sqlite3').verbose();
        return await new Promise((res, rej) => {
            const db = new sqlite3.Database('/root/zeroscreen/zeroscreen.db', 1, e => e ? rej(e) : null);
            db.get('SELECT value FROM app_settings WHERE key=?', [key], (e, r) => {
                db.close(); e ? rej(e) : res(r?.value || 'true');
            });
        });
    } catch(e) { return 'true'; }
}
async function sendTgNotify(msg) {
    const enabled = await getTgToggle_ts('tg_notify_token_refresh');
    if (enabled === 'false') return;
    const { token, chat } = await getTgCreds_ts();`;
    if (!s.includes(OLD_SEND)) { console.error('sendTgNotify not found in token-server.js'); process.exit(1); }
    s = s.replace(OLD_SEND, NEW_SEND);
    fs.writeFileSync(p, s, 'utf8');
    console.log('✓ token-server.js – tg_notify_token_refresh toggle added');
}

console.log('\nAll done. Run: pm2 restart zeroscreen trading-bot token-server');
