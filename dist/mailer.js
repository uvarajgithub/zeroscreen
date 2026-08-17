"use strict";
/**
 * mailer.ts — Email sending via nodemailer (SMTP)
 *
 * Configure via .env:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWelcomeEmail = sendWelcomeEmail;
exports.sendContactNotification = sendContactNotification;
exports.sendAlertEmail = sendAlertEmail;
exports.sendPriceAlertEmail = sendPriceAlertEmail;
exports.sendPasswordResetEmail = sendPasswordResetEmail;
exports.sendPicksDigest = sendPicksDigest;
exports.sendTelegramMessage = sendTelegramMessage;
exports.sendTelegramSignalAlert = sendTelegramSignalAlert;
exports.sendWeeklyAdminEmail = sendWeeklyAdminEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const configured = process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.SMTP_USER !== "your-email@gmail.com";
const transporter = configured
    ? nodemailer_1.default.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure: process.env.SMTP_PORT === "465",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    })
    : null;
const FROM = process.env.SMTP_FROM || "ZeroScreen <noreply@zeroscreen.app>";
async function send(to, subject, html) {
    if (!transporter) {
        console.log(`[Mailer] SMTP not configured — skipping email to ${to}: ${subject}`);
        return;
    }
    try {
        await transporter.sendMail({ from: FROM, to, subject, html });
        console.log(`[Mailer] Sent "${subject}" → ${to}`);
    }
    catch (err) {
        console.error(`[Mailer] Failed to send to ${to}:`, err.message);
    }
}
// ── Email templates ────────────────────────────────────────────────────────────
function baseTemplate(content) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; padding:0; background:#f0f4ff; font-family:'Segoe UI',Arial,sans-serif; color:#0a0e27; }
  .wrap { max-width:560px; margin:32px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(37,99,235,0.12); }
  .header { background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%); padding:28px 32px; }
  .logo { font-size:22px; font-weight:800; color:#fff; letter-spacing:-0.8px; }
  .logo span { color:#f59e0b; }
  .body { padding:32px; }
  h2 { font-size:20px; font-weight:700; margin:0 0 12px; color:#0a0e27; }
  p { font-size:14px; line-height:1.7; color:#5b6490; margin:0 0 16px; }
  .btn { display:inline-block; background:linear-gradient(135deg,#2563eb,#7c3aed); color:#fff; text-decoration:none; padding:12px 28px; border-radius:9px; font-weight:700; font-size:15px; }
  .divider { border:none; border-top:1px solid #e8eeff; margin:24px 0; }
  .footer { padding:20px 32px; background:#f4f7fe; font-size:12px; color:#8e97c0; text-align:center; }
  .metric { display:inline-block; background:#f0f4ff; border:1px solid #dde3f5; border-radius:8px; padding:8px 16px; margin:4px; font-size:13px; font-weight:600; color:#2563eb; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="header"><div class="logo">Zero<span>Screen</span></div></div>
    <div class="body">${content}</div>
    <div class="footer">© 2026 ZeroScreen · India's sharpest NSE stock screener<br>You're receiving this because you signed up at ZeroScreen.</div>
  </div>
</body>
</html>`;
}
async function sendWelcomeEmail(name, email) {
    const firstName = name.split(" ")[0];
    const html = baseTemplate(`
    <h2>Welcome to ZeroScreen, ${firstName}! 🎉</h2>
    <p>Your account is ready. You now have access to India's most powerful NSE stock screener — completely free.</p>
    <p>Here's what you can do:</p>
    <p>
      <span class="metric">🔍 Screen 5,000+ NSE stocks</span>
      <span class="metric">📊 Filter by ROCE, D/E, P/E</span>
      <span class="metric">⭐ Create watchlists</span>
      <span class="metric">📈 Track profit trends</span>
    </p>
    <hr class="divider">
    <p>Jump in and find your next great investment:</p>
    <a href="${process.env.APP_URL || "http://localhost:4000"}" class="btn">Open ZeroScreen →</a>
    <hr class="divider">
    <p style="font-size:12px;color:#8e97c0;">Happy investing!<br>— The ZeroScreen Team</p>
  `);
    await send(email, `Welcome to ZeroScreen, ${firstName}!`, html);
}
async function sendContactNotification(senderName, senderEmail, subject, message) {
    const ownerEmail = process.env.CONTACT_EMAIL || process.env.SMTP_USER || "";
    if (!ownerEmail || ownerEmail === "your-email@gmail.com") {
        console.log(`[Mailer] Contact form: ${senderName} <${senderEmail}> — ${subject}`);
        return;
    }
    const html = baseTemplate(`
    <h2>📬 New Contact Form Submission</h2>
    <p><strong>From:</strong> ${senderName} &lt;${senderEmail}&gt;</p>
    <p><strong>Subject:</strong> ${subject}</p>
    <hr class="divider">
    <p style="white-space:pre-wrap;background:#f4f7fe;padding:16px;border-radius:8px;border:1px solid #dde3f5;font-size:14px;color:#0a0e27;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
    <hr class="divider">
    <a href="mailto:${senderEmail}?subject=Re: ${encodeURIComponent(subject)}" class="btn">Reply to ${senderName} →</a>
  `);
    // Email goes to the site owner
    await send(ownerEmail, `[ZeroScreen Contact] ${subject} — ${senderName}`, html);
    // Auto-reply to the sender
    const autoReplyHtml = baseTemplate(`
    <h2>We received your message! 👋</h2>
    <p>Hi ${senderName.split(" ")[0]}, thanks for reaching out to ZeroScreen.</p>
    <p>We've received your message about <strong>"${subject}"</strong> and will get back to you within 24 hours.</p>
    <hr class="divider">
    <p style="white-space:pre-wrap;background:#f4f7fe;padding:16px;border-radius:8px;border:1px solid #dde3f5;font-size:14px;color:#5b6490;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
    <hr class="divider">
    <p style="font-size:12px;color:#8e97c0;">— The ZeroScreen Team</p>
  `);
    await send(senderEmail, `We got your message — ZeroScreen`, autoReplyHtml);
}
async function sendAlertEmail(to, userName, alertName, stocks) {
    const firstName = userName.split(" ")[0];
    const topStocks = stocks.slice(0, 10);
    const rows = topStocks.map(s => {
        var _a, _b;
        return `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e8eeff;font-weight:700;color:#2563eb">${s.symbol}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8eeff;font-size:12px;color:#5b6490">${(s.company_name || "—").substring(0, 30)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8eeff">₹${((_a = s.price) === null || _a === void 0 ? void 0 : _a.toFixed(2)) || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8eeff;font-weight:700;color:#16a34a">${((_b = s.roce) === null || _b === void 0 ? void 0 : _b.toFixed(1)) || "—"}%</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8eeff;font-size:12px;color:${(s.change_pct || 0) >= 0 ? "#16a34a" : "#dc2626"}">${s.change_pct != null ? (s.change_pct >= 0 ? "+" : "") + s.change_pct.toFixed(2) + "%" : "—"}</td>
    </tr>`;
    }).join("");
    const html = baseTemplate(`
    <h2>📊 Alert: ${alertName}</h2>
    <p>Hi ${firstName}! Your alert found <strong>${stocks.length} stock${stocks.length !== 1 ? "s" : ""}</strong> matching your criteria today.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
      <thead>
        <tr style="background:#f0f4ff">
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:#8e97c0;text-transform:uppercase">Symbol</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:#8e97c0;text-transform:uppercase">Company</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:#8e97c0;text-transform:uppercase">Price</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:#8e97c0;text-transform:uppercase">ROCE%</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:#8e97c0;text-transform:uppercase">Change</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${stocks.length > 10 ? `<p style="font-size:12px;color:#8e97c0">...and ${stocks.length - 10} more stocks.</p>` : ""}
    <a href="${process.env.APP_URL || "http://localhost:4000"}" class="btn">View All on ZeroScreen →</a>
  `);
    await send(to, `ZeroScreen Alert: "${alertName}" — ${stocks.length} stock${stocks.length !== 1 ? "s" : ""} found today`, html);
}
async function sendPriceAlertEmail(to, userName, symbol, direction, targetPrice, currentPrice) {
    const firstName = userName.split(" ")[0];
    const hit = direction === "above" ? "crossed above" : "dropped below";
    const arrow = direction === "above" ? "🚀" : "📉";
    const appUrl = process.env.APP_URL || "http://localhost:4000";
    const html = baseTemplate(`
    <h2>${arrow} Price Alert: ${symbol}</h2>
    <p>Hi ${firstName}! Your price alert for <strong>${symbol}</strong> was triggered.</p>
    <div style="background:#f0f4ff;border:1px solid #dde3f5;border-radius:12px;padding:20px 24px;margin:16px 0;text-align:center">
      <div style="font-size:13px;color:#8e97c0;margin-bottom:4px">${symbol} has ${hit} your target</div>
      <div style="font-size:36px;font-weight:800;color:${direction === "above" ? "#16a34a" : "#dc2626"}">₹${currentPrice.toFixed(2)}</div>
      <div style="font-size:13px;color:#8e97c0;margin-top:4px">Alert price: ₹${targetPrice.toFixed(2)}</div>
    </div>
    <a href="${appUrl}/stock/${symbol}" class="btn">View ${symbol} →</a>
    <hr class="divider">
    <p style="font-size:12px;color:#8e97c0">This alert has been deactivated. Set a new one anytime from <a href="${appUrl}/my-alerts">My Alerts</a>.</p>
  `);
    await send(to, `${arrow} ${symbol} ${hit} ₹${targetPrice.toFixed(2)} — ZeroScreen Alert`, html);
}
async function sendPasswordResetEmail(to, name, resetUrl) {
    const firstName = name.split(" ")[0];
    const html = baseTemplate(`
    <h2>Reset your password 🔐</h2>
    <p>Hi ${firstName}, we received a request to reset your ZeroScreen password.</p>
    <p>Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
    <a href="${resetUrl}" class="btn">Reset Password →</a>
    <hr class="divider">
    <p style="font-size:12px;color:#8e97c0">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
  `);
    await send(to, "Reset your ZeroScreen password", html);
}
async function sendPicksDigest(subscribers, picks) {
    if (!subscribers.length || !picks.length)
        return;
    const appUrl = process.env.APP_URL || "http://localhost:4000";
    const pickRows = picks.map(p => {
        const riskColor = p.risk_level === "High" ? "#dc2626" : p.risk_level === "Low" ? "#16a34a" : "#d97706";
        const dir = p.direction === "SHORT" ? "🔴 SHORT" : "🟢 LONG";
        return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e8eeff;font-weight:800;color:#2563eb;font-size:14px">${p.stock_symbol}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e8eeff;font-size:12px;color:#5b6490">${p.company_name || "—"}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e8eeff;font-weight:700">${dir}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e8eeff;font-size:13px">₹${p.entry_low}–₹${p.entry_high}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e8eeff;font-size:13px;color:#16a34a">${p.target ? "₹" + p.target : "—"}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e8eeff;font-size:13px;color:#dc2626">${p.stop_loss ? "₹" + p.stop_loss : "—"}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e8eeff"><span style="font-size:11px;font-weight:700;color:${riskColor}">${p.risk_level}</span></td>
    </tr>`;
    }).join("");
    const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
    for (const sub of subscribers) {
        const firstName = sub.name.split(" ")[0];
        const html = baseTemplate(`
      <h2>🔥 Today's Picks — ${today}</h2>
      <p>Hi ${firstName}! Here are today's stock picks selected by the ZeroScreen team.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
        <thead>
          <tr style="background:#f0f4ff">
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#8e97c0;text-transform:uppercase">Stock</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#8e97c0;text-transform:uppercase">Company</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#8e97c0;text-transform:uppercase">Dir</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#8e97c0;text-transform:uppercase">Entry</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#8e97c0;text-transform:uppercase">Target</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#8e97c0;text-transform:uppercase">SL</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#8e97c0;text-transform:uppercase">Risk</th>
          </tr>
        </thead>
        <tbody>${pickRows}</tbody>
      </table>
      <p style="font-size:12px;color:#8e97c0">⚠️ These picks are for educational purposes only. Not SEBI registered. Not investment advice. Always do your own research before investing.</p>
      <a href="${appUrl}/today" class="btn">View Picks on ZeroScreen →</a>
      <hr class="divider">
      <p style="font-size:11px;color:#8e97c0">To stop receiving daily picks emails, visit your <a href="${appUrl}/profile" style="color:#2563eb">profile settings</a>.</p>
    `);
        await send(sub.email, `🔥 ZeroScreen Today's Picks — ${today}`, html);
    }
}
// ── Telegram Bot Alert ────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
async function sendTelegramMessage(chatId, text) {
    if (!TELEGRAM_TOKEN || !chatId)
        return;
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
        await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
            signal: AbortSignal.timeout(8000),
        });
    }
    catch (_) { }
}
async function sendTelegramSignalAlert(subscribers, signal) {
    if (!TELEGRAM_TOKEN || !subscribers.length)
        return;
    const dir = signal.direction === "CE" ? "📈 CALL (CE) — Bullish" : "📉 PUT (PE) — Bearish";
    const mode = signal.mode === "LIVE" ? "⚡ LIVE" : "📋 PAPER";
    const text = `📡 <b>ZeroScreen Bot Signal</b>\n\n` +
        `${dir}\n` +
        `<b>Symbol:</b> ${signal.symbol || "BANKNIFTY"}\n` +
        `<b>Entry:</b> ${signal.entryPrice > 0 ? "₹" + signal.entryPrice.toFixed(1) : "Market"}\n` +
        `<b>Stop Loss:</b> ${signal.stopLoss > 0 ? "₹" + signal.stopLoss.toFixed(1) : "Dynamic"}\n` +
        `<b>Mode:</b> ${mode}\n\n` +
        `🔗 <a href="${process.env.APP_URL || "http://localhost:4000"}/signals">View on ZeroScreen</a>`;
    for (const sub of subscribers) {
        sendTelegramMessage(sub.telegram_chat_id, text).catch(() => { });
    }
}
async function sendWeeklyAdminEmail(adminEmail, stats) {
    const { weekStart, weekEnd, botPnL, botTrades, botWins, botLosses, paperPnL, paperTrades, pickWins, pickLosses, pickWinRate, totalUsers } = stats;
    const html = baseTemplate(`
    <h2 style="color:#7c3aed">📊 Weekly Summary — ${weekStart} to ${weekEnd}</h2>
    <table style="width:100%;border-collapse:collapse;margin-top:16px">
      <tr style="background:#1a1a2e">
        <th style="padding:10px;text-align:left;color:#7c3aed">Metric</th>
        <th style="padding:10px;text-align:right;color:#7c3aed">Value</th>
      </tr>
      <tr><td style="padding:8px">🤖 Bot PnL (pts)</td><td style="padding:8px;text-align:right;color:${parseFloat(botPnL) >= 0 ? "#22c55e" : "#ef4444"}">${parseFloat(botPnL) >= 0 ? "+" : ""}${botPnL}</td></tr>
      <tr><td style="padding:8px">Bot Trades</td><td style="padding:8px;text-align:right">${botTrades} (${botWins}W / ${botLosses}L)</td></tr>
      <tr><td style="padding:8px">📋 Paper Trade PnL (₹)</td><td style="padding:8px;text-align:right;color:${parseFloat(paperPnL) >= 0 ? "#22c55e" : "#ef4444"}">${parseFloat(paperPnL) >= 0 ? "+" : ""}₹${paperPnL}</td></tr>
      <tr><td style="padding:8px">Paper Trades</td><td style="padding:8px;text-align:right">${paperTrades}</td></tr>
      <tr><td style="padding:8px">📌 Pick Win Rate</td><td style="padding:8px;text-align:right">${pickWinRate}% (${pickWins}W / ${pickLosses}L)</td></tr>
      <tr><td style="padding:8px">👥 Total Users</td><td style="padding:8px;text-align:right">${totalUsers}</td></tr>
    </table>
    <p style="margin-top:20px;color:#94a3b8;font-size:13px">ZeroScreen — Weekly Admin Report</p>
  `);
    await send(adminEmail, `ZeroScreen Weekly Summary — ${weekStart} to ${weekEnd}`, html);
}
