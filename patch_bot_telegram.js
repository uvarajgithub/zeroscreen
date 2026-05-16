// Upgrade trading-bot notifier.js + token-server.js to read Telegram token
// from zeroscreen DB (/root/zeroscreen/zeroscreen.db) with env fallback
const fs = require('fs');

// ── Helper: read tg_bot_token / tg_chat_id from zeroscreen DB ─────────────
const DB_READER = `
// Read Telegram credentials from zeroscreen DB (admin panel) with env fallback
async function getTgCreds() {
    try {
        const sqlite3 = require('/root/zeroscreen/node_modules/sqlite3').verbose();
        const dbToken = await new Promise((res, rej) => {
            const db = new sqlite3.Database('/root/zeroscreen/zeroscreen.db', sqlite3.OPEN_READONLY, e => e ? rej(e) : null);
            db.get('SELECT value FROM app_settings WHERE key=?', ['tg_bot_token'], (e, r) => {
                db.close(); e ? rej(e) : res(r?.value || '');
            });
        });
        const dbChat = await new Promise((res, rej) => {
            const db = new sqlite3.Database('/root/zeroscreen/zeroscreen.db', sqlite3.OPEN_READONLY, e => e ? rej(e) : null);
            db.get('SELECT value FROM app_settings WHERE key=?', ['tg_chat_id'], (e, r) => {
                db.close(); e ? rej(e) : res(r?.value || '');
            });
        });
        if (dbToken && dbChat) return { token: dbToken, chatId: dbChat };
    } catch(e) { /* fall through to env */ }
    return { token: process.env.TELEGRAM_BOT_TOKEN || '', chatId: process.env.TELEGRAM_CHAT_ID || '' };
}
`;

// ── 1. Patch notifier.js ───────────────────────────────────────────────────
const NOTIFIER_PATH = '/home/ubuntu/trading-bot/dist/src/notifier.js';
let n = fs.readFileSync(NOTIFIER_PATH, 'utf8');

const OLD_NOTIFIER_FN = `async function sendTelegram(message, attempt = 1) {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID)
        return;
    const body = JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
    });
    const success = await new Promise((resolve) => {
        const req = https_1.default.request({
            hostname: 'api.telegram.org',
            path: \`/bot\${TELEGRAM_BOT_TOKEN}/sendMessage\`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: 15000,
        }, (res) => {
            res.resume();
            resolve(true);
        });
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
            console.error(\`[Telegram] Timeout (attempt \${attempt})\`);
        });
        req.on('error', (e) => {
            resolve(false);
            console.error(\`[Telegram] Error (attempt \${attempt}): \${e.message}\`);
        });
        req.write(body);
        req.end();
    });
    if (!success && attempt < 3) {
        await new Promise(r => setTimeout(r, 3000));
        return sendTelegram(message, attempt + 1);
    }
}`;

const NEW_NOTIFIER_FN = DB_READER + `
async function sendTelegram(message, attempt = 1) {
    const { token: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID } = await getTgCreds();
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    const body = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' });
    const success = await new Promise((resolve) => {
        const req = https_1.default.request({
            hostname: 'api.telegram.org',
            path: '/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            timeout: 15000,
        }, (res) => { res.resume(); resolve(true); });
        req.on('timeout', () => { req.destroy(); resolve(false); console.error('[Telegram] Timeout (attempt ' + attempt + ')'); });
        req.on('error', (e) => { resolve(false); console.error('[Telegram] Error (attempt ' + attempt + '): ' + e.message); });
        req.write(body);
        req.end();
    });
    if (!success && attempt < 3) {
        await new Promise(r => setTimeout(r, 3000));
        return sendTelegram(message, attempt + 1);
    }
}`;

if (!n.includes('async function sendTelegram')) { console.error('sendTelegram not found in notifier.js'); process.exit(1); }
n = n.replace(OLD_NOTIFIER_FN, NEW_NOTIFIER_FN);
// If exact match failed, use a looser replace on the function signature line
if (!n.includes('getTgCreds')) {
    n = n.replace(
        /async function sendTelegram\(message, attempt = 1\) \{[\s\S]*?if \(!success && attempt < 3\) \{[\s\S]*?return sendTelegram\(message, attempt \+ 1\);\s*\}\s*\}/,
        NEW_NOTIFIER_FN
    );
}
if (!n.includes('getTgCreds')) { console.error('notifier.js replacement failed'); process.exit(1); }
fs.writeFileSync(NOTIFIER_PATH, n, 'utf8');
console.log('✓ notifier.js upgraded to DB-backed token');

// ── 2. Patch token-server.js ───────────────────────────────────────────────
const TS_PATH = '/home/ubuntu/trading-bot/dist/token-server.js';
let ts = fs.readFileSync(TS_PATH, 'utf8');

const OLD_TS_FN = `async function sendTgNotify(msg) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chat = process.env.TELEGRAM_CHAT_ID;`;

const NEW_TS_FN = `async function getTgCreds_ts() {
    try {
        const sqlite3 = require('/root/zeroscreen/node_modules/sqlite3').verbose();
        const dbToken = await new Promise((res, rej) => {
            const db = new sqlite3.Database('/root/zeroscreen/zeroscreen.db', sqlite3.OPEN_READONLY, e => e ? rej(e) : null);
            db.get('SELECT value FROM app_settings WHERE key=?', ['tg_bot_token'], (e, r) => { db.close(); e ? rej(e) : res(r?.value || ''); });
        });
        const dbChat = await new Promise((res, rej) => {
            const db = new sqlite3.Database('/root/zeroscreen/zeroscreen.db', sqlite3.OPEN_READONLY, e => e ? rej(e) : null);
            db.get('SELECT value FROM app_settings WHERE key=?', ['tg_chat_id'], (e, r) => { db.close(); e ? rej(e) : res(r?.value || ''); });
        });
        if (dbToken && dbChat) return { token: dbToken, chat: dbChat };
    } catch(e) {}
    return { token: process.env.TELEGRAM_BOT_TOKEN || '', chat: process.env.TELEGRAM_CHAT_ID || '' };
}
async function sendTgNotify(msg) {
    const { token, chat } = await getTgCreds_ts();`;

if (!ts.includes(OLD_TS_FN)) { console.error('sendTgNotify not found in token-server.js'); process.exit(1); }
ts = ts.replace(OLD_TS_FN, NEW_TS_FN);
fs.writeFileSync(TS_PATH, ts, 'utf8');
console.log('✓ token-server.js upgraded to DB-backed token');

console.log('\nAll done — trading-bot + token-server now use admin panel Telegram token');
