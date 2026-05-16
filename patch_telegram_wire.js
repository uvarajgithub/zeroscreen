// patch_telegram_wire.js — upgrade notifyTelegram to use DB + wire pick events
const fs = require('fs');
const p = '/root/zeroscreen/dist/server.js';
let s = fs.readFileSync(p, 'utf8');

// ── 1. Replace notifyTelegram with async DB-backed version ─────────────────
const OLD_FN = `const TG_BOT = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "";
function notifyTelegram(text) {
    if (!TG_BOT || !TG_CHAT)
        return;
    const encoded = encodeURIComponent(text);
    const url = \`https://api.telegram.org/bot\${TG_BOT}/sendMessage?chat_id=\${TG_CHAT}&text=\${encoded}\`;
    https_1.default.get(url, (r) => { r.resume(); }).on("error", () => { });
}`;
if (!s.includes(OLD_FN)) { console.error('notifyTelegram fn not found'); process.exit(1); }

const NEW_FN = `const TG_BOT = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "";
// Legacy sync version (used for env-var based fallback)
function notifyTelegram(text, toggleKey) {
    sendTelegramNotification(text, toggleKey).catch(() => {});
}
// Async version — reads token/chat from DB (admin panel) with env fallback
async function sendTelegramNotification(text, toggleKey) {
    try {
        if (toggleKey) {
            const enabled = await (0, db_1.getSetting)(toggleKey);
            if (enabled === 'false') return;
        }
        const token  = (await (0, db_1.getSetting)('tg_bot_token'))  || TG_BOT;
        const chatId = (await (0, db_1.getSetting)('tg_chat_id'))    || TG_CHAT;
        if (!token || !chatId) return;
        await fetch(\`https://api.telegram.org/bot\${token}/sendMessage\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
        });
    } catch(e) { /* silent */ }
}`;
s = s.replace(OLD_FN, NEW_FN);

// ── 2. Wire: pick entry triggered → tg_notify_pick_entry ──────────────────
const ENTRY_OLD = `                            await (0, db_1.updatePickEntry)(pick.id, livePrice);
                            console.log(\`[PICK-MONITOR] \${pick.stock_symbol} ENTRY_TRIGGERED @ \${livePrice} (id:\${pick.id})\`);`;
const ENTRY_NEW = `                            await (0, db_1.updatePickEntry)(pick.id, livePrice);
                            console.log(\`[PICK-MONITOR] \${pick.stock_symbol} ENTRY_TRIGGERED @ \${livePrice} (id:\${pick.id})\`);
                            sendTelegramNotification(\`\u{1f4cd} <b>Pick Entry Triggered</b>\\n\u{1f4c8} \${pick.stock_symbol} (\${pick.direction || 'LONG'})\\n\u{1f4b0} Entry @ \u20b9\${livePrice}\\nSL: \u20b9\${pick.stop_loss || '-'} | Target: \u20b9\${pick.target || '-'}\\n\u23f0 \${new Date().toLocaleString('en-IN', {timeZone:'Asia/Kolkata'})} IST\`, 'tg_notify_pick_entry').catch(()=>{});`;
if (!s.includes(ENTRY_OLD)) { console.error('entry trigger not found'); process.exit(1); }
s = s.replace(ENTRY_OLD, ENTRY_NEW);

// ── 3. Wire: pick exit (target/SL) → tg_notify_pick_exit ──────────────────
const EXIT_OLD = `                        await (0, db_1.updatePickResult)(pick.id, resolved, livePrice);
                        console.log(\`[PICK-MONITOR] \${pick.stock_symbol} \${resolved} @ \${livePrice} (id:\${pick.id})\`);`;
const EXIT_NEW = `                        await (0, db_1.updatePickResult)(pick.id, resolved, livePrice);
                        console.log(\`[PICK-MONITOR] \${pick.stock_symbol} \${resolved} @ \${livePrice} (id:\${pick.id})\`);
                        const isWin = resolved === 'target_hit';
                        sendTelegramNotification(\`\${isWin ? '\u{1f3af} <b>Target Hit</b>' : '\u{1f6d1} <b>SL Hit</b>'} — \${pick.stock_symbol}\\n\u{1f4b9} Exit @ \u20b9\${livePrice}\\nEntry was \u20b9\${pick.entry_price || '-'} | \${isWin ? 'Target' : 'SL'}: \u20b9\${isWin ? pick.target : pick.stop_loss}\\n\u23f0 \${new Date().toLocaleString('en-IN', {timeZone:'Asia/Kolkata'})} IST\`, 'tg_notify_pick_exit').catch(()=>{});`;
if (!s.includes(EXIT_OLD)) { console.error('exit event not found'); process.exit(1); }
s = s.replace(EXIT_OLD, EXIT_NEW);

// ── 4. Upgrade existing new-user calls to pass toggle key ─────────────────
s = s.replace(
    `notifyTelegram(\`\u{1f195} New ZeroScreen signup!\\nName: \${name.trim()}\\nEmail: \${email.trim()}\\nRole: \${role}\\nTime: \${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST\`);`,
    `notifyTelegram(\`\u{1f195} New ZeroScreen signup!\\nName: \${name.trim()}\\nEmail: \${email.trim()}\\nRole: \${role}\\nTime: \${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST\`, 'tg_notify_new_user');`
);
s = s.replace(
    `notifyTelegram(\`\u{1f195} New ZeroScreen signup via Google!\\nName: \${gUser.name}\\nEmail: \${gUser.email}\`);`,
    `notifyTelegram(\`\u{1f195} New ZeroScreen signup via Google!\\nName: \${gUser.name}\\nEmail: \${gUser.email}\`, 'tg_notify_new_user');`
);

fs.writeFileSync(p, s);
console.log('server.js patched — Telegram wired to DB token + pick events');
