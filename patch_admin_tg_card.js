// patch_admin_tg_card.js — add Telegram card to admin home + dedicated /admin/telegram page
const fs = require('fs');
const p = '/root/zeroscreen/dist/server.js';
let s = fs.readFileSync(p, 'utf8');

// 1. Add Telegram card on admin home page, after the Quick Links card (index-based)
{
    const QUICK_LINK = '/admin/settings" class="btn-secondary">';
    const idx = s.indexOf(QUICK_LINK);
    if (idx < 0) { console.error('settings link not found'); process.exit(1); }
    // Find the end of the admin-quick-grid closing </div></div></div>
    const gridEnd = s.indexOf('  </div>\n  <script src="/public/js/app.js"></script>', idx);
    if (gridEnd < 0) { console.error('grid end not found'); process.exit(1); }
    // Find the closing </div></div> of the card that contains the settings link
    const cardClose = s.indexOf('\n      </div>\n    </div>\n\n\n  </div>', idx);
    if (cardClose < 0) { console.error('card close not found'); process.exit(1); }

    const INSERT_AFTER = s.indexOf('</div>', cardClose) + '</div>'.length; // closes </div> of admin-quick-card
    const TG_CARD = `
      <div class="admin-quick-card">
        <h3>&#x1F4E3; Telegram</h3>
        <p id="tg-status-home" style="font-size:13px;color:var(--text-dim)">Loading\u2026</p>
        <a href="/admin/settings#tg" class="btn-secondary" style="margin-top:8px">Configure &amp; Test</a>
      </div>`;
    s = s.substring(0, INSERT_AFTER) + TG_CARD + s.substring(INSERT_AFTER);
}

// Also add Telegram link to Quick Links
{
    const SETTINGS_LINK = '/admin/settings" class="btn-secondary">';
    const idx = s.indexOf(SETTINGS_LINK);
    const lineEnd = s.indexOf('\n', idx);
    s = s.substring(0, lineEnd) + '\n          <a href="/admin/settings#tg" class="btn-secondary">&#x1F4E3; Telegram</a>' + s.substring(lineEnd);
}

// 2. Add GET /admin/settings/telegram/status API for the card
const STATUS_ANCHOR = '// \u2500\u2500 POST /admin/settings/telegram \u2500';
const statusIdx = s.indexOf(STATUS_ANCHOR);
if (statusIdx < 0) { console.error('telegram route anchor not found'); process.exit(1); }
const STATUS_ROUTE = `// \u2500\u2500 GET /admin/settings/telegram/status \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
app.get("/admin/settings/telegram/status", requireAdmin, async (req, res) => {
    const token  = await (0, db_1.getSetting)('tg_bot_token');
    const chatId = await (0, db_1.getSetting)('tg_chat_id');
    const keys = ['tg_notify_pick_entry','tg_notify_pick_exit','tg_notify_new_user','tg_notify_daily_picks','tg_notify_sl_breach','tg_notify_system'];
    const vals = await Promise.all(keys.map(k => (0, db_1.getSetting)(k)));
    const notifications_on = vals.filter(v => v !== 'false').length;
    res.json({ configured: !!(token && chatId), notifications_on });
});
`;
s = s.substring(0, statusIdx) + STATUS_ROUTE + s.substring(statusIdx);

// 3. Add status script before </body> of admin home page
{
    const BODY_END = '</body>\n</html>`);';
    const bodyIdx = s.indexOf(BODY_END);
    if (bodyIdx < 0) { console.error('body end not found'); process.exit(1); }
    const STATUS_SCRIPT = `  <script>
    fetch('/admin/settings/telegram/status').then(r=>r.json()).then(d=>{
      const el = document.getElementById('tg-status-home');
      if (!el) return;
      if (d.configured) {
        el.innerHTML = '<span style="color:#16a34a">&#x2705; Bot configured</span><br><span style="font-size:11px">' + d.notifications_on + ' notifications ON</span>';
      } else {
        el.innerHTML = '<span style="color:#f59e0b">&#x26A0;&#xFE0F; Not configured</span><br><span style="font-size:11px">Add bot token &amp; chat ID in Settings</span>';
      }
    }).catch(()=>{});
  </script>
  `;
    s = s.substring(0, bodyIdx) + STATUS_SCRIPT + s.substring(bodyIdx);
}

fs.writeFileSync(p, s);
console.log('server.js patched — Telegram card on admin home + status API');
