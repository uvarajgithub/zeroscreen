"use strict";
/**
 * server.ts — ZeroScreen Express app
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var dotenv_1 = require("dotenv");
dotenv_1.default.config();
var express_1 = require("express");
var express_session_1 = require("express-session");
var path_1 = require("path");
var bcrypt_1 = require("bcrypt");
var db_1 = require("./db");
var scheduler_1 = require("./scheduler");
var scraper_1 = require("./scraper");
var mailer_1 = require("./mailer");
var crypto_1 = require("crypto");
var https_1 = require("https");
var fs_1 = require("fs");
// ── Telegram notify helper ─────────────────────────────────────────────────────
var TG_BOT = process.env.TELEGRAM_BOT_TOKEN || "";
var TG_CHAT = process.env.TELEGRAM_CHAT_ID || "";
function notifyTelegram(text) {
    if (!TG_BOT || !TG_CHAT)
        return;
    var encoded = encodeURIComponent(text);
    var url = "https://api.telegram.org/bot".concat(TG_BOT, "/sendMessage?chat_id=").concat(TG_CHAT, "&text=").concat(encoded);
    https_1.default.get(url, function (r) { r.resume(); }).on("error", function () { });
}
var app = (0, express_1.default)();
var PORT = parseInt(process.env.PORT || "4000", 10);
var SESSION_SECRET = process.env.SESSION_SECRET || "zeroscreen-dev-secret-change-in-prod";
// ── Google OAuth config ────────────────────────────────────────────────────────
var GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
var GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
var GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "http://139-59-18-52.nip.io:4000/auth/google/callback";
var STRATEGIES = [
    { id: "quality", icon: "🏆", label: "Quality Blue Chips",
        desc: "High ROCE, low debt, strong promoter holding",
        params: { minRoce: "20", maxDe: "0.5", minPromoter: "50", allProfit: "1", sortBy: "roce" } },
    { id: "debtfree", icon: "💎", label: "Debt-Free Champions",
        desc: "Zero-debt companies with consistent profits",
        params: { maxDe: "0", minRoce: "15", allProfit: "1", sortBy: "roce" } },
    { id: "growth", icon: "🚀", label: "Growth Compounders",
        desc: "Rising profits every year, strong ROCE",
        params: { uptrend: "1", allProfit: "1", minRoce: "15", sortBy: "roce" } },
    { id: "value", icon: "💰", label: "Value Picks",
        desc: "Undervalued stocks with decent fundamentals",
        params: { maxPe: "15", minRoce: "10", maxDe: "1", sortBy: "pe" } },
    { id: "highroce", icon: "⚡", label: "High ROCE Machines",
        desc: "Capital allocation champions — ROCE above 30%",
        params: { minRoce: "30", allProfit: "1", sortBy: "roce" } },
    { id: "dividend", icon: "💵", label: "Dividend Earners",
        desc: "Consistent dividend-paying stocks",
        params: { minDivYield: "1.5", minRoce: "10", allProfit: "1", sortBy: "dividend" } },
    { id: "promoter", icon: "👑", label: "Promoter Backed",
        desc: "High insider ownership — skin in the game",
        params: { minPromoter: "65", minRoce: "15", sortBy: "promoter" } },
    { id: "smallcap", icon: "🌱", label: "Small Cap Gems",
        desc: "High-quality small caps under ₹5,000 Cr",
        params: { maxPrice: "300", minRoce: "20", allProfit: "1", sortBy: "roce" } },
    // ── Trading-style presets ─────────────────────────────────────────────────
    { id: "penny", icon: "🪙", label: "Penny Stocks",
        desc: "Low-price stocks under ₹50 with decent volume — high risk, high reward",
        params: { maxPrice: "50", minVolume: "100000", sortBy: "volume" } },
    { id: "highvalue", icon: "🏛️", label: "High Value Blue Chips",
        desc: "Premium-priced quality stocks above ₹500 with strong fundamentals",
        params: { minPrice: "500", minRoce: "15", allProfit: "1", sortBy: "price" } },
    { id: "longterm", icon: "📅", label: "Long Term Compounders",
        desc: "Consistent profits, low debt, high ROCE — hold for 3-5 years",
        params: { minRoce: "18", maxDe: "0.5", minPromoter: "50", allProfit: "1", uptrend: "1", sortBy: "roce" } },
    { id: "shortterm", icon: "⚡", label: "Short Term Momentum",
        desc: "High volume gainers with upward profit trend — 1 to 4 weeks",
        params: { minVolume: "500000", uptrend: "1", minRoce: "10", sortBy: "volume" } },
    { id: "swing", icon: "🎯", label: "Swing Trading Picks",
        desc: "Positive day momentum + high volume + strong fundamentals — 3 to 10 day moves",
        params: { minChangePct: "0.3", uptrend: "1", minVolume: "200000", minRoce: "10", sortBy: "change_pct" } },
    { id: "options", icon: "📊", label: "Options-Ready Stocks",
        desc: "Highly liquid NSE stocks suitable for F&O — high volume, good fundamentals",
        params: { minVolume: "500000", minRoce: "10", sortBy: "volume" } },
    { id: "highroe", icon: "💯", label: "High ROE Stars",
        desc: "Top return on equity above 25% — efficient businesses",
        params: { minRoe: "25", allProfit: "1", sortBy: "roe" } },
    { id: "innews", icon: "📰", label: "In News Today",
        desc: "Stocks mentioned in today's market news headlines",
        params: { inNews: "1", sortBy: "volume" } },
];
function strategyParams(s) {
    return new URLSearchParams(s.params).toString();
}
var _newsCache = [];
var _newsCacheAt = 0;
var NEWS_TTL = 5 * 60 * 1000; // 5 min
function fetchMarketNews() {
    return __awaiter(this, void 0, void 0, function () {
        var feeds, UA, results, fetchXml, _i, feeds_1, feed, xml, items, _a, _b, item, title, link, pubDate, _1;
        var _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    if (Date.now() - _newsCacheAt < NEWS_TTL && _newsCache.length)
                        return [2 /*return*/, _newsCache];
                    feeds = [
                        { url: "https://www.livemint.com/rss/markets", source: "Mint" },
                        { url: "https://feeds.feedburner.com/ndtvprofit-latest", source: "NDTV Profit" },
                    ];
                    UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
                    results = [];
                    fetchXml = function (url) { return new Promise(function (resolve, reject) {
                        var req = https_1.default.get(url, { timeout: 8000, headers: { "User-Agent": UA } }, function (res) {
                            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                                https_1.default.get(res.headers.location, { timeout: 8000, headers: { "User-Agent": UA } }, function (res2) {
                                    var d = "";
                                    res2.on("data", function (c) { return d += c; });
                                    res2.on("end", function () { return resolve(d); });
                                }).on("error", reject);
                                return;
                            }
                            var d = "";
                            res.on("data", function (c) { return d += c; });
                            res.on("end", function () { return resolve(d); });
                        });
                        req.on("error", reject);
                        req.on("timeout", function () { req.destroy(); reject(new Error("timeout")); });
                    }); };
                    _i = 0, feeds_1 = feeds;
                    _f.label = 1;
                case 1:
                    if (!(_i < feeds_1.length)) return [3 /*break*/, 6];
                    feed = feeds_1[_i];
                    _f.label = 2;
                case 2:
                    _f.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, fetchXml(feed.url)];
                case 3:
                    xml = _f.sent();
                    items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
                    for (_a = 0, _b = items.slice(0, 10); _a < _b.length; _a++) {
                        item = _b[_a];
                        title = ((_c = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                            item.match(/<title>(.*?)<\/title>/) || [])[1]) === null || _c === void 0 ? void 0 : _c.trim()) || "";
                        link = ((_d = (item.match(/<link>(.*?)<\/link>/) ||
                            item.match(/<guid[^>]*>(.*?)<\/guid>/) ||
                            item.match(/<link\s[^>]*href="([^"]+)"/) || [])[1]) === null || _d === void 0 ? void 0 : _d.trim()) || "";
                        pubDate = ((_e = (item.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1]) === null || _e === void 0 ? void 0 : _e.trim()) || "";
                        if (title && title.length > 10 && link)
                            results.push({ title: title, link: link, pubDate: pubDate, source: feed.source });
                    }
                    return [3 /*break*/, 5];
                case 4:
                    _1 = _f.sent();
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6:
                    if (results.length) {
                        _newsCache = results.slice(0, 15);
                        _newsCacheAt = Date.now();
                    }
                    return [2 /*return*/, _newsCache];
            }
        });
    });
}
// ── Session ────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
var SQLiteStore = require("connect-sqlite3")(express_session_1.default);
app.use((0, express_session_1.default)({
    store: new SQLiteStore({ db: "sessions.db", dir: path_1.default.join(__dirname, "..") }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 },
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use("/public", express_1.default.static(path_1.default.join(__dirname, "..", "public")));
// Bypass ngrok browser warning for all responses
app.use(function (_req, res, next) {
    res.setHeader("ngrok-skip-browser-warning", "true");
    next();
});
// ── Analytics middleware ───────────────────────────────────────────────────────
app.use(function (req, _res, next) {
    var _a;
    if (req.method === "GET" &&
        !req.path.startsWith("/api/") &&
        !req.path.startsWith("/public/") &&
        !req.path.startsWith("/auth/")) {
        var ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
        var ipHash = crypto_1.default.createHash("sha256").update(ip + "zs2026").digest("hex").slice(0, 16);
        var ua = (req.headers["user-agent"] || "").slice(0, 150);
        var ref = (req.headers["referer"] || "").slice(0, 200);
        (0, db_1.dbRun)("INSERT INTO page_views (path, ip_hash, user_agent, referrer, is_logged_in, created_at)\n       VALUES (?,?,?,?,?,datetime('now','localtime'))", [req.path, ipHash, ua, ref, ((_a = req.session) === null || _a === void 0 ? void 0 : _a.userId) ? 1 : 0]).catch(function () { });
    }
    next();
});
// ── Security helpers ───────────────────────────────────────────────────────────
/** HTML-escape user-controlled strings before rendering into HTML to prevent XSS */
function esc(str) {
    if (!str)
        return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;");
}
/** Simple in-memory rate limiter — max attempts per window per IP */
var _rateLimits = new Map();
function checkRateLimit(key, maxAttempts, windowMs) {
    var now = Date.now();
    var entry = _rateLimits.get(key);
    if (!entry || now > entry.resetAt) {
        _rateLimits.set(key, { count: 1, resetAt: now + windowMs });
        return true; // allowed
    }
    entry.count++;
    if (entry.count > maxAttempts)
        return false; // blocked
    return true;
}
// Clean up stale entries every 10 minutes
setInterval(function () {
    var now = Date.now();
    for (var _i = 0, _rateLimits_1 = _rateLimits; _i < _rateLimits_1.length; _i++) {
        var _a = _rateLimits_1[_i], k = _a[0], v = _a[1];
        if (now > v.resetAt)
            _rateLimits.delete(k);
    }
}, 10 * 60 * 1000);
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        res.redirect("/login?next=" + encodeURIComponent(req.path));
        return;
    }
    next();
}
function requireAdmin(req, res, next) {
    if (!req.session.userId) {
        res.redirect("/login?next=" + encodeURIComponent(req.path));
        return;
    }
    if (req.session.userRole !== "admin") {
        res.status(403).send("<!DOCTYPE html><html><head><title>Access Denied</title><link rel=\"stylesheet\" href=\"/public/css/style.css\"></head><body>".concat(nav("", req), "<div class=\"container\"><div class=\"admin-denied\"><h2>\uD83D\uDD12 Admin Only</h2><p>You don't have permission to view this page.</p><a href=\"/\" class=\"btn-primary\">Back to Screener</a></div></div></body></html>"));
        return;
    }
    next();
}
/** Middleware: blocks access when app_setting[key] === 'false' */
function featureGate(settingKey, featureName) {
    var _this = this;
    return function (req, res, next) { return __awaiter(_this, void 0, void 0, function () {
        var enabled;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getSetting)(settingKey)];
                case 1:
                    enabled = (_a.sent()) !== "false";
                    if (!enabled) {
                        res.status(404).send("<!DOCTYPE html>\n<html lang=\"en\"><head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>".concat(featureName, " Unavailable \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head><body>\n  ").concat(nav("", req), "\n  <div class=\"container\" style=\"text-align:center;padding:80px 20px\">\n    <div style=\"font-size:3rem;margin-bottom:16px\">\uD83D\uDEAB</div>\n    <h2 style=\"margin-bottom:8px\">").concat(featureName, " is Unavailable</h2>\n    <p style=\"color:var(--text-dim);margin-bottom:24px\">This feature is currently disabled by the administrator.</p>\n    <a href=\"/\" class=\"btn-primary\">\u2190 Back to Screener</a>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n</body></html>"));
                        return [2 /*return*/];
                    }
                    next();
                    return [2 /*return*/];
            }
        });
    }); };
}
/** Middleware: redirects to upgrade page when app_setting[key] === 'true' and user is not premium */
function premiumGate(settingKey, featureName) {
    var _this = this;
    return function (req, res, next) { return __awaiter(_this, void 0, void 0, function () {
        var premiumOnly;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getSetting)(settingKey)];
                case 1:
                    premiumOnly = (_a.sent()) === "true";
                    if (premiumOnly && !userIsPremium(req)) {
                        res.redirect("/my-paper-trade/upgrade?err=" + encodeURIComponent("".concat(featureName, " requires a Premium subscription.")));
                        return [2 /*return*/];
                    }
                    next();
                    return [2 /*return*/];
            }
        });
    }); };
}
function userIsPremium(req) {
    var _a;
    var role = (_a = req.session) === null || _a === void 0 ? void 0 : _a.userRole;
    return role === "premium" || role === "admin";
}
/** Returns true if current IST time is within NSE market hours (Mon–Fri 9:15–15:30) */
function isMarketHours() {
    var ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    var day = ist.getUTCDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6)
        return false;
    var mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    return mins >= 555 && mins <= 930; // 9:15=555, 15:30=930
}
/** Send OTP via Fast2SMS. Falls back to console log when FAST2SMS_API_KEY is unset. */
function sendSmsOtp(mobile, otp) {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, message, url, resp, data, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    apiKey = process.env.FAST2SMS_API_KEY;
                    if (!apiKey) {
                        console.log("[OTP-DEV] Mobile: ".concat(mobile, " | OTP: ").concat(otp));
                        return [2 /*return*/, true];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    message = "Your ZeroScreen OTP is ".concat(otp, ". Valid for 10 minutes. Do not share.");
                    url = "https://www.fast2sms.com/dev/bulkV2?authorization=".concat(encodeURIComponent(apiKey), "&message=").concat(encodeURIComponent(message), "&language=english&route=q&numbers=").concat(mobile);
                    return [4 /*yield*/, fetch(url, { signal: AbortSignal.timeout(10000), headers: { "cache-control": "no-cache" } })];
                case 2:
                    resp = _a.sent();
                    return [4 /*yield*/, resp.json()];
                case 3:
                    data = _a.sent();
                    if (!data.return)
                        console.error("[OTP-SMS] Fast2SMS error:", JSON.stringify(data));
                    return [2 /*return*/, data.return === true];
                case 4:
                    e_1 = _a.sent();
                    console.error("[OTP-SMS] Exception:", e_1);
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// ── Razorpay ──────────────────────────────────────────────────────────────────
var RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
var RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
var PREMIUM_PRICE_PAISE = 49900; // ₹499
// ── Template helper ────────────────────────────────────────────────────────────
function fmt(n, decimals) {
    if (decimals === void 0) { decimals = 2; }
    if (n == null)
        return "—";
    return n.toFixed(decimals);
}
function fmtCr(n) {
    if (n == null)
        return "—";
    if (Math.abs(n) >= 1e5)
        return (n / 1e5).toFixed(1) + " Lcr";
    if (Math.abs(n) >= 1e3)
        return (n / 1e3).toFixed(1) + "k Cr";
    return n.toFixed(0) + " Cr";
}
function fmtVol(v) {
    if (v == null)
        return "—";
    if (v >= 1e7)
        return (v / 1e7).toFixed(1) + "Cr";
    if (v >= 1e5)
        return (v / 1e5).toFixed(1) + "L";
    if (v >= 1e3)
        return (v / 1e3).toFixed(1) + "K";
    return String(v);
}
function roceColor(r) {
    if (r == null)
        return "#888";
    if (r >= 25)
        return "#2ecc71";
    if (r >= 15)
        return "#82e0aa";
    if (r >= 8)
        return "#f39c12";
    return "#e74c3c";
}
function deColor(d) {
    if (d == null)
        return "#888";
    if (d === 0)
        return "#2ecc71";
    if (d <= 0.3)
        return "#82e0aa";
    if (d <= 1.0)
        return "#f39c12";
    return "#e74c3c";
}
function changeColor(c) {
    if (c == null)
        return "#888";
    return c >= 0 ? "#2ecc71" : "#e74c3c";
}
// ── Nav HTML ──────────────────────────────────────────────────────────────────
function nav(active, req) {
    var _a, _b, _c;
    var isLoggedIn = !!((_a = req === null || req === void 0 ? void 0 : req.session) === null || _a === void 0 ? void 0 : _a.userId);
    var userName = ((_b = req === null || req === void 0 ? void 0 : req.session) === null || _b === void 0 ? void 0 : _b.userName) || "";
    var userRole = ((_c = req === null || req === void 0 ? void 0 : req.session) === null || _c === void 0 ? void 0 : _c.userRole) || "guest";
    var isAdmin = userRole === "admin";
    var isPremium = userRole === "premium" || isAdmin;
    // ── Tier-based dropdowns ───────────────────────────────────────────────────
    // 🟢 BEGINNERS — learn by watching, no real money
    var beginnerLinks = [
        ["paper-trade", "/paper-trade", "📋 Paper Trade"],
        ["strategies", "/strategies", "🎓 How Strategies Work"],
        ["about", "/about", "ℹ️ About ZeroScreen"],
    ];
    // 🟡 TRADERS (mid-level) — curated ideas + tools
    var traderLinks = [
        ["today", "/today", "🔥 Today's Picks"],
        ["signals", "/signals", "📡 Live Bot Signals"],
        ["dashboard", "/dashboard", "📊 Bot Performance"],
        ["strategy-builder", "/strategy-builder", "🔨 Strategy Builder"],
    ];
    // 🔴 INVESTORS (advanced) — do your own research
    var investorLinks = __spreadArray([
        ["home", "/", "🔍 Stock Screener"],
        ["compare", "/compare", "⚖️ Compare Stocks"]
    ], (isLoggedIn
        ? [["watchlists", "/watchlists", "⭐ Watchlists"],
            ["alerts", "/alerts", "🔔 Alerts"]]
        : []), true);
    // Admin dropdown — admin only
    var adminLinks = isAdmin ? [
        ["admin", "/admin", "🧠 Overview"],
        ["admin-picks", "/admin/picks", "🛠 Picks Manager"],
        ["admin-users", "/admin/users", "👥 Users"],
        ["admin-analytics", "/admin/analytics", "📊 Analytics"],
        ["admin-content", "/admin/content", "📢 Content"],
        ["admin-signals", "/admin/signals", "🤖 Signal Control"],
        ["admin-subs", "/admin/subs", "💳 Subscriptions"],
    ] : [];
    var allTiered = __spreadArray(__spreadArray(__spreadArray([], beginnerLinks, true), traderLinks, true), investorLinks, true);
    var beginnerActive = beginnerLinks.some(function (_a) {
        var k = _a[0];
        return k === active;
    });
    var traderActive = traderLinks.some(function (_a) {
        var k = _a[0];
        return k === active;
    });
    var investorActive = investorLinks.some(function (_a) {
        var k = _a[0];
        return k === active;
    });
    var adminActive = adminLinks.some(function (_a) {
        var k = _a[0];
        return k === active;
    });
    function dropMenu(id, btnLabel, isActive, sections) {
        return "<div class=\"nav-more\" id=\"nav-drop-".concat(id, "\">\n      <button class=\"nav-more-btn").concat(isActive ? " active" : "", "\" id=\"nav-drop-btn-").concat(id, "\" aria-haspopup=\"true\" aria-expanded=\"false\">\n        ").concat(btnLabel, " <span class=\"nav-more-chevron\">\u25BE</span>\n      </button>\n      <div class=\"nav-more-drop nav-tier-drop\" id=\"nav-drop-menu-").concat(id, "\" role=\"menu\">\n        ").concat(sections.map(function (sec) { return "\n          <div class=\"nav-tier-section\">\n            <div class=\"nav-tier-label\" style=\"border-left:3px solid ".concat(sec.color, "\">").concat(sec.label, "</div>\n            ").concat(sec.links.map(function (_a) {
            var key = _a[0], href = _a[1], label = _a[2];
            return "<a href=\"".concat(href, "\" class=\"").concat(active === key ? "active" : "", "\" role=\"menuitem\">").concat(label, "</a>");
        }).join(""), "\n          </div>"); }).join(""), "\n      </div>\n    </div>");
    }
    var exploreDropHtml = dropMenu("explore", "🧭 Explore", beginnerActive || traderActive || investorActive, [
        { label: "🟢 Beginners — Learn First", color: "#10b981", links: beginnerLinks },
        { label: "🟡 Traders — Ideas & Tools", color: "#f59e0b", links: traderLinks },
        { label: "🔴 Investors — Research", color: "#ef4444", links: investorLinks },
    ]);
    var adminDropHtml = isAdmin
        ? "<div class=\"nav-more\" id=\"nav-drop-admin\">\n        <button class=\"nav-more-btn".concat(adminActive ? " active" : "", "\" id=\"nav-drop-btn-admin\" aria-haspopup=\"true\" aria-expanded=\"false\">\n          \uD83D\uDEE1\uFE0F Admin <span class=\"nav-more-chevron\">\u25BE</span>\n        </button>\n        <div class=\"nav-more-drop nav-more-drop-right\" id=\"nav-drop-menu-admin\" role=\"menu\">\n          ").concat(adminLinks.map(function (_a) {
            var key = _a[0], href = _a[1], label = _a[2];
            return "<a href=\"".concat(href, "\" class=\"").concat(active === key ? "active" : "", "\" role=\"menuitem\">").concat(label, "</a>");
        }).join(""), "\n        </div>\n      </div>")
        : "";
    var authLinks = isLoggedIn
        ? "<div class=\"nav-user nav-user-menu\" id=\"nav-user-menu\">\n         ".concat(isPremium && !isAdmin ? "<span class=\"nav-premium-badge\" title=\"Premium member\">\uD83D\uDC8E</span>" : "", "\n         <button class=\"nav-avatar\" id=\"nav-user-btn\" aria-haspopup=\"true\" aria-expanded=\"false\" title=\"").concat(userName, "\">").concat(userName.charAt(0).toUpperCase(), "</button>\n         <div class=\"nav-user-drop\" id=\"nav-user-drop\" role=\"menu\">\n           <div class=\"nav-user-drop-name\">").concat(userName.split(" ")[0]).concat(isPremium && !isAdmin ? " <span class=\"nav-udrop-badge\">\uD83D\uDC8E Premium</span>" : isAdmin ? " <span class=\"nav-udrop-badge nav-udrop-admin\">\uD83D\uDEE1\uFE0F Admin</span>" : "", "</div>\n           <a href=\"/profile\" class=\"nav-user-drop-link\" role=\"menuitem\">\uD83D\uDC64 My Profile</a>\n           <a href=\"/logout\" class=\"nav-user-drop-logout\" role=\"menuitem\">\u21A9 Sign Out</a>\n         </div>\n       </div>")
        : "<div class=\"nav-auth\">\n         <a href=\"/premium\" class=\"btn-nav-premium".concat(active === "premium" ? " active" : "", "\">\u26A1 Premium</a>\n         <a href=\"/login\" class=\"btn-nav-login\">Sign In</a>\n       </div>");
    var mobileMobFooter = isLoggedIn
        ? "<div class=\"nav-mobile-footer\">\n         <div class=\"nav-mob-identity\">\n           <span class=\"nav-mob-avatar\">".concat(userName.charAt(0).toUpperCase(), "</span>\n           <div class=\"nav-mob-identity-info\">\n             <span class=\"nav-mob-name\">").concat(userName.split(" ")[0], "</span>\n             ").concat(isPremium && !isAdmin ? "<span class=\"nav-mob-badge nav-mob-premium\">\uD83D\uDC8E Premium</span>" : "", "\n             ").concat(isAdmin ? "<span class=\"nav-mob-badge nav-mob-admin-badge\">\uD83D\uDEE1\uFE0F Admin</span>" : "", "\n           </div>\n         </div>\n         <a href=\"/profile\" class=\"nav-mob-link\">\uD83D\uDC64 My Profile</a>\n         ").concat(isAdmin ? "<a href=\"/admin\" class=\"nav-mob-link\">\uD83D\uDEE1\uFE0F Admin Panel</a>" : "", "\n         <a href=\"/logout\" class=\"nav-mob-logout\">\u21A9 Sign Out</a>\n       </div>")
        : "<div class=\"nav-mobile-footer\">\n         <a href=\"/login\" class=\"nav-mob-link\">\uD83D\uDD10 Sign In</a>\n         <a href=\"/signup\" class=\"nav-mob-signup\">\u26A1 Create Free Account</a>\n       </div>";
    return "<nav class=\"topnav\">\n    <a href=\"/\" class=\"brand\"><img src=\"/public/images/logo.svg\" class=\"brand-logo\" alt=\"ZeroScreen\"><span class=\"brand-wordmark\">Zero<em>Screen</em></span></a>\n    <div class=\"nav-links\" id=\"nav-links\">\n      <a href=\"/\" class=\"".concat(active === "home" ? "active" : "", "\">\uD83D\uDD0D Screener</a>\n      <a href=\"/today\" class=\"").concat(active === "today" ? "active" : "", "\">\uD83D\uDD25 Picks</a>\n      <a href=\"/signals\" class=\"nav-signals-link").concat(active === "signals" ? " active" : "", "\"><span class=\"nav-live-dot\"></span>\uD83E\uDD16 Live Bot</a>\n      <a href=\"/paper-trade\" class=\"").concat(active === "paper-trade" ? "active" : "", "\">\uD83D\uDCCB Paper Trade</a>\n      ").concat(isLoggedIn ? "<a href=\"/my-paper-trade\" class=\"nav-hot-link".concat(active === "my-paper-trade" ? " active" : "", "\">\uD83D\uDCBC My Trade <span class=\"nav-hot-badge\">HOT</span></a>") : "", "\n      ").concat(exploreDropHtml, "\n      ").concat(mobileMobFooter, "\n    </div>\n    <div class=\"nav-right\" id=\"nav-right\">\n      <div class=\"nav-search\" id=\"nav-search-wrap\">\n        <input type=\"text\" id=\"nav-search\" class=\"nav-search-input\" placeholder=\"Search stocks\u2026\" autocomplete=\"off\" aria-label=\"Search stocks\">\n        <div class=\"nav-search-results\" id=\"nav-search-results\"></div>\n      </div>\n      ").concat(adminDropHtml, "\n      <button class=\"btn-dark-toggle\" id=\"dark-toggle\" title=\"Toggle dark mode\" aria-label=\"Toggle dark mode\" onclick=\"toggleDarkMode()\">\uD83C\uDF19</button>\n      ").concat(authLinks, "\n    </div>\n    <button class=\"hamburger\" id=\"hamburger\" aria-label=\"Toggle menu\" aria-expanded=\"false\">\n      <span></span><span></span><span></span>\n    </button>\n  </nav>\n  <div class=\"ticker-wrap\" id=\"ticker-wrap\" aria-label=\"Market news ticker\">\n    <span class=\"ticker-label\">\uD83D\uDCF0 MARKET</span>\n    <div class=\"ticker-viewport\">\n      <div class=\"ticker-track\" id=\"ticker-track\">Loading news\u2026</div>\n    </div>\n  </div>\n  <div class=\"chat-widget\" id=\"chat-widget\">\n    <button class=\"chat-bubble\" id=\"chat-bubble-btn\" aria-label=\"Ask a question\">\n      <span class=\"chat-bubble-icon\">\uD83D\uDCAC</span>\n      <span>Help</span>\n    </button>\n    <div class=\"chat-window\" id=\"chat-window\" style=\"display:none\" role=\"dialog\" aria-label=\"Help chat\">\n      <div class=\"chat-header\">\n        <div class=\"chat-header-left\">\n          <div class=\"chat-header-avatar\">\uD83E\uDD16</div>\n          <span>ZeroScreen Help</span>\n        </div>\n        <button class=\"chat-close\" id=\"chat-close\" aria-label=\"Close chat\">\u2715</button>\n      </div>\n      <div class=\"chat-messages\" id=\"chat-messages\">\n        <div class=\"chat-msg bot\">\uD83D\uDC4B Hi! Ask me anything about ZeroScreen \u2014 screener, paper trade, how things work, and more.<div class=\"chat-chips\">\n          <span class=\"chat-chip\" data-q=\"paper trade\">\uD83D\uDCCB Paper Trade</span>\n          <span class=\"chat-chip\" data-q=\"screener\">\uD83D\uDD0D Screener</span>\n          <span class=\"chat-chip\" data-q=\"free\">\uD83D\uDCB0 Is it free?</span>\n          <span class=\"chat-chip\" data-q=\"get started\">\uD83D\uDE80 Get started</span>\n        </div></div>\n      </div>\n      <div class=\"chat-input-row\">\n        <input type=\"text\" class=\"chat-input\" id=\"chat-input\" placeholder=\"Ask a question\u2026\" autocomplete=\"off\" maxlength=\"200\">\n        <button class=\"chat-send\" id=\"chat-send\" aria-label=\"Send\">\u2192</button>\n      </div>\n    </div>\n  </div>");
}
// ── Auth pages ─────────────────────────────────────────────────────────────────
function authLayout(title, content) {
    return "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>".concat(title, " \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body class=\"auth-body\">\n  <div class=\"auth-wrapper\">\n    <div class=\"auth-brand\">\n      <a href=\"/\" class=\"auth-logo\"><img src=\"/public/images/logo.svg\" class=\"auth-logo-img\" alt=\"ZeroScreen\"><span class=\"auth-logo-text\">Zero<em>Screen</em></span></a>\n      <p class=\"auth-tagline\">India's sharpest NSE stock screener</p>\n    </div>\n    <div class=\"auth-card\">\n      ").concat(content, "\n    </div>\n    <p class=\"auth-footer\">\u00A9 2026 ZeroScreen \u00B7 <a href=\"/\">Back to app</a></p>\n  </div>\n</body>\n</html>");
}
// GET /signup
app.get("/signup", featureGate("registration_open", "New Registrations"), function (req, res) {
    if (req.session.userId) {
        res.redirect("/");
        return;
    }
    var error = req.query.error;
    var googleBtn = GOOGLE_CLIENT_ID
        ? "<a href=\"/auth/google\" class=\"btn-google\">\n         <svg width=\"18\" height=\"18\" viewBox=\"0 0 18 18\" xmlns=\"http://www.w3.org/2000/svg\" style=\"flex-shrink:0\">\n           <path fill=\"#4285F4\" d=\"M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z\"/>\n           <path fill=\"#34A853\" d=\"M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z\"/>\n           <path fill=\"#FBBC05\" d=\"M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z\"/>\n           <path fill=\"#EA4335\" d=\"M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z\"/>\n         </svg>\n         Sign up with Google\n       </a>\n       <div class=\"auth-divider\"><span>or create with email</span></div>"
        : "";
    res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Create Account \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n  <style>\n    /* \u2500\u2500 Tier Score Dots \u2500\u2500 */\n    .tier-scores { display:flex; flex-direction:column; gap:10px; margin:24px 0; }\n    .tier-row {\n      display:flex; align-items:stretch; gap:0;\n      border-radius:14px; overflow:hidden;\n      border:1px solid rgba(255,255,255,0.08);\n    }\n    .tier-dot-col {\n      width:54px; flex-shrink:0; display:flex; flex-direction:column;\n      align-items:center; justify-content:center; gap:4px; padding:14px 0;\n    }\n    .tier-dot {\n      width:14px; height:14px; border-radius:50%;\n      box-shadow:0 0 10px currentColor;\n    }\n    .tier-dot.green  { background:#10b981; color:#10b981; }\n    .tier-dot.yellow { background:#f59e0b; color:#f59e0b; }\n    .tier-dot.red    { background:#ef4444; color:#ef4444; }\n    .tier-row-green  { background:linear-gradient(90deg,rgba(16,185,129,0.14) 0%,rgba(16,185,129,0.04) 100%); }\n    .tier-row-yellow { background:linear-gradient(90deg,rgba(245,158,11,0.14) 0%,rgba(245,158,11,0.04) 100%); }\n    .tier-row-red    { background:linear-gradient(90deg,rgba(239,68,68,0.14) 0%,rgba(239,68,68,0.04) 100%); }\n    .tier-content { flex:1; padding:12px 14px 12px 4px; }\n    .tier-label {\n      font-size:10px; font-weight:800; letter-spacing:1px; text-transform:uppercase; margin-bottom:5px;\n    }\n    .tier-label.green  { color:#34d399; }\n    .tier-label.yellow { color:#fbbf24; }\n    .tier-label.red    { color:#f87171; }\n    .tier-title { font-size:13.5px; font-weight:700; color:#f1f5f9; margin-bottom:5px; }\n    .tier-features { display:flex; flex-wrap:wrap; gap:5px; }\n    .tier-tag {\n      font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px; white-space:nowrap;\n    }\n    .tier-tag.green  { background:rgba(16,185,129,0.2); color:#6ee7b7; border:1px solid rgba(16,185,129,0.3); }\n    .tier-tag.yellow { background:rgba(245,158,11,0.2);  color:#fde68a; border:1px solid rgba(245,158,11,0.3); }\n    .tier-tag.red    { background:rgba(239,68,68,0.2);   color:#fca5a5; border:1px solid rgba(239,68,68,0.3); }\n\n    /* \u2500\u2500 Feature Preview Cards \u2500\u2500 */\n    .signup-feat-cards { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:20px; }\n    .sfc {\n      border-radius:14px; padding:16px; position:relative; overflow:hidden;\n      display:flex; flex-direction:column; gap:0;\n    }\n    .sfc-paper   { background:linear-gradient(145deg,#022c22,#064e3b); border:1px solid rgba(16,185,129,0.4); }\n    .sfc-signals { background:linear-gradient(145deg,#1e1b4b,#312e81); border:1px solid rgba(99,102,241,0.45); }\n    .sfc-screen  { background:linear-gradient(145deg,#0f1535,#1e3a5f); border:1px solid rgba(59,130,246,0.4); }\n    .sfc-backtest{ background:linear-gradient(145deg,#1a0f2e,#3b0764); border:1px solid rgba(139,92,246,0.4); }\n    .sfc-badge {\n      display:inline-flex; align-items:center; gap:4px;\n      font-size:9.5px; font-weight:800; padding:3px 8px; border-radius:20px;\n      margin-bottom:10px; letter-spacing:0.6px; width:fit-content;\n    }\n    .sfc-badge.hot     { background:linear-gradient(135deg,#ef4444,#f97316); color:#fff; }\n    .sfc-badge.live    { background:#ef4444; color:#fff; animation:livePulse 1.5s ease-in-out infinite; }\n    .sfc-badge.free    { background:linear-gradient(135deg,#10b981,#059669); color:#fff; }\n    .sfc-badge.backtest{ background:linear-gradient(135deg,#8b5cf6,#7c3aed); color:#fff; }\n    @keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:0.6} }\n    .sfc-icon { font-size:2.6rem; margin-bottom:8px; line-height:1; }\n    .sfc-title { font-size:13px; font-weight:800; color:#fff; margin-bottom:5px; letter-spacing:-0.2px; }\n    .sfc-desc  { font-size:11.5px; color:rgba(255,255,255,0.65); line-height:1.5; }\n    /* mock P&L mini chart */\n    .sfc-pnl-preview {\n      margin-top:10px; padding:8px 10px; border-radius:8px;\n      background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.08);\n      display:flex; align-items:center; gap:8px;\n    }\n    .sfc-pnl-num { font-size:15px; font-weight:900; }\n    .sfc-pnl-num.green { color:#4ade80; }\n    .sfc-pnl-num.purple{ color:#c4b5fd; }\n    .sfc-pnl-label { font-size:10px; color:rgba(255,255,255,0.45); }\n    .sfc-mini-bars { display:flex; align-items:flex-end; gap:2px; height:22px; }\n    .sfc-bar { width:5px; border-radius:2px 2px 0 0; }\n    .sfc-bar.g { background:#4ade80; }\n    .sfc-bar.r { background:#f87171; }\n\n    /* \u2500\u2500 Stats bar \u2500\u2500 */\n    .signup-stats { display:flex; gap:0; margin-top:20px; border:1px solid rgba(255,255,255,0.1); border-radius:12px; overflow:hidden; }\n    .ss-stat { flex:1; padding:13px 8px; text-align:center; border-right:1px solid rgba(255,255,255,0.1); }\n    .ss-stat:last-child { border-right:none; }\n    .ss-stat strong { display:block; font-size:1.2rem; font-weight:900; color:#fff; letter-spacing:-0.5px; }\n    .ss-stat span { font-size:10px; color:rgba(255,255,255,0.55); font-weight:600; letter-spacing:0.3px; margin-top:2px; display:block; }\n    .signup-trust { display:flex; align-items:center; gap:8px; margin-top:16px; font-size:11.5px; color:rgba(255,255,255,0.45); }\n\n    @media(max-width:600px){\n      .signup-feat-cards { grid-template-columns:1fr; }\n      .signup-stats { flex-wrap:wrap; }\n      .tier-row { flex-direction:column; }\n      .tier-dot-col { flex-direction:row; width:100%; justify-content:flex-start; padding:10px 14px 0; }\n    }\n  </style>\n</head>\n<body class=\"auth-body landing-page\">\n  <div class=\"landing-split\">\n\n    <!-- LEFT: Feature showcase -->\n    <div class=\"landing-hero\">\n      <div class=\"landing-hero-inner\">\n        <a href=\"/\" class=\"landing-logo\"><img src=\"/public/images/logo.svg\" class=\"landing-logo-img\" alt=\"ZeroScreen\"><span class=\"landing-logo-text\">Zero<em>Screen</em></span></a>\n        <div class=\"landing-badge\">\uD83C\uDDEE\uD83C\uDDF3 Built for Indian Markets \u00B7 Free Forever</div>\n        <h1 class=\"landing-headline\">Everything you need<br>to trade smarter.<br><span>All in one place.</span></h1>\n\n        <!-- Beginner callout -->\n        <div style=\"background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05));border:1px solid rgba(16,185,129,0.35);border-radius:14px;padding:14px 16px;margin-bottom:20px\">\n          <div style=\"font-size:12px;font-weight:800;color:#34d399;letter-spacing:0.4px;text-transform:uppercase;margin-bottom:6px\">\uD83C\uDF31 New to Trading?</div>\n          <div style=\"font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:6px\">Afraid of losing real money?<br>Let's learn together \u2014 zero risk.</div>\n          <div style=\"font-size:12px;color:rgba(255,255,255,0.6);line-height:1.6\">Start with \u20B91,00,000 virtual money. Practice on real NSE stocks, discover your strategy, and get confident before you ever risk a single rupee.</div>\n          <div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-top:10px\">\n            <span style=\"background:rgba(16,185,129,0.2);color:#34d399;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid rgba(16,185,129,0.3)\">\u2705 No real money needed</span>\n            <span style=\"background:rgba(16,185,129,0.2);color:#34d399;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid rgba(16,185,129,0.3)\">\uD83D\uDCC8 Real market prices</span>\n            <span style=\"background:rgba(16,185,129,0.2);color:#34d399;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid rgba(16,185,129,0.3)\">\uD83C\uDFAF Master before going live</span>\n          </div>\n        </div>\n\n        <!-- Feature preview cards with mock data -->\n        <div class=\"signup-feat-cards\">\n          <div class=\"sfc sfc-paper\">\n            <span class=\"sfc-badge hot\">\uD83D\uDD25 HOT</span>\n            <div class=\"sfc-icon\">\uD83D\uDCCB</div>\n            <div class=\"sfc-title\">My Paper Trade</div>\n            <div class=\"sfc-desc\">\u20B91,00,000 virtual portfolio. Trade any NSE stock in real market hours.</div>\n            <div class=\"sfc-pnl-preview\">\n              <div>\n                <div class=\"sfc-pnl-num green\">+\u20B94,320</div>\n                <div class=\"sfc-pnl-label\">Your P&amp;L today</div>\n              </div>\n              <div class=\"sfc-mini-bars\" style=\"margin-left:auto\">\n                <div class=\"sfc-bar r\" style=\"height:8px\"></div>\n                <div class=\"sfc-bar g\" style=\"height:14px\"></div>\n                <div class=\"sfc-bar g\" style=\"height:18px\"></div>\n                <div class=\"sfc-bar r\" style=\"height:10px\"></div>\n                <div class=\"sfc-bar g\" style=\"height:22px\"></div>\n              </div>\n            </div>\n          </div>\n          <div class=\"sfc sfc-signals\">\n            <span class=\"sfc-badge live\">\u25CF LIVE</span>\n            <div class=\"sfc-icon\">\uD83D\uDCE1</div>\n            <div class=\"sfc-title\">Live Bot Signals</div>\n            <div class=\"sfc-desc\">Real BANKNIFTY CE/PE trades. Refreshes every 8 seconds with AI confidence.</div>\n            <div class=\"sfc-pnl-preview\">\n              <div>\n                <div class=\"sfc-pnl-num\" style=\"color:#a5f3fc\">CE 48200</div>\n                <div class=\"sfc-pnl-label\">Active position</div>\n              </div>\n              <div style=\"margin-left:auto;text-align:right\">\n                <div style=\"font-size:11px;font-weight:700;color:#4ade80\">+142 pts</div>\n                <div style=\"font-size:10px;color:rgba(255,255,255,0.4)\">Unrealised</div>\n              </div>\n            </div>\n          </div>\n          <div class=\"sfc sfc-screen\">\n            <span class=\"sfc-badge free\">FREE</span>\n            <div class=\"sfc-icon\">\uD83D\uDD0D</div>\n            <div class=\"sfc-title\">NSE Screener</div>\n            <div class=\"sfc-desc\">1,700+ stocks. Filter by ROCE, ROE, D/E, P/E. 14 one-click strategy presets.</div>\n            <div class=\"sfc-pnl-preview\" style=\"justify-content:space-between\">\n              <span style=\"font-size:11px;color:#93c5fd;font-weight:700\">ROCE &gt; 20%</span>\n              <span style=\"font-size:11px;color:#93c5fd;font-weight:700\">D/E &lt; 0.5</span>\n              <span style=\"font-size:11px;color:#6ee7b7;font-weight:700\">142 stocks</span>\n            </div>\n          </div>\n          <div class=\"sfc sfc-backtest\">\n            <span class=\"sfc-badge backtest\">\uD83D\uDCCA 5-YEAR</span>\n            <div class=\"sfc-icon\">\uD83D\uDCC8</div>\n            <div class=\"sfc-title\">Backtest Analytics</div>\n            <div class=\"sfc-desc\">5 years of BANKNIFTY bot performance. Monthly P&amp;L charts. Win rate by model.</div>\n            <div class=\"sfc-pnl-preview\">\n              <div>\n                <div class=\"sfc-pnl-num purple\">68.4%</div>\n                <div class=\"sfc-pnl-label\">Win rate (5yr)</div>\n              </div>\n              <div class=\"sfc-mini-bars\" style=\"margin-left:auto\">\n                <div class=\"sfc-bar g\" style=\"height:12px\"></div>\n                <div class=\"sfc-bar r\" style=\"height:6px\"></div>\n                <div class=\"sfc-bar g\" style=\"height:18px\"></div>\n                <div class=\"sfc-bar g\" style=\"height:15px\"></div>\n                <div class=\"sfc-bar g\" style=\"height:22px\"></div>\n              </div>\n            </div>\n          </div>\n        </div>\n\n        <div class=\"signup-stats\">\n          <div class=\"ss-stat\"><strong>1,700+</strong><span>NSE Stocks</span></div>\n          <div class=\"ss-stat\"><strong>14</strong><span>Strategies</span></div>\n          <div class=\"ss-stat\"><strong>5-Year</strong><span>Backtest</span></div>\n          <div class=\"ss-stat\"><strong>Free</strong><span>Forever</span></div>\n        </div>\n\n        <div class=\"signup-trust\">\n          \uD83D\uDD12 No credit card \u00B7 No broker account needed \u00B7 Free forever\n        </div>\n      </div>\n    </div>\n\n    <!-- RIGHT: Sign up form -->\n    <div class=\"landing-auth\">\n      <div class=\"auth-card\">\n        <h2>Create your free account</h2>\n        <p class=\"auth-sub\">Takes 30 seconds. No credit card needed.</p>\n        ".concat(error ? "<div class=\"auth-error\">".concat(esc(error), "</div>") : "", "\n        <a href=\"/?guest=1\" class=\"btn-guest\">\uD83D\uDC40 Browse as Guest \u2014 No sign up needed</a>\n        <div class=\"auth-divider\"><span>or create a free account</span></div>\n        ").concat(googleBtn, "\n        <form class=\"auth-form\" method=\"POST\" action=\"/signup\">\n          <div class=\"form-group\">\n            <label>Full Name</label>\n            <input type=\"text\" name=\"name\" placeholder=\"Rahul Sharma\" required autocomplete=\"name\">\n          </div>\n          <div class=\"form-group\">\n            <label>Email address</label>\n            <input type=\"email\" name=\"email\" placeholder=\"you@example.com\" required autocomplete=\"email\">\n          </div>\n          <div class=\"form-group\">\n            <label>Password <span class=\"hint\">(min 8 chars)</span></label>\n            <input type=\"password\" name=\"password\" placeholder=\"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\" minlength=\"8\" required autocomplete=\"new-password\">\n          </div>\n          <button type=\"submit\" class=\"btn-auth\">Create Free Account \u2192</button>\n        </form>\n        <div style=\"margin-top:18px;padding:14px 16px;background:linear-gradient(135deg,rgba(16,185,129,0.08),rgba(59,130,246,0.08));border:1px solid rgba(16,185,129,0.2);border-radius:10px;font-size:0.8rem;color:var(--text-muted);line-height:1.6\">\n          \u2705 <strong style=\"color:var(--text)\">What you unlock instantly:</strong><br>\n          \uD83D\uDCCB \u20B91L personal paper trade portfolio &nbsp;\u00B7&nbsp; \u2B50 Unlimited watchlists<br>\n          \uD83D\uDD14 Email alerts on your custom filters &nbsp;\u00B7&nbsp; \uD83D\uDCCA Full bot analytics\n        </div>\n        <p class=\"auth-switch\" style=\"margin-top:16px\">Already have an account? <a href=\"/login\">Sign in</a></p>\n      </div>\n    </div>\n\n  </div>\n</body>\n</html>"));
});
// POST /signup
app.post("/signup", featureGate("registration_open", "New Registrations"), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var ip, _a, name, email, password, existing, hash, userCount, id, isAdminEmail, role;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
                if (!checkRateLimit("signup:".concat(ip), 5, 60 * 60 * 1000)) {
                    res.redirect("/signup?error=Too+many+signups+from+this+IP.+Please+try+later.");
                    return [2 /*return*/];
                }
                _a = req.body, name = _a.name, email = _a.email, password = _a.password;
                if (!name || !email || !password) {
                    res.redirect("/signup?error=All+fields+are+required");
                    return [2 /*return*/];
                }
                if (password.length < 8) {
                    res.redirect("/signup?error=Password+must+be+at+least+8+characters");
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.getUserByEmail)(email)];
            case 1:
                existing = _b.sent();
                if (existing) {
                    res.redirect("/signup?error=An+account+with+that+email+already+exists");
                    return [2 /*return*/];
                }
                return [4 /*yield*/, bcrypt_1.default.hash(password, 12)];
            case 2:
                hash = _b.sent();
                return [4 /*yield*/, (0, db_1.countUsers)()];
            case 3:
                userCount = _b.sent();
                return [4 /*yield*/, (0, db_1.createUser)(name.trim(), email.trim(), hash)];
            case 4:
                id = _b.sent();
                isAdminEmail = ADMIN_EMAIL && email.trim().toLowerCase() === ADMIN_EMAIL;
                role = (userCount === 0 || isAdminEmail) ? "admin" : "user";
                if (!(role === "admin")) return [3 /*break*/, 6];
                return [4 /*yield*/, (0, db_1.dbRun)("UPDATE users SET role = 'admin' WHERE id = ?", [id])];
            case 5:
                _b.sent();
                _b.label = 6;
            case 6:
                req.session.userId = id;
                req.session.userName = name.trim();
                req.session.userRole = role;
                // Send welcome email (non-blocking)
                (0, mailer_1.sendWelcomeEmail)(name.trim(), email.trim()).catch(function () { });
                // Notify admin on Telegram
                notifyTelegram("\uD83C\uDD95 New ZeroScreen signup!\nName: ".concat(name.trim(), "\nEmail: ").concat(email.trim(), "\nRole: ").concat(role, "\nTime: ").concat(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), " IST"));
                res.redirect("/");
                return [2 /*return*/];
        }
    });
}); });
// GET /login
app.get("/login", function (req, res) {
    if (req.session.userId) {
        res.redirect("/");
        return;
    }
    var error = req.query.error;
    var next = req.query.next;
    var googleBtn = GOOGLE_CLIENT_ID
        ? "<a href=\"/auth/google\" class=\"btn-google\">\n         <svg width=\"18\" height=\"18\" viewBox=\"0 0 18 18\" xmlns=\"http://www.w3.org/2000/svg\" style=\"flex-shrink:0\">\n           <path fill=\"#4285F4\" d=\"M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z\"/>\n           <path fill=\"#34A853\" d=\"M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z\"/>\n           <path fill=\"#FBBC05\" d=\"M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z\"/>\n           <path fill=\"#EA4335\" d=\"M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z\"/>\n         </svg>\n         Continue with Google\n       </a>\n       <div class=\"auth-divider\"><span>or sign in with email</span></div>"
        : "";
    res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Sign In \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n  <style>\n    /* \u2500\u2500 Live status cards \u2500\u2500 */\n    .login-live-cards { display: flex; flex-direction: column; gap: 10px; margin: 24px 0 20px; }\n    .llc {\n      display: flex; align-items: center; gap: 14px;\n      padding: 14px 16px; border-radius: 14px;\n      border: 1px solid rgba(255,255,255,0.08); position: relative; overflow: hidden;\n      text-decoration: none; transition: transform 0.15s;\n    }\n    .llc:hover { transform: translateX(4px); }\n    .llc-signals { background: linear-gradient(90deg,rgba(16,185,129,0.18) 0%,rgba(16,185,129,0.04) 100%); border-color: rgba(16,185,129,0.3); }\n    .llc-trade   { background: linear-gradient(90deg,rgba(239,68,68,0.15) 0%,rgba(239,68,68,0.03) 100%);  border-color: rgba(239,68,68,0.3); }\n    .llc-screen  { background: linear-gradient(90deg,rgba(59,130,246,0.15) 0%,rgba(59,130,246,0.03) 100%); border-color: rgba(59,130,246,0.3); }\n    .llc-dash    { background: linear-gradient(90deg,rgba(139,92,246,0.15) 0%,rgba(139,92,246,0.03) 100%); border-color: rgba(139,92,246,0.3); }\n    .llc-icon { font-size: 2rem; flex-shrink: 0; line-height: 1; }\n    .llc-body { flex: 1; min-width: 0; }\n    .llc-title { font-size: 13.5px; font-weight: 700; color: #f1f5f9; margin-bottom: 3px; }\n    .llc-desc  { font-size: 12px; color: rgba(255,255,255,0.5); line-height: 1.45; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n    .llc-status {\n      flex-shrink: 0; display: flex; align-items: center; gap: 5px;\n      font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 20px;\n      letter-spacing: 0.4px;\n    }\n    .llc-status.live   { background: rgba(16,185,129,0.25); color: #34d399; }\n    .llc-status.hot    { background: rgba(239,68,68,0.25); color: #f87171; }\n    .llc-status.free   { background: rgba(59,130,246,0.22); color: #93c5fd; }\n    .llc-status.data   { background: rgba(139,92,246,0.22); color: #c4b5fd; }\n    .llc-pulse { width: 7px; height: 7px; border-radius: 50%; background: currentColor; animation: liveP 1.5s ease-in-out infinite; }\n    @keyframes liveP { 0%,100%{opacity:1} 50%{opacity:0.3} }\n\n    /* \u2500\u2500 Quick stats bar \u2500\u2500 */\n    .login-stats { display: flex; gap: 0; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; overflow: hidden; margin-top: 4px; }\n    .login-stat { flex: 1; padding: 12px 8px; text-align: center; border-right: 1px solid rgba(255,255,255,0.1); }\n    .login-stat:last-child { border-right: none; }\n    .login-stat strong { display: block; font-size: 1.15rem; font-weight: 900; color: #fff; letter-spacing: -0.5px; }\n    .login-stat span { font-size: 10px; color: rgba(255,255,255,0.5); font-weight: 600; letter-spacing: 0.3px; margin-top: 2px; display: block; }\n\n    /* \u2500\u2500 Tier pills at bottom \u2500\u2500 */\n    .login-tier-row { display: flex; align-items: center; gap: 8px; margin-top: 18px; flex-wrap: wrap; }\n    .login-tier-pill {\n      display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700;\n      padding: 5px 12px; border-radius: 20px; letter-spacing: 0.3px;\n    }\n    .login-tier-pill.green  { background: rgba(16,185,129,0.18); color: #34d399; border: 1px solid rgba(16,185,129,0.3); }\n    .login-tier-pill.yellow { background: rgba(245,158,11,0.18);  color: #fbbf24; border: 1px solid rgba(245,158,11,0.3); }\n    .login-tier-pill.red    { background: rgba(239,68,68,0.18);   color: #f87171; border: 1px solid rgba(239,68,68,0.3); }\n    .login-tier-label { font-size: 11px; color: rgba(255,255,255,0.4); width: 100%; margin-top: 2px; }\n\n    @media(max-width:600px){ .llc-desc { display:none; } }\n  </style>\n</head>\n<body class=\"auth-body landing-page\">\n  <div class=\"landing-split\">\n\n    <!-- LEFT: 3-slide auto-carousel -->\n    <div class=\"landing-hero\">\n      <div class=\"landing-hero-inner\">\n        <a href=\"/\" class=\"landing-logo\"><img src=\"/public/images/logo.svg\" class=\"landing-logo-img\" alt=\"ZeroScreen\"><span class=\"landing-logo-text\">Zero<em>Screen</em></span></a>\n        <div class=\"landing-badge\">\uD83C\uDDEE\uD83C\uDDF3 Built for Indian Markets \u00B7 Free Forever</div>\n        <h1 class=\"landing-headline\">Welcome back.<br>Your market edge<br><span>is waiting.</span></h1>\n\n        <!-- Live feature status cards for returning users -->\n        <div class=\"login-live-cards\">\n          <a href=\"/signals\" class=\"llc llc-signals\">\n            <div class=\"llc-icon\">\uD83D\uDCE1</div>\n            <div class=\"llc-body\">\n              <div class=\"llc-title\">Live BANKNIFTY Bot</div>\n              <div class=\"llc-desc\">Real CE/PE signals \u00B7 AI confidence \u00B7 refreshes every 8s</div>\n            </div>\n            <div class=\"llc-status live\"><span class=\"llc-pulse\"></span> LIVE</div>\n          </a>\n          <a href=\"/my-paper-trade\" class=\"llc llc-trade\">\n            <div class=\"llc-icon\">\uD83D\uDCCB</div>\n            <div class=\"llc-body\">\n              <div class=\"llc-title\">My Paper Trade</div>\n              <div class=\"llc-desc\">\u20B91,00,000 virtual portfolio \u00B7 trade any NSE stock</div>\n            </div>\n            <div class=\"llc-status hot\">\uD83D\uDD25 HOT</div>\n          </a>\n          <a href=\"/\" class=\"llc llc-screen\">\n            <div class=\"llc-icon\">\uD83D\uDD0D</div>\n            <div class=\"llc-body\">\n              <div class=\"llc-title\">NSE Screener</div>\n              <div class=\"llc-desc\">1,700+ stocks \u00B7 14 strategies \u00B7 ROCE, ROE, D/E filters</div>\n            </div>\n            <div class=\"llc-status free\">FREE</div>\n          </a>\n          <a href=\"/dashboard\" class=\"llc llc-dash\">\n            <div class=\"llc-icon\">\uD83D\uDCCA</div>\n            <div class=\"llc-body\">\n              <div class=\"llc-title\">Bot Analytics</div>\n              <div class=\"llc-desc\">5-year backtest \u00B7 68.4% win rate \u00B7 monthly P&amp;L charts</div>\n            </div>\n            <div class=\"llc-status data\">5-YR DATA</div>\n          </a>\n        </div>\n\n        <div class=\"login-stats\">\n          <div class=\"login-stat\"><strong>1,700+</strong><span>NSE Stocks</span></div>\n          <div class=\"login-stat\"><strong>14</strong><span>Strategies</span></div>\n          <div class=\"login-stat\"><strong>5-Year</strong><span>Backtest</span></div>\n          <div class=\"login-stat\"><strong>Free</strong><span>Forever</span></div>\n        </div>\n      </div>\n    </div>\n\n    <!-- RIGHT: Auth form -->\n    <div class=\"landing-auth\">\n      <div class=\"auth-card\">\n        <h2>Welcome back</h2>\n        <p class=\"auth-sub\">Sign in to access your portfolio &amp; alerts</p>\n        ".concat(error ? "<div class=\"auth-error\">".concat(esc(error), "</div>") : "", "\n        <a href=\"/?guest=1\" class=\"btn-guest\">\uD83D\uDC40 Continue as Guest \u2014 Browse freely</a>\n        <div class=\"auth-divider\"><span>or sign in for full access</span></div>\n        ").concat(googleBtn, "\n        <form class=\"auth-form\" method=\"POST\" action=\"/login\">\n          <input type=\"hidden\" name=\"next\" value=\"").concat(esc(next) || "/", "\">\n          <div class=\"form-group\">\n            <label>Email address</label>\n            <input type=\"email\" name=\"email\" placeholder=\"you@example.com\" required autocomplete=\"email\">\n          </div>\n          <div class=\"form-group\">\n            <label>Password</label>\n            <input type=\"password\" name=\"password\" placeholder=\"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\" required autocomplete=\"current-password\">\n          </div>\n          <button type=\"submit\" class=\"btn-auth\">Sign In \u2192</button>\n        </form>\n        <p class=\"auth-switch\"><a href=\"/forgot-password\">Forgot password?</a></p>\n        <p class=\"auth-switch\">New here? <a href=\"/signup\">Create a free account \u2192</a></p>\n        <div style=\"margin-top:18px;padding:12px 16px;background:linear-gradient(135deg,rgba(16,185,129,0.07),rgba(59,130,246,0.07));border:1px solid rgba(16,185,129,0.15);border-radius:10px;font-size:0.78rem;color:var(--text-muted);line-height:1.7\">\n          \uD83D\uDD12 <strong style=\"color:var(--text)\">Signing in unlocks:</strong><br>\n          \uD83D\uDCCB Personal paper trade portfolio &nbsp;\u00B7&nbsp; \u2B50 Saved watchlists<br>\n          \uD83D\uDD14 Email alerts on custom filters &nbsp;\u00B7&nbsp; \uD83D\uDCCA Full bot analytics\n        </div>\n      </div>\n    </div>\n\n  </div>\n</body>\n</html>"));
});
// POST /login
app.post("/login", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var ip, _a, email, password, next, user, match, redirectTo;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
                if (!checkRateLimit("login:".concat(ip), 10, 15 * 60 * 1000)) {
                    res.redirect("/login?error=Too+many+attempts.+Please+wait+15+minutes.");
                    return [2 /*return*/];
                }
                _a = req.body, email = _a.email, password = _a.password, next = _a.next;
                if (!email || !password) {
                    res.redirect("/login?error=Email+and+password+are+required");
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.getUserByEmail)(email)];
            case 1:
                user = _b.sent();
                if (!user) {
                    res.redirect("/login?error=Invalid+email+or+password");
                    return [2 /*return*/];
                }
                return [4 /*yield*/, bcrypt_1.default.compare(password, user.password)];
            case 2:
                match = _b.sent();
                if (!match) {
                    res.redirect("/login?error=Invalid+email+or+password");
                    return [2 /*return*/];
                }
                req.session.userId = user.id;
                req.session.userName = user.name;
                req.session.userRole = user.role;
                redirectTo = (next && next.startsWith("/") && !next.startsWith("//")) ? next : "/";
                res.redirect(redirectTo);
                return [2 /*return*/];
        }
    });
}); });
// GET /logout
app.get("/logout", function (req, res) {
    req.session.destroy(function (err) {
        res.clearCookie("connect.sid", { path: "/" });
        res.redirect("/login");
    });
});
// ── Google OAuth ───────────────────────────────────────────────────────────────
app.get("/auth/google", function (req, res) {
    if (!GOOGLE_CLIENT_ID) {
        res.redirect("/login?error=Google+Sign-In+is+not+configured+yet");
        return;
    }
    var state = crypto_1.default.randomBytes(16).toString("hex");
    req.session.oauthState = state;
    var url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", GOOGLE_CALLBACK_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    res.redirect(url.toString());
});
app.get("/auth/google/callback", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, code, state, oauthErr, tokenRes, tokenData, infoRes, gUser, user, userCount, id, isAdminEmail, role, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
                    res.redirect("/login?error=Google+Sign-In+not+configured");
                    return [2 /*return*/];
                }
                _a = req.query, code = _a.code, state = _a.state, oauthErr = _a.error;
                if (oauthErr) {
                    res.redirect("/login?error=Google+sign-in+cancelled");
                    return [2 /*return*/];
                }
                if (!code || state !== req.session.oauthState) {
                    res.redirect("/login?error=OAuth+state+mismatch");
                    return [2 /*return*/];
                }
                _c.label = 1;
            case 1:
                _c.trys.push([1, 14, , 15]);
                return [4 /*yield*/, fetch("https://oauth2.googleapis.com/token", {
                        method: "POST",
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        body: new URLSearchParams({
                            code: code,
                            client_id: GOOGLE_CLIENT_ID,
                            client_secret: GOOGLE_CLIENT_SECRET,
                            redirect_uri: GOOGLE_CALLBACK_URL,
                            grant_type: "authorization_code",
                        }),
                    })];
            case 2:
                tokenRes = _c.sent();
                return [4 /*yield*/, tokenRes.json()];
            case 3:
                tokenData = _c.sent();
                if (!tokenData.access_token)
                    throw new Error("No access token from Google");
                return [4 /*yield*/, fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
                        headers: { Authorization: "Bearer ".concat(tokenData.access_token) },
                    })];
            case 4:
                infoRes = _c.sent();
                return [4 /*yield*/, infoRes.json()];
            case 5:
                gUser = _c.sent();
                return [4 /*yield*/, (0, db_1.getUserByEmail)(gUser.email)];
            case 6:
                user = _c.sent();
                if (!!user) return [3 /*break*/, 11];
                return [4 /*yield*/, (0, db_1.countUsers)()];
            case 7:
                userCount = _c.sent();
                return [4 /*yield*/, (0, db_1.createUser)(gUser.name || gUser.email.split("@")[0], gUser.email, "")];
            case 8:
                id = _c.sent();
                isAdminEmail = ADMIN_EMAIL && gUser.email.toLowerCase() === ADMIN_EMAIL;
                role = (userCount === 0 || isAdminEmail) ? "admin" : "user";
                return [4 /*yield*/, (0, db_1.dbRun)("UPDATE users SET google_id=?, avatar_url=?, role=? WHERE id=?", [gUser.id, gUser.picture || "", role, id])];
            case 9:
                _c.sent();
                return [4 /*yield*/, (0, db_1.getUserById)(id)];
            case 10:
                user = _c.sent();
                notifyTelegram("\uD83C\uDD95 New ZeroScreen signup via Google!\nName: ".concat(gUser.name, "\nEmail: ").concat(gUser.email));
                return [3 /*break*/, 13];
            case 11: 
            // Update google_id if not set
            return [4 /*yield*/, (0, db_1.dbRun)("UPDATE users SET google_id=COALESCE(google_id,?), avatar_url=COALESCE(avatar_url,?) WHERE id=?", [gUser.id, gUser.picture || "", user.id])];
            case 12:
                // Update google_id if not set
                _c.sent();
                _c.label = 13;
            case 13:
                if (!user)
                    throw new Error("User not found after create");
                req.session.userId = user.id;
                req.session.userName = user.name;
                req.session.userRole = user.role;
                res.redirect("/");
                return [3 /*break*/, 15];
            case 14:
                _b = _c.sent();
                res.redirect("/login?error=Google+sign-in+failed.+Please+try+again");
                return [3 /*break*/, 15];
            case 15: return [2 /*return*/];
        }
    });
}); });
// ── Forgot / Reset password ────────────────────────────────────────────────────
app.get("/forgot-password", function (req, res) {
    if (req.session.userId) {
        res.redirect("/");
        return;
    }
    var sent = req.query.sent === "1";
    var error = req.query.error;
    res.send(authLayout("Forgot Password", "\n    <h2>Reset your password</h2>\n    <p class=\"auth-sub\">Enter your email and we'll send a reset link.</p>\n    ".concat(sent ? '<div class="auth-success">✅ If that email exists, a reset link has been sent.</div>' : "", "\n    ").concat(error ? "<div class=\"auth-error\">".concat(esc(error), "</div>") : "", "\n    <form class=\"auth-form\" method=\"POST\" action=\"/forgot-password\">\n      <div class=\"form-group\">\n        <label>Email address</label>\n        <input type=\"email\" name=\"email\" placeholder=\"you@example.com\" required autocomplete=\"email\">\n      </div>\n      <button type=\"submit\" class=\"btn-auth\">Send Reset Link \u2192</button>\n    </form>\n    <p class=\"auth-switch\"><a href=\"/login\">\u2190 Back to Sign In</a></p>\n  ")));
});
app.post("/forgot-password", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var ip, email, user, token, APP_URL, resetUrl;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
                if (!checkRateLimit("forgot:".concat(ip), 5, 60 * 60 * 1000)) {
                    res.redirect("/forgot-password?sent=1");
                    return [2 /*return*/]; // silently swallow — don't reveal rate limit
                }
                email = req.body.email;
                if (!email) {
                    res.redirect("/forgot-password?error=Email+is+required");
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.getUserByEmail)(email.trim().toLowerCase())];
            case 1:
                user = _a.sent();
                if (!user) return [3 /*break*/, 3];
                token = crypto_1.default.randomBytes(32).toString("hex");
                return [4 /*yield*/, (0, db_1.createResetToken)(user.id, token)];
            case 2:
                _a.sent();
                APP_URL = (process.env.APP_URL || "http://localhost:".concat(PORT)).replace(/\/$/, "");
                resetUrl = "".concat(APP_URL, "/reset-password/").concat(token);
                (0, mailer_1.sendPasswordResetEmail)(user.email, user.name, resetUrl).catch(function () { });
                _a.label = 3;
            case 3:
                // Always show same message to prevent email enumeration
                res.redirect("/forgot-password?sent=1");
                return [2 /*return*/];
        }
    });
}); });
app.get("/reset-password/:token", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var record, expired, error;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (req.session.userId) {
                    res.redirect("/");
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.getResetToken)(req.params.token)];
            case 1:
                record = _a.sent();
                expired = !record || record.used === 1 || new Date(record.expires_at) < new Date();
                if (expired) {
                    res.send(authLayout("Link Expired", "\n      <h2>Link expired or invalid</h2>\n      <p class=\"auth-sub\">This reset link has already been used or expired.</p>\n      <a href=\"/forgot-password\" class=\"btn-auth\" style=\"text-align:center;display:block\">Request a new link \u2192</a>\n    "));
                    return [2 /*return*/];
                }
                error = req.query.error;
                res.send(authLayout("Set New Password", "\n    <h2>Set a new password</h2>\n    <p class=\"auth-sub\">Choose a strong password for your account.</p>\n    ".concat(error ? "<div class=\"auth-error\">".concat(esc(error), "</div>") : "", "\n    <form class=\"auth-form\" method=\"POST\" action=\"/reset-password/").concat(req.params.token, "\">\n      <div class=\"form-group\">\n        <label>New Password <span class=\"hint\">(min 8 chars)</span></label>\n        <input type=\"password\" name=\"password\" placeholder=\"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\" minlength=\"8\" required autocomplete=\"new-password\">\n      </div>\n      <div class=\"form-group\">\n        <label>Confirm Password</label>\n        <input type=\"password\" name=\"confirm\" placeholder=\"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\" minlength=\"8\" required autocomplete=\"new-password\">\n      </div>\n      <button type=\"submit\" class=\"btn-auth\">Set Password \u2192</button>\n    </form>\n  ")));
                return [2 /*return*/];
        }
    });
}); });
app.post("/reset-password/:token", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, password, confirm, record, expired, hash;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, password = _a.password, confirm = _a.confirm;
                return [4 /*yield*/, (0, db_1.getResetToken)(req.params.token)];
            case 1:
                record = _b.sent();
                expired = !record || record.used === 1 || new Date(record.expires_at) < new Date();
                if (expired) {
                    res.redirect("/forgot-password?error=Link+expired+please+request+again");
                    return [2 /*return*/];
                }
                if (!password || password.length < 8) {
                    res.redirect("/reset-password/".concat(req.params.token, "?error=Password+must+be+at+least+8+characters"));
                    return [2 /*return*/];
                }
                if (password !== confirm) {
                    res.redirect("/reset-password/".concat(req.params.token, "?error=Passwords+do+not+match"));
                    return [2 /*return*/];
                }
                return [4 /*yield*/, bcrypt_1.default.hash(password, 12)];
            case 2:
                hash = _b.sent();
                return [4 /*yield*/, (0, db_1.updateUserPassword)(record.user_id, hash)];
            case 3:
                _b.sent();
                return [4 /*yield*/, (0, db_1.markResetTokenUsed)(req.params.token)];
            case 4:
                _b.sent();
                res.redirect("/login?success=Password+updated+successfully+please+sign+in");
                return [2 /*return*/];
        }
    });
}); });
// ── Profile page ───────────────────────────────────────────────────────────────
app.get("/profile", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var user, success, error;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, db_1.getUserById)(req.session.userId)];
            case 1:
                user = _a.sent();
                if (!user) {
                    res.redirect("/login");
                    return [2 /*return*/];
                }
                success = req.query.success;
                error = req.query.error;
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Profile \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body>\n  ".concat(nav("profile", req), "\n  <div class=\"container\" style=\"max-width:620px\">\n    <div class=\"page-header\">\n      <h1>\uD83D\uDC64 My Profile</h1>\n    </div>\n    ").concat(success ? "<div class=\"auth-success\" style=\"margin-bottom:18px\">\u2705 ".concat(esc(success), "</div>") : "", "\n    ").concat(error ? "<div class=\"auth-error\"   style=\"margin-bottom:18px\">\u26A0\uFE0F ".concat(esc(error), "</div>") : "", "\n\n    <!-- Change name -->\n    <div class=\"profile-card\">\n      <h2>Display Name</h2>\n      <form method=\"POST\" action=\"/profile/name\" class=\"auth-form\">\n        <div class=\"form-group\">\n          <label>Full Name</label>\n          <input type=\"text\" name=\"name\" value=\"").concat(user.name.replace(/"/g, "&quot;"), "\" required minlength=\"2\" maxlength=\"80\" autocomplete=\"name\">\n        </div>\n        <button type=\"submit\" class=\"btn-primary\">Update Name</button>\n      </form>\n    </div>\n\n    <!-- Change password -->\n    <div class=\"profile-card\">\n      <h2>Change Password</h2>\n      <form method=\"POST\" action=\"/profile/password\" class=\"auth-form\">\n        <div class=\"form-group\">\n          <label>Current Password</label>\n          <input type=\"password\" name=\"current\" placeholder=\"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\" required autocomplete=\"current-password\">\n        </div>\n        <div class=\"form-group\">\n          <label>New Password <span class=\"hint\">(min 8 chars)</span></label>\n          <input type=\"password\" name=\"password\" placeholder=\"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\" minlength=\"8\" required autocomplete=\"new-password\">\n        </div>\n        <div class=\"form-group\">\n          <label>Confirm New Password</label>\n          <input type=\"password\" name=\"confirm\" placeholder=\"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\" minlength=\"8\" required autocomplete=\"new-password\">\n        </div>\n        <button type=\"submit\" class=\"btn-primary\">Change Password</button>\n      </form>\n    </div>\n\n    <!-- Account info -->\n    <div class=\"profile-card profile-info\">\n      <div class=\"profile-info-row\"><span>Email</span><strong>").concat(user.email, "</strong></div>\n      <div class=\"profile-info-row\"><span>Role</span><span class=\"role-badge role-").concat(user.role, "\">").concat(user.role, "</span></div>\n      <div class=\"profile-info-row\"><span>Member since</span><strong>").concat(new Date(user.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }), "</strong></div>\n    </div>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
app.post("/profile/name", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var name;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                name = req.body.name;
                if (!name || name.trim().length < 2) {
                    res.redirect("/profile?error=Name+must+be+at+least+2+characters");
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.updateUserName)(req.session.userId, name.trim().substring(0, 80))];
            case 1:
                _a.sent();
                req.session.userName = name.trim();
                res.redirect("/profile?success=Name+updated+successfully");
                return [2 /*return*/];
        }
    });
}); });
app.post("/profile/password", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, current, password, confirm, user, match, hash;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, current = _a.current, password = _a.password, confirm = _a.confirm;
                return [4 /*yield*/, (0, db_1.getUserById)(req.session.userId)];
            case 1:
                user = _b.sent();
                if (!user) {
                    res.redirect("/login");
                    return [2 /*return*/];
                }
                return [4 /*yield*/, bcrypt_1.default.compare(current, user.password)];
            case 2:
                match = _b.sent();
                if (!match) {
                    res.redirect("/profile?error=Current+password+is+incorrect");
                    return [2 /*return*/];
                }
                if (!password || password.length < 8) {
                    res.redirect("/profile?error=New+password+must+be+at+least+8+characters");
                    return [2 /*return*/];
                }
                if (password !== confirm) {
                    res.redirect("/profile?error=Passwords+do+not+match");
                    return [2 /*return*/];
                }
                return [4 /*yield*/, bcrypt_1.default.hash(password, 12)];
            case 3:
                hash = _b.sent();
                return [4 /*yield*/, (0, db_1.updateUserPassword)(req.session.userId, hash)];
            case 4:
                _b.sent();
                res.redirect("/profile?success=Password+changed+successfully");
                return [2 /*return*/];
        }
    });
}); });
// ── GET /verify-mobile ─────────────────────────────────────────────────────────
app.get("/verify-mobile", requireAuth, function (req, res) {
    var mobile = esc(req.query.mobile || "");
    var sent = req.query.sent === "1";
    var err = esc(req.query.err || "");
    var next = esc(req.query.next || "/my-paper-trade");
    res.send("<!DOCTYPE html><html lang=\"en\"><head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Verify Mobile \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n  <style>\n    .vm-card{max-width:420px;margin:60px auto;background:var(--card-bg);border:1px solid var(--border);border-radius:16px;padding:32px 36px}\n    .vm-title{font-size:1.4rem;font-weight:800;margin-bottom:6px}\n    .vm-sub{color:var(--text-muted);font-size:0.88rem;margin-bottom:24px}\n    .vm-label{font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:5px}\n    .vm-input{width:100%;padding:10px 14px;background:var(--input-bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:1rem;box-sizing:border-box}\n    .vm-btn{width:100%;padding:11px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:700;cursor:pointer;margin-top:12px}\n    .vm-btn:hover{opacity:.88}\n    .vm-err{background:#ef444422;color:#ef4444;border:1px solid #ef444455;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:0.88rem}\n    .vm-ok{background:#10b98122;color:#10b981;border:1px solid #10b98155;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:0.88rem}\n    .vm-note{font-size:0.78rem;color:var(--text-muted);margin-top:14px;text-align:center}\n  </style>\n</head><body>".concat(nav("", req), "\n<div class=\"container\">\n  <div class=\"vm-card\">\n    <div class=\"vm-title\">\uD83D\uDCF1 Verify Mobile Number</div>\n    <div class=\"vm-sub\">Required once before you can paper trade. We'll send a 6-digit OTP.</div>\n    ").concat(err ? "<div class=\"vm-err\">\u274C ".concat(err, "</div>") : "", "\n    ").concat(sent ? "<div class=\"vm-ok\">\u2705 OTP sent to +91 ".concat(mobile, ". Enter it below.</div>") : "", "\n    ").concat(!sent ? "\n    <form method=\"POST\" action=\"/verify-mobile/send\">\n      <input type=\"hidden\" name=\"next\" value=\"".concat(next, "\">\n      <label class=\"vm-label\">Mobile Number (India)</label>\n      <input class=\"vm-input\" type=\"tel\" name=\"mobile\" placeholder=\"10-digit mobile number\" maxlength=\"10\" pattern=\"[0-9]{10}\" required>\n      <button class=\"vm-btn\">Send OTP \u2192</button>\n    </form>") : "\n    <form method=\"POST\" action=\"/verify-mobile/confirm\">\n      <input type=\"hidden\" name=\"mobile\" value=\"".concat(mobile, "\">\n      <input type=\"hidden\" name=\"next\" value=\"").concat(next, "\">\n      <label class=\"vm-label\">Enter 6-digit OTP</label>\n      <input class=\"vm-input\" type=\"text\" name=\"otp\" placeholder=\"123456\" maxlength=\"6\" pattern=\"[0-9]{6}\" required autocomplete=\"one-time-code\">\n      <button class=\"vm-btn\">Verify & Continue \u2192</button>\n    </form>\n    <div class=\"vm-note\"><a href=\"/verify-mobile\">Resend OTP</a></div>"), "\n  </div>\n</div>\n<script src=\"/public/js/app.js\"></script></body></html>"));
});
// POST /verify-mobile/send — generate & send OTP
app.post("/verify-mobile/send", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var raw, mobile, next, ip, otp, sent;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                raw = (req.body.mobile || "").replace(/\D/g, "");
                mobile = raw.slice(-10);
                next = (req.body.next || "/my-paper-trade").replace(/[^a-zA-Z0-9/?=&_\-]/g, "");
                if (mobile.length !== 10) {
                    res.redirect("/verify-mobile?err=".concat(encodeURIComponent("Please enter a valid 10-digit mobile number"), "&next=").concat(encodeURIComponent(next)));
                    return [2 /*return*/];
                }
                ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "x").split(",")[0].trim();
                if (!checkRateLimit("otp:".concat(ip, ":").concat(mobile), 3, 60 * 60 * 1000)) {
                    res.redirect("/verify-mobile?err=".concat(encodeURIComponent("Too many OTP requests. Please wait an hour."), "&next=").concat(encodeURIComponent(next)));
                    return [2 /*return*/];
                }
                otp = Math.floor(100000 + Math.random() * 900000).toString();
                return [4 /*yield*/, (0, db_1.storePhoneOtp)(mobile, otp)];
            case 1:
                _a.sent();
                return [4 /*yield*/, sendSmsOtp(mobile, otp)];
            case 2:
                sent = _a.sent();
                if (!sent) {
                    res.redirect("/verify-mobile?err=".concat(encodeURIComponent("Failed to send OTP. Please try again."), "&next=").concat(encodeURIComponent(next)));
                    return [2 /*return*/];
                }
                res.redirect("/verify-mobile?mobile=".concat(mobile, "&sent=1&next=").concat(encodeURIComponent(next)));
                return [2 /*return*/];
        }
    });
}); });
// POST /verify-mobile/confirm — verify OTP
app.post("/verify-mobile/confirm", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var mobile, otp, next, ok, existingUser;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mobile = (req.body.mobile || "").replace(/\D/g, "").slice(-10);
                otp = (req.body.otp || "").trim();
                next = (req.body.next || "/my-paper-trade").replace(/[^a-zA-Z0-9/?=&_\-]/g, "");
                if (mobile.length !== 10 || !/^\d{6}$/.test(otp)) {
                    res.redirect("/verify-mobile?mobile=".concat(mobile, "&sent=1&err=").concat(encodeURIComponent("Invalid input"), "&next=").concat(encodeURIComponent(next)));
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.verifyPhoneOtp)(mobile, otp)];
            case 1:
                ok = _a.sent();
                if (!ok) {
                    res.redirect("/verify-mobile?mobile=".concat(mobile, "&sent=1&err=").concat(encodeURIComponent("Invalid or expired OTP. Please try again."), "&next=").concat(encodeURIComponent(next)));
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.getUserByMobile)(mobile)];
            case 2:
                existingUser = _a.sent();
                if (existingUser && existingUser.id !== req.session.userId) {
                    res.redirect("/verify-mobile?err=".concat(encodeURIComponent("This mobile number is already linked to another account."), "&next=").concat(encodeURIComponent(next)));
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.setUserMobile)(req.session.userId, mobile)];
            case 3:
                _a.sent();
                req.session.mobileVerified = true;
                res.redirect(next + (next.includes("?") ? "&" : "?") + "msg=" + encodeURIComponent("Mobile verified! You can now paper trade."));
                return [2 /*return*/];
        }
    });
}); });
// ── GET / — Screener ───────────────────────────────────────────────────────────
app.get("/", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var PAGE_SIZE, page, offset, f, newsItems, rawWords, skipWords_1, candidates, FILTER_KEYS, hasFilters, openFilters, filterCount, rawStocks, hasNextPage, stocks, sectors, todayPicks, activeStrategy, dbStats, priceAsOf, paginationQ, prevPageQ, nextPageQ, rows, sectorOptions, sortOptions, q, strategyCards;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                // Redirect unauthenticated non-guest users to login
                if (!((_a = req.session) === null || _a === void 0 ? void 0 : _a.userId)) {
                    if (req.query.guest === "1") {
                        req.session.guestMode = true; // persist guest choice
                    }
                    else if (!((_b = req.session) === null || _b === void 0 ? void 0 : _b.guestMode)) {
                        res.redirect("/login");
                        return [2 /*return*/];
                    }
                }
                PAGE_SIZE = 50;
                page = Math.max(1, parseInt(req.query.page || "1", 10));
                offset = (page - 1) * PAGE_SIZE;
                f = {
                    minRoce: req.query.minRoce ? parseFloat(req.query.minRoce) : undefined,
                    maxRoce: req.query.maxRoce ? parseFloat(req.query.maxRoce) : undefined,
                    maxDe: req.query.maxDe ? parseFloat(req.query.maxDe) : undefined,
                    minPromoter: req.query.minPromoter ? parseFloat(req.query.minPromoter) : undefined,
                    maxPe: req.query.maxPe ? parseFloat(req.query.maxPe) : undefined,
                    minPe: req.query.minPe ? parseFloat(req.query.minPe) : undefined,
                    minPrice: req.query.minPrice ? parseFloat(req.query.minPrice) : undefined,
                    maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice) : undefined,
                    minVolume: req.query.minVolume ? parseInt(req.query.minVolume, 10) : undefined,
                    minMarketCap: req.query.minMc ? parseFloat(req.query.minMc) : undefined,
                    maxMarketCap: req.query.maxMc ? parseFloat(req.query.maxMc) : undefined,
                    minDividendYield: req.query.minDivYield ? parseFloat(req.query.minDivYield) : undefined,
                    // Indicator filters
                    minRoe: req.query.minRoe ? parseFloat(req.query.minRoe) : undefined,
                    minEps: req.query.minEps ? parseFloat(req.query.minEps) : undefined,
                    minCurrentRatio: req.query.minCr ? parseFloat(req.query.minCr) : undefined,
                    maxPbRatio: req.query.maxPb ? parseFloat(req.query.maxPb) : undefined,
                    minChangePct: req.query.minChg ? parseFloat(req.query.minChg) : undefined,
                    maxChangePct: req.query.maxChg ? parseFloat(req.query.maxChg) : undefined,
                    near52High: req.query.near52H ? parseFloat(req.query.near52H) : undefined,
                    near52Low: req.query.near52L ? parseFloat(req.query.near52L) : undefined,
                    allProfitable: req.query.allProfit === "1",
                    profitUptrend: req.query.uptrend === "1",
                    sector: req.query.sector ? req.query.sector : undefined,
                    sortBy: req.query.sortBy || "roce",
                    sortDir: req.query.sortDir || "desc",
                    limit: PAGE_SIZE + 1,
                    offset: offset,
                };
                if (!(req.query.inNews === "1")) return [3 /*break*/, 2];
                return [4 /*yield*/, fetchMarketNews()];
            case 1:
                newsItems = _d.sent();
                rawWords = newsItems.flatMap(function (n) {
                    return (n.title || '').match(/\b([A-Z]{3,10})\b/g) || [];
                });
                skipWords_1 = new Set([
                    "NSE", "BSE", "IPO", "FII", "DII", "GDP", "RBI", "SEBI", "FY", "Q1", "Q2", "Q3", "Q4",
                    "CEO", "CFO", "MD", "AGM", "EGM", "USA", "UAE", "IRAN", "GOLD", "MINT", "CDATA",
                    "HTTP", "HTTPS", "COM", "WWW", "HTML", "RSS", "XML", "API", "USD", "INR",
                    "MARKET", "STOCK", "STOCKS", "SHARE", "SHARES", "INDIA", "NIFTY", "SENSEX",
                    "BANK", "RATE", "YEAR", "WEEKLY", "DAILY", "TRADE", "TRADING", "JUNE",
                    "JULY", "AUG", "SEP", "OCT", "NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY",
                ]);
                candidates = __spreadArray([], new Set(rawWords.filter(function (w) { return !skipWords_1.has(w); })), true);
                if (candidates.length > 0) {
                    f.symbolsIn = candidates.slice(0, 60);
                }
                else {
                    // Fallback: show top movers if no stock symbols found in news
                    f.minChangePct = 0.5;
                }
                _d.label = 2;
            case 2:
                FILTER_KEYS = ['minRoce', 'maxRoce', 'maxDe', 'minPromoter', 'maxPromoter', 'minPe', 'maxPe', 'minPrice', 'maxPrice', 'minVolume', 'minMc', 'maxMc', 'minDivYield', 'allProfit', 'uptrend', 'sector', 'strategy', 'minRoe', 'minEps', 'minCr', 'maxPb', 'minChg', 'maxChg', 'near52H', 'near52L', 'inNews'];
                hasFilters = FILTER_KEYS.some(function (k) { return req.query[k] && req.query[k] !== ''; });
                openFilters = !req.query.strategy && FILTER_KEYS.filter(function (k) { return k !== 'strategy'; }).some(function (k) { return req.query[k] && req.query[k] !== ''; });
                filterCount = FILTER_KEYS.filter(function (k) { return k !== 'strategy' && req.query[k] && req.query[k] !== ''; }).length;
                return [4 /*yield*/, (0, db_1.screenStocks)(f)];
            case 3:
                rawStocks = _d.sent();
                hasNextPage = rawStocks.length > PAGE_SIZE;
                stocks = hasNextPage ? rawStocks.slice(0, PAGE_SIZE) : rawStocks;
                return [4 /*yield*/, (0, db_1.getSectors)()];
            case 4:
                sectors = _d.sent();
                return [4 /*yield*/, (0, db_1.getActivePicks)()];
            case 5:
                todayPicks = _d.sent();
                activeStrategy = req.query.strategy;
                return [4 /*yield*/, (0, db_1.getDbStats)()];
            case 6:
                dbStats = _d.sent();
                priceAsOf = dbStats.lastPriceUpdate
                    ? new Date(dbStats.lastPriceUpdate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
                    : null;
                paginationQ = new URLSearchParams(req.query);
                prevPageQ = new URLSearchParams(paginationQ);
                prevPageQ.set("page", String(page - 1));
                nextPageQ = new URLSearchParams(paginationQ);
                nextPageQ.set("page", String(page + 1));
                rows = stocks.map(function (s) {
                    var chgPill = s.change_pct != null
                        ? "<span class=\"".concat(s.change_pct >= 0 ? "pill-up" : "pill-dn", "\">").concat(s.change_pct >= 0 ? "+" : "").concat(fmt(s.change_pct, 2), "%</span>")
                        : "—";
                    var roceClass = s.roce >= 20 ? "roce-hi" : s.roce >= 10 ? "roce-md" : "roce-lo";
                    var deStr = s.de_ratio === 0
                        ? "<span class=\"badge-debtfree\">\uD83D\uDC8E Debt-free</span>"
                        : "<span style=\"color:".concat(deColor(s.de_ratio), "\">").concat(fmt(s.de_ratio), "</span>");
                    var cleanSector = (s.sector && s.sector.length >= 3 && !/^\[?\d+\]?$/.test(s.sector) && !/edit|about/i.test(s.sector))
                        ? s.sector : null;
                    void cleanSector; // kept for potential future use
                    return "\n    <tr>\n      <td class=\"cmp-check-cell\"><input type=\"checkbox\" class=\"cmp-check\" value=\"".concat(s.symbol, "\" onchange=\"updateCompare()\"></td>\n      <td><a href=\"/stock/").concat(s.symbol, "\" class=\"sym-link\">").concat(s.symbol, "</a></td>\n      <td class=\"company-name\" title=\"").concat((s.company_name || "").replace(/"/g, "&quot;"), "\">").concat(s.company_name || "—", "</td>\n      <td class=\"td-price\">\u20B9").concat(fmt(s.price, 2), "</td>\n      <td>").concat(chgPill, "</td>\n      <td>").concat(fmtVol(s.volume), "</td>\n      <td class=\"").concat(roceClass, "\">").concat(fmt(s.roce), "%</td>\n      <td>").concat(fmt(s.roe), "%</td>\n      <td>").concat(deStr, "</td>\n      <td>").concat(fmt(s.promoter_pct), "%</td>\n      <td>").concat(fmt(s.pe_ratio, 1), "</td>\n      <td>").concat(s.all_profitable ? "✅" : "❌", " ").concat(s.profit_uptrend ? "↑" : "↓", "</td>\n    </tr>");
                }).join("");
                sectorOptions = sectors.map(function (s) {
                    return "<option value=\"".concat(s, "\" ").concat(f.sector === s ? "selected" : "", ">").concat(s, "</option>");
                }).join("");
                sortOptions = [
                    ["roce", "ROCE %"], ["roe", "ROE %"], ["de", "D/E Ratio"], ["promoter", "Promoter %"],
                    ["pe", "P/E Ratio"], ["price", "Price"], ["volume", "Volume"],
                    ["market_cap", "Market Cap"], ["change_pct", "Change %"], ["dividend", "Dividend Yield"],
                    ["eps", "EPS"], ["book_value", "Book Value"], ["current_ratio", "Current Ratio"],
                ];
                q = req.query;
                strategyCards = STRATEGIES.map(function (s) { return "\n    <a href=\"/?strategy=".concat(s.id, "&").concat(strategyParams(s), "\" class=\"strategy-card s-").concat(s.id, " ").concat(activeStrategy === s.id ? "active" : "", "\" title=\"").concat(s.desc, "\">\n      <span class=\"s-flag\">\uD83C\uDDEE\uD83C\uDDF3</span>\n      <span class=\"s-emoji\">").concat(s.icon, "</span>\n      <span class=\"strategy-label\">").concat(s.label, "</span>\n    </a>"); }).join("");
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>ZeroScreen \u2014 NSE Stock Screener</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body>\n  ".concat(nav("home", req), "\n\n  <!-- \u2500\u2500 Compact Index Grid \u2500\u2500 -->\n  <div class=\"idx-grid-outer\">\n    <div class=\"idx-grid\" id=\"idx-grid\">\n      <div class=\"idx-card\" id=\"ic-NSEI\">\n        <div class=\"idx-lbl\"><img src=\"https://flagcdn.com/16x12/in.png\" class=\"mkt-flag-img\" alt=\"IN\"> NIFTY 50</div>\n        <div class=\"idx-price\" id=\"ip-NSEI\">\u2014</div>\n        <div class=\"idx-chg idx-d\" id=\"icc-NSEI\">\u2014</div>\n      </div>\n      <div class=\"idx-card\" id=\"ic-NSEBANK\">\n        <div class=\"idx-lbl\"><img src=\"https://flagcdn.com/16x12/in.png\" class=\"mkt-flag-img\" alt=\"IN\"> BANK NIFTY</div>\n        <div class=\"idx-price\" id=\"ip-NSEBANK\">\u2014</div>\n        <div class=\"idx-chg idx-d\" id=\"icc-NSEBANK\">\u2014</div>\n      </div>\n      <div class=\"idx-card\" id=\"ic-FINNIFTY\">\n        <div class=\"idx-lbl\"><img src=\"https://flagcdn.com/16x12/in.png\" class=\"mkt-flag-img\" alt=\"IN\"> FIN NIFTY</div>\n        <div class=\"idx-price\" id=\"ip-FINNIFTY\">\u2014</div>\n        <div class=\"idx-chg idx-d\" id=\"icc-FINNIFTY\">\u2014</div>\n      </div>\n      <div class=\"idx-card\" id=\"ic-INDIAVIX\">\n        <div class=\"idx-lbl\"><img src=\"https://flagcdn.com/16x12/in.png\" class=\"mkt-flag-img\" alt=\"IN\"> INDIA VIX</div>\n        <div class=\"idx-price\" id=\"ip-INDIAVIX\">\u2014</div>\n        <div class=\"idx-chg idx-d\" id=\"icc-INDIAVIX\">\u2014</div>\n      </div>\n      <div class=\"idx-card\" id=\"ic-MIDCAP\">\n        <div class=\"idx-lbl\"><img src=\"https://flagcdn.com/16x12/in.png\" class=\"mkt-flag-img\" alt=\"IN\"> MIDCAP 100</div>\n        <div class=\"idx-price\" id=\"ip-MIDCAP\">\u2014</div>\n        <div class=\"idx-chg idx-d\" id=\"icc-MIDCAP\">\u2014</div>\n      </div>\n      <div class=\"idx-card\" id=\"ic-NIFTYIT\">\n        <div class=\"idx-lbl\"><img src=\"https://flagcdn.com/16x12/in.png\" class=\"mkt-flag-img\" alt=\"IN\"> NIFTY IT</div>\n        <div class=\"idx-price\" id=\"ip-NIFTYIT\">\u2014</div>\n        <div class=\"idx-chg idx-d\" id=\"icc-NIFTYIT\">\u2014</div>\n      </div>\n      <div class=\"idx-card idx-card-global\" id=\"ic-DJI\">\n        <div class=\"idx-lbl\"><img src=\"https://flagcdn.com/16x12/us.png\" class=\"mkt-flag-img\" alt=\"US\"> DOW JONES</div>\n        <div class=\"idx-price\" id=\"ip-DJI\">\u2014</div>\n        <div class=\"idx-chg idx-d\" id=\"icc-DJI\">\u2014</div>\n      </div>\n      <div class=\"idx-card idx-card-global\" id=\"ic-IXIC\">\n        <div class=\"idx-lbl\"><img src=\"https://flagcdn.com/16x12/us.png\" class=\"mkt-flag-img\" alt=\"US\"> NASDAQ</div>\n        <div class=\"idx-price\" id=\"ip-IXIC\">\u2014</div>\n        <div class=\"idx-chg idx-d\" id=\"icc-IXIC\">\u2014</div>\n      </div>\n      <div class=\"idx-card idx-card-global\" id=\"ic-GSPC\">\n        <div class=\"idx-lbl\"><img src=\"https://flagcdn.com/16x12/us.png\" class=\"mkt-flag-img\" alt=\"US\"> S&amp;P 500</div>\n        <div class=\"idx-price\" id=\"ip-GSPC\">\u2014</div>\n        <div class=\"idx-chg idx-d\" id=\"icc-GSPC\">\u2014</div>\n      </div>\n      <div class=\"idx-card idx-card-global\" id=\"ic-N225\">\n        <div class=\"idx-lbl\"><img src=\"https://flagcdn.com/16x12/jp.png\" class=\"mkt-flag-img\" alt=\"JP\"> NIKKEI 225</div>\n        <div class=\"idx-price\" id=\"ip-N225\">\u2014</div>\n        <div class=\"idx-chg idx-d\" id=\"icc-N225\">\u2014</div>\n      </div>\n      <div class=\"idx-card idx-card-global\" id=\"ic-HSI\">\n        <div class=\"idx-lbl\"><img src=\"https://flagcdn.com/16x12/hk.png\" class=\"mkt-flag-img\" alt=\"HK\"> HANG SENG</div>\n        <div class=\"idx-price\" id=\"ip-HSI\">\u2014</div>\n        <div class=\"idx-chg idx-d\" id=\"icc-HSI\">\u2014</div>\n      </div>\n    </div>\n  </div>\n\n  <div class=\"container screener-layout\">\n\n    <!-- \u2500\u2500 Main content column \u2500\u2500 -->\n    <div class=\"screener-main\">\n      <div class=\"screener-hero\">\n        <div class=\"screener-hero-text\">\n          <h1>NSE Stock Screener</h1>\n          <p class=\"screener-hero-sub\">Filter 1,700+ stocks by ROCE, D/E, P/E, promoter % and more \u2014 free forever</p>\n          ").concat(priceAsOf ? "<span class=\"data-freshness-badge\">\uD83D\uDCC5 Prices as of ".concat(priceAsOf, " \u00B7 NSE EOD \u00B7 Fundamentals updated weekly</span>") : "", "\n        </div>\n        <div class=\"screener-hero-stats\">\n          <div class=\"sh-stat\"><strong>1,700+</strong><span>NSE Stocks</span></div>\n          <div class=\"sh-stat\"><strong>14</strong><span>Strategies</span></div>\n          <div class=\"sh-stat\"><strong>15+</strong><span>Filters</span></div>\n          <div class=\"sh-stat\"><strong>Free</strong><span>Always</span></div>\n        </div>\n      </div>\n\n      ").concat(todayPicks.length > 0 ? "\n      <!-- \u2500\u2500 Today's Picks \u2500\u2500 -->\n      <section class=\"today-section\">\n        <div class=\"today-section-header\">\n          <div class=\"today-title-group\">\n            <span class=\"today-live-pulse\"></span>\n            <span class=\"today-section-title\">\uD83D\uDD25 Today's Picks</span>\n            <span class=\"today-section-badge\">".concat(todayPicks.length, " stocks</span>\n            <span class=\"tier-pill tier-mid\">\uD83D\uDFE1 Traders</span>\n          </div>\n          <a href=\"/today\" class=\"today-view-all\">View all ").concat(todayPicks.length, " \u2192</a>\n        </div>\n        <div class=\"picks-data-note\">\uD83D\uDCCB Based on last market close \u00B7 Fundamentals, signals &amp; price action analysed \u00B7 Not SEBI registered \u00B7 Educational only</div>\n        <div class=\"today-picks-grid\">\n          ").concat(todayPicks.slice(0, 6).map(function (p) { return "\n          <a href=\"/today\" class=\"today-pick-card today-pick-card-".concat(p.direction.toLowerCase(), "\">\n            <div class=\"today-pick-header\">\n              <span class=\"today-pick-dir today-dir-").concat(p.direction.toLowerCase(), "\">").concat(p.direction === "LONG" ? "▲ LONG" : "▼ SHORT", "</span>\n              ").concat(p.pick_type ? "<span class=\"today-pick-type\">".concat(p.pick_type, "</span>") : "", "\n            </div>\n            <div class=\"today-pick-sym\">").concat(esc(p.stock_symbol), "</div>\n            ").concat(p.company_name ? "<div class=\"today-pick-co\">".concat(esc(p.company_name.length > 20 ? p.company_name.slice(0, 19) + '…' : p.company_name), "</div>") : "", "\n            <div class=\"today-pick-range\">\u20B9").concat(p.entry_low, " \u2013 \u20B9").concat(p.entry_high, "</div>\n            <div class=\"today-pick-meta\">\n              ").concat(p.target ? "<span class=\"today-tgt\">\uD83C\uDFAF \u20B9".concat(p.target, "</span>") : "", "\n              ").concat(p.stop_loss ? "<span class=\"today-sl\">SL \u20B9".concat(p.stop_loss, "</span>") : "", "\n            </div>\n          </a>"); }).join(""), "\n          ").concat(todayPicks.length > 6 ? "<a href=\"/today\" class=\"today-pick-more-card\">+".concat(todayPicks.length - 6, " more picks</a>") : "", "\n        </div>\n      </section>") : "", "\n\n      <!-- Strategy Presets -->\n      <section class=\"strategies-section\">\n        <div class=\"strategies-header\">\n          <span class=\"strategies-title\">\u26A1 Quick Strategies</span>\n          <span class=\"strategies-sub\">One click to load expert filters \u2014 no technical knowledge needed</span>\n          <span class=\"tier-pill tier-mid\" style=\"margin-left:auto\">\uD83D\uDFE1 Traders</span>\n        </div>\n        <div class=\"strategies-grid\">").concat(strategyCards, "</div>\n      </section>\n\n      <details class=\"filter-details\" id=\"filter-details\" ").concat(openFilters ? "open" : "", ">\n        <summary class=\"filter-summary\">\n          <span>\uD83D\uDD27 Advanced Filters</span>\n          ").concat(filterCount > 0 ? "<span class=\"filter-badge\">".concat(filterCount, " active</span>") : "", "\n        </summary>\n        <form class=\"filter-form\" method=\"GET\" action=\"/\">\n          <div class=\"filter-grid\">\n\n            <div class=\"filter-group\">\n              <label>ROCE % \u2265</label>\n              <select name=\"minRoce\">\n                <option value=\"\">Any</option>\n                <option value=\"5\"  ").concat(q.minRoce === "5" ? "selected" : "", ">\u2265 5%</option>\n                <option value=\"10\" ").concat(q.minRoce === "10" ? "selected" : "", ">\u2265 10%</option>\n                <option value=\"15\" ").concat(q.minRoce === "15" ? "selected" : "", ">\u2265 15%</option>\n                <option value=\"20\" ").concat(q.minRoce === "20" ? "selected" : "", ">\u2265 20%</option>\n                <option value=\"25\" ").concat(q.minRoce === "25" ? "selected" : "", ">\u2265 25%</option>\n                <option value=\"30\" ").concat(q.minRoce === "30" ? "selected" : "", ">\u2265 30%</option>\n                <option value=\"40\" ").concat(q.minRoce === "40" ? "selected" : "", ">\u2265 40%</option>\n              </select>\n            </div>\n\n            <div class=\"filter-group\">\n              <label>D/E Ratio \u2264</label>\n              <select name=\"maxDe\">\n                <option value=\"\">Any</option>\n                <option value=\"0\"   ").concat(q.maxDe === "0" ? "selected" : "", ">0 \u2014 Debt-free \uD83D\uDC8E</option>\n                <option value=\"0.1\" ").concat(q.maxDe === "0.1" ? "selected" : "", ">\u2264 0.1</option>\n                <option value=\"0.3\" ").concat(q.maxDe === "0.3" ? "selected" : "", ">\u2264 0.3</option>\n                <option value=\"0.5\" ").concat(q.maxDe === "0.5" ? "selected" : "", ">\u2264 0.5</option>\n                <option value=\"1\"   ").concat(q.maxDe === "1" ? "selected" : "", ">\u2264 1.0</option>\n                <option value=\"2\"   ").concat(q.maxDe === "2" ? "selected" : "", ">\u2264 2.0</option>\n              </select>\n            </div>\n\n            <div class=\"filter-group\">\n              <label>Promoter % \u2265</label>\n              <select name=\"minPromoter\">\n                <option value=\"\">Any</option>\n                <option value=\"30\" ").concat(q.minPromoter === "30" ? "selected" : "", ">\u2265 30%</option>\n                <option value=\"40\" ").concat(q.minPromoter === "40" ? "selected" : "", ">\u2265 40%</option>\n                <option value=\"50\" ").concat(q.minPromoter === "50" ? "selected" : "", ">\u2265 50%</option>\n                <option value=\"60\" ").concat(q.minPromoter === "60" ? "selected" : "", ">\u2265 60%</option>\n                <option value=\"65\" ").concat(q.minPromoter === "65" ? "selected" : "", ">\u2265 65%</option>\n                <option value=\"70\" ").concat(q.minPromoter === "70" ? "selected" : "", ">\u2265 70%</option>\n                <option value=\"75\" ").concat(q.minPromoter === "75" ? "selected" : "", ">\u2265 75%</option>\n              </select>\n            </div>\n\n            <div class=\"filter-group\">\n              <label>P/E Ratio \u2264</label>\n              <select name=\"maxPe\">\n                <option value=\"\">Any</option>\n                <option value=\"8\"  ").concat(q.maxPe === "8" ? "selected" : "", ">\u2264 8 (Deep Value)</option>\n                <option value=\"10\" ").concat(q.maxPe === "10" ? "selected" : "", ">\u2264 10</option>\n                <option value=\"15\" ").concat(q.maxPe === "15" ? "selected" : "", ">\u2264 15</option>\n                <option value=\"20\" ").concat(q.maxPe === "20" ? "selected" : "", ">\u2264 20</option>\n                <option value=\"25\" ").concat(q.maxPe === "25" ? "selected" : "", ">\u2264 25</option>\n                <option value=\"30\" ").concat(q.maxPe === "30" ? "selected" : "", ">\u2264 30</option>\n                <option value=\"40\" ").concat(q.maxPe === "40" ? "selected" : "", ">\u2264 40</option>\n                <option value=\"50\" ").concat(q.maxPe === "50" ? "selected" : "", ">\u2264 50</option>\n              </select>\n            </div>\n\n            <div class=\"filter-group\">\n              <label>P/E Ratio \u2265</label>\n              <select name=\"minPe\">\n                <option value=\"\">Any</option>\n                <option value=\"5\"  ").concat(q.minPe === "5" ? "selected" : "", ">\u2265 5</option>\n                <option value=\"10\" ").concat(q.minPe === "10" ? "selected" : "", ">\u2265 10</option>\n                <option value=\"15\" ").concat(q.minPe === "15" ? "selected" : "", ">\u2265 15</option>\n                <option value=\"20\" ").concat(q.minPe === "20" ? "selected" : "", ">\u2265 20</option>\n                <option value=\"30\" ").concat(q.minPe === "30" ? "selected" : "", ">\u2265 30</option>\n              </select>\n            </div>\n\n            <div class=\"filter-group\">\n              <label>Dividend Yield \u2265</label>\n              <select name=\"minDivYield\">\n                <option value=\"\">Any</option>\n                <option value=\"0.5\" ").concat(q.minDivYield === "0.5" ? "selected" : "", ">\u2265 0.5%</option>\n                <option value=\"1\"   ").concat(q.minDivYield === "1" ? "selected" : "", ">\u2265 1%</option>\n                <option value=\"1.5\" ").concat(q.minDivYield === "1.5" ? "selected" : "", ">\u2265 1.5%</option>\n                <option value=\"2\"   ").concat(q.minDivYield === "2" ? "selected" : "", ">\u2265 2%</option>\n                <option value=\"3\"   ").concat(q.minDivYield === "3" ? "selected" : "", ">\u2265 3%</option>\n                <option value=\"5\"   ").concat(q.minDivYield === "5" ? "selected" : "", ">\u2265 5%</option>\n              </select>\n            </div>\n\n            <div class=\"filter-group\">\n              <label>Price Range (\u20B9)</label>\n              <div class=\"filter-range-row\">\n                <select name=\"minPrice\" title=\"Min Price\">\n                  <option value=\"\">\u20B9 Min</option>\n                  <option value=\"10\"   ").concat(q.minPrice === "10" ? "selected" : "", ">\u2265 \u20B910</option>\n                  <option value=\"50\"   ").concat(q.minPrice === "50" ? "selected" : "", ">\u2265 \u20B950</option>\n                  <option value=\"100\"  ").concat(q.minPrice === "100" ? "selected" : "", ">\u2265 \u20B9100</option>\n                  <option value=\"200\"  ").concat(q.minPrice === "200" ? "selected" : "", ">\u2265 \u20B9200</option>\n                  <option value=\"500\"  ").concat(q.minPrice === "500" ? "selected" : "", ">\u2265 \u20B9500</option>\n                  <option value=\"1000\" ").concat(q.minPrice === "1000" ? "selected" : "", ">\u2265 \u20B91,000</option>\n                  <option value=\"5000\" ").concat(q.minPrice === "5000" ? "selected" : "", ">\u2265 \u20B95,000</option>\n                </select>\n                <select name=\"maxPrice\" title=\"Max Price\">\n                  <option value=\"\">\u20B9 Max</option>\n                  <option value=\"50\"    ").concat(q.maxPrice === "50" ? "selected" : "", ">\u2264 \u20B950</option>\n                  <option value=\"100\"   ").concat(q.maxPrice === "100" ? "selected" : "", ">\u2264 \u20B9100</option>\n                  <option value=\"200\"   ").concat(q.maxPrice === "200" ? "selected" : "", ">\u2264 \u20B9200</option>\n                  <option value=\"500\"   ").concat(q.maxPrice === "500" ? "selected" : "", ">\u2264 \u20B9500</option>\n                  <option value=\"1000\"  ").concat(q.maxPrice === "1000" ? "selected" : "", ">\u2264 \u20B91,000</option>\n                  <option value=\"5000\"  ").concat(q.maxPrice === "5000" ? "selected" : "", ">\u2264 \u20B95,000</option>\n                  <option value=\"10000\" ").concat(q.maxPrice === "10000" ? "selected" : "", ">\u2264 \u20B910,000</option>\n                </select>\n              </div>\n            </div>\n\n            <div class=\"filter-group\">\n              <label>Volume \u2265</label>\n              <select name=\"minVolume\">\n                <option value=\"\">Any</option>\n                <option value=\"10000\"   ").concat(q.minVolume === "10000" ? "selected" : "", ">\u2265 10,000</option>\n                <option value=\"50000\"   ").concat(q.minVolume === "50000" ? "selected" : "", ">\u2265 50,000</option>\n                <option value=\"100000\"  ").concat(q.minVolume === "100000" ? "selected" : "", ">\u2265 1 Lakh</option>\n                <option value=\"500000\"  ").concat(q.minVolume === "500000" ? "selected" : "", ">\u2265 5 Lakh</option>\n                <option value=\"1000000\" ").concat(q.minVolume === "1000000" ? "selected" : "", ">\u2265 10 Lakh</option>\n                <option value=\"5000000\" ").concat(q.minVolume === "5000000" ? "selected" : "", ">\u2265 50 Lakh</option>\n              </select>\n            </div>\n\n            <div class=\"filter-group\">\n              <label>Cap Size</label>\n              <select id=\"capSizeSelect\" onchange=\"applyCapSize(this.value)\">\n                <option value=\"\">All Cap Sizes</option>\n                <option value=\"large\" ").concat(q.minMc === "20000" && !q.maxMc ? "selected" : "", ">\uD83C\uDFE2 Large Cap (\u2265 \u20B920k Cr)</option>\n                <option value=\"mid\"   ").concat(q.minMc === "5000" && q.maxMc === "20000" ? "selected" : "", ">\uD83C\uDFEC Mid Cap (\u20B95k\u201320k Cr)</option>\n                <option value=\"small\" ").concat(!q.minMc && q.maxMc === "5000" ? "selected" : "", ">\uD83C\uDF31 Small Cap (\u2264 \u20B95k Cr)</option>\n                <option value=\"micro\" ").concat(!q.minMc && q.maxMc === "1000" ? "selected" : "", ">\uD83D\uDD2C Micro Cap (\u2264 \u20B91k Cr)</option>\n              </select>\n              <input type=\"hidden\" id=\"minMcInput\" name=\"minMc\" value=\"").concat(q.minMc || "", "\">\n              <input type=\"hidden\" id=\"maxMcInput\" name=\"maxMc\" value=\"").concat(q.maxMc || "", "\">\n            </div>\n\n            <div class=\"filter-group\">\n              <label>Sector</label>\n              <select name=\"sector\">\n                <option value=\"\">All Sectors</option>\n                ").concat(sectorOptions, "\n              </select>\n            </div>\n\n            <div class=\"filter-group\">\n              <label>Sort By</label>\n              <select name=\"sortBy\">\n                ").concat(sortOptions.map(function (_a) {
                    var k = _a[0], label = _a[1];
                    return "<option value=\"".concat(k, "\" ").concat((q.sortBy || "roce") === k ? "selected" : "", ">").concat(label, "</option>");
                }).join(""), "\n              </select>\n            </div>\n\n            <div class=\"filter-group\">\n              <label>Sort Direction</label>\n              <select name=\"sortDir\">\n                <option value=\"desc\" ").concat((q.sortDir || "desc") === "desc" ? "selected" : "", ">\u2193 High \u2192 Low</option>\n                <option value=\"asc\"  ").concat(q.sortDir === "asc" ? "selected" : "", ">\u2191 Low \u2192 High</option>\n              </select>\n            </div>\n\n            <div class=\"filter-group checkbox-group\">\n              <label class=\"check-label\"><input type=\"checkbox\" name=\"allProfit\" value=\"1\" ").concat(q.allProfit === "1" ? "checked" : "", "> \u2705 All 3yr Profitable</label>\n              <label class=\"check-label\"><input type=\"checkbox\" name=\"uptrend\"   value=\"1\" ").concat(q.uptrend === "1" ? "checked" : "", "> \uD83D\uDCC8 Profit Uptrend \u2191</label>\n            </div>\n\n          </div>\n\n          <!-- \u2500\u2500 Indicator Filters \u2500\u2500 -->\n          <div class=\"filter-section-title\">\uD83D\uDCC9 Technical Indicators &amp; Quality Metrics</div>\n          <div class=\"filter-grid\">\n\n            <div class=\"filter-group\">\n              <label>ROE % \u2265</label>\n              <select name=\"minRoe\">\n                <option value=\"\">Any</option>\n                <option value=\"5\"  ").concat(q.minRoe === "5" ? "selected" : "", ">\u2265 5%</option>\n                <option value=\"10\" ").concat(q.minRoe === "10" ? "selected" : "", ">\u2265 10%</option>\n                <option value=\"15\" ").concat(q.minRoe === "15" ? "selected" : "", ">\u2265 15%</option>\n                <option value=\"20\" ").concat(q.minRoe === "20" ? "selected" : "", ">\u2265 20%</option>\n                <option value=\"25\" ").concat(q.minRoe === "25" ? "selected" : "", ">\u2265 25%</option>\n                <option value=\"30\" ").concat(q.minRoe === "30" ? "selected" : "", ">\u2265 30%</option>\n              </select>\n            </div>\n\n            <div class=\"filter-group\">\n              <label>EPS</label>\n              <select name=\"minEps\">\n                <option value=\"\">Any</option>\n                <option value=\"0.01\" ").concat(q.minEps === "0.01" ? "selected" : "", ">Positive EPS (&gt; 0)</option>\n                <option value=\"5\"    ").concat(q.minEps === "5" ? "selected" : "", ">\u2265 5</option>\n                <option value=\"10\"   ").concat(q.minEps === "10" ? "selected" : "", ">\u2265 10</option>\n                <option value=\"20\"   ").concat(q.minEps === "20" ? "selected" : "", ">\u2265 20</option>\n                <option value=\"50\"   ").concat(q.minEps === "50" ? "selected" : "", ">\u2265 50</option>\n                <option value=\"100\"  ").concat(q.minEps === "100" ? "selected" : "", ">\u2265 100</option>\n              </select>\n            </div>\n\n            <div class=\"filter-group\">\n              <label>Current Ratio \u2265</label>\n              <select name=\"minCr\">\n                <option value=\"\">Any</option>\n                <option value=\"1\"   ").concat(q.minCr === "1" ? "selected" : "", ">\u2265 1.0 (Liquid)</option>\n                <option value=\"1.5\" ").concat(q.minCr === "1.5" ? "selected" : "", ">\u2265 1.5</option>\n                <option value=\"2\"   ").concat(q.minCr === "2" ? "selected" : "", ">\u2265 2.0 (Strong)</option>\n                <option value=\"3\"   ").concat(q.minCr === "3" ? "selected" : "", ">\u2265 3.0</option>\n              </select>\n            </div>\n\n            <div class=\"filter-group\">\n              <label>Price/Book (P/B) \u2264</label>\n              <select name=\"maxPb\">\n                <option value=\"\">Any</option>\n                <option value=\"1\"   ").concat(q.maxPb === "1" ? "selected" : "", ">\u2264 1.0 (Below Book)</option>\n                <option value=\"1.5\" ").concat(q.maxPb === "1.5" ? "selected" : "", ">\u2264 1.5</option>\n                <option value=\"2\"   ").concat(q.maxPb === "2" ? "selected" : "", ">\u2264 2.0</option>\n                <option value=\"3\"   ").concat(q.maxPb === "3" ? "selected" : "", ">\u2264 3.0</option>\n                <option value=\"5\"   ").concat(q.maxPb === "5" ? "selected" : "", ">\u2264 5.0</option>\n              </select>\n            </div>\n\n            <div class=\"filter-group\">\n              <label>Day Change %</label>\n              <div class=\"filter-range-row\">\n                <select name=\"minChg\" title=\"Min Change %\">\n                  <option value=\"\">\u2191 Min</option>\n                  <option value=\"-10\" ").concat(q.minChg === "-10" ? "selected" : "", ">&lt; -10%</option>\n                  <option value=\"-5\"  ").concat(q.minChg === "-5" ? "selected" : "", ">&gt; -5%</option>\n                  <option value=\"0\"   ").concat(q.minChg === "0" ? "selected" : "", ">Positive only</option>\n                  <option value=\"1\"   ").concat(q.minChg === "1" ? "selected" : "", ">\u2265 +1%</option>\n                  <option value=\"2\"   ").concat(q.minChg === "2" ? "selected" : "", ">\u2265 +2%</option>\n                  <option value=\"3\"   ").concat(q.minChg === "3" ? "selected" : "", ">\u2265 +3%</option>\n                  <option value=\"5\"   ").concat(q.minChg === "5" ? "selected" : "", ">\u2265 +5%</option>\n                </select>\n                <select name=\"maxChg\" title=\"Max Change %\">\n                  <option value=\"\">\u2193 Max</option>\n                  <option value=\"-5\"  ").concat(q.maxChg === "-5" ? "selected" : "", ">\u2264 -5% (Big dip)</option>\n                  <option value=\"-3\"  ").concat(q.maxChg === "-3" ? "selected" : "", ">\u2264 -3%</option>\n                  <option value=\"-1\"  ").concat(q.maxChg === "-1" ? "selected" : "", ">\u2264 -1%</option>\n                  <option value=\"0\"   ").concat(q.maxChg === "0" ? "selected" : "", ">Negative only</option>\n                  <option value=\"5\"   ").concat(q.maxChg === "5" ? "selected" : "", ">\u2264 +5%</option>\n                  <option value=\"10\"  ").concat(q.maxChg === "10" ? "selected" : "", ">\u2264 +10%</option>\n                </select>\n              </div>\n            </div>\n\n            <div class=\"filter-group\">\n              <label>Near 52W High \uD83D\uDD25</label>\n              <select name=\"near52H\">\n                <option value=\"\">Any</option>\n                <option value=\"3\"  ").concat(q.near52H === "3" ? "selected" : "", ">Within 3% (Breakout zone)</option>\n                <option value=\"5\"  ").concat(q.near52H === "5" ? "selected" : "", ">Within 5%</option>\n                <option value=\"10\" ").concat(q.near52H === "10" ? "selected" : "", ">Within 10%</option>\n                <option value=\"15\" ").concat(q.near52H === "15" ? "selected" : "", ">Within 15%</option>\n                <option value=\"20\" ").concat(q.near52H === "20" ? "selected" : "", ">Within 20%</option>\n              </select>\n            </div>\n\n            <div class=\"filter-group\">\n              <label>Near 52W Low \uD83D\uDCB0</label>\n              <select name=\"near52L\">\n                <option value=\"\">Any</option>\n                <option value=\"10\" ").concat(q.near52L === "10" ? "selected" : "", ">Within 10% (Value zone)</option>\n                <option value=\"20\" ").concat(q.near52L === "20" ? "selected" : "", ">Within 20%</option>\n                <option value=\"30\" ").concat(q.near52L === "30" ? "selected" : "", ">Within 30%</option>\n                <option value=\"50\" ").concat(q.near52L === "50" ? "selected" : "", ">Within 50%</option>\n              </select>\n            </div>\n\n          </div>\n\n          <div class=\"filter-actions\">\n            <button type=\"submit\" class=\"btn-primary\">\uD83D\uDD0D Apply Filters</button>\n            <a href=\"/\" class=\"btn-secondary\">\u2715 Reset All</a>\n          </div>\n        </form>\n      </details>\n\n      <!-- Results -->\n      <div id=\"results-section\" class=\"results-header\">\n        <span>").concat(stocks.length).concat(hasNextPage ? "+" : "", " stocks").concat(page > 1 ? " \u00B7 Page ".concat(page) : "").concat(activeStrategy ? " \u00B7 <strong>".concat(((_c = STRATEGIES.find(function (s) { return s.id === activeStrategy; })) === null || _c === void 0 ? void 0 : _c.label) || "", "</strong>") : "", "</span>\n        <span class=\"tier-pill tier-expert\">\uD83D\uDD34 Investors</span>\n        <div class=\"results-actions\">\n          <button class=\"btn-ghost\" id=\"cmp-btn\" style=\"display:none\" onclick=\"goCompare()\">\u2696\uFE0F Compare (0)</button>\n          <button class=\"btn-ghost\" onclick=\"document.getElementById('alertModal').style.display='flex'\">\uD83D\uDD14 Save Alert</button>\n          <a href=\"/api/screen/csv?").concat(new URLSearchParams(req.query).toString(), "\" class=\"btn-ghost\" download=\"zeroscreen.csv\">\u2B07 CSV</a>\n          <a href=\"/api/screen?").concat(new URLSearchParams(req.query).toString(), "\" class=\"btn-ghost\" target=\"_blank\">\u2197 JSON</a>\n        </div>\n      </div>\n\n      <div class=\"table-wrap\">\n        <table class=\"stocks-table\">\n          <thead>\n            <tr>\n              <th class=\"cmp-col\"></th>\n              <th>Symbol</th><th>Company</th>\n              <th>Price</th><th>Chg%</th><th>Volume</th>\n              <th>ROCE%</th><th>ROE%</th><th>D/E</th>\n              <th>Promoter%</th><th>P/E</th><th>Profit</th>\n            </tr>\n          </thead>\n          <tbody>").concat(rows || '<tr><td colspan="12" class="no-data">No results. Try a strategy above or adjust filters.</td></tr>', "</tbody>\n        </table>\n      </div>\n\n      <!-- Pagination -->\n      ").concat((page > 1 || hasNextPage) ? "\n      <div class=\"pagination\">\n        ".concat(page > 1 ? "<a href=\"/?".concat(prevPageQ.toString(), "#results-section\" class=\"btn-secondary page-btn\">\u2190 Prev</a>") : "<span class=\"page-btn page-disabled\">\u2190 Prev</span>", "\n        <span class=\"page-info\">Page ").concat(page, "</span>\n        ").concat(hasNextPage ? "<a href=\"/?".concat(nextPageQ.toString(), "#results-section\" class=\"btn-secondary page-btn\">Next \u2192</a>") : "<span class=\"page-btn page-disabled\">Next \u2192</span>", "\n      </div>") : "", "\n    </div>\n\n    <!-- \u2500\u2500 News sidebar \u2500\u2500 -->\n    <aside class=\"news-sidebar\">\n      <div class=\"news-card\">\n        <div class=\"news-header\">\n          <span class=\"news-title\">\uD83D\uDCF0 Market News</span>\n          <span class=\"news-live\"><span class=\"live-dot\"></span>Live</span>\n        </div>\n        <div id=\"news-list\" class=\"news-list\">\n          <div class=\"news-loading\">Loading news\u2026</div>\n        </div>\n        <div class=\"news-footer\">\n          <a href=\"https://economictimes.indiatimes.com/markets\" target=\"_blank\" rel=\"noopener\">More on ET Markets \u2192</a>\n        </div>\n      </div>\n    </aside>\n\n  </div>\n\n  <script>\n    function applyCapSize(val) {\n      const minEl = document.getElementById('minMcInput');\n      const maxEl = document.getElementById('maxMcInput');\n      if      (val === 'large') { minEl.value = '20000'; maxEl.value = ''; }\n      else if (val === 'mid')   { minEl.value = '5000';  maxEl.value = '20000'; }\n      else if (val === 'small') { minEl.value = '';       maxEl.value = '5000'; }\n      else if (val === 'micro') { minEl.value = '';       maxEl.value = '1000'; }\n      else                      { minEl.value = '';       maxEl.value = ''; }\n    }\n\n    // Scroll to results when a strategy is active\n    (function() {\n      const params = new URLSearchParams(window.location.search);\n      if (params.get('strategy')) {\n        const el = document.querySelector('.results-header');\n        if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);\n      }\n    })();\n\n    // \u2500\u2500 Live Markets \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    const MKT_ID_MAP = {\n      'NIFTY 50':'NSEI','NIFTY BANK':'NSEBANK','NIFTY FINANCIAL SERVICES':'FINNIFTY',\n      'NIFTY IT':'NIFTYIT','INDIA VIX':'INDIAVIX','NIFTY MIDCAP 100':'MIDCAP',\n      '^DJI':'DJI','^IXIC':'IXIC','^GSPC':'GSPC','^N225':'N225','^HSI':'HSI'\n    };\n    async function loadMarkets() {\n      try {\n        const r = await fetch('/api/markets');\n        const quotes = await r.json();\n        const MKT_ID_MAP = {\n          'NIFTY 50':'NSEI','NIFTY BANK':'NSEBANK','NIFTY FIN SERVICE':'FINNIFTY',\n          'NIFTY IT':'NIFTYIT','INDIA VIX':'INDIAVIX','NIFTY MIDCAP 100':'MIDCAP',\n          '^DJI':'DJI','^IXIC':'IXIC','^GSPC':'GSPC','^N225':'N225','^HSI':'HSI'\n        };\n        quotes.forEach((q) => {\n          const key = MKT_ID_MAP[q.symbol] || q.symbol.replace(/[^A-Z0-9]/gi,'');\n          const up  = (q.changePct || 0) >= 0;\n          const isGlobal = q.region === 'global';\n          const fmt = (n) => n.toLocaleString(isGlobal ? 'en-US' : 'en-IN', {maximumFractionDigits:2});\n          const newPrice = q.price != null ? fmt(q.price) : '\u2014';\n          const newChg   = q.changePct != null ? (up?'+':'') + q.changePct.toFixed(2) + '%' : '\u2014';\n          const card = document.getElementById('ic-' + key);\n          const priceEl = document.getElementById('ip-' + key);\n          const chgEl   = document.getElementById('icc-' + key);\n          if (!card) return;\n          card.classList.remove('idx-up','idx-dn');\n          if (priceEl) priceEl.textContent = newPrice;\n          if (chgEl) {\n            chgEl.textContent = newChg;\n            chgEl.className = 'idx-chg ' + (up ? 'idx-up' : 'idx-dn');\n          }\n        });\n        const ts = document.getElementById('mkt-updated');\n        if (ts) ts.textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});\n      } catch(_) {}\n    }\n    loadMarkets();\n    setInterval(loadMarkets, 30000);\n\n    async function loadNews() {\n      try {\n        const res = await fetch('/api/news');\n        const items = await res.json();\n        const el = document.getElementById('news-list');\n        if (!items.length) {\n          el.innerHTML = '<p class=\"news-empty\">No news available right now.</p>';\n          return;\n        }\n        el.innerHTML = items.map(n => `\n          <a class=\"news-item\" href=\"${n.link}\" target=\"_blank\" rel=\"noopener\">\n            <span class=\"news-item-title\">${n.title}</span>\n            <span class=\"news-item-meta\">${n.source} \u00B7 ${n.pubDate ? (d => isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}))(new Date(n.pubDate)) : ''}</span>\n          </a>`).join('');\n      } catch(_) {\n        document.getElementById('news-list').innerHTML = '<p class=\"news-empty\">Could not load news.</p>';\n      }\n    }\n    loadNews();\n    setInterval(loadNews, 5 * 60 * 1000);\n\n    // \u2500\u2500 Compare \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    let _compareList = [];\n    function updateCompare() {\n      _compareList = [...document.querySelectorAll('.cmp-check:checked')].map(c => c.value);\n      const btn = document.getElementById('cmp-btn');\n      if (btn) {\n        btn.style.display = _compareList.length >= 2 ? 'inline-block' : 'none';\n        btn.textContent = '\u2696\uFE0F Compare (' + _compareList.length + ')';\n      }\n    }\n    function goCompare() {\n      if (_compareList.length < 2) return;\n      window.location.href = '/compare?symbols=' + _compareList.join(',');\n    }\n\n    // \u2500\u2500 Save Alert \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    async function saveAlert() {\n      const name = document.getElementById('alertName').value.trim();\n      if (!name) { alert('Please name this alert'); return; }\n      const params = new URLSearchParams(window.location.search);\n      params.delete('strategy');\n      const r = await fetch('/alerts', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ name, filtersJson: JSON.stringify(Object.fromEntries(params)) })\n      });\n      if (r.ok) {\n        document.getElementById('alertModal').style.display = 'none';\n        document.getElementById('alertName').value = '';\n        alert('\u2705 Alert saved! You\\'ll get a daily email when stocks match your filters.');\n      } else { alert('Error saving alert. Please try again.'); }\n    }\n  </script>\n\n  <!-- Alert Modal -->\n  <div id=\"alertModal\" class=\"modal\" style=\"display:none\">\n    <div class=\"modal-box\">\n      <h2>\uD83D\uDD14 Save as Daily Alert</h2>\n      <p style=\"color:var(--text-muted);font-size:13px;margin-bottom:18px\">Get a daily email when stocks match your current filters.</p>\n      <input id=\"alertName\" type=\"text\" class=\"modal-input\" placeholder=\"e.g. High ROCE Value Picks\" maxlength=\"60\">\n      <div class=\"modal-actions\">\n        <button class=\"btn-primary\" onclick=\"saveAlert()\">Save Alert</button>\n        <button class=\"btn-secondary\" onclick=\"document.getElementById('alertModal').style.display='none'\">Cancel</button>\n      </div>\n    </div>\n  </div>\n\n  <footer class=\"site-footer\">\n    <span>\u00A9 2026 ZeroScreen &mdash; For informational purposes only. Not SEBI registered. Not investment advice. Past data does not guarantee future returns. Invest at your own risk.</span>\n  </footer>\n\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
// ── GET /stock/:symbol ─────────────────────────────────────────────────────────
app.get("/stock/:symbol", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, s, screenerData, netProfits, revenues, chartYears, watchlists, w52High, w52Low, pbRatio, incorporated, about, w52Pos, latestProfit, latestRevenue, profitMargin;
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    return __generator(this, function (_l) {
        switch (_l.label) {
            case 0:
                symbol = req.params.symbol.toUpperCase();
                return [4 /*yield*/, (0, db_1.getStock)(symbol)];
            case 1:
                s = _l.sent();
                if (!s) {
                    res.status(404).send("<!DOCTYPE html><html><head><title>Not Found</title>\n    <link rel=\"stylesheet\" href=\"/public/css/style.css\"></head><body>\n    ".concat(nav("", req), "<div class=\"container\"><h2>Stock \"").concat(symbol, "\" not found in database.</h2>\n    <p><a href=\"/\">Back to Screener</a></p></div></body></html>"));
                    return [2 /*return*/];
                }
                screenerData = s.screener_data ? JSON.parse(s.screener_data) : {};
                netProfits = screenerData.netProfits || [];
                revenues = screenerData.revenues || [];
                chartYears = netProfits.map(function (_, i) { return "FY".concat((new Date().getFullYear() - netProfits.length + i + 1).toString().slice(2)); });
                return [4 /*yield*/, (0, db_1.getWatchlists)(req.session.userId)];
            case 2:
                watchlists = (_l.sent());
                w52High = s.week52_high;
                w52Low = s.week52_low;
                pbRatio = (s.price && s.book_value && s.book_value > 0) ? s.price / s.book_value : null;
                incorporated = s.incorporated;
                about = s.about;
                w52Pos = (w52High && w52Low && s.price && w52High > w52Low)
                    ? Math.max(0, Math.min(100, ((s.price - w52Low) / (w52High - w52Low)) * 100))
                    : null;
                latestProfit = (_a = netProfits[netProfits.length - 1]) !== null && _a !== void 0 ? _a : null;
                latestRevenue = (_b = revenues[revenues.length - 1]) !== null && _b !== void 0 ? _b : null;
                profitMargin = (latestProfit != null && latestRevenue && latestRevenue > 0)
                    ? (latestProfit / latestRevenue) * 100 : null;
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>".concat(symbol, " \u2014 ").concat(s.company_name || "Stock", " \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n  <script src=\"https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js\"></script>\n</head>\n<body>\n  ").concat(nav("", req), "\n  <div class=\"container sdp-container\">\n    <a href=\"/\" class=\"back-link\">\u2190 Back to Screener</a>\n\n    <!-- \u2500\u2500 HERO HEADER \u2500\u2500 -->\n    <div class=\"sdp-hero\">\n      <div class=\"sdp-hero-left\">\n        <div class=\"sdp-symbol\">").concat(symbol, "</div>\n        <div class=\"sdp-company\">").concat(s.company_name || "", "</div>\n        <div class=\"sdp-badges\">\n          ").concat((s.sector && s.sector.length >= 3 && !/^\[?\d+\]?$/.test(s.sector) && !/edit|about/i.test(s.sector)) ? "<span class=\"sector-badge\">".concat(s.sector, "</span>") : "", "\n          ").concat(incorporated ? "<span class=\"sector-badge\">\uD83D\uDDD3\uFE0F Est. ".concat(incorporated, "</span>") : "", "\n          ").concat(s.all_profitable ? '<span class="sector-badge sdp-badge-green">✅ 3yr Profitable</span>' : "", "\n          ").concat(s.profit_uptrend ? '<span class="sector-badge sdp-badge-blue">📈 Profit ↑</span>' : "", "\n        </div>\n      </div>\n      <div class=\"sdp-hero-right\">\n        <div class=\"sdp-price-main\">\u20B9").concat(fmt(s.price, 2), "</div>\n        <div class=\"sdp-change\" style=\"color:").concat(changeColor(s.change_pct), "\">").concat(s.change_pct != null ? (s.change_pct >= 0 ? "▲ +" : "▼ ") + fmt(s.change_pct, 2) + "%" : "—", "</div>\n        <div class=\"sdp-ohlc\">\n          <span>O \u20B9").concat(fmt(s.prev_close, 2), "</span>\n          <span>H \u20B9").concat(fmt(s.day_high, 2), "</span>\n          <span>L \u20B9").concat(fmt(s.day_low, 2), "</span>\n          <span>Vol ").concat(fmtVol(s.volume), "</span>\n        </div>\n        ").concat(w52Pos !== null ? "\n        <div class=\"sdp-52w-wrap\">\n          <div class=\"sdp-52w-labels\"><span>\u20B9".concat(fmt(w52Low, 0), " 52W L</span><span>52W H \u20B9").concat(fmt(w52High, 0), "</span></div>\n          <div class=\"sdp-52w-bar\"><div class=\"sdp-52w-fill\" style=\"width:").concat(w52Pos.toFixed(1), "%\"></div><div class=\"sdp-52w-dot\" style=\"left:").concat(w52Pos.toFixed(1), "%\"></div></div>\n        </div>") : "", "\n      </div>\n    </div>\n\n    <!-- \u2500\u2500 KPI HERO CARDS \u2500\u2500 -->\n    <div class=\"sdp-kpi-grid\">\n      <div class=\"sdp-kpi-card sdp-kpi-accent\">\n        <div class=\"sdp-kpi-label\">Market Cap</div>\n        <div class=\"sdp-kpi-big\">").concat(fmtCr(s.market_cap), "</div>\n      </div>\n      <div class=\"sdp-kpi-card\">\n        <div class=\"sdp-kpi-label\">ROCE</div>\n        <div class=\"sdp-kpi-big\" style=\"color:").concat(roceColor(s.roce), "\">").concat(fmt(s.roce, 1), "%</div>\n      </div>\n      <div class=\"sdp-kpi-card\">\n        <div class=\"sdp-kpi-label\">ROE</div>\n        <div class=\"sdp-kpi-big\" style=\"color:").concat(roceColor(s.roe), "\">").concat(fmt(s.roe, 1), "%</div>\n      </div>\n      <div class=\"sdp-kpi-card\">\n        <div class=\"sdp-kpi-label\">D/E Ratio</div>\n        <div class=\"sdp-kpi-big\" style=\"color:").concat(deColor(s.de_ratio), "\">").concat(s.de_ratio === 0 ? "0 💎" : fmt(s.de_ratio), "</div>\n      </div>\n      <div class=\"sdp-kpi-card\">\n        <div class=\"sdp-kpi-label\">P/E Ratio</div>\n        <div class=\"sdp-kpi-big\">").concat(fmt(s.pe_ratio, 1), "</div>\n      </div>\n      <div class=\"sdp-kpi-card\">\n        <div class=\"sdp-kpi-label\">EPS</div>\n        <div class=\"sdp-kpi-big\">\u20B9").concat(fmt(s.eps, 1), "</div>\n      </div>\n      <div class=\"sdp-kpi-card\">\n        <div class=\"sdp-kpi-label\">Book Value</div>\n        <div class=\"sdp-kpi-big\">\u20B9").concat(fmt(s.book_value, 0), "</div>\n      </div>\n      <div class=\"sdp-kpi-card\">\n        <div class=\"sdp-kpi-label\">Div. Yield</div>\n        <div class=\"sdp-kpi-big\">").concat(fmt(s.dividend_yield), "%</div>\n      </div>\n    </div>\n\n    <!-- \u2500\u2500 TRADINGVIEW LIVE CHART \u2500\u2500 -->\n    <div class=\"sdp-section-title\">\uD83D\uDCCA Live Price Chart</div>\n    <div class=\"sdp-tv-wrap\" id=\"sdp-tv-outer-").concat(symbol, "\">\n      <iframe id=\"tv-iframe-").concat(symbol, "\"\n        src=\"https://s.tradingview.com/widgetembed/?frameElementId=tv-iframe-").concat(symbol, "&symbol=NSE%3A").concat(symbol, "&interval=D&range=1Y&withdateranges=1&hidesidetoolbar=0&symboledit=0&saveimage=0&toolbarbg=f1f3f6&studies=[]&theme=light&style=1&timezone=Asia%2FKolkata&locale=in\"\n        style=\"width:100%;height:550px;border:none;display:block\"\n        allowtransparency=\"true\" scrolling=\"no\" allowfullscreen>\n      </iframe>\n    </div>\n    <script>\n    (function(){\n      // Switch to dark theme iframe if dark mode active\n      if (document.documentElement.classList.contains('dark')) {\n        var ifr = document.getElementById('tv-iframe-").concat(symbol, "');\n        if (ifr) ifr.src = ifr.src.replace('theme=light','theme=dark');\n      }\n    })();\n    </script>\n\n    <!-- \u2500\u2500 CHARTS ROW 1: Profit + Revenue \u2500\u2500 -->\n    ").concat(netProfits.length >= 2 ? "\n    <div class=\"sdp-section-title\">\uD83D\uDCC8 Financial Performance</div>\n    <div class=\"sdp-charts-grid\">\n      <div class=\"sdp-chart-card sdp-chart-wide\">\n        <div class=\"sdp-chart-header\">\n          <span class=\"sdp-chart-title\">Net Profit (\u20B9 Cr)</span>\n          ".concat(latestProfit != null ? "<span class=\"sdp-chart-badge\" style=\"color:".concat(latestProfit >= 0 ? '#059669' : '#dc2626', "\">").concat(latestProfit >= 0 ? '▲' : '▼', " \u20B9").concat(fmtCr(latestProfit), "</span>") : "", "\n        </div>\n        <div class=\"sdp-chart-wrap\" style=\"height:220px\"><canvas id=\"profitChart\"></canvas></div>\n      </div>\n      ").concat(revenues.length >= 2 ? "\n      <div class=\"sdp-chart-card sdp-chart-wide\">\n        <div class=\"sdp-chart-header\">\n          <span class=\"sdp-chart-title\">Revenue / Sales (\u20B9 Cr)</span>\n          ".concat(latestRevenue != null ? "<span class=\"sdp-chart-badge\" style=\"color:#2563eb\">\u20B9".concat(fmtCr(latestRevenue), "</span>") : "", "\n        </div>\n        <div class=\"sdp-chart-wrap\" style=\"height:220px\"><canvas id=\"revenueChart\"></canvas></div>\n      </div>") : "", "\n    </div>") : "", "\n\n    <!-- \u2500\u2500 CHARTS ROW 2: Profit Margin bar + ROCE/ROE/Promoter doughnuts \u2500\u2500 -->\n    <div class=\"sdp-section-title\">\uD83E\uDDEE Key Ratios at a Glance</div>\n    <div class=\"sdp-charts-grid sdp-charts-quad\">\n      <div class=\"sdp-chart-card\">\n        <div class=\"sdp-chart-header\"><span class=\"sdp-chart-title\">ROCE vs ROE</span></div>\n        <div class=\"sdp-chart-wrap\" style=\"height:180px\"><canvas id=\"roceRoeChart\"></canvas></div>\n      </div>\n      <div class=\"sdp-chart-card\">\n        <div class=\"sdp-chart-header\"><span class=\"sdp-chart-title\">Promoter Holding</span></div>\n        <div class=\"sdp-chart-wrap\" style=\"height:180px\"><canvas id=\"promoterChart\"></canvas></div>\n        <div class=\"sdp-chart-center-label\">").concat(fmt(s.promoter_pct, 1), "%</div>\n      </div>\n      <div class=\"sdp-chart-card\">\n        <div class=\"sdp-chart-header\"><span class=\"sdp-chart-title\">Valuation (P/E vs P/B)</span></div>\n        <div class=\"sdp-chart-wrap\" style=\"height:180px\"><canvas id=\"valuationChart\"></canvas></div>\n      </div>\n      ").concat(netProfits.length >= 3 ? "\n      <div class=\"sdp-chart-card\">\n        <div class=\"sdp-chart-header\"><span class=\"sdp-chart-title\">Profit Margin %</span></div>\n        <div class=\"sdp-chart-wrap\" style=\"height:180px\"><canvas id=\"marginChart\"></canvas></div>\n      </div>" : "", "\n    </div>\n\n    <!-- \u2500\u2500 DETAILED METRICS TABLE \u2500\u2500 -->\n    <div class=\"sdp-section-title\">\uD83D\uDCCB All Metrics</div>\n    <div class=\"sdp-metrics-table-wrap\">\n      <table class=\"sdp-metrics-table\">\n        <tbody>\n          <tr><td>P/E Ratio</td><td>").concat(fmt(s.pe_ratio, 1), "</td><td>Current Ratio</td><td>").concat(fmt(s.current_ratio, 2), "</td></tr>\n          <tr><td>P/B Ratio</td><td>").concat(fmt(pbRatio, 2), "</td><td>Book Value</td><td>\u20B9").concat(fmt(s.book_value, 1), "</td></tr>\n          <tr><td>EPS</td><td>\u20B9").concat(fmt(s.eps, 2), "</td><td>Dividend Yield</td><td>").concat(fmt(s.dividend_yield), "%</td></tr>\n          <tr><td>ROCE</td><td style=\"color:").concat(roceColor(s.roce), "\">").concat(fmt(s.roce), "%</td><td>ROE</td><td style=\"color:").concat(roceColor(s.roe), "\">").concat(fmt(s.roe), "%</td></tr>\n          <tr><td>D/E Ratio</td><td style=\"color:").concat(deColor(s.de_ratio), "\">").concat(s.de_ratio === 0 ? "Debt-free 💎" : fmt(s.de_ratio), "</td><td>Promoter %</td><td>").concat(fmt(s.promoter_pct), "%</td></tr>\n          <tr><td>Market Cap</td><td>").concat(fmtCr(s.market_cap), "</td><td>Volume</td><td>").concat(fmtVol(s.volume), "</td></tr>\n          ").concat(w52High || w52Low ? "<tr><td>52W High</td><td>\u20B9".concat(fmt(w52High, 2), "</td><td>52W Low</td><td>\u20B9").concat(fmt(w52Low, 2), "</td></tr>") : "", "\n          ").concat(profitMargin != null ? "<tr><td>Profit Margin</td><td style=\"color:".concat(profitMargin >= 0 ? '#059669' : '#dc2626', "\">").concat(fmt(profitMargin, 1), "%</td><td>3yr Profitable</td><td>").concat(s.all_profitable ? "✅ Yes" : "❌ No", "</td></tr>") : "", "\n        </tbody>\n      </table>\n    </div>\n\n    <!-- \u2500\u2500 ACTIONS \u2500\u2500 -->\n    <div class=\"stock-actions\" style=\"margin-top:20px\">\n      <button class=\"btn-primary\" onclick=\"refreshStock('").concat(symbol, "')\">\uD83D\uDD04 Refresh Data</button>\n      <a href=\"/my-paper-trade?buy=").concat(symbol, "\" class=\"btn-primary\" style=\"background:#10b981;border-color:#10b981\">\uD83D\uDCCB Paper Trade</a>\n      <a href=\"https://www.screener.in/company/").concat(symbol, "/\" target=\"_blank\" class=\"btn-secondary\">screener.in \u2197</a>\n      <a href=\"https://www.nseindia.com/get-quotes/equity?symbol=").concat(symbol, "\" target=\"_blank\" class=\"btn-ghost\">NSE \u2197</a>\n      <div class=\"watchlist-add\">\n        <select id=\"wlSelect\">\n          <option value=\"\">Add to watchlist\u2026</option>\n          ").concat(watchlists.map(function (w) { return "<option value=\"".concat(w.id, "\">").concat(w.name, "</option>"); }).join(""), "\n        </select>\n        <button class=\"btn-ghost\" onclick=\"addToWatchlist('").concat(symbol, "')\">+ Add</button>\n      </div>\n    </div>\n\n    <!-- \u2500\u2500 ABOUT \u2500\u2500 -->\n    ").concat(about ? "\n    <div class=\"sdp-section-title\">\uD83C\uDFE2 About the Company</div>\n    <div class=\"about-card\">\n      <div class=\"about-meta\">\n        <span class=\"about-badge\">\uD83D\uDCCD ".concat(s.sector || "—", "</span>\n        ").concat(incorporated ? "<span class=\"about-badge\">\uD83D\uDDD3\uFE0F Est. ".concat(incorporated, "</span>") : "", "\n        <span class=\"about-badge\">\uD83D\uDCC8 NSE: ").concat(symbol, "</span>\n        ").concat(s.market_cap ? "<span class=\"about-badge\">\uD83D\uDCB0 MCap ".concat(fmtCr(s.market_cap), "</span>") : "", "\n      </div>\n      <p class=\"about-text\">").concat(esc(about), "</p>\n      <a href=\"https://www.screener.in/company/").concat(symbol, "/\" target=\"_blank\" rel=\"noopener\" class=\"about-link\">Read more on screener.in \u2197</a>\n    </div>") : "", "\n\n    <!-- \u2500\u2500 NEWS \u2500\u2500 -->\n    <div class=\"sdp-section-title\">\uD83D\uDCF0 News about ").concat(symbol, "</div>\n    <div id=\"stock-news-wrap\" class=\"stock-news-wrap\">\n      <div class=\"news-loading\">Loading news\u2026</div>\n    </div>\n\n    <div class=\"fetched-info\">Fundamentals fetched: ").concat(s.fetched_at ? new Date(s.fetched_at).toLocaleString("en-IN") : "Never", "</div>\n  </div>\n\n  <footer class=\"site-footer\">\n    <span>\u00A9 2026 ZeroScreen &mdash; For informational purposes only. Not SEBI registered. Not investment advice. Past data does not guarantee future returns. Invest at your own risk.</span>\n  </footer>\n\n  <script>\n  (function() {\n    const dark = document.documentElement.classList.contains('dark');\n    const gc = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';\n    const tc = dark ? '#8899aa' : '#888';\n    const baseOpts = {\n      responsive: true, maintainAspectRatio: false,\n      plugins: { legend: { display: false } },\n      scales: { y: { grid:{color:gc}, ticks:{color:tc,font:{size:11}} }, x: { grid:{display:false}, ticks:{color:tc,font:{size:11}} } }\n    };\n\n    // \u2500\u2500 Profit bar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    ").concat(netProfits.length >= 2 ? "\n    new Chart(document.getElementById('profitChart'), {\n      type: 'bar',\n      data: { labels: ".concat(JSON.stringify(chartYears), ",\n        datasets: [{ data: ").concat(JSON.stringify(netProfits), ",\n          backgroundColor: ").concat(JSON.stringify(netProfits), ".map(v => v>=0 ? 'rgba(5,150,105,0.8)' : 'rgba(220,38,38,0.8)'),\n          borderRadius: 6, borderSkipped: false }] },\n      options: { ...baseOpts }\n    });") : "", "\n\n    // \u2500\u2500 Revenue line \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    ").concat(revenues.length >= 2 ? "\n    new Chart(document.getElementById('revenueChart'), {\n      type: 'line',\n      data: { labels: ".concat(JSON.stringify(chartYears), ",\n        datasets: [{ data: ").concat(JSON.stringify(revenues), ",\n          borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.12)',\n          fill: true, tension: 0.4, pointRadius: 5, pointBackgroundColor: '#2563eb',\n          pointBorderColor: '#fff', pointBorderWidth: 2 }] },\n      options: { ...baseOpts }\n    });") : "", "\n\n    // \u2500\u2500 ROCE / ROE grouped bar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    ").concat((s.roce != null || s.roe != null) ? "\n    new Chart(document.getElementById('roceRoeChart'), {\n      type: 'bar',\n      data: { labels: ['ROCE', 'ROE'],\n        datasets: [{ data: [".concat((_c = s.roce) !== null && _c !== void 0 ? _c : null, ", ").concat((_d = s.roe) !== null && _d !== void 0 ? _d : null, "],\n          backgroundColor: ['rgba(16,185,129,0.8)', 'rgba(99,102,241,0.8)'],\n          borderRadius: 8, borderSkipped: false }] },\n      options: { ...baseOpts, plugins: { legend:{display:false} },\n        scales: { y: { ...baseOpts.scales.y, max: Math.max(").concat(Math.ceil(Math.max((_e = s.roce) !== null && _e !== void 0 ? _e : 0, (_f = s.roe) !== null && _f !== void 0 ? _f : 0) * 1.4) + 5, ", 30) },\n                  x: baseOpts.scales.x } }\n    });") : "", "\n\n    // \u2500\u2500 Promoter doughnut \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    ").concat(s.promoter_pct != null ? "\n    new Chart(document.getElementById('promoterChart'), {\n      type: 'doughnut',\n      data: { labels: ['Promoter', 'Public'],\n        datasets: [{ data: [".concat((_g = s.promoter_pct) !== null && _g !== void 0 ? _g : null, ", ").concat(s.promoter_pct != null ? +(100 - s.promoter_pct).toFixed(1) : null, "],\n          backgroundColor: ['rgba(99,102,241,0.85)','rgba(200,200,220,0.25)'],\n          borderWidth: 0, cutout: '72%' }] },\n      options: { responsive:true, maintainAspectRatio:false,\n        plugins: { legend: { display:true, position:'bottom',\n          labels:{ color:tc, font:{size:11}, boxWidth:12, padding:8 } } } }\n    });") : "", "\n\n    // \u2500\u2500 Valuation radar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    ").concat((s.pe_ratio != null || pbRatio != null || s.current_ratio != null) ? "\n    new Chart(document.getElementById('valuationChart'), {\n      type: 'bar',\n      data: { labels: ['P/E', 'P/B', 'Curr.Ratio', 'Div.Yld'],\n        datasets: [{ data: [".concat((_h = s.pe_ratio) !== null && _h !== void 0 ? _h : null, ", ").concat(pbRatio !== null && pbRatio !== void 0 ? pbRatio : null, ", ").concat((_j = s.current_ratio) !== null && _j !== void 0 ? _j : null, ", ").concat((_k = s.dividend_yield) !== null && _k !== void 0 ? _k : null, "],\n          backgroundColor: ['rgba(245,158,11,0.8)','rgba(16,185,129,0.8)','rgba(14,165,233,0.8)','rgba(168,85,247,0.8)'],\n          borderRadius: 8, borderSkipped: false }] },\n      options: { ...baseOpts, indexAxis: 'y',\n        scales: { x: { grid:{color:gc}, ticks:{color:tc,font:{size:11}} },\n                  y: { grid:{display:false}, ticks:{color:tc,font:{size:11}} } } }\n    });") : "", "\n\n    // \u2500\u2500 Profit margin % line \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    ").concat((netProfits.length >= 3 && revenues.length >= 3) ? "\n    (function() {\n      const np = ".concat(JSON.stringify(netProfits), ";\n      const rv = ").concat(JSON.stringify(revenues), ";\n      const margins = np.map((p,i) => rv[i]>0 ? parseFloat((p/rv[i]*100).toFixed(1)) : 0);\n      new Chart(document.getElementById('marginChart'), {\n        type: 'line',\n        data: { labels: ").concat(JSON.stringify(chartYears), ",\n          datasets: [{ data: margins,\n            borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)',\n            fill: true, tension: 0.4, pointRadius: 5, pointBackgroundColor: '#f59e0b',\n            pointBorderColor: '#fff', pointBorderWidth: 2 }] },\n        options: { ...baseOpts,\n          plugins: { legend:{display:false},\n            tooltip: { callbacks: { label: ctx => ctx.raw + '%' } } },\n          scales: { y: { ...baseOpts.scales.y, ticks: { ...baseOpts.scales.y.ticks, callback: v => v+'%' } },\n                    x: baseOpts.scales.x } }\n      });\n    })();") : "", "\n\n    async function refreshStock(sym) {\n      const btn = event.target; btn.disabled=true; btn.textContent='Refreshing\u2026';\n      const r = await fetch('/api/refresh/stock/'+sym, {method:'POST'});\n      if(r.ok){ location.reload(); } else { btn.textContent='Error'; btn.disabled=false; }\n    }\n    async function addToWatchlist(sym) {\n      const id = document.getElementById('wlSelect').value;\n      if(!id){ alert('Select a watchlist first'); return; }\n      const r = await fetch('/watchlists/'+id+'/add',\n        {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:sym})});\n      if(r.ok){ alert('Added! \u2705'); } else { alert('Error'); }\n    }\n\n    async function loadStockNews() {\n      const wrap = document.getElementById('stock-news-wrap');\n      try {\n        const r = await fetch('/api/news/").concat(symbol, "');\n        const items = await r.json();\n        if(!items.length){ wrap.innerHTML='<p class=\"news-empty\">No recent news found.</p>'; return; }\n        const order=['Today','Yesterday','Last 7 Days','Older'], groups={};\n        items.forEach(n=>{ if(!groups[n.period]) groups[n.period]=[]; groups[n.period].push(n); });\n        let html='';\n        order.forEach(period=>{\n          if(!groups[period]) return;\n          html+='<div class=\"snews-period\">'+period+'</div>';\n          html+=groups[period].map(n=>{\n            const d=n.pubDate?new Date(n.pubDate):null;\n            const ds=d?d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})+' '+d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'';\n            return '<a class=\"snews-item\" href=\"'+n.link+'\" target=\"_blank\" rel=\"noopener\">'\n              +'<span class=\"snews-title\">'+n.title+'</span>'\n              +'<span class=\"snews-meta\">'+(n.source||'Google News')+(ds?' &middot; '+ds:'')+'</span>'\n              +'</a>';\n          }).join('');\n        });\n        wrap.innerHTML=html;\n      } catch(_){ wrap.innerHTML='<p class=\"news-empty\">Could not load news.</p>'; }\n    }\n    loadStockNews();\n  })();\n  </script>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
// ── GET /watchlists ────────────────────────────────────────────────────────────
app.get("/watchlists", requireAuth, featureGate("feature_watchlists", "Watchlists"), premiumGate("watchlists_premium_only", "Watchlists"), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var lists, cards;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, db_1.getWatchlists)()];
            case 1:
                lists = (_a.sent());
                cards = lists.map(function (w) { return "\n    <div class=\"wl-card\">\n      <a href=\"/watchlists/".concat(w.id, "\" class=\"wl-name\">").concat(w.name, "</a>\n      <span class=\"wl-count\">").concat(w.stock_count, " stocks</span>\n      <p class=\"wl-desc\">").concat(w.description || "", "</p>\n      <div class=\"wl-actions\">\n        <a href=\"/watchlists/").concat(w.id, "\" class=\"btn-primary\">View</a>\n        <button class=\"btn-danger\" onclick=\"deleteWl(").concat(w.id, ")\">Delete</button>\n      </div>\n    </div>"); }).join("");
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Watchlists \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body>\n  ".concat(nav("watchlists", req), "\n  <div class=\"container\">\n    <div class=\"page-header\">\n      <h1>\u2B50 Watchlists</h1>\n      <button class=\"btn-primary\" onclick=\"document.getElementById('createModal').style.display='flex'\">+ New Watchlist</button>\n    </div>\n    <div class=\"wl-grid\">").concat(cards || '<p class="no-data">No watchlists yet. Create one!</p>', "</div>\n\n    <div id=\"createModal\" class=\"modal\" style=\"display:none\">\n      <div class=\"modal-box\">\n        <h2>Create Watchlist</h2>\n        <input id=\"wlName\" type=\"text\" placeholder=\"Name\" class=\"modal-input\">\n        <textarea id=\"wlDesc\" placeholder=\"Description (optional)\" class=\"modal-input\"></textarea>\n        <div class=\"modal-actions\">\n          <button class=\"btn-primary\" onclick=\"createWl()\">Create</button>\n          <button class=\"btn-secondary\" onclick=\"document.getElementById('createModal').style.display='none'\">Cancel</button>\n        </div>\n      </div>\n    </div>\n  </div>\n  <script>\n    async function createWl() {\n      const name = document.getElementById('wlName').value.trim();\n      if (!name) { alert('Name required'); return; }\n      const r = await fetch('/watchlists', {\n        method: 'POST', headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ name, description: document.getElementById('wlDesc').value })\n      });\n      if (r.ok) location.reload(); else alert('Error creating watchlist');\n    }\n    async function deleteWl(id) {\n      if (!confirm('Delete this watchlist?')) return;\n      const r = await fetch('/watchlists/' + id, { method: 'DELETE' });\n      if (r.ok) location.reload(); else alert('Error');\n    }\n  </script>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
// ── GET /watchlists/:id ────────────────────────────────────────────────────────
app.get("/watchlists/:id", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var wl, rows;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, db_1.getWatchlist)(parseInt(req.params.id, 10), req.session.userId)];
            case 1:
                wl = (_a.sent());
                if (!wl) {
                    res.status(404).send("Watchlist not found");
                    return [2 /*return*/];
                }
                rows = wl.stocks.map(function (s) { return "\n    <tr>\n      <td><a href=\"/stock/".concat(s.symbol, "\" class=\"sym-link\">").concat(s.symbol, "</a></td>\n      <td>\u20B9").concat(fmt(s.price, 2), "</td>\n      <td style=\"color:").concat(roceColor(s.roce), "\">").concat(fmt(s.roce), "%</td>\n      <td style=\"color:").concat(deColor(s.de_ratio), "\">").concat(fmt(s.de_ratio), "</td>\n      <td>").concat(fmt(s.promoter_pct), "%</td>\n      <td>").concat(fmt(s.pe_ratio, 1), "</td>\n      <td>").concat(fmtVol(s.volume), "</td>\n      <td>").concat(s.notes || "", "</td>\n      <td><button class=\"btn-danger-sm\" onclick=\"removeStock(").concat(wl.id, ", '").concat(s.symbol, "')\">\u2715</button></td>\n    </tr>"); }).join("");
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>".concat(wl.name, " \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body>\n  ").concat(nav("watchlists", req), "\n  <div class=\"container\">\n    <div class=\"page-header\">\n      <div>\n        <a href=\"/watchlists\" class=\"back-link\">\u2190 Watchlists</a>\n        <h1>\u2B50 ").concat(wl.name, "</h1>\n        <p class=\"wl-desc\">").concat(wl.description || "", "</p>\n      </div>\n    </div>\n    <div class=\"table-wrap\">\n      <table class=\"stocks-table\">\n        <thead>\n          <tr><th>Symbol</th><th>Price</th><th>ROCE%</th><th>D/E</th><th>Promoter%</th><th>P/E</th><th>Volume</th><th>Notes</th><th></th></tr>\n        </thead>\n        <tbody>").concat(rows || '<tr><td colspan="9" class="no-data">No stocks yet. Add from any stock page.</td></tr>', "</tbody>\n      </table>\n    </div>\n  </div>\n  <script>\n    async function removeStock(wlId, sym) {\n      if (!confirm('Remove ' + sym + '?')) return;\n      const r = await fetch('/watchlists/' + wlId + '/remove', {\n        method: 'POST', headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ symbol: sym })\n      });\n      if (r.ok) location.reload(); else alert('Error');\n    }\n  </script>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
// ── Watchlist API routes ───────────────────────────────────────────────────────
app.post("/watchlists", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, name, description, id;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, name = _a.name, description = _a.description;
                if (!name) {
                    res.status(400).json({ error: "name required" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.createWatchlist)(name, description || "", req.session.userId)];
            case 1:
                id = _b.sent();
                res.json({ id: id });
                return [2 /*return*/];
        }
    });
}); });
app.post("/watchlists/:id/add", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, symbol, notes;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, symbol = _a.symbol, notes = _a.notes;
                if (!symbol) {
                    res.status(400).json({ error: "symbol required" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.addToWatchlist)(parseInt(req.params.id, 10), symbol, notes || "")];
            case 1:
                _b.sent();
                res.json({ ok: true });
                return [2 /*return*/];
        }
    });
}); });
app.post("/watchlists/:id/remove", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                symbol = req.body.symbol;
                if (!symbol) {
                    res.status(400).json({ error: "symbol required" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.removeFromWatchlist)(parseInt(req.params.id, 10), symbol)];
            case 1:
                _a.sent();
                res.json({ ok: true });
                return [2 /*return*/];
        }
    });
}); });
app.delete("/watchlists/:id", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, db_1.deleteWatchlist)(parseInt(req.params.id, 10))];
            case 1:
                _a.sent();
                res.json({ ok: true });
                return [2 /*return*/];
        }
    });
}); });
// ── Admin routes ───────────────────────────────────────────────────────────────
// ── GET /admin ─────────────────────────────────────────────────────────────────
app.get("/admin", requireAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var users, today, todaySignups, activePicks, _a, pvToday, pvTotal, uvToday, botStatus, botActive;
    var _b, _c, _d, _e, _f, _g;
    return __generator(this, function (_h) {
        switch (_h.label) {
            case 0: return [4 /*yield*/, (0, db_1.getAllUsers)()];
            case 1:
                users = _h.sent();
                today = new Date().toISOString().slice(0, 10);
                todaySignups = users.filter(function (u) { var _a; return ((_a = u.created_at) === null || _a === void 0 ? void 0 : _a.slice(0, 10)) === today; }).length;
                return [4 /*yield*/, (0, db_1.getActivePicks)()];
            case 2:
                activePicks = _h.sent();
                return [4 /*yield*/, Promise.all([
                        (0, db_1.dbAll)("SELECT COUNT(*) as c FROM page_views WHERE date(created_at) = date('now','localtime')"),
                        (0, db_1.dbAll)("SELECT COUNT(*) as c FROM page_views"),
                        (0, db_1.dbAll)("SELECT COUNT(DISTINCT ip_hash) as c FROM page_views WHERE date(created_at) = date('now','localtime')"),
                    ])];
            case 3:
                _a = _h.sent(), pvToday = _a[0], pvTotal = _a[1], uvToday = _a[2];
                botStatus = (function () {
                    try {
                        return JSON.parse(require("fs").readFileSync("".concat(BOT_DIR, "/trade-state.json"), "utf-8"));
                    }
                    catch (_a) {
                        return {};
                    }
                })();
                botActive = !!(botStatus.position && botStatus.position !== "FLAT");
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Admin Overview \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body>\n  ".concat(nav("admin", req), "\n  <div class=\"container\">\n    <div class=\"admin-header\">\n      <div>\n        <h1>\uD83E\uDDE0 Admin Overview</h1>\n        <p class=\"page-sub\">ZeroScreen platform at a glance</p>\n      </div>\n    </div>\n\n    <div class=\"admin-stats-row\">\n      <div class=\"admin-stat-card\">\n        <div class=\"admin-stat-num\">").concat(users.length, "</div>\n        <div class=\"admin-stat-label\">Total Users</div>\n      </div>\n      <div class=\"admin-stat-card\">\n        <div class=\"admin-stat-num green\">").concat(todaySignups, "</div>\n        <div class=\"admin-stat-label\">New Today</div>\n      </div>\n      <div class=\"admin-stat-card\">\n        <div class=\"admin-stat-num\">").concat((_c = (_b = pvToday[0]) === null || _b === void 0 ? void 0 : _b.c) !== null && _c !== void 0 ? _c : 0, "</div>\n        <div class=\"admin-stat-label\">Page Views Today</div>\n      </div>\n      <div class=\"admin-stat-card\">\n        <div class=\"admin-stat-num\">").concat((_e = (_d = uvToday[0]) === null || _d === void 0 ? void 0 : _d.c) !== null && _e !== void 0 ? _e : 0, "</div>\n        <div class=\"admin-stat-label\">Unique Visitors Today</div>\n      </div>\n      <div class=\"admin-stat-card\">\n        <div class=\"admin-stat-num\">").concat((_g = (_f = pvTotal[0]) === null || _f === void 0 ? void 0 : _f.c) !== null && _g !== void 0 ? _g : 0, "</div>\n        <div class=\"admin-stat-label\">Total Page Views</div>\n      </div>\n      <div class=\"admin-stat-card\">\n        <div class=\"admin-stat-num\">").concat(activePicks.length, "</div>\n        <div class=\"admin-stat-label\">Active Picks</div>\n      </div>\n    </div>\n\n    <div class=\"admin-quick-grid\">\n      <div class=\"admin-quick-card\">\n        <h3>\uD83E\uDD16 Bot Status</h3>\n        <p>Position: <strong class=\"").concat(botActive ? "sig-green" : "text-dim", "\">").concat(botActive ? "● " + (botStatus.direction || "ACTIVE") : "💤 FLAT", "</strong></p>\n        <p>Strategy: <strong>").concat(botStatus.strategy || botStatus.type || "—", "</strong></p>\n        <a href=\"/admin/signals\" class=\"btn-secondary\" style=\"margin-top:8px\">\u2699\uFE0F Signal Control</a>\n      </div>\n      <div class=\"admin-quick-card\">\n        <h3>\uD83D\uDD25 Today's Picks</h3>\n        <p>").concat(activePicks.length > 0 ? activePicks.slice(0, 3).map(function (p) { return "<span class=\"pick-badge-".concat(p.direction.toLowerCase(), "\">").concat(p.direction, "</span> ").concat(p.stock_symbol); }).join(" · ") : "No active picks", "</p>\n        <a href=\"/admin/picks\" class=\"btn-secondary\" style=\"margin-top:8px\">\uD83D\uDEE0 Manage Picks</a>\n      </div>\n      <div class=\"admin-quick-card\">\n        <h3>\uD83D\uDD17 Quick Links</h3>\n        <div style=\"display:flex;flex-direction:column;gap:8px;margin-top:8px\">\n          <a href=\"/admin/users\" class=\"btn-secondary\">\uD83D\uDC65 Users</a>\n          <a href=\"/admin/analytics\" class=\"btn-secondary\">\uD83D\uDCCA Analytics</a>\n          <a href=\"/admin/content\" class=\"btn-secondary\">\uD83D\uDCE2 Content</a>\n          <a href=\"/admin/settings\" class=\"btn-secondary\">\u2699\uFE0F Settings</a>\n        </div>\n      </div>\n    </div>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
app.get("/admin/users", requireAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var users, total, admins, today, todayCount, rows;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, db_1.getAllUsers)()];
            case 1:
                users = _a.sent();
                total = users.length;
                admins = users.filter(function (u) { return u.role === "admin"; }).length;
                today = new Date().toISOString().slice(0, 10);
                todayCount = users.filter(function (u) { var _a; return ((_a = u.created_at) === null || _a === void 0 ? void 0 : _a.slice(0, 10)) === today; }).length;
                rows = users.map(function (u, i) { return "\n    <tr>\n      <td class=\"admin-num\">".concat(i + 1, "</td>\n      <td>\n        <div class=\"admin-user-cell\">\n          <span class=\"admin-avatar\">").concat(u.name.charAt(0).toUpperCase(), "</span>\n          <span>").concat(u.name, "</span>\n        </div>\n      </td>\n      <td>").concat(u.email, "</td>\n      <td><span class=\"role-badge role-").concat(u.role, "\">").concat(u.role, "</span></td>\n      <td>").concat(new Date(u.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }), "</td>\n      <td>\n        ").concat(u.role !== "admin"
                    ? "<form method=\"POST\" action=\"/admin/users/".concat(u.id, "/make-admin\" style=\"display:inline\">\n               <button class=\"btn-admin-action\" onclick=\"return confirm('Make ").concat(u.name, " an admin?')\">Make Admin</button>\n             </form>")
                    : "<span class=\"text-dim\">\u2014</span>", "\n      </td>\n    </tr>"); }).join("");
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Users \u2014 ZeroScreen Admin</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body>\n  ".concat(nav("admin-users", req), "\n  <div class=\"container\">\n    <div class=\"admin-header\">\n      <div>\n        <h1>\uD83D\uDC65 User Management</h1>\n        <p class=\"page-sub\">All registered users on ZeroScreen</p>\n      </div>\n      <div style=\"display:flex;gap:10px;flex-wrap:wrap\">\n        <a href=\"/admin\" class=\"btn-secondary\">\uD83E\uDDE0 Overview</a>\n        <a href=\"/admin/analytics\" class=\"btn-secondary\">\uD83D\uDCC8 Analytics</a>\n        <a href=\"/admin/data\" class=\"btn-secondary\">\uD83D\uDCCA Data Control</a>\n        <a href=\"/admin/settings\" class=\"btn-secondary\">\u2699\uFE0F Settings</a>\n      </div>\n    </div>\n\n    <div class=\"admin-stats-row\">\n      <div class=\"admin-stat-card\">\n        <div class=\"admin-stat-num\">").concat(total, "</div>\n        <div class=\"admin-stat-label\">Total Users</div>\n      </div>\n      <div class=\"admin-stat-card\">\n        <div class=\"admin-stat-num\">").concat(admins, "</div>\n        <div class=\"admin-stat-label\">Admins</div>\n      </div>\n      <div class=\"admin-stat-card\">\n        <div class=\"admin-stat-num green\">").concat(todayCount, "</div>\n        <div class=\"admin-stat-label\">Joined Today</div>\n      </div>\n      <div class=\"admin-stat-card\">\n        <div class=\"admin-stat-num\">").concat(total - admins, "</div>\n        <div class=\"admin-stat-label\">Regular Users</div>\n      </div>\n    </div>\n\n    <div class=\"table-wrap\" style=\"margin-top:18px\">\n      <table class=\"stocks-table\">\n        <thead>\n          <tr>\n            <th>#</th>\n            <th>Name</th>\n            <th>Email</th>\n            <th>Role</th>\n            <th>Registered</th>\n            <th>Actions</th>\n          </tr>\n        </thead>\n        <tbody>").concat(rows || '<tr><td colspan="6" class="no-data">No users yet.</td></tr>', "</tbody>\n      </table>\n    </div>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
app.post("/admin/users/:id/make-admin", requireAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                id = parseInt(req.params.id, 10);
                if (!Number.isInteger(id) || id <= 0) {
                    res.status(400).send("Invalid id");
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.dbRun)("UPDATE users SET role = 'admin' WHERE id = ?", [id])];
            case 1:
                _a.sent();
                res.redirect("/admin/users");
                return [2 /*return*/];
        }
    });
}); });
// ── GET /admin/data ────────────────────────────────────────────────────────────
app.get("/admin/data", requireAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var stats, msg, err;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, db_1.getDbStats)()];
            case 1:
                stats = _a.sent();
                msg = req.query.msg;
                err = req.query.err;
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Data Control \u2014 ZeroScreen Admin</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n  <style>\n    .settings-section { margin-top:32px; }\n    .settings-section h2 { font-size:16px; font-weight:600; margin-bottom:16px; color:var(--text-main); }\n    .setting-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 20px; background:var(--card-bg); border:1px solid var(--border); border-radius:10px; margin-bottom:12px; }\n    .setting-info { flex:1; }\n    .setting-title { font-weight:600; font-size:14px; color:var(--text-main); }\n    .setting-desc  { font-size:12px; color:var(--text-dim); margin-top:3px; }\n    .toggle-wrap { display:flex; align-items:center; gap:10px; flex-shrink:0; }\n    .toggle-label { font-size:13px; font-weight:600; }\n    .toggle-label.on  { color:#16a34a; }\n    .toggle-label.off { color:#dc2626; }\n    .toggle-btn { position:relative; width:52px; height:28px; cursor:pointer; }\n    .toggle-btn input { opacity:0; width:0; height:0; position:absolute; }\n    .toggle-slider { position:absolute; inset:0; border-radius:28px; background:#cbd5e1; transition:.25s; }\n    .toggle-slider:before { content:\"\"; position:absolute; height:20px; width:20px; left:4px; bottom:4px; border-radius:50%; background:#fff; transition:.25s; }\n    .toggle-btn input:checked + .toggle-slider { background:#16a34a; }\n    .toggle-btn input:checked + .toggle-slider:before { transform:translateX(24px); }\n  </style>\n</head>\n<body>\n  ".concat(nav("admin-users", req), "\n  <div class=\"container\" style=\"max-width:700px\">\n    <div class=\"page-header\">\n      <div>\n        <a href=\"/admin\" class=\"back-link\">\u2190 Admin</a>\n        <h1>\uD83D\uDCCA Data Control</h1>\n        <p class=\"page-sub\">Manage stock data and feature settings</p>\n      </div>\n    </div>\n    ").concat(msg ? "<div class=\"auth-success\" style=\"margin-bottom:18px\">\u2705 ".concat(esc(msg), "</div>") : "", "\n    ").concat(err ? "<div class=\"auth-error\"   style=\"margin-bottom:18px\">\u26A0\uFE0F ".concat(esc(err), "</div>") : "", "\n\n    <div class=\"admin-data-grid\">\n      <div class=\"admin-data-card\">\n        <div class=\"admin-data-icon\">\uD83D\uDCB0</div>\n        <div class=\"admin-data-info\">\n          <div class=\"admin-data-title\">Refresh Prices</div>\n          <div class=\"admin-data-desc\">Fetch latest NSE bhavcopy (daily prices, volume, change%)</div>\n          <div class=\"admin-data-stat\">").concat(stats.priced, " stocks with prices \u00B7 Last: ").concat(stats.lastPriceUpdate ? new Date(stats.lastPriceUpdate).toLocaleString("en-IN") : "Never", "</div>\n        </div>\n        <button class=\"btn-primary\" onclick=\"triggerJob('prices', this)\">\u25B6 Run Now</button>\n      </div>\n      <div class=\"admin-data-card\">\n        <div class=\"admin-data-icon\">\uD83D\uDCC8</div>\n        <div class=\"admin-data-info\">\n          <div class=\"admin-data-title\">Refresh Fundamentals</div>\n          <div class=\"admin-data-desc\">Fetch ROCE, D/E, PE, promoter% etc. from screener.in (batch of 500)</div>\n          <div class=\"admin-data-stat\">").concat(stats.fetched, "/").concat(stats.total, " stocks have fundamentals</div>\n        </div>\n        <button class=\"btn-primary\" onclick=\"triggerJob('fundamentals', this)\">\u25B6 Run Now</button>\n      </div>\n    </div>\n\n    <div class=\"admin-data-progress\" id=\"job-status\" style=\"display:none\">\n      <div class=\"progress-spinner\"></div>\n      <span id=\"job-status-text\">Running\u2026</span>\n    </div>\n\n  </div>\n  <script>\n    async function triggerJob(type, btn) {\n      btn.disabled = true;\n      const statusEl = document.getElementById('job-status');\n      const statusText = document.getElementById('job-status-text');\n      statusEl.style.display = 'flex';\n      statusText.textContent = type === 'prices' ? 'Fetching prices from NSE\u2026' : 'Fetching fundamentals (this takes a few minutes)\u2026';\n      try {\n        const r = await fetch('/api/refresh/' + type, { method: 'POST' });\n        const d = await r.json();\n        if (r.ok) {\n          statusText.textContent = '\u2705 Done! ' + (d.count ? d.count + ' stocks updated.' : '');\n        } else {\n          statusText.textContent = '\u26A0\uFE0F Error: ' + (d.error || 'Unknown');\n        }\n      } catch(e) {\n        statusText.textContent = '\u26A0\uFE0F Network error';\n      }\n      btn.disabled = false;\n    }\n\n\n  </script>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
// ── POST /admin/settings/toggle ───────────────────────────────────────────────
app.post("/admin/settings/toggle", requireAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var allowed, _a, key, value;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                allowed = [
                    "otp_required", "razorpay_enabled",
                    "registration_open",
                    "feature_signals", "feature_dashboard", "feature_strategies",
                    "feature_paper_trade_bot", "feature_my_paper_trade",
                    "feature_watchlists", "feature_alerts", "feature_compare",
                    "feature_strategy_builder", "feature_contact",
                    "watchlists_premium_only", "alerts_premium_only", "paper_trade_premium_only",
                ];
                _a = req.body, key = _a.key, value = _a.value;
                if (!allowed.includes(key) || !["true", "false"].includes(value)) {
                    res.status(400).json({ error: "Invalid setting" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.setSetting)(key, value)];
            case 1:
                _b.sent();
                res.json({ ok: true });
                return [2 /*return*/];
        }
    });
}); });
// ── GET /admin/settings ────────────────────────────────────────────────────────
app.get("/admin/settings", requireAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    function toggle(key, label, desc, extra) {
        if (extra === void 0) { extra = ""; }
        var on = isOn(key);
        return "\n    <div class=\"setting-row\">\n      <div class=\"setting-info\">\n        <div class=\"setting-title\">".concat(label, "</div>\n        <div class=\"setting-desc\">").concat(desc).concat(extra ? "<br><span style=\"color:#f59e0b;font-size:11px\">\u26A0\uFE0F ".concat(extra, "</span>") : "", "</div>\n      </div>\n      <div class=\"toggle-wrap\">\n        <span class=\"toggle-label ").concat(on ? "on" : "off", "\" id=\"lbl-").concat(key, "\">").concat(on ? "ON" : "OFF", "</span>\n        <label class=\"toggle-btn\">\n          <input type=\"checkbox\" id=\"tog-").concat(key, "\" ").concat(on ? "checked" : "", " onchange=\"save('").concat(key, "', this.checked)\">\n          <span class=\"toggle-slider\"></span>\n        </label>\n      </div>\n    </div>");
    }
    var s, keys, isOn, isOff;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                s = {};
                keys = [
                    "otp_required", "registration_open",
                    "feature_signals", "feature_dashboard", "feature_strategies",
                    "feature_paper_trade_bot", "feature_my_paper_trade",
                    "feature_watchlists", "feature_alerts", "feature_compare",
                    "feature_strategy_builder", "feature_contact",
                    "watchlists_premium_only", "alerts_premium_only", "paper_trade_premium_only",
                ];
                return [4 /*yield*/, Promise.all(keys.map(function (k) { return __awaiter(void 0, void 0, void 0, function () { var _a, _b; return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                _a = s;
                                _b = k;
                                return [4 /*yield*/, (0, db_1.getSetting)(k)];
                            case 1:
                                _a[_b] = _c.sent();
                                return [2 /*return*/];
                        }
                    }); }); }))];
            case 1:
                _a.sent();
                isOn = function (k) { return s[k] !== "false"; };
                isOff = function (k) { return s[k] === "false"; };
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Feature Settings \u2014 ZeroScreen Admin</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n  <style>\n    .settings-section { margin-top:28px; }\n    .settings-section h2 { font-size:15px; font-weight:700; margin-bottom:14px; color:var(--text-main); padding-bottom:8px; border-bottom:1px solid var(--border); }\n    .setting-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 18px; background:var(--card-bg); border:1px solid var(--border); border-radius:10px; margin-bottom:10px; }\n    .setting-info { flex:1; min-width:0; }\n    .setting-title { font-weight:600; font-size:14px; color:var(--text-main); }\n    .setting-desc  { font-size:12px; color:var(--text-dim); margin-top:3px; line-height:1.5; }\n    .toggle-wrap { display:flex; align-items:center; gap:10px; flex-shrink:0; }\n    .toggle-label { font-size:13px; font-weight:700; min-width:28px; text-align:right; }\n    .toggle-label.on  { color:#16a34a; }\n    .toggle-label.off { color:#dc2626; }\n    .toggle-btn { position:relative; width:52px; height:28px; cursor:pointer; }\n    .toggle-btn input { opacity:0; width:0; height:0; position:absolute; }\n    .toggle-slider { position:absolute; inset:0; border-radius:28px; background:#cbd5e1; transition:.25s; }\n    .toggle-slider:before { content:\"\"; position:absolute; height:20px; width:20px; left:4px; bottom:4px; border-radius:50%; background:#fff; transition:.25s; }\n    .toggle-btn input:checked + .toggle-slider { background:#16a34a; }\n    .toggle-btn input:checked + .toggle-slider:before { transform:translateX(24px); }\n    .toast { position:fixed; bottom:24px; right:24px; background:#1e293b; color:#fff; padding:10px 18px; border-radius:8px; font-size:13px; opacity:0; transition:opacity .3s; pointer-events:none; z-index:9999; }\n    .toast.show { opacity:1; }\n  </style>\n</head>\n<body>\n  ".concat(nav("admin-users", req), "\n  <div class=\"container\" style=\"max-width:720px\">\n    <div class=\"page-header\">\n      <div>\n        <a href=\"/admin\" class=\"back-link\">\u2190 Admin</a>\n        <h1>\u2699\uFE0F Feature Settings</h1>\n        <p class=\"page-sub\">Enable or disable pages and control role-based access</p>\n      </div>\n    </div>\n\n    <div class=\"settings-section\">\n      <h2>\uD83D\uDD10 Registration & Auth</h2>\n      ").concat(toggle("otp_required", "📱 Mobile OTP Verification", "Require users to verify mobile via OTP before accessing Paper Trade. Disable if SMS delivery is unavailable."), "\n      ").concat(toggle("registration_open", "🆕 New User Registration", "Allow new users to sign up. Disable to make the platform invite-only.", "Existing users can still log in."), "\n    </div>\n\n    <div class=\"settings-section\">\n      <h2>\uD83D\uDCC4 Page Visibility <span style=\"font-size:11px;font-weight:400;color:var(--text-dim)\">(OFF = 404 for all users)</span></h2>\n      ").concat(toggle("feature_signals", "📡 Signals Page", "Live BANKNIFTY bot signals and trade history."), "\n      ").concat(toggle("feature_dashboard", "📊 Dashboard Page", "Bot analytics, equity curve, 5-year backtest stats."), "\n      ").concat(toggle("feature_strategies", "⚙️ Strategies Page", "Strategy showcase with backtest numbers."), "\n      ").concat(toggle("feature_paper_trade_bot", "📋 Bot Paper Trade Page", "Public paper trade portfolio run by the bot engine."), "\n      ").concat(toggle("feature_my_paper_trade", "👤 My Paper Trade", "Personal paper trading portfolio for logged-in users."), "\n      ").concat(toggle("feature_watchlists", "⭐ Watchlists", "Named stock watchlists for logged-in users."), "\n      ").concat(toggle("feature_alerts", "🔔 Alerts", "Saved screener filter alerts with email digest."), "\n      ").concat(toggle("feature_compare", "⚖️ Compare Tool", "Side-by-side stock comparison."), "\n      ").concat(toggle("feature_strategy_builder", "🔨 Strategy Builder", "Plain-English strategy parser."), "\n      ").concat(toggle("feature_contact", "📬 Contact Page", "Contact form and support enquiries."), "\n    </div>\n\n    <div class=\"settings-section\">\n      <h2>\uD83D\uDC8E Premium-Only Access <span style=\"font-size:11px;font-weight:400;color:var(--text-dim)\">(ON = Premium or Admin only)</span></h2>\n      ").concat(toggle("watchlists_premium_only", "⭐ Watchlists — Premium Only", "Restrict Watchlists to Premium subscribers and admins."), "\n      ").concat(toggle("alerts_premium_only", "🔔 Alerts — Premium Only", "Restrict Alerts to Premium subscribers and admins."), "\n      ").concat(toggle("paper_trade_premium_only", "👤 My Paper Trade — Premium Only", "Restrict personal Paper Trading to Premium subscribers and admins.", "Users on the free plan will be redirected to the upgrade page."), "\n    </div>\n  </div>\n\n  <div class=\"toast\" id=\"toast\"></div>\n\n  <script>\n    async function save(key, value) {\n      const lbl  = document.getElementById('lbl-' + key);\n      const chk  = document.getElementById('tog-' + key);\n      try {\n        const r = await fetch('/admin/settings/toggle', {\n          method: 'POST',\n          headers: { 'Content-Type': 'application/json' },\n          body: JSON.stringify({ key, value: value ? 'true' : 'false' })\n        });\n        if (r.ok) {\n          lbl.textContent = value ? 'ON' : 'OFF';\n          lbl.className = 'toggle-label ' + (value ? 'on' : 'off');\n          showToast('\u2705 Saved');\n        } else {\n          chk.checked = !value;\n          showToast('\u26A0\uFE0F Failed to save');\n        }\n      } catch(e) {\n        chk.checked = !value;\n        showToast('\u26A0\uFE0F Network error');\n      }\n    }\n    function showToast(msg) {\n      const t = document.getElementById('toast');\n      t.textContent = msg;\n      t.classList.add('show');\n      setTimeout(() => t.classList.remove('show'), 2200);\n    }\n  </script>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
// ── GET /api/screen/csv ────────────────────────────────────────────────────────
app.get("/api/screen/csv", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var f, stocks, header, csvRows, csv, date;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                f = {
                    minRoce: req.query.minRoce ? parseFloat(req.query.minRoce) : undefined,
                    maxRoce: req.query.maxRoce ? parseFloat(req.query.maxRoce) : undefined,
                    maxDe: req.query.maxDe ? parseFloat(req.query.maxDe) : undefined,
                    minPromoter: req.query.minPromoter ? parseFloat(req.query.minPromoter) : undefined,
                    maxPe: req.query.maxPe ? parseFloat(req.query.maxPe) : undefined,
                    minPe: req.query.minPe ? parseFloat(req.query.minPe) : undefined,
                    minPrice: req.query.minPrice ? parseFloat(req.query.minPrice) : undefined,
                    maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice) : undefined,
                    minVolume: req.query.minVolume ? parseInt(req.query.minVolume, 10) : undefined,
                    minMarketCap: req.query.minMc ? parseFloat(req.query.minMc) : undefined,
                    maxMarketCap: req.query.maxMc ? parseFloat(req.query.maxMc) : undefined,
                    minDividendYield: req.query.minDivYield ? parseFloat(req.query.minDivYield) : undefined,
                    allProfitable: req.query.allProfit === "1",
                    profitUptrend: req.query.uptrend === "1",
                    sector: req.query.sector ? req.query.sector : undefined,
                    sortBy: req.query.sortBy || "roce",
                    sortDir: req.query.sortDir || "desc",
                    limit: 500,
                };
                return [4 /*yield*/, (0, db_1.screenStocks)(f)];
            case 1:
                stocks = _a.sent();
                header = "Symbol,Company,Sector,Price,Change%,Volume,ROCE%,ROE%,D/E,Promoter%,PE,MarketCap_Cr,AllProfitable,ProfitUptrend";
                csvRows = stocks.map(function (s) {
                    var _a, _b, _c, _d, _e, _f, _g, _h;
                    return [
                        s.symbol,
                        "\"".concat((s.company_name || "").replace(/"/g, '""'), "\""),
                        "\"".concat((s.sector || "").replace(/"/g, '""'), "\""),
                        ((_a = s.price) === null || _a === void 0 ? void 0 : _a.toFixed(2)) || "",
                        ((_b = s.change_pct) === null || _b === void 0 ? void 0 : _b.toFixed(2)) || "",
                        s.volume || "",
                        ((_c = s.roce) === null || _c === void 0 ? void 0 : _c.toFixed(2)) || "",
                        ((_d = s.roe) === null || _d === void 0 ? void 0 : _d.toFixed(2)) || "",
                        ((_e = s.de_ratio) === null || _e === void 0 ? void 0 : _e.toFixed(2)) || "",
                        ((_f = s.promoter_pct) === null || _f === void 0 ? void 0 : _f.toFixed(2)) || "",
                        ((_g = s.pe_ratio) === null || _g === void 0 ? void 0 : _g.toFixed(1)) || "",
                        ((_h = s.market_cap) === null || _h === void 0 ? void 0 : _h.toFixed(0)) || "",
                        s.all_profitable ? "Yes" : "No",
                        s.profit_uptrend ? "Yes" : "No",
                    ].join(",");
                });
                csv = __spreadArray([header], csvRows, true).join("\n");
                date = new Date().toISOString().slice(0, 10);
                res.setHeader("Content-Type", "text/csv; charset=utf-8");
                res.setHeader("Content-Disposition", "attachment; filename=\"zeroscreen-".concat(date, ".csv\""));
                res.send("\uFEFF" + csv); // BOM for Excel UTF-8 support
                return [2 /*return*/];
        }
    });
}); });
// ── GET /compare ──────────────────────────────────────────────────────────────
app.get("/compare", featureGate("feature_compare", "Compare"), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbolsParam, symbols, stocks, metrics, headerCols, bodyRows, symbolList;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                symbolsParam = (req.query.symbols || "").toUpperCase();
                symbols = symbolsParam.split(",").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 5);
                // No symbols — show search/pick form
                if (symbols.length < 2) {
                    res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Compare Stocks \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body>\n  ".concat(nav("compare", req), "\n  <div class=\"container\">\n    <div class=\"page-header\">\n      <h1>\u2696\uFE0F Compare Stocks</h1>\n      <p class=\"page-sub\">Enter 2\u20135 NSE symbols to compare side-by-side</p>\n    </div>\n    <div class=\"cmp-pick-card\">\n      <div class=\"cmp-pick-inputs\" id=\"cmpInputs\">\n        <div class=\"cmp-ac-wrap\"><input class=\"input cmp-sym-input\" placeholder=\"Symbol 1 e.g. RELIANCE\" maxlength=\"20\" autocomplete=\"off\"><div class=\"cmp-ac-drop\"></div></div>\n        <div class=\"cmp-ac-wrap\"><input class=\"input cmp-sym-input\" placeholder=\"Symbol 2 e.g. TCS\" maxlength=\"20\" autocomplete=\"off\"><div class=\"cmp-ac-drop\"></div></div>\n        <div class=\"cmp-ac-wrap\"><input class=\"input cmp-sym-input\" placeholder=\"Symbol 3 (optional)\" maxlength=\"20\" autocomplete=\"off\"><div class=\"cmp-ac-drop\"></div></div>\n        <div class=\"cmp-ac-wrap\"><input class=\"input cmp-sym-input\" placeholder=\"Symbol 4 (optional)\" maxlength=\"20\" autocomplete=\"off\"><div class=\"cmp-ac-drop\"></div></div>\n        <div class=\"cmp-ac-wrap\"><input class=\"input cmp-sym-input\" placeholder=\"Symbol 5 (optional)\" maxlength=\"20\" autocomplete=\"off\"><div class=\"cmp-ac-drop\"></div></div>\n      </div>\n      <div style=\"margin-top:20px;display:flex;gap:12px;flex-wrap:wrap\">\n        <button class=\"btn-primary\" onclick=\"goCompare()\">\u2696\uFE0F Compare</button>\n        <a href=\"/\" class=\"btn-secondary\">\u2190 Back to Screener</a>\n      </div>\n      <p style=\"margin-top:14px;font-size:12px;color:var(--text-dim)\">Tip: you can also tick checkboxes on the screener and use the Compare button there.</p>\n    </div>\n  </div>\n  <script>\n    function goCompare() {\n      const syms = [...document.querySelectorAll('.cmp-sym-input')]\n        .map(i => i.value.trim().toUpperCase().replace(/[^A-Z0-9&]/g,''))\n        .filter(Boolean);\n      if (syms.length < 2) { alert('Enter at least 2 symbols'); return; }\n      window.location.href = '/compare?symbols=' + syms.join(',');\n    }\n\n    // Autocomplete\n    let _acTimer = null;\n    document.querySelectorAll('.cmp-ac-wrap').forEach(function(wrap) {\n      const inp = wrap.querySelector('.cmp-sym-input');\n      const drop = wrap.querySelector('.cmp-ac-drop');\n      inp.addEventListener('input', function() {\n        clearTimeout(_acTimer);\n        const q = inp.value.trim();\n        if (q.length < 1) { drop.innerHTML=''; drop.style.display='none'; return; }\n        _acTimer = setTimeout(async function() {\n          try {\n            const r = await fetch('/api/search?q=' + encodeURIComponent(q));\n            const items = await r.json();\n            if (!items.length) { drop.innerHTML=''; drop.style.display='none'; return; }\n            drop.innerHTML = items.map(function(it) {\n              return '<div class=\"cmp-ac-item\" data-sym=\"'+it.symbol+'\">' +\n                '<span class=\"cmp-ac-sym\">'+it.symbol+'</span>' +\n                '<span class=\"cmp-ac-name\">'+it.company_name+'</span>' +\n                '</div>';\n            }).join('');\n            drop.style.display = 'block';\n          } catch(_) {}\n        }, 180);\n      });\n      drop.addEventListener('mousedown', function(e) {\n        const item = e.target.closest('.cmp-ac-item');\n        if (!item) return;\n        inp.value = item.dataset.sym;\n        drop.innerHTML = ''; drop.style.display = 'none';\n      });\n      inp.addEventListener('keydown', function(e) {\n        if (e.key === 'Enter') { drop.innerHTML=''; drop.style.display='none'; goCompare(); }\n        if (e.key === 'Escape') { drop.innerHTML=''; drop.style.display='none'; }\n        if (e.key === 'ArrowDown') {\n          const first = drop.querySelector('.cmp-ac-item'); if (first) first.focus();\n        }\n      });\n      inp.addEventListener('blur', function() {\n        setTimeout(function(){ drop.innerHTML=''; drop.style.display='none'; }, 200);\n      });\n    });\n  </script>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                    return [2 /*return*/];
                }
                return [4 /*yield*/, Promise.all(symbols.map(function (sym) { return (0, db_1.getStock)(sym); }))];
            case 1:
                stocks = (_a.sent()).filter(Boolean);
                if (stocks.length < 2) {
                    res.redirect("/?error=stocks_not_found");
                    return [2 /*return*/];
                }
                metrics = [
                    ["Price", "₹", function (s) { return s.price != null ? "\u20B9".concat(fmt(s.price, 2)) : "—"; }],
                    ["Change %", "%", function (s) { return s.change_pct != null ? "<span style=\"color:".concat(changeColor(s.change_pct), "\">").concat(s.change_pct >= 0 ? "+" : "").concat(fmt(s.change_pct, 2), "%</span>") : "—"; }],
                    ["ROCE %", "%", function (s) { return "<span style=\"color:".concat(roceColor(s.roce), "\">").concat(fmt(s.roce), "%</span>"); }],
                    ["ROE %", "%", function (s) { return "".concat(fmt(s.roe), "%"); }],
                    ["D/E Ratio", "", function (s) { return "<span style=\"color:".concat(deColor(s.de_ratio), "\">").concat(s.de_ratio === 0 ? "Debt-free 💎" : fmt(s.de_ratio), "</span>"); }],
                    ["Promoter %", "%", function (s) { return "".concat(fmt(s.promoter_pct), "%"); }],
                    ["P/E Ratio", "", function (s) { return fmt(s.pe_ratio, 1); }],
                    ["EPS", "₹", function (s) { return "\u20B9".concat(fmt(s.eps, 1)); }],
                    ["Book Value", "₹", function (s) { return "\u20B9".concat(fmt(s.book_value, 1)); }],
                    ["Dividend Yld", "%", function (s) { return "".concat(fmt(s.dividend_yield), "%"); }],
                    ["Current Ratio", "", function (s) { return fmt(s.current_ratio, 2); }],
                    ["Market Cap", "", function (s) { return fmtCr(s.market_cap); }],
                    ["Volume", "", function (s) { return fmtVol(s.volume); }],
                    ["All Profitable", "", function (s) { return s.all_profitable ? "✅ Yes" : "❌ No"; }],
                    ["Profit Uptrend", "", function (s) { return s.profit_uptrend ? "↑ Yes" : "↓ No"; }],
                    ["Sector", "", function (s) { return s.sector || "—"; }],
                ];
                headerCols = stocks.map(function (s) { return "\n    <th class=\"cmp-stock-col\">\n      <a href=\"/stock/".concat(s.symbol, "\" class=\"sym-link\">").concat(s.symbol, "</a>\n      <div class=\"cmp-co-name\">").concat(s.company_name || "", "</div>\n    </th>"); }).join("");
                bodyRows = metrics.map(function (_a) {
                    var label = _a[0], fn = _a[2];
                    return "\n    <tr>\n      <td class=\"cmp-label\">".concat(label, "</td>\n      ").concat(stocks.map(function (s) { return "<td class=\"cmp-val\">".concat(fn(s), "</td>"); }).join(""), "\n    </tr>");
                }).join("");
                symbolList = stocks.map(function (s) { return s.symbol; }).join(",");
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Compare: ".concat(symbolList, " \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body>\n  ").concat(nav("compare", req), "\n  <div class=\"container\">\n    <div class=\"page-header\">\n      <div>\n        <a href=\"/\" class=\"back-link\">\u2190 Back to Screener</a>\n        <h1>\u2696\uFE0F Stock Comparison</h1>\n      </div>\n      <a href=\"/\" class=\"btn-secondary\">+ Add More Stocks</a>\n    </div>\n    <div class=\"table-wrap compare-table-wrap\">\n      <table class=\"stocks-table compare-table\">\n        <thead>\n          <tr>\n            <th class=\"cmp-label-col\">Metric</th>\n            ").concat(headerCols, "\n          </tr>\n        </thead>\n        <tbody>").concat(bodyRows, "</tbody>\n      </table>\n    </div>\n    <div style=\"margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center\">\n      <button class=\"btn-primary\" id=\"refreshAllBtn\" onclick=\"refreshAll()\">\uD83D\uDD04 Refresh All Data</button>\n      <a href=\"/compare\" class=\"btn-secondary\">\u2696\uFE0F Compare Different Stocks</a>\n      <a href=\"/\" class=\"btn-ghost\">\u2190 Back to Screener</a>\n    </div>\n    <p id=\"refreshNote\" style=\"margin-top:10px;font-size:12px;color:var(--text-dim)\">If values show \u2014, click Refresh All Data to fetch fundamentals from screener.in</p>\n  </div>\n  <script>\n    async function refreshAll() {\n      const btn = document.getElementById('refreshAllBtn');\n      const note = document.getElementById('refreshNote');\n      btn.disabled = true; btn.textContent = 'Refreshing\u2026';\n      note.textContent = 'Fetching data for ").concat(symbolList, " \u2014 this may take 15\u201330 seconds\u2026';\n      const syms = '").concat(symbolList, "'.split(',');\n      for (const sym of syms) {\n        note.textContent = 'Fetching ' + sym + '\u2026';\n        try { await fetch('/api/refresh/stock/' + sym, {method:'POST'}); } catch(_) {}\n      }\n      location.reload();\n    }\n  </script>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
// ── GET /alerts ───────────────────────────────────────────────────────────────
app.get("/alerts", requireAuth, featureGate("feature_alerts", "Alerts"), premiumGate("alerts_premium_only", "Alerts"), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var alerts, cards;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, db_1.getAlerts)(req.session.userId)];
            case 1:
                alerts = _a.sent();
                cards = alerts.map(function (a) {
                    var filters = {};
                    try {
                        filters = JSON.parse(a.filters_json);
                    }
                    catch (_) { }
                    var qs = new URLSearchParams(filters).toString();
                    var filterPills = Object.entries(filters)
                        .filter(function (_a) {
                        var v = _a[1];
                        return v && v !== "roce" && v !== "desc";
                    })
                        .map(function (_a) {
                        var k = _a[0], v = _a[1];
                        return "<span class=\"filter-pill\">".concat(k, ": ").concat(v, "</span>");
                    })
                        .join("");
                    return "\n      <div class=\"alert-card\">\n        <div class=\"alert-card-header\">\n          <span class=\"alert-name\">\uD83D\uDD14 ".concat(a.name, "</span>\n          <span class=\"alert-date\">Saved ").concat(new Date(a.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), "</span>\n        </div>\n        <div class=\"alert-pills\">").concat(filterPills || '<span class="text-dim">No filters (matches all stocks)</span>', "</div>\n        <div class=\"alert-actions\">\n          <a href=\"/?").concat(qs, "\" class=\"btn-primary\">\u25B6 Run Now</a>\n          <span class=\"alert-sent\">").concat(a.last_sent ? "Last emailed: ".concat(new Date(a.last_sent).toLocaleDateString("en-IN")) : "Email not sent yet", "</span>\n          <button class=\"btn-danger\" onclick=\"deleteAlert(").concat(a.id, ")\">Delete</button>\n        </div>\n      </div>");
                }).join("");
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Alerts \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body>\n  ".concat(nav("alerts", req), "\n  <div class=\"container\">\n    <div class=\"page-header\">\n      <div>\n        <h1>\uD83D\uDD14 My Alerts</h1>\n        <p class=\"page-sub\">Daily email when stocks match your saved filters (sent weekday mornings)</p>\n      </div>\n      <a href=\"/\" class=\"btn-primary\">+ Create Alert from Screener</a>\n    </div>\n    <div class=\"alerts-grid\">\n      ").concat(cards || "\n        <div class=\"empty-state\">\n          <div class=\"empty-icon\">\uD83D\uDD14</div>\n          <h2>No alerts yet</h2>\n          <p>Go to the screener, set your filters, and click <strong>\uD83D\uDD14 Save Alert</strong> to get daily emails.</p>\n          <a href=\"/\" class=\"btn-primary\">Go to Screener \u2192</a>\n        </div>", "\n    </div>\n  </div>\n  <script>\n    async function deleteAlert(id) {\n      if (!confirm('Delete this alert?')) return;\n      const r = await fetch('/alerts/' + id, { method: 'DELETE' });\n      if (r.ok) location.reload(); else alert('Error deleting alert');\n    }\n  </script>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
// POST /alerts
app.post("/alerts", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, name, filtersJson, id;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, name = _a.name, filtersJson = _a.filtersJson;
                if (!name || !filtersJson) {
                    res.status(400).json({ error: "name and filtersJson required" });
                    return [2 /*return*/];
                }
                try {
                    JSON.parse(filtersJson);
                }
                catch (_) {
                    res.status(400).json({ error: "invalid filtersJson" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.createAlert)(req.session.userId, name.trim().substring(0, 60), filtersJson)];
            case 1:
                id = _b.sent();
                res.json({ id: id, ok: true });
                return [2 /*return*/];
        }
    });
}); });
// DELETE /alerts/:id
app.delete("/alerts/:id", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                id = parseInt(req.params.id, 10);
                if (!Number.isInteger(id) || id <= 0) {
                    res.status(400).json({ error: "Invalid id" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.deleteAlert)(id, req.session.userId)];
            case 1:
                _a.sent();
                res.json({ ok: true });
                return [2 /*return*/];
        }
    });
}); });
// ── JSON API ───────────────────────────────────────────────────────────────────
app.get("/api/screen", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var f, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                f = {
                    minRoce: req.query.minRoce ? parseFloat(req.query.minRoce) : undefined,
                    maxDe: req.query.maxDe ? parseFloat(req.query.maxDe) : undefined,
                    minPromoter: req.query.minPromoter ? parseFloat(req.query.minPromoter) : undefined,
                    maxPe: req.query.maxPe ? parseFloat(req.query.maxPe) : undefined,
                    minPrice: req.query.minPrice ? parseFloat(req.query.minPrice) : undefined,
                    maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice) : undefined,
                    minVolume: req.query.minVolume ? parseInt(req.query.minVolume, 10) : undefined,
                    allProfitable: req.query.allProfit === "1",
                    profitUptrend: req.query.uptrend === "1",
                    sortBy: req.query.sortBy || "roce",
                    sortDir: req.query.sortDir || "desc",
                    limit: Math.min(parseInt(req.query.limit || "100", 10), 500),
                };
                _b = (_a = res).json;
                return [4 /*yield*/, (0, db_1.screenStocks)(f)];
            case 1:
                _b.apply(_a, [_c.sent()]);
                return [2 /*return*/];
        }
    });
}); });
app.get("/api/stock/:symbol", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var s;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, db_1.getStock)(req.params.symbol.toUpperCase())];
            case 1:
                s = _a.sent();
                if (!s) {
                    res.status(404).json({ error: "Not found" });
                    return [2 /*return*/];
                }
                res.json(s);
                return [2 /*return*/];
        }
    });
}); });
app.get("/api/stats", function (_req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _b = (_a = res).json;
                return [4 /*yield*/, (0, db_1.getDbStats)()];
            case 1:
                _b.apply(_a, [_c.sent()]);
                return [2 /*return*/];
        }
    });
}); });
app.get("/api/search", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var q, results;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                q = (req.query.q || "").trim();
                if (q.length < 1) {
                    res.json([]);
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.searchStocks)(q, 8)];
            case 1:
                results = _a.sent();
                res.json(results);
                return [2 /*return*/];
        }
    });
}); });
app.get("/api/news", function (_req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _b = (_a = res).json;
                return [4 /*yield*/, fetchMarketNews()];
            case 1:
                _b.apply(_a, [_c.sent()]);
                return [2 /*return*/];
        }
    });
}); });
// ── GET /api/markets ─ live index prices from NSE India ──────────────────────
var _mktCache = [];
var _mktCacheAt = 0;
var NSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-IN,en;q=0.9",
    "Referer": "https://www.nseindia.com/",
};
function fetchNseMarkets() {
    return __awaiter(this, void 0, void 0, function () {
        var idxRes, data, indices_1, pick, results, fin, e_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (Date.now() - _mktCacheAt < 60000 && _mktCache.length)
                        return [2 /*return*/, _mktCache];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, fetch("https://www.nseindia.com/api/allIndices", {
                            headers: NSE_HEADERS,
                            signal: AbortSignal.timeout(9000)
                        })];
                case 2:
                    idxRes = _a.sent();
                    if (!idxRes.ok)
                        throw new Error("NSE HTTP ".concat(idxRes.status));
                    return [4 /*yield*/, idxRes.json()];
                case 3:
                    data = _a.sent();
                    indices_1 = (data === null || data === void 0 ? void 0 : data.data) || [];
                    pick = function (name, label) {
                        var i = indices_1.find(function (x) { return x.indexSymbol === name || x.index === name; });
                        if (!i)
                            return null;
                        return { symbol: name, label: label, price: i.last, change: i.variation, changePct: i.percentChange, region: "india" };
                    };
                    results = [
                        pick("NIFTY 50", "NIFTY 50"),
                        pick("NIFTY BANK", "BANK NIFTY"),
                        pick("NIFTY IT", "NIFTY IT"),
                        pick("NIFTY MIDCAP 100", "MIDCAP 100"),
                        pick("INDIA VIX", "INDIA VIX"),
                    ].filter(Boolean);
                    fin = pick("NIFTY FINANCIAL SERVICES", "FIN NIFTY");
                    if (fin)
                        results.splice(1, 0, fin);
                    if (results.length >= 3) {
                        _mktCache = results;
                        _mktCacheAt = Date.now();
                    }
                    return [2 /*return*/, results];
                case 4:
                    e_2 = _a.sent();
                    console.warn("[Markets]", e_2 === null || e_2 === void 0 ? void 0 : e_2.message);
                    return [2 /*return*/, _mktCache];
                case 5: return [2 /*return*/];
            }
        });
    });
}
var _globalCache = [];
var _globalCacheAt = 0;
var GLOBAL_SYMBOLS = [
    ["^DJI", "Dow Jones"],
    ["^IXIC", "NASDAQ"],
    ["^GSPC", "S&P 500"],
    ["^N225", "Nikkei 225"],
    ["^HSI", "Hang Seng"],
];
function fetchGlobalMarkets() {
    return __awaiter(this, void 0, void 0, function () {
        var results, valid, e_3;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (Date.now() - _globalCacheAt < 120000 && _globalCache.length)
                        return [2 /*return*/, _globalCache];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, Promise.all(GLOBAL_SYMBOLS.map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                            var r, d, meta, price, prev, change, changePct, _c;
                            var _d, _e, _f, _g;
                            var sym = _b[0], label = _b[1];
                            return __generator(this, function (_h) {
                                switch (_h.label) {
                                    case 0:
                                        _h.trys.push([0, 3, , 4]);
                                        return [4 /*yield*/, fetch("https://query1.finance.yahoo.com/v8/finance/chart/".concat(encodeURIComponent(sym), "?interval=1d&range=1d"), { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) })];
                                    case 1:
                                        r = _h.sent();
                                        return [4 /*yield*/, r.json()];
                                    case 2:
                                        d = _h.sent();
                                        meta = (_f = (_e = (_d = d === null || d === void 0 ? void 0 : d.chart) === null || _d === void 0 ? void 0 : _d.result) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.meta;
                                        price = meta === null || meta === void 0 ? void 0 : meta.regularMarketPrice;
                                        prev = (_g = meta === null || meta === void 0 ? void 0 : meta.chartPreviousClose) !== null && _g !== void 0 ? _g : meta === null || meta === void 0 ? void 0 : meta.previousClose;
                                        change = (price && prev) ? +(price - prev).toFixed(2) : 0;
                                        changePct = (price && prev) ? +((price - prev) / prev * 100).toFixed(2) : 0;
                                        if (!price)
                                            return [2 /*return*/, null];
                                        return [2 /*return*/, { symbol: sym, label: label, price: price, change: change, changePct: changePct, region: "global" }];
                                    case 3:
                                        _c = _h.sent();
                                        return [2 /*return*/, null];
                                    case 4: return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 2:
                    results = _a.sent();
                    valid = results.filter(Boolean);
                    if (valid.length >= 2) {
                        _globalCache = valid;
                        _globalCacheAt = Date.now();
                    }
                    return [2 /*return*/, valid.length ? valid : _globalCache];
                case 3:
                    e_3 = _a.sent();
                    console.warn("[GlobalMarkets]", e_3 === null || e_3 === void 0 ? void 0 : e_3.message);
                    return [2 /*return*/, _globalCache];
                case 4: return [2 /*return*/];
            }
        });
    });
}
app.get("/api/markets", function (_req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, india, global;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, Promise.all([fetchNseMarkets(), fetchGlobalMarkets()])];
            case 1:
                _a = _b.sent(), india = _a[0], global = _a[1];
                res.json(__spreadArray(__spreadArray([], india, true), global, true));
                return [2 /*return*/];
        }
    });
}); });
// ── GET /api/news/:symbol ─ stock-specific news from Google News RSS ──────────
app.get("/api/news/:symbol", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, s, co, query, feedUrl, xml, items, now_1, news, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                symbol = req.params.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
                return [4 /*yield*/, (0, db_1.getStock)(symbol)];
            case 1:
                s = _b.sent();
                co = (s === null || s === void 0 ? void 0 : s.company_name) ? s.company_name.replace(/[^a-zA-Z0-9 ]/g, " ").trim() : symbol;
                query = encodeURIComponent("".concat(co, " NSE India stock"));
                feedUrl = "https://news.google.com/rss/search?q=".concat(query, "&hl=en-IN&gl=IN&ceid=IN:en");
                _b.label = 2;
            case 2:
                _b.trys.push([2, 4, , 5]);
                return [4 /*yield*/, new Promise(function (resolve, reject) {
                        var reqH = https_1.default.get(feedUrl, {
                            timeout: 8000,
                            headers: { "User-Agent": "ZeroScreen/1.0 RSS Reader", "Accept": "application/rss+xml,application/xml,*/*" },
                        }, function (r) {
                            if (r.statusCode && r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
                                https_1.default.get(r.headers.location, { timeout: 8000, headers: { "User-Agent": "ZeroScreen/1.0" } }, function (r2) {
                                    var d = "";
                                    r2.on("data", function (c) { return d += c; });
                                    r2.on("end", function () { return resolve(d); });
                                }).on("error", reject);
                                return;
                            }
                            var d = "";
                            r.on("data", function (c) { return d += c; });
                            r.on("end", function () { return resolve(d); });
                        });
                        reqH.on("error", reject);
                        reqH.on("timeout", function () { reqH.destroy(); reject(new Error("timeout")); });
                    })];
            case 3:
                xml = _b.sent();
                items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
                now_1 = Date.now();
                news = items.slice(0, 20).map(function (item) {
                    var _a, _b, _c, _d;
                    var title = ((_a = (item.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/) || item.match(/<title>([^<]+)<\/title>/) || [])[1]) === null || _a === void 0 ? void 0 : _a.trim()) || "";
                    var link = ((_b = (item.match(/<link>([^<]+)<\/link>/) || [])[1]) === null || _b === void 0 ? void 0 : _b.trim()) || "";
                    var pubDate = ((_c = (item.match(/<pubDate>([^<]+)<\/pubDate>/) || [])[1]) === null || _c === void 0 ? void 0 : _c.trim()) || "";
                    var source = ((_d = (item.match(/<source[^>]*>([^<]+)<\/source>/) || item.match(/\.com\/([^/]+)/g) || [])[1]) === null || _d === void 0 ? void 0 : _d.trim()) || "";
                    var ts = pubDate ? new Date(pubDate).getTime() : 0;
                    var diffMs = now_1 - ts;
                    var diffH = diffMs / 3600000;
                    var period;
                    if (diffH < 24)
                        period = "Today";
                    else if (diffH < 48)
                        period = "Yesterday";
                    else if (diffH < 168)
                        period = "Last 7 Days";
                    else
                        period = "Older";
                    return { title: title, link: link, pubDate: pubDate, source: source, period: period, ts: ts };
                }).filter(function (n) { return n.title && n.link; });
                res.json(news);
                return [3 /*break*/, 5];
            case 4:
                _a = _b.sent();
                res.json([]);
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
app.post("/api/refresh/prices", function (_req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var count, e_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, (0, scheduler_1.refreshPrices)()];
            case 1:
                count = _a.sent();
                res.json({ ok: true, count: count });
                return [3 /*break*/, 3];
            case 2:
                e_4 = _a.sent();
                res.status(500).json({ error: e_4.message });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
app.post("/api/refresh/fundamentals", requireAdmin, function (_req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var stats, e_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                // Fire and forget — runs in background
                (0, scheduler_1.refreshFundamentals)().catch(function (e) { return console.error("[API] fundamentals error:", e.message); });
                return [4 /*yield*/, (0, db_1.getDbStats)()];
            case 1:
                stats = _a.sent();
                res.json({ ok: true, message: "Running in background. Currently ".concat(stats.fetched, "/").concat(stats.total, " stocks fetched.") });
                return [3 /*break*/, 3];
            case 2:
                e_5 = _a.sent();
                res.status(500).json({ error: e_5.message });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
app.post("/api/refresh/stock/:symbol", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, f, e_6;
    var _a, _b, _c, _d, _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                symbol = req.params.symbol.toUpperCase();
                _g.label = 1;
            case 1:
                _g.trys.push([1, 3, , 4]);
                return [4 /*yield*/, (0, scraper_1.fetchFundamentals)(symbol)];
            case 2:
                f = _g.sent();
                if (f.error) {
                    res.status(400).json({ error: f.error });
                    return [2 /*return*/];
                }
                (0, db_1.upsertStock)({
                    symbol: symbol,
                    company_name: f.companyName, sector: f.sector, market_cap: f.marketCap,
                    pe_ratio: f.peRatio, roce: f.roce, roe: f.roe, de_ratio: f.deRatio,
                    promoter_pct: f.promoterPct, eps: f.eps, book_value: f.bookValue,
                    dividend_yield: f.dividendYield, current_ratio: f.currentRatio,
                    net_profit_1: (_a = f.netProfits[f.netProfits.length - 3]) !== null && _a !== void 0 ? _a : null,
                    net_profit_2: (_b = f.netProfits[f.netProfits.length - 2]) !== null && _b !== void 0 ? _b : null,
                    net_profit_3: (_c = f.netProfits[f.netProfits.length - 1]) !== null && _c !== void 0 ? _c : null,
                    revenue_1: (_d = f.revenues[f.revenues.length - 3]) !== null && _d !== void 0 ? _d : null,
                    revenue_2: (_e = f.revenues[f.revenues.length - 2]) !== null && _e !== void 0 ? _e : null,
                    revenue_3: (_f = f.revenues[f.revenues.length - 1]) !== null && _f !== void 0 ? _f : null,
                    all_profitable: f.allProfitable ? 1 : 0,
                    profit_uptrend: f.profitUptrend ? 1 : 0,
                    week52_high: f.week52High,
                    week52_low: f.week52Low,
                    about: f.about,
                    incorporated: f.incorporated,
                    screener_data: JSON.stringify({ netProfits: f.netProfits, revenues: f.revenues }),
                    fetch_error: null, fetched_at: new Date().toISOString(),
                });
                res.json({ ok: true });
                return [3 /*break*/, 4];
            case 3:
                e_6 = _g.sent();
                res.status(500).json({ error: e_6.message });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// ── GET /contact ──────────────────────────────────────────────────────────────
app.get("/contact", featureGate("feature_contact", "Contact"), function (req, res) {
    var success = req.query.sent === "1";
    var error = req.query.error;
    res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Contact Us \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body>\n  ".concat(nav("contact", req), "\n  <div class=\"container\">\n    <div class=\"contact-wrap\">\n      <div class=\"contact-left\">\n        <div class=\"contact-tag\">Get in touch</div>\n        <h1>We'd love to hear from you</h1>\n        <p class=\"contact-desc\">Whether you're interested in acquiring ZeroScreen, want to collaborate, have a feature request, or just want to say hello \u2014 drop us a message and we'll get back to you within 24 hours.</p>\n        <div class=\"contact-cards\">\n          <div class=\"contact-info-card\">\n            <span class=\"cic-icon\">\uD83D\uDCBC</span>\n            <div>\n              <div class=\"cic-title\">Business &amp; Acquisition</div>\n              <div class=\"cic-desc\">Interested in buying or partnering? Let's talk.</div>\n            </div>\n          </div>\n          <div class=\"contact-info-card\">\n            <span class=\"cic-icon\">\uD83D\uDEE0\uFE0F</span>\n            <div>\n              <div class=\"cic-title\">Feature Requests</div>\n              <div class=\"cic-desc\">Have an idea to make ZeroScreen better?</div>\n            </div>\n          </div>\n          <div class=\"contact-info-card\">\n            <span class=\"cic-icon\">\uD83D\uDC1B</span>\n            <div>\n              <div class=\"cic-title\">Bug Reports</div>\n              <div class=\"cic-desc\">Found something broken? Tell us.</div>\n            </div>\n          </div>\n          <div class=\"contact-info-card\">\n            <span class=\"cic-icon\">\uD83D\uDCAC</span>\n            <div>\n              <div class=\"cic-title\">General Enquiry</div>\n              <div class=\"cic-desc\">Any other question or feedback.</div>\n            </div>\n          </div>\n        </div>\n      </div>\n      <div class=\"contact-right\">\n        <div class=\"contact-form-card\">\n          <h2>Send us a message</h2>\n          ").concat(success ? '<div class="auth-success">✅ Message sent! We\'ll reply within 24 hours.</div>' : '', "\n          ").concat(error ? "<div class=\"auth-error\">".concat(esc(error), "</div>") : '', "\n          <form class=\"auth-form\" method=\"POST\" action=\"/contact\">\n            <div class=\"form-group\">\n              <label>Your Name</label>\n              <input type=\"text\" name=\"name\" placeholder=\"Rahul Sharma\" required>\n            </div>\n            <div class=\"form-group\">\n              <label>Email Address</label>\n              <input type=\"email\" name=\"email\" placeholder=\"you@example.com\" required>\n            </div>\n            <div class=\"form-group\">\n              <label>Subject</label>\n              <select name=\"subject\" style=\"width:100%;background:var(--bg3);border:1.5px solid var(--border);color:var(--text);padding:11px 14px;border-radius:9px;font-size:14px;outline:none;font-family:inherit;\">\n                <option value=\"Acquisition / Purchase Inquiry\">\uD83D\uDCBC Acquisition / Purchase Inquiry</option>\n                <option value=\"Feature Request\">\uD83D\uDEE0\uFE0F Feature Request</option>\n                <option value=\"Partnership / Collaboration\">\uD83E\uDD1D Partnership / Collaboration</option>\n                <option value=\"Bug Report\">\uD83D\uDC1B Bug Report</option>\n                <option value=\"General Enquiry\">\uD83D\uDCAC General Enquiry</option>\n              </select>\n            </div>\n            <div class=\"form-group\">\n              <label>Message</label>\n              <textarea name=\"message\" placeholder=\"Tell us more...\" required rows=\"5\" style=\"width:100%;background:var(--bg3);border:1.5px solid var(--border);color:var(--text);padding:11px 14px;border-radius:9px;font-size:14px;outline:none;font-family:inherit;resize:vertical;transition:border-color 0.15s;\"></textarea>\n            </div>\n            <button type=\"submit\" class=\"btn-auth\">Send Message \u2192</button>\n          </form>\n        </div>\n      </div>\n    </div>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
});
// POST /contact
app.post("/contact", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, name, email, subject, message;
    return __generator(this, function (_b) {
        _a = req.body, name = _a.name, email = _a.email, subject = _a.subject, message = _a.message;
        if (!name || !email || !message) {
            res.redirect("/contact?error=Name%2C+email+and+message+are+required");
            return [2 /*return*/];
        }
        (0, mailer_1.sendContactNotification)(name, email, subject || "General Enquiry", message).catch(function () { });
        res.redirect("/contact?sent=1");
        return [2 /*return*/];
    });
}); });
// ── GET /about ─────────────────────────────────────────────────────────────────
app.get("/about", function (req, res) {
    res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>About ZeroScreen \u2014 Who We Are</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body>\n  ".concat(nav("about", req), "\n  <div class=\"container\" style=\"max-width:900px\">\n\n    <!-- Hero -->\n    <div class=\"about-hero\">\n      <div class=\"about-hero-tag\">Who We Are</div>\n      <h1 class=\"about-hero-title\">Built by traders,<br>for every kind of learner</h1>\n      <p class=\"about-hero-desc\">ZeroScreen is a free, open-access stock education &amp; research platform for the Indian market. We are <strong>not</strong> a SEBI-registered advisor. Everything here is built to help you <em>learn, practise, and build conviction</em> \u2014 not to tell you what to buy or sell.</p>\n      <div class=\"about-disclaimer-bar\">\n        \u26A0\uFE0F ZeroScreen is purely educational. It does not provide investment advice. All data is for learning purposes only. Invest at your own risk.\n      </div>\n    </div>\n\n    <!-- Mission -->\n    <div class=\"about-mission\">\n      <div class=\"about-mission-icon\">\uD83C\uDFAF</div>\n      <div>\n        <h2>Our Mission</h2>\n        <p>Most retail investors lose money not because markets are hard \u2014 but because they start trading before they understand the basics. We built ZeroScreen to bridge that gap: give everyone from a complete beginner to a seasoned investor the same professional-grade tools, for free.</p>\n      </div>\n    </div>\n\n    <!-- 3-tier audience cards -->\n    <h2 class=\"about-section-title\">ZeroScreen is built for three kinds of people</h2>\n    <div class=\"about-tiers\">\n\n      <div class=\"about-tier-card tier-beginner\">\n        <div class=\"tier-badge\" style=\"background:#dcfce7;color:#166534\">\uD83D\uDFE2 Beginners</div>\n        <h3>Start here \u2014 no real money needed</h3>\n        <p>You're new to stock markets or trading. You want to understand how it works before risking a single rupee.</p>\n        <ul class=\"tier-list\">\n          <li>\uD83D\uDCCB <strong>Paper Trade</strong> \u2014 simulate trades across 3 strategies with zero real money. Watch how they perform over time.</li>\n          <li>\uD83C\uDF93 <strong>Strategy Showcase</strong> \u2014 see exactly what \"ROCE > 20%\" or \"Debt-free\" means with real stock examples.</li>\n          <li>\uD83D\uDCE1 <strong>Signals</strong> \u2014 watch our live BANKNIFTY bot trade in real-time. Learn entry/exit logic by observation.</li>\n          <li>\uD83D\uDCEC <strong>Regular guidance</strong> \u2014 follow Today's Picks to see how analysis-backed ideas play out.</li>\n        </ul>\n        <a href=\"/my-paper-trade\" class=\"about-tier-cta\" style=\"background:#10b981\">Start Paper Trading \u2192</a>\n      </div>\n\n      <div class=\"about-tier-card tier-trader\">\n        <div class=\"tier-badge\" style=\"background:#fef9c3;color:#713f12\">\uD83D\uDFE1 Mid-Level Traders</div>\n        <h3>Use curated ideas and build your own strategy</h3>\n        <p>You understand markets but want structured ideas and tools to sharpen your edge without spending hours on research.</p>\n        <ul class=\"tier-list\">\n          <li>\uD83D\uDD25 <strong>Today's Picks</strong> \u2014 daily curated LONG/SHORT ideas with entry range, target and stop loss, backed by analysis.</li>\n          <li>\uD83D\uDD28 <strong>Strategy Builder</strong> \u2014 type a strategy in plain English (e.g. \"Debt-free pharma stocks with ROCE above 25%\") and get an instant screener filter set.</li>\n          <li>\uD83D\uDCCA <strong>Bot Performance Dashboard</strong> \u2014 study 5-year backtest data and real live trades to understand what edge looks like.</li>\n          <li>\u2696\uFE0F <strong>Stock Comparison</strong> \u2014 compare up to 5 NSE stocks side-by-side on every fundamental metric.</li>\n        </ul>\n        <a href=\"/today\" class=\"about-tier-cta\" style=\"background:#f59e0b;color:#1c1917\">See Today's Picks \u2192</a>\n      </div>\n\n      <div class=\"about-tier-card tier-investor\">\n        <div class=\"tier-badge\" style=\"background:#fee2e2;color:#991b1b\">\uD83D\uDD34 Serious Investors</div>\n        <h3>Deep-screen 1,700+ NSE stocks yourself</h3>\n        <p>You know what you're looking for and want the raw data and tools to do independent fundamental + technical research.</p>\n        <ul class=\"tier-list\">\n          <li>\uD83D\uDD0D <strong>Advanced Screener</strong> \u2014 14 filters (ROCE, ROE, D/E, Promoter %, P/E, Market Cap, Sector, Volume, 52-week range, profit growth) across 1,700+ NSE stocks.</li>\n          <li>\uD83D\uDCC8 <strong>Stock Detail Page</strong> \u2014 TradingView chart, 8 KPI cards, 6 financial charts, full metrics table, company info and live news.</li>\n          <li>\u2B50 <strong>Watchlists</strong> \u2014 save your research shortlist, track it across sessions.</li>\n          <li>\uD83D\uDD14 <strong>Alerts</strong> \u2014 save filter combos and get email digests every morning when stocks match your criteria.</li>\n        </ul>\n        <a href=\"/\" class=\"about-tier-cta\" style=\"background:#ef4444\">Open Screener \u2192</a>\n      </div>\n\n    </div>\n\n    <!-- Premium / AI Bot section -->\n    <div class=\"about-premium-section\">\n      <div class=\"about-premium-left\">\n        <div class=\"tier-badge\" style=\"background:#ede9fe;color:#4c1d95;margin-bottom:12px\">\u26A1 Advanced \u2014 AI Bot on Request</div>\n        <h2>Want the bot to trade for you?</h2>\n        <p>Beyond learning and research, we run a live BANKNIFTY intraday trading bot using two proprietary signal models. If you want the bot to execute on your account \u2014 that's a separate, request-based service with a subscription or commission arrangement.</p>\n        <p style=\"margin-top:10px;font-size:13px;color:var(--text-dim)\">This is not sold as a guaranteed system. Past backtest results do not guarantee future returns. You invest, you decide.</p>\n        <a href=\"/premium\" class=\"about-tier-cta\" style=\"background:#7c3aed;margin-top:20px;display:inline-block\">Learn About Premium \u2192</a>\n      </div>\n      <div class=\"about-premium-stats\">\n        <div class=\"ap-stat\"><div class=\"ap-val\">5 Yrs</div><div class=\"ap-label\">Backtested</div></div>\n        <div class=\"ap-stat\"><div class=\"ap-val\">2</div><div class=\"ap-label\">Signal Models</div></div>\n        <div class=\"ap-stat\"><div class=\"ap-val\">Live</div><div class=\"ap-label\">Real Trades</div></div>\n        <div class=\"ap-stat\"><div class=\"ap-val\">9:15\u20133:30</div><div class=\"ap-label\">Auto Hours</div></div>\n      </div>\n    </div>\n\n    <!-- What we are NOT -->\n    <div class=\"about-nolist-wrap\">\n      <h2>What ZeroScreen is <em>not</em></h2>\n      <div class=\"about-nolist\">\n        <div class=\"about-no-item\">\u274C Not a SEBI-registered investment advisor</div>\n        <div class=\"about-no-item\">\u274C Not a broker or trading platform \u2014 we don't execute trades on your behalf</div>\n        <div class=\"about-no-item\">\u274C Not a guarantee of returns \u2014 all data is historical and educational</div>\n        <div class=\"about-no-item\">\u274C Not affiliated with NSE, BSE, or SEBI</div>\n        <div class=\"about-no-item\">\u274C Not responsible for your investment decisions</div>\n      </div>\n      <p class=\"about-nolist-footer\">All stock data is sourced from public NSE APIs and fundamentals databases. Use it to learn, form your own views, and always consult a registered advisor for personal investment decisions.</p>\n    </div>\n\n    <!-- Contact CTA -->\n    <div class=\"about-contact-cta\">\n      <p>Questions, feedback, or want to collaborate?</p>\n      <a href=\"/contact\" class=\"btn-primary\">\uD83D\uDCEC Get in Touch \u2192</a>\n    </div>\n\n    <footer class=\"page-footer\">\n      \u00A9 2026 ZeroScreen \u2014 For educational and informational purposes only. Not SEBI registered. Not investment advice. Past data does not guarantee future returns. Trade at your own risk.\n    </footer>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
});
// ── Start ──────────────────────────────────────────────────────────────────────
var ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
// ── Bot data helpers ────────────────────────────────────────────────────────────
var BOT_DIR = "/home/ubuntu/trading-bot";
function readBotJSON(file, fallback) {
    if (fallback === void 0) { fallback = null; }
    try {
        var p = "".concat(BOT_DIR, "/").concat(file);
        if (!fs_1.default.existsSync(p))
            return fallback;
        return JSON.parse(fs_1.default.readFileSync(p, "utf-8"));
    }
    catch (_a) {
        return fallback;
    }
}
function getTodayIST() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function computeAnalytics(trades) {
    var _a, _b;
    var today = getTodayIST();
    var todayTrades = trades.filter(function (t) { return (t.date || "").startsWith(today); });
    var allWins = trades.filter(function (t) { return t.pnl > 0; }).length;
    var allTotal = trades.length;
    var equity = 0, peak = 0, maxDD = 0;
    var equityCurve = [];
    for (var _i = 0, trades_1 = trades; _i < trades_1.length; _i++) {
        var t = trades_1[_i];
        equity += (_a = t.pnl) !== null && _a !== void 0 ? _a : 0;
        if (equity > peak)
            peak = equity;
        var dd = peak - equity;
        if (dd > maxDD)
            maxDD = dd;
        equityCurve.push(parseFloat(equity.toFixed(1)));
    }
    var todayEq = 0, todayPeak = 0, todayMaxDD = 0;
    for (var _c = 0, todayTrades_1 = todayTrades; _c < todayTrades_1.length; _c++) {
        var t = todayTrades_1[_c];
        todayEq += (_b = t.pnl) !== null && _b !== void 0 ? _b : 0;
        if (todayEq > todayPeak)
            todayPeak = todayEq;
        var dd = todayPeak - todayEq;
        if (dd > todayMaxDD)
            todayMaxDD = dd;
    }
    return {
        today: {
            trades: todayTrades.length,
            wins: todayTrades.filter(function (t) { return t.pnl > 0; }).length,
            losses: todayTrades.filter(function (t) { return t.pnl <= 0; }).length,
            pnl: parseFloat(todayEq.toFixed(1)),
            maxDD: parseFloat(todayMaxDD.toFixed(1)),
        },
        allTime: {
            trades: allTotal,
            wins: allWins,
            losses: allTotal - allWins,
            winRate: allTotal > 0 ? parseFloat(((allWins / allTotal) * 100).toFixed(1)) : 0,
            pnl: parseFloat(equity.toFixed(1)),
            maxDD: parseFloat(maxDD.toFixed(1)),
        },
        equityCurve: equityCurve,
        recentTrades: trades.slice(-20).reverse(),
    };
}
// ── Technical Indicator Engine ─────────────────────────────────────────────────
// Compute EMA from closes
function computeEMA(closes, period) {
    var k = 2 / (period + 1);
    var ema = [];
    var prev = closes.slice(0, period).reduce(function (a, b) { return a + b; }, 0) / period;
    ema.push(prev);
    for (var i = period; i < closes.length; i++) {
        prev = closes[i] * k + prev * (1 - k);
        ema.push(prev);
    }
    return ema;
}
function computeSMA(closes, period) {
    var sma = [];
    for (var i = period - 1; i < closes.length; i++) {
        var sum = closes.slice(i - period + 1, i + 1).reduce(function (a, b) { return a + b; }, 0);
        sma.push(sum / period);
    }
    return sma;
}
function computeRSI(closes, period) {
    if (period === void 0) { period = 14; }
    if (closes.length < period + 1)
        return { value: 50, signal: "NEUTRAL" };
    var gains = 0, losses = 0;
    for (var i = 1; i <= period; i++) {
        var diff = closes[i] - closes[i - 1];
        if (diff > 0)
            gains += diff;
        else
            losses -= diff;
    }
    var avgGain = gains / period;
    var avgLoss = losses / period;
    for (var i = period + 1; i < closes.length; i++) {
        var diff = closes[i] - closes[i - 1];
        avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    }
    var rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    var rsi = parseFloat((100 - 100 / (1 + rs)).toFixed(2));
    return {
        value: rsi,
        signal: rsi < 30 ? "BUY" : rsi > 70 ? "SELL" : "NEUTRAL",
    };
}
function computeMACD(closes) {
    if (closes.length < 35)
        return { macd: 0, signal: 0, hist: 0, trend: "NEUTRAL" };
    var ema12 = computeEMA(closes, 12);
    var ema26 = computeEMA(closes, 26);
    var macdLine = [];
    var startIdx = closes.length - ema26.length;
    for (var i = 0; i < ema26.length; i++) {
        macdLine.push(ema12[startIdx + i] - ema26[i]);
    }
    var signalLine = computeEMA(macdLine, 9);
    var lastMacd = macdLine[macdLine.length - 1];
    var lastSignal = signalLine[signalLine.length - 1];
    var hist = lastMacd - lastSignal;
    // Crossover: check if previous histogram was negative and current is positive (or vice versa)
    var prevHist = macdLine[macdLine.length - 2] - signalLine[signalLine.length - 2];
    var trend = "NEUTRAL";
    if (prevHist < 0 && hist > 0)
        trend = "BUY";
    else if (prevHist > 0 && hist < 0)
        trend = "SELL";
    else if (hist > 0)
        trend = "BULLISH";
    else if (hist < 0)
        trend = "BEARISH";
    return { macd: parseFloat(lastMacd.toFixed(3)), signal: parseFloat(lastSignal.toFixed(3)), hist: parseFloat(hist.toFixed(3)), trend: trend };
}
function computeBollinger(closes, period, mult) {
    if (period === void 0) { period = 20; }
    if (mult === void 0) { mult = 2; }
    if (closes.length < period)
        return { upper: 0, lower: 0, mid: 0, signal: "NEUTRAL", pct: 50 };
    var slice = closes.slice(-period);
    var mid = slice.reduce(function (a, b) { return a + b; }, 0) / period;
    var variance = slice.reduce(function (a, b) { return a + Math.pow((b - mid), 2); }, 0) / period;
    var std = Math.sqrt(variance);
    var upper = mid + mult * std;
    var lower = mid - mult * std;
    var last = closes[closes.length - 1];
    var pct = parseFloat(((last - lower) / (upper - lower) * 100).toFixed(1));
    var signal = last < lower ? "BUY" : last > upper ? "SELL" : "NEUTRAL";
    return { upper: parseFloat(upper.toFixed(2)), lower: parseFloat(lower.toFixed(2)), mid: parseFloat(mid.toFixed(2)), signal: signal, pct: pct };
}
function computeEMACross(closes, fast, slow) {
    if (fast === void 0) { fast = 20; }
    if (slow === void 0) { slow = 50; }
    if (closes.length < slow + 1)
        return { fastEMA: 0, slowEMA: 0, signal: "NEUTRAL" };
    var emaFast = computeEMA(closes, fast);
    var emaSlow = computeEMA(closes, slow);
    var lastFast = emaFast[emaFast.length - 1];
    var lastSlow = emaSlow[emaSlow.length - 1];
    var prevFast = emaFast[emaFast.length - 2];
    var prevSlow = emaSlow[emaSlow.length - 2];
    var signal = "NEUTRAL";
    if (prevFast <= prevSlow && lastFast > lastSlow)
        signal = "BUY";
    else if (prevFast >= prevSlow && lastFast < lastSlow)
        signal = "SELL";
    else if (lastFast > lastSlow)
        signal = "BULLISH";
    else
        signal = "BEARISH";
    return { fastEMA: parseFloat(lastFast.toFixed(2)), slowEMA: parseFloat(lastSlow.toFixed(2)), signal: signal };
}
function computeSMACross(closes, fast, slow) {
    if (fast === void 0) { fast = 20; }
    if (slow === void 0) { slow = 50; }
    var smaFast = computeSMA(closes, fast);
    var smaSlow = computeSMA(closes, slow);
    if (smaFast.length < 2 || smaSlow.length < 2)
        return { fastSMA: 0, slowSMA: 0, signal: "NEUTRAL" };
    var lastFast = smaFast[smaFast.length - 1];
    var lastSlow = smaSlow[smaSlow.length - 1];
    var prevFast = smaFast[smaFast.length - 2];
    var prevSlow = smaSlow[smaSlow.length - 2];
    var signal = "NEUTRAL";
    if (prevFast <= prevSlow && lastFast > lastSlow)
        signal = "BUY";
    else if (prevFast >= prevSlow && lastFast < lastSlow)
        signal = "SELL";
    else if (lastFast > lastSlow)
        signal = "BULLISH";
    else
        signal = "BEARISH";
    return { fastSMA: parseFloat(lastFast.toFixed(2)), slowSMA: parseFloat(lastSlow.toFixed(2)), signal: signal };
}
function computeVWAP(highs, lows, closes, volumes) {
    var len = Math.min(highs.length, lows.length, closes.length, volumes.length);
    if (len < 1)
        return { vwap: 0, signal: "NEUTRAL" };
    var cumVP = 0, cumVol = 0;
    for (var i = 0; i < len; i++) {
        var tp = (highs[i] + lows[i] + closes[i]) / 3;
        cumVP += tp * volumes[i];
        cumVol += volumes[i];
    }
    var vwap = parseFloat((cumVol > 0 ? cumVP / cumVol : 0).toFixed(2));
    var last = closes[closes.length - 1];
    return { vwap: vwap, signal: last > vwap * 1.002 ? "BULLISH" : last < vwap * 0.998 ? "BEARISH" : "NEUTRAL" };
}
function computeSupertrend(highs, lows, closes, period, mult) {
    if (period === void 0) { period = 7; }
    if (mult === void 0) { mult = 3; }
    if (closes.length < period + 1)
        return { signal: "NEUTRAL", value: 0 };
    // ATR
    var atr = [];
    for (var i = 1; i < closes.length; i++) {
        var hl = highs[i] - lows[i];
        var hc = Math.abs(highs[i] - closes[i - 1]);
        var lc = Math.abs(lows[i] - closes[i - 1]);
        atr.push(Math.max(hl, hc, lc));
    }
    var atrEMA = computeEMA(atr.slice(-period * 3), period);
    var lastATR = atrEMA[atrEMA.length - 1];
    var lastClose = closes[closes.length - 1];
    var lastHigh = highs[highs.length - 1];
    var lastLow = lows[lows.length - 1];
    var mid = (lastHigh + lastLow) / 2;
    var upper = mid + mult * lastATR;
    var lower = mid - mult * lastATR;
    var prevClose = closes[closes.length - 2];
    // Simplified: if close > upper band area → bullish, < lower → bearish
    var signal = lastClose > upper ? "BULLISH" : lastClose < lower ? "BEARISH" :
        lastClose > mid && prevClose <= mid ? "BUY" :
            lastClose < mid && prevClose >= mid ? "SELL" : "NEUTRAL";
    return { signal: signal, value: parseFloat(mid.toFixed(2)) };
}
function computeStochastic(highs, lows, closes, kPeriod, dPeriod) {
    if (kPeriod === void 0) { kPeriod = 14; }
    if (dPeriod === void 0) { dPeriod = 3; }
    if (closes.length < kPeriod + dPeriod)
        return { k: 50, d: 50, signal: "NEUTRAL" };
    var kValues = [];
    for (var i = kPeriod - 1; i < closes.length; i++) {
        var highSlice = highs.slice(i - kPeriod + 1, i + 1);
        var lowSlice = lows.slice(i - kPeriod + 1, i + 1);
        var highest = Math.max.apply(Math, highSlice);
        var lowest = Math.min.apply(Math, lowSlice);
        kValues.push(highest === lowest ? 50 : ((closes[i] - lowest) / (highest - lowest)) * 100);
    }
    var dValues = computeSMA(kValues, dPeriod);
    var k = parseFloat(kValues[kValues.length - 1].toFixed(2));
    var d = parseFloat(dValues[dValues.length - 1].toFixed(2));
    var signal = k < 20 && d < 20 ? "BUY" : k > 80 && d > 80 ? "SELL" : k > d ? "BULLISH" : "BEARISH";
    return { k: k, d: d, signal: signal };
}
function computeWilliamsR(highs, lows, closes, period) {
    if (period === void 0) { period = 14; }
    if (closes.length < period)
        return { value: -50, signal: "NEUTRAL" };
    var highest = Math.max.apply(Math, highs.slice(-period));
    var lowest = Math.min.apply(Math, lows.slice(-period));
    var wr = highest === lowest ? -50 : ((highest - closes[closes.length - 1]) / (highest - lowest)) * -100;
    var value = parseFloat(wr.toFixed(2));
    return { value: value, signal: value < -80 ? "BUY" : value > -20 ? "SELL" : "NEUTRAL" };
}
function computeADX(highs, lows, closes, period) {
    if (period === void 0) { period = 14; }
    if (closes.length < period * 2)
        return { adx: 0, signal: "NEUTRAL" };
    var trArr = [];
    var dmPArr = [];
    var dmNArr = [];
    for (var i = 1; i < closes.length; i++) {
        trArr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
        var upMove = highs[i] - highs[i - 1];
        var dnMove = lows[i - 1] - lows[i];
        dmPArr.push(upMove > dnMove && upMove > 0 ? upMove : 0);
        dmNArr.push(dnMove > upMove && dnMove > 0 ? dnMove : 0);
    }
    var atr14 = computeEMA(trArr, period);
    var diP14 = computeEMA(dmPArr, period).map(function (v, i) { return atr14[i] > 0 ? (v / atr14[i]) * 100 : 0; });
    var diN14 = computeEMA(dmNArr, period).map(function (v, i) { return atr14[i] > 0 ? (v / atr14[i]) * 100 : 0; });
    var dx = diP14.map(function (v, i) { return (v + diN14[i]) > 0 ? Math.abs(v - diN14[i]) / (v + diN14[i]) * 100 : 0; });
    var adxArr = computeEMA(dx, period);
    var adx = parseFloat(adxArr[adxArr.length - 1].toFixed(2));
    var lastDiP = diP14[diP14.length - 1];
    var lastDiN = diN14[diN14.length - 1];
    var signal = adx > 25 ? (lastDiP > lastDiN ? "BULLISH" : "BEARISH") : "NEUTRAL";
    return { adx: adx, signal: signal };
}
// Yahoo Finance price history fetch with caching
var _yhCache = new Map();
var YH_CACHE_TTL = 20 * 60 * 1000; // 20 min
var _yhHostIdx = 0; // rotate between query1 and query2
var YH_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
var YH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://finance.yahoo.com",
    "Referer": "https://finance.yahoo.com/",
};
function fetchYahooHistory(symbol) {
    return __awaiter(this, void 0, void 0, function () {
        var nseSym, cached, parseResult, attempt, host, url, r, d, parsed, data, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    nseSym = symbol.replace(/\.NS$/, "") + ".NS";
                    cached = _yhCache.get(nseSym);
                    if (cached && Date.now() - cached.ts < YH_CACHE_TTL)
                        return [2 /*return*/, cached];
                    parseResult = function (d) {
                        var _a, _b, _c, _d;
                        var result = (_b = (_a = d === null || d === void 0 ? void 0 : d.chart) === null || _a === void 0 ? void 0 : _a.result) === null || _b === void 0 ? void 0 : _b[0];
                        if (!result)
                            return null;
                        var q0 = ((_d = (_c = result.indicators) === null || _c === void 0 ? void 0 : _c.quote) === null || _d === void 0 ? void 0 : _d[0]) || {};
                        var closes = (q0.close || []).filter(function (v) { return v != null; });
                        var highs = (q0.high || []).filter(function (v) { return v != null; });
                        var lows = (q0.low || []).filter(function (v) { return v != null; });
                        var volumes = (q0.volume || []).filter(function (v) { return v != null; });
                        if (closes.length < 15)
                            return null;
                        return { closes: closes, highs: highs, lows: lows, volumes: volumes };
                    };
                    attempt = 0;
                    _b.label = 1;
                case 1:
                    if (!(attempt < 2)) return [3 /*break*/, 7];
                    host = YH_HOSTS[(_yhHostIdx + attempt) % YH_HOSTS.length];
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 5, , 6]);
                    url = "https://".concat(host, "/v8/finance/chart/").concat(encodeURIComponent(nseSym), "?interval=1d&range=6mo&events=none");
                    return [4 /*yield*/, fetch(url, { headers: YH_HEADERS, signal: AbortSignal.timeout(10000) })];
                case 3:
                    r = _b.sent();
                    if (r.status === 429)
                        return [3 /*break*/, 6]; // try other host
                    if (!r.ok)
                        return [3 /*break*/, 6];
                    return [4 /*yield*/, r.json()];
                case 4:
                    d = _b.sent();
                    parsed = parseResult(d);
                    if (!parsed)
                        return [3 /*break*/, 6];
                    _yhHostIdx = (_yhHostIdx + 1) % YH_HOSTS.length; // advance rotation
                    data = __assign({ ts: Date.now() }, parsed);
                    _yhCache.set(nseSym, data);
                    return [2 /*return*/, data];
                case 5:
                    _a = _b.sent();
                    return [3 /*break*/, 6];
                case 6:
                    attempt++;
                    return [3 /*break*/, 1];
                case 7: return [2 /*return*/, null];
            }
        });
    });
}
// ── GET /api/indicator-scan ────────────────────────────────────────────────────
var _scanCache = new Map();
app.get("/api/indicator-scan", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var indicator, signal, universe, sector, cacheKey, cached, sectorClause, sectorArgs, stocks, results, BATCH, i, batch, settled;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                indicator = (req.query.indicator || "RSI").toUpperCase();
                signal = (req.query.signal || "BUY").toUpperCase();
                universe = parseInt(req.query.universe || "100");
                sector = (req.query.sector || "").trim();
                cacheKey = "".concat(indicator, "|").concat(signal, "|").concat(universe, "|").concat(sector);
                cached = _scanCache.get(cacheKey);
                if (cached && Date.now() - cached.ts < 60 * 60 * 1000) {
                    return [2 /*return*/, res.json({ results: cached.results, cached: true, indicator: indicator, signal: signal, scanned: universe })];
                }
                sectorClause = "";
                sectorArgs = [];
                if (sector) {
                    sectorClause = "AND (s.sector LIKE ? OR s.sector LIKE ?)";
                    sectorArgs.push("%".concat(sector, "%"), "".concat(sector, "%"));
                }
                return [4 /*yield*/, (0, db_1.dbAll)("SELECT s.symbol, s.company_name, s.market_cap, s.sector, p.price, p.change_pct\n     FROM stocks s LEFT JOIN prices p ON p.symbol = s.symbol\n     WHERE s.market_cap IS NOT NULL AND s.market_cap > 0 ".concat(sectorClause, "\n     ORDER BY s.market_cap DESC LIMIT ?"), __spreadArray(__spreadArray([], sectorArgs, true), [universe], false))];
            case 1:
                stocks = _a.sent();
                results = [];
                BATCH = 3;
                i = 0;
                _a.label = 2;
            case 2:
                if (!(i < stocks.length)) return [3 /*break*/, 7];
                if (!(i > 0)) return [3 /*break*/, 4];
                return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 350); })];
            case 3:
                _a.sent(); // 350ms between batches
                _a.label = 4;
            case 4:
                batch = stocks.slice(i, i + BATCH);
                return [4 /*yield*/, Promise.allSettled(batch.map(function (s) { return __awaiter(void 0, void 0, void 0, function () {
                        var hist, closes, highs, lows, volumes, sig, detail, value, r, r, r, r, r, r, r, r, r, r, wantedSignals;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, fetchYahooHistory(s.symbol)];
                                case 1:
                                    hist = _a.sent();
                                    if (!hist)
                                        return [2 /*return*/, null];
                                    closes = hist.closes, highs = hist.highs, lows = hist.lows, volumes = hist.volumes;
                                    sig = "NEUTRAL", detail = "", value = null;
                                    if (indicator === "RSI") {
                                        r = computeRSI(closes);
                                        sig = r.signal;
                                        value = r.value;
                                        detail = "RSI ".concat(r.value);
                                    }
                                    else if (indicator === "MACD") {
                                        r = computeMACD(closes);
                                        sig = r.trend;
                                        detail = "MACD ".concat(r.macd, " / Sig ").concat(r.signal, " / Hist ").concat(r.hist);
                                    }
                                    else if (indicator === "BOLLINGER") {
                                        r = computeBollinger(closes);
                                        sig = r.signal;
                                        value = r.pct;
                                        detail = "B% ".concat(r.pct, "% | Upper \u20B9").concat(r.upper, " Mid \u20B9").concat(r.mid, " Lower \u20B9").concat(r.lower);
                                    }
                                    else if (indicator === "EMA_CROSS") {
                                        r = computeEMACross(closes);
                                        sig = r.signal;
                                        detail = "EMA20 \u20B9".concat(r.fastEMA, " vs EMA50 \u20B9").concat(r.slowEMA);
                                    }
                                    else if (indicator === "SMA_CROSS") {
                                        r = computeSMACross(closes);
                                        sig = r.signal;
                                        detail = "SMA20 \u20B9".concat(r.fastSMA, " vs SMA50 \u20B9").concat(r.slowSMA);
                                    }
                                    else if (indicator === "SUPERTREND") {
                                        r = computeSupertrend(highs, lows, closes);
                                        sig = r.signal;
                                        detail = "Supertrend Mid \u20B9".concat(r.value);
                                    }
                                    else if (indicator === "STOCHASTIC") {
                                        r = computeStochastic(highs, lows, closes);
                                        sig = r.signal;
                                        value = r.k;
                                        detail = "%K ".concat(r.k, " / %D ").concat(r.d);
                                    }
                                    else if (indicator === "WILLIAMS_R") {
                                        r = computeWilliamsR(highs, lows, closes);
                                        sig = r.signal;
                                        value = r.value;
                                        detail = "W%R ".concat(r.value);
                                    }
                                    else if (indicator === "ADX") {
                                        r = computeADX(highs, lows, closes);
                                        sig = r.signal;
                                        value = r.adx;
                                        detail = "ADX ".concat(r.adx);
                                    }
                                    else if (indicator === "VWAP") {
                                        r = computeVWAP(highs, lows, closes, volumes);
                                        sig = r.signal;
                                        value = r.vwap;
                                        detail = "VWAP \u20B9".concat(r.vwap);
                                    }
                                    wantedSignals = signal === "ALL"
                                        ? ["BUY", "SELL", "BULLISH", "BEARISH", "NEUTRAL"]
                                        : signal === "BUY" ? ["BUY", "BULLISH"]
                                            : signal === "SELL" ? ["SELL", "BEARISH"]
                                                : [signal];
                                    if (!wantedSignals.includes(sig))
                                        return [2 /*return*/, null];
                                    return [2 /*return*/, {
                                            symbol: s.symbol,
                                            company: s.company_name,
                                            sector: s.sector,
                                            price: s.price,
                                            change_pct: s.change_pct,
                                            signal: sig,
                                            detail: detail,
                                            value: value,
                                        }];
                            }
                        });
                    }); }))];
            case 5:
                settled = _a.sent();
                settled.forEach(function (r) { if (r.status === "fulfilled" && r.value)
                    results.push(r.value); });
                _a.label = 6;
            case 6:
                i += BATCH;
                return [3 /*break*/, 2];
            case 7:
                _scanCache.set(cacheKey, { ts: Date.now(), results: results });
                res.json({ results: results, cached: false, indicator: indicator, signal: signal, scanned: stocks.length });
                return [2 /*return*/];
        }
    });
}); });
// ── GET /strategy-builder ──────────────────────────────────────────────────────
app.get("/strategy-builder", featureGate("feature_strategy_builder", "Strategy Builder"), function (req, res) {
    res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Strategy Builder \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n  <script src=\"https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js\"></script>\n  <style>\n    .sb-hero { background: linear-gradient(135deg,#7c3aed 0%,#4f46e5 60%,#059669 100%); padding: 56px 24px 48px; text-align:center; color:#fff; }\n    .sb-hero h1 { font-size: clamp(28px,5vw,46px); font-weight:800; letter-spacing:-1.5px; margin:0 0 12px; }\n    .sb-hero p  { opacity:.85; font-size:17px; max-width:560px; margin:0 auto; }\n    .sb-main { max-width:860px; margin:0 auto; padding:40px 20px 80px; }\n    .sb-input-card { background:var(--bg-card); border:2px solid var(--border); border-radius:var(--radius-lg); padding:28px; box-shadow:var(--shadow); }\n    .sb-label { font-size:13px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:8px; }\n    .sb-textarea { width:100%; min-height:120px; resize:vertical; border:1.5px solid var(--border); border-radius:12px; padding:14px 16px; font-size:15px; font-family:inherit; background:var(--bg2); color:var(--text); outline:none; transition:border 0.2s; box-sizing:border-box; }\n    .sb-textarea:focus { border-color:var(--accent); }\n    .sb-examples { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 18px; }\n    .sb-example { cursor:pointer; background:var(--bg4); border:1.5px solid var(--border); border-radius:20px; padding:6px 14px; font-size:12.5px; color:var(--text-muted); font-weight:500; transition:all 0.15s; }\n    .sb-example:hover { background:var(--accent); color:#fff; border-color:var(--accent); }\n    .sb-btn-parse { width:100%; padding:13px; background:var(--grad-brand); color:#fff; border:none; border-radius:12px; font-size:15px; font-weight:700; cursor:pointer; transition:opacity 0.2s; margin-top:4px; font-family:inherit; }\n    .sb-btn-parse:hover { opacity:.9; }\n    .sb-result { margin-top:28px; }\n    .sb-result-title { font-size:13px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:12px; }\n    .sb-filters { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px; }\n    .sb-filter-tag { background:var(--accent-glow,rgba(124,58,237,.12)); border:1.5px solid var(--accent); color:var(--accent); border-radius:20px; padding:5px 13px; font-size:12.5px; font-weight:600; }\n    .sb-empty { color:var(--text-muted); font-size:14px; padding:16px 0; }\n    .sb-btn-apply { display:inline-block; padding:11px 28px; background:var(--grad-brand); color:#fff; border-radius:12px; text-decoration:none; font-size:14px; font-weight:700; transition:opacity 0.2s; }\n    .sb-btn-apply:hover { opacity:.88; }\n    .sb-explain { font-size:13.5px; color:var(--text-muted); line-height:1.6; background:var(--bg2); border-radius:10px; padding:14px 16px; margin-bottom:16px; }\n    .sb-tips { background:var(--bg2); border-radius:var(--radius-lg); padding:24px; margin-top:32px; }\n    .sb-tips h3 { margin:0 0 12px; font-size:15px; color:var(--text); }\n    .sb-tips ul { margin:0; padding-left:18px; color:var(--text-muted); font-size:13.5px; line-height:2; }\n    .sb-tips code { background:var(--bg4); border-radius:5px; padding:1px 6px; font-size:12px; color:var(--accent); }\n  </style>\n</head>\n<body>\n  ".concat(nav("strategy-builder", req), "\n  <div class=\"sb-hero\">\n    <h1>\uD83D\uDD28 Strategy Builder</h1>\n    <p>Describe your ideal stock in plain English \u2014 we'll convert it into screener filters instantly.</p>\n  </div>\n  <div class=\"sb-main\">\n    <div class=\"sb-input-card\">\n      <div class=\"sb-label\">Describe your strategy</div>\n      <textarea class=\"sb-textarea\" id=\"sb-input\" placeholder=\"e.g. Large cap pharma stocks with ROCE above 20 and debt free, profitable for 3 years\u2026\"></textarea>\n      <div class=\"sb-label\" style=\"margin-top:16px\">Try an example</div>\n      <div class=\"sb-examples\" id=\"sb-examples\">\n        <span class=\"sb-example\">Debt-free large cap with high ROCE</span>\n        <span class=\"sb-example\">Pharma stocks with promoter above 60%</span>\n        <span class=\"sb-example\">IT stocks with ROE above 20 and PE below 30</span>\n        <span class=\"sb-example\">Undervalued small cap with growing profits</span>\n        <span class=\"sb-example\">Top gainers today above 2%</span>\n        <span class=\"sb-example\">Dividend paying blue chips</span>\n        <span class=\"sb-example\">Near 52-week high with strong fundamentals</span>\n        <span class=\"sb-example\">Banking stocks below \u20B9500</span>\n      </div>\n      <button class=\"sb-btn-parse\" id=\"sb-parse-btn\" onclick=\"parseStrategy()\">Parse Strategy \u2192</button>\n    </div>\n\n    <div class=\"sb-result\" id=\"sb-result\" style=\"display:none\">\n      <div class=\"sb-result-title\">Parsed Filters</div>\n      <div class=\"sb-explain\" id=\"sb-explain\"></div>\n      <div class=\"sb-filters\" id=\"sb-filters\"></div>\n      <a href=\"#\" class=\"sb-btn-apply\" id=\"sb-apply-btn\">Apply to Screener \u2192</a>\n    </div>\n\n    <div class=\"sb-result\" id=\"sb-no-match\" style=\"display:none\">\n      <div class=\"sb-empty\">No filters could be parsed. Try being more specific \u2014 e.g., <em>\"ROCE above 20, debt free, large cap\"</em>.</div>\n    </div>\n\n    <div class=\"sb-tips\">\n      <h3>\uD83D\uDCA1 Tips for better results</h3>\n      <ul>\n        <li>Use numbers: <code>ROCE above 20</code>, <code>PE below 25</code>, <code>price below \u20B9500</code></li>\n        <li>Mention company size: <code>large cap</code>, <code>mid cap</code>, <code>small cap</code></li>\n        <li>Reference sectors: <code>pharma</code>, <code>IT</code>, <code>banking</code>, <code>auto</code>, <code>FMCG</code></li>\n        <li>Use quality terms: <code>debt free</code>, <code>profitable</code>, <code>growing profit</code></li>\n        <li>Use promoter: <code>high promoter</code>, <code>promoter above 60</code></li>\n        <li>Mix criteria: <code>large cap IT with high ROCE, low debt and growing profits</code></li>\n      </ul>\n    </div>\n\n    <!-- \u2500\u2500 INDICATOR SCANNER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->\n    <div class=\"ind-scanner-wrap\">\n      <div class=\"ind-scanner-header\">\n        <div class=\"ind-scanner-title\">\n          <span class=\"ind-scanner-icon\">\uD83D\uDCC8</span>\n          <div>\n            <h2>Technical Indicator Scanner</h2>\n            <p>Pick any indicator \u2014 scan top NSE stocks in real-time and find BUY / SELL signals right now.</p>\n          </div>\n        </div>\n        <span class=\"tier-pill tier-mid\">\uD83D\uDFE1 Traders</span>\n      </div>\n\n      <div class=\"ind-scanner-controls\">\n        <div class=\"ind-ctrl-group\">\n          <label class=\"ind-ctrl-label\">Indicator</label>\n          <select id=\"ind-indicator\" class=\"ind-select\">\n            <optgroup label=\"Momentum\">\n              <option value=\"RSI\">RSI \u2014 Relative Strength Index (14)</option>\n              <option value=\"STOCHASTIC\">Stochastic Oscillator (%K/%D)</option>\n              <option value=\"WILLIAMS_R\">Williams %R (14)</option>\n            </optgroup>\n            <optgroup label=\"Trend\">\n              <option value=\"MACD\">MACD (12,26,9)</option>\n              <option value=\"EMA_CROSS\">EMA Crossover (20 / 50)</option>\n              <option value=\"SMA_CROSS\">SMA Crossover (20 / 50)</option>\n              <option value=\"SUPERTREND\">Supertrend (7, 3\u00D7ATR)</option>\n              <option value=\"ADX\">ADX \u2014 Trend Strength (14)</option>\n            </optgroup>\n            <optgroup label=\"Volatility / Volume\">\n              <option value=\"BOLLINGER\">Bollinger Bands (20, 2\u03C3)</option>\n              <option value=\"VWAP\">VWAP Position</option>\n            </optgroup>\n          </select>\n        </div>\n\n        <div class=\"ind-ctrl-group\">\n          <label class=\"ind-ctrl-label\">Signal</label>\n          <select id=\"ind-signal\" class=\"ind-select\">\n            <option value=\"BUY\">\uD83D\uDFE2 BUY / Bullish</option>\n            <option value=\"SELL\">\uD83D\uDD34 SELL / Bearish</option>\n            <option value=\"ALL\">\u26AA All Signals</option>\n          </select>\n        </div>\n\n        <div class=\"ind-ctrl-group\">\n          <label class=\"ind-ctrl-label\">Universe</label>\n          <select id=\"ind-universe\" class=\"ind-select\">\n            <option value=\"50\">Nifty 50 \u2014 Top 50 stocks (fastest)</option>\n            <option value=\"100\" selected>Nifty 100 \u2014 Top 100 stocks</option>\n            <option value=\"200\">Nifty 200 \u2014 Top 200 stocks</option>\n            <option value=\"500\">Nifty 500 \u2014 Top 500 stocks (slow)</option>\n          </select>\n        </div>\n\n        <div class=\"ind-ctrl-group\">\n          <label class=\"ind-ctrl-label\">Sector (optional)</label>\n          <select id=\"ind-sector\" class=\"ind-select\">\n            <option value=\"\">All Sectors</option>\n            <option>Banks</option>\n            <option>IT</option>\n            <option>Pharmaceuticals</option>\n            <option>Auto</option>\n            <option>FMCG</option>\n            <option>Infrastructure</option>\n            <option>Metals</option>\n            <option>Energy</option>\n            <option>Realty</option>\n            <option>Chemicals</option>\n            <option>Telecom</option>\n            <option>Cement</option>\n            <option>Finance</option>\n            <option>Insurance</option>\n          </select>\n        </div>\n      </div>\n\n      <!-- Indicator description -->\n      <div class=\"ind-desc-bar\" id=\"ind-desc-bar\">\n        <strong>RSI (14)</strong> \u2014 Values below 30 indicate oversold (BUY signal), above 70 indicate overbought (SELL signal). Based on 14-day closing prices.\n      </div>\n\n      <button class=\"ind-scan-btn\" id=\"ind-scan-btn\" onclick=\"runIndicatorScan()\">\n        <span class=\"ind-scan-icon\">\u26A1</span> Scan Now\n      </button>\n\n      <!-- Results -->\n      <div id=\"ind-results\" style=\"display:none\">\n        <div class=\"ind-results-meta\" id=\"ind-results-meta\"></div>\n        <div class=\"ind-results-table-wrap\">\n          <table class=\"ind-results-table\" id=\"ind-results-table\">\n            <thead id=\"ind-results-thead\"></thead>\n            <tbody id=\"ind-results-tbody\"></tbody>\n          </table>\n        </div>\n        <p class=\"ind-disclaimer\">\u26A0\uFE0F Indicators are computed from historical daily closing prices. This is for educational purposes only \u2014 not investment advice. Always do your own research.</p>\n      </div>\n      <div id=\"ind-loading\" style=\"display:none\" class=\"ind-loading\">\n        <div class=\"ind-spinner\"></div>\n        <span id=\"ind-loading-text\">Fetching price history and computing signals\u2026</span>\n      </div>\n      <div id=\"ind-error\" style=\"display:none\" class=\"ind-error\"></div>\n    </div>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n  <script>\n  // \u2500\u2500 Indicator descriptions \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  var IND_DESCS = {\n    RSI:        '<strong>RSI (14)</strong> \u2014 Values below 30 = oversold (BUY), above 70 = overbought (SELL). Measures speed and change of price movements.',\n    MACD:       '<strong>MACD (12,26,9)</strong> \u2014 When MACD line crosses above signal line = BUY, crosses below = SELL. Histogram shows momentum strength.',\n    BOLLINGER:  '<strong>Bollinger Bands (20, 2\u03C3)</strong> \u2014 Price below lower band = oversold (BUY), above upper band = overbought (SELL). B% shows position within bands.',\n    EMA_CROSS:  '<strong>EMA Crossover (20/50)</strong> \u2014 When EMA20 crosses above EMA50 = BUY signal. When EMA20 crosses below EMA50 = SELL signal.',\n    SMA_CROSS:  '<strong>SMA Crossover (20/50)</strong> \u2014 Golden Cross (SMA20 > SMA50) = BUY. Death Cross (SMA20 < SMA50) = SELL.',\n    SUPERTREND: '<strong>Supertrend (7, 3\u00D7ATR)</strong> \u2014 Price above supertrend line = BULLISH. Price flips below line = SELL signal.',\n    STOCHASTIC: '<strong>Stochastic (14, 3)</strong> \u2014 %K and %D below 20 = oversold (BUY). Above 80 = overbought (SELL). %K crossing %D gives signal.',\n    WILLIAMS_R: '<strong>Williams %R (14)</strong> \u2014 Values below \u221280 = oversold (BUY), above \u221220 = overbought (SELL). Range: 0 to \u2212100.',\n    ADX:        '<strong>ADX (14)</strong> \u2014 ADX > 25 = strong trend. +DI > \u2212DI = bullish trend. Helps identify trending vs ranging markets.',\n    VWAP:       '<strong>VWAP</strong> \u2014 Price above VWAP = bullish momentum. Price below VWAP = bearish. Calculated from 6 months of daily OHLCV.',\n  };\n  var IND_COLS = {\n    RSI:        ['Symbol','Company','Sector','Price','Chg%','Signal','RSI Value'],\n    MACD:       ['Symbol','Company','Sector','Price','Chg%','Signal','Detail'],\n    BOLLINGER:  ['Symbol','Company','Sector','Price','Chg%','Signal','B% Position','Detail'],\n    EMA_CROSS:  ['Symbol','Company','Sector','Price','Chg%','Signal','EMA20 vs EMA50'],\n    SMA_CROSS:  ['Symbol','Company','Sector','Price','Chg%','Signal','SMA20 vs SMA50'],\n    SUPERTREND: ['Symbol','Company','Sector','Price','Chg%','Signal','Detail'],\n    STOCHASTIC: ['Symbol','Company','Sector','Price','Chg%','Signal','%K Value','Detail'],\n    WILLIAMS_R: ['Symbol','Company','Sector','Price','Chg%','Signal','W%R Value'],\n    ADX:        ['Symbol','Company','Sector','Price','Chg%','Trend','ADX Value'],\n    VWAP:       ['Symbol','Company','Sector','Price','Chg%','Signal','VWAP'],\n  };\n\n  document.getElementById('ind-indicator').addEventListener('change', function() {\n    document.getElementById('ind-desc-bar').innerHTML = IND_DESCS[this.value] || '';\n  });\n\n  function signalBadge(sig) {\n    var cls = sig === 'BUY' || sig === 'BULLISH' ? 'ind-sig-buy'\n            : sig === 'SELL' || sig === 'BEARISH' ? 'ind-sig-sell'\n            : 'ind-sig-neutral';\n    return '<span class=\"ind-sig-badge ' + cls + '\">' + sig + '</span>';\n  }\n\n  async function runIndicatorScan() {\n    var indicator = document.getElementById('ind-indicator').value;\n    var signal    = document.getElementById('ind-signal').value;\n    var universe  = document.getElementById('ind-universe').value;\n    var sector    = document.getElementById('ind-sector').value;\n\n    document.getElementById('ind-results').style.display = 'none';\n    document.getElementById('ind-error').style.display   = 'none';\n    document.getElementById('ind-loading').style.display = 'flex';\n    document.getElementById('ind-scan-btn').disabled = true;\n\n    var msgs = ['Fetching 6-month price history\u2026','Computing ' + indicator + ' signals\u2026','Filtering ' + signal + ' signals\u2026','This may take 1-2 minutes for large universes\u2026'];\n    var mi = 0;\n    var msgTimer = setInterval(function() {\n      mi = (mi + 1) % msgs.length;\n      document.getElementById('ind-loading-text').textContent = msgs[mi];\n    }, 1800);\n\n    try {\n      var qs = 'indicator=' + indicator + '&signal=' + signal + '&universe=' + universe + (sector ? '&sector=' + encodeURIComponent(sector) : '');\n      var res = await fetch('/api/indicator-scan?' + qs);\n      if (!res.ok) throw new Error('Server error ' + res.status);\n      var data = await res.json();\n\n      clearInterval(msgTimer);\n      document.getElementById('ind-loading').style.display = 'none';\n      document.getElementById('ind-scan-btn').disabled = false;\n\n      if (!data.results || data.results.length === 0) {\n        document.getElementById('ind-error').style.display = 'block';\n        document.getElementById('ind-error').textContent = 'No stocks matched ' + signal + ' signal for ' + indicator + ' in top ' + universe + ' stocks' + (sector ? ' (' + sector + ')' : '') + '.';\n        return;\n      }\n\n      var cols = IND_COLS[indicator] || ['Symbol','Company','Sector','Price','Chg%','Signal','Detail'];\n      var meta = data.results.length + ' stock' + (data.results.length > 1 ? 's' : '') + ' matched \u00B7 Scanned ' + (data.scanned || universe) + ' stocks \u00B7 ' + (data.cached ? 'Cached result' : 'Live computation') + ' \u00B7 ' + new Date().toLocaleTimeString('en-IN');\n      document.getElementById('ind-results-meta').textContent = meta;\n\n      // Build table header\n      document.getElementById('ind-results-thead').innerHTML = '<tr>' + cols.map(function(c){ return '<th>' + c + '</th>'; }).join('') + '</tr>';\n\n      // Build table body\n      var rows = data.results.map(function(r) {\n        var chgCls = r.change_pct >= 0 ? 'pos' : 'neg';\n        var chgStr = (r.change_pct >= 0 ? '+' : '') + (r.change_pct || 0).toFixed(2) + '%';\n        var priceStr = r.price ? '\u20B9' + r.price.toLocaleString('en-IN', {minimumFractionDigits:2,maximumFractionDigits:2}) : '\u2014';\n        var sectorStr = r.sector || '\u2014';\n        var base = '<td><a href=\"/stock/' + r.symbol + '\" class=\"ind-sym-link\">' + r.symbol + '</a></td>'\n          + '<td>' + (r.company || '\u2014') + '</td>'\n          + '<td><span class=\"sector-badge\" style=\"font-size:10px\">' + sectorStr + '</span></td>'\n          + '<td>' + priceStr + '</td>'\n          + '<td class=\"' + chgCls + '\">' + chgStr + '</td>'\n          + '<td>' + signalBadge(r.signal) + '</td>';\n\n        if (indicator === 'RSI')       return '<tr>' + base + '<td>' + (r.value || '\u2014') + '</td></tr>';\n        if (indicator === 'BOLLINGER') return '<tr>' + base + '<td>' + (r.value != null ? r.value + '%' : '\u2014') + '</td><td style=\"font-size:11px\">' + (r.detail || '') + '</td></tr>';\n        if (indicator === 'STOCHASTIC') return '<tr>' + base + '<td>' + (r.value || '\u2014') + '</td><td style=\"font-size:11px\">' + (r.detail || '') + '</td></tr>';\n        if (indicator === 'WILLIAMS_R') return '<tr>' + base + '<td>' + (r.value || '\u2014') + '</td></tr>';\n        if (indicator === 'ADX')       return '<tr>' + base + '<td>' + (r.value || '\u2014') + '</td></tr>';\n        if (indicator === 'VWAP')      return '<tr>' + base + '<td>' + (r.value ? '\u20B9' + r.value : '\u2014') + '</td></tr>';\n        return '<tr>' + base + '<td style=\"font-size:11px\">' + (r.detail || '') + '</td></tr>';\n      }).join('');\n\n      document.getElementById('ind-results-tbody').innerHTML = rows;\n      document.getElementById('ind-results').style.display = 'block';\n    } catch(e) {\n      clearInterval(msgTimer);\n      document.getElementById('ind-loading').style.display = 'none';\n      document.getElementById('ind-scan-btn').disabled = false;\n      document.getElementById('ind-error').style.display = 'block';\n      document.getElementById('ind-error').textContent = 'Error: ' + e.message;\n    }\n  }\n\n  // NLP Filter Parser\n  var EXAMPLES = document.querySelectorAll('.sb-example');\n  EXAMPLES.forEach(function(el) {\n    el.addEventListener('click', function() {\n      document.getElementById('sb-input').value = el.textContent;\n      parseStrategy();\n    });\n  });\n\n  function parseStrategy() {\n    var text = document.getElementById('sb-input').value.trim();\n    if (!text) return;\n    var params = {};\n    var labels = {};\n    var t = text.toLowerCase();\n\n    // \u2500\u2500 ROCE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    var m;\n    m = t.match(/roce\\s*(?:above|>|greater than|more than|over|>=)\\s*(\\d+)/);\n    if (m) { params.minRoce = m[1]; labels['ROCE \u2265 ' + m[1] + '%'] = true; }\n    m = t.match(/roce\\s*(?:below|<|less than|under|<=)\\s*(\\d+)/);\n    if (m) { params.maxRoce = m[1]; labels['ROCE \u2264 ' + m[1] + '%'] = true; }\n\n    // \u2500\u2500 ROE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    m = t.match(/roe\\s*(?:above|>|greater than|more than|over|>=)\\s*(\\d+)/);\n    if (m) { params.minRoe = m[1]; labels['ROE \u2265 ' + m[1] + '%'] = true; }\n\n    // \u2500\u2500 Debt \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    if (/debt.?free|no debt|zero debt/i.test(t)) {\n      params.maxDe = '0.1'; labels['Debt-Free (D/E \u2264 0.1)'] = true;\n    } else {\n      m = t.match(/d\\/e\\s*(?:below|<|less than|under)\\s*([\\d.]+)/);\n      if (m) { params.maxDe = m[1]; labels['D/E \u2264 ' + m[1]] = true; }\n      m = t.match(/low debt|minimal debt/);\n      if (m) { params.maxDe = '0.5'; labels['Low Debt (D/E \u2264 0.5)'] = true; }\n    }\n\n    // \u2500\u2500 Market Cap \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    if (/large.?cap|bluechip|blue.?chip|nifty 50/i.test(t)) {\n      params.minPrice = '500'; labels['Large Cap (Price \u2265 \u20B9500)'] = true;\n    } else if (/mid.?cap/i.test(t)) {\n      params.minPrice = '100'; params.maxPrice = '1500'; labels['Mid Cap (\u20B9100\u20131500)'] = true;\n    } else if (/small.?cap/i.test(t)) {\n      params.maxPrice = '300'; labels['Small Cap (Price \u2264 \u20B9300)'] = true;\n    } else if (/micro.?cap|penny/i.test(t)) {\n      params.maxPrice = '50'; labels['Micro Cap / Penny (Price \u2264 \u20B950)'] = true;\n    }\n\n    // \u2500\u2500 Profitability \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    if (/all profitable|consistently profitable|profit(?:able)?(?: for| every| all)/i.test(t)) {\n      params.allProfit = '1'; labels['Consistently Profitable'] = true;\n    }\n    if (/growing profit|profit.?growing|profit.?uptrend|increasing profit|profit.?increase|earnings? growth/i.test(t)) {\n      params.uptrend = '1'; labels['Growing Profits (Uptrend)'] = true;\n    }\n\n    // \u2500\u2500 P/E \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    m = t.match(/p\\/e\\s*(?:above|>|more than|greater than)\\s*(\\d+)/);\n    if (m) { params.minPe = m[1]; labels['P/E \u2265 ' + m[1]] = true; }\n    m = t.match(/p\\/e\\s*(?:below|<|less than|under)\\s*(\\d+)/);\n    if (m) { params.maxPe = m[1]; labels['P/E \u2264 ' + m[1]] = true; }\n    m = t.match(/pe\\s*(?:above|>|more than|greater than)\\s*(\\d+)/);\n    if (m && !params.minPe) { params.minPe = m[1]; labels['P/E \u2265 ' + m[1]] = true; }\n    m = t.match(/pe\\s*(?:below|<|less than|under)\\s*(\\d+)/);\n    if (m && !params.maxPe) { params.maxPe = m[1]; labels['P/E \u2264 ' + m[1]] = true; }\n    if (/undervalued|cheap stock/i.test(t) && !params.maxPe) {\n      params.maxPe = '15'; labels['P/E \u2264 15 (Undervalued)'] = true;\n    }\n\n    // \u2500\u2500 Promoter \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    m = t.match(/promoter(?:\\s*holding)?\\s*(?:above|>|greater than|more than|over|>=)\\s*(\\d+)/);\n    if (m) { params.minPromoter = m[1]; labels['Promoter \u2265 ' + m[1] + '%'] = true; }\n    else if (/high promoter|strong promoter|promoter.backed/i.test(t)) {\n      params.minPromoter = '60'; labels['High Promoter (\u226560%)'] = true;\n    }\n\n    // \u2500\u2500 Dividend \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    if (/dividend|income stock|dividend.paying|yield/i.test(t)) {\n      params.minDivYield = '0.5'; labels['Dividend Yield \u2265 0.5%'] = true;\n    }\n\n    // \u2500\u2500 Price \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    m = t.match(/price\\s*(?:above|>|over|more than)\\s*[\u20B9]?(\\d+)/);\n    if (m) { params.minPrice = m[1]; labels['Price \u2265 \u20B9' + m[1]] = true; }\n    m = t.match(/price\\s*(?:below|<|under|less than)\\s*[\u20B9]?(\\d+)/);\n    if (m) { params.maxPrice = m[1]; labels['Price \u2264 \u20B9' + m[1]] = true; }\n    m = t.match(/(?:below|under|less than)\\s*[\u20B9](\\d+)/);\n    if (m && !params.maxPrice) { params.maxPrice = m[1]; labels['Price \u2264 \u20B9' + m[1]] = true; }\n\n    // \u2500\u2500 Change % \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    m = t.match(/(?:up|gain|risen?|change)\\s*(?:more than|above|>)\\s*(\\d+)%/);\n    if (m) { params.minChg = m[1]; labels['Change \u2265 +' + m[1] + '%'] = true; }\n    if (/top gainers?|biggest gainers?/i.test(t) && !params.minChg) {\n      params.minChg = '2'; labels['Top Gainers (\u2265+2%)'] = true;\n    }\n    if (/top losers?|biggest losers?/i.test(t)) {\n      params.maxChg = '-2'; labels['Top Losers (\u2264-2%)'] = true;\n    }\n\n    // \u2500\u2500 52-week \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    if (/52.?week high|near high|all.?time high|hitting high/i.test(t)) {\n      params.near52H = '5'; labels['Near 52-Week High (\u00B15%)'] = true;\n    }\n    if (/52.?week low|near low|at low/i.test(t)) {\n      params.near52L = '5'; labels['Near 52-Week Low (\u00B15%)'] = true;\n    }\n\n    // \u2500\u2500 Sectors \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    var sectorMap = [\n      [/\\bbanking?\\b|bank stocks?|psu bank/i, 'Banks'],\n      [/\\bit\\b|information tech|software/i, 'IT'],\n      [/pharma|pharmaceutical|healthcare/i, 'Pharmaceuticals'],\n      [/auto\\b|automobile|car stocks?/i, 'Auto'],\n      [/fmcg|consumer goods|consumer staple/i, 'FMCG'],\n      [/infra|infrastructure/i, 'Infrastructure'],\n      [/metal|steel|mining|aluminium/i, 'Metals'],\n      [/energy|power|electricity|solar/i, 'Energy'],\n      [/realty|real estate|housing/i, 'Realty'],\n      [/chemical/i, 'Chemicals'],\n      [/telecom|telecommunication/i, 'Telecom'],\n      [/cement/i, 'Cement'],\n      [/nbfc|finance co/i, 'Finance'],\n      [/insurance/i, 'Insurance'],\n    ];\n    for (var si = 0; si < sectorMap.length; si++) {\n      if (sectorMap[si][0].test(t)) {\n        params.sector = sectorMap[si][1];\n        labels[sectorMap[si][1] + ' Sector'] = true;\n        break;\n      }\n    }\n\n    // \u2500\u2500 Strong / quality shortcuts \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    if (/strong fundamental|quality stock|fundamentally strong/i.test(t)) {\n      if (!params.minRoce) { params.minRoce = '15'; labels['ROCE \u2265 15%'] = true; }\n      if (!params.maxDe)   { params.maxDe   = '1';  labels['D/E \u2264 1']    = true; }\n      params.allProfit = '1'; labels['Consistently Profitable'] = true;\n    }\n\n    // \u2500\u2500 Sort hints \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    if (/sort.*roce|high roce first/i.test(t)) params.sortBy = 'roce';\n    if (/sort.*volume|high volume first/i.test(t)) params.sortBy = 'volume';\n    if (/sort.*pe|low pe first/i.test(t)) { params.sortBy = 'pe'; params.sortDir = 'asc'; }\n\n    var labelKeys = Object.keys(labels);\n    var resultDiv  = document.getElementById('sb-result');\n    var noMatchDiv = document.getElementById('sb-no-match');\n    var filtersDiv = document.getElementById('sb-filters');\n    var explainDiv = document.getElementById('sb-explain');\n    var applyBtn   = document.getElementById('sb-apply-btn');\n\n    if (!labelKeys.length) {\n      resultDiv.style.display  = 'none';\n      noMatchDiv.style.display = 'block';\n      return;\n    }\n\n    noMatchDiv.style.display = 'none';\n    resultDiv.style.display  = 'block';\n    explainDiv.textContent   = 'Found ' + labelKeys.length + ' filter' + (labelKeys.length>1?'s':'') + ' from your description.';\n    filtersDiv.innerHTML     = labelKeys.map(function(l){ return '<span class=\"sb-filter-tag\">'+l+'</span>'; }).join('');\n\n    var qs = new URLSearchParams(params).toString();\n    applyBtn.href = '/?' + qs + '&strategy=custom';\n  }\n  </script>\n</body>\n</html>"));
});
// ── GET /admin/analytics ───────────────────────────────────────────────────────
app.get("/admin/analytics", requireAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var daily, topPages, todayRow, todayViews, todayUnique, todayUniqueV, recent, totalAllTime, totalV;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0: return [4 /*yield*/, (0, db_1.dbAll)("SELECT date(created_at) as day,\n            COUNT(*) as views,\n            COUNT(DISTINCT ip_hash) as unique_visitors\n     FROM page_views\n     WHERE created_at >= date('now','localtime','-14 days')\n     GROUP BY date(created_at) ORDER BY day DESC")];
            case 1:
                daily = _d.sent();
                return [4 /*yield*/, (0, db_1.dbAll)("SELECT path, COUNT(*) as views FROM page_views\n     WHERE created_at >= date('now','localtime','-30 days')\n     GROUP BY path ORDER BY views DESC LIMIT 15")];
            case 2:
                topPages = _d.sent();
                return [4 /*yield*/, (0, db_1.dbAll)("SELECT COUNT(*) as c FROM page_views WHERE date(created_at) = date('now','localtime')")];
            case 3:
                todayRow = _d.sent();
                todayViews = ((_a = todayRow[0]) === null || _a === void 0 ? void 0 : _a.c) || 0;
                return [4 /*yield*/, (0, db_1.dbAll)("SELECT COUNT(DISTINCT ip_hash) as c FROM page_views WHERE date(created_at) = date('now','localtime')")];
            case 4:
                todayUnique = _d.sent();
                todayUniqueV = ((_b = todayUnique[0]) === null || _b === void 0 ? void 0 : _b.c) || 0;
                return [4 /*yield*/, (0, db_1.dbAll)("SELECT path, ip_hash, substr(user_agent,1,60) as user_agent, created_at\n     FROM page_views ORDER BY id DESC LIMIT 30")];
            case 5:
                recent = _d.sent();
                return [4 /*yield*/, (0, db_1.dbAll)("SELECT COUNT(*) as c FROM page_views")];
            case 6:
                totalAllTime = _d.sent();
                totalV = ((_c = totalAllTime[0]) === null || _c === void 0 ? void 0 : _c.c) || 0;
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Analytics \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body>\n  ".concat(nav("admin-analytics", req), "\n  <div class=\"container\" style=\"max-width:1100px;padding:32px 20px 80px\">\n    <h1 style=\"font-size:26px;font-weight:800;margin-bottom:6px\">\uD83D\uDCCA Visitor Analytics</h1>\n    <p style=\"color:var(--text-muted);margin-bottom:28px\">Page view tracking \u00B7 Last 30 days</p>\n\n    <div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:32px\">\n      ").concat([
                    ["Today's Views", todayViews],
                    ["Today Unique", todayUniqueV],
                    ["All-Time Views", totalV],
                    ["Pages Tracked", topPages.length],
                ].map(function (_a) {
                    var k = _a[0], v = _a[1];
                    return "\n        <div style=\"background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px 18px\">\n          <div style=\"font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px\">".concat(k, "</div>\n          <div style=\"font-size:28px;font-weight:800;color:var(--accent)\">").concat(v, "</div>\n        </div>");
                }).join(""), "\n    </div>\n\n    <div style=\"display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px\">\n      <div style=\"background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px\">\n        <h3 style=\"margin:0 0 16px;font-size:15px\">Top Pages (30d)</h3>\n        <table style=\"width:100%;border-collapse:collapse;font-size:13px\">\n          ").concat(topPages.map(function (p) { return "<tr style=\"border-bottom:1px solid var(--border)\">\n            <td style=\"padding:7px 0;color:var(--text)\">".concat(esc(p.path), "</td>\n            <td style=\"padding:7px 0;text-align:right;color:var(--accent);font-weight:700\">").concat(p.views, "</td>\n          </tr>"); }).join(""), "\n        </table>\n      </div>\n      <div style=\"background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px\">\n        <h3 style=\"margin:0 0 16px;font-size:15px\">Daily Breakdown (14d)</h3>\n        <table style=\"width:100%;border-collapse:collapse;font-size:13px\">\n          <tr style=\"color:var(--text-muted);font-size:11px;text-transform:uppercase\">\n            <th style=\"padding:4px 0;text-align:left\">Date</th>\n            <th style=\"padding:4px 0;text-align:right\">Views</th>\n            <th style=\"padding:4px 0;text-align:right\">Unique</th>\n          </tr>\n          ").concat(daily.map(function (d) { return "<tr style=\"border-bottom:1px solid var(--border)\">\n            <td style=\"padding:6px 0\">".concat(esc(d.day), "</td>\n            <td style=\"padding:6px 0;text-align:right;font-weight:600\">").concat(d.views, "</td>\n            <td style=\"padding:6px 0;text-align:right;color:var(--accent)\">").concat(d.unique_visitors, "</td>\n          </tr>"); }).join(""), "\n        </table>\n      </div>\n    </div>\n\n    <div style=\"background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px\">\n      <h3 style=\"margin:0 0 16px;font-size:15px\">Recent Visits</h3>\n      <div style=\"overflow-x:auto\">\n        <table style=\"width:100%;border-collapse:collapse;font-size:12.5px\">\n          <tr style=\"color:var(--text-muted);font-size:11px;text-transform:uppercase;border-bottom:1px solid var(--border)\">\n            <th style=\"padding:6px 8px;text-align:left\">Time</th>\n            <th style=\"padding:6px 8px;text-align:left\">Path</th>\n            <th style=\"padding:6px 8px;text-align:left\">Visitor Hash</th>\n            <th style=\"padding:6px 8px;text-align:left\">Agent</th>\n          </tr>\n          ").concat(recent.map(function (r) { return "<tr style=\"border-bottom:1px solid var(--border)\">\n            <td style=\"padding:6px 8px;color:var(--text-muted);white-space:nowrap\">".concat(esc(r.created_at), "</td>\n            <td style=\"padding:6px 8px;color:var(--accent)\">").concat(esc(r.path), "</td>\n            <td style=\"padding:6px 8px;font-family:monospace;font-size:11px;color:var(--text-muted)\">").concat(esc(r.ip_hash), "</td>\n            <td style=\"padding:6px 8px;color:var(--text-muted)\">").concat(esc(r.user_agent), "</td>\n          </tr>"); }).join(""), "\n        </table>\n      </div>\n    </div>\n    <div style=\"margin-top:16px\"><a href=\"/admin\" style=\"color:var(--text-muted);font-size:13px\">\u2190 Back to Admin</a></div>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
// ── Admin Picks CRUD ──────────────────────────────────────────────────────────
app.get("/admin/picks", requireAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var picks, msg, err, riskColors, typeLabel, rows;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, db_1.getAllPicks)()];
            case 1:
                picks = _a.sent();
                msg = req.query.msg;
                err = req.query.err;
                riskColors = { Low: "#10b981", Medium: "#f59e0b", High: "#ef4444" };
                typeLabel = { intraday: "⚡ Intraday", swing: "🌊 Swing", longterm: "📈 Long Term" };
                rows = picks.map(function (p) {
                    var _a, _b, _c, _d, _e;
                    return "\n    <tr>\n      <td><strong>".concat(esc(p.stock_symbol), "</strong>").concat(p.company_name ? "<br><small class=\"text-dim\">".concat(esc(p.company_name), "</small>") : "", "</td>\n      <td><span class=\"pick-type-badge pick-type-").concat((p.pick_type || 'intraday').replace(' ', '-'), "\">").concat((_b = typeLabel[(_a = p.pick_type) !== null && _a !== void 0 ? _a : 'intraday']) !== null && _b !== void 0 ? _b : p.pick_type, "</span></td>\n      <td><span class=\"pick-badge-").concat(p.direction.toLowerCase(), "\">").concat(p.direction, "</span></td>\n      <td>\u20B9").concat(p.entry_low, "\u2013").concat(p.entry_high, "</td>\n      <td>").concat(p.target ? "₹" + p.target : "—", "</td>\n      <td>").concat(p.stop_loss ? "₹" + p.stop_loss : "—", "</td>\n      <td><span style=\"color:").concat((_c = riskColors[p.risk_level]) !== null && _c !== void 0 ? _c : "#888", "\">").concat(esc(p.risk_level), "</span></td>\n      <td><span class=\"pick-status-badge pick-status-").concat(p.status, "\">").concat(p.status, "</span></td>\n      <td style=\"font-size:12px;color:var(--text-muted)\">").concat((_e = (_d = p.published_at) === null || _d === void 0 ? void 0 : _d.slice(0, 16)) !== null && _e !== void 0 ? _e : "—", "</td>\n      <td>\n        <form method=\"POST\" action=\"/admin/picks/").concat(p.id, "/status\" style=\"display:inline\">\n          <input type=\"hidden\" name=\"status\" value=\"").concat(p.status === "active" ? "expired" : "active", "\">\n          <button class=\"btn-admin-action\" style=\"min-width:72px\">").concat(p.status === "active" ? "Archive" : "Activate", "</button>\n        </form>\n        <form method=\"POST\" action=\"/admin/picks/").concat(p.id, "/delete\" style=\"display:inline;margin-left:4px\"\n              onsubmit=\"return confirm('Delete this pick?')\">\n          <button class=\"btn-admin-action btn-danger\">Delete</button>\n        </form>\n      </td>\n    </tr>");
                }).join("");
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Picks Manager \u2014 ZeroScreen Admin</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body>\n  ".concat(nav("admin-picks", req), "\n  <div class=\"container\" style=\"max-width:1100px\">\n    <div class=\"admin-header\">\n      <div>\n        <h1>\uD83D\uDEE0 Picks Manager</h1>\n        <p class=\"page-sub\">Curate today's trading opportunities shown on /today</p>\n      </div>\n      <a href=\"/admin\" class=\"btn-secondary\">\u2190 Overview</a>\n    </div>\n\n    ").concat(msg ? "<div class=\"auth-success\" style=\"margin-bottom:18px\">\u2705 ".concat(esc(msg), "</div>") : "", "\n    ").concat(err ? "<div class=\"auth-error\"   style=\"margin-bottom:18px\">\u26A0\uFE0F ".concat(esc(err), "</div>") : "", "\n\n    <!-- Add Pick Form -->\n    <div class=\"admin-form-card\">\n      <h3 style=\"margin:0 0 16px\">\u2795 Add New Pick</h3>\n      <form method=\"POST\" action=\"/admin/picks\" class=\"picks-form\">\n        <div class=\"picks-form-row\">\n          <div class=\"form-group\">\n            <label>Symbol *</label>\n            <input type=\"text\" name=\"stock_symbol\" required placeholder=\"e.g. RELIANCE\" class=\"form-input\" style=\"text-transform:uppercase\">\n          </div>\n          <div class=\"form-group\">\n            <label>Company Name</label>\n            <input type=\"text\" name=\"company_name\" placeholder=\"Optional\" class=\"form-input\">\n          </div>\n          <div class=\"form-group\">\n            <label>Type *</label>\n            <select name=\"pick_type\" class=\"form-input\">\n              <option value=\"intraday\" selected>\u26A1 Intraday</option>\n              <option value=\"swing\">\uD83C\uDF0A Swing</option>\n              <option value=\"longterm\">\uD83D\uDCC8 Long Term</option>\n            </select>\n          </div>\n          <div class=\"form-group\">\n            <label>Direction *</label>\n            <select name=\"direction\" class=\"form-input\">\n              <option value=\"LONG\">LONG</option>\n              <option value=\"SHORT\">SHORT</option>\n            </select>\n          </div>\n          <div class=\"form-group\">\n            <label>Entry Low (\u20B9) *</label>\n            <input type=\"number\" name=\"entry_low\" required step=\"0.01\" class=\"form-input\">\n          </div>\n          <div class=\"form-group\">\n            <label>Entry High (\u20B9) *</label>\n            <input type=\"number\" name=\"entry_high\" required step=\"0.01\" class=\"form-input\">\n          </div>\n          <div class=\"form-group\">\n            <label>Target (\u20B9)</label>\n            <input type=\"number\" name=\"target\" step=\"0.01\" class=\"form-input\">\n          </div>\n          <div class=\"form-group\">\n            <label>Stop Loss (\u20B9)</label>\n            <input type=\"number\" name=\"stop_loss\" step=\"0.01\" class=\"form-input\">\n          </div>\n          <div class=\"form-group\">\n            <label>Risk Level *</label>\n            <select name=\"risk_level\" class=\"form-input\">\n              <option value=\"Low\">Low</option>\n              <option value=\"Medium\" selected>Medium</option>\n              <option value=\"High\">High</option>\n            </select>\n          </div>\n        </div>\n        <div class=\"form-group\" style=\"margin-top:10px\">\n          <label>Reason / Thesis *</label>\n          <textarea name=\"reason\" required rows=\"3\" class=\"form-input\" placeholder=\"Why this pick? e.g. Breakout above resistance, strong volume, sector tailwind\u2026\" style=\"width:100%;resize:vertical\"></textarea>\n        </div>\n        <button type=\"submit\" class=\"btn-primary\" style=\"margin-top:12px\">Add Pick</button>\n      </form>\n    </div>\n\n    <!-- Picks Table -->\n    <div class=\"table-wrap\" style=\"margin-top:24px;overflow-x:auto\">\n      <table class=\"stocks-table\">\n        <thead>\n          <tr>\n            <th>Symbol</th><th>Type</th><th>Dir</th><th>Entry Zone</th><th>Target</th>\n            <th>SL</th><th>Risk</th><th>Status</th><th>Published</th><th>Actions</th>\n          </tr>\n        </thead>\n        <tbody>").concat(rows || '<tr><td colspan="10" class="no-data">No picks yet. Add one above.</td></tr>', "</tbody>\n      </table>\n    </div>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
app.post("/admin/picks", requireAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, stock_symbol, company_name, direction, pick_type, entry_low, entry_high, target, stop_loss, reason, risk_level, sym, eLow, eHigh;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, stock_symbol = _a.stock_symbol, company_name = _a.company_name, direction = _a.direction, pick_type = _a.pick_type, entry_low = _a.entry_low, entry_high = _a.entry_high, target = _a.target, stop_loss = _a.stop_loss, reason = _a.reason, risk_level = _a.risk_level;
                sym = (stock_symbol || "").trim().toUpperCase();
                eLow = parseFloat(entry_low);
                eHigh = parseFloat(entry_high);
                if (!sym || !(reason === null || reason === void 0 ? void 0 : reason.trim()) || isNaN(eLow) || isNaN(eHigh)) {
                    res.redirect("/admin/picks?err=Missing+required+fields");
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.createPick)({
                        stock_symbol: sym,
                        company_name: (company_name === null || company_name === void 0 ? void 0 : company_name.trim()) || undefined,
                        direction: direction === "SHORT" ? "SHORT" : "LONG",
                        pick_type: ["intraday", "swing", "longterm"].includes(pick_type) ? pick_type : "intraday",
                        entry_low: eLow, entry_high: eHigh,
                        target: target ? parseFloat(target) : undefined,
                        stop_loss: stop_loss ? parseFloat(stop_loss) : undefined,
                        reason: reason.trim(),
                        risk_level: ["Low", "Medium", "High"].includes(risk_level) ? risk_level : "Medium",
                        status: "active",
                        created_by: req.session.userId,
                    })];
            case 1:
                _b.sent();
                res.redirect("/admin/picks?msg=Pick+added+successfully");
                return [2 /*return*/];
        }
    });
}); });
app.post("/admin/picks/:id/status", requireAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, status;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                id = parseInt(req.params.id, 10);
                status = req.body.status;
                if (!Number.isInteger(id) || !["active", "expired"].includes(status)) {
                    res.redirect("/admin/picks?err=Invalid+request");
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.updatePickStatus)(id, status)];
            case 1:
                _a.sent();
                res.redirect("/admin/picks?msg=Status+updated");
                return [2 /*return*/];
        }
    });
}); });
app.post("/admin/picks/:id/delete", requireAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                id = parseInt(req.params.id, 10);
                if (!Number.isInteger(id) || id <= 0) {
                    res.redirect("/admin/picks?err=Invalid+id");
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.deletePick)(id)];
            case 1:
                _a.sent();
                res.redirect("/admin/picks?msg=Pick+deleted");
                return [2 /*return*/];
        }
    });
}); });
// ── Admin Content ─────────────────────────────────────────────────────────────
app.get("/admin/content", requireAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var settings, msg;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0: return [4 /*yield*/, (0, db_1.getAllSettings)()];
            case 1:
                settings = _d.sent();
                msg = req.query.msg;
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Content \u2014 ZeroScreen Admin</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body>\n  ".concat(nav("admin-content", req), "\n  <div class=\"container\" style=\"max-width:700px\">\n    <div class=\"admin-header\">\n      <div>\n        <h1>\uD83D\uDCE2 Content Control</h1>\n        <p class=\"page-sub\">Update site text and links</p>\n      </div>\n      <a href=\"/admin\" class=\"btn-secondary\">\u2190 Overview</a>\n    </div>\n    ").concat(msg ? "<div class=\"auth-success\" style=\"margin-bottom:18px\">\u2705 ".concat(esc(msg), "</div>") : "", "\n    <form method=\"POST\" action=\"/admin/content\" class=\"admin-form-card\" style=\"display:flex;flex-direction:column;gap:16px\">\n      <div class=\"form-group\">\n        <label>Home Page Headline</label>\n        <input type=\"text\" name=\"home_headline\" class=\"form-input\" value=\"").concat(esc((_a = settings.home_headline) !== null && _a !== void 0 ? _a : "India\\'s sharpest NSE screener"), "\">\n      </div>\n      <div class=\"form-group\">\n        <label>Banner Text <small class=\"text-dim\">(optional \u2014 shown at top of home page)</small></label>\n        <input type=\"text\" name=\"banner_text\" class=\"form-input\" value=\"").concat(esc((_b = settings.banner_text) !== null && _b !== void 0 ? _b : ""), "\" placeholder=\"e.g. \uD83C\uDF89 New feature: Picks page is live!\">\n      </div>\n      <div class=\"form-group\">\n        <label>Telegram Link</label>\n        <input type=\"url\" name=\"telegram_link\" class=\"form-input\" value=\"").concat(esc((_c = settings.telegram_link) !== null && _c !== void 0 ? _c : ""), "\" placeholder=\"https://t.me/your_channel\">\n      </div>\n      <button type=\"submit\" class=\"btn-primary\">Save Changes</button>\n    </form>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
app.post("/admin/content", requireAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, home_headline, banner_text, telegram_link;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = req.body, home_headline = _a.home_headline, banner_text = _a.banner_text, telegram_link = _a.telegram_link;
                return [4 /*yield*/, Promise.all([
                        (0, db_1.setSetting)("home_headline", (home_headline !== null && home_headline !== void 0 ? home_headline : "").trim()),
                        (0, db_1.setSetting)("banner_text", (banner_text !== null && banner_text !== void 0 ? banner_text : "").trim()),
                        (0, db_1.setSetting)("telegram_link", (telegram_link !== null && telegram_link !== void 0 ? telegram_link : "").trim()),
                    ])];
            case 1:
                _b.sent();
                res.redirect("/admin/content?msg=Content+updated+successfully");
                return [2 /*return*/];
        }
    });
}); });
// ── Admin Signal Control ───────────────────────────────────────────────────────
app.get("/admin/signals", requireAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var signalsMode, msg;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, db_1.getSetting)("signals_mode")];
            case 1:
                signalsMode = _a.sent();
                msg = req.query.msg;
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Signal Control \u2014 ZeroScreen Admin</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body>\n  ".concat(nav("admin-signals", req), "\n  <div class=\"container\" style=\"max-width:600px\">\n    <div class=\"admin-header\">\n      <div>\n        <h1>\uD83E\uDD16 Signal Control</h1>\n        <p class=\"page-sub\">Control what guests see on the Signals page</p>\n      </div>\n      <a href=\"/admin\" class=\"btn-secondary\">\u2190 Overview</a>\n    </div>\n    ").concat(msg ? "<div class=\"auth-success\" style=\"margin-bottom:18px\">\u2705 ".concat(esc(msg), "</div>") : "", "\n    <div class=\"admin-form-card\">\n      <h3 style=\"margin:0 0 12px\">Guest Signals Mode</h3>\n      <p class=\"text-dim\" style=\"margin-bottom:16px\">Controls whether guests see live bot status or a generic teaser message.</p>\n      <form method=\"POST\" action=\"/admin/signals\" style=\"display:flex;gap:12px;flex-wrap:wrap\">\n        <button type=\"submit\" name=\"mode\" value=\"live\"\n          class=\"").concat(signalsMode === "live" ? "btn-primary" : "btn-secondary", "\">\n          \uD83D\uDCE1 Live Mode ").concat(signalsMode === "live" ? "✓ Active" : "", "\n        </button>\n        <button type=\"submit\" name=\"mode\" value=\"teaser\"\n          class=\"").concat(signalsMode === "teaser" ? "btn-primary" : "btn-secondary", "\">\n          \uD83D\uDD12 Teaser Mode ").concat(signalsMode === "teaser" ? "✓ Active" : "", "\n        </button>\n      </form>\n      <div class=\"text-dim\" style=\"margin-top:16px;font-size:13px\">\n        <strong>Live Mode</strong>: Guests see simplified live stats (no exact prices).<br>\n        <strong>Teaser Mode</strong>: Guests see a static teaser \u2014 \"Bot is active\" with sign-in CTA only.\n      </div>\n    </div>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
app.post("/admin/signals", requireAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var mode;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mode = req.body.mode;
                if (!["live", "teaser"].includes(mode)) {
                    res.redirect("/admin/signals?err=Invalid+mode");
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.setSetting)("signals_mode", mode)];
            case 1:
                _a.sent();
                res.redirect("/admin/signals?msg=Signal+mode+set+to+" + mode);
                return [2 /*return*/];
        }
    });
}); });
// ── GET /today ─────────────────────────────────────────────────────────────────
app.get("/today", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    function renderPickCard(p, showPrices) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        return "<div class=\"pick-card pick-card-".concat(p.direction.toLowerCase(), "\">\n      <div class=\"pick-card-top\">\n        <div>\n          <span class=\"pick-symbol\">").concat(esc(p.stock_symbol), "</span>\n          ").concat(p.company_name ? "<span class=\"pick-company\">".concat(esc(p.company_name), "</span>") : "", "\n        </div>\n        <span class=\"pick-badge-").concat(p.direction.toLowerCase(), "\">").concat(p.direction === "LONG" ? "▲ LONG" : "▼ SHORT", "</span>\n      </div>\n      ").concat(showPrices ? "\n      <div class=\"pick-entry-zone\">\n        <span class=\"pick-entry-label\">Entry Zone</span>\n        <span class=\"pick-entry-val\">\u20B9".concat(p.entry_low, " \u2013 \u20B9").concat(p.entry_high, "</span>\n      </div>\n      ").concat(p.target ? "<div class=\"pick-tp\"><span class=\"pick-tp-label\">\uD83C\uDFAF Target</span><span class=\"pick-tp-val\">\u20B9".concat(p.target, "</span></div>") : "", "\n      ").concat(p.stop_loss ? "<div class=\"pick-sl\"><span class=\"pick-sl-label\">\uD83D\uDEE1\uFE0F Stop Loss</span><span class=\"pick-sl-val\">\u20B9".concat(p.stop_loss, "</span></div>") : "", "\n      <div class=\"pick-reason\">").concat(esc(p.reason), "</div>\n      <div class=\"pick-footer\">\n        <span class=\"pick-risk-badge ").concat((_a = riskClass[p.risk_level]) !== null && _a !== void 0 ? _a : "risk-medium", "\">").concat((_b = riskIcon[p.risk_level]) !== null && _b !== void 0 ? _b : "🟡", " ").concat(p.risk_level, " Risk</span>\n        <span class=\"pick-date\">").concat((_d = (_c = p.published_at) === null || _c === void 0 ? void 0 : _c.slice(0, 10)) !== null && _d !== void 0 ? _d : "", "</span>\n      </div>") : "\n      <div class=\"pick-locked-body\">\n        <div class=\"pick-locked-row\"><span>Entry Zone</span><span class=\"lock-val\">\uD83D\uDD12</span></div>\n        <div class=\"pick-locked-row\"><span>Target</span><span class=\"lock-val\">\uD83D\uDD12</span></div>\n        <div class=\"pick-locked-row\"><span>Stop Loss</span><span class=\"lock-val\">\uD83D\uDD12</span></div>\n      </div>\n      <div class=\"pick-footer\">\n        <span class=\"pick-risk-badge ".concat((_e = riskClass[p.risk_level]) !== null && _e !== void 0 ? _e : "risk-medium", "\">").concat((_f = riskIcon[p.risk_level]) !== null && _f !== void 0 ? _f : "🟡", " ").concat(p.risk_level, " Risk</span>\n        <span class=\"pick-date\">").concat((_h = (_g = p.published_at) === null || _g === void 0 ? void 0 : _g.slice(0, 10)) !== null && _h !== void 0 ? _h : "", "</span>\n      </div>"), "\n    </div>");
    }
    function renderSection(icon, title, subtitle, sectionPicks, visible, showPrices, requiredTier) {
        if (!visible || sectionPicks.length === 0) {
            if (sectionPicks.length === 0 && visible)
                return "";
            // Fully locked section teaser
            return "<div class=\"picks-section\">\n        <div class=\"picks-section-header picks-section-locked-header\">\n          <div>\n            <span class=\"picks-section-icon\">".concat(icon, "</span>\n            <span class=\"picks-section-title\">").concat(title, "</span>\n            <span class=\"picks-section-sub\">").concat(subtitle, "</span>\n          </div>\n          <span class=\"picks-tier-lock\">\uD83D\uDD12 ").concat(requiredTier, " only</span>\n        </div>\n        <div class=\"picks-locked-section\">\n          <div class=\"picks-locked-msg\">\n            <span class=\"picks-locked-icon\">\uD83D\uDD12</span>\n            <div>\n              <strong>").concat(title, " picks are ").concat(requiredTier, "-only</strong>\n              <p>").concat(requiredTier === 'Free' ? 'Sign in' : 'Upgrade to Premium', " to unlock entry zones, targets, and stop losses for ").concat(title.toLowerCase(), " trades.</p>\n            </div>\n            <a href=\"").concat(requiredTier === 'Free' ? '/login' : '/premium', "\" class=\"btn-upgrade\">").concat(requiredTier === 'Free' ? 'Sign In Free →' : 'Upgrade ₹499/mo →', "</a>\n          </div>\n        </div>\n      </div>");
        }
        return "<div class=\"picks-section\">\n      <div class=\"picks-section-header\">\n        <div>\n          <span class=\"picks-section-icon\">".concat(icon, "</span>\n          <span class=\"picks-section-title\">").concat(title, "</span>\n          <span class=\"picks-section-sub\">").concat(subtitle, "</span>\n        </div>\n        <span class=\"picks-section-count\">").concat(sectionPicks.length, " pick").concat(sectionPicks.length !== 1 ? 's' : '', "</span>\n      </div>\n      ").concat(!showPrices ? "<div class=\"picks-prices-locked-bar\">\uD83D\uDD12 Entry, target &amp; stop loss prices require <a href=\"/premium\">Premium</a></div>" : "", "\n      <div class=\"picks-grid\">").concat(sectionPicks.map(function (p) { return renderPickCard(p, showPrices); }).join(""), "</div>\n    </div>");
    }
    var picks, isPremium, isLoggedIn, isAdmin, riskClass, riskIcon, intradayPicks, swingPicks, longtermPicks, intradayVisible, intradayPrices, swingVisible, swingPrices, longtermVisible, longtermPrices, intradaySection, swingSection, longtermSection, swingTeaser, longtermTeaser, tierLabel, tierClass;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, (0, db_1.getActivePicks)()];
            case 1:
                picks = _c.sent();
                isPremium = userIsPremium(req);
                isLoggedIn = !!((_a = req.session) === null || _a === void 0 ? void 0 : _a.userId);
                isAdmin = ((_b = req.session) === null || _b === void 0 ? void 0 : _b.userRole) === 'admin';
                riskClass = { Low: "risk-low", Medium: "risk-medium", High: "risk-high" };
                riskIcon = { Low: "🟢", Medium: "🟡", High: "🔴" };
                intradayPicks = picks.filter(function (p) { return p.pick_type === 'intraday'; });
                swingPicks = picks.filter(function (p) { return p.pick_type === 'swing'; });
                longtermPicks = picks.filter(function (p) { return p.pick_type === 'longterm'; });
                intradayVisible = true;
                intradayPrices = isLoggedIn || isPremium;
                swingVisible = isLoggedIn || isPremium;
                swingPrices = isPremium;
                longtermVisible = isPremium;
                longtermPrices = isPremium;
                intradaySection = renderSection("⚡", "Intraday Picks", "Same-day entry & exit", intradayPicks, intradayVisible, intradayPrices, "Free");
                swingSection = renderSection("🌊", "Swing Picks", "2–10 day holding period", swingPicks, swingVisible, swingPrices, "Premium");
                longtermSection = renderSection("📈", "Long Term Picks", "Months to years horizon", longtermPicks, longtermVisible, longtermPrices, "Premium");
                swingTeaser = !swingVisible ? renderSection("🌊", "Swing Picks", "2–10 day holding period", swingPicks.length > 0 ? swingPicks : [{ id: 0, stock_symbol: "?", company_name: null, direction: "LONG", pick_type: "swing", entry_low: 0, entry_high: 0, target: null, stop_loss: null, reason: "", risk_level: "Medium", status: "active", published_at: "", expires_at: null, created_by: null }], false, false, "Free") : "";
                longtermTeaser = !longtermVisible ? renderSection("📈", "Long Term Picks", "Months to years horizon", longtermPicks.length > 0 ? longtermPicks : [{ id: 0, stock_symbol: "?", company_name: null, direction: "LONG", pick_type: "longterm", entry_low: 0, entry_high: 0, target: null, stop_loss: null, reason: "", risk_level: "Low", status: "active", published_at: "", expires_at: null, created_by: null }], false, false, "Premium") : "";
                tierLabel = isAdmin ? "👑 Admin" : isPremium ? "⚡ Premium" : isLoggedIn ? "🔓 Free User" : "👤 Guest";
                tierClass = isAdmin ? "sig-tier-admin" : isPremium ? "sig-tier-premium" : isLoggedIn ? "sig-tier-free" : "sig-tier-guest";
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Today's Picks \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body class=\"page-theme-picks\">\n  ".concat(nav("today", req), "\n  <div class=\"container\" style=\"max-width:1060px\">\n    <div class=\"picks-hero\">\n      <div class=\"picks-hero-left\">\n        <h1 class=\"picks-hero-title\">\uD83D\uDD25 Today's Picks</h1>\n        <p class=\"picks-hero-sub\">Curated trading opportunities across 3 horizons \u00B7 Updated daily</p>\n        ").concat(picks.length > 0 ? "<div class=\"picks-hero-count\">\uD83C\uDFAF ".concat(picks.length, " active pick").concat(picks.length !== 1 ? "s" : "", " today</div>") : "", "\n        <div class=\"picks-disclaimer-banner\">\uD83D\uDCCB Picks are selected based on <strong>last market close data</strong> \u2014 fundamentals, price action &amp; signals analysed post-market. Entry zones are reference prices only. <strong>Not SEBI registered. Not investment advice. Do your own research.</strong></div>\n      </div>\n      <div class=\"picks-hero-meta\">\n        <span class=\"picks-hero-updated\">\uD83D\uDD50 ").concat(new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), "</span>\n        <span class=\"sig-tier-badge ").concat(tierClass, "\">").concat(tierLabel, "</span>\n      </div>\n    </div>\n\n    ").concat(intradaySection, "\n    ").concat(swingSection || swingTeaser, "\n    ").concat(longtermSection || longtermTeaser, "\n\n    <footer class=\"site-footer\"><span>\u00A9 2026 ZeroScreen &mdash; Picks are for educational &amp; informational purposes only. Not SEBI registered. Not investment advice. Invest at your own risk.</span></footer>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
// ── Admin Subscriptions ────────────────────────────────────────────────────────
app.get("/admin/subs", requireAdmin, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var subs, active, revenue, rows;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, db_1.getAllSubscriptions)()];
            case 1:
                subs = _a.sent();
                active = subs.filter(function (s) { return s.status === "active"; }).length;
                revenue = subs.filter(function (s) { return s.status === "active"; }).reduce(function (sum) { return sum + 499; }, 0);
                rows = subs.map(function (s) {
                    var _a, _b, _c, _d, _e;
                    return "\n    <tr>\n      <td>".concat(esc(s.user_name), "<br><small class=\"text-dim\">").concat(esc(s.user_email), "</small></td>\n      <td><span class=\"pick-status-badge pick-status-").concat(s.status, "\">").concat(s.status, "</span></td>\n      <td>\u20B9").concat((s.amount / 100).toFixed(0), "</td>\n      <td style=\"font-size:12px;color:var(--text-muted)\">").concat((_b = (_a = s.starts_at) === null || _a === void 0 ? void 0 : _a.slice(0, 10)) !== null && _b !== void 0 ? _b : "—", "</td>\n      <td style=\"font-size:12px;color:var(--text-muted)\">").concat((_d = (_c = s.expires_at) === null || _c === void 0 ? void 0 : _c.slice(0, 10)) !== null && _d !== void 0 ? _d : "—", "</td>\n      <td style=\"font-family:monospace;font-size:11px;color:var(--text-muted)\">").concat((_e = s.razorpay_payment_id) !== null && _e !== void 0 ? _e : "—", "</td>\n    </tr>");
                }).join("");
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Subscriptions \u2014 ZeroScreen Admin</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body>\n  ".concat(nav("admin-subs", req), "\n  <div class=\"container\" style=\"max-width:1100px\">\n    <div class=\"admin-header\">\n      <div><h1>\uD83D\uDCB3 Subscriptions</h1><p class=\"page-sub\">All Premium subscriptions</p></div>\n      <a href=\"/admin\" class=\"btn-secondary\">\u2190 Overview</a>\n    </div>\n    <div class=\"admin-stats-row\">\n      <div class=\"admin-stat-card\"><div class=\"admin-stat-num green\">").concat(active, "</div><div class=\"admin-stat-label\">Active</div></div>\n      <div class=\"admin-stat-card\"><div class=\"admin-stat-num\">\u20B9").concat(revenue, "</div><div class=\"admin-stat-label\">Monthly Revenue</div></div>\n      <div class=\"admin-stat-card\"><div class=\"admin-stat-num\">").concat(subs.length, "</div><div class=\"admin-stat-label\">Total Orders</div></div>\n    </div>\n    <div class=\"table-wrap\" style=\"margin-top:20px;overflow-x:auto\">\n      <table class=\"stocks-table\">\n        <thead><tr><th>User</th><th>Status</th><th>Amount</th><th>Started</th><th>Expires</th><th>Payment ID</th></tr></thead>\n        <tbody>").concat(rows || '<tr><td colspan="6" class="no-data">No subscriptions yet.</td></tr>', "</tbody>\n      </table>\n    </div>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
// ── GET /premium ────────────────────────────────────────────────────────────────
app.get("/premium", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var isPremium, isLoggedIn, activeSub, razorpayEnabled;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                isPremium = userIsPremium(req);
                isLoggedIn = !!((_a = req.session) === null || _a === void 0 ? void 0 : _a.userId);
                activeSub = null;
                if (!isLoggedIn) return [3 /*break*/, 2];
                return [4 /*yield*/, (0, db_1.getActiveSubscription)(req.session.userId)];
            case 1:
                activeSub = _d.sent();
                _d.label = 2;
            case 2:
                razorpayEnabled = RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET;
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Premium \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n  ".concat(razorpayEnabled ? "<script src=\"https://checkout.razorpay.com/v1/checkout.js\"></script>" : "", "\n</head>\n<body class=\"page-theme-premium\">\n  ").concat(nav("premium", req), "\n  <div class=\"container\" style=\"max-width:860px\">\n\n    ").concat(isPremium ? "\n    <!-- ALREADY PREMIUM -->\n    <div class=\"premium-hero\">\n      <div class=\"premium-badge-large\">\uD83D\uDC8E</div>\n      <h1>You're a Premium Member</h1>\n      <p>Your premium access is active".concat((activeSub === null || activeSub === void 0 ? void 0 : activeSub.expires_at) ? " until <strong>".concat(activeSub.expires_at.slice(0, 10), "</strong>") : "", ".</p>\n      <div class=\"premium-active-features\">\n        <div class=\"paf-item\">\u2705 Live position \u2014 exact entry price &amp; stop loss in real time</div>\n        <div class=\"paf-item\">\u2705 Telegram instant alerts when bot enters or exits</div>\n      </div>\n      <a href=\"/signals\" class=\"btn-primary\" style=\"margin-top:24px\">View Signals \u2192</a>\n    </div>\n    ") : "\n    <!-- UPGRADE PAGE -->\n    <div class=\"premium-hero\">\n      <div class=\"premium-badge-large\">\u26A1</div>\n      <h1 class=\"premium-hero-title\">Upgrade to <span class=\"premium-highlight\">Premium</span></h1>\n      <p class=\"premium-hero-sub\">Get the full edge \u2014 real-time signals, stop loss data, and 5-year backtest insights</p>\n    </div>\n\n    <div class=\"premium-features-grid\">\n      <div class=\"pf-card\">\n        <div class=\"pf-icon\">\uD83D\uDCE1</div>\n        <h3>Real-Time Signals</h3>\n        <p>See exact entry price, stop loss, quantity, and AI confidence score for every BANKNIFTY trade \u2014 live.</p>\n        <div class=\"pf-compare\">\n          <span class=\"pf-free\">Free: Direction only</span>\n          <span class=\"pf-premium\">Premium: Full details</span>\n        </div>\n      </div>\n\n      <div class=\"pf-card\">\n        <div class=\"pf-icon\">\uD83D\uDCE2</div>\n        <h3>Telegram Alerts</h3>\n        <p>Get instant notifications when the bot enters or exits a trade \u2014 direct to your Telegram.</p>\n        <div class=\"pf-compare\">\n          <span class=\"pf-free\">Free: Email digest only</span>\n          <span class=\"pf-premium\">Premium: Instant Telegram</span>\n        </div>\n      </div>\n    </div>\n\n    <!-- Pricing card -->\n    <div class=\"premium-pricing-card\">\n      <div class=\"pricing-amount\">\u20B9499 <span class=\"pricing-period\">/month</span></div>\n      <div class=\"pricing-label\">Cancel anytime \u00B7 Instant activation</div>\n      <ul class=\"pricing-features\">\n        <li>\u2705 Live active position \u2014 exact entry &amp; stop loss</li>\n        <li>\u2705 Telegram instant alerts on every trade</li>\n        <li>\u2705 Priority support</li>\n      </ul>\n      ".concat(isLoggedIn
                    ? razorpayEnabled
                        ? "<button id=\"pay-btn\" class=\"btn-premium-cta\" onclick=\"startPayment()\">\u26A1 Upgrade Now \u2014 \u20B9499/month</button>"
                        : "<div class=\"premium-coming-soon\">\uD83D\uDCB3 Payment system coming soon<br><small>Contact us to get early access</small></div>"
                    : "<a href=\"/login?next=/premium\" class=\"btn-premium-cta\">Sign In to Upgrade</a>", "\n    </div>\n\n    <!-- Comparison table -->\n    <div class=\"compare-table-wrap\">\n      <h2 style=\"text-align:center;margin-bottom:20px\">Free vs Premium</h2>\n      <table class=\"compare-table\">\n        <thead><tr><th>Feature</th><th>Free</th><th>\uD83D\uDC8E Premium</th></tr></thead>\n        <tbody>\n          <tr><td>NSE Screener</td><td>\u2705</td><td>\u2705</td></tr>\n          <tr><td>Stock Detail Pages</td><td>\u2705</td><td>\u2705</td></tr>\n          <tr><td>Today's Picks (entry zone + stop loss)</td><td>\u2705</td><td>\u2705</td></tr>\n          <tr><td>Signals (direction + PnL + history)</td><td>\u2705</td><td>\u2705</td></tr>\n          <tr><td>Full 5-Year Backtest Dashboard</td><td>\u2705</td><td>\u2705</td></tr>\n          <tr class=\"premium-row\"><td>\uD83D\uDD34 Live position \u2014 entry price + SL + AI score</td><td>\uD83D\uDD12</td><td>\u2705</td></tr>\n          <tr class=\"premium-row\"><td>Telegram instant alerts</td><td>\uD83D\uDD12</td><td>\u2705</td></tr>\n        </tbody>\n      </table>\n    </div>\n    "), "\n    <footer class=\"site-footer\"><span>\u00A9 2026 ZeroScreen \u00B7 Secure payment via Razorpay \u00B7 Cancel anytime</span></footer>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n  ").concat(isLoggedIn && razorpayEnabled ? "<script>\n  async function startPayment() {\n    const btn = document.getElementById('pay-btn');\n    btn.disabled = true;\n    btn.textContent = 'Creating order\u2026';\n    try {\n      const r = await fetch('/api/razorpay/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' } });\n      if (!r.ok) throw new Error('Order creation failed');\n      const order = await r.json();\n      if (order.error) throw new Error(order.error);\n      const options = {\n        key: '".concat(RAZORPAY_KEY_ID, "',\n        amount: order.amount,\n        currency: 'INR',\n        name: 'ZeroScreen Premium',\n        description: '1 Month Premium Subscription',\n        order_id: order.id,\n        prefill: { name: '").concat((_c = (_b = req.session) === null || _b === void 0 ? void 0 : _b.userName) !== null && _c !== void 0 ? _c : "", "', email: '' },\n        theme: { color: '#7c3aed' },\n        handler: async function(response) {\n          btn.textContent = 'Verifying\u2026';\n          const v = await fetch('/api/razorpay/verify', {\n            method: 'POST',\n            headers: { 'Content-Type': 'application/json' },\n            body: JSON.stringify(response)\n          });\n          const vd = await v.json();\n          if (vd.ok) {\n            window.location.href = '/premium?success=1';\n          } else {\n            alert('Payment verification failed. Contact support.');\n            btn.disabled = false;\n            btn.textContent = '\u26A1 Upgrade Now \u2014 \u20B9499/month';\n          }\n        },\n        modal: {\n          ondismiss: function() {\n            btn.disabled = false;\n            btn.textContent = '\u26A1 Upgrade Now \u2014 \u20B9499/month';\n          }\n        }\n      };\n      const rzp = new Razorpay(options);\n      rzp.open();\n    } catch(e) {\n      alert('Could not start payment. Please try again.');\n      btn.disabled = false;\n      btn.textContent = '\u26A1 Upgrade Now \u2014 \u20B9499/month';\n    }\n  }\n  </script>") : "", "\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
// ── POST /api/razorpay/create-order ──────────────────────────────────────────
app.post("/api/razorpay/create-order", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var existing, amount, payload, auth, r, order;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
                    res.status(503).json({ error: "Payment not configured" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.getActiveSubscription)(req.session.userId)];
            case 1:
                existing = _a.sent();
                if (existing) {
                    res.status(400).json({ error: "Already a Premium member" });
                    return [2 /*return*/];
                }
                amount = PREMIUM_PRICE_PAISE;
                payload = { amount: amount, currency: "INR", receipt: "zs_".concat(req.session.userId, "_").concat(Date.now()) };
                auth = Buffer.from("".concat(RAZORPAY_KEY_ID, ":").concat(RAZORPAY_KEY_SECRET)).toString("base64");
                return [4 /*yield*/, fetch("https://api.razorpay.com/v1/orders", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Authorization": "Basic ".concat(auth) },
                        body: JSON.stringify(payload),
                    })];
            case 2:
                r = _a.sent();
                if (!r.ok) {
                    res.status(502).json({ error: "Razorpay API error" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, r.json()];
            case 3:
                order = _a.sent();
                return [4 /*yield*/, (0, db_1.createOrder)(req.session.userId, order.id, amount)];
            case 4:
                _a.sent();
                res.json({ id: order.id, amount: order.amount, currency: order.currency });
                return [2 /*return*/];
        }
    });
}); });
// ── POST /api/razorpay/verify ─────────────────────────────────────────────────
app.post("/api/razorpay/verify", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, razorpay_order_id, razorpay_payment_id, razorpay_signature, crypto, body, expected, userId;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                if (!RAZORPAY_KEY_SECRET) {
                    res.status(503).json({ ok: false });
                    return [2 /*return*/];
                }
                _a = req.body, razorpay_order_id = _a.razorpay_order_id, razorpay_payment_id = _a.razorpay_payment_id, razorpay_signature = _a.razorpay_signature;
                if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
                    res.status(400).json({ ok: false });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, Promise.resolve().then(function () { return require("crypto"); })];
            case 1:
                crypto = _b.sent();
                body = razorpay_order_id + "|" + razorpay_payment_id;
                expected = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET).update(body).digest("hex");
                if (expected !== razorpay_signature) {
                    res.status(400).json({ ok: false, error: "Invalid signature" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.activateSubscription)(razorpay_order_id, razorpay_payment_id)];
            case 2:
                userId = _b.sent();
                if (!userId) {
                    res.json({ ok: false, error: "Order not found" });
                    return [2 /*return*/];
                }
                // Update session role
                req.session.userRole = "premium";
                res.json({ ok: true });
                return [2 /*return*/];
        }
    });
}); });
// ── GET /api/bot/status ─────────────────────────────────────────────────────────
app.get("/api/bot/status", function (_req, res) {
    var _a;
    var state = readBotJSON("trade-state.json", {});
    var hb = readBotJSON("bot-heartbeat.json", null);
    var trades = readBotJSON("trades.json", []);
    var analytics = computeAnalytics(trades);
    // Determine live bot status from heartbeat
    var isAlive = (hb === null || hb === void 0 ? void 0 : hb.at) ? (Date.now() - new Date(hb.at).getTime()) < 3 * 60 * 1000 : false;
    var botStatus = isAlive ? ((_a = hb.status) !== null && _a !== void 0 ? _a : "RUNNING") : (hb ? "STOPPED" : "UNKNOWN");
    var botColor = isAlive ? (hb.inTrade ? (hb.direction === "CE" ? "blue" : "red") : "green") : "red";
    res.json(__assign({ timestamp: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), activeState: state, heartbeat: hb, botStatus: botStatus, botColor: botColor, isAlive: isAlive }, analytics));
});
// ── GET /paper-trade ───────────────────────────────────────────────────────────
app.get("/paper-trade", featureGate("feature_paper_trade_bot", "Paper Trade"), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    function readPaperJSON(file, fallback) {
        if (fallback === void 0) { fallback = null; }
        try {
            var p = "".concat(PAPER_DIR, "/").concat(file);
            if (!fs_1.default.existsSync(p))
                return fallback;
            return JSON.parse(fs_1.default.readFileSync(p, "utf-8"));
        }
        catch (_a) {
            return fallback;
        }
    }
    var PAPER_DIR, botTrades, closed, wins, totalPnl, winRate, avgPnl, openCount, userId, isLoggedIn, port, tradeCount, ptConfig, isPremiumUser, creditsOut, tradesLeft, freeLimit, userPositions, _a, activeSub, portData, count, config, fl, dbPrices, _b, priceMap_1, _i, dbPrices_1, r, marketOpen, msgParam, errParam;
    var _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                PAPER_DIR = "/home/ubuntu/trading-bot";
                botTrades = readPaperJSON("paper-trades.json", []);
                closed = botTrades.filter(function (t) { return t.status !== "OPEN"; });
                wins = closed.filter(function (t) { var _a; return ((_a = t.pnl) !== null && _a !== void 0 ? _a : 0) > 0; }).length;
                totalPnl = closed.reduce(function (s, t) { var _a; return s + ((_a = t.pnl) !== null && _a !== void 0 ? _a : 0); }, 0);
                winRate = closed.length > 0 ? ((wins / closed.length) * 100).toFixed(1) : "—";
                avgPnl = closed.length > 0 ? (totalPnl / closed.length).toFixed(1) : "—";
                openCount = botTrades.filter(function (t) { return t.status === "OPEN"; }).length;
                userId = (_c = req.session) === null || _c === void 0 ? void 0 : _c.userId;
                isLoggedIn = !!userId;
                port = { balance: 100000 }, tradeCount = 0, ptConfig = { trade_type: "INTRADAY", default_qty: 1 };
                isPremiumUser = false, creditsOut = false, tradesLeft = null, freeLimit = 10;
                userPositions = [];
                if (!isLoggedIn) return [3 /*break*/, 6];
                return [4 /*yield*/, Promise.all([
                        (0, db_1.getActiveSubscription)(userId),
                        (0, db_1.getPaperPortfolio)(userId),
                        (0, db_1.countPaperTrades)(userId),
                        (0, db_1.getPaperTradeConfig)(userId),
                        (0, db_1.getSetting)("paper_free_limit"),
                    ])];
            case 1:
                _a = _d.sent(), activeSub = _a[0], portData = _a[1], count = _a[2], config = _a[3], fl = _a[4];
                port = portData;
                tradeCount = count;
                ptConfig = config;
                freeLimit = parseInt(fl || "10", 10);
                isPremiumUser = !!activeSub || req.session.userRole === "premium" || req.session.userRole === "admin";
                tradesLeft = isPremiumUser ? null : Math.max(0, freeLimit - tradeCount);
                creditsOut = !isPremiumUser && tradeCount >= freeLimit;
                return [4 /*yield*/, (0, db_1.getPaperPositions)(userId)];
            case 2:
                // Load open positions for quick reference
                userPositions = _d.sent();
                if (!userPositions.length) return [3 /*break*/, 4];
                return [4 /*yield*/, (0, db_1.dbAll)("SELECT symbol, price FROM prices WHERE symbol IN (".concat(userPositions.map(function () { return "?"; }).join(","), ")"), userPositions.map(function (p) { return p.symbol; }))];
            case 3:
                _b = _d.sent();
                return [3 /*break*/, 5];
            case 4:
                _b = [];
                _d.label = 5;
            case 5:
                dbPrices = _b;
                priceMap_1 = {};
                for (_i = 0, dbPrices_1 = dbPrices; _i < dbPrices_1.length; _i++) {
                    r = dbPrices_1[_i];
                    if (r.price != null)
                        priceMap_1[r.symbol] = r.price;
                }
                userPositions = userPositions.map(function (p) {
                    var _a;
                    var livePrice = (_a = priceMap_1[p.symbol]) !== null && _a !== void 0 ? _a : p.avg_price;
                    var pnl = parseFloat(((livePrice - p.avg_price) * p.qty).toFixed(2));
                    return __assign(__assign({}, p), { livePrice: livePrice, pnl: pnl });
                });
                _d.label = 6;
            case 6:
                marketOpen = isMarketHours();
                msgParam = req.query.msg ? "<div class=\"mpt-msg mpt-msg-ok\" style=\"margin-bottom:16px\">\u2705 ".concat(esc(req.query.msg), "</div>") : "";
                errParam = req.query.err ? "<div class=\"mpt-msg mpt-msg-err\" style=\"margin-bottom:16px\">\u274C ".concat(esc(req.query.err), "</div>") : "";
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Paper Trade \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n  <style>\n    /* \u2500\u2500 Layout \u2500\u2500 */\n    .pt2-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px}\n    .pt2-hero-title{font-size:1.7rem;font-weight:800}\n    .pt2-hero-sub{color:var(--text-muted);font-size:0.9rem;margin-top:4px}\n    /* \u2500\u2500 Gate (not logged in) \u2500\u2500 */\n    .pt2-gate{background:var(--card-bg);border:1px solid var(--border);border-radius:16px;padding:36px 28px;text-align:center;margin-bottom:28px}\n    .pt2-gate-icon{font-size:2.8rem;margin-bottom:12px}\n    .pt2-gate-title{font-size:1.3rem;font-weight:800;margin-bottom:8px}\n    .pt2-gate-sub{color:var(--text-muted);font-size:0.92rem;margin-bottom:24px}\n    .pt2-gate-btn{display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border-radius:10px;padding:13px 32px;font-weight:700;font-size:1rem;text-decoration:none}\n    .pt2-features{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:24px 0}\n    .pt2-feat{background:var(--bg2);border-radius:10px;padding:14px;text-align:center;font-size:0.88rem}\n    .pt2-feat-icon{font-size:1.4rem;margin-bottom:6px}\n    .pt2-feat-label{font-weight:700}\n    .pt2-feat-desc{color:var(--text-muted);font-size:0.8rem;margin-top:3px}\n    /* \u2500\u2500 Credits bar \u2500\u2500 */\n    .pt2-credits{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:10px 16px;margin-bottom:16px;font-size:0.85rem}\n    .pt2-mh-open{background:#10b98122;color:#10b981;border:1px solid #10b98155;border-radius:20px;padding:3px 10px;font-size:0.78rem;font-weight:700}\n    .pt2-mh-closed{background:#ef444415;color:#ef4444;border:1px solid #ef444455;border-radius:20px;padding:3px 10px;font-size:0.78rem;font-weight:700}\n    /* \u2500\u2500 Rich Trade Card \u2500\u2500 */\n    .pt2-trade-card{background:var(--card-bg);border:1px solid var(--border);border-radius:16px;overflow:visible;margin-bottom:24px;box-shadow:0 2px 16px rgba(0,0,0,0.06)}\n    .pt2-card-hdr{background:linear-gradient(135deg,#0d9488 0%,#059669 100%);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;border-radius:15px 15px 0 0}\n    .pt2-card-title{font-size:0.95rem;font-weight:800;color:#fff;letter-spacing:0.02em}\n    /* Segmented controls */\n    .pt2-seg{display:inline-flex;background:rgba(0,0,0,0.2);border-radius:8px;padding:3px;gap:2px}\n    .pt2-seg-btn{padding:4px 14px;border:none;border-radius:6px;font-weight:700;font-size:0.78rem;cursor:pointer;background:transparent;color:rgba(255,255,255,0.78);transition:all .15s}\n    .pt2-seg-btn.active{background:#fff;color:#059669}\n    .pt2-seg2{display:inline-flex;background:var(--bg2);border-radius:8px;padding:3px;gap:2px}\n    .pt2-seg2-btn{padding:5px 14px;border:none;border-radius:6px;font-weight:700;font-size:0.8rem;cursor:pointer;background:transparent;color:var(--text-muted);transition:all .15s}\n    .pt2-seg2-btn.active{background:#10b981;color:#fff}\n    /* Card body */\n    .pt2-card-body{padding:18px 20px}\n    /* Symbol search row */\n    .pt2-sym-row{margin-bottom:14px}\n    .pt2-sym-inp-wrap{position:relative;display:flex;align-items:center;gap:10px;flex-wrap:wrap}\n    .pt2-sym-inp{flex:1;min-width:160px;background:var(--input-bg,#f4f7fe);border:1.5px solid var(--border);border-radius:10px;padding:10px 14px;color:var(--text);font-size:0.95rem;font-weight:600}\n    .pt2-sym-inp:focus{border-color:#10b981;outline:none;box-shadow:0 0 0 3px rgba(16,185,129,0.12)}\n    html.dark .pt2-sym-inp{background:#1c2128}\n    .pt2-search-drop{position:absolute;top:calc(100% + 4px);left:0;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;z-index:200;width:280px;box-shadow:0 8px 28px rgba(0,0,0,0.18);max-height:240px;overflow-y:auto}\n    .pt2-search-item{padding:9px 14px;cursor:pointer;font-size:0.88rem}\n    .pt2-search-item:hover{background:var(--hover-bg)}\n    /* Live price badge */\n    .pt2-lpb{display:none;align-items:center;gap:8px;background:var(--bg2);border:1px solid var(--border);border-radius:20px;padding:5px 12px;font-size:0.85rem;font-weight:800;white-space:nowrap}\n    .pt2-lpb.visible{display:inline-flex}\n    .pt2-lpb-chg{font-size:0.76rem}\n    .pt2-lpb-chg.pos{color:#10b981}\n    .pt2-lpb-chg.neg{color:#ef4444}\n    /* Order type row */\n    .pt2-ot-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}\n    .pt2-ot-label{font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted)}\n    /* Fields row */\n    .pt2-fields-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px}\n    .pt2-fld{display:flex;flex-direction:column;gap:4px}\n    .pt2-fld>label{font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted)}\n    .pt2-fld input,.pt2-fld select{background:var(--input-bg,#f4f7fe);border:1.5px solid var(--border);border-radius:8px;padding:8px 11px;color:var(--text);font-size:0.9rem;font-weight:600;transition:border-color .15s}\n    .pt2-fld input:focus,.pt2-fld select:focus{border-color:#10b981;outline:none}\n    html.dark .pt2-fld input,html.dark .pt2-fld select{background:#1c2128}\n    .pt2-cost-disp{padding:8px 12px;font-weight:800;font-size:1.05rem;color:#10b981;background:rgba(16,185,129,0.09);border:1.5px solid rgba(16,185,129,0.22);border-radius:8px;min-width:110px;text-align:right;font-variant-numeric:tabular-nums}\n    /* Risk row \u2014 SL & Target */\n    .pt2-risk-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}\n    .pt2-risk-card{border-radius:12px;padding:12px 14px;border:1.5px solid}\n    .pt2-risk-card.sl{background:rgba(239,68,68,0.05);border-color:rgba(239,68,68,0.28)}\n    .pt2-risk-card.tgt{background:rgba(16,185,129,0.05);border-color:rgba(16,185,129,0.28)}\n    .pt2-risk-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}\n    .pt2-risk-lbl{font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em}\n    .pt2-risk-card.sl .pt2-risk-lbl{color:#ef4444}\n    .pt2-risk-card.tgt .pt2-risk-lbl{color:#10b981}\n    .pt2-pct-wrap{display:flex;align-items:center;gap:3px}\n    .pt2-pct-inp{width:52px;padding:4px 6px;border-radius:6px;border:1.5px solid var(--border);background:var(--input-bg,#f4f7fe);font-size:0.82rem;font-weight:700;text-align:center;color:var(--text)}\n    html.dark .pt2-pct-inp{background:#1c2128}\n    .pt2-pct-suf{font-size:0.78rem;color:var(--text-muted);font-weight:600}\n    .pt2-risk-price{font-size:1.08rem;font-weight:800;margin:4px 0 2px;font-variant-numeric:tabular-nums}\n    .pt2-risk-card.sl .pt2-risk-price{color:#ef4444}\n    .pt2-risk-card.tgt .pt2-risk-price{color:#10b981}\n    .pt2-risk-note{font-size:0.72rem;color:var(--text-muted)}\n    /* Buy row */\n    .pt2-buy-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}\n    .pt2-rr-badge{font-size:0.78rem;background:var(--bg2);border-radius:20px;padding:5px 14px;color:var(--text-muted);font-weight:700;border:1px solid var(--border)}\n    .pt2-btn-place{background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;border:none;border-radius:10px;padding:12px 32px;font-weight:800;font-size:1rem;cursor:pointer;transition:filter .15s;white-space:nowrap}\n    .pt2-btn-place:hover{filter:brightness(1.08)}\n    .pt2-btn-place:disabled{opacity:.5;cursor:not-allowed;filter:none}\n    /* Open positions */\n    .pt2-pos-section{border-top:1px solid var(--border);margin-top:18px;padding-top:14px}\n    .pt2-pos-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.87rem;flex-wrap:wrap}\n    .pt2-pos-sym{font-weight:700;color:var(--accent)}\n    .pt2-pos-badge{font-size:0.7rem;padding:2px 7px;border-radius:12px;font-weight:700}\n    .pt2-pos-sl{background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.3)}\n    .pt2-pos-tgt{background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.3)}\n    /* Bot stats */\n    .pt2-stats-bar{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:28px 0 8px}\n    .pt2-stat{background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:12px 14px;text-align:center}\n    .pt2-stat-label{font-size:0.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:4px}\n    .pt2-stat-val{font-size:1.15rem;font-weight:700}\n    /* Options panel */\n    .pt2-opts-panel{background:var(--bg2,#f8f6ff);border:1.5px solid rgba(124,58,237,0.22);border-radius:10px;padding:14px 16px;margin-top:14px;display:none}\n    .pt2-opts-panel.show{display:block}\n    .pt2-opts-title{font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7c3aed;margin-bottom:12px}\n    .pt2-opts-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}\n    .pt2-opt-type-btn{padding:7px 18px;border-radius:7px;border:1.5px solid #7c3aed;font-weight:700;font-size:0.88rem;cursor:pointer;background:transparent;color:#7c3aed;transition:all .15s}\n    .pt2-opt-type-btn.active{background:#7c3aed;color:#fff}\n    .pt2-strike-wrap{display:flex;align-items:center;gap:4px}\n    .pt2-strike-step{width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:var(--bg2,#f4f7fe);font-weight:700;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text)}\n    .pt2-expiry-badge{font-size:0.78rem;background:rgba(124,58,237,0.1);color:#7c3aed;border-radius:20px;padding:3px 10px;font-weight:600}\n    .pt2-atm-label{font-size:0.72rem;color:#10b981;font-weight:700;margin-top:2px}\n    /* Messages */\n    .mpt-msg{padding:12px 16px;border-radius:8px;font-size:0.9rem;font-weight:600}\n    .mpt-msg-ok{background:#10b98122;color:#10b981;border:1px solid #10b98155}\n    .mpt-msg-err{background:#ef444422;color:#ef4444;border:1px solid #ef444455}\n    .mpt-green{color:#10b981} .mpt-red{color:#ef4444} .mpt-yellow{color:#f59e0b}\n    @media(max-width:580px){\n      .pt2-risk-row{grid-template-columns:1fr}\n      .pt2-fields-row{flex-direction:column}\n      .pt2-fld input,.pt2-fld select{width:100%;box-sizing:border-box}\n      .pt2-cost-disp{text-align:left}\n      .pt2-buy-row{flex-direction:column-reverse;align-items:stretch}\n      .pt2-btn-place{text-align:center;width:100%}\n      .pt2-opts-row{flex-direction:column}\n    }\n  </style>\n</head>\n<body class=\"page-theme-paper\">\n  ".concat(nav("paper-trade", req), "\n  <div class=\"container\" style=\"max-width:840px\">\n\n    ").concat(msgParam).concat(errParam, "\n\n    <div class=\"pt2-hero\">\n      <div>\n        <h1 class=\"pt2-hero-title\">\uD83D\uDCCB Paper Trade</h1>\n        <p class=\"pt2-hero-sub\">Practice trading any NSE stock with \u20B91,00,000 virtual money \u00B7 Zero risk</p>\n      </div>\n      ").concat(isLoggedIn ? "<a href=\"/my-paper-trade\" style=\"display:inline-flex;align-items:center;gap:8px;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:10px 18px;font-weight:700;font-size:0.88rem;text-decoration:none;color:var(--text)\">\uD83D\uDCCA My Portfolio \u2192</a>" : "", "\n    </div>\n\n    ").concat(!isLoggedIn ? "\n    <!-- SIGN-IN GATE -->\n    <div class=\"pt2-gate\">\n      <div class=\"pt2-gate-icon\">\uD83D\uDCCB</div>\n      <div class=\"pt2-gate-title\">Paper Trade Any NSE Stock \u2014 Free</div>\n      <div class=\"pt2-gate-sub\">Create a free account to get \u20B91,00,000 virtual cash and start practising trades with zero real risk.</div>\n      <a href=\"/login?next=/paper-trade\" class=\"pt2-gate-btn\">\uD83D\uDD11 Sign In to Start Trading \u2192</a>\n      <div style=\"margin-top:12px\"><a href=\"/signup\" style=\"font-size:0.85rem;color:var(--text-muted)\">No account? Sign up free \u2192</a></div>\n    </div>\n\n    <div class=\"pt2-features\">\n      <div class=\"pt2-feat\"><div class=\"pt2-feat-icon\">\uD83D\uDCB0</div><div class=\"pt2-feat-label\">\u20B91,00,000 Virtual Cash</div><div class=\"pt2-feat-desc\">Start with real-scale capital</div></div>\n      <div class=\"pt2-feat\"><div class=\"pt2-feat-icon\">\uD83D\uDCC8</div><div class=\"pt2-feat-label\">1,700+ NSE Stocks</div><div class=\"pt2-feat-desc\">Trade any NSE-listed stock</div></div>\n      <div class=\"pt2-feat\"><div class=\"pt2-feat-icon\">\uD83D\uDD50</div><div class=\"pt2-feat-label\">Intraday & Holding</div><div class=\"pt2-feat-desc\">Both trade types supported</div></div>\n      <div class=\"pt2-feat\"><div class=\"pt2-feat-icon\">\uD83D\uDCCA</div><div class=\"pt2-feat-label\">Live P&L Tracking</div><div class=\"pt2-feat-desc\">Real NSE prices from DB</div></div>\n    </div>\n\n    " : "\n    <!-- LOGGED-IN: CREDITS BAR -->\n    <div class=\"pt2-credits\">\n      <div style=\"display:flex;align-items:center;gap:12px;flex-wrap:wrap\">\n        ".concat(isPremiumUser
                    ? "<span style=\"color:#10b981;font-weight:700\">\uD83D\uDC51 Premium \u2014 Unlimited trades</span>"
                    : creditsOut
                        ? "<span style=\"color:#ef4444;font-weight:700\">\u26A0\uFE0F Free limit reached (".concat(tradeCount, "/").concat(freeLimit, ") \u2014 <a href=\"/my-paper-trade/upgrade\" style=\"color:#ef4444\">Upgrade \u2192</a></span>")
                        : "<span style=\"color:#f59e0b;font-weight:700\">\uD83C\uDFAB ".concat(tradesLeft, " of ").concat(freeLimit, " free trades left</span>"), "\n        <span style=\"font-size:0.8rem;color:var(--text-muted)\">Cash: <strong>\u20B9").concat(port.balance.toLocaleString("en-IN", { maximumFractionDigits: 0 }), "</strong></span>\n      </div>\n      <span class=\"").concat(marketOpen ? "pt2-mh-open" : "pt2-mh-closed", "\">").concat(marketOpen ? "🟢 Market Open" : "🔴 Market Closed", "</span>\n    </div>\n\n    <!-- RICH TRADE CARD -->\n    <div class=\"pt2-trade-card\">\n      <div class=\"pt2-card-hdr\">\n        <div class=\"pt2-card-title\">\uD83D\uDED2 New Order</div>\n        <div style=\"display:flex;align-items:center;gap:10px;flex-wrap:wrap\">\n          ").concat(!marketOpen ? "<span style=\"font-size:0.74rem;background:rgba(255,255,255,0.15);color:#fff;border-radius:12px;padding:3px 10px;font-weight:600\">\u23F8 Market Closed</span>" : "", "\n          <div class=\"pt2-seg\" id=\"pt2-type-seg\">\n            <button type=\"button\" class=\"pt2-seg-btn ").concat(ptConfig.trade_type === 'HOLDING' ? '' : 'active', "\" data-t=\"INTRADAY\" onclick=\"pt2SetType('INTRADAY')\">Intraday</button>\n            <button type=\"button\" class=\"pt2-seg-btn ").concat(ptConfig.trade_type === 'HOLDING' ? 'active' : '', "\" data-t=\"HOLDING\" onclick=\"pt2SetType('HOLDING')\">Holding</button>\n          </div>\n        </div>\n      </div>\n      <div class=\"pt2-card-body\">\n        ").concat(creditsOut ? "<div style=\"background:#ef444415;border:1px solid #ef444455;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.85rem;color:#ef4444;font-weight:600\">\u26A0\uFE0F Free trade limit reached \u2014 <a href=\"/my-paper-trade/upgrade\" style=\"color:#ef4444;text-decoration:underline\">Upgrade to Premium \u2192</a></div>" : "", "\n\n        <form method=\"POST\" action=\"/my-paper-trade/buy\" id=\"pt2-buy-form\">\n          <input type=\"hidden\" name=\"trade_type\" id=\"pt2-trade-type\" value=\"").concat(ptConfig.trade_type || 'INTRADAY', "\">\n          <input type=\"hidden\" name=\"order_type\" id=\"pt2-order-type-val\" value=\"MARKET\">\n          <input type=\"hidden\" name=\"symbol\" id=\"pt2-symbol-val\" required>\n\n          <!-- Symbol search -->\n          <div class=\"pt2-sym-row\">\n            <label style=\"font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);display:block;margin-bottom:5px\">Stock / Symbol</label>\n            <div class=\"pt2-sym-inp-wrap\">\n              <div style=\"position:relative;flex:1;min-width:160px\">\n                <input type=\"text\" id=\"pt2-stock-search\" class=\"pt2-sym-inp\" placeholder=\"Search symbol or company name\u2026\" autocomplete=\"off\" required>\n                <div class=\"pt2-search-drop\" id=\"pt2-search-drop\" style=\"display:none\"></div>\n              </div>\n              <div class=\"pt2-lpb\" id=\"pt2-lpb\">\n                <span id=\"pt2-lpb-sym\" style=\"color:var(--accent)\"></span>\n                <span id=\"pt2-lpb-price\" style=\"font-variant-numeric:tabular-nums\">\u2014</span>\n                <span class=\"pt2-lpb-chg\" id=\"pt2-lpb-chg\"></span>\n              </div>\n            </div>\n          </div>\n\n          <!-- Order type -->\n          <div class=\"pt2-ot-row\">\n            <span class=\"pt2-ot-label\">Order Type</span>\n            <div class=\"pt2-seg2\">\n              <button type=\"button\" class=\"pt2-seg2-btn active\" data-ot=\"MARKET\" onclick=\"pt2SetOrderType('MARKET')\">Market</button>\n              <button type=\"button\" class=\"pt2-seg2-btn\" data-ot=\"LIMIT\" onclick=\"pt2SetOrderType('LIMIT')\">Limit</button>\n            </div>\n            <span id=\"pt2-ot-note\" style=\"font-size:0.74rem;color:var(--text-muted)\">Executes at current market price</span>\n          </div>\n\n          <!-- Qty / Price / Cost -->\n          <div class=\"pt2-fields-row\">\n            <div class=\"pt2-fld\">\n              <label>Quantity</label>\n              <input type=\"number\" name=\"qty\" id=\"pt2-qty\" min=\"1\" max=\"10000\" value=\"").concat(ptConfig.default_qty || 1, "\" required style=\"width:90px\" oninput=\"pt2UpdateRisk()\">\n            </div>\n            <div class=\"pt2-fld\">\n              <label id=\"pt2-price-label\">Market Price</label>\n              <input type=\"number\" name=\"price\" id=\"pt2-price\" step=\"0.05\" min=\"0.1\" placeholder=\"Select a stock\" required style=\"width:130px\" readonly oninput=\"pt2UpdateRisk()\">\n            </div>\n            <div class=\"pt2-fld\">\n              <label>Est. Cost</label>\n              <div class=\"pt2-cost-disp\" id=\"pt2-est-cost\">\u2014</div>\n            </div>\n          </div>\n\n          <!-- SL & Target -->\n          <div class=\"pt2-risk-row\">\n            <div class=\"pt2-risk-card sl\">\n              <div class=\"pt2-risk-hdr\">\n                <span class=\"pt2-risk-lbl\">\uD83D\uDEE1\uFE0F Stop Loss</span>\n                <span class=\"pt2-pct-wrap\">\n                  <input type=\"number\" class=\"pt2-pct-inp\" id=\"pt2-sl-pct\" name=\"sl_pct\" step=\"0.1\" min=\"0\" max=\"50\" value=\"").concat(ptConfig.default_sl_pct || 2.0, "\" oninput=\"pt2UpdateRisk()\">\n                  <span class=\"pt2-pct-suf\">%</span>\n                </span>\n              </div>\n              <div class=\"pt2-risk-price\" id=\"pt2-sl-price\">\u20B9 \u2014</div>\n              <div class=\"pt2-risk-note\" id=\"pt2-sl-note\">Select a stock first</div>\n            </div>\n            <div class=\"pt2-risk-card tgt\">\n              <div class=\"pt2-risk-hdr\">\n                <span class=\"pt2-risk-lbl\">\uD83C\uDFAF Target</span>\n                <span class=\"pt2-pct-wrap\">\n                  <input type=\"number\" class=\"pt2-pct-inp\" id=\"pt2-tgt-pct\" name=\"target_pct\" step=\"0.1\" min=\"0\" max=\"200\" value=\"").concat(ptConfig.default_tgt_pct || 4.0, "\" oninput=\"pt2UpdateRisk()\">\n                  <span class=\"pt2-pct-suf\">%</span>\n                </span>\n              </div>\n              <div class=\"pt2-risk-price\" id=\"pt2-tgt-price\">\u20B9 \u2014</div>\n              <div class=\"pt2-risk-note\" id=\"pt2-tgt-note\">Select a stock first</div>\n            </div>\n          </div>\n\n          <!-- Place order row -->\n          <div class=\"pt2-buy-row\">\n            <div class=\"pt2-rr-badge\" id=\"pt2-rr-badge\">Select a stock to see R:R</div>\n            <button type=\"submit\" class=\"pt2-btn-place\" ").concat(creditsOut ? 'disabled onclick="window.location=\'/my-paper-trade/upgrade\';return false;"' : "", ">\uD83D\uDCC8 Place Order</button>\n          </div>\n\n          <!-- OPTIONS PANEL: shown when index symbol detected -->\n          <div class=\"pt2-opts-panel\" id=\"pt2-opts-panel\">\n            <div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:12px\">\n              <div class=\"pt2-opts-title\" style=\"margin-bottom:0\">\uD83D\uDCCA Options Details</div>\n              <button type=\"button\" onclick=\"document.getElementById('pt2-opts-panel').classList.remove('show');document.getElementById('pt2-stock-search').value='';document.getElementById('pt2-symbol-val').value='';\" style=\"background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--text-muted);line-height:1;padding:2px 6px\" title=\"Close options panel\">\u2715</button>\n            </div>\n            <div class=\"pt2-opts-row\">\n              <div class=\"pt2-fld\">\n                <label>Option Type</label>\n                <div style=\"display:flex;gap:6px\">\n                  <button type=\"button\" class=\"pt2-opt-type-btn active\" id=\"pt2-btn-ce\" onclick=\"pt2SelectOptType('CE')\">CE</button>\n                  <button type=\"button\" class=\"pt2-opt-type-btn\" id=\"pt2-btn-pe\" onclick=\"pt2SelectOptType('PE')\">PE</button>\n                </div>\n              </div>\n              <div class=\"pt2-fld\">\n                <label>Strike Price</label>\n                <div class=\"pt2-strike-wrap\">\n                  <button type=\"button\" class=\"pt2-strike-step\" onclick=\"pt2StepStrike(-1)\">\u2212</button>\n                  <input type=\"number\" id=\"pt2-strike-inp\" step=\"1\" placeholder=\"Strike\u2026\" style=\"width:100px;padding:7px 10px;border-radius:7px;border:1px solid var(--border);background:var(--input-bg,#fff);color:var(--text);font-size:0.9rem;font-weight:700\" oninput=\"pt2UpdateOptSymbol()\">\n                  <button type=\"button\" class=\"pt2-strike-step\" onclick=\"pt2StepStrike(1)\">+</button>\n                </div>\n                <div class=\"pt2-atm-label\" id=\"pt2-strike-hint\"></div>\n              </div>\n              <div class=\"pt2-fld\">\n                <label>Expiry</label>\n                <div class=\"pt2-expiry-badge\" id=\"pt2-expiry-badge\">\u2014</div>\n              </div>\n              <div class=\"pt2-fld\">\n                <label>Option Symbol</label>\n                <div style=\"font-size:0.85rem;font-weight:700;color:var(--accent);padding:8px 0\" id=\"pt2-opt-sym-disp\">\u2014</div>\n              </div>\n            </div>\n            <div style=\"font-size:0.75rem;color:var(--text-muted);margin-top:8px\">\uD83D\uDCA1 Enter the current option premium in the <strong>Market Price</strong> field above \u00B7 Qty = number of lots</div>\n          </div>\n        </form>\n\n        ").concat(userPositions.length > 0 ? "\n        <div class=\"pt2-pos-section\">\n          <div style=\"font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px\">Open Positions (".concat(userPositions.length, ")</div>\n          ").concat(userPositions.map(function (p) { return "\n          <div class=\"pt2-pos-row\">\n            <span class=\"pt2-pos-sym\"><a href=\"/stock/".concat(p.symbol, "\" style=\"color:var(--accent);text-decoration:none\">").concat(p.symbol, "</a></span>\n            <span style=\"font-size:0.8rem;color:var(--text-muted)\">").concat(p.trade_type === 'HOLDING' ? 'HOLD' : 'INTRA', " \u00B7 ").concat(p.qty, " qty \u00B7 \u20B9").concat(p.avg_price.toFixed(2), "</span>\n            <div style=\"display:flex;gap:5px;align-items:center;flex-wrap:wrap\">\n              ").concat(p.sl_price ? "<span class=\"pt2-pos-badge pt2-pos-sl\">SL \u20B9".concat(parseFloat(p.sl_price).toFixed(2), "</span>") : "", "\n              ").concat(p.target_price ? "<span class=\"pt2-pos-badge pt2-pos-tgt\">TGT \u20B9".concat(parseFloat(p.target_price).toFixed(2), "</span>") : "", "\n            </div>\n            <span style=\"font-weight:700\" class=\"").concat(p.pnl >= 0 ? "mpt-green" : "mpt-red", "\">").concat(p.pnl >= 0 ? "+" : "", "\u20B9").concat(p.pnl.toLocaleString("en-IN", { maximumFractionDigits: 0 }), "</span>\n            <form method=\"POST\" action=\"/my-paper-trade/sell\" style=\"display:inline-flex;gap:6px;align-items:center\">\n              <input type=\"hidden\" name=\"symbol\" value=\"").concat(p.symbol, "\">\n              <input type=\"number\" name=\"qty\" min=\"1\" max=\"").concat(p.qty, "\" value=\"").concat(p.qty, "\" style=\"width:56px;padding:3px 7px;border-radius:5px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:0.8rem\">\n              <input type=\"hidden\" name=\"price\" value=\"").concat(p.livePrice.toFixed(2), "\">\n              <button type=\"submit\" style=\"background:#ef444422;color:#ef4444;border:1px solid #ef444455;border-radius:6px;padding:3px 10px;font-size:0.78rem;cursor:pointer;font-weight:600\">Sell</button>\n            </form>\n          </div>"); }).join(""), "\n        </div>") : "", "\n      </div>\n    </div>\n    "), "\n\n    <!-- BOT PERFORMANCE (social proof / always shown) -->\n    <div style=\"font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);border-bottom:1px solid var(--border);padding-bottom:8px;margin:28px 0 14px\">\uD83D\uDCCA Bot's Paper Trade Performance \u2014 Strategy Benchmark</div>\n    <div class=\"pt2-stats-bar\">\n      <div class=\"pt2-stat\">\n        <div class=\"pt2-stat-label\">Total PnL (Bot)</div>\n        <div class=\"pt2-stat-val ").concat(totalPnl >= 0 ? "mpt-green" : "mpt-red", "\">").concat(totalPnl >= 0 ? "+" : "", "\u20B9").concat(Math.abs(totalPnl).toFixed(0), "</div>\n      </div>\n      <div class=\"pt2-stat\">\n        <div class=\"pt2-stat-label\">Closed Trades</div>\n        <div class=\"pt2-stat-val\">").concat(closed.length, "</div>\n      </div>\n      <div class=\"pt2-stat\">\n        <div class=\"pt2-stat-label\">Win Rate</div>\n        <div class=\"pt2-stat-val\">").concat(winRate).concat(winRate !== "—" ? "%" : "", "</div>\n      </div>\n      <div class=\"pt2-stat\">\n        <div class=\"pt2-stat-label\">Avg PnL / Trade</div>\n        <div class=\"pt2-stat-val\">").concat(avgPnl !== "—" ? "₹" + avgPnl : "—", "</div>\n      </div>\n      <div class=\"pt2-stat\">\n        <div class=\"pt2-stat-label\">Open Now</div>\n        <div class=\"pt2-stat-val pt2-yellow\">").concat(openCount, "</div>\n      </div>\n    </div>\n    <div style=\"text-align:right;margin-bottom:8px\"><a href=\"/paper-trade/bot-stats\" style=\"font-size:0.8rem;color:var(--text-muted)\">View full bot history \u2192</a></div>\n\n    <footer class=\"site-footer\"><span>\u00A9 2026 ZeroScreen \u00B7 Paper trading uses virtual money \u2014 no real capital at risk \u00B7 Prices from NSE data updated periodically</span></footer>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n  <script>\n  // \u2500\u2500 Trade form interaction \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  function pt2SetType(t) {\n    document.getElementById('pt2-trade-type').value = t;\n    document.querySelectorAll('.pt2-seg-btn[data-t]').forEach(function(b) {\n      b.classList.toggle('active', b.getAttribute('data-t') === t);\n    });\n  }\n\n  function pt2SetOrderType(ot) {\n    document.getElementById('pt2-order-type-val').value = ot;\n    document.querySelectorAll('.pt2-seg2-btn[data-ot]').forEach(function(b) {\n      b.classList.toggle('active', b.getAttribute('data-ot') === ot);\n    });\n    var priceInp = document.getElementById('pt2-price');\n    var priceLabel = document.getElementById('pt2-price-label');\n    var note = document.getElementById('pt2-ot-note');\n    if (ot === 'MARKET') {\n      priceInp.readOnly = true;\n      priceInp.style.opacity = '0.75';\n      if (priceLabel) priceLabel.textContent = 'Market Price';\n      if (note) note.textContent = 'Executes at current market price';\n    } else {\n      priceInp.readOnly = false;\n      priceInp.style.opacity = '1';\n      if (priceLabel) priceLabel.textContent = 'Limit Price';\n      if (note) note.textContent = 'Enter your desired limit price';\n    }\n  }\n\n  function pt2UpdateRisk() {\n    var p = parseFloat(document.getElementById('pt2-price').value) || 0;\n    var q = parseInt(document.getElementById('pt2-qty').value) || 1;\n    var slPct  = parseFloat(document.getElementById('pt2-sl-pct')  ? document.getElementById('pt2-sl-pct').value  : '2') || 0;\n    var tgtPct = parseFloat(document.getElementById('pt2-tgt-pct') ? document.getElementById('pt2-tgt-pct').value : '4') || 0;\n\n    // Cost\n    var cost = p * q;\n    var costEl = document.getElementById('pt2-est-cost');\n    if (costEl) costEl.textContent = cost > 0 ? '\u20B9' + cost.toLocaleString('en-IN', {maximumFractionDigits:0}) : '\u2014';\n\n    if (p > 0) {\n      var slPrice  = p * (1 - slPct / 100);\n      var tgtPrice = p * (1 + tgtPct / 100);\n      var slLoss   = (p - slPrice) * q;\n      var tgtGain  = (tgtPrice - p) * q;\n\n      var slPEl  = document.getElementById('pt2-sl-price');\n      var tgtPEl = document.getElementById('pt2-tgt-price');\n      var slNEl  = document.getElementById('pt2-sl-note');\n      var tgtNEl = document.getElementById('pt2-tgt-note');\n      var rrEl   = document.getElementById('pt2-rr-badge');\n\n      if (slPEl)  slPEl.textContent  = '\u20B9' + slPrice.toFixed(2);\n      if (tgtPEl) tgtPEl.textContent = '\u20B9' + tgtPrice.toFixed(2);\n      if (slNEl)  slNEl.textContent  = slPct > 0 ? 'Max loss \u20B9' + slLoss.toFixed(0) : 'No stop loss set';\n      if (tgtNEl) tgtNEl.textContent = tgtPct > 0 ? 'Potential gain \u20B9' + tgtGain.toFixed(0) : 'No target set';\n\n      if (rrEl) {\n        if (slPct > 0 && tgtPct > 0) {\n          var rr = tgtPct / slPct;\n          rrEl.textContent = 'R:R = 1 : ' + rr.toFixed(1) + (rr >= 2 ? '  \u2705' : rr < 1 ? '  \u26A0\uFE0F' : '');\n        } else {\n          rrEl.textContent = 'Set both SL & Target for R:R';\n        }\n      }\n    } else {\n      ['pt2-sl-price','pt2-tgt-price'].forEach(function(id) {\n        var el = document.getElementById(id); if (el) el.textContent = '\u20B9 \u2014';\n      });\n      var slNEl  = document.getElementById('pt2-sl-note');\n      var tgtNEl = document.getElementById('pt2-tgt-note');\n      if (slNEl)  slNEl.textContent  = 'Select a stock first';\n      if (tgtNEl) tgtNEl.textContent = 'Select a stock first';\n      var rrEl = document.getElementById('pt2-rr-badge');\n      if (rrEl) rrEl.textContent = 'Select a stock to see R:R';\n    }\n  }\n\n  // \u2500\u2500 Search autocomplete \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  (function() {\n    var inp    = document.getElementById('pt2-stock-search');\n    var symVal = document.getElementById('pt2-symbol-val');\n    var drop   = document.getElementById('pt2-search-drop');\n    var priceInp = document.getElementById('pt2-price');\n    var lpb    = document.getElementById('pt2-lpb');\n    if (!inp) return;\n\n    function selectSymbol(sym, price, changePct) {\n      inp.value = sym;\n      symVal.value = sym;\n      drop.style.display = 'none';\n      var lpbSym = document.getElementById('pt2-lpb-sym');\n      var lpbPrc = document.getElementById('pt2-lpb-price');\n      var lpbChg = document.getElementById('pt2-lpb-chg');\n      if (lpbSym) lpbSym.textContent = sym;\n      if (price) {\n        priceInp.value = price.toFixed(2);\n        priceInp.dataset.indexPrice = price.toFixed(2);\n        if (lpbPrc) lpbPrc.textContent = '\u20B9' + price.toFixed(2);\n        if (lpbChg && changePct != null) {\n          lpbChg.textContent = (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%';\n          lpbChg.className = 'pt2-lpb-chg ' + (changePct >= 0 ? 'pos' : 'neg');\n        }\n        if (lpb) lpb.classList.add('visible');\n        pt2UpdateRisk();\n      }\n      pt2CheckIndex(sym);\n    }\n\n    var timer;\n    inp.addEventListener('input', function() {\n      clearTimeout(timer);\n      var q = inp.value.trim();\n      if (q.length < 1) {\n        drop.style.display = 'none';\n        var panel = document.getElementById('pt2-opts-panel');\n        if (panel) panel.classList.remove('show');\n        var symVal2 = document.getElementById('pt2-symbol-val');\n        if (symVal2) symVal2.value = '';\n        return;\n      }\n      timer = setTimeout(function() {\n        var qUpper = q.toUpperCase();\n        // Check for index symbol matches (BANKNIFTY, NIFTY, etc.)\n        var indexKeys = ['BANKNIFTY','NIFTY','FINNIFTY','MIDCPNIFTY','SENSEX','BANKEX'];\n        var idxMatches = indexKeys.filter(function(k) { return k.indexOf(qUpper) === 0; });\n        fetch('/api/search?q=' + encodeURIComponent(q))\n          .then(function(r) { return r.json(); })\n          .then(function(data) {\n            var idxItems = idxMatches.map(function(sym) {\n              return '<div class=\"pt2-search-item\" data-sym=\"' + sym + '\" data-isindex=\"1\">'\n                + '<span style=\"font-weight:700\">' + sym + '</span>'\n                + ' <span style=\"color:var(--text-muted);font-size:0.8rem\">\u2014 Index Options (CE/PE)</span>'\n                + '</div>';\n            }).join('');\n            if (!data.length && !idxMatches.length) { drop.style.display = 'none'; return; }\n            drop.innerHTML = idxItems + data.map(function(s) {\n              return '<div class=\"pt2-search-item\" data-sym=\"' + s.symbol + '\">'\n                + '<span style=\"font-weight:700\">' + s.symbol + '</span>'\n                + (s.company_name ? ' <span style=\"color:var(--text-muted);font-size:0.8rem\">\u2014 ' + s.company_name + '</span>' : '')\n                + '</div>';\n            }).join('');\n            drop.style.display = 'block';\n            drop.querySelectorAll('.pt2-search-item').forEach(function(el) {\n              el.addEventListener('click', function() {\n                var sym = el.getAttribute('data-sym');\n                var isIdx = el.getAttribute('data-isindex') === '1';\n                if (isIdx) {\n                  selectSymbol(sym, null, null);\n                } else {\n                  fetch('/api/price/' + sym)\n                    .then(function(r) { return r.json(); })\n                    .then(function(d) { selectSymbol(sym, d.price || null, d.change_pct != null ? d.change_pct : null); })\n                    .catch(function() { selectSymbol(sym, null, null); });\n                }\n              });\n            });\n          }).catch(function() {});\n      }, 220);\n    });\n\n    document.addEventListener('click', function(e) {\n      if (!e.target.closest('.pt2-sym-row')) drop.style.display = 'none';\n    });\n\n    // Auto-fill from URL ?buy=SYMBOL\n    var urlSym = new URLSearchParams(window.location.search).get('buy');\n    if (urlSym) {\n      inp.value = urlSym; symVal.value = urlSym;\n      pt2CheckIndex(urlSym);\n      fetch('/api/price/' + urlSym)\n        .then(function(r) { return r.json(); })\n        .then(function(d) { selectSymbol(urlSym, d.price || null, d.change_pct != null ? d.change_pct : null); })\n        .catch(function() {});\n    }\n\n    // Initial order type setup\n    pt2SetOrderType('MARKET');\n  })();\n\n  // \u2500\u2500 Options index detection & strike picker \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  var pt2OptType = 'CE';\n  var pt2IndexConfig = {\n    BANKNIFTY:  { step:100, expiry:'WED', lotSize:15 },\n    NIFTY:      { step:50,  expiry:'THU', lotSize:25 },\n    FINNIFTY:   { step:50,  expiry:'TUE', lotSize:40 },\n    MIDCPNIFTY: { step:25,  expiry:'MON', lotSize:75 },\n    SENSEX:     { step:100, expiry:'FRI', lotSize:10 },\n    BANKEX:     { step:100, expiry:'MON', lotSize:15 },\n  };\n\n  function pt2GetExpiry(expiryDay) {\n    var days = {SUN:0,MON:1,TUE:2,WED:3,THU:4,FRI:5,SAT:6};\n    var target = days[expiryDay] || 4;\n    var now = new Date();\n    var ist = new Date(now.toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));\n    var diff = (target - ist.getDay() + 7) % 7;\n    if (diff === 0 && ist.getHours() >= 16) diff = 7;\n    var exp = new Date(ist); exp.setDate(ist.getDate() + diff);\n    var dd = String(exp.getDate()).padStart(2,'0');\n    var mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][exp.getMonth()];\n    var yy = String(exp.getFullYear()).slice(2);\n    return { label: dd+' '+mon+' '+exp.getFullYear(), code: yy+mon+dd };\n  }\n\n  function pt2FormatSymbol(index, expCode, strike, optType) {\n    return index + expCode + strike + optType;\n  }\n\n  function pt2UpdateOptSymbol() {\n    var symInp   = document.getElementById('pt2-symbol-val');\n    var strikeInp = document.getElementById('pt2-strike-inp');\n    var disp     = document.getElementById('pt2-opt-sym-disp');\n    var hint     = document.getElementById('pt2-strike-hint');\n    var idx      = document.getElementById('pt2-stock-search').value.trim().toUpperCase();\n    var cfg      = pt2IndexConfig[idx];\n    if (!cfg || !strikeInp.value) { if (disp) disp.textContent = '\u2014'; return; }\n    var exp = pt2GetExpiry(cfg.expiry);\n    var sym = pt2FormatSymbol(idx, exp.code, strikeInp.value, pt2OptType);\n    if (symInp) symInp.value = sym;\n    if (disp) disp.textContent = sym;\n    var atmPrice = parseFloat(document.getElementById('pt2-price').dataset.indexPrice || '0');\n    var atm = Math.round(atmPrice / cfg.step) * cfg.step;\n    var s = parseInt(strikeInp.value);\n    if (hint) {\n      if (s === atm) hint.textContent = '\u2713 ATM';\n      else if ((pt2OptType === 'CE' && s < atm) || (pt2OptType === 'PE' && s > atm)) hint.textContent = 'ITM (' + (Math.abs(s - atm) / cfg.step) + ' strikes)';\n      else hint.textContent = 'OTM (' + (Math.abs(s - atm) / cfg.step) + ' strikes)';\n    }\n  }\n\n  function pt2SelectOptType(t) {\n    pt2OptType = t;\n    document.getElementById('pt2-btn-ce').classList.toggle('active', t === 'CE');\n    document.getElementById('pt2-btn-pe').classList.toggle('active', t === 'PE');\n    pt2UpdateOptSymbol();\n  }\n\n  function pt2StepStrike(dir) {\n    var si  = document.getElementById('pt2-strike-inp');\n    var idx = document.getElementById('pt2-stock-search').value.trim().toUpperCase();\n    var step = (pt2IndexConfig[idx] || {}).step || 100;\n    var cur  = parseInt(si.value) || 0;\n    si.value = cur + dir * step;\n    pt2UpdateOptSymbol();\n  }\n\n  function pt2CheckIndex(sym) {\n    var panel = document.getElementById('pt2-opts-panel');\n    if (!panel) return;\n    var cfg = pt2IndexConfig[sym.toUpperCase()];\n    if (cfg) {\n      panel.classList.add('show');\n      pt2SetOrderType('LIMIT'); // options need limit price\n      var exp = pt2GetExpiry(cfg.expiry);\n      var badge = document.getElementById('pt2-expiry-badge');\n      if (badge) badge.textContent = exp.label;\n      var priceInp = document.getElementById('pt2-price');\n      var atmPrice = parseFloat(priceInp.value) || 0;\n      if (atmPrice > 0) {\n        var atm = Math.round(atmPrice / cfg.step) * cfg.step;\n        var si  = document.getElementById('pt2-strike-inp');\n        if (si && !si.value) { si.value = String(atm); priceInp.dataset.indexPrice = String(atmPrice); }\n        pt2UpdateOptSymbol();\n      }\n    } else {\n      panel.classList.remove('show');\n      var symVal = document.getElementById('pt2-symbol-val');\n      if (symVal) symVal.value = sym.toUpperCase();\n    }\n  }\n  </script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
// ── GET /my-paper-trade ─ Personal paper trading portfolio ──────────────────
app.get("/my-paper-trade", requireAuth, featureGate("feature_my_paper_trade", "Paper Trading"), premiumGate("paper_trade_premium_only", "Paper Trading"), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, userName, otpRequired, uInfo, _a, port, positions, trades, tradeCount, ptConfig, activeSub, freeLimit, _b, isPremium, tradesLeft, creditsOut, dbPrices, _c, priceMap, _i, dbPrices_2, r, posRows, investedTotal, curValTotal, portfolioValue, totalPnl, totalPnlPct, sellTrades, realizedPnl, wins, losses, winRate, eq, eqData, eqLabels;
    var _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                userId = req.session.userId;
                userName = req.session.userName || "Trader";
                return [4 /*yield*/, (0, db_1.getSetting)("otp_required")];
            case 1:
                otpRequired = (_e.sent()) !== "false";
                if (!otpRequired) return [3 /*break*/, 3];
                return [4 /*yield*/, (0, db_1.dbAll)("SELECT mobile_verified FROM users WHERE id=?", [userId])];
            case 2:
                uInfo = _e.sent();
                if (!((_d = uInfo[0]) === null || _d === void 0 ? void 0 : _d.mobile_verified)) {
                    res.redirect("/verify-mobile?next=/my-paper-trade");
                    return [2 /*return*/];
                }
                _e.label = 3;
            case 3: return [4 /*yield*/, Promise.all([
                    (0, db_1.getPaperPortfolio)(userId),
                    (0, db_1.getPaperPositions)(userId),
                    (0, db_1.getPaperTrades)(userId, 60),
                    (0, db_1.countPaperTrades)(userId),
                    (0, db_1.getPaperTradeConfig)(userId),
                    (0, db_1.getActiveSubscription)(userId),
                ])];
            case 4:
                _a = _e.sent(), port = _a[0], positions = _a[1], trades = _a[2], tradeCount = _a[3], ptConfig = _a[4], activeSub = _a[5];
                _b = parseInt;
                return [4 /*yield*/, (0, db_1.getSetting)("paper_free_limit")];
            case 5:
                freeLimit = _b.apply(void 0, [(_e.sent()) || "10", 10]);
                isPremium = !!activeSub || req.session.userRole === "premium" || req.session.userRole === "admin";
                tradesLeft = isPremium ? null : Math.max(0, freeLimit - tradeCount);
                creditsOut = !isPremium && tradeCount >= freeLimit;
                if (!positions.length) return [3 /*break*/, 7];
                return [4 /*yield*/, (0, db_1.dbAll)("SELECT symbol, price FROM prices WHERE symbol IN (".concat(positions.map(function () { return "?"; }).join(","), ")"), positions.map(function (p) { return p.symbol; }))];
            case 6:
                _c = _e.sent();
                return [3 /*break*/, 8];
            case 7:
                _c = [];
                _e.label = 8;
            case 8:
                dbPrices = _c;
                priceMap = {};
                for (_i = 0, dbPrices_2 = dbPrices; _i < dbPrices_2.length; _i++) {
                    r = dbPrices_2[_i];
                    if (r.price != null)
                        priceMap[r.symbol] = r.price;
                }
                posRows = positions.map(function (p) {
                    var _a;
                    var livePrice = (_a = priceMap[p.symbol]) !== null && _a !== void 0 ? _a : p.avg_price;
                    var curVal = parseFloat((livePrice * p.qty).toFixed(2));
                    var pnl = parseFloat((curVal - p.invested).toFixed(2));
                    var pnlPct = parseFloat(((pnl / p.invested) * 100).toFixed(2));
                    return __assign(__assign({}, p), { livePrice: livePrice, curVal: curVal, pnl: pnl, pnlPct: pnlPct });
                });
                investedTotal = posRows.reduce(function (s, p) { return s + p.invested; }, 0);
                curValTotal = posRows.reduce(function (s, p) { return s + p.curVal; }, 0);
                portfolioValue = parseFloat((port.balance + curValTotal).toFixed(2));
                totalPnl = parseFloat((portfolioValue - 100000).toFixed(2));
                totalPnlPct = parseFloat(((totalPnl / 100000) * 100).toFixed(2));
                sellTrades = trades.filter(function (t) { return t.action === "SELL"; });
                realizedPnl = parseFloat(sellTrades.reduce(function (s, t) { var _a; return s + ((_a = t.pnl) !== null && _a !== void 0 ? _a : 0); }, 0).toFixed(2));
                wins = sellTrades.filter(function (t) { var _a; return ((_a = t.pnl) !== null && _a !== void 0 ? _a : 0) > 0; }).length;
                losses = sellTrades.filter(function (t) { var _a; return ((_a = t.pnl) !== null && _a !== void 0 ? _a : 0) <= 0; }).length;
                winRate = sellTrades.length > 0 ? ((wins / sellTrades.length) * 100).toFixed(1) : "—";
                eq = 0;
                eqData = sellTrades.slice().reverse().map(function (t) { var _a; eq += (_a = t.pnl) !== null && _a !== void 0 ? _a : 0; return parseFloat(eq.toFixed(2)); });
                eqLabels = sellTrades.slice().reverse().map(function (t) { return t.traded_at.slice(5, 10); });
                res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>My Paper Trade \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n  <script src=\"https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js\"></script>\n  <style>\n    .mpt-hero { background: var(--card-bg); border: 1px solid var(--border); border-radius: 14px; padding: 24px 28px; margin-bottom: 24px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }\n    .mpt-hero-title { font-size: 1.5rem; font-weight: 800; }\n    .mpt-hero-sub   { color: var(--text-muted); font-size: 0.88rem; margin-top: 4px; }\n    .mpt-balance    { font-size: 2rem; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; }\n    .mpt-bal-label  { font-size: 0.78rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; }\n    .mpt-kpi-row    { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap: 12px; margin-bottom: 24px; }\n    .mpt-kpi        { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }\n    .mpt-kpi-label  { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }\n    .mpt-kpi-val    { font-size: 1.25rem; font-weight: 700; font-variant-numeric: tabular-nums; }\n    .mpt-green { color: #10b981; } .mpt-red { color: #ef4444; } .mpt-yellow { color: #f59e0b; }\n    .mpt-section    { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--text-muted); border-bottom: 1px solid var(--border); padding-bottom: 8px; margin: 24px 0 14px; }\n    .mpt-pos-table, .mpt-history-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }\n    .mpt-pos-table th, .mpt-history-table th { text-align: left; padding: 8px 10px; border-bottom: 2px solid var(--border); font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); }\n    .mpt-pos-table td, .mpt-history-table td { padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }\n    .mpt-pos-table tr:hover td, .mpt-history-table tr:hover td { background: var(--hover-bg); }\n    .mpt-sym { font-weight: 700; color: var(--accent); cursor:pointer; }\n    .mpt-sym:hover { text-decoration: underline; }\n    .mpt-action-buy  { background:#10b98122; color:#10b981; border:1px solid #10b98155; border-radius:4px; padding:2px 8px; font-size:0.75rem; font-weight:700; }\n    .mpt-action-sell { background:#ef444422; color:#ef4444; border:1px solid #ef444455; border-radius:4px; padding:2px 8px; font-size:0.75rem; font-weight:700; }\n    .mpt-sell-btn   { background: #ef444422; color: #ef4444; border: 1px solid #ef444455; border-radius: 6px; padding: 4px 12px; font-size: 0.8rem; cursor:pointer; font-weight:600; }\n    .mpt-sell-btn:hover { background: #ef444440; }\n    .mpt-buy-form   { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; }\n    .mpt-buy-form h3 { margin: 0 0 16px; font-size: 1rem; font-weight: 700; }\n    .mpt-form-row   { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }\n    .mpt-form-group { display: flex; flex-direction: column; gap: 5px; }\n    .mpt-form-group label { font-size: 0.78rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; }\n    .mpt-form-group input, .mpt-form-group select { background: var(--input-bg); border: 1px solid var(--border); border-radius: 7px; padding: 8px 12px; color: var(--text); font-size: 0.9rem; width: 160px; }\n    .mpt-btn-buy    { background: #10b981; color: #fff; border: none; border-radius: 8px; padding: 10px 22px; font-weight: 700; font-size: 0.9rem; cursor: pointer; }\n    .mpt-btn-buy:hover { background: #059669; }\n    .mpt-btn-reset  { background: transparent; color: var(--text-muted); border: 1px solid var(--border); border-radius: 8px; padding: 8px 16px; font-size: 0.82rem; cursor: pointer; }\n    .mpt-btn-reset:hover { color: #ef4444; border-color: #ef4444; }\n    .mpt-msg { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.9rem; font-weight: 600; }\n    .mpt-msg-ok  { background: #10b98122; color: #10b981; border: 1px solid #10b98155; }\n    .mpt-msg-err { background: #ef444422; color: #ef4444; border: 1px solid #ef444455; }\n    .mpt-empty  { color: var(--text-muted); font-size: 0.9rem; padding: 24px; text-align: center; }\n    .mpt-chart-wrap { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; }\n    .mpt-search-wrap { position: relative; }\n    .mpt-search-drop { position: absolute; top: 100%; left: 0; background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; z-index: 200; width: 240px; box-shadow: 0 8px 24px rgba(0,0,0,.2); max-height: 240px; overflow-y: auto; }\n    .mpt-search-item { padding: 9px 14px; cursor: pointer; font-size: 0.88rem; }\n    .mpt-search-item:hover { background: var(--hover-bg); }\n    .mpt-search-sym  { font-weight: 700; }\n    .mpt-search-co   { color: var(--text-muted); font-size: 0.8rem; }\n    .mpt-disclaimer  { font-size: 0.78rem; color: var(--text-muted); background: var(--bg2); border-radius: 8px; padding: 12px 16px; margin-top: 24px; }\n    .mpt-credits-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; background:var(--card-bg); border:1px solid var(--border); border-radius:10px; padding:12px 18px; margin-bottom:18px; font-size:0.88rem; }\n    .mpt-credits-free { color:#f59e0b; font-weight:700; }\n    .mpt-credits-prem { color:#10b981; font-weight:700; }\n    .mpt-credits-out  { background:#ef444415; border-color:#ef444455; }\n    .mpt-mh-badge { font-size:0.78rem; padding:3px 10px; border-radius:20px; font-weight:700; }\n    .mpt-mh-open  { background:#10b98122; color:#10b981; border:1px solid #10b98155; }\n    .mpt-mh-closed{ background:#ef444415; color:#ef4444; border:1px solid #ef444455; }\n    .mpt-type-intra { background:#3b82f622; color:#3b82f6; border:1px solid #3b82f655; border-radius:4px; padding:2px 7px; font-size:0.73rem; font-weight:700; }\n    .mpt-type-hold  { background:#a855f722; color:#a855f7; border:1px solid #a855f755; border-radius:4px; padding:2px 7px; font-size:0.73rem; font-weight:700; }\n    @media (max-width:600px) { .mpt-form-row { flex-direction: column; } .mpt-form-group input, .mpt-form-group select { width: 100%; } }\n  </style>\n</head>\n<body>\n  ".concat(nav("my-paper-trade", req), "\n  <div class=\"container\" style=\"max-width:1060px\">\n\n    <!-- HERO -->\n    <div class=\"mpt-hero\">\n      <div>\n        <div class=\"mpt-hero-title\">\uFFFD My Portfolio</div>\n        <div class=\"mpt-hero-sub\">Virtual trading dashboard \u00B7 \u20B91,00,000 starting capital \u00B7 Zero real risk</div>\n      </div>\n      <div style=\"text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:10px\">\n        <a href=\"/paper-trade\" style=\"display:inline-flex;align-items:center;gap:8px;background:#10b981;color:#fff;border-radius:10px;padding:10px 20px;font-weight:700;font-size:0.9rem;text-decoration:none\">\uD83D\uDCC8 New Trade \u2192</a>\n        <div>\n          <div class=\"mpt-bal-label\">Available Cash</div>\n          <div class=\"mpt-balance\">\u20B9").concat(port.balance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), "</div>\n        </div>\n      </div>\n    </div>\n\n    <!-- FLASH MESSAGE -->\n    ").concat(req.query.msg ? "<div class=\"mpt-msg mpt-msg-ok\">\u2705 ".concat(esc(req.query.msg), "</div>") : "", "\n    ").concat(req.query.err ? "<div class=\"mpt-msg mpt-msg-err\">\u274C ".concat(esc(req.query.err), "</div>") : "", "\n\n    <!-- CREDITS & MARKET HOURS BAR -->\n    <div class=\"mpt-credits-bar ").concat(creditsOut ? 'mpt-credits-out' : '', "\">\n      <div style=\"display:flex;align-items:center;gap:14px;flex-wrap:wrap\">\n        ").concat(isPremium
                    ? "<span class=\"mpt-credits-prem\">\uD83D\uDC51 Premium \u2014 Unlimited trades</span>"
                    : creditsOut
                        ? "<span style=\"color:#ef4444;font-weight:700\">\u26A0\uFE0F Free trades used up (".concat(tradeCount, "/").concat(freeLimit, ") \u2014 <a href=\"/my-paper-trade/upgrade\" style=\"color:#ef4444\">Upgrade to Premium \u2192</a></span>")
                        : "<span class=\"mpt-credits-free\">\uD83C\uDFAB Free: ".concat(tradesLeft, " of ").concat(freeLimit, " trades left</span>\n               <a href=\"/my-paper-trade/upgrade\" style=\"font-size:0.8rem;color:var(--text-muted)\">Upgrade for unlimited \u2192</a>"), "\n      </div>\n      <div style=\"display:flex;align-items:center;gap:10px\">\n        <span class=\"mpt-mh-badge ").concat(isMarketHours() ? 'mpt-mh-open' : 'mpt-mh-closed', "\">").concat(isMarketHours() ? '🟢 Market Open' : '🔴 Market Closed', "</span>\n      </div>\n    </div>\n\n    <!-- KPI ROW -->\n    <div class=\"mpt-kpi-row\">\n      <div class=\"mpt-kpi\">\n        <div class=\"mpt-kpi-label\">Portfolio Value</div>\n        <div class=\"mpt-kpi-val ").concat(portfolioValue >= 100000 ? "mpt-green" : "mpt-red", "\">\u20B9").concat(portfolioValue.toLocaleString("en-IN", { maximumFractionDigits: 0 }), "</div>\n      </div>\n      <div class=\"mpt-kpi\">\n        <div class=\"mpt-kpi-label\">Total PnL</div>\n        <div class=\"mpt-kpi-val ").concat(totalPnl >= 0 ? "mpt-green" : "mpt-red", "\">").concat(totalPnl >= 0 ? "+" : "", "\u20B9").concat(Math.abs(totalPnl).toLocaleString("en-IN", { maximumFractionDigits: 0 }), " (").concat(totalPnlPct >= 0 ? "+" : "").concat(totalPnlPct, "%)</div>\n      </div>\n      <div class=\"mpt-kpi\">\n        <div class=\"mpt-kpi-label\">Realized PnL</div>\n        <div class=\"mpt-kpi-val ").concat(realizedPnl >= 0 ? "mpt-green" : "mpt-red", "\">").concat(realizedPnl >= 0 ? "+" : "", "\u20B9").concat(Math.abs(realizedPnl).toLocaleString("en-IN", { maximumFractionDigits: 0 }), "</div>\n      </div>\n      <div class=\"mpt-kpi\">\n        <div class=\"mpt-kpi-label\">Win Rate</div>\n        <div class=\"mpt-kpi-val ").concat(wins > losses ? "mpt-green" : "mpt-red", "\">").concat(winRate).concat(winRate !== "—" ? "%" : "", "</div>\n      </div>\n      <div class=\"mpt-kpi\">\n        <div class=\"mpt-kpi-label\">Wins / Losses</div>\n        <div class=\"mpt-kpi-val\"><span class=\"mpt-green\">").concat(wins, "</span> / <span class=\"mpt-red\">").concat(losses, "</span></div>\n      </div>\n      <div class=\"mpt-kpi\">\n        <div class=\"mpt-kpi-label\">Invested</div>\n        <div class=\"mpt-kpi-val\">\u20B9").concat(investedTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 }), "</div>\n      </div>\n    </div>\n\n    <!-- OPEN POSITIONS -->\n    <div class=\"mpt-section\">Open Positions (").concat(posRows.length, ")</div>\n    ").concat(posRows.length === 0
                    ? "<div class=\"mpt-empty\">No open positions yet. <a href=\"/paper-trade\" style=\"color:var(--accent)\">Place your first trade \u2192</a></div>"
                    : "<div style=\"overflow-x:auto\">\n        <table class=\"mpt-pos-table\">\n          <thead><tr>\n            <th>Symbol</th><th>Company</th><th>Type</th><th>Qty</th>\n            <th>Avg Price</th><th>Invested</th><th>Live Price</th>\n            <th>Cur. Value</th><th>P&L</th><th>P&L%</th><th>Action</th>\n          </tr></thead>\n          <tbody>\n            ".concat(posRows.map(function (p) {
                        var _a;
                        return "<tr>\n              <td><a href=\"/stock/".concat(p.symbol, "\" class=\"mpt-sym\">").concat(p.symbol, "</a></td>\n              <td style=\"font-size:0.83rem; max-width:140px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis\">").concat((_a = p.company_name) !== null && _a !== void 0 ? _a : "—", "</td>\n              <td><span class=\"").concat(p.trade_type === 'HOLDING' ? 'mpt-type-hold' : 'mpt-type-intra', "\">").concat(p.trade_type === 'HOLDING' ? 'HOLD' : 'INTRA', "</span></td>\n              <td>").concat(p.qty, "</td>\n              <td>\u20B9").concat(p.avg_price.toFixed(2), "</td>\n              <td>\u20B9").concat(p.invested.toLocaleString("en-IN", { maximumFractionDigits: 0 }), "</td>\n              <td>\u20B9").concat(p.livePrice.toFixed(2), "</td>\n              <td>\u20B9").concat(p.curVal.toLocaleString("en-IN", { maximumFractionDigits: 0 }), "</td>\n              <td class=\"").concat(p.pnl >= 0 ? "mpt-green" : "mpt-red", "\" style=\"font-weight:700\">").concat(p.pnl >= 0 ? "+" : "", "\u20B9").concat(p.pnl.toLocaleString("en-IN", { maximumFractionDigits: 0 }), "</td>\n              <td class=\"").concat(p.pnl >= 0 ? "mpt-green" : "mpt-red", "\">").concat(p.pnlPct >= 0 ? "+" : "").concat(p.pnlPct, "%</td>\n              <td>\n                <form method=\"POST\" action=\"/my-paper-trade/sell\" style=\"display:inline-flex;gap:6px;align-items:center\">\n                  <input type=\"hidden\" name=\"symbol\" value=\"").concat(p.symbol, "\">\n                  <input type=\"number\" name=\"qty\" min=\"1\" max=\"").concat(p.qty, "\" value=\"").concat(p.qty, "\" style=\"width:60px;padding:3px 7px;border-radius:5px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:0.82rem\">\n                  <input type=\"hidden\" name=\"price\" value=\"").concat(p.livePrice.toFixed(2), "\">\n                  <button type=\"submit\" class=\"mpt-sell-btn\">Sell</button>\n                </form>\n              </td>\n            </tr>");
                    }).join(""), "\n          </tbody>\n        </table>\n      </div>"), "\n\n    <!-- EQUITY CURVE -->\n    ").concat(eqData.length >= 2 ? "\n    <div class=\"mpt-section\">Realized P&L Curve</div>\n    <div class=\"mpt-chart-wrap\">\n      <canvas id=\"mptEqChart\" height=\"70\"></canvas>\n    </div>" : "", "\n\n    <!-- TRADE HISTORY -->\n    <div class=\"mpt-section\">Trade History (").concat(trades.length, ")</div>\n    ").concat(trades.length === 0
                    ? "<div class=\"mpt-empty\">No trades yet. <a href=\"/paper-trade\" style=\"color:var(--accent)\">Place your first trade \u2192</a></div>"
                    : "<div style=\"overflow-x:auto\">\n        <table class=\"mpt-history-table\">\n          <thead><tr>\n            <th>Date/Time</th><th>Symbol</th><th>Type</th><th>Action</th><th>Qty</th>\n            <th>Price</th><th>Total</th><th>P&L</th><th>P&L%</th><th>Balance After</th>\n          </tr></thead>\n          <tbody>\n            ".concat(trades.map(function (t) {
                        var _a, _b, _c;
                        var isPos = ((_a = t.pnl) !== null && _a !== void 0 ? _a : 0) >= 0;
                        return "<tr>\n                <td style=\"font-size:0.82rem;color:var(--text-muted)\">".concat(t.traded_at.slice(0, 16).replace("T", " "), "</td>\n                <td><a href=\"/stock/").concat(t.symbol, "\" class=\"mpt-sym\">").concat(t.symbol, "</a></td>\n                <td><span class=\"").concat((t.trade_type || 'INTRADAY') === 'HOLDING' ? 'mpt-type-hold' : 'mpt-type-intra', "\">").concat((t.trade_type || 'INTRADAY') === 'HOLDING' ? 'HOLD' : 'INTRA', "</span></td>\n                <td><span class=\"mpt-action-").concat(t.action.toLowerCase(), "\">").concat(t.action, "</span></td>\n                <td>").concat(t.qty, "</td>\n                <td>\u20B9").concat(t.price.toFixed(2), "</td>\n                <td>\u20B9").concat(t.total.toLocaleString("en-IN", { maximumFractionDigits: 0 }), "</td>\n                <td class=\"").concat(t.pnl != null ? (isPos ? "mpt-green" : "mpt-red") : "", "\" style=\"font-weight:").concat(t.pnl != null ? "700" : "400", "\">").concat(t.pnl != null ? (isPos ? "+" : "") + "₹" + t.pnl.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—", "</td>\n                <td class=\"").concat(t.pnl_pct != null ? (((_b = t.pnl_pct) !== null && _b !== void 0 ? _b : 0) >= 0 ? "mpt-green" : "mpt-red") : "", "\">").concat(t.pnl_pct != null ? (((_c = t.pnl_pct) !== null && _c !== void 0 ? _c : 0) >= 0 ? "+" : "") + t.pnl_pct + "%" : "—", "</td>\n                <td>\u20B9").concat(t.balance_after.toLocaleString("en-IN", { maximumFractionDigits: 0 }), "</td>\n              </tr>");
                    }).join(""), "\n          </tbody>\n        </table>\n      </div>"), "\n\n    <!-- RESET -->\n    <div style=\"margin-top:32px; padding-top:20px; border-top:1px solid var(--border); display:flex; align-items:center; gap:16px; flex-wrap:wrap\">\n      <form method=\"POST\" action=\"/my-paper-trade/reset\" onsubmit=\"return confirm('Reset your entire paper portfolio? This cannot be undone.')\">\n        <button type=\"submit\" class=\"mpt-btn-reset\">\uD83D\uDD04 Reset Portfolio (restart with \u20B91,00,000)</button>\n      </form>\n      <span style=\"font-size:0.8rem; color:var(--text-muted)\">Hi ").concat(esc(userName.split(" ")[0]), " \u00B7 Your portfolio is saved to your account</span>\n    </div>\n\n    <div class=\"mpt-disclaimer\">\n      \u26A0\uFE0F <strong>Disclaimer:</strong> Paper trading uses simulated virtual money \u2014 no real funds are at risk.\n      Prices used for buy/sell are from the ZeroScreen DB (NSE data, updated periodically) and may not reflect the exact live market price.\n      Results from paper trading do not guarantee similar outcomes in real trading.\n    </div>\n\n    <footer class=\"site-footer\" style=\"margin-top:24px\"><span>\u00A9 2026 ZeroScreen \u00B7 Paper trading simulation \u00B7 no real capital at risk</span></footer>\n  </div>\n\n  <script src=\"/public/js/app.js\"></script>\n  <script>\n  ").concat(eqData.length >= 2 ? "\n  (function() {\n    var labels = ".concat(JSON.stringify(eqLabels), ";\n    var data   = ").concat(JSON.stringify(eqData), ";\n    var color  = data[data.length-1] >= 0 ? '#10b981' : '#ef4444';\n    new Chart(document.getElementById('mptEqChart').getContext('2d'), {\n      type: 'line',\n      data: { labels, datasets: [{ data, borderColor: color,\n        backgroundColor: data[data.length-1] >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',\n        fill: true, tension: 0.35, pointRadius: data.length > 50 ? 0 : 4, borderWidth: 2 }] },\n      options: { responsive:true, plugins:{legend:{display:false},tooltip:{mode:'index',intersect:false,callbacks:{label:ctx=>'\u20B9'+ctx.raw}}},\n        scales:{x:{display:data.length<=60,ticks:{maxTicksLimit:10}},y:{ticks:{callback:v=>'\u20B9'+v}}} }\n    });\n  })();") : "", "\n  </script>\n</body>\n</html>"));
                return [2 /*return*/];
        }
    });
}); });
// ── POST /my-paper-trade/buy ──────────────────────────────────────────────────
app.post("/my-paper-trade/buy", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, otpReq, uInfo, _a, tradeCount, activeSub, freeLimit, _b, isPremium, symbol, qty, price, tradeType, orderType, slPct, tgtPct, slPrice, targetPrice, stock, companyName, result;
    var _c, _d, _e;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                userId = req.session.userId;
                if (!isMarketHours()) {
                    res.redirect("/paper-trade?err=" + encodeURIComponent("Paper trading only available during market hours (Mon–Fri 9:15 AM – 3:30 PM IST)"));
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.getSetting)("otp_required")];
            case 1:
                otpReq = (_f.sent()) !== "false";
                if (!otpReq) return [3 /*break*/, 3];
                return [4 /*yield*/, (0, db_1.dbAll)("SELECT mobile_verified FROM users WHERE id=?", [userId])];
            case 2:
                uInfo = _f.sent();
                if (!((_c = uInfo[0]) === null || _c === void 0 ? void 0 : _c.mobile_verified)) {
                    res.redirect("/verify-mobile?next=/my-paper-trade");
                    return [2 /*return*/];
                }
                _f.label = 3;
            case 3: return [4 /*yield*/, Promise.all([(0, db_1.countPaperTrades)(userId), (0, db_1.getActiveSubscription)(userId)])];
            case 4:
                _a = _f.sent(), tradeCount = _a[0], activeSub = _a[1];
                _b = parseInt;
                return [4 /*yield*/, (0, db_1.getSetting)("paper_free_limit")];
            case 5:
                freeLimit = _b.apply(void 0, [(_f.sent()) || "10", 10]);
                isPremium = !!activeSub || req.session.userRole === "premium" || req.session.userRole === "admin";
                if (!isPremium && tradeCount >= freeLimit) {
                    res.redirect("/my-paper-trade/upgrade?err=" + encodeURIComponent("Free limit reached (".concat(freeLimit, " trades). Upgrade to Premium for unlimited trades.")));
                    return [2 /*return*/];
                }
                symbol = (req.body.symbol || "").toUpperCase().trim();
                qty = parseInt(req.body.qty, 10);
                price = parseFloat(req.body.price);
                tradeType = req.body.trade_type === "HOLDING" ? "HOLDING" : "INTRADAY";
                orderType = req.body.order_type === "LIMIT" ? "LIMIT" : "MARKET";
                slPct = parseFloat(req.body.sl_pct);
                tgtPct = parseFloat(req.body.target_pct);
                if (!symbol || !Number.isInteger(qty) || qty < 1 || qty > 10000 || isNaN(price) || price <= 0) {
                    res.redirect("/my-paper-trade?err=Invalid+buy+parameters");
                    return [2 /*return*/];
                }
                slPrice = (!isNaN(slPct) && slPct > 0) ? parseFloat((price * (1 - slPct / 100)).toFixed(2)) : null;
                targetPrice = (!isNaN(tgtPct) && tgtPct > 0) ? parseFloat((price * (1 + tgtPct / 100)).toFixed(2)) : null;
                return [4 /*yield*/, (0, db_1.dbAll)("SELECT company_name FROM stocks WHERE symbol=?", [symbol])];
            case 6:
                stock = _f.sent();
                companyName = (_e = (_d = stock[0]) === null || _d === void 0 ? void 0 : _d.company_name) !== null && _e !== void 0 ? _e : null;
                return [4 /*yield*/, (0, db_1.paperBuy)(userId, symbol, companyName, qty, price, tradeType, slPrice, targetPrice, orderType)];
            case 7:
                result = _f.sent();
                res.redirect("/my-paper-trade?".concat(result.ok ? "msg" : "err", "=").concat(encodeURIComponent(result.msg)));
                return [2 /*return*/];
        }
    });
}); });
// ── POST /my-paper-trade/sell ─────────────────────────────────────────────────
app.post("/my-paper-trade/sell", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, symbol, qty, price, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                userId = req.session.userId;
                if (!isMarketHours()) {
                    res.redirect("/my-paper-trade?err=" + encodeURIComponent("Paper trading only available during market hours (Mon–Fri 9:15 AM – 3:30 PM IST)"));
                    return [2 /*return*/];
                }
                symbol = (req.body.symbol || "").toUpperCase().trim();
                qty = parseInt(req.body.qty, 10);
                price = parseFloat(req.body.price);
                if (!symbol || !Number.isInteger(qty) || qty < 1 || isNaN(price) || price <= 0) {
                    res.redirect("/my-paper-trade?err=Invalid+sell+parameters");
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, db_1.paperSell)(userId, symbol, qty, price)];
            case 1:
                result = _a.sent();
                res.redirect("/my-paper-trade?".concat(result.ok ? "msg" : "err", "=").concat(encodeURIComponent(result.msg)));
                return [2 /*return*/];
        }
    });
}); });
// ── POST /my-paper-trade/reset ────────────────────────────────────────────────
app.post("/my-paper-trade/reset", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, db_1.paperReset)(req.session.userId)];
            case 1:
                _a.sent();
                res.redirect("/my-paper-trade?msg=Portfolio+reset+successfully.+Starting+fresh+with+%E2%82%B91%2C00%2C000");
                return [2 /*return*/];
        }
    });
}); });
// ── GET /my-paper-trade/config ────────────────────────────────────────────────
app.get("/my-paper-trade/config", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var cfg, saved;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, db_1.getPaperTradeConfig)(req.session.userId)];
            case 1:
                cfg = _a.sent();
                saved = req.query.saved === "1";
                res.send("<!DOCTYPE html><html lang=\"en\"><head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Paper Trade Settings \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n  <style>\n    .cfg-card{max-width:480px;margin:40px auto;background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:28px 32px}\n    .cfg-title{font-size:1.25rem;font-weight:800;margin-bottom:4px}\n    .cfg-sub{color:var(--text-muted);font-size:0.85rem;margin-bottom:24px}\n    .cfg-row{display:flex;flex-direction:column;gap:5px;margin-bottom:16px}\n    .cfg-label{font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em}\n    .cfg-input,.cfg-select{background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:8px 12px;color:var(--text);font-size:0.9rem;width:100%;box-sizing:border-box}\n    .cfg-btn{background:var(--accent);color:#fff;border:none;border-radius:8px;padding:10px 24px;font-weight:700;cursor:pointer;font-size:0.9rem;margin-top:8px}\n    .cfg-ok{background:#10b98122;color:#10b981;border:1px solid #10b98155;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:0.88rem}\n  </style>\n</head><body>".concat(nav("my-paper-trade", req), "\n<div class=\"container\">\n  <div class=\"cfg-card\">\n    <div class=\"cfg-title\">\u2699\uFE0F Paper Trade Settings</div>\n    <div class=\"cfg-sub\">Your default settings for new trades. You can override per-trade on the main page.</div>\n    ").concat(saved ? "<div class=\"cfg-ok\">\u2705 Settings saved!</div>" : "", "\n    <form method=\"POST\" action=\"/my-paper-trade/config\">\n      <div class=\"cfg-row\">\n        <label class=\"cfg-label\">Default Trade Type</label>\n        <select class=\"cfg-select\" name=\"trade_type\">\n          <option value=\"INTRADAY\" ").concat(cfg.trade_type === "INTRADAY" ? "selected" : "", ">Intraday (square off same day)</option>\n          <option value=\"HOLDING\"  ").concat(cfg.trade_type === "HOLDING" ? "selected" : "", ">Holding (positional / multi-day)</option>\n        </select>\n      </div>\n      <div class=\"cfg-row\">\n        <label class=\"cfg-label\">Default Quantity</label>\n        <input class=\"cfg-input\" type=\"number\" name=\"default_qty\" min=\"1\" max=\"10000\" value=\"").concat(cfg.default_qty, "\">\n      </div>\n      <div class=\"cfg-row\">\n        <label class=\"cfg-label\">Default Stop Loss %</label>\n        <input class=\"cfg-input\" type=\"number\" name=\"default_sl_pct\" min=\"0.1\" max=\"50\" step=\"0.1\" value=\"").concat(cfg.default_sl_pct, "\">\n      </div>\n      <div class=\"cfg-row\">\n        <label class=\"cfg-label\">Default Target %</label>\n        <input class=\"cfg-input\" type=\"number\" name=\"default_tgt_pct\" min=\"0.1\" max=\"200\" step=\"0.1\" value=\"").concat(cfg.default_tgt_pct, "\">\n      </div>\n      <div class=\"cfg-row\">\n        <label class=\"cfg-label\">Max Open Positions</label>\n        <input class=\"cfg-input\" type=\"number\" name=\"max_positions\" min=\"1\" max=\"50\" value=\"").concat(cfg.max_positions, "\">\n      </div>\n      <button type=\"submit\" class=\"cfg-btn\">Save Settings</button>\n    </form>\n    <p style=\"margin-top:16px\"><a href=\"/my-paper-trade\" style=\"color:var(--text-muted);font-size:0.85rem\">\u2190 Back to Portfolio</a></p>\n  </div>\n</div>\n<script src=\"/public/js/app.js\"></script></body></html>"));
                return [2 /*return*/];
        }
    });
}); });
app.post("/my-paper-trade/config", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, trade_type, default_qty, default_sl_pct, default_tgt_pct, max_positions;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                userId = req.session.userId;
                trade_type = req.body.trade_type === "HOLDING" ? "HOLDING" : "INTRADAY";
                default_qty = Math.max(1, Math.min(10000, parseInt(req.body.default_qty, 10) || 1));
                default_sl_pct = Math.max(0.1, Math.min(50, parseFloat(req.body.default_sl_pct) || 2));
                default_tgt_pct = Math.max(0.1, Math.min(200, parseFloat(req.body.default_tgt_pct) || 4));
                max_positions = Math.max(1, Math.min(50, parseInt(req.body.max_positions, 10) || 10));
                return [4 /*yield*/, (0, db_1.savePaperTradeConfig)(userId, { trade_type: trade_type, default_qty: default_qty, default_sl_pct: default_sl_pct, default_tgt_pct: default_tgt_pct, max_positions: max_positions })];
            case 1:
                _a.sent();
                res.redirect("/my-paper-trade/config?saved=1");
                return [2 /*return*/];
        }
    });
}); });
// ── GET /my-paper-trade/upgrade ───────────────────────────────────────────────
app.get("/my-paper-trade/upgrade", requireAuth, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var err, activeSub, isPremium, freeLimit;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                err = esc(req.query.err || "");
                return [4 /*yield*/, (0, db_1.getActiveSubscription)(req.session.userId)];
            case 1:
                activeSub = _a.sent();
                isPremium = !!activeSub || req.session.userRole === "premium" || req.session.userRole === "admin";
                return [4 /*yield*/, (0, db_1.getSetting)("paper_free_limit")];
            case 2:
                freeLimit = (_a.sent()) || "10";
                res.send("<!DOCTYPE html><html lang=\"en\"><head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Upgrade \u2014 Paper Trade Premium</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n  <style>\n    .upg-card{max-width:520px;margin:40px auto;background:var(--card-bg);border:1px solid var(--border);border-radius:16px;padding:32px 36px;text-align:center}\n    .upg-icon{font-size:2.5rem;margin-bottom:12px}\n    .upg-title{font-size:1.5rem;font-weight:800;margin-bottom:6px}\n    .upg-sub{color:var(--text-muted);font-size:0.9rem;margin-bottom:24px}\n    .upg-err{background:#ef444422;color:#ef4444;border:1px solid #ef444455;border-radius:8px;padding:10px 14px;margin-bottom:18px;font-size:0.88rem}\n    .upg-feats{text-align:left;background:var(--bg2);border-radius:10px;padding:16px 20px;margin-bottom:24px}\n    .upg-feat{padding:6px 0;font-size:0.9rem;border-bottom:1px solid var(--border)}\n    .upg-feat:last-child{border-bottom:none}\n    .upg-price{font-size:1.8rem;font-weight:800;color:var(--accent);margin-bottom:4px}\n    .upg-period{font-size:0.82rem;color:var(--text-muted);margin-bottom:20px}\n    .upg-btn{display:inline-block;background:var(--accent);color:#fff;border:none;border-radius:10px;padding:12px 32px;font-weight:700;font-size:1rem;cursor:pointer;text-decoration:none}\n    .upg-ok{background:#10b98122;color:#10b981;border:1px solid #10b98155;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-weight:700}\n  </style>\n</head><body>".concat(nav("my-paper-trade", req), "\n<div class=\"container\">\n  <div class=\"upg-card\">\n    <div class=\"upg-icon\">\uD83D\uDC51</div>\n    <div class=\"upg-title\">Paper Trade Premium</div>\n    <div class=\"upg-sub\">Unlock unlimited paper trades every month and advanced features.</div>\n    ").concat(err ? "<div class=\"upg-err\">\u26A0\uFE0F ".concat(err, "</div>") : "", "\n    ").concat(isPremium ? "<div class=\"upg-ok\">\u2705 You are already on Premium! Enjoy unlimited paper trades.</div>" : "", "\n    <div class=\"upg-feats\">\n      <div class=\"upg-feat\">\u2705 <strong>Free plan:</strong> ").concat(esc(freeLimit), " paper trades total</div>\n      <div class=\"upg-feat\">\uD83D\uDC51 <strong>Premium:</strong> Unlimited trades per month</div>\n      <div class=\"upg-feat\">\uD83D\uDCC8 All trade types \u2014 Intraday &amp; Holding</div>\n      <div class=\"upg-feat\">\uD83D\uDCCA Full trade history &amp; P&amp;L analytics</div>\n      <div class=\"upg-feat\">\uD83D\uDD14 Market hours enforcement (9:15 AM \u2013 3:30 PM IST)</div>\n      <div class=\"upg-feat\">\u2699\uFE0F Custom strategy configurations (SL%, Target%, Max positions)</div>\n    </div>\n    <div class=\"upg-price\">\u20B9499<span style=\"font-size:1rem;font-weight:400\">/month</span></div>\n    <div class=\"upg-period\">Monthly subscription \u2014 cancel anytime</div>\n    ").concat(!isPremium ? "<a href=\"/subscribe\" class=\"upg-btn\">\uD83D\uDC51 Subscribe Now \u2192</a>" : "<a href=\"/my-paper-trade\" class=\"upg-btn\">\u2190 Back to Portfolio</a>", "\n    <p style=\"font-size:0.82rem;color:var(--text-muted);margin-top:16px\">Have questions? <a href=\"/contact\">Contact us</a></p>\n  </div>\n</div>\n<script src=\"/public/js/app.js\"></script></body></html>"));
                return [2 /*return*/];
        }
    });
}); });
// ── GET /api/price/:symbol ─ live price for paper trade buy form ──────────────
app.get("/api/price/:symbol", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, row;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                symbol = req.params.symbol.toUpperCase().trim();
                return [4 /*yield*/, (0, db_1.dbAll)("SELECT price FROM prices WHERE symbol=?", [symbol])];
            case 1:
                row = _c.sent();
                res.json({ price: (_b = (_a = row[0]) === null || _a === void 0 ? void 0 : _a.price) !== null && _b !== void 0 ? _b : null });
                return [2 /*return*/];
        }
    });
}); });
// ── GET /strategies ────────────────────────────────────────────────────────────
app.get("/strategies", featureGate("feature_strategies", "Strategies"), function (req, res) {
    var _a, _b, _c, _d, _e, _f;
    var backtest = readBotJSON("5year-backtest-result.json", {});
    var monthly = backtest.monthly || {};
    var mKeys = Object.keys(monthly).sort();
    // Derive key stats
    var allBbTrades = mKeys.reduce(function (s, k) { var _a; return s + ((_a = monthly[k].bbTrades) !== null && _a !== void 0 ? _a : 0); }, 0);
    var allBbWins = mKeys.reduce(function (s, k) { var _a; return s + ((_a = monthly[k].bbWins) !== null && _a !== void 0 ? _a : 0); }, 0);
    var allRcTrades = mKeys.reduce(function (s, k) { var _a; return s + ((_a = monthly[k].rcTrades) !== null && _a !== void 0 ? _a : 0); }, 0);
    var allRcWins = mKeys.reduce(function (s, k) { var _a; return s + ((_a = monthly[k].rcWins) !== null && _a !== void 0 ? _a : 0); }, 0);
    var bbWR = allBbTrades > 0 ? ((allBbWins / allBbTrades) * 100).toFixed(1) : "—";
    var rcWR = allRcTrades > 0 ? ((allRcWins / allRcTrades) * 100).toFixed(1) : "—";
    var bbPnl = (_b = (_a = backtest.totals) === null || _a === void 0 ? void 0 : _a.bodyBreakout) !== null && _b !== void 0 ? _b : 0;
    var rcPnl = (_d = (_c = backtest.totals) === null || _c === void 0 ? void 0 : _c.rcConfirm) !== null && _d !== void 0 ? _d : 0;
    var totalPnl = bbPnl + rcPnl;
    var profitMonths = mKeys.filter(function (k) { return (monthly[k].bbTotal + monthly[k].rcTotal) > 0; }).length;
    var monthPct = mKeys.length > 0 ? ((profitMonths / mKeys.length) * 100).toFixed(0) : "—";
    res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Strategies \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n</head>\n<body class=\"page-theme-strategies\">\n  ".concat(nav("strategies", req), "\n\n  <div class=\"container\" style=\"max-width:980px\">\n\n    <!-- HEADER -->\n    <div class=\"strat-header\">\n      <h1 class=\"strat-title\">\u2699\uFE0F Trading Strategies</h1>\n      <p class=\"strat-sub\">BANKNIFTY Options \u00B7 Automated intraday trading \u00B7 Strategy logic is proprietary and not disclosed</p>\n    </div>\n\n    <!-- ACTIVE STRATEGY HERO -->\n    <div class=\"strat-hero\">\n      <div class=\"strat-hero-badge\">ACTIVE</div>\n      <div class=\"strat-hero-name\">Proprietary Intraday Strategy</div>\n      <div class=\"strat-hero-desc\">\n        A fully automated intraday options trading system on BANKNIFTY.\n        Built on years of backtesting and live market refinement \u2014 strategy logic and signal conditions are not disclosed.\n      </div>\n      <div class=\"strat-hero-stats\">\n        <div class=\"strat-hero-stat\"><span class=\"strat-hs-val\">+").concat(parseFloat(totalPnl.toFixed(0)).toLocaleString("en-IN"), "</span><span class=\"strat-hs-label\">5-Year PnL (pts)</span></div>\n        <div class=\"strat-hero-stat\"><span class=\"strat-hs-val\">").concat(mKeys.length, "</span><span class=\"strat-hs-label\">Months Backtested</span></div>\n        <div class=\"strat-hero-stat\"><span class=\"strat-hs-val\">").concat(monthPct, "%</span><span class=\"strat-hs-label\">Profitable Months</span></div>\n        <div class=\"strat-hero-stat\"><span class=\"strat-hs-val\">").concat((_e = backtest.tradingDays) !== null && _e !== void 0 ? _e : "—", "</span><span class=\"strat-hs-label\">Trading Days</span></div>\n      </div>\n    </div>\n\n    <!-- BENEFITS -->\n    <div class=\"strat-section-label\">Why It Works</div>\n    <div class=\"strat-modes-grid\">\n\n      <div class=\"strat-mode-card\">\n        <div class=\"strat-mode-header\">\n          <span class=\"strat-mode-icon\">\uD83D\uDCC8</span>\n          <div>\n            <div class=\"strat-mode-name\">Consistent Edge</div>\n            <div class=\"strat-mode-type\">Backed by 5 years of data</div>\n          </div>\n        </div>\n        <p class=\"strat-mode-desc\">\n          Backtested across 1,241 trading days (2021\u20132026) covering multiple bull and bear market cycles.\n          Demonstrates consistent profitability with ").concat(monthPct, "% of months ending in positive territory.\n        </p>\n        <div class=\"strat-mode-stats\">\n          <div class=\"strat-ms\"><span class=\"strat-ms-val strat-green\">+").concat(parseFloat(totalPnl.toFixed(0)).toLocaleString("en-IN"), " pts</span><span class=\"strat-ms-label\">5-Year PnL</span></div>\n          <div class=\"strat-ms\"><span class=\"strat-ms-val\">").concat(profitMonths, " / ").concat(mKeys.length, "</span><span class=\"strat-ms-label\">Profitable Months</span></div>\n          <div class=\"strat-ms\"><span class=\"strat-ms-val\">").concat((_f = backtest.tradingDays) !== null && _f !== void 0 ? _f : "—", "</span><span class=\"strat-ms-label\">Days Tested</span></div>\n        </div>\n      </div>\n\n      <div class=\"strat-mode-card\">\n        <div class=\"strat-mode-header\">\n          <span class=\"strat-mode-icon\">\uD83E\uDD16</span>\n          <div>\n            <div class=\"strat-mode-name\">Fully Automated</div>\n            <div class=\"strat-mode-type\">Zero manual intervention</div>\n          </div>\n        </div>\n        <p class=\"strat-mode-desc\">\n          Runs end-to-end without human involvement \u2014 from signal generation to order placement and exit management.\n          Eliminates emotional bias and execution delay, trading with mechanical precision every session.\n        </p>\n        <div class=\"strat-mode-stats\">\n          <div class=\"strat-ms\"><span class=\"strat-ms-val\">9:15 AM</span><span class=\"strat-ms-label\">Market Open</span></div>\n          <div class=\"strat-ms\"><span class=\"strat-ms-val\">3:30 PM</span><span class=\"strat-ms-label\">Auto Square-off</span></div>\n          <div class=\"strat-ms\"><span class=\"strat-ms-val\">BANKNIFTY</span><span class=\"strat-ms-label\">Instrument</span></div>\n        </div>\n      </div>\n\n      <div class=\"strat-mode-card\">\n        <div class=\"strat-mode-header\">\n          <span class=\"strat-mode-icon\">\uD83D\uDEE1\uFE0F</span>\n          <div>\n            <div class=\"strat-mode-name\">Built-in Risk Control</div>\n            <div class=\"strat-mode-type\">Capital protection first</div>\n          </div>\n        </div>\n        <p class=\"strat-mode-desc\">\n          Hard limits on daily loss, trade count, and position size prevent runaway drawdowns.\n          Every trade has a predefined stop-loss. The system stops trading automatically if daily limits are hit.\n        </p>\n        <div class=\"strat-mode-stats\">\n          <div class=\"strat-ms\"><span class=\"strat-ms-val\">100 pts</span><span class=\"strat-ms-label\">Per-Trade SL</span></div>\n          <div class=\"strat-ms\"><span class=\"strat-ms-val\">5</span><span class=\"strat-ms-label\">Max Trades/Day</span></div>\n          <div class=\"strat-ms\"><span class=\"strat-ms-val\">1%</span><span class=\"strat-ms-label\">Risk/Trade</span></div>\n        </div>\n      </div>\n\n      <div class=\"strat-mode-card\">\n        <div class=\"strat-mode-header\">\n          <span class=\"strat-mode-icon\">\uD83C\uDFAF</span>\n          <div>\n            <div class=\"strat-mode-name\">Dual Signal Confirmation</div>\n            <div class=\"strat-mode-type\">Two independent models</div>\n          </div>\n        </div>\n        <p class=\"strat-mode-desc\">\n          Uses two independent proprietary signal generators that cross-validate before placing trades.\n          Each model targets different market conditions, giving the strategy broad adaptability across trending and ranging sessions.\n        </p>\n        <div class=\"strat-mode-stats\">\n          <div class=\"strat-ms\"><span class=\"strat-ms-val\">2</span><span class=\"strat-ms-label\">Signal Models</span></div>\n          <div class=\"strat-ms\"><span class=\"strat-ms-val\">CE + PE</span><span class=\"strat-ms-label\">Both Directions</span></div>\n          <div class=\"strat-ms\"><span class=\"strat-ms-val\">Options</span><span class=\"strat-ms-label\">Instrument Type</span></div>\n        </div>\n      </div>\n\n    </div>\n\n    <!-- SCREENER STRATEGIES -->\n    <div class=\"strat-section-label\">\uD83D\uDCCB Screener Presets</div>\n    <p class=\"strat-preset-intro\">Pre-built stock screening filters for different investment styles.</p>\n    <div class=\"strat-preset-grid\">\n      ").concat(STRATEGIES.map(function (s) { return "\n      <a href=\"/?".concat(strategyParams(s), "\" class=\"strat-preset-card\">\n        <span class=\"strat-preset-icon\">").concat(s.icon, "</span>\n        <div>\n          <div class=\"strat-preset-name\">").concat(s.label, "</div>\n          <div class=\"strat-preset-desc\">").concat(s.desc, "</div>\n        </div>\n      </a>"); }).join(""), "\n    </div>\n\n    <footer class=\"site-footer\"><span>\u00A9 2026 ZeroScreen \u00B7 Strategy logic is proprietary \u00B7 Past backtest performance does not guarantee future results</span></footer>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
});
// ── GET /dashboard ─────────────────────────────────────────────────────────────
app.get("/dashboard", featureGate("feature_dashboard", "Dashboard"), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var trades, backtest, analytics, eqLabels, monthly, mKeys, mLabels, bbData, rcData, combData, combColors, btTotal, btDays, btFrom, btTo, allBbTrades, allBbWins, allRcTrades, allRcWins, bbWinRate, rcWinRate;
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    return __generator(this, function (_p) {
        trades = readBotJSON("trades.json", []);
        backtest = readBotJSON("5year-backtest-result.json", {});
        analytics = computeAnalytics(trades);
        eqLabels = analytics.equityCurve.map(function (_, i) { return "#".concat(i + 1); });
        monthly = backtest.monthly || {};
        mKeys = Object.keys(monthly).sort();
        mLabels = mKeys.map(function (k) {
            var _a = k.split("-"), y = _a[0], m = _a[1];
            var d = new Date(parseInt(y), parseInt(m) - 1, 1);
            return d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
        });
        bbData = mKeys.map(function (k) { var _a; return parseFloat(((_a = monthly[k].bbTotal) !== null && _a !== void 0 ? _a : 0).toFixed(1)); });
        rcData = mKeys.map(function (k) { var _a; return parseFloat(((_a = monthly[k].rcTotal) !== null && _a !== void 0 ? _a : 0).toFixed(1)); });
        combData = mKeys.map(function (k) { var _a, _b; return parseFloat((((_a = monthly[k].bbTotal) !== null && _a !== void 0 ? _a : 0) + ((_b = monthly[k].rcTotal) !== null && _b !== void 0 ? _b : 0)).toFixed(1)); });
        combColors = combData.map(function (v) { return v >= 0 ? "rgba(16,185,129,0.7)" : "rgba(239,68,68,0.7)"; });
        btTotal = ((_b = (_a = backtest.totals) === null || _a === void 0 ? void 0 : _a.bodyBreakout) !== null && _b !== void 0 ? _b : 0) + ((_d = (_c = backtest.totals) === null || _c === void 0 ? void 0 : _c.rcConfirm) !== null && _d !== void 0 ? _d : 0);
        btDays = (_e = backtest.tradingDays) !== null && _e !== void 0 ? _e : 0;
        btFrom = (_g = (_f = backtest.period) === null || _f === void 0 ? void 0 : _f.from) !== null && _g !== void 0 ? _g : "";
        btTo = (_j = (_h = backtest.period) === null || _h === void 0 ? void 0 : _h.to) !== null && _j !== void 0 ? _j : "";
        allBbTrades = mKeys.reduce(function (s, k) { var _a; return s + ((_a = monthly[k].bbTrades) !== null && _a !== void 0 ? _a : 0); }, 0);
        allBbWins = mKeys.reduce(function (s, k) { var _a; return s + ((_a = monthly[k].bbWins) !== null && _a !== void 0 ? _a : 0); }, 0);
        allRcTrades = mKeys.reduce(function (s, k) { var _a; return s + ((_a = monthly[k].rcTrades) !== null && _a !== void 0 ? _a : 0); }, 0);
        allRcWins = mKeys.reduce(function (s, k) { var _a; return s + ((_a = monthly[k].rcWins) !== null && _a !== void 0 ? _a : 0); }, 0);
        bbWinRate = allBbTrades > 0 ? ((allBbWins / allBbTrades) * 100).toFixed(1) : "—";
        rcWinRate = allRcTrades > 0 ? ((allRcWins / allRcTrades) * 100).toFixed(1) : "—";
        // ── DASHBOARD (full view for everyone) ─────────────────────────────────────
        if (false) {
            res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Dashboard \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n  <script src=\"https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js\"></script>\n</head>\n<body class=\"page-theme-dashboard\">\n  ".concat(nav("dashboard", req), "\n  <div class=\"container\" style=\"max-width:1100px\">\n    <div class=\"dash-header\">\n      <div>\n        <h1 class=\"dash-title\">\uD83D\uDCCA Trading Dashboard</h1>\n        <p class=\"dash-sub\">BANKNIFTY Options Bot \u00B7 Live performance analytics</p>\n      </div>\n    </div>\n    <div class=\"dash-kpi-row\">\n      <div class=\"dash-kpi\"><span class=\"dash-kpi-label\">All-Time PnL</span><span class=\"dash-kpi-val ").concat(analytics.allTime.pnl >= 0 ? 'sig-green' : 'sig-red', "\">").concat(analytics.allTime.pnl >= 0 ? '+' : '').concat(analytics.allTime.pnl.toFixed(1), " pts</span></div>\n      <div class=\"dash-kpi\"><span class=\"dash-kpi-label\">Total Trades</span><span class=\"dash-kpi-val\">").concat(analytics.allTime.trades, "</span></div>\n      <div class=\"dash-kpi\"><span class=\"dash-kpi-label\">Win Rate</span><span class=\"dash-kpi-val\">").concat(analytics.allTime.winRate, "%</span></div>\n      <div class=\"dash-kpi\"><span class=\"dash-kpi-label\">Today PnL</span><span class=\"dash-kpi-val ").concat(analytics.today.pnl >= 0 ? 'sig-green' : 'sig-red', "\">").concat(analytics.today.pnl >= 0 ? '+' : '').concat(analytics.today.pnl, " pts</span></div>\n      <div class=\"dash-kpi\"><span class=\"dash-kpi-label\">Max Drawdown</span><span class=\"dash-kpi-val sig-yellow\">").concat(analytics.allTime.maxDD, " pts</span></div>\n    </div>\n    <div class=\"dash-section-title\">\uD83D\uDCC8 Live Equity Curve</div>\n    ").concat(analytics.equityCurve.length === 0 ? "\n    <div class=\"dash-empty-chart\"><span>\uD83D\uDCC9</span><p>No trades recorded yet. The equity curve will appear here once the bot starts trading.</p></div>" : "\n    <div class=\"dash-chart-wrap\"><canvas id=\"eqChart\"></canvas></div>", "\n\n    <!-- Upgrade CTA -->\n    <div class=\"upgrade-banner upgrade-banner-dashboard\">\n      <div class=\"upgrade-banner-icon\">\uD83D\uDCCA</div>\n      <div class=\"upgrade-banner-content\">\n        <strong>Unlock 5-Year Backtest Analytics</strong>\n        <p>See full monthly breakdown, Model A vs Model B performance, all 60 months of data \u2014 exclusively for Premium members.</p>\n      </div>\n      <a href=\"/premium\" class=\"btn-upgrade\">Upgrade \u2014 \u20B9499/mo</a>\n    </div>\n\n    <!-- Preview (blurred) -->\n    <div class=\"dash-section-title\">\uD83D\uDCC5 Monthly Backtest <span class=\"sig-locked-label\">\uD83D\uDD12 Premium</span></div>\n    <div class=\"dash-locked-preview\">\n      <div class=\"dash-locked-overlay\">\n        <div class=\"dash-locked-msg\">\n          <span style=\"font-size:32px\">\uD83D\uDD12</span>\n          <h3>5-Year Backtest Breakdown</h3>\n          <p>Monthly PnL, Model A vs Model B charts, detailed trade stats \u2014 available with Premium.</p>\n          <a href=\"/premium\" class=\"btn-upgrade\">Get Premium Access</a>\n        </div>\n      </div>\n      <div class=\"dash-locked-blur\">\n        <div class=\"dash-kpi-row\" style=\"margin-bottom:16px\">\n          <div class=\"dash-kpi\"><span class=\"dash-kpi-label\">5Y Combined PnL</span><span class=\"dash-kpi-val\">\u2022\u2022\u2022\u2022</span></div>\n          <div class=\"dash-kpi\"><span class=\"dash-kpi-label\">Model A Win Rate</span><span class=\"dash-kpi-val\">\u2022\u2022\u2022\u2022</span></div>\n          <div class=\"dash-kpi\"><span class=\"dash-kpi-label\">Model B Win Rate</span><span class=\"dash-kpi-val\">\u2022\u2022\u2022\u2022</span></div>\n          <div class=\"dash-kpi\"><span class=\"dash-kpi-label\">Trading Days</span><span class=\"dash-kpi-val\">\u2022\u2022\u2022\u2022</span></div>\n        </div>\n        <div style=\"height:200px;background:var(--card-bg);border-radius:12px;margin-bottom:16px\"></div>\n        <div style=\"height:160px;background:var(--card-bg);border-radius:12px\"></div>\n      </div>\n    </div>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n  ").concat(analytics.equityCurve.length > 0 ? "<script>\n  (function(){\n    const ctx = document.getElementById('eqChart').getContext('2d');\n    new Chart(ctx, {\n      type: 'line',\n      data: {\n        labels: ".concat(JSON.stringify(eqLabels), ",\n        datasets: [{ label: 'Equity (pts)', data: ").concat(JSON.stringify(analytics.equityCurve), ", borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.1)', fill: true, tension: 0.3, pointRadius: 0 }]\n      },\n      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => v + ' pts' } } } }\n    });\n  })();\n  </script>") : "", "\n</body>\n</html>"));
            return [2 /*return*/];
        }
        res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Dashboard \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n  <script src=\"https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js\"></script>\n</head>\n<body class=\"page-theme-dashboard\">\n  ".concat(nav("dashboard", req), "\n  <div class=\"container\" style=\"max-width:1100px\">\n    <div class=\"dash-hero\">\n      <div class=\"dash-hero-inner\">\n        <div class=\"dash-hero-left\">\n          <div class=\"dash-hero-eyebrow\"><span class=\"dash-live-dot\"></span> LIVE \u00B7 BANKNIFTY OPTIONS</div>\n          <h1 class=\"dash-hero-title\">Trading Dashboard</h1>\n          <p class=\"dash-hero-sub\">Proprietary dual-model intraday strategy \u00B7 Fully automated 9:15\u20133:30 IST</p>\n        </div>\n        <div class=\"dash-hero-right\">\n          <div class=\"dash-hero-stat-box\">\n            <div class=\"dash-hero-stat-label\">Backtest Period</div>\n            <div class=\"dash-hero-stat-val\">").concat(btFrom, " \u2192 ").concat(btTo, "</div>\n          </div>\n          <div class=\"dash-hero-stat-box\">\n            <div class=\"dash-hero-stat-label\">Trading Days</div>\n            <div class=\"dash-hero-stat-val\">").concat(btDays, "</div>\n          </div>\n        </div>\n      </div>\n    </div>\n\n    <!-- LIVE STATS -->\n    <div class=\"dash-section-label\"><span class=\"dash-sl-dot dash-sl-red\"></span>Live Bot Performance</div>\n    <div class=\"dash-kpi-grid\">\n      <div class=\"dash-kpi\">\n        <div class=\"dash-kpi-label\">All-Time PnL</div>\n        <div class=\"dash-kpi-val ").concat(analytics.allTime.pnl >= 0 ? "dash-green" : "dash-red", "\">").concat(analytics.allTime.pnl >= 0 ? "+" : "").concat(analytics.allTime.pnl, " pts</div>\n      </div>\n      <div class=\"dash-kpi\">\n        <div class=\"dash-kpi-label\">Total Trades</div>\n        <div class=\"dash-kpi-val\">").concat(analytics.allTime.trades, "</div>\n      </div>\n      <div class=\"dash-kpi\">\n        <div class=\"dash-kpi-label\">Win Rate</div>\n        <div class=\"dash-kpi-val dash-green\">").concat(analytics.allTime.winRate, "%</div>\n      </div>\n      <div class=\"dash-kpi\">\n        <div class=\"dash-kpi-label\">Wins / Losses</div>\n        <div class=\"dash-kpi-val\"><span class=\"dash-green\">").concat(analytics.allTime.wins, "</span> / <span class=\"dash-red\">").concat(analytics.allTime.losses, "</span></div>\n      </div>\n      <div class=\"dash-kpi\">\n        <div class=\"dash-kpi-label\">Max Drawdown</div>\n        <div class=\"dash-kpi-val dash-red\">").concat(analytics.allTime.maxDD, " pts</div>\n      </div>\n      <div class=\"dash-kpi\">\n        <div class=\"dash-kpi-label\">Today PnL</div>\n        <div class=\"dash-kpi-val ").concat(analytics.today.pnl >= 0 ? "dash-green" : "dash-red", "\">").concat(analytics.today.pnl >= 0 ? "+" : "").concat(analytics.today.pnl, " pts</div>\n      </div>\n    </div>\n\n    <!-- EQUITY CURVE -->\n    <div class=\"dash-section-label\"><span class=\"dash-sl-dot dash-sl-green\"></span>Live Equity Curve</div>\n    <div class=\"dash-chart-card\">\n      ").concat(analytics.equityCurve.length < 2
            ? "<div class=\"dash-empty\">No trades yet \u2014 equity curve will appear once the bot executes trades.</div>"
            : "<canvas id=\"eqChart\" height=\"90\"></canvas>", "\n    </div>\n\n    <!-- BACKTEST SECTION -->\n    <div class=\"dash-section-label\"><span class=\"dash-sl-dot dash-sl-purple\"></span>5-Year Backtest (2021\u20132026)</div>\n    <div class=\"dash-kpi-grid\">\n      <div class=\"dash-kpi\">\n        <div class=\"dash-kpi-label\">Total Backtest PnL</div>\n        <div class=\"dash-kpi-val dash-green\">+").concat(parseFloat(btTotal.toFixed(0)).toLocaleString("en-IN"), " pts</div>\n      </div>\n      <div class=\"dash-kpi\">\n        <div class=\"dash-kpi-label\">Model A PnL</div>\n        <div class=\"dash-kpi-val dash-green\">+").concat(parseFloat(((_l = (_k = backtest.totals) === null || _k === void 0 ? void 0 : _k.bodyBreakout) !== null && _l !== void 0 ? _l : 0).toFixed(0)).toLocaleString("en-IN"), " pts</div>\n      </div>\n      <div class=\"dash-kpi\">\n        <div class=\"dash-kpi-label\">Model B PnL</div>\n        <div class=\"dash-kpi-val dash-green\">+").concat(parseFloat(((_o = (_m = backtest.totals) === null || _m === void 0 ? void 0 : _m.rcConfirm) !== null && _o !== void 0 ? _o : 0).toFixed(0)).toLocaleString("en-IN"), " pts</div>\n      </div>\n      <div class=\"dash-kpi\">\n        <div class=\"dash-kpi-label\">Model A Win Rate</div>\n        <div class=\"dash-kpi-val\">").concat(bbWinRate, "%</div>\n      </div>\n      <div class=\"dash-kpi\">\n        <div class=\"dash-kpi-label\">Model B Win Rate</div>\n        <div class=\"dash-kpi-val\">").concat(rcWinRate, "%</div>\n      </div>\n      <div class=\"dash-kpi\">\n        <div class=\"dash-kpi-label\">Trading Days</div>\n        <div class=\"dash-kpi-val\">").concat(btDays, "</div>\n      </div>\n    </div>\n\n    <!-- MONTHLY BACKTEST CHART -->\n    <div class=\"dash-chart-card\">\n      <div class=\"dash-chart-title\">\uD83D\uDCCA Monthly Combined PnL (points)</div>\n      <canvas id=\"monthlyChart\" height=\"90\"></canvas>\n    </div>\n\n    <!-- BB vs RC CHART -->\n    <div class=\"dash-chart-card\">\n      <div class=\"dash-chart-title\">\u2694\uFE0F Model A vs Model B \u2014 Monthly PnL</div>\n      <canvas id=\"stratChart\" height=\"90\"></canvas>\n    </div>\n\n    <!-- MONTHLY TABLE -->\n    <div class=\"dash-section-label\"><span class=\"dash-sl-dot dash-sl-amber\"></span>Monthly Breakdown</div>\n    <div class=\"dash-table-wrap\">\n      <table class=\"dash-table\">\n        <thead>\n          <tr>\n            <th>Month</th>\n            <th>Days</th>\n            <th>Model A PnL</th>\n            <th>Model A Trades</th>\n            <th>Model A W/L</th>\n            <th>Model B PnL</th>\n            <th>Model B Trades</th>\n            <th>Model B W/L</th>\n            <th>Combined</th>\n          </tr>\n        </thead>\n        <tbody>\n          ").concat(mKeys.slice().reverse().map(function (k) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
            var m = monthly[k];
            var comb = ((_a = m.bbTotal) !== null && _a !== void 0 ? _a : 0) + ((_b = m.rcTotal) !== null && _b !== void 0 ? _b : 0);
            var isPos = comb >= 0;
            return "<tr class=\"".concat(isPos ? "dash-row-win" : "dash-row-loss", "\">\n              <td class=\"dash-td-month\">").concat(k, "</td>\n              <td>").concat((_c = m.days) !== null && _c !== void 0 ? _c : "—", "</td>\n              <td class=\"").concat(((_d = m.bbTotal) !== null && _d !== void 0 ? _d : 0) >= 0 ? "dash-green" : "dash-red", "\">").concat(((_e = m.bbTotal) !== null && _e !== void 0 ? _e : 0) >= 0 ? "+" : "").concat(((_f = m.bbTotal) !== null && _f !== void 0 ? _f : 0).toFixed(1), "</td>\n              <td>").concat((_g = m.bbTrades) !== null && _g !== void 0 ? _g : "—", "</td>\n              <td>").concat((_h = m.bbWins) !== null && _h !== void 0 ? _h : 0, "/").concat(((_j = m.bbTrades) !== null && _j !== void 0 ? _j : 0) - ((_k = m.bbWins) !== null && _k !== void 0 ? _k : 0), "</td>\n              <td class=\"").concat(((_l = m.rcTotal) !== null && _l !== void 0 ? _l : 0) >= 0 ? "dash-green" : "dash-red", "\">").concat(((_m = m.rcTotal) !== null && _m !== void 0 ? _m : 0) >= 0 ? "+" : "").concat(((_o = m.rcTotal) !== null && _o !== void 0 ? _o : 0).toFixed(1), "</td>\n              <td>").concat((_p = m.rcTrades) !== null && _p !== void 0 ? _p : "—", "</td>\n              <td>").concat((_q = m.rcWins) !== null && _q !== void 0 ? _q : 0, "/").concat(((_r = m.rcTrades) !== null && _r !== void 0 ? _r : 0) - ((_s = m.rcWins) !== null && _s !== void 0 ? _s : 0), "</td>\n              <td class=\"").concat(isPos ? "dash-green dash-td-bold" : "dash-red dash-td-bold", "\">").concat(isPos ? "+" : "").concat(comb.toFixed(1), "</td>\n            </tr>");
        }).join(""), "\n        </tbody>\n      </table>\n    </div>\n\n    <footer class=\"site-footer\"><span>\u00A9 2026 ZeroScreen &mdash; Backtest results are hypothetical &amp; for informational purposes only. Not SEBI registered. Not investment advice. Past performance is not indicative of future results.</span></footer>\n  </div>\n\n  <script src=\"/public/js/app.js\"></script>\n  <script>\n  // Chart defaults\n  Chart.defaults.color = document.documentElement.classList.contains('dark') ? '#a1a1aa' : '#6b7280';\n  Chart.defaults.borderColor = document.documentElement.classList.contains('dark') ? '#27272a' : '#e5e7eb';\n\n  ").concat(analytics.equityCurve.length >= 2 ? "\n  // Equity curve\n  (function() {\n    const labels = ".concat(JSON.stringify(eqLabels), ";\n    const data   = ").concat(JSON.stringify(analytics.equityCurve), ";\n    const ctx = document.getElementById('eqChart').getContext('2d');\n    const finalVal = data[data.length - 1];\n    const color = finalVal >= 0 ? '#10b981' : '#ef4444';\n    new Chart(ctx, {\n      type: 'line',\n      data: {\n        labels,\n        datasets: [{\n          label: 'Equity (pts)',\n          data,\n          borderColor: color,\n          backgroundColor: finalVal >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',\n          fill: true,\n          tension: 0.35,\n          pointRadius: data.length > 50 ? 0 : 3,\n          borderWidth: 2,\n        }]\n      },\n      options: {\n        responsive: true,\n        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },\n        scales: {\n          x: { display: data.length <= 100, ticks: { maxTicksLimit: 12 } },\n          y: { ticks: { callback: v => v + ' pts' } }\n        }\n      }\n    });\n  })();\n  ") : "", "\n\n  // Monthly combined chart\n  (function() {\n    const labels = ").concat(JSON.stringify(mLabels), ";\n    const data   = ").concat(JSON.stringify(combData), ";\n    const colors = ").concat(JSON.stringify(combColors), ";\n    const ctx = document.getElementById('monthlyChart').getContext('2d');\n    new Chart(ctx, {\n      type: 'bar',\n      data: {\n        labels,\n        datasets: [{\n          label: 'Combined PnL (pts)',\n          data,\n          backgroundColor: colors,\n          borderRadius: 3,\n        }]\n      },\n      options: {\n        responsive: true,\n        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => (ctx.raw >= 0 ? '+' : '') + ctx.raw + ' pts' } } },\n        scales: { y: { ticks: { callback: v => v + ' pts' } } }\n      }\n    });\n  })();\n\n  // BB vs RC stacked chart\n  (function() {\n    const labels = ").concat(JSON.stringify(mLabels), ";\n    const bbData = ").concat(JSON.stringify(bbData), ";\n    const rcData = ").concat(JSON.stringify(rcData), ";\n    const ctx = document.getElementById('stratChart').getContext('2d');\n    new Chart(ctx, {\n      type: 'bar',\n      data: {\n        labels,\n        datasets: [\n          { label: 'Model A', data: bbData, backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 2 },\n          { label: 'Model B', data: rcData, backgroundColor: 'rgba(245,158,11,0.7)',  borderRadius: 2 },\n        ]\n      },\n      options: {\n        responsive: true,\n        plugins: { tooltip: { mode: 'index', intersect: false } },\n        scales: {\n          x: { stacked: false },\n          y: { stacked: false, ticks: { callback: v => v + ' pts' } }\n        }\n      }\n    });\n  })();\n  </script>\n</body>\n</html>"));
        return [2 /*return*/];
    });
}); });
// ── GET /signals ────────────────────────────────────────────────────────────────
app.get("/signals", featureGate("feature_signals", "Signals"), function (req, res) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    var state = readBotJSON("trade-state.json", {});
    var trades = readBotJSON("trades.json", []);
    var analytics = computeAnalytics(trades);
    var hasPosition = !!(state && (state.activeTrade || state.mainEntryDone));
    var premium = userIsPremium(req);
    var loggedIn = !!((_a = req.session) === null || _a === void 0 ? void 0 : _a.userId);
    var backtest = readBotJSON("5year-backtest-result.json", {});
    var monthly = backtest.monthly || {};
    // Build last 4 months summary (no strategy names exposed)
    function monthLabel(key) {
        var _a = key.split("-"), y = _a[0], m = _a[1];
        return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleString("en-IN", { month: "short", year: "2-digit" });
    }
    var recentMonthKeys = Object.keys(monthly).sort().slice(-4);
    var recentMonthData = recentMonthKeys.map(function (k) {
        var _a, _b, _c, _d, _e, _f, _g;
        var d = monthly[k];
        var combined = ((_a = d.bbTotal) !== null && _a !== void 0 ? _a : 0) + ((_b = d.rcTotal) !== null && _b !== void 0 ? _b : 0);
        var totalTrades = ((_c = d.bbTrades) !== null && _c !== void 0 ? _c : 0) + ((_d = d.rcTrades) !== null && _d !== void 0 ? _d : 0);
        var totalWins = ((_e = d.bbWins) !== null && _e !== void 0 ? _e : 0) + ((_f = d.rcWins) !== null && _f !== void 0 ? _f : 0);
        var winRate = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(0) : "—";
        return { label: monthLabel(k), combined: combined.toFixed(0), winRate: winRate, days: (_g = d.days) !== null && _g !== void 0 ? _g : 0, profit: combined > 0 };
    });
    // ── PREMIUM VIEW (full details) ────────────────────────────────────────────
    var isAdmin = ((_b = req.session) === null || _b === void 0 ? void 0 : _b.userRole) === 'admin';
    if (premium) {
        var an2_1 = computeAnalytics(trades);
        var hb2 = readBotJSON("bot-heartbeat.json", {});
        var ep2 = (_d = (_c = state.entryPrice) !== null && _c !== void 0 ? _c : hb2.entryPrice) !== null && _d !== void 0 ? _d : 0;
        var dir2 = (_f = (_e = state.tradeDirection) !== null && _e !== void 0 ? _e : hb2.direction) !== null && _f !== void 0 ? _f : null;
        var live2 = (_g = hb2.livePrice) !== null && _g !== void 0 ? _g : 0;
        var unreal2 = (_h = hb2.unrealisedPnL) !== null && _h !== void 0 ? _h : 0;
        var sl2 = ep2 > 0 && dir2 ? (dir2 === "CE" ? ep2 - 100 : ep2 + 100) : 0;
        var sym2 = (_j = state.tradeSymbol) !== null && _j !== void 0 ? _j : "";
        var qty2 = (_l = (_k = state.mainQty) !== null && _k !== void 0 ? _k : state.earlyQty) !== null && _l !== void 0 ? _l : 0;
        var entryMs2 = (_m = state.entryTime) !== null && _m !== void 0 ? _m : 0;
        var inTrade2 = !!(hb2.inTrade || state.activeTrade || state.mainEntryDone);
        var durMin2 = entryMs2 > 0 ? Math.floor((Date.now() - entryMs2) / 60000) : 0;
        var durStr2 = durMin2 >= 60 ? "".concat(Math.floor(durMin2 / 60), "h ").concat(durMin2 % 60, "m") : durMin2 > 0 ? "".concat(durMin2, "m") : "";
        var entryIST2 = entryMs2 > 0 ? new Date(entryMs2).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : "";
        var mode2 = (_p = (_o = hb2.mode) !== null && _o !== void 0 ? _o : state.mode) !== null && _p !== void 0 ? _p : "PAPER";
        var todayStr2_1 = getTodayIST();
        var todayTradesAll2 = readBotJSON("trades.json", []);
        var closedToday2 = todayTradesAll2.filter(function (t) { return (t.date || "").startsWith(todayStr2_1) && t.exitPrice && t.exitPrice > 0; });
        function fmtTime2(iso) {
            return new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
        }
        function fmtDate2(iso) {
            var d = new Date(iso);
            return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" })
                + " " + d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
        }
        var QTY_MULT2_1 = 15; // 30 qty × 0.5 delta — option premium ₹ per index pt
        function pnlCls2(v) { return v >= 0 ? "sig-green" : "sig-red"; }
        function fmtPts2(v) { return "".concat(v >= 0 ? "+" : "").concat(v.toFixed(0), " pts"); }
        function fmtRs2(v) { var r = Math.round(v * QTY_MULT2_1); return "".concat(r >= 0 ? "+" : "−", "\u20B9").concat(Math.abs(r).toLocaleString("en-IN")); }
        function fmtBoth2(v) { return "".concat(fmtPts2(v), " <span class=\"rs-sub\">").concat(fmtRs2(v), "</span>"); }
        function rcCls(r) {
            if (!r)
                return "";
            var rl = r.toLowerCase();
            if (rl.includes("sl") || rl.includes("stop"))
                return "rc-sl";
            if (rl.includes("early") || rl.includes("c1"))
                return "rc-early";
            return "rc-eod";
        }
        var todayRows2 = __spreadArray([], closedToday2, true).reverse().map(function (t) {
            var _a, _b, _c, _d;
            return "\n      <tr>\n        <td class=\"td-t\">".concat(fmtTime2(t.date), "</td>\n        <td><span class=\"d-b d-").concat((t.direction || "").toLowerCase(), "\">").concat(t.direction || "—", "</span></td>\n        <td class=\"td-m\">").concat(((_a = t.entryPrice) !== null && _a !== void 0 ? _a : 0).toFixed(1), " \u2192 ").concat(((_b = t.exitPrice) !== null && _b !== void 0 ? _b : 0).toFixed(1), "</td>\n        <td class=\"td-m ").concat(pnlCls2((_c = t.pnl) !== null && _c !== void 0 ? _c : 0), "\" style=\"font-weight:700\">").concat(fmtBoth2((_d = t.pnl) !== null && _d !== void 0 ? _d : 0), "</td>\n        <td>").concat(t.reasonExit ? "<span class=\"rc-b ".concat(rcCls(t.reasonExit), "\">").concat(t.reasonExit, "</span>") : "—", "</td>\n        <td class=\"td-t\">").concat(t.duration ? (t.duration < 60 ? t.duration + "s" : Math.round(t.duration / 60) + "m") : "—", "</td>\n      </tr>");
        }).join("");
        var todayEmpty2 = !todayRows2 && !inTrade2 ? "<tr><td colspan=\"6\" class=\"td-e\">No closed trades today</td></tr>" : "";
        var recentRows2 = an2_1.recentTrades.map(function (t) {
            var _a, _b, _c, _d;
            return "\n      <tr>\n        <td class=\"td-t\">".concat(t.date ? fmtDate2(t.date) : "—", "</td>\n        <td><span class=\"d-b d-").concat((t.direction || "").toLowerCase(), "\">").concat(t.direction || "—", "</span></td>\n        <td class=\"td-m\">").concat(((_a = t.entryPrice) !== null && _a !== void 0 ? _a : 0).toFixed(0), " \u2192 ").concat(((_b = t.exitPrice) !== null && _b !== void 0 ? _b : 0).toFixed(0), "</td>\n        <td class=\"td-m ").concat(pnlCls2((_c = t.pnl) !== null && _c !== void 0 ? _c : 0), "\" style=\"font-weight:700\">").concat(fmtBoth2((_d = t.pnl) !== null && _d !== void 0 ? _d : 0), "</td>\n        <td>").concat(t.reasonExit ? "<span class=\"rc-b ".concat(rcCls(t.reasonExit), "\">").concat(t.reasonExit, "</span>") : "—", "</td>\n      </tr>");
        }).join("");
        var monthRows2 = an2_1.monthly.map(function (m) {
            var _a = m.month.split("-"), y = _a[0], mo = _a[1];
            var mLabel = new Date(parseInt(y), parseInt(mo) - 1, 1).toLocaleString("en-IN", { month: "short", year: "2-digit" });
            return "<tr>\n        <td class=\"td-t\">".concat(mLabel, "</td>\n        <td class=\"td-m ").concat(pnlCls2(m.pnl), "\" style=\"font-weight:700\">").concat(fmtBoth2(m.pnl), "</td>\n        <td class=\"td-m\">").concat(m.trades, "</td>\n        <td class=\"td-m\">").concat(m.wins, "W / ").concat(m.losses, "L</td>\n        <td class=\"td-m\">").concat(m.trades > 0 ? m.winRate + "%" : "—", "</td>\n      </tr>");
        }).join("");
        res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Live Bot Dashboard \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n  <style>\n    /* \u2500\u2500 Layout \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n    .sig3{max-width:980px;margin:0 auto;padding:0 .75rem 3rem}\n    .sig3-hdr{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;margin:1rem 0 .85rem}\n    .sig3-title{font-size:1.1rem;font-weight:800;color:var(--text)}\n    .sig3-sub{font-size:.72rem;color:var(--text-muted);margin-top:2px}\n    .sig3-live{display:flex;align-items:center;gap:.4rem;font-size:.72rem;color:var(--text-muted)}\n    .sig3-dot{width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 6px #10b98188;animation:sig3p 1.4s infinite}\n    @keyframes sig3p{0%,100%{opacity:1;box-shadow:0 0 6px #10b98188}50%{opacity:.3;box-shadow:none}}\n\n    /* \u2500\u2500 KPI Cards (matching paper trade style) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n    .sig3-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:10px;margin-bottom:1rem}\n    .sig3-kpi{background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:13px 16px}\n    .sig3-kl{font-size:.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px}\n    .sig3-kv{font-size:1.35rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.15}\n    .sig3-ks{font-size:.72rem;font-weight:600;margin-top:3px;opacity:.85}\n    .sig3-g{color:#10b981}.sig3-r{color:#ef4444}.sig3-d{color:var(--text-muted)}\n\n    /* \u2500\u2500 Active Position Hero Card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n    .sig3-pos{border-radius:12px;padding:18px 22px;margin-bottom:1rem;border:1.5px solid}\n    .sig3-pos-ce{background:rgba(31,58,95,.2);border-color:rgba(59,130,246,.5)}\n    .sig3-pos-pe{background:rgba(80,18,18,.22);border-color:rgba(239,68,68,.5)}\n    .sig3-pos-flat{background:var(--card-bg);border-color:var(--border)}\n    .sig3-ph{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:14px}\n    .sig3-dir-b{font-size:.8rem;font-weight:800;padding:.2rem .55rem;border-radius:5px}\n    .sig3-dir-ce{background:#1f3a5f;color:#60a5fa}\n    .sig3-dir-pe{background:#3b1010;color:#f87171}\n    .sig3-mode-b{font-size:.62rem;background:rgba(255,255,255,.07);color:var(--text-muted);padding:.12rem .42rem;border-radius:4px}\n    .sig3-dur{margin-left:auto;font-size:.68rem;color:var(--text-muted)}\n    /* Big P&L */\n    .sig3-pnl-big{font-size:2.4rem;font-weight:800;letter-spacing:-.5px;line-height:1.1;margin-bottom:3px;font-variant-numeric:tabular-nums}\n    .sig3-pnl-pts{font-size:.88rem;font-weight:600;margin-bottom:16px}\n    /* 6-cell detail grid */\n    .sig3-pg{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 16px}\n    @media(min-width:520px){.sig3-pg{grid-template-columns:repeat(6,1fr)}}\n    .sig3-pl{font-size:.58rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em}\n    .sig3-pv{font-size:.9rem;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums}\n\n    /* \u2500\u2500 Section headers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n    .sig3-sec{font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;\n      color:var(--text-muted);border-bottom:1px solid var(--border);\n      padding-bottom:7px;margin:1.4rem 0 .75rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}\n    .sig3-sec-count{font-size:.8rem;font-weight:700;text-transform:none;letter-spacing:0;color:var(--text)}\n\n    /* \u2500\u2500 Tables \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n    .sig3-tw{overflow-x:auto;border:1px solid var(--border);border-radius:10px;margin-bottom:4px}\n    table.sig3-t{width:100%;border-collapse:collapse;font-size:.85rem}\n    .sig3-t th{text-align:left;padding:9px 11px;font-size:.63rem;text-transform:uppercase;\n      letter-spacing:.06em;color:var(--text-muted);border-bottom:1px solid var(--border);\n      font-weight:600;white-space:nowrap;background:var(--bg2)}\n    .sig3-t td{padding:10px 11px;border-bottom:1px solid var(--border);vertical-align:middle}\n    .sig3-t tr:last-child td{border-bottom:none}\n    .sig3-t tr:hover td{background:var(--hover-bg)}\n    .sig3-te{text-align:center;padding:24px 16px;color:var(--text-muted);font-size:.85rem}\n\n    /* \u2500\u2500 Cell styles \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n    .sig3-ct{font-size:.72rem;color:var(--text-muted);white-space:nowrap}\n    .sig3-db{font-size:.7rem;font-weight:800;padding:.12rem .36rem;border-radius:3px}\n    .sig3-db.ce{background:#1f3a5f;color:#60a5fa}\n    .sig3-db.pe{background:#3b1010;color:#f87171}\n    /* P&L cell: big \u20B9 on line 1, small pts on line 2 */\n    .sig3-pnl-rs{font-size:1rem;font-weight:800;display:block;font-variant-numeric:tabular-nums;line-height:1.2}\n    .sig3-pnl-spt{font-size:.68rem;display:block;color:var(--text-muted);margin-top:1px}\n    .sig3-rc{font-size:.65rem;padding:.1rem .32rem;border-radius:3px;font-weight:600;white-space:nowrap}\n    .sig3-rc-sl{background:rgba(239,68,68,.12);color:#f87171}\n    .sig3-rc-early{background:rgba(245,158,11,.12);color:#f59e0b}\n    .sig3-rc-eod{background:rgba(99,102,241,.12);color:#818cf8}\n    .sig3-mono{font-family:monospace;font-size:.82rem}\n  </style>\n</head>\n<body class=\"page-theme-signals\">\n  ".concat(nav("signals", req), "\n  <div class=\"sig3\">\n\n    <!-- Header -->\n    <div class=\"sig3-hdr\">\n      <div>\n        <div class=\"sig3-title\">\uD83D\uDCE1 Live Bot Dashboard</div>\n        <div class=\"sig3-sub\">BANKNIFTY &middot; HYBRID_REVERSE &middot; ").concat(mode2.toUpperCase(), " &middot; 30 qty &middot; \u20B9 P&amp;L = index pts &times; 30 qty &times; 0.5 delta = pts &times; 15</div>\n      </div>\n      <div class=\"sig3-live\"><span class=\"sig3-dot\"></span><span id=\"sig3-upd\">Connecting&hellip;</span></div>\n    </div>\n\n    <!-- KPI Stats (paper-trade card style) -->\n    <div class=\"sig3-kpis\">\n      <div class=\"sig3-kpi\">\n        <div class=\"sig3-kl\">Today P&amp;L</div>\n        <div class=\"sig3-kv ").concat(pnlCls2(an2_1.today.pnl), "\" id=\"k3-today-rs\">").concat(fmtRs2(an2_1.today.pnl), "</div>\n        <div class=\"sig3-ks ").concat(pnlCls2(an2_1.today.pnl), "\" id=\"k3-today-pts\">").concat(fmtPts2(an2_1.today.pnl), "</div>\n      </div>\n      <div class=\"sig3-kpi\">\n        <div class=\"sig3-kl\">Today Trades</div>\n        <div class=\"sig3-kv\" id=\"k3-trades\">").concat(an2_1.today.trades).concat(inTrade2 ? '<span style="font-size:.65rem;color:#10b981"> +live</span>' : "", "</div>\n        <div class=\"sig3-ks sig3-d\" id=\"k3-wl\"><span class=\"sig3-g\">").concat(an2_1.today.wins, "W</span> / <span class=\"sig3-r\">").concat(an2_1.today.losses, "L</span></div>\n      </div>\n      <div class=\"sig3-kpi\">\n        <div class=\"sig3-kl\">This Week</div>\n        <div class=\"sig3-kv ").concat(pnlCls2(an2_1.weekly.pnl), "\" id=\"k3-wk-rs\">").concat(fmtRs2(an2_1.weekly.pnl), "</div>\n        <div class=\"sig3-ks ").concat(pnlCls2(an2_1.weekly.pnl), "\" id=\"k3-wk-pts\">").concat(fmtPts2(an2_1.weekly.pnl), "</div>\n      </div>\n      <div class=\"sig3-kpi\">\n        <div class=\"sig3-kl\">All-Time P&amp;L</div>\n        <div class=\"sig3-kv ").concat(pnlCls2(an2_1.allTime.pnl), "\">").concat(fmtRs2(an2_1.allTime.pnl), "</div>\n        <div class=\"sig3-ks ").concat(pnlCls2(an2_1.allTime.pnl), "\">").concat(fmtPts2(an2_1.allTime.pnl), "</div>\n      </div>\n      <div class=\"sig3-kpi\">\n        <div class=\"sig3-kl\">Win Rate</div>\n        <div class=\"sig3-kv\" id=\"k3-wr\">").concat(an2_1.allTime.winRate, "%</div>\n        <div class=\"sig3-ks sig3-d\">").concat(an2_1.allTime.wins, "W / ").concat(an2_1.allTime.losses, "L all-time</div>\n      </div>\n      <div class=\"sig3-kpi\">\n        <div class=\"sig3-kl\">Max Risk / Trade</div>\n        <div class=\"sig3-kv sig3-r\">&#8722;&#8377;1,500</div>\n        <div class=\"sig3-ks sig3-d\">100 pts SL &times; 30 qty</div>\n      </div>\n    </div>\n\n    <!-- Active Position Card -->\n    <div id=\"sig3-pos-wrap\">\n      ").concat(inTrade2 && ep2 > 0 ? "\n      <div class=\"sig3-pos sig3-pos-".concat((dir2 || "flat").toLowerCase(), "\">\n        <div class=\"sig3-ph\">\n          <span class=\"sig3-dot\"></span>\n          <span class=\"sig3-dir-b sig3-dir-").concat((dir2 || "").toLowerCase(), "\">").concat(dir2, " OPTION</span>\n          <span class=\"sig3-mono\" style=\"color:var(--text-muted)\">").concat(sym2 || "BANKNIFTY", "</span>\n          <span class=\"sig3-mode-b\">").concat(mode2.toUpperCase(), "</span>\n          ").concat(durStr2 ? "<span class=\"sig3-dur\">".concat(durStr2, " in trade</span>") : "", "\n        </div>\n        <div class=\"sig3-pnl-big ").concat(pnlCls2(unreal2), "\" id=\"sig3-pnl-rs\">").concat(fmtRs2(unreal2), "</div>\n        <div class=\"sig3-pnl-pts ").concat(pnlCls2(unreal2), "\" id=\"sig3-pnl-pts\">").concat(unreal2 >= 0 ? "+" : "").concat(unreal2.toFixed(0), " index pts unrealised</div>\n        <div class=\"sig3-pg\">\n          <div>\n            <div class=\"sig3-pl\">Entry Index</div>\n            <div class=\"sig3-pv sig3-mono\">").concat(ep2.toFixed(1), "</div>\n          </div>\n          <div>\n            <div class=\"sig3-pl\">Live Index</div>\n            <div class=\"sig3-pv sig3-g sig3-mono\" id=\"sig3-live\">").concat(live2 > 0 ? live2.toFixed(1) : "&hellip;", "</div>\n          </div>\n          <div>\n            <div class=\"sig3-pl\">Stop Loss</div>\n            <div class=\"sig3-pv sig3-r sig3-mono\">").concat(sl2 > 0 ? sl2.toFixed(1) : "&mdash;", "</div>\n          </div>\n          <div>\n            <div class=\"sig3-pl\">SL Loss (&#8377;)</div>\n            <div class=\"sig3-pv sig3-r\">&#8722;&#8377;1,500</div>\n          </div>\n          <div>\n            <div class=\"sig3-pl\">Qty / Lot</div>\n            <div class=\"sig3-pv\">").concat(qty2 > 0 ? qty2 : 30, " / 1</div>\n          </div>\n          <div>\n            <div class=\"sig3-pl\">Entry Time</div>\n            <div class=\"sig3-pv\">").concat(entryIST2 || "&mdash;", "</div>\n          </div>\n        </div>\n      </div>") : "\n      <div class=\"sig3-pos sig3-pos-flat\">\n        <div style=\"display:flex;align-items:center;gap:.75rem\">\n          <span style=\"font-size:1.6rem\">&#9203;</span>\n          <div>\n            <div style=\"font-weight:700;font-size:.95rem\">No Active Position</div>\n            <div style=\"font-size:.74rem;color:var(--text-muted);margin-top:3px\">Bot scanning BANKNIFTY for breakout signal&hellip;</div>\n          </div>\n        </div>\n      </div>", "\n    </div>\n\n    <!-- TODAY'S TRADES -->\n    <div class=\"sig3-sec\">\n      Today &mdash; ").concat(todayStr2_1, "\n      <span class=\"sig3-sec-count\">(").concat(closedToday2.length, " closed").concat(inTrade2 ? " + 1 live" : "", ")</span>\n    </div>\n    <div class=\"sig3-tw\">\n      <table class=\"sig3-t\">\n        <thead><tr>\n          <th>Time</th><th>Dir</th><th>Entry &#8594; Exit (Index)</th>\n          <th>P&amp;L (&#8377;)</th><th>Reason</th><th>Duration</th>\n        </tr></thead>\n        <tbody id=\"sig3-today-body\">\n          ").concat(__spreadArray([], closedToday2, true).reverse().map(function (t) {
            var _a, _b, _c, _d, _e;
            return "<tr>\n            <td class=\"sig3-ct\">".concat(fmtTime2(t.date), "</td>\n            <td><span class=\"sig3-db ").concat((t.direction || "").toLowerCase(), "\">").concat(t.direction || "&mdash;", "</span></td>\n            <td class=\"sig3-mono\">").concat(((_a = t.entryPrice) !== null && _a !== void 0 ? _a : 0).toFixed(1), " &#8594; ").concat(((_b = t.exitPrice) !== null && _b !== void 0 ? _b : 0).toFixed(1), "</td>\n            <td>\n              <span class=\"sig3-pnl-rs ").concat(pnlCls2((_c = t.pnl) !== null && _c !== void 0 ? _c : 0), "\">").concat(fmtRs2((_d = t.pnl) !== null && _d !== void 0 ? _d : 0), "</span>\n              <span class=\"sig3-pnl-spt\">").concat(fmtPts2((_e = t.pnl) !== null && _e !== void 0 ? _e : 0), "</span>\n            </td>\n            <td>").concat(t.reasonExit ? "<span class=\"sig3-rc ".concat(rcCls(t.reasonExit).replace("rc-", "sig3-rc-"), "\">").concat(t.reasonExit, "</span>") : "&mdash;", "</td>\n            <td class=\"sig3-ct\">").concat(t.duration ? (t.duration < 60 ? t.duration + "s" : Math.round(t.duration / 60) + "m") : "&mdash;", "</td>\n          </tr>");
        }).join("") || "<tr><td colspan=\"6\" class=\"sig3-te\">No closed trades today".concat(inTrade2 ? " &mdash; 1 live position active" : "", "</td></tr>"), "\n        </tbody>\n      </table>\n    </div>\n\n    <!-- THIS WEEK (last 7 days) -->\n    <div class=\"sig3-sec\">\n      This Week &mdash; Last 7 Days\n      <span class=\"sig3-sec-count\">(").concat(an2_1.weekly.trades, " trades &nbsp;<span class=\"").concat(pnlCls2(an2_1.weekly.pnl), "\">").concat(fmtRs2(an2_1.weekly.pnl), "</span>)</span>\n    </div>\n    <div class=\"sig3-tw\">\n      <table class=\"sig3-t\">\n        <thead><tr>\n          <th>Date / Time</th><th>Dir</th><th>Entry &#8594; Exit (Index)</th>\n          <th>P&amp;L (&#8377;)</th><th>Reason</th>\n        </tr></thead>\n        <tbody>\n          ").concat((function () {
            var _now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
            var _wAgo = new Date(_now);
            _wAgo.setDate(_now.getDate() - 7);
            var _wk = an2_1.recentTrades.filter(function (t) { return t.date && new Date(t.date) >= _wAgo; });
            if (!_wk.length)
                return "<tr><td colspan=\"5\" class=\"sig3-te\">No trades in the past 7 days</td></tr>";
            return _wk.map(function (t) {
                var _a, _b, _c, _d, _e;
                return "<tr>\n              <td class=\"sig3-ct\">".concat(fmtDate2(t.date), "</td>\n              <td><span class=\"sig3-db ").concat((t.direction || "").toLowerCase(), "\">").concat(t.direction || "&mdash;", "</span></td>\n              <td class=\"sig3-mono\">").concat(((_a = t.entryPrice) !== null && _a !== void 0 ? _a : 0).toFixed(0), " &#8594; ").concat(((_b = t.exitPrice) !== null && _b !== void 0 ? _b : 0).toFixed(0), "</td>\n              <td>\n                <span class=\"sig3-pnl-rs ").concat(pnlCls2((_c = t.pnl) !== null && _c !== void 0 ? _c : 0), "\">").concat(fmtRs2((_d = t.pnl) !== null && _d !== void 0 ? _d : 0), "</span>\n                <span class=\"sig3-pnl-spt\">").concat(fmtPts2((_e = t.pnl) !== null && _e !== void 0 ? _e : 0), "</span>\n              </td>\n              <td>").concat(t.reasonExit ? "<span class=\"sig3-rc ".concat(rcCls(t.reasonExit).replace("rc-", "sig3-rc-"), "\">").concat(t.reasonExit, "</span>") : "&mdash;", "</td>\n            </tr>");
            }).join("");
        })(), "\n        </tbody>\n      </table>\n    </div>\n\n    <!-- MONTH-WISE P&L -->\n    ").concat(an2_1.monthly.length > 0 ? "\n    <div class=\"sig3-sec\">\n      Month-wise P&amp;L\n      <span class=\"sig3-sec-count\">(".concat(an2_1.monthly.length, " month").concat(an2_1.monthly.length !== 1 ? "s" : "", ")</span>\n    </div>\n    <div class=\"sig3-tw\">\n      <table class=\"sig3-t\">\n        <thead><tr>\n          <th>Month</th><th>P&amp;L (&#8377;)</th><th>P&amp;L (pts)</th><th>Trades</th><th>W / L</th><th>Win %</th>\n        </tr></thead>\n        <tbody>\n          ").concat(an2_1.monthly.map(function (m) {
            var _a = m.month.split("-"), _my = _a[0], _mm = _a[1];
            var _ml = new Date(parseInt(_my), parseInt(_mm) - 1, 1)
                .toLocaleString("en-IN", { month: "long", year: "numeric" });
            return "<tr>\n              <td style=\"font-weight:600;white-space:nowrap\">".concat(_ml, "</td>\n              <td>\n                <span class=\"sig3-pnl-rs ").concat(pnlCls2(m.pnl), "\" style=\"font-size:.95rem\">").concat(fmtRs2(m.pnl), "</span>\n              </td>\n              <td class=\"sig3-mono\" style=\"font-size:.76rem;color:var(--text-muted)\">").concat(fmtPts2(m.pnl), "</td>\n              <td>").concat(m.trades, "</td>\n              <td><span class=\"sig3-g\">").concat(m.wins, "W</span>&nbsp;/&nbsp;<span class=\"sig3-r\">").concat(m.losses, "L</span></td>\n              <td class=\"").concat(m.winRate >= 55 ? "sig3-g" : m.winRate >= 40 ? "" : "sig3-r", "\">").concat(m.trades > 0 ? m.winRate + "%" : "&mdash;", "</td>\n            </tr>");
        }).join(""), "\n        </tbody>\n      </table>\n    </div>") : "", "\n\n    <footer class=\"site-footer\" style=\"margin-top:1.5rem\">\n      <span>&copy; 2026 ZeroScreen &mdash; Admin View &middot; ").concat(mode2.toUpperCase(), " mode &middot; Not SEBI registered.</span>\n    </footer>\n  </div>\n\n  <script>\n  const _QM = 15;\n  function _fR(v){const r=Math.round(v*_QM);return(r>=0?\"+\":\"\u2212\")+\"\u20B9\"+Math.abs(r).toLocaleString(\"en-IN\");}\n  function _fP(v){return(v>=0?\"+\":\"\")+v.toFixed(0)+\" pts\";}\n  function _gc(v){return v>=0?\"#10b981\":\"#ef4444\";}\n  function _ge(id){return document.getElementById(id);}\n  async function _sig3Refresh(){\n    try{\n      const r=await fetch(\"/api/bot/status\");const d=await r.json();\n      _ge(\"sig3-upd\").textContent=\"Updated \"+new Date().toLocaleTimeString(\"en-IN\");\n      const inT=d.activeState&&!!(d.activeState.inTrade||d.activeState.activeTrade||d.activeState.mainEntryDone);\n      const tot=parseFloat(((d.today?.pnl||0)+(inT?(d.activeState?.unrealisedPnL||0):0)).toFixed(0));\n      if(_ge(\"k3-today-rs\")){_ge(\"k3-today-rs\").textContent=_fR(tot);_ge(\"k3-today-rs\").style.color=_gc(tot);}\n      if(_ge(\"k3-today-pts\")){_ge(\"k3-today-pts\").textContent=_fP(tot);_ge(\"k3-today-pts\").style.color=_gc(tot);}\n      const tc=d.today?.trades||0;\n      if(_ge(\"k3-trades\"))_ge(\"k3-trades\").innerHTML=tc+(tc!==1?\" trades\":\" trade\")+(inT?' <span style=\"font-size:.65rem;color:#10b981\">+live</span>':\"\");\n      if(_ge(\"k3-wl\")&&d.today)_ge(\"k3-wl\").innerHTML='<span class=\"sig3-g\">'+d.today.wins+'W</span> / <span class=\"sig3-r\">'+d.today.losses+'L</span>';\n      if(_ge(\"k3-wk-rs\")&&d.weekly){_ge(\"k3-wk-rs\").textContent=_fR(d.weekly.pnl);_ge(\"k3-wk-rs\").style.color=_gc(d.weekly.pnl);}\n      if(_ge(\"k3-wk-pts\")&&d.weekly){_ge(\"k3-wk-pts\").textContent=_fP(d.weekly.pnl);_ge(\"k3-wk-pts\").style.color=_gc(d.weekly.pnl);}\n      if(_ge(\"k3-wr\")&&d.allTime)_ge(\"k3-wr\").textContent=d.allTime.winRate+\"%\";\n      if(inT&&d.activeState?.entryPrice>0){\n        const u=d.activeState?.unrealisedPnL??0;\n        if(_ge(\"sig3-pnl-rs\")){_ge(\"sig3-pnl-rs\").textContent=_fR(u);_ge(\"sig3-pnl-rs\").style.color=_gc(u);}\n        if(_ge(\"sig3-pnl-pts\")){_ge(\"sig3-pnl-pts\").textContent=(u>=0?\"+\":\"\")+u.toFixed(0)+\" index pts unrealised\";_ge(\"sig3-pnl-pts\").style.color=_gc(u);}\n        if(_ge(\"sig3-live\")&&d.activeState?.livePrice)_ge(\"sig3-live\").textContent=parseFloat(d.activeState.livePrice).toFixed(1);\n      }\n    }catch(e){console.error(e);}\n  }\n  _sig3Refresh();setInterval(_sig3Refresh,8000);\n  </script>\n  <script src=\"/public/js/app.js\"></script>\n</body>\n</html>"));
        return;
    }
    // -- GUEST / FREE USER VIEW (P&L only -- no strategy details) --
    var yesterdayIST = (function () {
        var d2 = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        d2.setDate(d2.getDate() - 1);
        return d2.toISOString().split("T")[0];
    })();
    var yTrades = trades.filter(function (t) { return (t.date || "").startsWith(yesterdayIST) && t.exitPrice && t.exitPrice > 0; });
    var yPnl = parseFloat(yTrades.reduce(function (s, t) { var _a; return s + ((_a = t.pnl) !== null && _a !== void 0 ? _a : 0); }, 0).toFixed(1));
    var yWins = yTrades.filter(function (t) { return t.pnl > 0; }).length;
    var QTY_MULT_G = 15;
    function fmtRsG(v) { var r = Math.round(v * QTY_MULT_G); return (r >= 0 ? "+" : "\u2212") + "\u20B9" + Math.abs(r).toLocaleString("en-IN"); }
    function fmtPtsG(v) { return (v >= 0 ? "+" : "") + v.toFixed(0) + " pts"; }
    function pnlClsG(v) { return v >= 0 ? "#10b981" : "#ef4444"; }
    var tierLabel = loggedIn ? '\uD83D\uDD14 Member' : '\uD83D\uDC64 Guest';
    var tierClass = loggedIn ? 'sig-tier-free' : 'sig-tier-guest';
    res.send("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Live Signals \u2014 ZeroScreen</title>\n  <link rel=\"stylesheet\" href=\"/public/css/style.css\">\n  <style>\n    .gv-wrap{max-width:680px;margin:0 auto;padding:0 12px 40px}\n    .gv-hero{background:var(--card-bg,#1e293b);border:1px solid var(--border,#334155);border-radius:14px;padding:22px 20px 18px;margin:18px 0 14px}\n    .gv-hero-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}\n    .gv-title{font-size:1.15rem;font-weight:700;color:var(--text,#f1f5f9)}\n    .gv-sub{font-size:0.78rem;color:var(--text-muted,#94a3b8);margin:0}\n    .gv-badge{font-size:0.68rem;font-weight:700;padding:3px 9px;border-radius:20px;letter-spacing:.3px}\n    .sig-tier-free{background:rgba(16,185,129,.15);color:#34d399;border:1px solid rgba(16,185,129,.3)}\n    .sig-tier-guest{background:rgba(100,116,139,.15);color:#94a3b8;border:1px solid rgba(100,116,139,.3)}\n    .gv-status{display:flex;align-items:center;gap:8px;margin-top:14px;padding:10px 14px;border-radius:10px;background:var(--bg2,#0f172a);border:1px solid var(--border,#334155)}\n    .gv-status-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}\n    .gv-status-dot.active{background:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.25);animation:gvpulse 2s infinite}\n    .gv-status-dot.idle{background:#64748b}\n    @keyframes gvpulse{0%,100%{box-shadow:0 0 0 3px rgba(16,185,129,.25)}50%{box-shadow:0 0 0 6px rgba(16,185,129,.08)}}\n    .gv-status-lbl{font-size:.8rem;color:var(--text-muted,#94a3b8)}\n    .gv-status-val{font-size:.85rem;font-weight:700;margin-left:auto}\n    .gv-status-val.active-col{color:#10b981}\n    .gv-status-val.idle-col{color:#64748b}\n    .gv-live-pnl{font-size:1.6rem;font-weight:800;margin:2px 0 0;letter-spacing:-.5px}\n    .gv-live-sub{font-size:.75rem;color:var(--text-muted,#94a3b8);margin-bottom:2px}\n    .gv-kpi-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:14px 0}\n    .gv-kpi{background:var(--card-bg,#1e293b);border:1px solid var(--border,#334155);border-radius:10px;padding:12px 14px}\n    .gv-kpi-lbl{font-size:.68rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#94a3b8);margin-bottom:4px}\n    .gv-kpi-val{font-size:1.05rem;font-weight:800}\n    .gv-kpi-sub{font-size:.67rem;color:var(--text-muted,#94a3b8);margin-top:2px}\n    .gv-sec-title{font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted,#94a3b8);margin:20px 0 10px;font-weight:700}\n    .gv-month-tbl{width:100%;border-collapse:collapse;font-size:.82rem}\n    .gv-month-tbl th{font-size:.65rem;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted,#94a3b8);font-weight:600;padding:6px 10px;text-align:left;border-bottom:1px solid var(--border,#334155)}\n    .gv-month-tbl td{padding:8px 10px;border-bottom:1px solid rgba(51,65,85,.5)}\n    .gv-month-tbl tr:last-child td{border-bottom:none}\n    .gv-month-tbl .mg{color:#10b981;font-weight:700}\n    .gv-month-tbl .mr{color:#ef4444;font-weight:700}\n    .gv-cta{display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,rgba(124,58,237,.18),rgba(99,102,241,.12));border:1px solid rgba(124,58,237,.35);border-radius:14px;padding:16px 18px;margin:20px 0}\n    .gv-cta-icon{font-size:1.5rem}\n    .gv-cta-body{flex:1}\n    .gv-cta-body strong{font-size:.92rem;color:#f1f5f9}\n    .gv-cta-body p{font-size:.75rem;color:#94a3b8;margin:3px 0 0}\n    .gv-btn{background:linear-gradient(135deg,#7c3aed,#6366f1);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:.78rem;font-weight:700;white-space:nowrap;text-decoration:none;cursor:pointer}\n    .gv-upd{font-size:.65rem;color:var(--text-muted,#64748b)}\n    @media(max-width:480px){.gv-kpi-row{grid-template-columns:1fr 1fr}}\n  </style>\n</head>\n<body class=\"page-theme-signals\">\n  ".concat(nav("signals", req), "\n  <div class=\"gv-wrap\">\n\n    <div class=\"gv-hero\">\n      <div class=\"gv-hero-top\">\n        <div>\n          <div class=\"gv-title\">Live Signals</div>\n          <p class=\"gv-sub\">BANKNIFTY Options &#xB7; Automated intraday bot</p>\n        </div>\n        <div style=\"display:flex;flex-direction:column;align-items:flex-end;gap:6px\">\n          <span class=\"gv-badge ").concat(tierClass, "\">").concat(tierLabel, "</span>\n          <span class=\"gv-upd\" id=\"gv-upd\">Connecting&#x2026;</span>\n        </div>\n      </div>\n\n      <div class=\"gv-status\">\n        <span class=\"gv-status-dot ").concat(hasPosition ? 'active' : 'idle', "\" id=\"gv-dot\"></span>\n        <span class=\"gv-status-lbl\" id=\"gv-status-lbl\">Bot ").concat(hasPosition ? 'is running a trade' : 'is idle \u2014 watching market', "</span>\n        <span class=\"gv-status-val ").concat(hasPosition ? 'active-col' : 'idle-col', "\" id=\"gv-status-val\">").concat(hasPosition ? '&#x25CF;&nbsp;ACTIVE' : 'Idle', "</span>\n      </div>\n\n      <div id=\"gv-live-wrap\" style=\"margin-top:14px;").concat(hasPosition ? '' : 'display:none', "\">\n        <div class=\"gv-live-sub\">Live P&amp;L (open position)</div>\n        <div class=\"gv-live-pnl\" id=\"gv-live-pnl\" style=\"color:#94a3b8\">&#x2014;</div>\n        <div class=\"gv-live-sub\" id=\"gv-live-pts\" style=\"margin-top:2px\"></div>\n      </div>\n    </div>\n\n    <div class=\"gv-kpi-row\">\n      <div class=\"gv-kpi\">\n        <div class=\"gv-kpi-lbl\">Today</div>\n        <div class=\"gv-kpi-val\" id=\"gv-today-rs\" style=\"color:").concat(pnlClsG(analytics.today.pnl), "\">").concat(fmtRsG(analytics.today.pnl), "</div>\n        <div class=\"gv-kpi-sub\" id=\"gv-today-pts\">").concat(fmtPtsG(analytics.today.pnl), "</div>\n      </div>\n      <div class=\"gv-kpi\">\n        <div class=\"gv-kpi-lbl\">Yesterday</div>\n        <div class=\"gv-kpi-val\" style=\"color:").concat(pnlClsG(yPnl), "\">").concat(fmtRsG(yPnl), "</div>\n        <div class=\"gv-kpi-sub\">").concat(fmtPtsG(yPnl)).concat(yTrades.length > 0 ? ' &middot; ' + yWins + 'W/' + (yTrades.length - yWins) + 'L' : ' &middot; no trades', "</div>\n      </div>\n      <div class=\"gv-kpi\">\n        <div class=\"gv-kpi-lbl\">This Week</div>\n        <div class=\"gv-kpi-val\" id=\"gv-wk-rs\" style=\"color:").concat(pnlClsG(analytics.weekly.pnl), "\">").concat(fmtRsG(analytics.weekly.pnl), "</div>\n        <div class=\"gv-kpi-sub\" id=\"gv-wk-pts\">").concat(fmtPtsG(analytics.weekly.pnl), "</div>\n      </div>\n    </div>\n\n    <div class=\"gv-sec-title\">Month-wise P&amp;L</div>\n    <div style=\"background:var(--card-bg,#1e293b);border:1px solid var(--border,#334155);border-radius:12px;overflow:hidden\">\n      <table class=\"gv-month-tbl\">\n        <thead><tr><th>Month</th><th>P&amp;L (&#x20B9;)</th><th>P&amp;L (pts)</th><th>Trades</th><th>Win%</th></tr></thead>\n        <tbody>\n          ").concat(analytics.monthly.slice(0, 6).map(function (m) { return "<tr>\n            <td>".concat(new Date(m.month + '-01').toLocaleString('en-IN', { month: 'short', year: '2-digit' }), "</td>\n            <td class=\"").concat(m.pnl >= 0 ? 'mg' : 'mr', "\">").concat(fmtRsG(m.pnl), "</td>\n            <td class=\"").concat(m.pnl >= 0 ? 'mg' : 'mr', "\">").concat(fmtPtsG(m.pnl), "</td>\n            <td>").concat(m.trades, "</td>\n            <td>").concat(m.winRate, "%</td>\n          </tr>"); }).join(""), "\n          ").concat(analytics.monthly.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:16px">No historical data yet</td></tr>' : '', "\n        </tbody>\n      </table>\n    </div>\n\n    <div class=\"gv-cta\">\n      <div class=\"gv-cta-icon\">&#x26A1;</div>\n      <div class=\"gv-cta-body\">\n        <strong>See every trade in real time</strong>\n        <p>Premium shows live entry &amp; exit, P&amp;L per trade, full history &amp; daily reports.</p>\n      </div>\n      <a href=\"/premium\" class=\"gv-btn\">Upgrade &#x2192;</a>\n    </div>\n\n    <footer class=\"site-footer\"><span>&#xA9; 2026 ZeroScreen &#x2014; For informational purposes only. Not SEBI registered. Not investment advice. Trading involves substantial risk.</span></footer>\n  </div>\n  <script src=\"/public/js/app.js\"></script>\n  <script>\n  const _GQM = 15;\n  function _gfR(v){const r=Math.round(v*_GQM);return(r>=0?\"+\":\"\u2212\")+\"\u20B9\"+Math.abs(r).toLocaleString(\"en-IN\");}\n  function _gfP(v){return(v>=0?\"+\":\"\")+v.toFixed(0)+\" pts\";}\n  function _gc2(v){return v>=0?\"#10b981\":\"#ef4444\";}\n  function _ge2(id){return document.getElementById(id);}\n  async function gvRefresh(){\n    try{\n      const d=(await (await fetch(\"/api/bot/status\")).json());\n      if(_ge2(\"gv-upd\"))_ge2(\"gv-upd\").textContent=\"Updated \"+new Date().toLocaleTimeString(\"en-IN\");\n      const inT=!!(d.activeState&&(d.activeState.inTrade||d.activeState.activeTrade||d.activeState.mainEntryDone));\n      const dot=_ge2(\"gv-dot\");\n      if(dot)dot.className=\"gv-status-dot \"+(inT?\"active\":\"idle\");\n      if(_ge2(\"gv-status-lbl\"))_ge2(\"gv-status-lbl\").textContent=inT?\"Bot is running a trade\":\"Bot is idle \u2014 watching market\";\n      if(_ge2(\"gv-status-val\")){_ge2(\"gv-status-val\").textContent=inT?\"\u25CF\u00A0ACTIVE\":\"Idle\";_ge2(\"gv-status-val\").className=\"gv-status-val \"+(inT?\"active-col\":\"idle-col\");}\n      const lw=_ge2(\"gv-live-wrap\");\n      if(inT&&d.activeState?.entryPrice>0){\n        const u=d.activeState?.unrealisedPnL??0;\n        if(lw)lw.style.display=\"\";\n        if(_ge2(\"gv-live-pnl\")){_ge2(\"gv-live-pnl\").textContent=_gfR(u);_ge2(\"gv-live-pnl\").style.color=_gc2(u);}\n        if(_ge2(\"gv-live-pts\"))_ge2(\"gv-live-pts\").textContent=_gfP(u)+\" unrealised\";\n      }else{if(lw)lw.style.display=\"none\";}\n      const tot=(d.today?.pnl??0)+(inT?(d.activeState?.unrealisedPnL??0):0);\n      if(_ge2(\"gv-today-rs\")){_ge2(\"gv-today-rs\").textContent=_gfR(tot);_ge2(\"gv-today-rs\").style.color=_gc2(tot);}\n      if(_ge2(\"gv-today-pts\"))_ge2(\"gv-today-pts\").textContent=_gfP(tot)+(inT?\" (incl. live)\":\"\");\n      if(_ge2(\"gv-wk-rs\")&&d.weekly){_ge2(\"gv-wk-rs\").textContent=_gfR(d.weekly.pnl);_ge2(\"gv-wk-rs\").style.color=_gc2(d.weekly.pnl);}\n      if(_ge2(\"gv-wk-pts\")&&d.weekly)_ge2(\"gv-wk-pts\").textContent=_gfP(d.weekly.pnl);\n    }catch(e){}\n  }\n  gvRefresh();setInterval(gvRefresh,12000);\n  </script>\n</body>\n</html>"));
});
function ensureAdminEmail() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!ADMIN_EMAIL)
                        return [2 /*return*/];
                    return [4 /*yield*/, (0, db_1.dbRun)("UPDATE users SET role = 'admin' WHERE email = ? AND role != 'admin'", [ADMIN_EMAIL])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
(0, db_1.initDb)().then(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, ensureAdminEmail()];
            case 1:
                _a.sent();
                // Run subscription expiry check on startup
                (0, db_1.expireOldSubscriptions)().catch(function () { });
                app.listen(PORT, function () {
                    console.log("\n\uD83D\uDD0D ZeroScreen running at http://localhost:".concat(PORT));
                    console.log("   Screener  : http://localhost:".concat(PORT, "/"));
                    console.log("   Watchlists: http://localhost:".concat(PORT, "/watchlists"));
                    console.log("   API stats : http://localhost:".concat(PORT, "/api/stats\n"));
                    (0, scheduler_1.startScheduler)();
                });
                return [2 /*return*/];
        }
    });
}); }).catch(function (err) { console.error("DB init failed:", err); process.exit(1); });
