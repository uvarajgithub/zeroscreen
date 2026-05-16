// patch_telegram_settings.js — add Telegram notification section to admin settings
const fs = require('fs');

// ── 1. db.js: add telegram setting migrations ──────────────────────────────
{
    const p = '/root/zeroscreen/dist/db.js';
    let s = fs.readFileSync(p, 'utf8');
    const ANCHOR = `db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('registration_open','true')")`;
    if (!s.includes(ANCHOR)) { console.error('db.js anchor not found'); process.exit(1); }
    const NEW_MIGRATIONS = `db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('registration_open','true')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('tg_bot_token','')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('tg_chat_id','')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('tg_notify_pick_entry','true')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('tg_notify_pick_exit','true')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('tg_notify_new_user','true')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('tg_notify_daily_picks','true')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('tg_notify_sl_breach','true')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('tg_notify_system','false')");`;
    s = s.replace(ANCHOR + ';', NEW_MIGRATIONS);
    fs.writeFileSync(p, s);
    console.log('db.js patched');
}

// ── 2. server.js: add toggle keys + routes + UI section ────────────────────
{
    const p = '/root/zeroscreen/dist/server.js';
    let s = fs.readFileSync(p, 'utf8');

    // 2a. Add tg_ keys to allowed toggle list
    const ALLOWED_OLD = `        "watchlists_premium_only", "alerts_premium_only", "paper_trade_premium_only",\n    ];`;
    const ALLOWED_NEW = `        "watchlists_premium_only", "alerts_premium_only", "paper_trade_premium_only",
        "tg_notify_pick_entry", "tg_notify_pick_exit", "tg_notify_new_user",
        "tg_notify_daily_picks", "tg_notify_sl_breach", "tg_notify_system",
    ];`;
    if (!s.includes(ALLOWED_OLD)) { console.error('allowed list not found'); process.exit(1); }
    s = s.replace(ALLOWED_OLD, ALLOWED_NEW);

    // 2b. Add POST /admin/settings/telegram route BEFORE the GET /admin/settings route
    const BEFORE_GET = '// \u2500\u2500 GET /admin/settings \u2500';
    const routeIdx = s.indexOf(BEFORE_GET);
    if (routeIdx < 0) { console.error('GET /admin/settings marker not found'); process.exit(1); }
    const NEW_ROUTE = `// \u2500\u2500 POST /admin/settings/telegram \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
app.post("/admin/settings/telegram", requireAdmin, async (req, res) => {
    const { tg_bot_token, tg_chat_id } = req.body;
    if (typeof tg_bot_token === 'string') await (0, db_1.setSetting)('tg_bot_token', tg_bot_token.trim());
    if (typeof tg_chat_id === 'string') await (0, db_1.setSetting)('tg_chat_id', tg_chat_id.trim());
    res.json({ ok: true });
});
// \u2500\u2500 POST /admin/settings/telegram/test \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
app.post("/admin/settings/telegram/test", requireAdmin, async (req, res) => {
    const token = await (0, db_1.getSetting)('tg_bot_token');
    const chatId = await (0, db_1.getSetting)('tg_chat_id');
    if (!token || !chatId) { res.status(400).json({ error: 'Bot token or Chat ID not configured' }); return; }
    try {
        const r = await fetch(\`https://api.telegram.org/bot\${token}/sendMessage\`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: '\u2705 ZeroScreen Admin: Telegram notifications are working!', parse_mode: 'HTML' })
        });
        const data = await r.json();
        if (data.ok) res.json({ ok: true });
        else res.status(400).json({ error: data.description || 'Telegram API error' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});
`;
    s = s.substring(0, routeIdx) + NEW_ROUTE + s.substring(routeIdx);

    // 2c. Add Telegram section to the settings page HTML
    // Find the keys array and add tg keys
    const KEYS_OLD = `        "otp_required", "registration_open",
        "feature_signals", "feature_dashboard", "feature_strategies",`;
    const KEYS_NEW = `        "otp_required", "registration_open",
        "tg_bot_token", "tg_chat_id",
        "tg_notify_pick_entry", "tg_notify_pick_exit", "tg_notify_new_user",
        "tg_notify_daily_picks", "tg_notify_sl_breach", "tg_notify_system",
        "feature_signals", "feature_dashboard", "feature_strategies",`;
    if (!s.includes(KEYS_OLD)) { console.error('keys array not found'); process.exit(1); }
    s = s.replace(KEYS_OLD, KEYS_NEW);

    // 2d. Add Telegram section HTML before closing </div> of premium section
    const HTML_ANCHOR = `    </div>\n  </div>\n\n  <div class="toast" id="toast"></div>`;
    if (!s.includes(HTML_ANCHOR)) { console.error('HTML anchor not found'); process.exit(1); }
    const TG_SECTION = `    </div>

    <div class="settings-section">
      <h2>\u{1f4e3} Telegram Notifications</h2>
      <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:18px 20px;margin-bottom:14px">
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:14px">
          Configure your Telegram bot to receive real-time alerts.<br>
          <a href="https://core.telegram.org/bots#botfather" target="_blank" style="color:var(--accent)">Create a bot via @BotFather</a> \u2192 copy the token \u2192 send a message to your bot \u2192 get chat ID via <code>getUpdates</code>.
        </div>
        <div style="display:grid;gap:10px;margin-bottom:14px">
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-dim);display:block;margin-bottom:4px">Bot Token</label>
            <input id="tg-token-inp" type="text" value="\${s["tg_bot_token"] || ""}" placeholder="1234567890:ABCdef..." style="width:100%;padding:8px 12px;border-radius:7px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:13px;font-family:monospace;box-sizing:border-box">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-dim);display:block;margin-bottom:4px">Chat ID / Channel ID</label>
            <input id="tg-chatid-inp" type="text" value="\${s["tg_chat_id"] || ""}" placeholder="-1001234567890 or @yourchannel" style="width:100%;padding:8px 12px;border-radius:7px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:13px;font-family:monospace;box-sizing:border-box">
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button onclick="saveTelegram()" style="background:var(--accent);color:#fff;border:none;border-radius:7px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer">\u{1f4be} Save Credentials</button>
          <button onclick="testTelegram()" style="background:var(--card-bg);color:var(--text);border:1px solid var(--border);border-radius:7px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer">\u{1f4e8} Send Test Message</button>
        </div>
        <div id="tg-status" style="margin-top:10px;font-size:12px"></div>
      </div>
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin-bottom:10px;margin-top:4px">Notification Events</div>
      \${toggle("tg_notify_pick_entry", "\u{1f4cd} Pick Entry Triggered", "Alert when a pick enters the buy zone and a paper trade is opened.")}
      \${toggle("tg_notify_pick_exit", "\u{1f3af} Pick Exit (Target / SL Hit)", "Alert when a pick hits its target price or stop-loss.")}
      \${toggle("tg_notify_sl_breach", "\u26a0\ufe0f SL Breach Warning", "Alert when any open paper position breaches stop-loss level.")}
      \${toggle("tg_notify_daily_picks", "\u{1f4c5} Daily Picks Summary", "Send a morning summary of today\u2019s active picks at market open (9:15 AM).")}
      \${toggle("tg_notify_new_user", "\u{1f465} New User Registration", "Alert when a new user signs up on the platform.")}
      \${toggle("tg_notify_system", "\u2699\ufe0f System Alerts", "Send alerts on server errors, PM2 restarts, and DB issues. Disable to reduce noise.")}
    </div>
  </div>

  <div class="toast" id="toast"></div>`;
    s = s.replace(HTML_ANCHOR, TG_SECTION);

    // 2e. Add saveTelegram/testTelegram JS functions inside <script> block
    const SCRIPT_ANCHOR = `    async function save(key, value) {`;
    if (!s.includes(SCRIPT_ANCHOR)) { console.error('script anchor not found'); process.exit(1); }
    const NEW_SCRIPTS = `    async function saveTelegram() {
      const token = document.getElementById('tg-token-inp').value.trim();
      const chatId = document.getElementById('tg-chatid-inp').value.trim();
      const st = document.getElementById('tg-status');
      try {
        const r = await fetch('/admin/settings/telegram', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tg_bot_token: token, tg_chat_id: chatId })
        });
        if (r.ok) { st.innerHTML = '<span style="color:#16a34a">\u2705 Saved successfully</span>'; showToast('\u2705 Telegram credentials saved'); }
        else       { st.innerHTML = '<span style="color:#dc2626">\u26a0\ufe0f Save failed</span>'; }
      } catch(e) { st.innerHTML = '<span style="color:#dc2626">\u26a0\ufe0f Network error</span>'; }
    }
    async function testTelegram() {
      const st = document.getElementById('tg-status');
      st.innerHTML = '<span style="color:var(--text-dim)">Sending\u2026</span>';
      try {
        const r = await fetch('/admin/settings/telegram/test', { method: 'POST' });
        const d = await r.json();
        if (r.ok && d.ok) { st.innerHTML = '<span style="color:#16a34a">\u2705 Test message sent! Check your Telegram.</span>'; }
        else { st.innerHTML = \`<span style="color:#dc2626">\u274c \${d.error || 'Failed'}</span>\`; }
      } catch(e) { st.innerHTML = '<span style="color:#dc2626">\u274c Network error</span>'; }
    }
    async function save(key, value) {`;
    s = s.replace(SCRIPT_ANCHOR, NEW_SCRIPTS);

    fs.writeFileSync(p, s);
    console.log('server.js patched');
}

console.log('\nAll patches applied');
