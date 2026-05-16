const fs = require('fs');
const path = '/root/zeroscreen/dist/scheduler.js';
let s = fs.readFileSync(path, 'utf8');

// ── Wire tg_notify_sl_breach to trackPickResults via line-based replace ───
// Find the targetHit block and insert Telegram call after updatePickResult line
const TARGET_MARKER = 'await (0, db_1.updatePickResult)(pick.id, "target_hit", livePrice);';
const SL_MARKER     = 'await (0, db_1.updatePickResult)(pick.id, "sl_hit", livePrice);';

if (!s.includes(TARGET_MARKER)) { console.error('target_hit marker not found'); process.exit(1); }
if (!s.includes(SL_MARKER))     { console.error('sl_hit marker not found'); process.exit(1); }

// After target_hit, insert Telegram line
const tgTargetLine = `\n            await sendTelegram('<b>\u{1F3AF} Target Hit \u2014 ' + pick.stock_symbol + '</b>\\n\u274C Exit @ \u20B9' + livePrice + ' | Entry \u20B9' + (pick.entry_price || '-') + ' | Target \u20B9' + pick.target + '\\n\u{1F550} ' + new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) + ' IST', 'tg_notify_sl_breach');`;
s = s.replace(TARGET_MARKER, TARGET_MARKER + tgTargetLine);
console.log('✓ Target hit Telegram wired');

// After sl_hit, insert Telegram line
const tgSLLine = `\n            await sendTelegram('<b>\u26A0\uFE0F SL Hit \u2014 ' + pick.stock_symbol + '</b>\\n\u274C Exit @ \u20B9' + livePrice + ' | Entry \u20B9' + (pick.entry_price || '-') + ' | SL \u20B9' + pick.stop_loss + '\\n\u{1F550} ' + new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) + ' IST', 'tg_notify_sl_breach');`;
s = s.replace(SL_MARKER, SL_MARKER + tgSLLine);
console.log('✓ SL hit Telegram wired');

fs.writeFileSync(path, s, 'utf8');
console.log('✓ scheduler.js — SL breach Telegram notifications added');
