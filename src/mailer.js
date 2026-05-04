"use strict";
/**
 * mailer.ts — Email sending via nodemailer (SMTP)
 *
 * Configure via .env:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWelcomeEmail = sendWelcomeEmail;
exports.sendContactNotification = sendContactNotification;
exports.sendAlertEmail = sendAlertEmail;
exports.sendPasswordResetEmail = sendPasswordResetEmail;
var nodemailer_1 = require("nodemailer");
var configured = process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.SMTP_USER !== "your-email@gmail.com";
var transporter = configured
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
var FROM = process.env.SMTP_FROM || "ZeroScreen <noreply@zeroscreen.app>";
function send(to, subject, html) {
    return __awaiter(this, void 0, void 0, function () {
        var err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!transporter) {
                        console.log("[Mailer] SMTP not configured \u2014 skipping email to ".concat(to, ": ").concat(subject));
                        return [2 /*return*/];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, transporter.sendMail({ from: FROM, to: to, subject: subject, html: html })];
                case 2:
                    _a.sent();
                    console.log("[Mailer] Sent \"".concat(subject, "\" \u2192 ").concat(to));
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _a.sent();
                    console.error("[Mailer] Failed to send to ".concat(to, ":"), err_1.message);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// ── Email templates ────────────────────────────────────────────────────────────
function baseTemplate(content) {
    return "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<style>\n  body { margin:0; padding:0; background:#f0f4ff; font-family:'Segoe UI',Arial,sans-serif; color:#0a0e27; }\n  .wrap { max-width:560px; margin:32px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(37,99,235,0.12); }\n  .header { background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%); padding:28px 32px; }\n  .logo { font-size:22px; font-weight:800; color:#fff; letter-spacing:-0.8px; }\n  .logo span { color:#f59e0b; }\n  .body { padding:32px; }\n  h2 { font-size:20px; font-weight:700; margin:0 0 12px; color:#0a0e27; }\n  p { font-size:14px; line-height:1.7; color:#5b6490; margin:0 0 16px; }\n  .btn { display:inline-block; background:linear-gradient(135deg,#2563eb,#7c3aed); color:#fff; text-decoration:none; padding:12px 28px; border-radius:9px; font-weight:700; font-size:15px; }\n  .divider { border:none; border-top:1px solid #e8eeff; margin:24px 0; }\n  .footer { padding:20px 32px; background:#f4f7fe; font-size:12px; color:#8e97c0; text-align:center; }\n  .metric { display:inline-block; background:#f0f4ff; border:1px solid #dde3f5; border-radius:8px; padding:8px 16px; margin:4px; font-size:13px; font-weight:600; color:#2563eb; }\n</style>\n</head>\n<body>\n  <div class=\"wrap\">\n    <div class=\"header\"><div class=\"logo\">Zero<span>Screen</span></div></div>\n    <div class=\"body\">".concat(content, "</div>\n    <div class=\"footer\">\u00A9 2026 ZeroScreen \u00B7 India's sharpest NSE stock screener<br>You're receiving this because you signed up at ZeroScreen.</div>\n  </div>\n</body>\n</html>");
}
function sendWelcomeEmail(name, email) {
    return __awaiter(this, void 0, void 0, function () {
        var firstName, html;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    firstName = name.split(" ")[0];
                    html = baseTemplate("\n    <h2>Welcome to ZeroScreen, ".concat(firstName, "! \uD83C\uDF89</h2>\n    <p>Your account is ready. You now have access to India's most powerful NSE stock screener \u2014 completely free.</p>\n    <p>Here's what you can do:</p>\n    <p>\n      <span class=\"metric\">\uD83D\uDD0D Screen 5,000+ NSE stocks</span>\n      <span class=\"metric\">\uD83D\uDCCA Filter by ROCE, D/E, P/E</span>\n      <span class=\"metric\">\u2B50 Create watchlists</span>\n      <span class=\"metric\">\uD83D\uDCC8 Track profit trends</span>\n    </p>\n    <hr class=\"divider\">\n    <p>Jump in and find your next great investment:</p>\n    <a href=\"").concat(process.env.APP_URL || "http://localhost:4000", "\" class=\"btn\">Open ZeroScreen \u2192</a>\n    <hr class=\"divider\">\n    <p style=\"font-size:12px;color:#8e97c0;\">Happy investing!<br>\u2014 The ZeroScreen Team</p>\n  "));
                    return [4 /*yield*/, send(email, "Welcome to ZeroScreen, ".concat(firstName, "!"), html)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function sendContactNotification(senderName, senderEmail, subject, message) {
    return __awaiter(this, void 0, void 0, function () {
        var ownerEmail, html, autoReplyHtml;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ownerEmail = process.env.SMTP_USER || "";
                    if (!ownerEmail || ownerEmail === "your-email@gmail.com") {
                        console.log("[Mailer] Contact form: ".concat(senderName, " <").concat(senderEmail, "> \u2014 ").concat(subject));
                        return [2 /*return*/];
                    }
                    html = baseTemplate("\n    <h2>\uD83D\uDCEC New Contact Form Submission</h2>\n    <p><strong>From:</strong> ".concat(senderName, " &lt;").concat(senderEmail, "&gt;</p>\n    <p><strong>Subject:</strong> ").concat(subject, "</p>\n    <hr class=\"divider\">\n    <p style=\"white-space:pre-wrap;background:#f4f7fe;padding:16px;border-radius:8px;border:1px solid #dde3f5;font-size:14px;color:#0a0e27;\">").concat(message.replace(/</g, "&lt;").replace(/>/g, "&gt;"), "</p>\n    <hr class=\"divider\">\n    <a href=\"mailto:").concat(senderEmail, "?subject=Re: ").concat(encodeURIComponent(subject), "\" class=\"btn\">Reply to ").concat(senderName, " \u2192</a>\n  "));
                    // Email goes to the site owner
                    return [4 /*yield*/, send(ownerEmail, "[ZeroScreen Contact] ".concat(subject, " \u2014 ").concat(senderName), html)];
                case 1:
                    // Email goes to the site owner
                    _a.sent();
                    autoReplyHtml = baseTemplate("\n    <h2>We received your message! \uD83D\uDC4B</h2>\n    <p>Hi ".concat(senderName.split(" ")[0], ", thanks for reaching out to ZeroScreen.</p>\n    <p>We've received your message about <strong>\"").concat(subject, "\"</strong> and will get back to you within 24 hours.</p>\n    <hr class=\"divider\">\n    <p style=\"white-space:pre-wrap;background:#f4f7fe;padding:16px;border-radius:8px;border:1px solid #dde3f5;font-size:14px;color:#5b6490;\">").concat(message.replace(/</g, "&lt;").replace(/>/g, "&gt;"), "</p>\n    <hr class=\"divider\">\n    <p style=\"font-size:12px;color:#8e97c0;\">\u2014 The ZeroScreen Team</p>\n  "));
                    return [4 /*yield*/, send(senderEmail, "We got your message \u2014 ZeroScreen", autoReplyHtml)];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function sendAlertEmail(to, userName, alertName, stocks) {
    return __awaiter(this, void 0, void 0, function () {
        var firstName, topStocks, rows, html;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    firstName = userName.split(" ")[0];
                    topStocks = stocks.slice(0, 10);
                    rows = topStocks.map(function (s) {
                        var _a, _b;
                        return "\n    <tr>\n      <td style=\"padding:8px 12px;border-bottom:1px solid #e8eeff;font-weight:700;color:#2563eb\">".concat(s.symbol, "</td>\n      <td style=\"padding:8px 12px;border-bottom:1px solid #e8eeff;font-size:12px;color:#5b6490\">").concat((s.company_name || "—").substring(0, 30), "</td>\n      <td style=\"padding:8px 12px;border-bottom:1px solid #e8eeff\">\u20B9").concat(((_a = s.price) === null || _a === void 0 ? void 0 : _a.toFixed(2)) || "—", "</td>\n      <td style=\"padding:8px 12px;border-bottom:1px solid #e8eeff;font-weight:700;color:#16a34a\">").concat(((_b = s.roce) === null || _b === void 0 ? void 0 : _b.toFixed(1)) || "—", "%</td>\n      <td style=\"padding:8px 12px;border-bottom:1px solid #e8eeff;font-size:12px;color:").concat((s.change_pct || 0) >= 0 ? "#16a34a" : "#dc2626", "\">").concat(s.change_pct != null ? (s.change_pct >= 0 ? "+" : "") + s.change_pct.toFixed(2) + "%" : "—", "</td>\n    </tr>");
                    }).join("");
                    html = baseTemplate("\n    <h2>\uD83D\uDCCA Alert: ".concat(alertName, "</h2>\n    <p>Hi ").concat(firstName, "! Your alert found <strong>").concat(stocks.length, " stock").concat(stocks.length !== 1 ? "s" : "", "</strong> matching your criteria today.</p>\n    <table style=\"width:100%;border-collapse:collapse;margin:16px 0;font-size:13px\">\n      <thead>\n        <tr style=\"background:#f0f4ff\">\n          <th style=\"padding:8px 12px;text-align:left;font-size:10px;color:#8e97c0;text-transform:uppercase\">Symbol</th>\n          <th style=\"padding:8px 12px;text-align:left;font-size:10px;color:#8e97c0;text-transform:uppercase\">Company</th>\n          <th style=\"padding:8px 12px;text-align:left;font-size:10px;color:#8e97c0;text-transform:uppercase\">Price</th>\n          <th style=\"padding:8px 12px;text-align:left;font-size:10px;color:#8e97c0;text-transform:uppercase\">ROCE%</th>\n          <th style=\"padding:8px 12px;text-align:left;font-size:10px;color:#8e97c0;text-transform:uppercase\">Change</th>\n        </tr>\n      </thead>\n      <tbody>").concat(rows, "</tbody>\n    </table>\n    ").concat(stocks.length > 10 ? "<p style=\"font-size:12px;color:#8e97c0\">...and ".concat(stocks.length - 10, " more stocks.</p>") : "", "\n    <a href=\"").concat(process.env.APP_URL || "http://localhost:4000", "\" class=\"btn\">View All on ZeroScreen \u2192</a>\n  "));
                    return [4 /*yield*/, send(to, "ZeroScreen Alert: \"".concat(alertName, "\" \u2014 ").concat(stocks.length, " stock").concat(stocks.length !== 1 ? "s" : "", " found today"), html)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function sendPasswordResetEmail(to, name, resetUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var firstName, html;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    firstName = name.split(" ")[0];
                    html = baseTemplate("\n    <h2>Reset your password \uD83D\uDD10</h2>\n    <p>Hi ".concat(firstName, ", we received a request to reset your ZeroScreen password.</p>\n    <p>Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>\n    <a href=\"").concat(resetUrl, "\" class=\"btn\">Reset Password \u2192</a>\n    <hr class=\"divider\">\n    <p style=\"font-size:12px;color:#8e97c0\">If you didn't request this, you can safely ignore this email. Your password won't change.</p>\n  "));
                    return [4 /*yield*/, send(to, "Reset your ZeroScreen password", html)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
