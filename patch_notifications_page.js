// patch_admin_notifications_page.js — add /admin/notifications page to admin nav
const fs = require('fs');
const p = '/root/zeroscreen/dist/server.js';
let s = fs.readFileSync(p, 'utf8');

// ── 1. Add to admin nav (index-based) ─────────────────────────────────────
{
    const SUBS_MARKER = '["admin-subs", "/admin/subs",';
    const idx = s.indexOf(SUBS_MARKER);
    if (idx < 0) { console.error('admin-subs nav marker not found'); process.exit(1); }
    const lineEnd = s.indexOf('\n', idx);
    s = s.substring(0, lineEnd) + '\n        ["admin-notifications", "/admin/notifications", "&#x1F4E3; Notifications"],' + s.substring(lineEnd);
}

// ── 2. Add GET /admin/notifications route ─────────────────────────────────
// Insert before the existing /admin/settings/telegram/status route
const INSERT_BEFORE = '// \u2500\u2500 GET /admin/settings/telegram/status';
const insertIdx = s.indexOf(INSERT_BEFORE);
if (insertIdx < 0) { console.error('insert anchor not found'); process.exit(1); }

const NOTIFICATIONS_ROUTE = `// \u2500\u2500 GET /admin/notifications \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
app.get("/admin/notifications", requireAdmin, async (req, res) => {
    const keys = [
        "tg_bot_token", "tg_chat_id",
        "tg_notify_pick_entry", "tg_notify_pick_exit", "tg_notify_new_user",
        "tg_notify_daily_picks", "tg_notify_sl_breach", "tg_notify_system",
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
  <title>Notifications \u2014 ZeroScreen Admin</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .settings-section { margin-top:28px; }
    .settings-section h2 { font-size:15px; font-weight:700; margin-bottom:14px; color:var(--text-main); padding-bottom:8px; border-bottom:1px solid var(--border); }
    .setting-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 18px; background:var(--card-bg); border:1px solid var(--border); border-radius:10px; margin-bottom:10px; }
    .setting-info { flex:1; min-width:0; }
    .setting-title { font-weight:600; font-size:14px; color:var(--text-main); }
    .setting-desc  { font-size:12px; color:var(--text-dim); margin-top:3px; line-height:1.5; }
    .toggle-wrap { display:flex; align-items:center; gap:10px; flex-shrink:0; }
    .toggle-label { font-size:13px; font-weight:700; min-width:28px; text-align:right; }
    .toggle-label.on  { color:#16a34a; }
    .toggle-label.off { color:#dc2626; }
    .toggle-btn { position:relative; width:52px; height:28px; cursor:pointer; }
    .toggle-btn input { opacity:0; width:0; height:0; position:absolute; }
    .toggle-slider { position:absolute; inset:0; border-radius:28px; background:#cbd5e1; transition:.25s; }
    .toggle-slider:before { content:""; position:absolute; height:20px; width:20px; left:4px; bottom:4px; border-radius:50%; background:#fff; transition:.25s; }
    .toggle-btn input:checked + .toggle-slider { background:#16a34a; }
    .toggle-btn input:checked + .toggle-slider:before { transform:translateX(24px); }
    .tg-cred-box { background:var(--card-bg); border:1px solid var(--border); border-radius:10px; padding:20px 22px; margin-bottom:18px; }
    .tg-cred-grid { display:grid; gap:12px; margin-bottom:16px; }
    .tg-cred-label { font-size:12px; font-weight:600; color:var(--text-dim); display:block; margin-bottom:4px; }
    .tg-cred-input { width:100%; padding:9px 13px; border-radius:7px; border:1px solid var(--border); background:var(--input-bg); color:var(--text); font-size:13px; font-family:monospace; box-sizing:border-box; }
    .tg-cred-input:focus { outline:none; border-color:var(--accent); }
    .tg-btn-row { display:flex; gap:10px; flex-wrap:wrap; }
    .tg-btn-save { background:var(--accent); color:#fff; border:none; border-radius:7px; padding:9px 20px; font-size:13px; font-weight:600; cursor:pointer; }
    .tg-btn-test { background:var(--card-bg); color:var(--text); border:1px solid var(--border); border-radius:7px; padding:9px 20px; font-size:13px; font-weight:600; cursor:pointer; }
    .tg-status { margin-top:10px; font-size:12px; min-height:18px; }
    .toast { position:fixed; bottom:24px; right:24px; background:#1e293b; color:#fff; padding:10px 18px; border-radius:8px; font-size:13px; opacity:0; transition:opacity .3s; pointer-events:none; z-index:9999; }
    .toast.show { opacity:1; }
  </style>
</head>
<body>
  \${nav("admin-notifications", req)}
  <div class="container" style="max-width:720px">
    <div class="page-header">
      <div>
        <a href="/admin" class="back-link">\u2190 Admin</a>
        <h1>&#x1F4E3; Notifications</h1>
        <p class="page-sub">Configure Telegram bot alerts for pick entries, exits, new users and more</p>
      </div>
    </div>

    <div class="settings-section">
      <h2>&#x1F916; Telegram Bot Credentials</h2>
      <div class="tg-cred-box">
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:14px;line-height:1.6">
          &#x2139;&#xFE0F; <strong>Setup:</strong>
          Create a bot via <a href="https://t.me/BotFather" target="_blank" style="color:var(--accent)">@BotFather</a> &rarr;
          copy the token &rarr; send your bot any message &rarr;
          visit <code style="font-size:11px">api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code> to get the Chat ID.
        </div>
        <div class="tg-cred-grid">
          <div>
            <label class="tg-cred-label">Bot Token</label>
            <input id="tg-token-inp" type="text" class="tg-cred-input" value="\${cfg.tg_bot_token || ""}" placeholder="1234567890:ABCdef\u2026">
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

    <div class="settings-section">
      <h2>&#x1F514; Notification Events</h2>
      \${toggle("tg_notify_pick_entry", "&#x1F4CD; Pick Entry Triggered", "Alert when a pick enters the buy zone and a paper trade is opened automatically.")}
      \${toggle("tg_notify_pick_exit", "&#x1F3AF; Pick Exit &mdash; Target / SL Hit", "Alert when a pick hits its target price or stop-loss and the position is closed.")}
      \${toggle("tg_notify_sl_breach", "&#x26A0;&#xFE0F; SL Breach Warning", "Alert when any open paper position price drops below its stop-loss level.")}
      \${toggle("tg_notify_daily_picks", "&#x1F4C5; Daily Picks Summary", "Send a morning summary of all active picks at 9:15 AM market open.")}
      \${toggle("tg_notify_new_user", "&#x1F465; New User Registration", "Alert when a new user signs up (email or Google OAuth).")}
      \${toggle("tg_notify_system", "&#x2699;&#xFE0F; System Alerts", "Alerts on server errors and critical issues. Keep OFF to reduce noise.")}
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
        else       { st.innerHTML = '<span style="color:#dc2626">&#x26A0; Save failed</span>'; }
      } catch(e) { st.innerHTML = '<span style="color:#dc2626">&#x26A0; Network error</span>'; }
    }
    async function testTelegram() {
      const st = document.getElementById('tg-status');
      st.innerHTML = '<span style="color:var(--text-dim)">Sending\u2026</span>';
      try {
        const r = await fetch('/admin/settings/telegram/test', { method: 'POST' });
        const d = await r.json();
        if (r.ok && d.ok) st.innerHTML = '<span style="color:#16a34a">&#x2705; Test message sent! Check your Telegram.</span>';
        else st.innerHTML = \`<span style="color:#dc2626">&#x274C; \${d.error || 'Failed'}</span>\`;
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
s = s.substring(0, insertIdx) + NOTIFICATIONS_ROUTE + s.substring(insertIdx);

fs.writeFileSync(p, s);
console.log('server.js patched — /admin/notifications page added to nav');
