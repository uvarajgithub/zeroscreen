const fs = require('fs');
const path = '/root/zeroscreen/dist/scheduler.js';
let s = fs.readFileSync(path, 'utf8');

// ── 1. Replace old sendTelegram (env-only) with DB-backed version ─────────
const OLD_SEND = `async function sendTelegram(message) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId)
        return;
    try {
        const url = \`https://api.telegram.org/bot\${token}/sendMessage\`;
        const body = JSON.stringify({ chat_id: chatId, text: message, parse_mode: "Markdown" });
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
        if (!res.ok)
            console.error("[Telegram] Send failed:", await res.text());
    }
    catch (e) {
        console.error("[Telegram] Error:", e.message);
    }
}`;

const NEW_SEND = `async function sendTelegram(message, toggleKey) {
    try {
        if (toggleKey) {
            const enabled = await db_1.getSetting(toggleKey);
            if (enabled === 'false') return;
        }
        const token  = (await db_1.getSetting('tg_bot_token'))  || process.env.TELEGRAM_BOT_TOKEN;
        const chatId = (await db_1.getSetting('tg_chat_id'))    || process.env.TELEGRAM_CHAT_ID;
        if (!token || !chatId) return;
        const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
        const body = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' });
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        if (!res.ok) console.error('[Telegram] Send failed:', await res.text());
    } catch(e) { console.error('[Telegram] Error:', e.message); }
}`;

if (!s.includes(OLD_SEND)) { console.error('OLD sendTelegram not found'); process.exit(1); }
s = s.replace(OLD_SEND, NEW_SEND);
console.log('✓ sendTelegram upgraded to DB-backed');

// ── 2. Add tg_notify_daily_picks toggle to sendMorningReminder ────────────
const OLD_MORNING = `    await sendTelegram(msg);
    console.log("[Reminder] Morning Telegram sent");`;
const NEW_MORNING = `    await sendTelegram(msg, 'tg_notify_daily_picks');
    console.log("[Reminder] Morning Telegram sent");`;
if (!s.includes(OLD_MORNING)) { console.error('Morning reminder sendTelegram not found'); process.exit(1); }
s = s.replace(OLD_MORNING, NEW_MORNING);
console.log('✓ Morning reminder wired to tg_notify_daily_picks');

// ── 3. Add tg_notify_daily_picks toggle to sendEODSummary ─────────────────
const OLD_EOD = `    await sendTelegram(msg);
    console.log("[EOD] Summary Telegram sent");`;
const NEW_EOD = `    await sendTelegram(msg, 'tg_notify_daily_picks');
    console.log("[EOD] Summary Telegram sent");`;
if (!s.includes(OLD_EOD)) { console.error('EOD summary sendTelegram not found'); process.exit(1); }
s = s.replace(OLD_EOD, NEW_EOD);
console.log('✓ EOD summary wired to tg_notify_daily_picks');

// ── 4. Wire tg_notify_sl_breach to trackPickResults ───────────────────────
const OLD_TARGET = `            await (0, db_1.updatePickResult)(pick.id, "target_hit", livePrice);
            console.log(\`[PickTracker] TARGET HIT Γö \${pick.stock_symbol} @ Γé╣\${livePrice}\`);`;
const NEW_TARGET = `            await (0, db_1.updatePickResult)(pick.id, "target_hit", livePrice);
            console.log(\`[PickTracker] TARGET HIT — \${pick.stock_symbol} @ ₹\${livePrice}\`);
            const tDate = new Date().toLocaleString('en-IN', {timeZone:'Asia/Kolkata'});
            await sendTelegram('<b>🎯 Target Hit — ' + pick.stock_symbol + '</b>\\nExit @ ₹' + livePrice + ' | Entry was ₹' + (pick.entry_price || '-') + '\\nTarget: ₹' + pick.target + '\\n🕐 ' + tDate + ' IST', 'tg_notify_sl_breach');`;

if (!s.includes(OLD_TARGET)) { console.error('TARGET HIT block not found'); process.exit(1); }
s = s.replace(OLD_TARGET, NEW_TARGET);
console.log('✓ Target hit wired to tg_notify_sl_breach');

const OLD_SL = `            await (0, db_1.updatePickResult)(pick.id, "sl_hit", livePrice);
            console.log(\`[PickTracker] SL HIT Γö \${pick.stock_symbol} @ Γé╣\${livePrice}\`);`;
const NEW_SL = `            await (0, db_1.updatePickResult)(pick.id, "sl_hit", livePrice);
            console.log(\`[PickTracker] SL HIT — \${pick.stock_symbol} @ ₹\${livePrice}\`);
            const slDate = new Date().toLocaleString('en-IN', {timeZone:'Asia/Kolkata'});
            await sendTelegram('<b>⚠️ SL Hit — ' + pick.stock_symbol + '</b>\\nExit @ ₹' + livePrice + ' | Entry was ₹' + (pick.entry_price || '-') + '\\nStop Loss: ₹' + pick.stop_loss + '\\n🕐 ' + slDate + ' IST', 'tg_notify_sl_breach');`;

if (!s.includes(OLD_SL)) { console.error('SL HIT block not found'); process.exit(1); }
s = s.replace(OLD_SL, NEW_SL);
console.log('✓ SL hit wired to tg_notify_sl_breach');

fs.writeFileSync(path, s, 'utf8');
console.log('✓ scheduler.js patched — all 5 Telegram events now wired');
