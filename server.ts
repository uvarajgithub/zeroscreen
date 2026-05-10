/**
 * server.ts — ZeroScreen Express app
 */

import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import path from "path";
import bcrypt from "bcrypt";
import {
  screenStocks, getStock, getWatchlists, getWatchlist, createWatchlist,
  addToWatchlist, removeFromWatchlist, deleteWatchlist, getDbStats,
  getSectors, ScreenerFilter, initDb, upsertStock,
  createUser, getUserByEmail, getUserById, countUsers, UserRow, getAllUsers, dbRun, dbAll,
  getAlerts, createAlert, deleteAlert, getAllActiveAlerts,
  createResetToken, getResetToken, markResetTokenUsed, updateUserPassword,
  updateUserName, searchStocks,
  getActivePicks, getAllPicks, createPick, updatePickStatus, updatePickResult, updatePickEntry, triggerPickNow, deletePick, PickRow,
  getSetting, setSetting, getAllSettings,
  createOrder, activateSubscription, getActiveSubscription, expireOldSubscriptions, getAllSubscriptions,
  getPaperPortfolio, getPaperPositions, getPaperTrades, paperBuy, paperSell, paperReset,
  PaperPosition, PaperTrade,
  storePhoneOtp, verifyPhoneOtp, setUserMobile, getUserByMobile, countPaperTrades, getPaperTradeStats,
  getPaperTradeConfig, savePaperTradeConfig, PaperTradeConfig,
  saveBotState, getBotState, saveBotTrade, getBotTrades, BotTrade,
  getUsersWithAutoPicks, setAutoPaperPicks, getAutoPaperPicks,
  initPaperPortfolio, getPicksEmailSubscribers, updateUserNotifyPicks,
  setPaperBalance, setTelegramChatId, getTelegramSubscribers,
  getPublishedPosts, getAllBlogPosts, getBlogPost,
  createBlogPost, updateBlogPost, publishBlogPost, unpublishBlogPost, deleteBlogPost, BlogPost,
  getOrCreateReport, getReportOwner,
  getOrCreateReferralCode, getUserByReferralCode, applyReferral, getReferralStats,
  PremiumPick, getPublishedPremiumPicks, getAllPremiumPicks,
  createPremiumPick, updatePremiumPick, publishPremiumPick, unpublishPremiumPick, deletePremiumPick,
  LeaderboardEntry, getPaperLeaderboard,
  PriceAlert, getUserPriceAlerts, createPriceAlert, deletePriceAlert,
  StockNote, getStockNote, saveStockNote, getAllStockNotes,
} from "./db";
import { refreshPrices, refreshFundamentals, startScheduler } from "./scheduler";
import { fetchFundamentals } from "./scraper";
import { sendWelcomeEmail, sendContactNotification, sendAlertEmail, sendPasswordResetEmail, sendPicksDigest, sendTelegramMessage, sendTelegramSignalAlert } from "./mailer";
import crypto from "crypto";
import https from "https";
import fs from "fs";

// ── Telegram notify helper ─────────────────────────────────────────────────────
const TG_BOT   = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT  = process.env.TELEGRAM_CHAT_ID   || "";
function notifyTelegram(text: string): void {
  if (!TG_BOT || !TG_CHAT) return;
  const encoded = encodeURIComponent(text);
  const url = `https://api.telegram.org/bot${TG_BOT}/sendMessage?chat_id=${TG_CHAT}&text=${encoded}`;
  https.get(url, (r) => { r.resume(); }).on("error", () => {});
}

const app  = express();
const PORT = parseInt(process.env.PORT || "4000", 10);
const SESSION_SECRET = process.env.SESSION_SECRET || "zeroscreen-dev-secret-change-in-prod";

// ── Google OAuth config ────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_CALLBACK_URL  = process.env.GOOGLE_CALLBACK_URL  || "http://139-59-18-52.nip.io:4000/auth/google/callback";

// ── Strategy Presets ───────────────────────────────────────────────────────────
interface Strategy {
  id: string; label: string; icon: string; desc: string;
  params: Record<string, string>;
}
const STRATEGIES: Strategy[] = [
  { id: "quality",    icon: "🏆", label: "Quality Blue Chips",
    desc: "High ROCE, low debt, strong promoter holding",
    params: { minRoce: "20", maxDe: "0.5", minPromoter: "50", allProfit: "1", sortBy: "roce" } },
  { id: "debtfree",   icon: "💎", label: "Debt-Free Champions",
    desc: "Zero-debt companies with consistent profits",
    params: { maxDe: "0", minRoce: "15", allProfit: "1", sortBy: "roce" } },
  { id: "growth",     icon: "🚀", label: "Growth Compounders",
    desc: "Rising profits every year, strong ROCE",
    params: { uptrend: "1", allProfit: "1", minRoce: "15", sortBy: "roce" } },
  { id: "value",      icon: "💰", label: "Value Picks",
    desc: "Undervalued stocks with decent fundamentals",
    params: { maxPe: "15", minRoce: "10", maxDe: "1", sortBy: "pe" } },
  { id: "highroce",   icon: "⚡", label: "High ROCE Machines",
    desc: "Capital allocation champions — ROCE above 30%",
    params: { minRoce: "30", allProfit: "1", sortBy: "roce" } },
  { id: "dividend",   icon: "💵", label: "Dividend Earners",
    desc: "Consistent dividend-paying stocks",
    params: { minDivYield: "1.5", minRoce: "10", allProfit: "1", sortBy: "dividend" } },
  { id: "promoter",   icon: "👑", label: "Promoter Backed",
    desc: "High insider ownership — skin in the game",
    params: { minPromoter: "65", minRoce: "15", sortBy: "promoter" } },
  { id: "smallcap",   icon: "🌱", label: "Small Cap Gems",
    desc: "High-quality small caps under ₹5,000 Cr",
    params: { maxPrice: "300", minRoce: "20", allProfit: "1", sortBy: "roce" } },

  // ── Trading-style presets ─────────────────────────────────────────────────
  { id: "penny",      icon: "🪙", label: "Penny Stocks",
    desc: "Low-price stocks under ₹50 with decent volume — high risk, high reward",
    params: { maxPrice: "50", minVolume: "100000", sortBy: "volume" } },
  { id: "highvalue",  icon: "🏛️", label: "High Value Blue Chips",
    desc: "Premium-priced quality stocks above ₹500 with strong fundamentals",
    params: { minPrice: "500", minRoce: "15", allProfit: "1", sortBy: "price" } },
  { id: "longterm",   icon: "📅", label: "Long Term Compounders",
    desc: "Consistent profits, low debt, high ROCE — hold for 3-5 years",
    params: { minRoce: "18", maxDe: "0.5", minPromoter: "50", allProfit: "1", uptrend: "1", sortBy: "roce" } },
  { id: "shortterm",  icon: "⚡", label: "Short Term Momentum",
    desc: "High volume gainers with upward profit trend — 1 to 4 weeks",
    params: { minVolume: "500000", uptrend: "1", minRoce: "10", sortBy: "volume" } },
  { id: "swing",      icon: "🎯", label: "Swing Trading Picks",
    desc: "Positive day momentum + high volume + strong fundamentals — 3 to 10 day moves",
    params: { minChangePct: "0.3", uptrend: "1", minVolume: "200000", minRoce: "10", sortBy: "change_pct" } },
  { id: "options",    icon: "📊", label: "Options-Ready Stocks",
    desc: "Highly liquid NSE stocks suitable for F&O — high volume, good fundamentals",
    params: { minVolume: "500000", minRoce: "10", sortBy: "volume" } },
  { id: "highroe",    icon: "💯", label: "High ROE Stars",
    desc: "Top return on equity above 25% — efficient businesses",
    params: { minRoe: "25", allProfit: "1", sortBy: "roe" } },
  { id: "innews",     icon: "📰", label: "In News Today",
    desc: "Stocks mentioned in today's market news headlines",
    params: { inNews: "1", sortBy: "volume" } },
];

function strategyParams(s: Strategy): string {
  return new URLSearchParams(s.params).toString();
}

// ── News cache ─────────────────────────────────────────────────────────────────
interface NewsItem { title: string; link: string; pubDate: string; source: string; }
let _newsCache: NewsItem[] = [];
let _newsCacheAt = 0;
const NEWS_TTL = 5 * 60 * 1000; // 5 min

async function fetchMarketNews(): Promise<NewsItem[]> {
  if (Date.now() - _newsCacheAt < NEWS_TTL && _newsCache.length) return _newsCache;
  const feeds = [
    { url: "https://www.livemint.com/rss/markets",               source: "Mint" },
    { url: "https://feeds.feedburner.com/ndtvprofit-latest",     source: "NDTV Profit" },
  ];
  const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  const results: NewsItem[] = [];

  const fetchXml = (url: string): Promise<string> => new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 8000, headers: { "User-Agent": UA } }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, { timeout: 8000, headers: { "User-Agent": UA } }, res2 => {
          let d = ""; res2.on("data", c => d += c); res2.on("end", () => resolve(d));
        }).on("error", reject);
        return;
      }
      let d = ""; res.on("data", c => d += c); res.on("end", () => resolve(d));
    });
    req.on("error", reject); req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });

  for (const feed of feeds) {
    try {
      const xml = await fetchXml(feed.url);
      const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
      for (const item of items.slice(0, 10)) {
        const title   = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                         item.match(/<title>(.*?)<\/title>/) || [])[1]?.trim() || "";
        const link    = (item.match(/<link>(.*?)<\/link>/) ||
                         item.match(/<guid[^>]*>(.*?)<\/guid>/) ||
                         item.match(/<link\s[^>]*href="([^"]+)"/) || [])[1]?.trim() || "";
        const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1]?.trim() || "";
        if (title && title.length > 10 && link) results.push({ title, link, pubDate, source: feed.source });
      }
    } catch (_) { /* skip failing feed */ }
  }
  if (results.length) { _newsCache = results.slice(0, 15); _newsCacheAt = Date.now(); }
  return _newsCache;
}

// ── Session ────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SQLiteStore = require("connect-sqlite3")(session);
app.use(session({
  store: new SQLiteStore({ db: "sessions.db", dir: path.join(__dirname, "..") }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

declare module "express-session" {
  interface SessionData { userId: number; userName: string; userRole: string; oauthState: string; guestMode: boolean; mobileVerified: boolean; pendingReferral: string; }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/public", express.static(path.join(__dirname, "..", "public")));

// ── PWA Manifest ──────────────────────────────────────────────────────────────
app.get("/manifest.json", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/manifest+json");
  res.json({
    name: "ZeroScreen",
    short_name: "ZeroScreen",
    description: "India's sharpest NSE stock screener with paper trading & live signals",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    orientation: "portrait-primary",
    icons: [
      { src: "/public/images/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any maskable" },
      { src: "/public/images/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" },
    ],
    screenshots: [
      { src: "/public/images/og-default.svg", sizes: "1200x630", type: "image/svg+xml", form_factor: "wide" },
    ],
    categories: ["finance", "business"],
    lang: "en-IN",
  });
});

// Bypass ngrok browser warning for all responses
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  next();
});

// ── Analytics middleware ───────────────────────────────────────────────────────
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.method === "GET" &&
      !req.path.startsWith("/api/") &&
      !req.path.startsWith("/public/") &&
      !req.path.startsWith("/auth/")) {
    const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "").split(",")[0].trim();
    const ipHash = crypto.createHash("sha256").update(ip + "zs2026").digest("hex").slice(0, 16);
    const ua  = (req.headers["user-agent"] || "").slice(0, 150);
    const ref = (req.headers["referer"]    || "").slice(0, 200);
    dbRun(
      `INSERT INTO page_views (path, ip_hash, user_agent, referrer, is_logged_in, created_at)
       VALUES (?,?,?,?,?,datetime('now','localtime'))`,
      [req.path, ipHash, ua, ref, req.session?.userId ? 1 : 0]
    ).catch(() => {});
  }
  next();
});

// ── Security helpers ───────────────────────────────────────────────────────────

/** HTML-escape user-controlled strings before rendering into HTML to prevent XSS */
function esc(str: string | undefined | null): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Simple in-memory rate limiter — max attempts per window per IP */
const _rateLimits = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = _rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    _rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }
  entry.count++;
  if (entry.count > maxAttempts) return false; // blocked
  return true;
}
// Clean up stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rateLimits) { if (now > v.resetAt) _rateLimits.delete(k); }
}, 10 * 60 * 1000);

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.redirect("/login?next=" + encodeURIComponent(req.path));
    return;
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) { res.redirect("/login?next=" + encodeURIComponent(req.path)); return; }
  if (req.session.userRole !== "admin") { res.status(403).send(`<!DOCTYPE html><html><head><title>Access Denied</title><link rel="stylesheet" href="/public/css/style.css"></head><body>${nav("", req)}<div class="container"><div class="admin-denied"><h2>🔒 Admin Only</h2><p>You don't have permission to view this page.</p><a href="/" class="btn-primary">Back to Screener</a></div></div></body></html>`); return; }
  next();
}

/** Middleware: blocks access when app_setting[key] === 'false' */
function featureGate(settingKey: string, featureName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const enabled = (await getSetting(settingKey)) !== "false";
    if (!enabled) {
      res.status(404).send(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${featureName} Unavailable — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head><body>
  ${nav("", req)}
  <div class="container" style="text-align:center;padding:80px 20px">
    <div style="font-size:3rem;margin-bottom:16px">🚫</div>
    <h2 style="margin-bottom:8px">${featureName} is Unavailable</h2>
    <p style="color:var(--text-dim);margin-bottom:24px">This feature is currently disabled by the administrator.</p>
    <a href="/" class="btn-primary">← Back to Screener</a>
  </div>
  <script src="/public/js/app.js"></script>
</body></html>`);
      return;
    }
    next();
  };
}

/** Middleware: redirects to upgrade page when app_setting[key] === 'true' and user is not premium */
function premiumGate(settingKey: string, featureName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const premiumOnly = (await getSetting(settingKey)) === "true";
    if (premiumOnly && !userIsPremium(req)) {
      res.redirect("/my-paper-trade/upgrade?err=" + encodeURIComponent(`${featureName} requires a Premium subscription.`));
      return;
    }
    next();
  };
}

function userIsPremium(req: Request): boolean {
  const role = req.session?.userRole;
  return role === "premium" || role === "admin";
}

/** Returns true if current IST time is within NSE market hours (Mon–Fri 9:15–15:30) */
function isMarketHours(): boolean {
  const ist  = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const day  = ist.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 555 && mins <= 930; // 9:15=555, 15:30=930
}

/** Send OTP via Fast2SMS. Falls back to console log when FAST2SMS_API_KEY is unset. */
async function sendSmsOtp(mobile: string, otp: string): Promise<boolean> {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    console.log(`[OTP-DEV] Mobile: ${mobile} | OTP: ${otp}`);
    return true;
  }
  try {
    const message = `Your ZeroScreen OTP is ${otp}. Valid for 10 minutes. Do not share.`;
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${encodeURIComponent(apiKey)}&message=${encodeURIComponent(message)}&language=english&route=q&numbers=${mobile}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { "cache-control": "no-cache" } });
    const data = await resp.json() as any;
    if (!data.return) console.error("[OTP-SMS] Fast2SMS error:", JSON.stringify(data));
    return data.return === true;
  } catch (e) { console.error("[OTP-SMS] Exception:", e); return false; }
}

// ── Razorpay ──────────────────────────────────────────────────────────────────
const RAZORPAY_KEY_ID     = process.env.RAZORPAY_KEY_ID     || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const PREMIUM_PRICE_PAISE = 49900; // ₹499

// ── Template helper ────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function fmtCr(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1e5) return (n / 1e5).toFixed(1) + " Lcr";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "k Cr";
  return n.toFixed(0) + " Cr";
}

function fmtVol(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1e7) return (v / 1e7).toFixed(1) + "Cr";
  if (v >= 1e5) return (v / 1e5).toFixed(1) + "L";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(v);
}

function roceColor(r: number | null): string {
  if (r == null) return "#888";
  if (r >= 25)  return "#2ecc71";
  if (r >= 15)  return "#82e0aa";
  if (r >= 8)   return "#f39c12";
  return "#e74c3c";
}

function deColor(d: number | null): string {
  if (d == null) return "#888";
  if (d === 0)  return "#2ecc71";
  if (d <= 0.3) return "#82e0aa";
  if (d <= 1.0) return "#f39c12";
  return "#e74c3c";
}

function changeColor(c: number | null): string {
  if (c == null) return "#888";
  return c >= 0 ? "#2ecc71" : "#e74c3c";
}

// ── SEO meta helper ───────────────────────────────────────────────────────────
const BASE_URL = "http://139.59.18.52:4000";
const DEFAULT_OG_IMG = `${BASE_URL}/public/images/og-default.svg`;

function seoMeta(opts: {
  title:       string;
  description: string;
  url:         string;
  image?:      string;
  type?:       string;
}): string {
  const img  = opts.image ?? DEFAULT_OG_IMG;
  const type = opts.type  ?? "website";
  const desc = opts.description.replace(/"/g, "&quot;");
  const titl = opts.title.replace(/"/g, "&quot;");
  const url  = opts.url.startsWith("http") ? opts.url : `${BASE_URL}${opts.url}`;
  return `
  <meta name="description" content="${desc}">
  <meta property="og:type"        content="${type}">
  <meta property="og:title"       content="${titl}">
  <meta property="og:description" content="${desc}">
  <meta property="og:url"         content="${url}">
  <meta property="og:image"       content="${img}">
  <meta property="og:site_name"   content="ZeroScreen">
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${titl}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image"       content="${img}">
  <link rel="canonical"            href="${url}">
  <link rel="manifest"             href="/manifest.json">
  <meta name="theme-color"         content="#2563eb">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="ZeroScreen">`;
}

// ── Nav HTML ──────────────────────────────────────────────────────────────────
function nav(active: string, req?: Request): string {
  const isLoggedIn = !!(req?.session?.userId);
  const userName   = req?.session?.userName || "";
  const userRole   = req?.session?.userRole || "guest";
  const isAdmin    = userRole === "admin";
  const isPremium  = userRole === "premium" || isAdmin;

  // ── Tier-based dropdowns ───────────────────────────────────────────────────

  // 🟢 BEGINNERS — learn by watching, no real money
  const beginnerLinks: [string, string, string][] = [
    ["learn",        "/learn",        "📚 Learn — Beginner Guides"],
    ["paper-trade",  "/paper-trade",  "📋 Paper Trade"],
    ["leaderboard",  "/leaderboard",  "🏆 Leaderboard"],
    ["strategies",   "/strategies",   "🎓 How Strategies Work"],
    ["about",        "/about",        "ℹ️ About ZeroScreen"],
    ["blog",         "/blog",         "📝 Blog & Insights"],
  ];

  // 🟡 TRADERS (mid-level) — curated ideas + tools
  const traderLinks: [string, string, string][] = [
    ["today",          "/today",          "🔥 Today's Picks"],
    ["premium-picks",  "/premium-picks",  "⭐ Premium Picks"],
    ["leaderboard",    "/leaderboard",    "🏆 Leaderboard"],
    ["signals",        "/signals",        "📡 Live Bot Signals"],
    ["dashboard",      "/dashboard",      "📊 Bot Performance"],
    ["strategy-builder", "/strategy-builder", "🔨 Strategy Builder"],
  ];

  // 🔴 INVESTORS (advanced) — do your own research
  const investorLinks: [string, string, string][] = [
    ["home",    "/",        "🔍 Stock Screener"],
    ["compare", "/compare", "⚖️ Compare Stocks"],
    ...(isLoggedIn
      ? [["watchlists", "/watchlists", "⭐ Watchlists"] as [string,string,string],
         ["alerts",     "/alerts",     "🔔 Filter Alerts"] as [string,string,string],
         ["my-alerts",  "/my-alerts",  "🎯 Price Alerts"] as [string,string,string],
         ["my-notes",   "/my-notes",   "📝 Research Notes"] as [string,string,string]]
      : []),
  ];

  // Admin dropdown — admin only
  const adminLinks: [string, string, string][] = isAdmin ? [
    ["admin",               "/admin",               "🧠 Overview"],
    ["admin-picks",         "/admin/picks",         "🛠 Picks Manager"],
    ["admin-users",         "/admin/users",         "👥 Users"],
    ["admin-permissions",   "/admin/permissions",   "🔐 Permissions"],
    ["admin-notifications", "/admin/notifications", "🔔 Notifications"],
    ["admin-analytics",     "/admin/analytics",     "📊 Analytics"],
    ["admin-content",       "/admin/content",       "📢 Content"],
    ["admin-blog",          "/admin/blog",          "📝 Blog"],
    ["admin-pp",            "/admin/premium-picks", "⭐ Premium Picks"],
    ["admin-signals",       "/admin/signals",       "🤖 Signal Control"],
    ["admin-subs",          "/admin/subs",          "💳 Subscriptions"],
  ] : [];

  const allTiered = [...beginnerLinks, ...traderLinks, ...investorLinks];
  const beginnerActive = beginnerLinks.some(([k]) => k === active);
  const traderActive   = traderLinks.some(([k]) => k === active);
  const investorActive = investorLinks.some(([k]) => k === active);
  const adminActive    = adminLinks.some(([k]) => k === active);

  function dropMenu(id: string, btnLabel: string, isActive: boolean, sections: {label: string, color: string, links: [string,string,string][]}[]): string {
    return `<div class="nav-more" id="nav-drop-${id}">
      <button class="nav-more-btn${isActive ? " active" : ""}" id="nav-drop-btn-${id}" aria-haspopup="true" aria-expanded="false">
        ${btnLabel} <span class="nav-more-chevron">▾</span>
      </button>
      <div class="nav-more-drop nav-tier-drop" id="nav-drop-menu-${id}" role="menu">
        ${sections.map(sec => `
          <div class="nav-tier-section">
            <div class="nav-tier-label" style="border-left:3px solid ${sec.color}">${sec.label}</div>
            ${sec.links.map(([key, href, label]) =>
              `<a href="${href}" class="${active === key ? "active" : ""}" role="menuitem">${label}</a>`
            ).join("")}
          </div>`).join("")}
      </div>
    </div>`;
  }

  const exploreDropHtml = dropMenu("explore", "🧭 Explore", beginnerActive || traderActive || investorActive, [
    { label: "🟢 Beginners — Learn First", color: "#10b981", links: beginnerLinks },
    { label: "🟡 Traders — Ideas & Tools",  color: "#f59e0b", links: traderLinks },
    { label: "🔴 Investors — Research",     color: "#ef4444", links: investorLinks },
  ]);

  const adminDropHtml = isAdmin
    ? `<div class="nav-more" id="nav-drop-admin">
        <button class="nav-more-btn${adminActive ? " active" : ""}" id="nav-drop-btn-admin" aria-haspopup="true" aria-expanded="false">
          🛡️ Admin <span class="nav-more-chevron">▾</span>
        </button>
        <div class="nav-more-drop nav-more-drop-right" id="nav-drop-menu-admin" role="menu">
          ${adminLinks.map(([key, href, label]) =>
            `<a href="${href}" class="${active === key ? "active" : ""}" role="menuitem">${label}</a>`
          ).join("")}
        </div>
      </div>`
    : "";

  const authLinks = isLoggedIn
    ? `<div class="nav-user nav-user-menu" id="nav-user-menu">
         ${isPremium && !isAdmin ? `<span class="nav-premium-badge" title="Premium member">💎</span>` : ""}
         <button class="nav-avatar" id="nav-user-btn" aria-haspopup="true" aria-expanded="false" title="${userName}">${userName.charAt(0).toUpperCase()}</button>
         <div class="nav-user-drop" id="nav-user-drop" role="menu">
           <div class="nav-user-drop-name">${userName.split(" ")[0]}${isPremium && !isAdmin ? ` <span class="nav-udrop-badge">💎 Premium</span>` : isAdmin ? ` <span class="nav-udrop-badge nav-udrop-admin">🛡️ Admin</span>` : ""}</div>
           <a href="/profile" class="nav-user-drop-link" role="menuitem">👤 My Profile</a>
           <a href="/logout" class="nav-user-drop-logout" role="menuitem">↩ Sign Out</a>
         </div>
       </div>`
    : `<div class="nav-auth">
         <a href="/premium" class="btn-nav-premium${active === "premium" ? " active" : ""}">⚡ Premium</a>
         <a href="/login" class="btn-nav-login">Sign In</a>
       </div>`;

  const mobileMobFooter = isLoggedIn
    ? `<div class="nav-mobile-footer">
         <div class="nav-mob-identity">
           <span class="nav-mob-avatar">${userName.charAt(0).toUpperCase()}</span>
           <div class="nav-mob-identity-info">
             <span class="nav-mob-name">${userName.split(" ")[0]}</span>
             ${isPremium && !isAdmin ? `<span class="nav-mob-badge nav-mob-premium">💎 Premium</span>` : ""}
             ${isAdmin ? `<span class="nav-mob-badge nav-mob-admin-badge">🛡️ Admin</span>` : ""}
           </div>
         </div>
         <a href="/profile" class="nav-mob-link">👤 My Profile</a>
         ${isAdmin ? `<a href="/admin" class="nav-mob-link">🛡️ Admin Panel</a>` : ""}
         <a href="/logout" class="nav-mob-logout">↩ Sign Out</a>
       </div>`
    : `<div class="nav-mobile-footer">
         <a href="/login" class="nav-mob-link">🔐 Sign In</a>
         <a href="/signup" class="nav-mob-signup">⚡ Create Free Account</a>
       </div>`;

  return `<nav class="topnav" data-auth="${isLoggedIn ? "member" : "guest"}">
    <a href="/" class="brand"><img src="/public/images/logo.svg" class="brand-logo" alt="ZeroScreen"><span class="brand-wordmark">Zero<em>Screen</em></span></a>
    <div class="nav-desktop-links" id="nav-desktop-links">
      <a href="/" class="${active === "home" ? "active" : ""}">🔍 Screener</a>
      <a href="/today" class="${active === "today" ? "active" : ""}">🔥 Picks</a>
      <a href="/signals" class="nav-signals-link${active === "signals" ? " active" : ""}"><span class="nav-live-dot"></span>🤖 Live Bot</a>
      <a href="/paper-trade" class="${active === "paper-trade" ? "active" : ""}">📋 Paper Trade</a>
      ${isLoggedIn ? `<a href="/my-paper-trade" class="nav-hot-link${active === "my-paper-trade" ? " active" : ""}">💼 My Trade <span class="nav-hot-badge">HOT</span></a>` : ""}
      ${exploreDropHtml}
    </div>
    <div class="nav-right" id="nav-right">
      <div class="nav-search" id="nav-search-wrap">
        <input type="text" id="nav-search" class="nav-search-input" placeholder="Search stocks…" autocomplete="off" aria-label="Search stocks">
        <div class="nav-search-results" id="nav-search-results"></div>
      </div>
      ${adminDropHtml}
      <button class="btn-dark-toggle" id="dark-toggle" title="Toggle dark mode" aria-label="Toggle dark mode" onclick="toggleDarkMode()">🌙</button>
      ${authLinks}
    </div>
    <button class="hamburger" id="hamburger" aria-label="Toggle menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  </nav>
  <div class="nav-links" id="nav-links">
    <div class="nav-mob-drawer-head">
      <a href="/" class="brand nav-mob-drawer-brand"><img src="/public/images/logo.svg" class="brand-logo" alt="ZeroScreen"><span class="brand-wordmark">Zero<em>Screen</em></span></a>
      <button class="nav-mob-close" id="nav-mob-close" aria-label="Close menu">&#x2715;</button>
    </div>
    <a href="/" class="${active === "home" ? "active" : ""}">🔍 Screener</a>
    <a href="/today" class="${active === "today" ? "active" : ""}">🔥 Picks</a>
    <a href="/signals" class="nav-signals-link${active === "signals" ? " active" : ""}"><span class="nav-live-dot"></span>🤖 Live Bot</a>
    <a href="/paper-trade" class="${active === "paper-trade" ? "active" : ""}">📋 Paper Trade</a>
    ${isLoggedIn ? `<a href="/my-paper-trade" class="nav-hot-link${active === "my-paper-trade" ? " active" : ""}">💼 My Trade <span class="nav-hot-badge">HOT</span></a>` : ""}
    ${exploreDropHtml.replace('id="nav-drop-', 'id="mob-drop-').replace('id="nav-drop-btn-', 'id="mob-drop-btn-').replace('id="nav-drop-menu-', 'id="mob-drop-menu-')}
    ${mobileMobFooter}
  </div>
  <div class="nav-overlay" id="nav-overlay"></div>
  <div class="ticker-wrap" id="ticker-wrap" aria-label="Market news ticker">
    <span class="ticker-label">📰 MARKET</span>
    <div class="ticker-viewport">
      <div class="ticker-track" id="ticker-track">Loading news…</div>
    </div>
  </div>
  <div class="chat-widget" id="chat-widget">
    <button class="chat-bubble" id="chat-bubble-btn" aria-label="Ask a question">
      <span class="chat-bubble-icon">💬</span>
      <span>Help</span>
    </button>
    <div class="chat-window" id="chat-window" style="display:none" role="dialog" aria-label="Help chat">
      <div class="chat-header">
        <div class="chat-header-left">
          <div class="chat-header-avatar">🤖</div>
          <span>ZeroScreen Help</span>
        </div>
        <button class="chat-close" id="chat-close" aria-label="Close chat">✕</button>
      </div>
      <div class="chat-messages" id="chat-messages">
        <div class="chat-msg bot">👋 Hi! Ask me anything about ZeroScreen — screener, paper trade, how things work, and more.<div class="chat-chips">
          <span class="chat-chip" data-q="paper trade">📋 Paper Trade</span>
          <span class="chat-chip" data-q="screener">🔍 Screener</span>
          <span class="chat-chip" data-q="free">💰 Is it free?</span>
          <span class="chat-chip" data-q="get started">🚀 Get started</span>
        </div></div>
      </div>
      <div class="chat-input-row">
        <input type="text" class="chat-input" id="chat-input" placeholder="Ask a question…" autocomplete="off" maxlength="200">
        <button class="chat-send" id="chat-send" aria-label="Send">→</button>
      </div>
    </div>
  </div>
  ${isLoggedIn ? `<script>window._zsUid="${req?.session?.userId ?? ""}";window._zsRole="${userRole}";</script>` : ""}`;
}

// ── Auth pages ─────────────────────────────────────────────────────────────────

function authLayout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body class="auth-body">
  <div class="auth-wrapper">
    <div class="auth-brand">
      <a href="/" class="auth-logo"><img src="/public/images/logo.svg" class="auth-logo-img" alt="ZeroScreen"><span class="auth-logo-text">Zero<em>Screen</em></span></a>
      <p class="auth-tagline">India's sharpest NSE stock screener</p>
    </div>
    <div class="auth-card">
      ${content}
    </div>
    <p class="auth-footer">© 2026 ZeroScreen · <a href="/">Back to app</a></p>
  </div>
</body>
</html>`;
}

// GET /signup
app.get("/signup", featureGate("registration_open", "New Registrations"), (req: Request, res: Response) => {
  if (req.session.userId) { res.redirect("/"); return; }
  const error = req.query.error as string | undefined;
  const googleBtn = GOOGLE_CLIENT_ID
    ? `<a href="/auth/google" class="btn-google">
         <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
           <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
           <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
           <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
           <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
         </svg>
         Sign up with Google
       </a>
       <div class="auth-divider"><span>or create with email</span></div>`
    : "";
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Create Account — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    /* ── Tier Score Dots ── */
    .tier-scores { display:flex; flex-direction:column; gap:10px; margin:24px 0; }
    .tier-row {
      display:flex; align-items:stretch; gap:0;
      border-radius:14px; overflow:hidden;
      border:1px solid rgba(255,255,255,0.08);
    }
    .tier-dot-col {
      width:54px; flex-shrink:0; display:flex; flex-direction:column;
      align-items:center; justify-content:center; gap:4px; padding:14px 0;
    }
    .tier-dot {
      width:14px; height:14px; border-radius:50%;
      box-shadow:0 0 10px currentColor;
    }
    .tier-dot.green  { background:#10b981; color:#10b981; }
    .tier-dot.yellow { background:#f59e0b; color:#f59e0b; }
    .tier-dot.red    { background:#ef4444; color:#ef4444; }
    .tier-row-green  { background:linear-gradient(90deg,rgba(16,185,129,0.14) 0%,rgba(16,185,129,0.04) 100%); }
    .tier-row-yellow { background:linear-gradient(90deg,rgba(245,158,11,0.14) 0%,rgba(245,158,11,0.04) 100%); }
    .tier-row-red    { background:linear-gradient(90deg,rgba(239,68,68,0.14) 0%,rgba(239,68,68,0.04) 100%); }
    .tier-content { flex:1; padding:12px 14px 12px 4px; }
    .tier-label {
      font-size:10px; font-weight:800; letter-spacing:1px; text-transform:uppercase; margin-bottom:5px;
    }
    .tier-label.green  { color:#34d399; }
    .tier-label.yellow { color:#fbbf24; }
    .tier-label.red    { color:#f87171; }
    .tier-title { font-size:13.5px; font-weight:700; color:#f1f5f9; margin-bottom:5px; }
    .tier-features { display:flex; flex-wrap:wrap; gap:5px; }
    .tier-tag {
      font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px; white-space:nowrap;
    }
    .tier-tag.green  { background:rgba(16,185,129,0.2); color:#6ee7b7; border:1px solid rgba(16,185,129,0.3); }
    .tier-tag.yellow { background:rgba(245,158,11,0.2);  color:#fde68a; border:1px solid rgba(245,158,11,0.3); }
    .tier-tag.red    { background:rgba(239,68,68,0.2);   color:#fca5a5; border:1px solid rgba(239,68,68,0.3); }

    /* ── Feature Preview Cards ── */
    .signup-feat-cards { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:20px; }
    .sfc {
      border-radius:14px; padding:16px; position:relative; overflow:hidden;
      display:flex; flex-direction:column; gap:0;
    }
    .sfc-paper   { background:linear-gradient(145deg,#022c22,#064e3b); border:1px solid rgba(16,185,129,0.4); }
    .sfc-signals { background:linear-gradient(145deg,#1e1b4b,#312e81); border:1px solid rgba(99,102,241,0.45); }
    .sfc-screen  { background:linear-gradient(145deg,#0f1535,#1e3a5f); border:1px solid rgba(59,130,246,0.4); }
    .sfc-backtest{ background:linear-gradient(145deg,#1a0f2e,#3b0764); border:1px solid rgba(139,92,246,0.4); }
    .sfc-badge {
      display:inline-flex; align-items:center; gap:4px;
      font-size:9.5px; font-weight:800; padding:3px 8px; border-radius:20px;
      margin-bottom:10px; letter-spacing:0.6px; width:fit-content;
    }
    .sfc-badge.hot     { background:linear-gradient(135deg,#ef4444,#f97316); color:#fff; }
    .sfc-badge.live    { background:#ef4444; color:#fff; animation:livePulse 1.5s ease-in-out infinite; }
    .sfc-badge.free    { background:linear-gradient(135deg,#10b981,#059669); color:#fff; }
    .sfc-badge.backtest{ background:linear-gradient(135deg,#8b5cf6,#7c3aed); color:#fff; }
    @keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
    .sfc-icon { font-size:2.6rem; margin-bottom:8px; line-height:1; }
    .sfc-title { font-size:13px; font-weight:800; color:#fff; margin-bottom:5px; letter-spacing:-0.2px; }
    .sfc-desc  { font-size:11.5px; color:rgba(255,255,255,0.65); line-height:1.5; }
    /* mock P&L mini chart */
    .sfc-pnl-preview {
      margin-top:10px; padding:8px 10px; border-radius:8px;
      background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.08);
      display:flex; align-items:center; gap:8px;
    }
    .sfc-pnl-num { font-size:15px; font-weight:900; }
    .sfc-pnl-num.green { color:#4ade80; }
    .sfc-pnl-num.purple{ color:#c4b5fd; }
    .sfc-pnl-label { font-size:10px; color:rgba(255,255,255,0.45); }
    .sfc-mini-bars { display:flex; align-items:flex-end; gap:2px; height:22px; }
    .sfc-bar { width:5px; border-radius:2px 2px 0 0; }
    .sfc-bar.g { background:#4ade80; }
    .sfc-bar.r { background:#f87171; }

    /* ── Stats bar ── */
    .signup-stats { display:flex; gap:0; margin-top:20px; border:1px solid rgba(255,255,255,0.1); border-radius:12px; overflow:hidden; }
    .ss-stat { flex:1; padding:13px 8px; text-align:center; border-right:1px solid rgba(255,255,255,0.1); }
    .ss-stat:last-child { border-right:none; }
    .ss-stat strong { display:block; font-size:1.2rem; font-weight:900; color:#fff; letter-spacing:-0.5px; }
    .ss-stat span { font-size:10px; color:rgba(255,255,255,0.55); font-weight:600; letter-spacing:0.3px; margin-top:2px; display:block; }
    .signup-trust { display:flex; align-items:center; gap:8px; margin-top:16px; font-size:11.5px; color:rgba(255,255,255,0.45); }

    @media(max-width:600px){
      .signup-feat-cards { grid-template-columns:1fr; }
      .signup-stats { flex-wrap:wrap; }
      .tier-row { flex-direction:column; }
      .tier-dot-col { flex-direction:row; width:100%; justify-content:flex-start; padding:10px 14px 0; }
    }
  </style>
</head>
<body class="auth-body landing-page">
  <div class="landing-split">

    <!-- LEFT: Feature showcase -->
    <div class="landing-hero">
      <div class="landing-hero-inner">
        <a href="/" class="landing-logo"><img src="/public/images/logo.svg" class="landing-logo-img" alt="ZeroScreen"><span class="landing-logo-text">Zero<em>Screen</em></span></a>
        <div class="landing-badge">🇮🇳 Built for Indian Markets · Free Forever</div>
        <h1 class="landing-headline">Everything you need<br>to trade smarter.<br><span>All in one place.</span></h1>

        <!-- Beginner callout -->
        <div style="background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05));border:1px solid rgba(16,185,129,0.35);border-radius:14px;padding:14px 16px;margin-bottom:20px">
          <div style="font-size:12px;font-weight:800;color:#34d399;letter-spacing:0.4px;text-transform:uppercase;margin-bottom:6px">🌱 New to Trading?</div>
          <div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:6px">Afraid of losing real money?<br>Let's learn together — zero risk.</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.6);line-height:1.6">Start with ₹1,00,000 virtual money. Practice on real NSE stocks, discover your strategy, and get confident before you ever risk a single rupee.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <span style="background:rgba(16,185,129,0.2);color:#34d399;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid rgba(16,185,129,0.3)">✅ No real money needed</span>
            <span style="background:rgba(16,185,129,0.2);color:#34d399;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid rgba(16,185,129,0.3)">📈 Real market prices</span>
            <span style="background:rgba(16,185,129,0.2);color:#34d399;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid rgba(16,185,129,0.3)">🎯 Master before going live</span>
          </div>
        </div>

        <!-- Feature preview cards with mock data -->
        <div class="signup-feat-cards">
          <div class="sfc sfc-paper">
            <span class="sfc-badge hot">🔥 HOT</span>
            <div class="sfc-icon">📋</div>
            <div class="sfc-title">My Paper Trade</div>
            <div class="sfc-desc">₹1,00,000 virtual portfolio. Trade any NSE stock in real market hours.</div>
            <div class="sfc-pnl-preview">
              <div>
                <div class="sfc-pnl-num green">+₹4,320</div>
                <div class="sfc-pnl-label">Your P&amp;L today</div>
              </div>
              <div class="sfc-mini-bars" style="margin-left:auto">
                <div class="sfc-bar r" style="height:8px"></div>
                <div class="sfc-bar g" style="height:14px"></div>
                <div class="sfc-bar g" style="height:18px"></div>
                <div class="sfc-bar r" style="height:10px"></div>
                <div class="sfc-bar g" style="height:22px"></div>
              </div>
            </div>
          </div>
          <div class="sfc sfc-signals">
            <span class="sfc-badge live">● LIVE</span>
            <div class="sfc-icon">📡</div>
            <div class="sfc-title">Live Bot Signals</div>
            <div class="sfc-desc">Real BANKNIFTY CE/PE trades. Refreshes every 8 seconds with AI confidence.</div>
            <div class="sfc-pnl-preview">
              <div>
                <div class="sfc-pnl-num" style="color:#a5f3fc">CE 48200</div>
                <div class="sfc-pnl-label">Active position</div>
              </div>
              <div style="margin-left:auto;text-align:right">
                <div style="font-size:11px;font-weight:700;color:#4ade80">+142 pts</div>
                <div style="font-size:10px;color:rgba(255,255,255,0.4)">Unrealised</div>
              </div>
            </div>
          </div>
          <div class="sfc sfc-screen">
            <span class="sfc-badge free">FREE</span>
            <div class="sfc-icon">🔍</div>
            <div class="sfc-title">NSE Screener</div>
            <div class="sfc-desc">1,700+ stocks. Filter by ROCE, ROE, D/E, P/E. 14 one-click strategy presets.</div>
            <div class="sfc-pnl-preview" style="justify-content:space-between">
              <span style="font-size:11px;color:#93c5fd;font-weight:700">ROCE &gt; 20%</span>
              <span style="font-size:11px;color:#93c5fd;font-weight:700">D/E &lt; 0.5</span>
              <span style="font-size:11px;color:#6ee7b7;font-weight:700">142 stocks</span>
            </div>
          </div>
          <div class="sfc sfc-backtest">
            <span class="sfc-badge backtest">📊 5-YEAR</span>
            <div class="sfc-icon">📈</div>
            <div class="sfc-title">Backtest Analytics</div>
            <div class="sfc-desc">5 years of BANKNIFTY bot performance. Monthly P&amp;L charts. Win rate by model.</div>
            <div class="sfc-pnl-preview">
              <div>
                <div class="sfc-pnl-num purple">68.4%</div>
                <div class="sfc-pnl-label">Win rate (5yr)</div>
              </div>
              <div class="sfc-mini-bars" style="margin-left:auto">
                <div class="sfc-bar g" style="height:12px"></div>
                <div class="sfc-bar r" style="height:6px"></div>
                <div class="sfc-bar g" style="height:18px"></div>
                <div class="sfc-bar g" style="height:15px"></div>
                <div class="sfc-bar g" style="height:22px"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="signup-stats">
          <div class="ss-stat"><strong>1,700+</strong><span>NSE Stocks</span></div>
          <div class="ss-stat"><strong>14</strong><span>Strategies</span></div>
          <div class="ss-stat"><strong>5-Year</strong><span>Backtest</span></div>
          <div class="ss-stat"><strong>Free</strong><span>Forever</span></div>
        </div>

        <div class="signup-trust">
          🔒 No credit card · No broker account needed · Free forever
        </div>
      </div>
    </div>

    <!-- RIGHT: Sign up form -->
    <div class="landing-auth">
      <div class="auth-card">
        <h2>Create your free account</h2>
        <p class="auth-sub">Takes 30 seconds. No credit card needed.</p>
        ${error ? `<div class="auth-error">${esc(error)}</div>` : ""}
        <a href="/?guest=1" class="btn-guest">👀 Browse as Guest — No sign up needed</a>
        <div class="auth-divider"><span>or create a free account</span></div>
        ${googleBtn}
        <form class="auth-form" method="POST" action="/signup">
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" name="name" placeholder="Rahul Sharma" required autocomplete="name">
          </div>
          <div class="form-group">
            <label>Email address</label>
            <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
          </div>
          <div class="form-group">
            <label>Password <span class="hint">(min 8 chars)</span></label>
            <input type="password" name="password" placeholder="••••••••" minlength="8" required autocomplete="new-password">
          </div>
          <label class="form-checkbox">
            <input type="checkbox" name="notify_picks" value="1" checked>
            <span>📬 Email me Today's Picks daily (free)</span>
          </label>
          <button type="submit" class="btn-auth">Create Free Account →</button>
        </form>
        <div style="margin-top:18px;padding:14px 16px;background:linear-gradient(135deg,rgba(16,185,129,0.08),rgba(59,130,246,0.08));border:1px solid rgba(16,185,129,0.2);border-radius:10px;font-size:0.8rem;color:var(--text-muted);line-height:1.6">
          ✅ <strong style="color:var(--text)">What you unlock instantly:</strong><br>
          📋 ₹1L personal paper trade portfolio &nbsp;·&nbsp; ⭐ Unlimited watchlists<br>
          🔔 Email alerts on your custom filters &nbsp;·&nbsp; 📊 Full bot analytics
        </div>
        <p class="auth-switch" style="margin-top:16px">Already have an account? <a href="/login">Sign in</a></p>
      </div>
    </div>

  </div>
</body>
</html>`);
});

// POST /signup
app.post("/signup", featureGate("registration_open", "New Registrations"), async (req: Request, res: Response) => {
  const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  if (!checkRateLimit(`signup:${ip}`, 5, 60 * 60 * 1000)) {
    res.redirect("/signup?error=Too+many+signups+from+this+IP.+Please+try+later."); return;
  }
  const { name, email, password, notify_picks } = req.body;
  if (!name || !email || !password) {
    res.redirect("/signup?error=All+fields+are+required"); return;
  }
  if (password.length < 8) {
    res.redirect("/signup?error=Password+must+be+at+least+8+characters"); return;
  }
  const existing = await getUserByEmail(email);
  if (existing) {
    res.redirect("/signup?error=An+account+with+that+email+already+exists"); return;
  }
  const hash = await bcrypt.hash(password, 12);
  // First ever user OR the configured ADMIN_EMAIL gets admin role
  const userCount = await countUsers();
  const id = await createUser(name.trim(), email.trim(), hash);
  const isAdminEmail = ADMIN_EMAIL && email.trim().toLowerCase() === ADMIN_EMAIL;
  const role = (userCount === 0 || isAdminEmail) ? "admin" : "user";
  if (role === "admin") {
    await dbRun("UPDATE users SET role = 'admin' WHERE id = ?", [id]);
  }
  // Save notification preference
  const wantPicksEmail = notify_picks === "1" ? 1 : 0;
  await dbRun("UPDATE users SET notify_picks = ? WHERE id = ?", [wantPicksEmail, id]);
  // Grant ₹1L virtual paper trade balance
  await initPaperPortfolio(id);
  // Generate referral code for new user
  await getOrCreateReferralCode(id);
  // Apply referral bonus if session has a pending referral code
  if (req.session.pendingReferral) {
    await applyReferral(id, req.session.pendingReferral).catch(() => {});
    delete req.session.pendingReferral;
  }
  req.session.userId = id;
  req.session.userName = name.trim();
  req.session.userRole = role;
  // Send welcome email (non-blocking)
  sendWelcomeEmail(name.trim(), email.trim()).catch(() => {});
  // Notify admin on Telegram (respects notify_user_signup setting)
  getSetting("notify_user_signup").then(v => {
    if (v !== "false") notifyTelegram(`🆕 New ZeroScreen signup!\nName: ${name.trim()}\nEmail: ${email.trim()}\nRole: ${role}\nTime: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`);
  }).catch(() => {});
  res.redirect("/");
});

// ── GET /ref/:code — referral landing ─────────────────────────────────────────
app.get("/ref/:code([A-F0-9]{8})", async (req: Request, res: Response) => {
  const code = req.params.code.toUpperCase();
  const referrer = await getUserByReferralCode(code);
  if (!referrer) { res.redirect("/signup"); return; }
  // If already logged in, redirect home
  if (req.session.userId) { res.redirect("/?ref=already"); return; }
  // Store in session so signup can apply it
  req.session.pendingReferral = code;
  const name = esc(referrer.name);
  res.send(`<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${name} invited you to ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .ref-wrap{max-width:480px;margin:60px auto;padding:0 16px}
    .ref-card{background:var(--card-bg);border:1px solid var(--border);border-radius:16px;padding:32px;text-align:center}
    .ref-icon{font-size:2.5rem;margin-bottom:12px}
    .ref-title{font-size:1.3rem;font-weight:800;margin-bottom:8px}
    .ref-sub{color:var(--text-muted);font-size:.9rem;margin-bottom:24px;line-height:1.5}
    .ref-bonus{background:#10b98122;border:1px solid #10b98155;border-radius:10px;padding:14px;margin-bottom:22px}
    .ref-bonus-val{font-size:1.5rem;font-weight:800;color:#10b981}
    .ref-bonus-sub{font-size:.78rem;color:#10b981;margin-top:2px}
  </style>
</head><body>
<div class="ref-wrap">
  <div class="ref-card">
    <div class="ref-icon">🎁</div>
    <div class="ref-title">${name} invited you!</div>
    <div class="ref-sub">Join ZeroScreen free — India's stock screener with paper trading, live signals and expert picks.</div>
    <div class="ref-bonus">
      <div class="ref-bonus-val">+₹10,000 Bonus</div>
      <div class="ref-bonus-sub">added to your virtual paper trade wallet when you sign up</div>
    </div>
    <a href="/signup" class="btn-primary" style="display:block;text-align:center;padding:12px;border-radius:10px;font-size:1rem;font-weight:700;text-decoration:none">Sign Up Free →</a>
    <p style="font-size:.76rem;color:var(--text-muted);margin-top:12px">Already have an account? <a href="/login" style="color:var(--accent)">Sign In</a></p>
  </div>
</div>
<script src="/public/js/app.js"></script></body></html>`);
});

// ── GET /my-referrals — member referral stats ─────────────────────────────────
app.get("/my-referrals", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const stats = await getReferralStats(userId);
  const refUrl = `${BASE_URL}/ref/${stats.code}`;
  res.send(`<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Invite Friends — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .ref-pg{max-width:600px;margin:0 auto;padding:0 16px 60px}
    .ref-pg-card{background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:28px;margin-bottom:16px}
    .ref-pg-title{font-size:1.2rem;font-weight:800;margin-bottom:6px}
    .ref-pg-sub{color:var(--text-muted);font-size:.85rem;margin-bottom:20px;line-height:1.5}
    .ref-kpis{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px}
    .ref-kpi{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center}
    .ref-kpi-val{font-size:1.3rem;font-weight:800;color:var(--accent)}
    .ref-kpi-lbl{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-top:2px}
    .ref-link-box{display:flex;gap:8px;align-items:center;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 14px}
    .ref-link-text{flex:1;font-size:.82rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .ref-steps{margin-top:16px;padding-left:0;list-style:none;display:flex;flex-direction:column;gap:10px}
    .ref-step{display:flex;align-items:flex-start;gap:12px;font-size:.88rem}
    .ref-step-num{flex-shrink:0;width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:800}
  </style>
</head><body>
  ${nav("", req)}
  <div class="ref-pg">
    <div class="page-header"><h1 class="page-title">🎁 Invite Friends</h1></div>
    <div class="ref-pg-card">
      <div class="ref-pg-title">Your Referral Stats</div>
      <div class="ref-kpis">
        <div class="ref-kpi"><div class="ref-kpi-val">${stats.count}</div><div class="ref-kpi-lbl">Friends Joined</div></div>
        <div class="ref-kpi"><div class="ref-kpi-val" style="color:#10b981">₹${stats.bonusEarned.toLocaleString("en-IN")}</div><div class="ref-kpi-lbl">Bonus Earned</div></div>
        <div class="ref-kpi"><div class="ref-kpi-val" style="color:var(--text-muted)">₹10k</div><div class="ref-kpi-lbl">Per Referral</div></div>
      </div>
      <div style="font-size:.8rem;font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted)">Your referral link</div>
      <div class="ref-link-box">
        <span class="ref-link-text">${refUrl}</span>
        <button onclick="navigator.clipboard.writeText('${refUrl}').then(()=>{this.textContent='✅ Copied!';setTimeout(()=>this.textContent='Copy',2000)});if(window.zsMarkInviteDone)zsMarkInviteDone();" style="padding:5px 14px;background:var(--accent);color:#fff;border:none;border-radius:7px;font-size:.78rem;font-weight:700;cursor:pointer;white-space:nowrap">Copy</button>
        <a href="https://wa.me/?text=${encodeURIComponent(`Join ZeroScreen free — India's best stock screener + paper trading! I earned ₹10k bonus, you will too: ${refUrl}`)}" target="_blank" rel="noopener" onclick="if(window.zsMarkInviteDone)zsMarkInviteDone();" style="padding:5px 12px;background:#25d36622;border:1px solid #25d36655;border-radius:7px;font-size:.78rem;font-weight:700;color:#25d366;text-decoration:none;white-space:nowrap">WhatsApp</a>
      </div>
    </div>
    <div class="ref-pg-card">
      <div class="ref-pg-title">How it works</div>
      <ul class="ref-steps">
        <li class="ref-step"><div class="ref-step-num">1</div><span>Share your referral link with friends</span></li>
        <li class="ref-step"><div class="ref-step-num">2</div><span>They sign up using your link</span></li>
        <li class="ref-step"><div class="ref-step-num">3</div><span>They receive <strong>₹10,000 bonus</strong> in their paper trade wallet</span></li>
        <li class="ref-step"><div class="ref-step-num">4</div><span>You receive <strong>₹10,000 bonus</strong> added to your wallet too!</span></li>
      </ul>
    </div>
  </div>
<script src="/public/js/app.js"></script></body></html>`);
});

// ── GET /sitemap.xml ──────────────────────────────────────────────────────────
app.get("/sitemap.xml", async (_req: Request, res: Response) => {
  const staticUrls = [
    { loc: "/",                 priority: "1.0", changefreq: "daily"   },
    { loc: "/signals",          priority: "0.9", changefreq: "hourly"  },
    { loc: "/today",            priority: "0.9", changefreq: "daily"   },
    { loc: "/learn",            priority: "0.8", changefreq: "weekly"  },
    { loc: "/learn/basics",     priority: "0.7", changefreq: "monthly" },
    { loc: "/learn/intraday",   priority: "0.7", changefreq: "monthly" },
    { loc: "/learn/candles",    priority: "0.7", changefreq: "monthly" },
    { loc: "/learn/screener-guide",    priority: "0.7", changefreq: "monthly" },
    { loc: "/learn/paper-trade-guide", priority: "0.7", changefreq: "monthly" },
    { loc: "/learn/signals-guide",     priority: "0.7", changefreq: "monthly" },
    { loc: "/about",            priority: "0.6", changefreq: "monthly" },
    { loc: "/blog",             priority: "0.7", changefreq: "weekly"  },
    { loc: "/contact",          priority: "0.5", changefreq: "monthly" },
  ];
  const [stocks, posts] = await Promise.all([
    dbAll<{ symbol: string }>("SELECT symbol FROM stocks WHERE fetched_at IS NOT NULL ORDER BY market_cap DESC NULLS LAST LIMIT 1000"),
    getPublishedPosts(50),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const items = [
    ...staticUrls.map(u => `  <url><loc>${BASE_URL}${u.loc}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority><lastmod>${today}</lastmod></url>`),
    ...stocks.map(s => `  <url><loc>${BASE_URL}/stock/${s.symbol}</loc><changefreq>daily</changefreq><priority>0.6</priority><lastmod>${today}</lastmod></url>`),
    ...posts.map(p => `  <url><loc>${BASE_URL}/blog/${p.slug}</loc><changefreq>weekly</changefreq><priority>0.7</priority><lastmod>${(p.published_at || p.created_at).slice(0,10)}</lastmod></url>`),
  ];
  res.set("Content-Type", "application/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</urlset>`);
});

// ── GET /robots.txt ───────────────────────────────────────────────────────────
app.get("/robots.txt", (_req: Request, res: Response) => {
  res.set("Content-Type", "text/plain");
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /internal/\nSitemap: ${BASE_URL}/sitemap.xml\n`);
});

// GET /login
app.get("/login", (req: Request, res: Response) => {
  if (req.session.userId) { res.redirect("/"); return; }
  const error = req.query.error as string | undefined;
  const next  = req.query.next as string | undefined;
  const googleBtn = GOOGLE_CLIENT_ID
    ? `<a href="/auth/google" class="btn-google">
         <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
           <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
           <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
           <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
           <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
         </svg>
         Continue with Google
       </a>
       <div class="auth-divider"><span>or sign in with email</span></div>`
    : "";
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sign In — ZeroScreen</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #020817; color: #f1f5f9; min-height: 100vh; overflow-x: hidden; }

    /* ── Animated gradient background ── */
    .lp-bg {
      position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden;
    }
    .lp-orb {
      position: absolute; border-radius: 50%; filter: blur(90px); opacity: 0.22;
      animation: orbFloat 14s ease-in-out infinite alternate;
    }
    .orb1 { width:600px;height:600px; background:radial-gradient(circle,#4f46e5,#7c3aed); top:-200px; left:-150px; animation-duration:16s; }
    .orb2 { width:500px;height:500px; background:radial-gradient(circle,#0891b2,#0e7490); top:20%; right:-180px; animation-delay:-5s; animation-duration:12s; }
    .orb3 { width:450px;height:450px; background:radial-gradient(circle,#059669,#047857); bottom:-150px; left:15%; animation-delay:-9s; animation-duration:15s; }
    .orb4 { width:300px;height:300px; background:radial-gradient(circle,#db2777,#9d174d); top:55%; left:35%; animation-delay:-3s; animation-duration:10s; opacity:0.12; }
    @keyframes orbFloat {
      0%   { transform: translate(0,0) scale(1) rotate(0deg); }
      33%  { transform: translate(30px,-40px) scale(1.05) rotate(3deg); }
      66%  { transform: translate(-25px,20px) scale(0.97) rotate(-2deg); }
      100% { transform: translate(15px,-15px) scale(1.02) rotate(1deg); }
    }

    /* subtle grid */
    .lp-grid {
      position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
      background-size: 56px 56px;
      mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%);
    }

    /* floating market number particles */
    .lp-floats { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
    .flt {
      position: absolute; font-size: 11px; font-weight: 800; font-family: 'Courier New', monospace;
      opacity: 0; animation: fltRise linear infinite;
    }
    .flt-g { color: #34d399; }
    .flt-r { color: #f87171; }
    @keyframes fltRise {
      0%   { opacity: 0; transform: translateY(0) scale(0.8); }
      15%  { opacity: 0.4; transform: translateY(-20px) scale(1); }
      80%  { opacity: 0.2; }
      100% { opacity: 0; transform: translateY(-130px) scale(0.9); }
    }

    /* ── Layout ── */
    .lp-wrap { position: relative; z-index: 1; display: flex; min-height: 100vh; }

    /* ── LEFT hero panel ── */
    .lp-hero {
      flex: 1.15; display: flex; flex-direction: column; justify-content: center;
      padding: 48px 52px 48px 60px; max-width: 640px;
    }

    .lp-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 36px; }
    .lp-brand img { width: 42px; height: 42px; border-radius: 11px; box-shadow: 0 0 24px rgba(52,211,153,0.55), 0 0 8px rgba(52,211,153,0.3); animation: logoPulse 3s ease-in-out infinite; }
    @keyframes logoPulse { 0%,100%{box-shadow:0 0 24px rgba(52,211,153,0.55),0 0 8px rgba(52,211,153,0.3)} 50%{box-shadow:0 0 36px rgba(52,211,153,0.75),0 0 14px rgba(52,211,153,0.45)} }
    .lp-brand-name { font-size: 1.45rem; font-weight: 900; letter-spacing: -0.6px; }
    .lp-brand-name em { font-style: normal; color: #34d399; }
    .lp-brand-tag { font-size: 11px; color: rgba(255,255,255,0.35); font-weight: 600; margin-left: 4px; letter-spacing: 0.3px; }

    .lp-headline {
      font-size: 46px; font-weight: 900; line-height: 1.08; letter-spacing: -2px;
      margin-bottom: 14px;
    }
    .lp-headline .grad {
      background: linear-gradient(135deg, #34d399 0%, #60a5fa 45%, #a78bfa 100%);
      background-size: 300% auto;
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
      animation: gradShift 5s ease infinite;
    }
    @keyframes gradShift { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }

    .lp-sub {
      font-size: 15px; color: rgba(255,255,255,0.48); line-height: 1.65; max-width: 400px;
      margin-bottom: 38px;
    }

    @keyframes fadeUp { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }

    /* ── Feature cards ── */
    .lp-cards { display: flex; flex-direction: column; gap: 10px; }

    .lpc {
      border-radius: 16px; padding: 15px 18px;
      border: 1px solid rgba(255,255,255,0.08);
      display: flex; align-items: center; gap: 14px;
      backdrop-filter: blur(12px);
      cursor: default;
      transition: transform 0.22s cubic-bezier(.22,.68,0,1.2), border-color 0.2s, box-shadow 0.2s;
      position: relative; overflow: hidden;
    }
    .lpc::before {
      content: ''; position: absolute; inset: 0;
      background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 60%);
      pointer-events: none;
    }
    .lpc:hover { transform: translateX(8px) scale(1.01); border-color: rgba(255,255,255,0.2); box-shadow: 0 6px 28px rgba(0,0,0,0.35); }
    .lpc:nth-child(1) { background:linear-gradient(135deg,rgba(2,44,34,0.88),rgba(6,78,59,0.72)); border-color:rgba(16,185,129,0.28); }
    .lpc:nth-child(2) { background:linear-gradient(135deg,rgba(30,27,75,0.88),rgba(49,46,129,0.72)); border-color:rgba(99,102,241,0.28); }
    .lpc:nth-child(3) { background:linear-gradient(135deg,rgba(15,21,53,0.88),rgba(30,58,95,0.72)); border-color:rgba(59,130,246,0.28); }
    .lpc:nth-child(4) { background:linear-gradient(135deg,rgba(26,15,46,0.88),rgba(59,7,100,0.72)); border-color:rgba(139,92,246,0.28); }

    /* corner glow */
    .lpc::after {
      content: ''; position: absolute; top: -40px; right: -40px; width: 120px; height: 120px;
      border-radius: 50%; pointer-events: none; opacity: 0.3; transition: opacity 0.3s;
    }
    .lpc:nth-child(1)::after { background: radial-gradient(circle, #10b981, transparent 70%); }
    .lpc:nth-child(2)::after { background: radial-gradient(circle, #818cf8, transparent 70%); }
    .lpc:nth-child(3)::after { background: radial-gradient(circle, #3b82f6, transparent 70%); }
    .lpc:nth-child(4)::after { background: radial-gradient(circle, #a855f7, transparent 70%); }
    .lpc:hover::after { opacity: 0.5; }

    .lpc-icon { font-size: 2rem; flex-shrink: 0; filter: drop-shadow(0 0 8px rgba(255,255,255,0.18)); }
    .lpc-body { flex: 1; min-width: 0; }
    .lpc-title { font-size: 13.5px; font-weight: 800; color: #f1f5f9; margin-bottom: 3px; }
    .lpc-desc  { font-size: 12px; color: rgba(255,255,255,0.42); line-height: 1.45; }
    .lpc-right { flex-shrink: 0; text-align: right; }
    .lpc-val { font-size: 14px; font-weight: 900; letter-spacing: -0.3px; }
    .v-g { color: #4ade80; } .v-i { color: #a5b4fc; } .v-b { color: #93c5fd; } .v-p { color: #c4b5fd; }
    .lpc-sub { font-size: 10px; color: rgba(255,255,255,0.32); font-weight: 700; letter-spacing: 0.5px; margin-top: 2px; }

    .live-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:#818cf8; margin-right:5px; vertical-align:middle; animation:livePulse 1.5s ease-in-out infinite; }
    @keyframes livePulse { 0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(129,140,248,0.6)} 50%{opacity:0.7;box-shadow:0 0 0 6px rgba(129,140,248,0)} }

    /* ── Ticker strip ── */
    .lp-ticker {
      margin-top: 22px; overflow: hidden;
      border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;
      background: rgba(0,0,0,0.28); padding: 8px 0;
    }
    .lp-ticker-inner { display: flex; gap: 36px; white-space: nowrap; animation: tickerScroll 24s linear infinite; }
    .lp-ticker-inner:hover { animation-play-state: paused; }
    @keyframes tickerScroll { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
    .ti { display:inline-flex; align-items:center; gap:8px; font-size:11.5px; }
    .ti-n { color:rgba(255,255,255,0.5); font-weight:700; }
    .ti-p { color:#f1f5f9; font-weight:800; }
    .ti-g { color:#4ade80; font-weight:800; }
    .ti-r { color:#f87171; font-weight:800; }
    .ti-sep { color:rgba(255,255,255,0.15); }

    /* ── RIGHT auth panel ── */
    .lp-auth {
      width: 460px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
      padding: 32px 28px; position: relative;
    }
    .lp-auth::before {
      content: ''; position: absolute; left: 0; top: 8%; bottom: 8%;
      width: 1px; background: linear-gradient(to bottom, transparent, rgba(255,255,255,0.1) 40%, rgba(255,255,255,0.1) 60%, transparent);
    }

    .lp-card {
      width: 100%; max-width: 390px;
      background: rgba(15,23,42,0.72); backdrop-filter: blur(28px) saturate(1.6);
      border: 1px solid rgba(255,255,255,0.1); border-radius: 24px;
      padding: 38px 34px;
      box-shadow: 0 30px 70px rgba(0,0,0,0.55), 0 2px 0 rgba(255,255,255,0.06) inset;
      animation: cardIn 0.75s cubic-bezier(.22,.68,0,1.18) 0.15s both;
    }
    @keyframes cardIn { from{transform:translateY(20px) scale(0.98)} to{transform:none} }

    .lp-card h2 { font-size: 23px; font-weight: 900; letter-spacing: -0.5px; margin-bottom: 5px; }
    .lp-card .asub { font-size: 13.5px; color: rgba(255,255,255,0.42); margin-bottom: 24px; }

    /* error */
    .aerr { background:rgba(239,68,68,0.13); border:1px solid rgba(239,68,68,0.3); border-radius:10px; padding:10px 14px; font-size:13px; color:#fca5a5; margin-bottom:18px; }

    /* buttons */
    .btn-guest {
      display:flex; align-items:center; justify-content:center; gap:8px;
      width:100%; padding:12px 14px;
      background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1);
      border-radius:12px; color:rgba(255,255,255,0.68); font-size:13.5px; font-weight:600;
      text-decoration:none; margin-bottom:12px;
      transition:background 0.2s, border-color 0.2s, color 0.2s;
    }
    .btn-guest:hover { background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.22); color:#f1f5f9; }

    .btn-google {
      display:flex; align-items:center; justify-content:center; gap:10px;
      width:100%; padding:12px 14px;
      background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.14);
      border-radius:12px; color:#f1f5f9; font-size:14px; font-weight:600;
      text-decoration:none; margin-bottom:14px;
      transition:background 0.2s, border-color 0.2s, box-shadow 0.2s;
    }
    .btn-google:hover { background:rgba(255,255,255,0.11); border-color:rgba(255,255,255,0.24); box-shadow:0 4px 18px rgba(0,0,0,0.22); }

    /* divider */
    .adiv { display:flex; align-items:center; gap:10px; margin:12px 0; color:rgba(255,255,255,0.22); font-size:12px; }
    .adiv::before, .adiv::after { content:''; flex:1; height:1px; background:rgba(255,255,255,0.1); }

    /* form */
    .fg { margin-bottom:16px; }
    .fg label { display:block; font-size:11px; font-weight:800; color:rgba(255,255,255,0.45); letter-spacing:0.8px; text-transform:uppercase; margin-bottom:7px; }
    .fg input {
      width:100%; padding:12px 15px;
      background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
      border-radius:11px; color:#f1f5f9; font-size:14.5px; outline:none;
      transition:border-color 0.2s, background 0.2s, box-shadow 0.2s;
    }
    .fg input:focus { border-color:rgba(99,102,241,0.65); background:rgba(99,102,241,0.08); box-shadow:0 0 0 3px rgba(99,102,241,0.18); }
    .fg input::placeholder { color:rgba(255,255,255,0.18); }

    /* submit */
    .btn-signin {
      width:100%; padding:14px; margin-top:6px;
      background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);
      color:#fff; font-size:15.5px; font-weight:800; letter-spacing:-0.2px;
      border:none; border-radius:13px; cursor:pointer;
      position:relative; overflow:hidden;
      transition:transform 0.15s, box-shadow 0.15s, filter 0.15s;
      box-shadow:0 5px 22px rgba(79,70,229,0.55);
    }
    .btn-signin::after {
      content:''; position:absolute; top:0; left:-100%; width:60%; height:100%;
      background:linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent);
      animation:shimmer 2.8s ease-in-out infinite; transform:skewX(-20deg);
    }
    @keyframes shimmer { 0%{left:-100%} 60%,100%{left:160%} }
    .btn-signin:hover { transform:translateY(-2px); box-shadow:0 10px 32px rgba(79,70,229,0.7); filter:brightness(1.08); }
    .btn-signin:active { transform:translateY(1px); box-shadow:0 3px 14px rgba(79,70,229,0.4); }

    /* links */
    .aswitch { font-size:12.5px; color:rgba(255,255,255,0.38); margin-top:10px; text-align:center; }
    .aswitch a { color:#818cf8; text-decoration:none; font-weight:700; }
    .aswitch a:hover { text-decoration:underline; }

    /* perks */
    .aperks {
      margin-top:18px; padding:13px 15px;
      background:linear-gradient(135deg,rgba(16,185,129,0.06),rgba(59,130,246,0.06));
      border:1px solid rgba(255,255,255,0.07); border-radius:12px;
      font-size:12px; color:rgba(255,255,255,0.42); line-height:1.8;
    }
    .aperks strong { color:rgba(255,255,255,0.68); }

    /* ── Responsive ── */
    @media (max-width: 960px) {
      .lp-wrap { flex-direction: column; }
      .lp-hero { padding: 40px 24px 28px; max-width: 100%; }
      .lp-headline { font-size: 32px; }
      .lp-auth { width: 100%; padding: 0 20px 44px; }
      .lp-auth::before { display: none; }
    }
    @media (max-width: 480px) {
      .lp-headline { font-size: 26px; letter-spacing: -1px; }
      .lp-hero { padding: 32px 18px 20px; }
      .lp-card { padding: 28px 22px; border-radius: 20px; }
    }
  </style>
</head>
<body>
  <!-- background layers -->
  <div class="lp-bg">
    <div class="lp-orb orb1"></div><div class="lp-orb orb2"></div>
    <div class="lp-orb orb3"></div><div class="lp-orb orb4"></div>
  </div>
  <div class="lp-grid"></div>
  <div class="lp-floats" id="lpf"></div>

  <div class="lp-wrap">

    <!-- ── LEFT: hero panel ── -->
    <div class="lp-hero">
      <div class="lp-brand">
        <img src="/public/images/logo.svg" alt="ZeroScreen">
        <span class="lp-brand-name">Zero<em>Screen</em></span>
        <span class="lp-brand-tag">by Indian traders, for Indian traders</span>
      </div>

      <h1 class="lp-headline">India's sharpest<br><span class="grad">NSE trading platform.</span></h1>
      <p class="lp-sub">Screen 1,700+ stocks, track live BANKNIFTY bot signals, and practice with virtual money — all in one place. Free forever.</p>

      <div class="lp-cards">
        <div class="lpc">
          <span class="lpc-icon">📋</span>
          <div class="lpc-body">
            <div class="lpc-title">My Paper Trade</div>
            <div class="lpc-desc">₹1,00,000 virtual portfolio · Real NSE prices · Zero risk</div>
          </div>
          <div class="lpc-right">
            <div class="lpc-val v-g">+₹4,320</div>
            <div class="lpc-sub">TODAY'S P&amp;L</div>
          </div>
        </div>
        <div class="lpc">
          <span class="lpc-icon">🤖</span>
          <div class="lpc-body">
            <div class="lpc-title">Live Bot Signals</div>
            <div class="lpc-desc"><span class="live-dot"></span>BANKNIFTY CE/PE · AI confidence score · 8s refresh</div>
          </div>
          <div class="lpc-right">
            <div class="lpc-val v-i">● LIVE</div>
            <div class="lpc-sub">CE 48200</div>
          </div>
        </div>
        <div class="lpc">
          <span class="lpc-icon">🔍</span>
          <div class="lpc-body">
            <div class="lpc-title">NSE Screener</div>
            <div class="lpc-desc">1,700+ stocks · 14 strategies · ROCE, D/E, momentum &amp; more</div>
          </div>
          <div class="lpc-right">
            <div class="lpc-val v-b">142</div>
            <div class="lpc-sub">STOCKS TODAY</div>
          </div>
        </div>
        <div class="lpc">
          <span class="lpc-icon">📈</span>
          <div class="lpc-body">
            <div class="lpc-title">Backtest Engine</div>
            <div class="lpc-desc">5-year BANKNIFTY historical data · Full PnL analytics</div>
          </div>
          <div class="lpc-right">
            <div class="lpc-val v-p">68.4%</div>
            <div class="lpc-sub">WIN RATE</div>
          </div>
        </div>
      </div>

      <!-- live ticker strip -->
      <div class="lp-ticker">
        <div class="lp-ticker-inner">
          <span class="ti"><span class="ti-n">RELIANCE</span><span class="ti-p">₹2,891</span><span class="ti-g">▲ +1.23%</span></span><span class="ti-sep">·</span>
          <span class="ti"><span class="ti-n">BANKNIFTY</span><span class="ti-p">₹48,210</span><span class="ti-g">▲ +0.87%</span></span><span class="ti-sep">·</span>
          <span class="ti"><span class="ti-n">TCS</span><span class="ti-p">₹3,542</span><span class="ti-r">▼ −0.45%</span></span><span class="ti-sep">·</span>
          <span class="ti"><span class="ti-n">HDFC</span><span class="ti-p">₹1,742</span><span class="ti-g">▲ +2.14%</span></span><span class="ti-sep">·</span>
          <span class="ti"><span class="ti-n">INFY</span><span class="ti-p">₹1,482</span><span class="ti-r">▼ −1.02%</span></span><span class="ti-sep">·</span>
          <span class="ti"><span class="ti-n">ICICIBANK</span><span class="ti-p">₹1,124</span><span class="ti-g">▲ +0.68%</span></span><span class="ti-sep">·</span>
          <span class="ti"><span class="ti-n">SBIN</span><span class="ti-p">₹812</span><span class="ti-g">▲ +1.55%</span></span><span class="ti-sep">·</span>
          <span class="ti"><span class="ti-n">BAJFINANCE</span><span class="ti-p">₹7,224</span><span class="ti-r">▼ −0.28%</span></span><span class="ti-sep">·</span>
          <!-- duplicate for seamless loop -->
          <span class="ti"><span class="ti-n">RELIANCE</span><span class="ti-p">₹2,891</span><span class="ti-g">▲ +1.23%</span></span><span class="ti-sep">·</span>
          <span class="ti"><span class="ti-n">BANKNIFTY</span><span class="ti-p">₹48,210</span><span class="ti-g">▲ +0.87%</span></span><span class="ti-sep">·</span>
          <span class="ti"><span class="ti-n">TCS</span><span class="ti-p">₹3,542</span><span class="ti-r">▼ −0.45%</span></span><span class="ti-sep">·</span>
          <span class="ti"><span class="ti-n">HDFC</span><span class="ti-p">₹1,742</span><span class="ti-g">▲ +2.14%</span></span><span class="ti-sep">·</span>
          <span class="ti"><span class="ti-n">INFY</span><span class="ti-p">₹1,482</span><span class="ti-r">▼ −1.02%</span></span><span class="ti-sep">·</span>
          <span class="ti"><span class="ti-n">ICICIBANK</span><span class="ti-p">₹1,124</span><span class="ti-g">▲ +0.68%</span></span><span class="ti-sep">·</span>
          <span class="ti"><span class="ti-n">SBIN</span><span class="ti-p">₹812</span><span class="ti-g">▲ +1.55%</span></span><span class="ti-sep">·</span>
          <span class="ti"><span class="ti-n">BAJFINANCE</span><span class="ti-p">₹7,224</span><span class="ti-r">▼ −0.28%</span></span>
        </div>
      </div>
    </div><!-- /lp-hero -->

    <!-- ── RIGHT: auth panel ── -->
    <div class="lp-auth">
      <div class="lp-card">
        <h2>Welcome back 👋</h2>
        <p class="asub">Sign in to access your portfolio &amp; alerts</p>
        ${error ? `<div class="aerr">⚠️ ${esc(error)}</div>` : ""}
        <a href="/?guest=1" class="btn-guest">👀 Continue as Guest &nbsp;·&nbsp; Browse freely</a>
        <div class="adiv"><span>or sign in for full access</span></div>
        ${googleBtn}
        <form method="POST" action="/login">
          <input type="hidden" name="next" value="${esc(next) || "/"}">
          <div class="fg">
            <label>Email address</label>
            <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
          </div>
          <div class="fg">
            <label>Password</label>
            <input type="password" name="password" placeholder="••••••••" required autocomplete="current-password">
          </div>
          <button type="submit" class="btn-signin">Sign In →</button>
        </form>
        <p class="aswitch"><a href="/forgot-password">Forgot password?</a></p>
        <p class="aswitch">New here? <a href="/signup">Create a free account →</a></p>
        <div class="aperks">
          🔒 <strong>Signing in unlocks:</strong><br>
          📋 Personal paper trade portfolio &nbsp;·&nbsp; ⭐ Saved watchlists<br>
          🔔 Email alerts on custom filters &nbsp;·&nbsp; 📊 Full bot analytics
        </div>
      </div>
    </div>
  </div>

  <script>
  // floating number particles
  (function(){
    var v=['+1.2%','₹2,890','+0.8%','CE 48k','−0.5%','₹1,740','+2.1%','68.4%','1:2.4','−1.0%','PE 47k','₹812','LONG','SHORT','+142p','BUY','ATM','NIFTY'];
    var c=document.getElementById('lpf');
    if(!c)return;
    function spawn(){
      var el=document.createElement('div');
      el.className='flt '+(Math.random()>.5?'flt-g':'flt-r');
      el.textContent=v[Math.floor(Math.random()*v.length)];
      el.style.left=(Math.random()*95)+'%';
      el.style.top=(40+Math.random()*55)+'%';
      var d=5+Math.random()*5;
      el.style.animationDuration=d+'s';
      el.style.animationDelay=(Math.random()*1.5)+'s';
      c.appendChild(el);
      setTimeout(function(){el.remove();},(d+2)*1000);
    }
    for(var i=0;i<14;i++)setTimeout(spawn,i*350);
    setInterval(spawn,650);
  })();
  </script>
</body>
</html>`);
});

// POST /login
app.post("/login", async (req: Request, res: Response) => {
  const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  if (!checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
    res.redirect("/login?error=Too+many+attempts.+Please+wait+15+minutes."); return;
  }
  const { email, password, next } = req.body;
  if (!email || !password) {
    res.redirect("/login?error=Email+and+password+are+required"); return;
  }
  const user = await getUserByEmail(email);
  if (!user) {
    res.redirect("/login?error=Invalid+email+or+password"); return;
  }
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    res.redirect("/login?error=Invalid+email+or+password"); return;
  }
  req.session.userId = user.id;
  req.session.userName = user.name;
  req.session.userRole = user.role;
  const redirectTo = (next && next.startsWith("/") && !next.startsWith("//")) ? next : "/";
  res.redirect(redirectTo);
});

// GET /logout
app.get("/logout", (req: Request, res: Response) => {
  req.session.destroy(err => {
    res.clearCookie("connect.sid", { path: "/" });
    res.redirect("/login");
  });
});

// ── Google OAuth ───────────────────────────────────────────────────────────────
app.get("/auth/google", (req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID) {
    res.redirect("/login?error=Google+Sign-In+is+not+configured+yet"); return;
  }
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id",     GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri",  GOOGLE_CALLBACK_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope",         "openid email profile");
  url.searchParams.set("state",         state);
  url.searchParams.set("prompt",        "select_account");
  res.redirect(url.toString());
});

app.get("/auth/google/callback", async (req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    res.redirect("/login?error=Google+Sign-In+not+configured"); return;
  }
  const { code, state, error: oauthErr } = req.query;
  if (oauthErr)                            { res.redirect("/login?error=Google+sign-in+cancelled"); return; }
  if (!code || state !== req.session.oauthState) { res.redirect("/login?error=OAuth+state+mismatch"); return; }
  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        code:          code as string,
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri:  GOOGLE_CALLBACK_URL,
        grant_type:    "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) throw new Error("No access token from Google");

    // Get Google user info
    const infoRes  = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const gUser = await infoRes.json() as { id: string; email: string; name: string; picture?: string };

    // Find or create local user
    let user = await getUserByEmail(gUser.email);
    if (!user) {
      const userCount = await countUsers();
      const id = await createUser(gUser.name || gUser.email.split("@")[0], gUser.email, "");
      const isAdminEmail = ADMIN_EMAIL && gUser.email.toLowerCase() === ADMIN_EMAIL;
      const role = (userCount === 0 || isAdminEmail) ? "admin" : "user";
      await dbRun("UPDATE users SET google_id=?, avatar_url=?, role=? WHERE id=?", [gUser.id, gUser.picture || "", role, id]);
      user = await getUserById(id);
      // Grant ₹1L virtual paper trade balance to new Google users
      await initPaperPortfolio(id);
      await getOrCreateReferralCode(id);
      if (req.session.pendingReferral) {
        await applyReferral(id, req.session.pendingReferral).catch(() => {});
        delete req.session.pendingReferral;
      }
      getSetting("notify_user_signup").then(v => {
        if (v !== "false") notifyTelegram(`🆕 New ZeroScreen signup via Google!\nName: ${gUser.name}\nEmail: ${gUser.email}`);
      }).catch(() => {});
    } else {
      // Update google_id if not set
      await dbRun("UPDATE users SET google_id=COALESCE(google_id,?), avatar_url=COALESCE(avatar_url,?) WHERE id=?",
        [gUser.id, gUser.picture || "", user.id]);
    }
    if (!user) throw new Error("User not found after create");
    req.session.userId   = user.id;
    req.session.userName = user.name;
    req.session.userRole = user.role;
    res.redirect("/");
  } catch {
    res.redirect("/login?error=Google+sign-in+failed.+Please+try+again");
  }
});

// ── Forgot / Reset password ────────────────────────────────────────────────────
app.get("/forgot-password", (req: Request, res: Response) => {
  if (req.session.userId) { res.redirect("/"); return; }
  const sent = req.query.sent === "1";
  const error = req.query.error as string | undefined;
  res.send(authLayout("Forgot Password", `
    <h2>Reset your password</h2>
    <p class="auth-sub">Enter your email and we'll send a reset link.</p>
    ${sent ? '<div class="auth-success">✅ If that email exists, a reset link has been sent.</div>' : ""}
    ${error ? `<div class="auth-error">${esc(error)}</div>` : ""}
    <form class="auth-form" method="POST" action="/forgot-password">
      <div class="form-group">
        <label>Email address</label>
        <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
      </div>
      <button type="submit" class="btn-auth">Send Reset Link →</button>
    </form>
    <p class="auth-switch"><a href="/login">← Back to Sign In</a></p>
  `));
});

app.post("/forgot-password", async (req: Request, res: Response) => {
  const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  if (!checkRateLimit(`forgot:${ip}`, 5, 60 * 60 * 1000)) {
    res.redirect("/forgot-password?sent=1"); return; // silently swallow — don't reveal rate limit
  }
  const { email } = req.body;
  if (!email) { res.redirect("/forgot-password?error=Email+is+required"); return; }
  const user = await getUserByEmail(email.trim().toLowerCase());
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    await createResetToken(user.id, token);
    const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
    const resetUrl = `${APP_URL}/reset-password/${token}`;
    sendPasswordResetEmail(user.email, user.name, resetUrl).catch(() => {});
  }
  // Always show same message to prevent email enumeration
  res.redirect("/forgot-password?sent=1");
});

app.get("/reset-password/:token", async (req: Request, res: Response) => {
  if (req.session.userId) { res.redirect("/"); return; }
  const record = await getResetToken(req.params.token);
  const expired = !record || record.used === 1 || new Date(record.expires_at) < new Date();
  if (expired) {
    res.send(authLayout("Link Expired", `
      <h2>Link expired or invalid</h2>
      <p class="auth-sub">This reset link has already been used or expired.</p>
      <a href="/forgot-password" class="btn-auth" style="text-align:center;display:block">Request a new link →</a>
    `));
    return;
  }
  const error = req.query.error as string | undefined;
  res.send(authLayout("Set New Password", `
    <h2>Set a new password</h2>
    <p class="auth-sub">Choose a strong password for your account.</p>
    ${error ? `<div class="auth-error">${esc(error)}</div>` : ""}
    <form class="auth-form" method="POST" action="/reset-password/${req.params.token}">
      <div class="form-group">
        <label>New Password <span class="hint">(min 8 chars)</span></label>
        <input type="password" name="password" placeholder="••••••••" minlength="8" required autocomplete="new-password">
      </div>
      <div class="form-group">
        <label>Confirm Password</label>
        <input type="password" name="confirm" placeholder="••••••••" minlength="8" required autocomplete="new-password">
      </div>
      <button type="submit" class="btn-auth">Set Password →</button>
    </form>
  `));
});

app.post("/reset-password/:token", async (req: Request, res: Response) => {
  const { password, confirm } = req.body;
  const record = await getResetToken(req.params.token);
  const expired = !record || record.used === 1 || new Date(record.expires_at) < new Date();
  if (expired) { res.redirect("/forgot-password?error=Link+expired+please+request+again"); return; }
  if (!password || password.length < 8) {
    res.redirect(`/reset-password/${req.params.token}?error=Password+must+be+at+least+8+characters`); return;
  }
  if (password !== confirm) {
    res.redirect(`/reset-password/${req.params.token}?error=Passwords+do+not+match`); return;
  }
  const hash = await bcrypt.hash(password, 12);
  await updateUserPassword(record.user_id, hash);
  await markResetTokenUsed(req.params.token);
  res.redirect("/login?success=Password+updated+successfully+please+sign+in");
});

// ── Profile page ───────────────────────────────────────────────────────────────
app.get("/profile", requireAuth, async (req: Request, res: Response) => {
  const user = await getUserById(req.session.userId!);
  if (!user) { res.redirect("/login"); return; }
  const success = req.query.success as string | undefined;
  const error   = req.query.error   as string | undefined;
  const [portfolio, tradeStats] = await Promise.all([
    getPaperPortfolio(req.session.userId!),
    getPaperTradeStats(req.session.userId!),
  ]);
  const tradeCount = tradeStats.total;
  const notifyPicks = (user as any).notify_picks ?? 1;
  const telegramChatId = (user as any).telegram_chat_id || "";
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Profile — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("profile", req)}
  <div class="container" style="max-width:620px">
    <div class="page-header">
      <h1>👤 My Profile</h1>
    </div>
    ${success ? `<div class="auth-success" style="margin-bottom:18px">✅ ${esc(success)}</div>` : ""}
    ${error   ? `<div class="auth-error"   style="margin-bottom:18px">⚠️ ${esc(error)}</div>` : ""}

    <!-- Change name -->
    <div class="profile-card">
      <h2>Display Name</h2>
      <form method="POST" action="/profile/name" class="auth-form">
        <div class="form-group">
          <label>Full Name</label>
          <input type="text" name="name" value="${user.name.replace(/"/g, "&quot;")}" required minlength="2" maxlength="80" autocomplete="name">
        </div>
        <button type="submit" class="btn-primary">Update Name</button>
      </form>
    </div>

    <!-- Change password -->
    <div class="profile-card">
      <h2>Change Password</h2>
      <form method="POST" action="/profile/password" class="auth-form">
        <div class="form-group">
          <label>Current Password</label>
          <input type="password" name="current" placeholder="••••••••" required autocomplete="current-password">
        </div>
        <div class="form-group">
          <label>New Password <span class="hint">(min 8 chars)</span></label>
          <input type="password" name="password" placeholder="••••••••" minlength="8" required autocomplete="new-password">
        </div>
        <div class="form-group">
          <label>Confirm New Password</label>
          <input type="password" name="confirm" placeholder="••••••••" minlength="8" required autocomplete="new-password">
        </div>
        <button type="submit" class="btn-primary">Change Password</button>
      </form>
    </div>

    <!-- Account info -->
    <div class="profile-card profile-info">
      <div class="profile-info-row"><span>Email</span><strong>${user.email}</strong></div>
      <div class="profile-info-row"><span>Role</span><span class="role-badge role-${user.role}">${user.role}</span></div>
      <div class="profile-info-row"><span>Member since</span><strong>${new Date(user.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</strong></div>
    </div>

    <!-- Paper Trade Stats -->
    <div class="profile-card">
      <h2>💰 Paper Trading</h2>
      <div class="profile-info">
        <div class="profile-info-row">
          <span>Virtual Balance</span>
          <strong style="font-size:1.1rem;color:${portfolio.balance >= 100000 ? '#10b981' : '#ef4444'}">₹${portfolio.balance.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</strong>
        </div>
        <div class="profile-info-row">
          <span>Total Trades</span>
          <strong>${tradeCount}</strong>
        </div>
        ${tradeStats.wins + tradeStats.losses > 0 ? `
        <div class="profile-info-row">
          <span>Win Rate</span>
          <strong style="color:${tradeStats.winRate >= 50 ? '#10b981' : '#f59e0b'}">${tradeStats.winRate}% <span style="font-size:.78rem;font-weight:400;color:var(--text-muted)">(${tradeStats.wins}W / ${tradeStats.losses}L)</span></strong>
        </div>` : ""}
        <div class="profile-info-row">
          <span>Starting Capital</span>
          <strong>₹1,00,000</strong>
        </div>
        <div class="profile-info-row">
          <span>Net Return</span>
          <strong style="color:${portfolio.balance >= 100000 ? '#10b981' : '#ef4444'}">
            ${portfolio.balance >= 100000 ? '+' : ''}₹${(portfolio.balance - 100000).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            (${(((portfolio.balance - 100000) / 100000) * 100).toFixed(2)}%)
          </strong>
        </div>
      </div>
      <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
        <a href="/my-paper-trade" class="btn-primary" style="font-size:.82rem;padding:7px 14px">Open Portfolio →</a>
        <a href="/my-paper-trade/export" class="btn-secondary" style="font-size:.82rem;padding:7px 14px">⬇ Export CSV</a>
      </div>
    </div>

    <!-- Notification Preferences -->
    <div class="profile-card">
      <h2>🔔 Notifications</h2>
      <form method="POST" action="/profile/preferences" class="auth-form">
        <label class="form-checkbox" style="margin-bottom:0">
          <input type="checkbox" name="notify_picks" value="1" ${notifyPicks ? "checked" : ""}>
          <span>📬 Email me Today's Picks daily</span>
        </label>
        <p style="font-size:.75rem;color:var(--text-muted);margin:.5rem 0 1rem .5rem">Receive a summary of the day's stock picks from the admin in your inbox.</p>
        <button type="submit" class="btn-primary">Save Preferences</button>
      </form>
    </div>

    <!-- Telegram (Premium) -->
    <div class="profile-card">
      <h2>📱 Telegram Alerts <span class="role-badge role-premium" style="font-size:.65rem;vertical-align:middle">Premium</span></h2>
      ${userIsPremium(req) ? `
      <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:1rem">Get instant Telegram alerts when the BANKNIFTY bot enters or exits a trade.</p>
      <ol style="font-size:.82rem;color:var(--text-muted);line-height:1.8;margin:0 0 1rem 1.2rem">
        <li>Open Telegram and search for <strong>@ZeroScreenBot</strong></li>
        <li>Send the command <code style="background:var(--bg3);padding:1px 5px;border-radius:3px">/start</code> to get your Chat ID</li>
        <li>Paste your Chat ID below and save</li>
      </ol>
      <form method="POST" action="/profile/telegram" class="auth-form">
        <div class="form-group">
          <label>Your Telegram Chat ID</label>
          <input type="text" name="chat_id" value="${esc(telegramChatId)}" placeholder="e.g. 123456789" maxlength="30" autocomplete="off">
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button type="submit" class="btn-primary">Save Telegram ID</button>
          ${telegramChatId ? `<button type="submit" name="chat_id" value="" class="btn-secondary" onclick="return confirm('Remove Telegram connection?')">Disconnect</button>` : ""}
        </div>
      </form>
      ${telegramChatId ? `<div class="auth-success" style="margin-top:12px">✅ Telegram connected — Chat ID: <strong>${esc(telegramChatId)}</strong></div>` : ""}
      ` : `
      <p style="font-size:.82rem;color:var(--text-muted)">Telegram signal alerts are available for <strong>Premium</strong> members.</p>
      <a href="/premium" class="btn-primary" style="display:inline-block;margin-top:10px">⚡ Upgrade to Premium →</a>
      `}
    </div>
  </div>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

app.post("/profile/name", requireAuth, async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || name.trim().length < 2) {
    res.redirect("/profile?error=Name+must+be+at+least+2+characters"); return;
  }
  await updateUserName(req.session.userId!, name.trim().substring(0, 80));
  req.session.userName = name.trim();
  res.redirect("/profile?success=Name+updated+successfully");
});

app.post("/profile/password", requireAuth, async (req: Request, res: Response) => {
  const { current, password, confirm } = req.body;
  const user = await getUserById(req.session.userId!);
  if (!user) { res.redirect("/login"); return; }
  const match = await bcrypt.compare(current, user.password);
  if (!match) { res.redirect("/profile?error=Current+password+is+incorrect"); return; }
  if (!password || password.length < 8) { res.redirect("/profile?error=New+password+must+be+at+least+8+characters"); return; }
  if (password !== confirm) { res.redirect("/profile?error=Passwords+do+not+match"); return; }
  const hash = await bcrypt.hash(password, 12);
  await updateUserPassword(req.session.userId!, hash);
  res.redirect("/profile?success=Password+changed+successfully");
});

app.post("/profile/preferences", requireAuth, async (req: Request, res: Response) => {
  const notifyPicks = req.body.notify_picks === "1" ? 1 : 0;
  await updateUserNotifyPicks(req.session.userId!, notifyPicks);
  res.redirect("/profile?success=Preferences+saved");
});

app.post("/profile/telegram", requireAuth, async (req: Request, res: Response) => {
  if (!userIsPremium(req as any)) { res.redirect("/profile"); return; }
  const chatId = (req.body.chat_id || "").trim().replace(/[^0-9\-]/g, "").substring(0, 20);
  await setTelegramChatId(req.session.userId!, chatId);
  const msg = chatId ? "Telegram+connected" : "Telegram+disconnected";
  res.redirect("/profile?success=" + msg);
});

// ── GET /verify-mobile ─────────────────────────────────────────────────────────
app.get("/verify-mobile", requireAuth, (req: Request, res: Response) => {
  const mobile = esc(req.query.mobile as string || "");
  const sent   = req.query.sent === "1";
  const err    = esc(req.query.err as string || "");
  const next   = esc(req.query.next as string || "/my-paper-trade");
  res.send(`<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Verify Mobile — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .vm-card{max-width:420px;margin:60px auto;background:var(--card-bg);border:1px solid var(--border);border-radius:16px;padding:32px 36px}
    .vm-title{font-size:1.4rem;font-weight:800;margin-bottom:6px}
    .vm-sub{color:var(--text-muted);font-size:0.88rem;margin-bottom:24px}
    .vm-label{font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:5px}
    .vm-input{width:100%;padding:10px 14px;background:var(--input-bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:1rem;box-sizing:border-box}
    .vm-btn{width:100%;padding:11px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:700;cursor:pointer;margin-top:12px}
    .vm-btn:hover{opacity:.88}
    .vm-err{background:#ef444422;color:#ef4444;border:1px solid #ef444455;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:0.88rem}
    .vm-ok{background:#10b98122;color:#10b981;border:1px solid #10b98155;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:0.88rem}
    .vm-note{font-size:0.78rem;color:var(--text-muted);margin-top:14px;text-align:center}
  </style>
</head><body>${nav("", req)}
<div class="container">
  <div class="vm-card">
    <div class="vm-title">📱 Verify Mobile Number</div>
    <div class="vm-sub">Required once before you can paper trade. We'll send a 6-digit OTP.</div>
    ${err ? `<div class="vm-err">❌ ${err}</div>` : ""}
    ${sent ? `<div class="vm-ok">✅ OTP sent to +91 ${mobile}. Enter it below.</div>` : ""}
    ${!sent ? `
    <form method="POST" action="/verify-mobile/send">
      <input type="hidden" name="next" value="${next}">
      <label class="vm-label">Mobile Number (India)</label>
      <input class="vm-input" type="tel" name="mobile" placeholder="10-digit mobile number" maxlength="10" pattern="[0-9]{10}" required>
      <button class="vm-btn">Send OTP →</button>
    </form>` : `
    <form method="POST" action="/verify-mobile/confirm">
      <input type="hidden" name="mobile" value="${mobile}">
      <input type="hidden" name="next" value="${next}">
      <label class="vm-label">Enter 6-digit OTP</label>
      <input class="vm-input" type="text" name="otp" placeholder="123456" maxlength="6" pattern="[0-9]{6}" required autocomplete="one-time-code">
      <button class="vm-btn">Verify & Continue →</button>
    </form>
    <div class="vm-note"><a href="/verify-mobile">Resend OTP</a></div>`}
  </div>
</div>
<script src="/public/js/app.js"></script></body></html>`);
});

// POST /verify-mobile/send — generate & send OTP
app.post("/verify-mobile/send", requireAuth, async (req: Request, res: Response) => {
  const raw    = ((req.body.mobile as string) || "").replace(/\D/g, "");
  const mobile = raw.slice(-10);
  const next   = ((req.body.next as string) || "/my-paper-trade").replace(/[^a-zA-Z0-9/?=&_\-]/g, "");
  if (mobile.length !== 10) {
    res.redirect(`/verify-mobile?err=${encodeURIComponent("Please enter a valid 10-digit mobile number")}&next=${encodeURIComponent(next)}`); return;
  }
  const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "x").split(",")[0].trim();
  if (!checkRateLimit(`otp:${ip}:${mobile}`, 3, 60 * 60 * 1000)) {
    res.redirect(`/verify-mobile?err=${encodeURIComponent("Too many OTP requests. Please wait an hour.")}&next=${encodeURIComponent(next)}`); return;
  }
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  await storePhoneOtp(mobile, otp);
  const sent = await sendSmsOtp(mobile, otp);
  if (!sent) {
    res.redirect(`/verify-mobile?err=${encodeURIComponent("Failed to send OTP. Please try again.")}&next=${encodeURIComponent(next)}`); return;
  }
  res.redirect(`/verify-mobile?mobile=${mobile}&sent=1&next=${encodeURIComponent(next)}`);
});

// POST /verify-mobile/confirm — verify OTP
app.post("/verify-mobile/confirm", requireAuth, async (req: Request, res: Response) => {
  const mobile = ((req.body.mobile as string) || "").replace(/\D/g, "").slice(-10);
  const otp    = ((req.body.otp as string) || "").trim();
  const next   = ((req.body.next as string) || "/my-paper-trade").replace(/[^a-zA-Z0-9/?=&_\-]/g, "");
  if (mobile.length !== 10 || !/^\d{6}$/.test(otp)) {
    res.redirect(`/verify-mobile?mobile=${mobile}&sent=1&err=${encodeURIComponent("Invalid input")}&next=${encodeURIComponent(next)}`); return;
  }
  const ok = await verifyPhoneOtp(mobile, otp);
  if (!ok) {
    res.redirect(`/verify-mobile?mobile=${mobile}&sent=1&err=${encodeURIComponent("Invalid or expired OTP. Please try again.")}&next=${encodeURIComponent(next)}`); return;
  }
  // Block if this mobile is already verified on a DIFFERENT account
  const existingUser = await getUserByMobile(mobile);
  if (existingUser && existingUser.id !== req.session.userId) {
    res.redirect(`/verify-mobile?err=${encodeURIComponent("This mobile number is already linked to another account.")}&next=${encodeURIComponent(next)}`); return;
  }
  await setUserMobile(req.session.userId!, mobile);
  req.session.mobileVerified = true;
  res.redirect(next + (next.includes("?") ? "&" : "?") + "msg=" + encodeURIComponent("Mobile verified! You can now paper trade."));
});

// ── GET / — Screener ───────────────────────────────────────────────────────────
app.get("/", async (req: Request, res: Response) => {
  // Redirect unauthenticated non-guest users to login
  if (!req.session?.userId) {
    if (req.query.guest === "1") {
      req.session.guestMode = true; // persist guest choice
    } else if (!req.session?.guestMode) {
      res.redirect("/login"); return;
    }
  }
  const PAGE_SIZE = 50;
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const f: ScreenerFilter = {
    minRoce:          req.query.minRoce     ? parseFloat(req.query.minRoce as string)     : undefined,
    maxRoce:          req.query.maxRoce     ? parseFloat(req.query.maxRoce as string)     : undefined,
    maxDe:            req.query.maxDe       ? parseFloat(req.query.maxDe as string)       : undefined,
    minPromoter:      req.query.minPromoter ? parseFloat(req.query.minPromoter as string) : undefined,
    maxPe:            req.query.maxPe       ? parseFloat(req.query.maxPe as string)       : undefined,
    minPe:            req.query.minPe       ? parseFloat(req.query.minPe as string)       : undefined,
    minPrice:         req.query.minPrice    ? parseFloat(req.query.minPrice as string)    : undefined,
    maxPrice:         req.query.maxPrice    ? parseFloat(req.query.maxPrice as string)    : undefined,
    minVolume:        req.query.minVolume   ? parseInt(req.query.minVolume as string, 10) : undefined,
    minMarketCap:     req.query.minMc       ? parseFloat(req.query.minMc as string)       : undefined,
    maxMarketCap:     req.query.maxMc       ? parseFloat(req.query.maxMc as string)       : undefined,
    minDividendYield: req.query.minDivYield ? parseFloat(req.query.minDivYield as string) : undefined,
    // Indicator filters
    minRoe:          req.query.minRoe         ? parseFloat(req.query.minRoe as string)         : undefined,
    minEps:          req.query.minEps         ? parseFloat(req.query.minEps as string)         : undefined,
    minCurrentRatio: req.query.minCr          ? parseFloat(req.query.minCr as string)          : undefined,
    maxPbRatio:      req.query.maxPb          ? parseFloat(req.query.maxPb as string)          : undefined,
    minChangePct:    req.query.minChg         ? parseFloat(req.query.minChg as string)         : undefined,
    maxChangePct:    req.query.maxChg         ? parseFloat(req.query.maxChg as string)         : undefined,
    near52High:      req.query.near52H        ? parseFloat(req.query.near52H as string)        : undefined,
    near52Low:       req.query.near52L        ? parseFloat(req.query.near52L as string)        : undefined,
    allProfitable:    req.query.allProfit === "1",
    profitUptrend:    req.query.uptrend  === "1",
    sector:           req.query.sector      ? req.query.sector as string                  : undefined,
    sortBy:           (req.query.sortBy as string) || "roce",
    sortDir:          (req.query.sortDir as "asc" | "desc") || "desc",
    limit:            PAGE_SIZE + 1,
    offset,
  };

  // ── In-News filter: extract NSE symbols from news headlines ──────────────
  if (req.query.inNews === "1") {
    const newsItems = await fetchMarketNews();
    // Extract only from titles (not links which have CDATA/URL garbage)
    const rawWords = newsItems.flatMap(n =>
      (n.title || '').match(/\b([A-Z]{3,10})\b/g) || []
    );
    const skipWords = new Set([
      "NSE","BSE","IPO","FII","DII","GDP","RBI","SEBI","FY","Q1","Q2","Q3","Q4",
      "CEO","CFO","MD","AGM","EGM","USA","UAE","IRAN","GOLD","MINT","CDATA",
      "HTTP","HTTPS","COM","WWW","HTML","RSS","XML","API","USD","INR",
      "MARKET","STOCK","STOCKS","SHARE","SHARES","INDIA","NIFTY","SENSEX",
      "BANK","RATE","YEAR","WEEKLY","DAILY","TRADE","TRADING","JUNE",
      "JULY","AUG","SEP","OCT","NOV","DEC","JAN","FEB","MAR","APR","MAY",
    ]);
    const candidates = [...new Set(rawWords.filter(w => !skipWords.has(w)))];
    if (candidates.length > 0) {
      f.symbolsIn = candidates.slice(0, 60);
    } else {
      // Fallback: show top movers if no stock symbols found in news
      f.minChangePct = 0.5;
    }
  }

  const FILTER_KEYS = ['minRoce','maxRoce','maxDe','minPromoter','maxPromoter','minPe','maxPe','minPrice','maxPrice','minVolume','minMc','maxMc','minDivYield','allProfit','uptrend','sector','strategy','minRoe','minEps','minCr','maxPb','minChg','maxChg','near52H','near52L','inNews'];
  const hasFilters = FILTER_KEYS.some(k => req.query[k] && req.query[k] !== '');
  // Only expand the filter panel when the user has MANUALLY set filters (not from a strategy click)
  const openFilters = !req.query.strategy && FILTER_KEYS.filter(k => k !== 'strategy').some(k => req.query[k] && req.query[k] !== '');
  const filterCount = FILTER_KEYS.filter(k => k !== 'strategy' && req.query[k] && req.query[k] !== '').length;
  const rawStocks = await screenStocks(f);
  const hasNextPage = rawStocks.length > PAGE_SIZE;
  const stocks = hasNextPage ? rawStocks.slice(0, PAGE_SIZE) : rawStocks;
  const sectors = await getSectors();
  const todayPicks = await getActivePicks();
  const topGainers = await dbAll<{ symbol: string; company_name: string | null; price: number | null; change_pct: number | null }>(
    `SELECT s.symbol, s.company_name, p.price, p.change_pct
     FROM stocks s JOIN prices p ON p.symbol=s.symbol
     WHERE p.change_pct IS NOT NULL AND p.price IS NOT NULL AND p.change_pct > 0
     ORDER BY p.change_pct DESC LIMIT 6`
  );
  const activeStrategy = req.query.strategy as string | undefined;
  const dbStats = await getDbStats();
  const priceAsOf = dbStats.lastPriceUpdate
    ? new Date(dbStats.lastPriceUpdate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
    : null;

  // Build pagination query string (preserve all filters, change page)
  const paginationQ = new URLSearchParams(req.query as any);
  const prevPageQ = new URLSearchParams(paginationQ); prevPageQ.set("page", String(page - 1));
  const nextPageQ = new URLSearchParams(paginationQ); nextPageQ.set("page", String(page + 1));

  const rows = stocks.map(s => {
    const chgPill = s.change_pct != null
      ? `<span class="${s.change_pct >= 0 ? "pill-up" : "pill-dn"}">${s.change_pct >= 0 ? "+" : ""}${fmt(s.change_pct, 2)}%</span>`
      : "—";
    const roceClass = s.roce >= 20 ? "roce-hi" : s.roce >= 10 ? "roce-md" : "roce-lo";
    const deStr = s.de_ratio === 0
      ? `<span class="badge-debtfree">💎 Debt-free</span>`
      : `<span style="color:${deColor(s.de_ratio)}">${fmt(s.de_ratio)}</span>`;
    const cleanSector = (s.sector && s.sector.length >= 3 && !/^\[?\d+\]?$/.test(s.sector) && !/edit|about/i.test(s.sector))
      ? s.sector : null;
    void cleanSector; // kept for potential future use
    return `
    <tr>
      <td class="cmp-check-cell"><input type="checkbox" class="cmp-check" value="${s.symbol}" onchange="updateCompare()"></td>
      <td><a href="/stock/${s.symbol}" class="sym-link">${s.symbol}</a></td>
      <td class="company-name" title="${(s.company_name || "").replace(/"/g, "&quot;")}">${s.company_name || "—"}</td>
      <td class="td-price">₹${fmt(s.price, 2)}</td>
      <td>${chgPill}</td>
      <td>${fmtVol(s.volume)}</td>
      <td class="${roceClass}">${fmt(s.roce)}%</td>
      <td>${fmt(s.roe)}%</td>
      <td>${deStr}</td>
      <td>${fmt(s.promoter_pct)}%</td>
      <td>${fmt(s.pe_ratio, 1)}</td>
      <td>${s.all_profitable ? "✅" : "❌"} ${s.profit_uptrend ? "↑" : "↓"}</td>
    </tr>`;
  }).join("");

  const sectorOptions = sectors.map(s =>
    `<option value="${s}" ${f.sector === s ? "selected" : ""}>${s}</option>`
  ).join("");

  const sortOptions = [
    ["roce","ROCE %"], ["roe","ROE %"], ["de","D/E Ratio"], ["promoter","Promoter %"],
    ["pe","P/E Ratio"], ["price","Price"], ["volume","Volume"],
    ["market_cap","Market Cap"], ["change_pct","Change %"], ["dividend","Dividend Yield"],
    ["eps","EPS"], ["book_value","Book Value"], ["current_ratio","Current Ratio"],
  ];

  const q = req.query;

  const strategyCards = STRATEGIES.map(s => `
    <a href="/?strategy=${s.id}&${strategyParams(s)}" class="strategy-card s-${s.id} ${activeStrategy === s.id ? "active" : ""}" title="${s.desc}">
      <span class="s-flag">🇮🇳</span>
      <span class="s-emoji">${s.icon}</span>
      <span class="strategy-label">${s.label}</span>
    </a>`).join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ZeroScreen — NSE Stock Screener</title>
  ${seoMeta({ title: "ZeroScreen — NSE Stock Screener", description: "Free NSE stock screener with fundamentals, paper trading, BANKNIFTY signals and expert picks. Filter 5000+ stocks by ROCE, P/E, D/E and more.", url: "/" })}
  <link rel="stylesheet" href="/public/css/style.css?v=6">
</head>
<body>
  ${nav("home", req)}

  ${req.session?.userId ? `
  <div class="greeting-bar">
    <span class="gbar-hi">👋 Welcome back, <strong>${esc(req.session.userName || "there")}</strong></span>
    <div class="gbar-links">
      ${todayPicks.length > 0 ? `<a href="/today" class="gbar-link">🔥 ${todayPicks.length} picks today</a>` : ""}
      <a href="/my-paper-trade" class="gbar-link">💰 Paper Trade</a>
      <a href="/signals" class="gbar-link">📡 Signals</a>
      <a href="/my-notes" class="gbar-link">📝 Notes</a>
      <a href="/my-referrals" class="gbar-link">🎁 Invite</a>
    </div>
  </div>` : ""}

  <!-- ── Index Ticker Marquee ── -->
  <div class="idx-ticker-outer">
    <div class="idx-ticker-track">
      <div class="idx-ticker-inner" id="idx-grid">
        <span class="idx-ti" id="ic-NSEI"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"><span class="idx-ti-lbl">NIFTY 50</span><span class="idx-price" id="ip-NSEI">—</span><span class="idx-chg idx-d" id="icc-NSEI">—</span></span>
        <span class="idx-ti-sep">◆</span>
        <span class="idx-ti" id="ic-NSEBANK"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"><span class="idx-ti-lbl">BANK NIFTY</span><span class="idx-price" id="ip-NSEBANK">—</span><span class="idx-chg idx-d" id="icc-NSEBANK">—</span></span>
        <span class="idx-ti-sep">◆</span>
        <span class="idx-ti" id="ic-FINNIFTY"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"><span class="idx-ti-lbl">FIN NIFTY</span><span class="idx-price" id="ip-FINNIFTY">—</span><span class="idx-chg idx-d" id="icc-FINNIFTY">—</span></span>
        <span class="idx-ti-sep">◆</span>
        <span class="idx-ti" id="ic-INDIAVIX"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"><span class="idx-ti-lbl">INDIA VIX</span><span class="idx-price" id="ip-INDIAVIX">—</span><span class="idx-chg idx-d" id="icc-INDIAVIX">—</span></span>
        <span class="idx-ti-sep">◆</span>
        <span class="idx-ti" id="ic-MIDCAP"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"><span class="idx-ti-lbl">MIDCAP 100</span><span class="idx-price" id="ip-MIDCAP">—</span><span class="idx-chg idx-d" id="icc-MIDCAP">—</span></span>
        <span class="idx-ti-sep">◆</span>
        <span class="idx-ti" id="ic-NIFTYIT"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"><span class="idx-ti-lbl">NIFTY IT</span><span class="idx-price" id="ip-NIFTYIT">—</span><span class="idx-chg idx-d" id="icc-NIFTYIT">—</span></span>
        <span class="idx-ti-sep">◇</span>
        <span class="idx-ti" id="ic-DJI"><img src="https://flagcdn.com/16x12/us.png" class="mkt-flag-img" alt="US"><span class="idx-ti-lbl">DOW JONES</span><span class="idx-price" id="ip-DJI">—</span><span class="idx-chg idx-d" id="icc-DJI">—</span></span>
        <span class="idx-ti-sep">◇</span>
        <span class="idx-ti" id="ic-IXIC"><img src="https://flagcdn.com/16x12/us.png" class="mkt-flag-img" alt="US"><span class="idx-ti-lbl">NASDAQ</span><span class="idx-price" id="ip-IXIC">—</span><span class="idx-chg idx-d" id="icc-IXIC">—</span></span>
        <span class="idx-ti-sep">◇</span>
        <span class="idx-ti" id="ic-GSPC"><img src="https://flagcdn.com/16x12/us.png" class="mkt-flag-img" alt="US"><span class="idx-ti-lbl">S&amp;P 500</span><span class="idx-price" id="ip-GSPC">—</span><span class="idx-chg idx-d" id="icc-GSPC">—</span></span>
        <span class="idx-ti-sep">◇</span>
        <span class="idx-ti" id="ic-N225"><img src="https://flagcdn.com/16x12/jp.png" class="mkt-flag-img" alt="JP"><span class="idx-ti-lbl">NIKKEI 225</span><span class="idx-price" id="ip-N225">—</span><span class="idx-chg idx-d" id="icc-N225">—</span></span>
        <span class="idx-ti-sep">◇</span>
        <span class="idx-ti" id="ic-HSI"><img src="https://flagcdn.com/16x12/hk.png" class="mkt-flag-img" alt="HK"><span class="idx-ti-lbl">HANG SENG</span><span class="idx-price" id="ip-HSI">—</span><span class="idx-chg idx-d" id="icc-HSI">—</span></span>
        <span class="idx-ti-sep">◆</span>
        <!-- duplicate for seamless loop -->
        <span class="idx-ti" id="ic-NSEI-d"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"><span class="idx-ti-lbl">NIFTY 50</span><span class="idx-price" id="ip-NSEI-d">—</span><span class="idx-chg idx-d" id="icc-NSEI-d">—</span></span>
        <span class="idx-ti-sep">◆</span>
        <span class="idx-ti" id="ic-NSEBANK-d"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"><span class="idx-ti-lbl">BANK NIFTY</span><span class="idx-price" id="ip-NSEBANK-d">—</span><span class="idx-chg idx-d" id="icc-NSEBANK-d">—</span></span>
        <span class="idx-ti-sep">◆</span>
        <span class="idx-ti" id="ic-FINNIFTY-d"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"><span class="idx-ti-lbl">FIN NIFTY</span><span class="idx-price" id="ip-FINNIFTY-d">—</span><span class="idx-chg idx-d" id="icc-FINNIFTY-d">—</span></span>
        <span class="idx-ti-sep">◆</span>
        <span class="idx-ti" id="ic-INDIAVIX-d"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"><span class="idx-ti-lbl">INDIA VIX</span><span class="idx-price" id="ip-INDIAVIX-d">—</span><span class="idx-chg idx-d" id="icc-INDIAVIX-d">—</span></span>
        <span class="idx-ti-sep">◆</span>
        <span class="idx-ti" id="ic-MIDCAP-d"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"><span class="idx-ti-lbl">MIDCAP 100</span><span class="idx-price" id="ip-MIDCAP-d">—</span><span class="idx-chg idx-d" id="icc-MIDCAP-d">—</span></span>
        <span class="idx-ti-sep">◆</span>
        <span class="idx-ti" id="ic-NIFTYIT-d"><img src="https://flagcdn.com/16x12/in.png" class="mkt-flag-img" alt="IN"><span class="idx-ti-lbl">NIFTY IT</span><span class="idx-price" id="ip-NIFTYIT-d">—</span><span class="idx-chg idx-d" id="icc-NIFTYIT-d">—</span></span>
        <span class="idx-ti-sep">◇</span>
        <span class="idx-ti" id="ic-DJI-d"><img src="https://flagcdn.com/16x12/us.png" class="mkt-flag-img" alt="US"><span class="idx-ti-lbl">DOW JONES</span><span class="idx-price" id="ip-DJI-d">—</span><span class="idx-chg idx-d" id="icc-DJI-d">—</span></span>
        <span class="idx-ti-sep">◇</span>
        <span class="idx-ti" id="ic-IXIC-d"><img src="https://flagcdn.com/16x12/us.png" class="mkt-flag-img" alt="US"><span class="idx-ti-lbl">NASDAQ</span><span class="idx-price" id="ip-IXIC-d">—</span><span class="idx-chg idx-d" id="icc-IXIC-d">—</span></span>
        <span class="idx-ti-sep">◇</span>
        <span class="idx-ti" id="ic-GSPC-d"><img src="https://flagcdn.com/16x12/us.png" class="mkt-flag-img" alt="US"><span class="idx-ti-lbl">S&amp;P 500</span><span class="idx-price" id="ip-GSPC-d">—</span><span class="idx-chg idx-d" id="icc-GSPC-d">—</span></span>
        <span class="idx-ti-sep">◇</span>
        <span class="idx-ti" id="ic-N225-d"><img src="https://flagcdn.com/16x12/jp.png" class="mkt-flag-img" alt="JP"><span class="idx-ti-lbl">NIKKEI 225</span><span class="idx-price" id="ip-N225-d">—</span><span class="idx-chg idx-d" id="icc-N225-d">—</span></span>
        <span class="idx-ti-sep">◇</span>
        <span class="idx-ti" id="ic-HSI-d"><img src="https://flagcdn.com/16x12/hk.png" class="mkt-flag-img" alt="HK"><span class="idx-ti-lbl">HANG SENG</span><span class="idx-price" id="ip-HSI-d">—</span><span class="idx-chg idx-d" id="icc-HSI-d">—</span></span>
      </div>
    </div>
    <span class="idx-ticker-updated" id="mkt-updated"></span>
  </div>

  <div class="container screener-layout">

    <!-- ── Main content column ── -->
    <div class="screener-main">
      <div class="screener-hero">
        <div class="screener-hero-text">
          <h1>NSE Stock Screener</h1>
          <p class="screener-hero-sub">Filter 1,700+ stocks by ROCE, D/E, P/E, promoter % and more — free forever</p>
          ${priceAsOf ? `<span class="data-freshness-badge">📅 Prices as of ${priceAsOf} · NSE EOD · Fundamentals updated weekly</span>` : ""}
        </div>
        <div class="screener-hero-stats">
          <div class="sh-stat"><strong>1,700+</strong><span>NSE Stocks</span></div>
          <div class="sh-stat"><strong>14</strong><span>Strategies</span></div>
          <div class="sh-stat"><strong>15+</strong><span>Filters</span></div>
          <div class="sh-stat"><strong>Free</strong><span>Always</span></div>
        </div>
      </div>

      ${topGainers.length > 0 ? `
      <!-- ── Top Gainers strip ── -->
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:10px 16px;margin-bottom:18px;overflow-x:auto">
        <span style="font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);white-space:nowrap;flex-shrink:0">🚀 Top Gainers</span>
        ${topGainers.map(g => `
        <a href="/stock/${esc(g.symbol)}" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:#10b98112;border:1px solid #10b98133;border-radius:20px;text-decoration:none;white-space:nowrap;flex-shrink:0">
          <span style="font-size:.78rem;font-weight:700;color:var(--text)">${esc(g.symbol)}</span>
          <span style="font-size:.72rem;color:#10b981;font-weight:700">${g.change_pct != null ? "+" + g.change_pct.toFixed(2) + "%" : ""}</span>
        </a>`).join("")}
        <a href="/api/top-gainers" target="_blank" style="margin-left:auto;font-size:.7rem;color:var(--text-muted);text-decoration:none;white-space:nowrap;flex-shrink:0">API →</a>
      </div>` : ""}

      ${todayPicks.length > 0 ? `
      <!-- ── Today's Picks ── -->
      <section class="today-section">
        <div class="today-section-header">
          <div class="today-title-group">
            <span class="today-live-pulse"></span>
            <span class="today-section-title">🔥 Today's Picks</span>
            <span class="today-section-badge">${todayPicks.length} stocks</span>
            <span class="tier-pill tier-mid">🟡 Traders</span>
          </div>
          <a href="/today" class="today-view-all">View all ${todayPicks.length} →</a>
        </div>
        <div class="picks-data-note">📋 Based on last market close · Fundamentals, signals &amp; price action analysed · Not SEBI registered · Educational only</div>
        <div class="today-picks-grid">
          ${todayPicks.slice(0, 6).map(p => `
          <a href="/today" class="today-pick-card today-pick-card-${p.direction.toLowerCase()}">
            <div class="today-pick-header">
              <span class="today-pick-dir today-dir-${p.direction.toLowerCase()}">${p.direction === "LONG" ? "▲ LONG" : "▼ SHORT"}</span>
              ${p.pick_type ? `<span class="today-pick-type">${p.pick_type}</span>` : ""}
            </div>
            <div class="today-pick-sym">${esc(p.stock_symbol)}</div>
            ${p.company_name ? `<div class="today-pick-co">${esc(p.company_name.length > 20 ? p.company_name.slice(0,19)+'…' : p.company_name)}</div>` : ""}
            <div class="today-pick-range">₹${p.entry_low} – ₹${p.entry_high}</div>
            <div class="today-pick-meta">
              ${p.target ? `<span class="today-tgt">🎯 ₹${p.target}</span>` : ""}
              ${p.stop_loss ? `<span class="today-sl">SL ₹${p.stop_loss}</span>` : ""}
            </div>
          </a>`).join("")}
          ${todayPicks.length > 6 ? `<a href="/today" class="today-pick-more-card">+${todayPicks.length - 6} more picks</a>` : ""}
        </div>
      </section>` : ""}

      <!-- Strategy Presets -->
      <section class="strategies-section">
        <div class="strategies-header">
          <span class="strategies-title">⚡ Quick Strategies</span>
          <span class="strategies-sub">One click to load expert filters — no technical knowledge needed</span>
          <span class="tier-pill tier-mid" style="margin-left:auto">🟡 Traders</span>
        </div>
        ${(() => {
          if (!dbStats.lastPriceUpdate) return "";
          const updatedAt = new Date(dbStats.lastPriceUpdate);
          const ageMs = Date.now() - updatedAt.getTime();
          const ageDays = ageMs / (1000 * 60 * 60 * 24);
          const dateStr = updatedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
          if (ageDays > 3) {
            return `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:8px 14px;font-size:12px;color:#92400e;margin-bottom:10px">⚠️ <strong>Data may be stale</strong> — prices last updated ${dateStr}. NSE EOD refresh runs after 6:30 PM IST on trading days.</div>`;
          }
          return `<div style="font-size:11px;color:var(--text-dim);margin-bottom:8px">📅 Showing data from last market close · <strong>${dateStr}</strong> · NSE EOD</div>`;
        })()}
        <div class="strategies-grid">${strategyCards}</div>
      </section>

      <details class="filter-details" id="filter-details" ${openFilters ? "open" : ""}>
        <summary class="filter-summary">
          <span>🔧 Advanced Filters</span>
          ${filterCount > 0 ? `<span class="filter-badge">${filterCount} active</span>` : ""}
        </summary>
        <form class="filter-form" method="GET" action="/">
          <div class="filter-grid">

            <div class="filter-group">
              <label>ROCE % ≥</label>
              <select name="minRoce">
                <option value="">Any</option>
                <option value="5"  ${q.minRoce==="5"  ?"selected":""}>≥ 5%</option>
                <option value="10" ${q.minRoce==="10" ?"selected":""}>≥ 10%</option>
                <option value="15" ${q.minRoce==="15" ?"selected":""}>≥ 15%</option>
                <option value="20" ${q.minRoce==="20" ?"selected":""}>≥ 20%</option>
                <option value="25" ${q.minRoce==="25" ?"selected":""}>≥ 25%</option>
                <option value="30" ${q.minRoce==="30" ?"selected":""}>≥ 30%</option>
                <option value="40" ${q.minRoce==="40" ?"selected":""}>≥ 40%</option>
              </select>
            </div>

            <div class="filter-group">
              <label>D/E Ratio ≤</label>
              <select name="maxDe">
                <option value="">Any</option>
                <option value="0"   ${q.maxDe==="0"   ?"selected":""}>0 — Debt-free 💎</option>
                <option value="0.1" ${q.maxDe==="0.1" ?"selected":""}>≤ 0.1</option>
                <option value="0.3" ${q.maxDe==="0.3" ?"selected":""}>≤ 0.3</option>
                <option value="0.5" ${q.maxDe==="0.5" ?"selected":""}>≤ 0.5</option>
                <option value="1"   ${q.maxDe==="1"   ?"selected":""}>≤ 1.0</option>
                <option value="2"   ${q.maxDe==="2"   ?"selected":""}>≤ 2.0</option>
              </select>
            </div>

            <div class="filter-group">
              <label>Promoter % ≥</label>
              <select name="minPromoter">
                <option value="">Any</option>
                <option value="30" ${q.minPromoter==="30" ?"selected":""}>≥ 30%</option>
                <option value="40" ${q.minPromoter==="40" ?"selected":""}>≥ 40%</option>
                <option value="50" ${q.minPromoter==="50" ?"selected":""}>≥ 50%</option>
                <option value="60" ${q.minPromoter==="60" ?"selected":""}>≥ 60%</option>
                <option value="65" ${q.minPromoter==="65" ?"selected":""}>≥ 65%</option>
                <option value="70" ${q.minPromoter==="70" ?"selected":""}>≥ 70%</option>
                <option value="75" ${q.minPromoter==="75" ?"selected":""}>≥ 75%</option>
              </select>
            </div>

            <div class="filter-group">
              <label>P/E Ratio ≤</label>
              <select name="maxPe">
                <option value="">Any</option>
                <option value="8"  ${q.maxPe==="8"  ?"selected":""}>≤ 8 (Deep Value)</option>
                <option value="10" ${q.maxPe==="10" ?"selected":""}>≤ 10</option>
                <option value="15" ${q.maxPe==="15" ?"selected":""}>≤ 15</option>
                <option value="20" ${q.maxPe==="20" ?"selected":""}>≤ 20</option>
                <option value="25" ${q.maxPe==="25" ?"selected":""}>≤ 25</option>
                <option value="30" ${q.maxPe==="30" ?"selected":""}>≤ 30</option>
                <option value="40" ${q.maxPe==="40" ?"selected":""}>≤ 40</option>
                <option value="50" ${q.maxPe==="50" ?"selected":""}>≤ 50</option>
              </select>
            </div>

            <div class="filter-group">
              <label>P/E Ratio ≥</label>
              <select name="minPe">
                <option value="">Any</option>
                <option value="5"  ${q.minPe==="5"  ?"selected":""}>≥ 5</option>
                <option value="10" ${q.minPe==="10" ?"selected":""}>≥ 10</option>
                <option value="15" ${q.minPe==="15" ?"selected":""}>≥ 15</option>
                <option value="20" ${q.minPe==="20" ?"selected":""}>≥ 20</option>
                <option value="30" ${q.minPe==="30" ?"selected":""}>≥ 30</option>
              </select>
            </div>

            <div class="filter-group">
              <label>Dividend Yield ≥</label>
              <select name="minDivYield">
                <option value="">Any</option>
                <option value="0.5" ${q.minDivYield==="0.5" ?"selected":""}>≥ 0.5%</option>
                <option value="1"   ${q.minDivYield==="1"   ?"selected":""}>≥ 1%</option>
                <option value="1.5" ${q.minDivYield==="1.5" ?"selected":""}>≥ 1.5%</option>
                <option value="2"   ${q.minDivYield==="2"   ?"selected":""}>≥ 2%</option>
                <option value="3"   ${q.minDivYield==="3"   ?"selected":""}>≥ 3%</option>
                <option value="5"   ${q.minDivYield==="5"   ?"selected":""}>≥ 5%</option>
              </select>
            </div>

            <div class="filter-group">
              <label>Price Range (₹)</label>
              <div class="filter-range-row">
                <select name="minPrice" title="Min Price">
                  <option value="">₹ Min</option>
                  <option value="10"   ${q.minPrice==="10"   ?"selected":""}>≥ ₹10</option>
                  <option value="50"   ${q.minPrice==="50"   ?"selected":""}>≥ ₹50</option>
                  <option value="100"  ${q.minPrice==="100"  ?"selected":""}>≥ ₹100</option>
                  <option value="200"  ${q.minPrice==="200"  ?"selected":""}>≥ ₹200</option>
                  <option value="500"  ${q.minPrice==="500"  ?"selected":""}>≥ ₹500</option>
                  <option value="1000" ${q.minPrice==="1000" ?"selected":""}>≥ ₹1,000</option>
                  <option value="5000" ${q.minPrice==="5000" ?"selected":""}>≥ ₹5,000</option>
                </select>
                <select name="maxPrice" title="Max Price">
                  <option value="">₹ Max</option>
                  <option value="50"    ${q.maxPrice==="50"    ?"selected":""}>≤ ₹50</option>
                  <option value="100"   ${q.maxPrice==="100"   ?"selected":""}>≤ ₹100</option>
                  <option value="200"   ${q.maxPrice==="200"   ?"selected":""}>≤ ₹200</option>
                  <option value="500"   ${q.maxPrice==="500"   ?"selected":""}>≤ ₹500</option>
                  <option value="1000"  ${q.maxPrice==="1000"  ?"selected":""}>≤ ₹1,000</option>
                  <option value="5000"  ${q.maxPrice==="5000"  ?"selected":""}>≤ ₹5,000</option>
                  <option value="10000" ${q.maxPrice==="10000" ?"selected":""}>≤ ₹10,000</option>
                </select>
              </div>
            </div>

            <div class="filter-group">
              <label>Volume ≥</label>
              <select name="minVolume">
                <option value="">Any</option>
                <option value="10000"   ${q.minVolume==="10000"   ?"selected":""}>≥ 10,000</option>
                <option value="50000"   ${q.minVolume==="50000"   ?"selected":""}>≥ 50,000</option>
                <option value="100000"  ${q.minVolume==="100000"  ?"selected":""}>≥ 1 Lakh</option>
                <option value="500000"  ${q.minVolume==="500000"  ?"selected":""}>≥ 5 Lakh</option>
                <option value="1000000" ${q.minVolume==="1000000" ?"selected":""}>≥ 10 Lakh</option>
                <option value="5000000" ${q.minVolume==="5000000" ?"selected":""}>≥ 50 Lakh</option>
              </select>
            </div>

            <div class="filter-group">
              <label>Cap Size</label>
              <select id="capSizeSelect" onchange="applyCapSize(this.value)">
                <option value="">All Cap Sizes</option>
                <option value="large" ${q.minMc==="20000" && !q.maxMc          ?"selected":""}>🏢 Large Cap (≥ ₹20k Cr)</option>
                <option value="mid"   ${q.minMc==="5000"  && q.maxMc==="20000" ?"selected":""}>🏬 Mid Cap (₹5k–20k Cr)</option>
                <option value="small" ${!q.minMc           && q.maxMc==="5000"  ?"selected":""}>🌱 Small Cap (≤ ₹5k Cr)</option>
                <option value="micro" ${!q.minMc           && q.maxMc==="1000"  ?"selected":""}>🔬 Micro Cap (≤ ₹1k Cr)</option>
              </select>
              <input type="hidden" id="minMcInput" name="minMc" value="${q.minMc || ""}">
              <input type="hidden" id="maxMcInput" name="maxMc" value="${q.maxMc || ""}">
            </div>

            <div class="filter-group">
              <label>Sector</label>
              <select name="sector">
                <option value="">All Sectors</option>
                ${sectorOptions}
              </select>
            </div>

            <div class="filter-group">
              <label>Sort By</label>
              <select name="sortBy">
                ${sortOptions.map(([k, label]) =>
                  `<option value="${k}" ${(q.sortBy || "roce") === k ? "selected" : ""}>${label}</option>`
                ).join("")}
              </select>
            </div>

            <div class="filter-group">
              <label>Sort Direction</label>
              <select name="sortDir">
                <option value="desc" ${(q.sortDir || "desc") === "desc" ? "selected" : ""}>↓ High → Low</option>
                <option value="asc"  ${q.sortDir === "asc"  ? "selected" : ""}>↑ Low → High</option>
              </select>
            </div>

            <div class="filter-group checkbox-group">
              <label class="check-label"><input type="checkbox" name="allProfit" value="1" ${q.allProfit === "1" ? "checked" : ""}> ✅ All 3yr Profitable</label>
              <label class="check-label"><input type="checkbox" name="uptrend"   value="1" ${q.uptrend   === "1" ? "checked" : ""}> 📈 Profit Uptrend ↑</label>
            </div>

          </div>

          <!-- ── Indicator Filters ── -->
          <div class="filter-section-title">📉 Technical Indicators &amp; Quality Metrics</div>
          <div class="filter-grid">

            <div class="filter-group">
              <label>ROE % ≥</label>
              <select name="minRoe">
                <option value="">Any</option>
                <option value="5"  ${q.minRoe==="5"  ?"selected":""}>≥ 5%</option>
                <option value="10" ${q.minRoe==="10" ?"selected":""}>≥ 10%</option>
                <option value="15" ${q.minRoe==="15" ?"selected":""}>≥ 15%</option>
                <option value="20" ${q.minRoe==="20" ?"selected":""}>≥ 20%</option>
                <option value="25" ${q.minRoe==="25" ?"selected":""}>≥ 25%</option>
                <option value="30" ${q.minRoe==="30" ?"selected":""}>≥ 30%</option>
              </select>
            </div>

            <div class="filter-group">
              <label>EPS</label>
              <select name="minEps">
                <option value="">Any</option>
                <option value="0.01" ${q.minEps==="0.01" ?"selected":""}>Positive EPS (&gt; 0)</option>
                <option value="5"    ${q.minEps==="5"    ?"selected":""}>≥ 5</option>
                <option value="10"   ${q.minEps==="10"   ?"selected":""}>≥ 10</option>
                <option value="20"   ${q.minEps==="20"   ?"selected":""}>≥ 20</option>
                <option value="50"   ${q.minEps==="50"   ?"selected":""}>≥ 50</option>
                <option value="100"  ${q.minEps==="100"  ?"selected":""}>≥ 100</option>
              </select>
            </div>

            <div class="filter-group">
              <label>Current Ratio ≥</label>
              <select name="minCr">
                <option value="">Any</option>
                <option value="1"   ${q.minCr==="1"   ?"selected":""}>≥ 1.0 (Liquid)</option>
                <option value="1.5" ${q.minCr==="1.5" ?"selected":""}>≥ 1.5</option>
                <option value="2"   ${q.minCr==="2"   ?"selected":""}>≥ 2.0 (Strong)</option>
                <option value="3"   ${q.minCr==="3"   ?"selected":""}>≥ 3.0</option>
              </select>
            </div>

            <div class="filter-group">
              <label>Price/Book (P/B) ≤</label>
              <select name="maxPb">
                <option value="">Any</option>
                <option value="1"   ${q.maxPb==="1"   ?"selected":""}>≤ 1.0 (Below Book)</option>
                <option value="1.5" ${q.maxPb==="1.5" ?"selected":""}>≤ 1.5</option>
                <option value="2"   ${q.maxPb==="2"   ?"selected":""}>≤ 2.0</option>
                <option value="3"   ${q.maxPb==="3"   ?"selected":""}>≤ 3.0</option>
                <option value="5"   ${q.maxPb==="5"   ?"selected":""}>≤ 5.0</option>
              </select>
            </div>

            <div class="filter-group">
              <label>Day Change %</label>
              <div class="filter-range-row">
                <select name="minChg" title="Min Change %">
                  <option value="">↑ Min</option>
                  <option value="-10" ${q.minChg==="-10" ?"selected":""}>&lt; -10%</option>
                  <option value="-5"  ${q.minChg==="-5"  ?"selected":""}>&gt; -5%</option>
                  <option value="0"   ${q.minChg==="0"   ?"selected":""}>Positive only</option>
                  <option value="1"   ${q.minChg==="1"   ?"selected":""}>≥ +1%</option>
                  <option value="2"   ${q.minChg==="2"   ?"selected":""}>≥ +2%</option>
                  <option value="3"   ${q.minChg==="3"   ?"selected":""}>≥ +3%</option>
                  <option value="5"   ${q.minChg==="5"   ?"selected":""}>≥ +5%</option>
                </select>
                <select name="maxChg" title="Max Change %">
                  <option value="">↓ Max</option>
                  <option value="-5"  ${q.maxChg==="-5"  ?"selected":""}>≤ -5% (Big dip)</option>
                  <option value="-3"  ${q.maxChg==="-3"  ?"selected":""}>≤ -3%</option>
                  <option value="-1"  ${q.maxChg==="-1"  ?"selected":""}>≤ -1%</option>
                  <option value="0"   ${q.maxChg==="0"   ?"selected":""}>Negative only</option>
                  <option value="5"   ${q.maxChg==="5"   ?"selected":""}>≤ +5%</option>
                  <option value="10"  ${q.maxChg==="10"  ?"selected":""}>≤ +10%</option>
                </select>
              </div>
            </div>

            <div class="filter-group">
              <label>Near 52W High 🔥</label>
              <select name="near52H">
                <option value="">Any</option>
                <option value="3"  ${q.near52H==="3"  ?"selected":""}>Within 3% (Breakout zone)</option>
                <option value="5"  ${q.near52H==="5"  ?"selected":""}>Within 5%</option>
                <option value="10" ${q.near52H==="10" ?"selected":""}>Within 10%</option>
                <option value="15" ${q.near52H==="15" ?"selected":""}>Within 15%</option>
                <option value="20" ${q.near52H==="20" ?"selected":""}>Within 20%</option>
              </select>
            </div>

            <div class="filter-group">
              <label>Near 52W Low 💰</label>
              <select name="near52L">
                <option value="">Any</option>
                <option value="10" ${q.near52L==="10" ?"selected":""}>Within 10% (Value zone)</option>
                <option value="20" ${q.near52L==="20" ?"selected":""}>Within 20%</option>
                <option value="30" ${q.near52L==="30" ?"selected":""}>Within 30%</option>
                <option value="50" ${q.near52L==="50" ?"selected":""}>Within 50%</option>
              </select>
            </div>

          </div>

          <div class="filter-actions">
            <button type="submit" class="btn-primary">🔍 Apply Filters</button>
            <a href="/" class="btn-secondary">✕ Reset All</a>
          </div>
        </form>
      </details>

      <!-- Results -->
      <div id="results-section" class="results-header">
        <span>${stocks.length}${hasNextPage ? "+" : ""} stocks${page > 1 ? ` · Page ${page}` : ""}${activeStrategy ? ` · <strong>${STRATEGIES.find(s => s.id === activeStrategy)?.label || ""}</strong>` : ""}</span>
        <span class="tier-pill tier-expert">🔴 Investors</span>
        <div class="results-actions">
          <button class="btn-ghost" id="cmp-btn" style="display:none" onclick="goCompare()">⚖️ Compare (0)</button>
          <button class="btn-ghost" onclick="document.getElementById('alertModal').style.display='flex'">🔔 Save Alert</button>
          <a href="/api/screen/csv?${new URLSearchParams(req.query as any).toString()}" class="btn-ghost" download="zeroscreen.csv">⬇ CSV</a>
          <a href="/api/screen?${new URLSearchParams(req.query as any).toString()}" class="btn-ghost" target="_blank">↗ JSON</a>
        </div>
      </div>

      <div class="table-wrap">
        <table class="stocks-table">
          <thead>
            <tr>
              <th class="cmp-col"></th>
              <th>Symbol</th><th>Company</th>
              <th>Price</th><th>Chg%</th><th>Volume</th>
              <th>ROCE%</th><th>ROE%</th><th>D/E</th>
              <th>Promoter%</th><th>P/E</th><th>Profit</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="12" class="no-data">No results. Try a strategy above or adjust filters.</td></tr>'}</tbody>
        </table>
      </div>

      <!-- Pagination -->
      ${(page > 1 || hasNextPage) ? `
      <div class="pagination">
        ${page > 1 ? `<a href="/?${prevPageQ.toString()}#results-section" class="btn-secondary page-btn">← Prev</a>` : `<span class="page-btn page-disabled">← Prev</span>`}
        <span class="page-info">Page ${page}</span>
        ${hasNextPage ? `<a href="/?${nextPageQ.toString()}#results-section" class="btn-secondary page-btn">Next →</a>` : `<span class="page-btn page-disabled">Next →</span>`}
      </div>` : ""}
    </div>

    <!-- ── News sidebar ── -->
    <aside class="news-sidebar">
      <div class="news-card">
        <div class="news-header">
          <span class="news-title">📰 Market News</span>
          <span class="news-live"><span class="live-dot"></span>Live</span>
        </div>
        <div id="news-list" class="news-list">
          <div class="news-loading">Loading news…</div>
        </div>
        <div class="news-footer">
          <a href="https://economictimes.indiatimes.com/markets" target="_blank" rel="noopener">More on ET Markets →</a>
        </div>
      </div>
    </aside>

  </div>

  <script>
    function applyCapSize(val) {
      const minEl = document.getElementById('minMcInput');
      const maxEl = document.getElementById('maxMcInput');
      if      (val === 'large') { minEl.value = '20000'; maxEl.value = ''; }
      else if (val === 'mid')   { minEl.value = '5000';  maxEl.value = '20000'; }
      else if (val === 'small') { minEl.value = '';       maxEl.value = '5000'; }
      else if (val === 'micro') { minEl.value = '';       maxEl.value = '1000'; }
      else                      { minEl.value = '';       maxEl.value = ''; }
    }

    // Scroll to results when a strategy is active
    (function() {
      const params = new URLSearchParams(window.location.search);
      if (params.get('strategy')) {
        const el = document.querySelector('.results-header');
        if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
      }
    })();

    // ── Live Markets ──────────────────────────────────────────────────────────
    const MKT_ID_MAP = {
      'NIFTY 50':'NSEI','NIFTY BANK':'NSEBANK','NIFTY FINANCIAL SERVICES':'FINNIFTY',
      'NIFTY IT':'NIFTYIT','INDIA VIX':'INDIAVIX','NIFTY MIDCAP 100':'MIDCAP',
      '^DJI':'DJI','^IXIC':'IXIC','^GSPC':'GSPC','^N225':'N225','^HSI':'HSI'
    };
    async function loadMarkets() {
      try {
        const r = await fetch('/api/markets');
        const quotes = await r.json();
        const MKT_ID_MAP = {
          'NIFTY 50':'NSEI','NIFTY BANK':'NSEBANK','NIFTY FIN SERVICE':'FINNIFTY','NIFTY FINANCIAL SERVICES':'FINNIFTY',
          'NIFTY IT':'NIFTYIT','INDIA VIX':'INDIAVIX','NIFTY MIDCAP 100':'MIDCAP',
          '^DJI':'DJI','^IXIC':'IXIC','^GSPC':'GSPC','^N225':'N225','^HSI':'HSI'
        };
        quotes.forEach((q) => {
          const key = MKT_ID_MAP[q.symbol] || q.symbol.replace(/[^A-Z0-9]/gi,'');
          const up  = (q.changePct || 0) >= 0;
          const isGlobal = q.region === 'global';
          const fmt = (n) => n.toLocaleString(isGlobal ? 'en-US' : 'en-IN', {maximumFractionDigits:2});
          const newPrice = q.price != null ? fmt(q.price) : '\u2014';
          const newChg   = q.changePct != null ? (up?'+':'') + q.changePct.toFixed(2) + '%' : '\u2014';
          const card = document.getElementById('ic-' + key);
          const priceEl = document.getElementById('ip-' + key);
          const chgEl   = document.getElementById('icc-' + key);
          if (!card) return;
          card.classList.remove('idx-up','idx-dn');
          if (priceEl) priceEl.textContent = newPrice;
          if (chgEl) {
            chgEl.textContent = newChg;
            chgEl.className = 'idx-chg ' + (up ? 'idx-up' : 'idx-dn');
          }
          // sync duplicate ticker items
          const card2 = document.getElementById('ic-' + key + '-d');
          const priceEl2 = document.getElementById('ip-' + key + '-d');
          const chgEl2   = document.getElementById('icc-' + key + '-d');
          if (card2) { card2.classList.remove('idx-up','idx-dn'); card2.classList.add(up ? 'idx-up' : 'idx-dn'); }
          if (priceEl2) priceEl2.textContent = newPrice;
          if (chgEl2) { chgEl2.textContent = newChg; chgEl2.className = 'idx-chg ' + (up ? 'idx-up' : 'idx-dn'); }
        });
        const ts = document.getElementById('mkt-updated');
        if (ts) ts.textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
      } catch(_) {}
    }
    loadMarkets();
    setInterval(loadMarkets, 30000);

    async function loadNews() {
      try {
        const res = await fetch('/api/news');
        const items = await res.json();
        const el = document.getElementById('news-list');
        if (!items.length) {
          el.innerHTML = '<p class="news-empty">No news available right now.</p>';
          return;
        }
        el.innerHTML = items.map(n => \`
          <a class="news-item" href="\${n.link}" target="_blank" rel="noopener">
            <span class="news-item-title">\${n.title}</span>
            <span class="news-item-meta">\${n.source} · \${n.pubDate ? (d => isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}))(new Date(n.pubDate)) : ''}</span>
          </a>\`).join('');
      } catch(_) {
        document.getElementById('news-list').innerHTML = '<p class="news-empty">Could not load news.</p>';
      }
    }
    loadNews();
    setInterval(loadNews, 5 * 60 * 1000);

    // ── Compare ──────────────────────────────────────────────────────────────
    let _compareList = [];
    function updateCompare() {
      _compareList = [...document.querySelectorAll('.cmp-check:checked')].map(c => c.value);
      const btn = document.getElementById('cmp-btn');
      if (btn) {
        btn.style.display = _compareList.length >= 2 ? 'inline-block' : 'none';
        btn.textContent = '\u2696\ufe0f Compare (' + _compareList.length + ')';
      }
    }
    function goCompare() {
      if (_compareList.length < 2) return;
      window.location.href = '/compare?symbols=' + _compareList.join(',');
    }

    // ── Save Alert ────────────────────────────────────────────────────────────
    async function saveAlert() {
      const name = document.getElementById('alertName').value.trim();
      if (!name) { alert('Please name this alert'); return; }
      const params = new URLSearchParams(window.location.search);
      params.delete('strategy');
      const r = await fetch('/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, filtersJson: JSON.stringify(Object.fromEntries(params)) })
      });
      if (r.ok) {
        document.getElementById('alertModal').style.display = 'none';
        document.getElementById('alertName').value = '';
        alert('\u2705 Alert saved! You\\'ll get a daily email when stocks match your filters.');
      } else { alert('Error saving alert. Please try again.'); }
    }
  </script>

  <!-- Alert Modal -->
  <div id="alertModal" class="modal" style="display:none">
    <div class="modal-box">
      <h2>\ud83d\udd14 Save as Daily Alert</h2>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:18px">Get a daily email when stocks match your current filters.</p>
      <input id="alertName" type="text" class="modal-input" placeholder="e.g. High ROCE Value Picks" maxlength="60">
      <div class="modal-actions">
        <button class="btn-primary" onclick="saveAlert()">Save Alert</button>
        <button class="btn-secondary" onclick="document.getElementById('alertModal').style.display='none'">Cancel</button>
      </div>
    </div>
  </div>

  <footer class="site-footer">
    <span>© 2026 ZeroScreen &mdash; For informational purposes only. Not SEBI registered. Not investment advice. Past data does not guarantee future returns. Invest at your own risk.</span>
  </footer>

  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── GET /stock/:symbol ─────────────────────────────────────────────────────────
app.get("/stock/:symbol", async (req: Request, res: Response) => {
  const symbol = req.params.symbol.toUpperCase();
  const s = await getStock(symbol);

  if (!s) {
    res.status(404).send(`<!DOCTYPE html><html><head><title>Not Found</title>
    <link rel="stylesheet" href="/public/css/style.css"></head><body>
    ${nav("", req)}<div class="container"><h2>Stock "${symbol}" not found in database.</h2>
    <p><a href="/">Back to Screener</a></p></div></body></html>`);
    return;
  }

  const screenerData = s.screener_data ? JSON.parse(s.screener_data) : {};
  const netProfits: number[] = screenerData.netProfits || [];
  const revenues:   number[] = screenerData.revenues   || [];
  const chartYears = netProfits.map((_, i) => `FY${(new Date().getFullYear() - netProfits.length + i + 1).toString().slice(2)}`);
  const watchlists = (await getWatchlists(req.session.userId)) as any[];
  const stockNote  = req.session?.userId ? await getStockNote(req.session.userId, symbol) : null;
  const w52High = (s as any).week52_high as number | null;
  const w52Low  = (s as any).week52_low  as number | null;
  const pbRatio = (s.price && s.book_value && s.book_value > 0) ? s.price / s.book_value : null;
  const incorporated = (s as any).incorporated as number | null;
  const about        = (s as any).about        as string | null;

  // 52W range position % for the visual slider
  const w52Pos = (w52High && w52Low && s.price && w52High > w52Low)
    ? Math.max(0, Math.min(100, ((s.price - w52Low) / (w52High - w52Low)) * 100))
    : null;

  // Profit margin % (latest year)
  const latestProfit  = netProfits[netProfits.length - 1] ?? null;
  const latestRevenue = revenues[revenues.length - 1] ?? null;
  const profitMargin  = (latestProfit != null && latestRevenue && latestRevenue > 0)
    ? (latestProfit / latestRevenue) * 100 : null;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${symbol} — ${s.company_name || "Stock"} NSE Price &amp; Analysis — ZeroScreen</title>
  ${seoMeta({ title: `${symbol} — ${s.company_name || "Stock"} NSE Price & Analysis`, description: `${s.company_name || symbol} (${symbol}) NSE stock price, ROCE ${s.roce != null ? s.roce.toFixed(1) + '%' : 'N/A'}, P/E ${s.pe_ratio != null ? s.pe_ratio.toFixed(1) : 'N/A'}, fundamentals and charts on ZeroScreen.`, url: `/stock/${symbol}` })}
  <link rel="stylesheet" href="/public/css/style.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>
</head>
<body>
  ${nav("", req)}
  <div class="container sdp-container">
    <a href="/" class="back-link">← Back to Screener</a>

    <!-- ── HERO HEADER ── -->
    <div class="sdp-hero">
      <div class="sdp-hero-left">
        <div class="sdp-symbol">${symbol}</div>
        <div class="sdp-company">${s.company_name || ""}</div>
        <div class="sdp-badges">
          ${(s.sector && s.sector.length >= 3 && !/^\[?\d+\]?$/.test(s.sector) && !/edit|about/i.test(s.sector)) ? `<span class="sector-badge">${s.sector}</span>` : ""}
          ${incorporated ? `<span class="sector-badge">🗓️ Est. ${incorporated}</span>` : ""}
          ${s.all_profitable ? '<span class="sector-badge sdp-badge-green">✅ 3yr Profitable</span>' : ""}
          ${s.profit_uptrend  ? '<span class="sector-badge sdp-badge-blue">📈 Profit ↑</span>'       : ""}
        </div>
      </div>
      <div class="sdp-hero-right">
        <div class="sdp-price-main">₹${fmt(s.price, 2)}</div>
        <div class="sdp-change" style="color:${changeColor(s.change_pct)}">${s.change_pct != null ? (s.change_pct >= 0 ? "▲ +" : "▼ ") + fmt(s.change_pct, 2) + "%" : "—"}</div>
        <div class="sdp-ohlc">
          <span>O ₹${fmt(s.prev_close,2)}</span>
          <span>H ₹${fmt(s.day_high,2)}</span>
          <span>L ₹${fmt(s.day_low,2)}</span>
          <span>Vol ${fmtVol(s.volume)}</span>
        </div>
        ${w52Pos !== null ? `
        <div class="sdp-52w-wrap">
          <div class="sdp-52w-labels"><span>₹${fmt(w52Low,0)} 52W L</span><span>52W H ₹${fmt(w52High,0)}</span></div>
          <div class="sdp-52w-bar"><div class="sdp-52w-fill" style="width:${w52Pos.toFixed(1)}%"></div><div class="sdp-52w-dot" style="left:${w52Pos.toFixed(1)}%"></div></div>
        </div>` : ""}
      </div>
    </div>

    <!-- ── KPI HERO CARDS ── -->
    <div class="sdp-kpi-grid">
      <div class="sdp-kpi-card sdp-kpi-accent">
        <div class="sdp-kpi-label">Market Cap</div>
        <div class="sdp-kpi-big">${fmtCr(s.market_cap)}</div>
      </div>
      <div class="sdp-kpi-card">
        <div class="sdp-kpi-label">ROCE</div>
        <div class="sdp-kpi-big" style="color:${roceColor(s.roce)}">${fmt(s.roce, 1)}%</div>
      </div>
      <div class="sdp-kpi-card">
        <div class="sdp-kpi-label">ROE</div>
        <div class="sdp-kpi-big" style="color:${roceColor(s.roe)}">${fmt(s.roe, 1)}%</div>
      </div>
      <div class="sdp-kpi-card">
        <div class="sdp-kpi-label">D/E Ratio</div>
        <div class="sdp-kpi-big" style="color:${deColor(s.de_ratio)}">${s.de_ratio === 0 ? "0 💎" : fmt(s.de_ratio)}</div>
      </div>
      <div class="sdp-kpi-card">
        <div class="sdp-kpi-label">P/E Ratio</div>
        <div class="sdp-kpi-big">${fmt(s.pe_ratio, 1)}</div>
      </div>
      <div class="sdp-kpi-card">
        <div class="sdp-kpi-label">EPS</div>
        <div class="sdp-kpi-big">₹${fmt(s.eps, 1)}</div>
      </div>
      <div class="sdp-kpi-card">
        <div class="sdp-kpi-label">Book Value</div>
        <div class="sdp-kpi-big">₹${fmt(s.book_value, 0)}</div>
      </div>
      <div class="sdp-kpi-card">
        <div class="sdp-kpi-label">Div. Yield</div>
        <div class="sdp-kpi-big">${fmt(s.dividend_yield)}%</div>
      </div>
    </div>

    <!-- ── TRADINGVIEW LIVE CHART ── -->
    <div class="sdp-section-title">📊 Live Price Chart</div>
    <div class="sdp-tv-wrap" id="sdp-tv-outer-${symbol}">
      <iframe id="tv-iframe-${symbol}"
        src="https://s.tradingview.com/widgetembed/?frameElementId=tv-iframe-${symbol}&symbol=NSE%3A${symbol}&interval=D&range=1Y&withdateranges=1&hidesidetoolbar=0&symboledit=0&saveimage=0&toolbarbg=f1f3f6&studies=[]&theme=light&style=1&timezone=Asia%2FKolkata&locale=in"
        style="width:100%;height:550px;border:none;display:block"
        allowtransparency="true" scrolling="no" allowfullscreen>
      </iframe>
    </div>
    <script>
    (function(){
      // Switch to dark theme iframe if dark mode active
      if (document.documentElement.classList.contains('dark')) {
        var ifr = document.getElementById('tv-iframe-${symbol}');
        if (ifr) ifr.src = ifr.src.replace('theme=light','theme=dark');
      }
    })();
    </script>

    <!-- ── CHARTS ROW 1: Profit + Revenue ── -->
    ${netProfits.length >= 2 ? `
    <div class="sdp-section-title">📈 Financial Performance</div>
    <div class="sdp-charts-grid">
      <div class="sdp-chart-card sdp-chart-wide">
        <div class="sdp-chart-header">
          <span class="sdp-chart-title">Net Profit (₹ Cr)</span>
          ${latestProfit != null ? `<span class="sdp-chart-badge" style="color:${latestProfit>=0?'#059669':'#dc2626'}">${latestProfit>=0?'▲':'▼'} ₹${fmtCr(latestProfit)}</span>` : ""}
        </div>
        <div class="sdp-chart-wrap" style="height:220px"><canvas id="profitChart"></canvas></div>
      </div>
      ${revenues.length >= 2 ? `
      <div class="sdp-chart-card sdp-chart-wide">
        <div class="sdp-chart-header">
          <span class="sdp-chart-title">Revenue / Sales (₹ Cr)</span>
          ${latestRevenue != null ? `<span class="sdp-chart-badge" style="color:#2563eb">₹${fmtCr(latestRevenue)}</span>` : ""}
        </div>
        <div class="sdp-chart-wrap" style="height:220px"><canvas id="revenueChart"></canvas></div>
      </div>` : ""}
    </div>` : ""}

    <!-- ── CHARTS ROW 2: Profit Margin bar + ROCE/ROE/Promoter doughnuts ── -->
    <div class="sdp-section-title">🧮 Key Ratios at a Glance</div>
    <div class="sdp-charts-grid sdp-charts-quad">
      <div class="sdp-chart-card">
        <div class="sdp-chart-header"><span class="sdp-chart-title">ROCE vs ROE</span></div>
        <div class="sdp-chart-wrap" style="height:180px"><canvas id="roceRoeChart"></canvas></div>
      </div>
      <div class="sdp-chart-card">
        <div class="sdp-chart-header"><span class="sdp-chart-title">Promoter Holding</span></div>
        <div class="sdp-chart-wrap" style="height:180px"><canvas id="promoterChart"></canvas></div>
        <div class="sdp-chart-center-label">${fmt(s.promoter_pct, 1)}%</div>
      </div>
      <div class="sdp-chart-card">
        <div class="sdp-chart-header"><span class="sdp-chart-title">Valuation (P/E vs P/B)</span></div>
        <div class="sdp-chart-wrap" style="height:180px"><canvas id="valuationChart"></canvas></div>
      </div>
      ${netProfits.length >= 3 ? `
      <div class="sdp-chart-card">
        <div class="sdp-chart-header"><span class="sdp-chart-title">Profit Margin %</span></div>
        <div class="sdp-chart-wrap" style="height:180px"><canvas id="marginChart"></canvas></div>
      </div>` : ""}
    </div>

    <!-- ── DETAILED METRICS TABLE ── -->
    <div class="sdp-section-title">📋 All Metrics</div>
    <div class="sdp-metrics-table-wrap">
      <table class="sdp-metrics-table">
        <tbody>
          <tr><td>P/E Ratio</td><td>${fmt(s.pe_ratio, 1)}</td><td>Current Ratio</td><td>${fmt(s.current_ratio, 2)}</td></tr>
          <tr><td>P/B Ratio</td><td>${fmt(pbRatio, 2)}</td><td>Book Value</td><td>₹${fmt(s.book_value, 1)}</td></tr>
          <tr><td>EPS</td><td>₹${fmt(s.eps, 2)}</td><td>Dividend Yield</td><td>${fmt(s.dividend_yield)}%</td></tr>
          <tr><td>ROCE</td><td style="color:${roceColor(s.roce)}">${fmt(s.roce)}%</td><td>ROE</td><td style="color:${roceColor(s.roe)}">${fmt(s.roe)}%</td></tr>
          <tr><td>D/E Ratio</td><td style="color:${deColor(s.de_ratio)}">${s.de_ratio === 0 ? "Debt-free 💎" : fmt(s.de_ratio)}</td><td>Promoter %</td><td>${fmt(s.promoter_pct)}%</td></tr>
          <tr><td>Market Cap</td><td>${fmtCr(s.market_cap)}</td><td>Volume</td><td>${fmtVol(s.volume)}</td></tr>
          ${w52High || w52Low ? `<tr><td>52W High</td><td>₹${fmt(w52High, 2)}</td><td>52W Low</td><td>₹${fmt(w52Low, 2)}</td></tr>` : ""}
          ${profitMargin != null ? `<tr><td>Profit Margin</td><td style="color:${profitMargin>=0?'#059669':'#dc2626'}">${fmt(profitMargin, 1)}%</td><td>3yr Profitable</td><td>${s.all_profitable ? "✅ Yes" : "❌ No"}</td></tr>` : ""}
        </tbody>
      </table>
    </div>

    <!-- ── ACTIONS ── -->
    <div class="stock-actions" style="margin-top:20px">
      <button class="btn-primary" onclick="refreshStock('${symbol}')">🔄 Refresh Data</button>
      <a href="/my-paper-trade?buy=${symbol}" class="btn-primary" style="background:#10b981;border-color:#10b981">📋 Paper Trade</a>
      ${req.session?.userId ? `<a href="/my-alerts?symbol=${symbol}" class="btn-secondary">🎯 Set Alert</a>` : ""}
      <a href="https://www.screener.in/company/${symbol}/" target="_blank" class="btn-secondary">screener.in ↗</a>
      <a href="https://www.nseindia.com/get-quotes/equity?symbol=${symbol}" target="_blank" class="btn-ghost">NSE ↗</a>
      <div class="watchlist-add">
        <select id="wlSelect">
          <option value="">Add to watchlist…</option>
          ${watchlists.map((w: any) => `<option value="${w.id}">${w.name}</option>`).join("")}
        </select>
        <button class="btn-ghost" onclick="addToWatchlist('${symbol}')">+ Add</button>
      </div>
    </div>

    <!-- ── ABOUT ── -->
    ${about ? `
    <div class="sdp-section-title">🏢 About the Company</div>
    <div class="about-card">
      <div class="about-meta">
        <span class="about-badge">📍 ${s.sector || "—"}</span>
        ${incorporated ? `<span class="about-badge">🗓️ Est. ${incorporated}</span>` : ""}
        <span class="about-badge">📈 NSE: ${symbol}</span>
        ${s.market_cap ? `<span class="about-badge">💰 MCap ${fmtCr(s.market_cap)}</span>` : ""}
      </div>
      <p class="about-text">${esc(about)}</p>
      <a href="https://www.screener.in/company/${symbol}/" target="_blank" rel="noopener" class="about-link">Read more on screener.in ↗</a>
    </div>` : ""}

    ${req.session?.userId ? `
    <!-- ── NOTES ── -->
    <div class="sdp-section-title">📝 My Research Notes</div>
    <div class="sn-wrap">
      <textarea id="sn-editor" class="sn-textarea" maxlength="2000" placeholder="Write your private research notes for ${symbol}…">${esc(stockNote?.content ?? "")}</textarea>
      <div class="sn-footer">
        <span id="sn-status" class="sn-status"></span>
        <span class="sn-chars"><span id="sn-count">${(stockNote?.content ?? "").length}</span>/2000</span>
      </div>
    </div>` : ""}

    <!-- ── NEWS ── -->
    <div class="sdp-section-title">📰 News about ${symbol}</div>
    <div id="stock-news-wrap" class="stock-news-wrap">
      <div class="news-loading">Loading news…</div>
    </div>

    <div class="fetched-info">Fundamentals fetched: ${s.fetched_at ? new Date(s.fetched_at).toLocaleString("en-IN") : "Never"}</div>
  </div>

  <footer class="site-footer">
    <span>© 2026 ZeroScreen &mdash; For informational purposes only. Not SEBI registered. Not investment advice. Past data does not guarantee future returns. Invest at your own risk.</span>
  </footer>

  <script>
  (function() {
    const dark = document.documentElement.classList.contains('dark');
    const gc = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    const tc = dark ? '#8899aa' : '#888';
    const baseOpts = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { grid:{color:gc}, ticks:{color:tc,font:{size:11}} }, x: { grid:{display:false}, ticks:{color:tc,font:{size:11}} } }
    };

    // ── Profit bar ──────────────────────────────────────────────────────────
    ${netProfits.length >= 2 ? `
    new Chart(document.getElementById('profitChart'), {
      type: 'bar',
      data: { labels: ${JSON.stringify(chartYears)},
        datasets: [{ data: ${JSON.stringify(netProfits)},
          backgroundColor: ${JSON.stringify(netProfits)}.map(v => v>=0 ? 'rgba(5,150,105,0.8)' : 'rgba(220,38,38,0.8)'),
          borderRadius: 6, borderSkipped: false }] },
      options: { ...baseOpts }
    });` : ""}

    // ── Revenue line ────────────────────────────────────────────────────────
    ${revenues.length >= 2 ? `
    new Chart(document.getElementById('revenueChart'), {
      type: 'line',
      data: { labels: ${JSON.stringify(chartYears)},
        datasets: [{ data: ${JSON.stringify(revenues)},
          borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.12)',
          fill: true, tension: 0.4, pointRadius: 5, pointBackgroundColor: '#2563eb',
          pointBorderColor: '#fff', pointBorderWidth: 2 }] },
      options: { ...baseOpts }
    });` : ""}

    // ── ROCE / ROE grouped bar ───────────────────────────────────────────────
    ${(s.roce != null || s.roe != null) ? `
    new Chart(document.getElementById('roceRoeChart'), {
      type: 'bar',
      data: { labels: ['ROCE', 'ROE'],
        datasets: [{ data: [${s.roce ?? null}, ${s.roe ?? null}],
          backgroundColor: ['rgba(16,185,129,0.8)', 'rgba(99,102,241,0.8)'],
          borderRadius: 8, borderSkipped: false }] },
      options: { ...baseOpts, plugins: { legend:{display:false} },
        scales: { y: { ...baseOpts.scales.y, max: Math.max(${Math.ceil(Math.max(s.roce ?? 0, s.roe ?? 0) * 1.4) + 5}, 30) },
                  x: baseOpts.scales.x } }
    });` : ""}

    // ── Promoter doughnut ───────────────────────────────────────────────────
    ${s.promoter_pct != null ? `
    new Chart(document.getElementById('promoterChart'), {
      type: 'doughnut',
      data: { labels: ['Promoter', 'Public'],
        datasets: [{ data: [${s.promoter_pct ?? null}, ${s.promoter_pct != null ? +(100 - s.promoter_pct).toFixed(1) : null}],
          backgroundColor: ['rgba(99,102,241,0.85)','rgba(200,200,220,0.25)'],
          borderWidth: 0, cutout: '72%' }] },
      options: { responsive:true, maintainAspectRatio:false,
        plugins: { legend: { display:true, position:'bottom',
          labels:{ color:tc, font:{size:11}, boxWidth:12, padding:8 } } } }
    });` : ""}

    // ── Valuation radar ─────────────────────────────────────────────────────
    ${(s.pe_ratio != null || pbRatio != null || s.current_ratio != null) ? `
    new Chart(document.getElementById('valuationChart'), {
      type: 'bar',
      data: { labels: ['P/E', 'P/B', 'Curr.Ratio', 'Div.Yld'],
        datasets: [{ data: [${s.pe_ratio ?? null}, ${pbRatio ?? null}, ${s.current_ratio ?? null}, ${s.dividend_yield ?? null}],
          backgroundColor: ['rgba(245,158,11,0.8)','rgba(16,185,129,0.8)','rgba(14,165,233,0.8)','rgba(168,85,247,0.8)'],
          borderRadius: 8, borderSkipped: false }] },
      options: { ...baseOpts, indexAxis: 'y',
        scales: { x: { grid:{color:gc}, ticks:{color:tc,font:{size:11}} },
                  y: { grid:{display:false}, ticks:{color:tc,font:{size:11}} } } }
    });` : ""}

    // ── Profit margin % line ────────────────────────────────────────────────
    ${(netProfits.length >= 3 && revenues.length >= 3) ? `
    (function() {
      const np = ${JSON.stringify(netProfits)};
      const rv = ${JSON.stringify(revenues)};
      const margins = np.map((p,i) => rv[i]>0 ? parseFloat((p/rv[i]*100).toFixed(1)) : 0);
      new Chart(document.getElementById('marginChart'), {
        type: 'line',
        data: { labels: ${JSON.stringify(chartYears)},
          datasets: [{ data: margins,
            borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)',
            fill: true, tension: 0.4, pointRadius: 5, pointBackgroundColor: '#f59e0b',
            pointBorderColor: '#fff', pointBorderWidth: 2 }] },
        options: { ...baseOpts,
          plugins: { legend:{display:false},
            tooltip: { callbacks: { label: ctx => ctx.raw + '%' } } },
          scales: { y: { ...baseOpts.scales.y, ticks: { ...baseOpts.scales.y.ticks, callback: v => v+'%' } },
                    x: baseOpts.scales.x } }
      });
    })();` : ""}

    async function refreshStock(sym) {
      const btn = event.target; btn.disabled=true; btn.textContent='Refreshing…';
      const r = await fetch('/api/refresh/stock/'+sym, {method:'POST'});
      if(r.ok){ location.reload(); } else { btn.textContent='Error'; btn.disabled=false; }
    }
    async function addToWatchlist(sym) {
      const id = document.getElementById('wlSelect').value;
      if(!id){ alert('Select a watchlist first'); return; }
      const r = await fetch('/watchlists/'+id+'/add',
        {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:sym})});
      if(r.ok){ alert('Added! ✅'); if(typeof zsMarkWatchDone==='function') zsMarkWatchDone(); } else { alert('Error'); }
    }

    async function loadStockNews() {
      const wrap = document.getElementById('stock-news-wrap');
      try {
        const r = await fetch('/api/news/${symbol}');
        const items = await r.json();
        if(!items.length){ wrap.innerHTML='<p class="news-empty">No recent news found.</p>'; return; }
        const order=['Today','Yesterday','Last 7 Days','Older'], groups={};
        items.forEach(n=>{ if(!groups[n.period]) groups[n.period]=[]; groups[n.period].push(n); });
        let html='';
        order.forEach(period=>{
          if(!groups[period]) return;
          html+='<div class="snews-period">'+period+'</div>';
          html+=groups[period].map(n=>{
            const d=n.pubDate?new Date(n.pubDate):null;
            const ds=d?d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})+' '+d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'';
            return '<a class="snews-item" href="'+n.link+'" target="_blank" rel="noopener">'
              +'<span class="snews-title">'+n.title+'</span>'
              +'<span class="snews-meta">'+(n.source||'Google News')+(ds?' &middot; '+ds:'')+'</span>'
              +'</a>';
          }).join('');
        });
        wrap.innerHTML=html;
      } catch(_){ wrap.innerHTML='<p class="news-empty">Could not load news.</p>'; }
    }
    loadStockNews();

    // ── Stock notes autosave ─────────────────────────────────────────────────
    (function() {
      const ta = document.getElementById('sn-editor');
      if (!ta) return;
      const status = document.getElementById('sn-status');
      const counter = document.getElementById('sn-count');
      let saveTimer = null;
      ta.addEventListener('input', function() {
        counter.textContent = ta.value.length;
        status.textContent = 'Unsaved…';
        status.style.color = 'var(--text-muted)';
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNote, 1500);
      });
      async function saveNote() {
        try {
          const r = await fetch('/api/note/${symbol}', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: ta.value })
          });
          if (r.ok) {
            status.textContent = '✓ Saved';
            status.style.color = '#10b981';
            setTimeout(() => { status.textContent = ''; }, 2000);
          }
        } catch(_) {
          status.textContent = 'Save failed';
          status.style.color = '#ef4444';
        }
      }
    })();
  })();
  </script>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── GET /watchlists ────────────────────────────────────────────────────────────
app.get("/watchlists", requireAuth, featureGate("feature_watchlists", "Watchlists"), premiumGate("watchlists_premium_only", "Watchlists"), async (req: Request, res: Response) => {
  const lists = (await getWatchlists()) as any[];
  const cards = lists.map(w => `
    <div class="wl-card">
      <a href="/watchlists/${w.id}" class="wl-name">${w.name}</a>
      <span class="wl-count">${w.stock_count} stocks</span>
      <p class="wl-desc">${w.description || ""}</p>
      <div class="wl-actions">
        <a href="/watchlists/${w.id}" class="btn-primary">View</a>
        <button class="btn-danger" onclick="deleteWl(${w.id})">Delete</button>
      </div>
    </div>`).join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Watchlists — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("watchlists", req)}
  <div class="container">
    <div class="page-header">
      <h1>⭐ Watchlists</h1>
      <button class="btn-primary" onclick="document.getElementById('createModal').style.display='flex'">+ New Watchlist</button>
    </div>
    <div class="wl-grid">${cards || '<p class="no-data">No watchlists yet. Create one!</p>'}</div>

    <div id="createModal" class="modal" style="display:none">
      <div class="modal-box">
        <h2>Create Watchlist</h2>
        <input id="wlName" type="text" placeholder="Name" class="modal-input">
        <textarea id="wlDesc" placeholder="Description (optional)" class="modal-input"></textarea>
        <div class="modal-actions">
          <button class="btn-primary" onclick="createWl()">Create</button>
          <button class="btn-secondary" onclick="document.getElementById('createModal').style.display='none'">Cancel</button>
        </div>
      </div>
    </div>
  </div>
  <script>
    async function createWl() {
      const name = document.getElementById('wlName').value.trim();
      if (!name) { alert('Name required'); return; }
      const r = await fetch('/watchlists', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: document.getElementById('wlDesc').value })
      });
      if (r.ok) location.reload(); else alert('Error creating watchlist');
    }
    async function deleteWl(id) {
      if (!confirm('Delete this watchlist?')) return;
      const r = await fetch('/watchlists/' + id, { method: 'DELETE' });
      if (r.ok) location.reload(); else alert('Error');
    }
  </script>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── GET /watchlists/:id ────────────────────────────────────────────────────────
app.get("/watchlists/:id", requireAuth, async (req: Request, res: Response) => {
  const wl = (await getWatchlist(parseInt(req.params.id, 10), req.session.userId)) as any;
  if (!wl) { res.status(404).send("Watchlist not found"); return; }

  const rows = wl.stocks.map((s: any) => `
    <tr>
      <td><a href="/stock/${s.symbol}" class="sym-link">${s.symbol}</a></td>
      <td>₹${fmt(s.price, 2)}</td>
      <td style="color:${roceColor(s.roce)}">${fmt(s.roce)}%</td>
      <td style="color:${deColor(s.de_ratio)}">${fmt(s.de_ratio)}</td>
      <td>${fmt(s.promoter_pct)}%</td>
      <td>${fmt(s.pe_ratio, 1)}</td>
      <td>${fmtVol(s.volume)}</td>
      <td>${s.notes || ""}</td>
      <td><button class="btn-danger-sm" onclick="removeStock(${wl.id}, '${s.symbol}')">✕</button></td>
    </tr>`).join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${wl.name} — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("watchlists", req)}
  <div class="container">
    <div class="page-header">
      <div>
        <a href="/watchlists" class="back-link">← Watchlists</a>
        <h1>⭐ ${wl.name}</h1>
        <p class="wl-desc">${wl.description || ""}</p>
      </div>
    </div>
    <div class="table-wrap">
      <table class="stocks-table">
        <thead>
          <tr><th>Symbol</th><th>Price</th><th>ROCE%</th><th>D/E</th><th>Promoter%</th><th>P/E</th><th>Volume</th><th>Notes</th><th></th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="9" class="no-data">No stocks yet. Add from any stock page.</td></tr>'}</tbody>
      </table>
    </div>
  </div>
  <script>
    async function removeStock(wlId, sym) {
      if (!confirm('Remove ' + sym + '?')) return;
      const r = await fetch('/watchlists/' + wlId + '/remove', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym })
      });
      if (r.ok) location.reload(); else alert('Error');
    }
  </script>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── Watchlist API routes ───────────────────────────────────────────────────────
app.post("/watchlists", requireAuth, async (req: Request, res: Response) => {
  const { name, description } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const id = await createWatchlist(name, description || "", req.session.userId);
  res.json({ id });
});

app.post("/watchlists/:id/add", async (req: Request, res: Response) => {
  const { symbol, notes } = req.body;
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  await addToWatchlist(parseInt(req.params.id, 10), symbol, notes || "");
  res.json({ ok: true });
});

app.post("/watchlists/:id/remove", async (req: Request, res: Response) => {
  const { symbol } = req.body;
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  await removeFromWatchlist(parseInt(req.params.id, 10), symbol);
  res.json({ ok: true });
});

app.delete("/watchlists/:id", async (req: Request, res: Response) => {
  await deleteWatchlist(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// ── Admin routes ───────────────────────────────────────────────────────────────

// ── GET /admin ─────────────────────────────────────────────────────────────────
app.get("/admin", requireAdmin, async (req: Request, res: Response) => {
  const users = await getAllUsers();
  const today = new Date().toISOString().slice(0, 10);
  const todaySignups = users.filter(u => u.created_at?.slice(0, 10) === today).length;
  const activePicks  = await getActivePicks();

  const [pvToday, pvTotal, uvToday] = await Promise.all([
    dbAll<{ c: number }>("SELECT COUNT(*) as c FROM page_views WHERE date(created_at) = date('now','localtime')"),
    dbAll<{ c: number }>("SELECT COUNT(*) as c FROM page_views"),
    dbAll<{ c: number }>("SELECT COUNT(DISTINCT ip_hash) as c FROM page_views WHERE date(created_at) = date('now','localtime')"),
  ]);

  const botStatus = (() => {
    try { return JSON.parse(require("fs").readFileSync(`${BOT_DIR}/trade-state.json`, "utf-8")); } catch { return {}; }
  })();
  const botActive = !!(botStatus.position && botStatus.position !== "FLAT");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Admin Overview — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("admin", req)}
  <div class="container">
    <div class="admin-header">
      <div>
        <h1>🧠 Admin Overview</h1>
        <p class="page-sub">ZeroScreen platform at a glance</p>
      </div>
    </div>

    <div class="admin-stats-row">
      <div class="admin-stat-card">
        <div class="admin-stat-num">${users.length}</div>
        <div class="admin-stat-label">Total Users</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num green">${todaySignups}</div>
        <div class="admin-stat-label">New Today</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num">${pvToday[0]?.c ?? 0}</div>
        <div class="admin-stat-label">Page Views Today</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num">${uvToday[0]?.c ?? 0}</div>
        <div class="admin-stat-label">Unique Visitors Today</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num">${pvTotal[0]?.c ?? 0}</div>
        <div class="admin-stat-label">Total Page Views</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num">${activePicks.length}</div>
        <div class="admin-stat-label">Active Picks</div>
      </div>
    </div>

    <div class="admin-quick-grid">
      <div class="admin-quick-card">
        <h3>🤖 Bot Status</h3>
        <p>Position: <strong class="${botActive ? "sig-green" : "text-dim"}">${botActive ? "● " + (botStatus.direction || "ACTIVE") : "💤 FLAT"}</strong></p>
        <p>Strategy: <strong>${botStatus.strategy || botStatus.type || "—"}</strong></p>
        <a href="/admin/signals" class="btn-secondary" style="margin-top:8px">⚙️ Signal Control</a>
      </div>
      <div class="admin-quick-card">
        <h3>🔥 Today's Picks</h3>
        <p>${activePicks.length > 0 ? activePicks.slice(0, 3).map(p => `<span class="pick-badge-${p.direction.toLowerCase()}">${p.direction}</span> ${p.stock_symbol}`).join(" · ") : "No active picks"}</p>
        <a href="/admin/picks" class="btn-secondary" style="margin-top:8px">🛠 Manage Picks</a>
      </div>
      <div class="admin-quick-card">
        <h3>🔗 Quick Links</h3>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
          <a href="/admin/users" class="btn-secondary">👥 Users</a>
          <a href="/admin/analytics" class="btn-secondary">📊 Analytics</a>
          <a href="/admin/content" class="btn-secondary">📢 Content</a>
          <a href="/admin/settings" class="btn-secondary">⚙️ Settings</a>
        </div>
      </div>
    </div>
  </div>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

app.get("/admin/users", requireAdmin, async (req: Request, res: Response) => {
  const users = await getAllUsers();
  const total = users.length;
  const admins = users.filter(u => u.role === "admin").length;
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = users.filter(u => u.created_at?.slice(0, 10) === today).length;

  const rows = users.map((u, i) => `
    <tr>
      <td class="admin-num">${i + 1}</td>
      <td>
        <div class="admin-user-cell">
          <span class="admin-avatar">${u.name.charAt(0).toUpperCase()}</span>
          <span>${u.name}</span>
        </div>
      </td>
      <td>${u.email}</td>
      <td><span class="role-badge role-${u.role}">${u.role}</span></td>
      <td>${new Date(u.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <form method="POST" action="/admin/users/${u.id}/set-role" style="display:inline-flex;gap:4px;align-items:center">
          <select name="role" class="form-input" style="padding:3px 6px;font-size:12px;height:28px">
            <option value="user"    ${u.role==="user"    ?"selected":""}>User</option>
            <option value="premium" ${u.role==="premium" ?"selected":""}>Premium</option>
            <option value="admin"   ${u.role==="admin"   ?"selected":""}>Admin</option>
          </select>
          <button class="btn-admin-action" style="height:28px;padding:0 8px;font-size:11px">Set</button>
        </form>
        <form method="POST" action="/admin/users/${u.id}/delete" style="display:inline" onsubmit="return confirm('Delete user ${u.name.replace(/'/g, "\\'")}? This cannot be undone.')">
          <button class="btn-admin-action" style="background:#fee2e2;color:#991b1b;height:28px;padding:0 8px;font-size:11px;border:1px solid #fca5a5">🗑</button>
        </form>
        <a href="/admin/users/${u.id}/trades" class="btn-admin-action" style="height:28px;padding:0 8px;font-size:11px;display:inline-flex;align-items:center;text-decoration:none;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe">📋</a>
        <form method="POST" action="/admin/users/${u.id}/set-balance" style="display:inline-flex;gap:4px;align-items:center" title="Set virtual balance">
          <input name="balance" type="number" min="0" max="10000000" step="1000" placeholder="₹ balance" class="form-input" style="width:90px;padding:3px 6px;font-size:11px;height:28px">
          <button class="btn-admin-action" style="height:28px;padding:0 7px;font-size:11px;background:#ecfdf5;color:#065f46;border:1px solid #6ee7b7">💰</button>
        </form>
      </td>
    </tr>`).join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Users — ZeroScreen Admin</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("admin-users", req)}
  <div class="container">
    <div class="admin-header">
      <div>
        <h1>👥 User Management</h1>
        <p class="page-sub">All registered users on ZeroScreen</p>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn-primary" onclick="document.getElementById('add-user-modal').style.display='flex'">➕ Add User</button>
        <a href="/admin" class="btn-secondary">🧠 Overview</a>
        <a href="/admin/settings" class="btn-secondary">⚙️ Settings</a>
      </div>
    </div>

    ${req.query.msg ? `<div class="admin-msg ${req.query.err ? "admin-msg-err" : "admin-msg-ok"}">${esc(req.query.msg as string)}</div>` : ""}

    <div class="admin-stats-row">
      <div class="admin-stat-card">
        <div class="admin-stat-num">${total}</div>
        <div class="admin-stat-label">Total Users</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num">${admins}</div>
        <div class="admin-stat-label">Admins</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num green">${todayCount}</div>
        <div class="admin-stat-label">Joined Today</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-num">${total - admins}</div>
        <div class="admin-stat-label">Regular Users</div>
      </div>
    </div>

    <div class="table-wrap" style="margin-top:18px">
      <table class="stocks-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Registered</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" class="no-data">No users yet.</td></tr>'}</tbody>
      </table>
    </div>
  </div>

  <!-- Add User Modal -->
  <div id="add-user-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;align-items:center;justify-content:center">
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:28px 32px;min-width:340px;max-width:440px;width:90%;position:relative">
      <button onclick="document.getElementById('add-user-modal').style.display='none'" style="position:absolute;top:14px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-dim)">✕</button>
      <h2 style="margin:0 0 20px;font-size:17px">➕ Add New User</h2>
      <form method="POST" action="/admin/users/create">
        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-dim);display:block;margin-bottom:5px">FULL NAME</label>
            <input type="text" name="name" required placeholder="John Doe" class="form-input" style="width:100%">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-dim);display:block;margin-bottom:5px">EMAIL</label>
            <input type="email" name="email" required placeholder="user@example.com" class="form-input" style="width:100%">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-dim);display:block;margin-bottom:5px">PASSWORD</label>
            <input type="password" name="password" required minlength="8" placeholder="Min 8 characters" class="form-input" style="width:100%">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-dim);display:block;margin-bottom:5px">ROLE</label>
            <select name="role" class="form-input" style="width:100%">
              <option value="user">👤 User (Free)</option>
              <option value="premium">💎 Premium</option>
              <option value="admin">🛡️ Admin</option>
            </select>
          </div>
          <button type="submit" class="btn-primary" style="margin-top:6px">Create User</button>
        </div>
      </form>
    </div>
  </div>

  <style>
    .admin-msg { padding:12px 16px; border-radius:8px; margin-bottom:16px; font-size:13px; font-weight:600; }
    .admin-msg-ok  { background:#dcfce7; color:#166534; border:1px solid #bbf7d0; }
    .admin-msg-err { background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; }
  </style>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

app.post("/admin/users/create", requireAdmin, async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body as { name: string; email: string; password: string; role: string };
  const allowedRoles = ["user", "premium", "admin"];
  if (!name?.trim() || !email?.trim() || !password || password.length < 8 || !allowedRoles.includes(role)) {
    res.redirect("/admin/users?err=1&msg=" + encodeURIComponent("Invalid input — name, email, and password (min 8 chars) required")); return;
  }
  const existing = await getUserByEmail(email.trim());
  if (existing) {
    res.redirect("/admin/users?err=1&msg=" + encodeURIComponent("A user with that email already exists")); return;
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const uid = await createUser(name.trim(), email.trim().toLowerCase(), hash);
    if (role !== "user") await dbRun("UPDATE users SET role = ? WHERE id = ?", [role, uid]);
    res.redirect("/admin/users?msg=" + encodeURIComponent(`User "${name.trim()}" created successfully`));
  } catch (e: any) {
    res.redirect("/admin/users?err=1&msg=" + encodeURIComponent("Failed to create user: " + (e?.message ?? "unknown error")));
  }
});

app.post("/admin/users/:id/set-role", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { role } = req.body as { role: string };
  if (!Number.isInteger(id) || id <= 0 || !["user", "premium", "admin"].includes(role)) {
    res.status(400).send("Invalid input"); return;
  }
  const prevUser = await getUserById(id);
  await dbRun("UPDATE users SET role = ? WHERE id = ?", [role, id]);
  // Upgrade to premium → boost virtual balance to ₹10L if currently at ₹1L or less
  if (role === "premium" && prevUser && prevUser.role === "user") {
    const port = await getPaperPortfolio(id);
    if (port.balance <= 100000) {
      await setPaperBalance(id, 1000000);
    }
  }
  res.redirect("/admin/users?msg=" + encodeURIComponent("Role updated"));
});

app.post("/admin/users/:id/set-balance", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const balance = parseFloat(req.body.balance);
  if (!Number.isInteger(id) || id <= 0 || isNaN(balance) || balance < 0 || balance > 10000000) {
    res.redirect("/admin/users?err=1&msg=" + encodeURIComponent("Invalid balance")); return;
  }
  await setPaperBalance(id, Math.round(balance));
  res.redirect("/admin/users?msg=" + encodeURIComponent("Balance updated"));
});

app.post("/admin/users/:id/delete", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).send("Invalid id"); return; }
  if (id === req.session.userId) {
    res.redirect("/admin/users?err=1&msg=" + encodeURIComponent("Cannot delete your own account")); return;
  }
  await dbRun("DELETE FROM users WHERE id = ?", [id]);
  res.redirect("/admin/users?msg=" + encodeURIComponent("User deleted"));
});

app.post("/admin/users/:id/make-admin", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).send("Invalid id"); return; }
  await dbRun("UPDATE users SET role = 'admin' WHERE id = ?", [id]);
  res.redirect("/admin/users");
});

// ── GET /admin/users/:id/trades — user paper trade history ────────────────────
app.get("/admin/users/:id/trades", requireAdmin, async (req: Request, res: Response) => {
  const userId = parseInt(req.params.id, 10);
  if (!Number.isInteger(userId) || userId <= 0) { res.status(400).send("Invalid user id"); return; }
  const [user, trades, port] = await Promise.all([
    getUserById(userId),
    getPaperTrades(userId, 500),
    getPaperPortfolio(userId),
  ]);
  if (!user) { res.status(404).send("User not found"); return; }

  const totalTrades = trades.length;
  const sells = trades.filter((t: PaperTrade) => t.action === "SELL" && t.pnl != null);
  const totalPnl = sells.reduce((s: number, t: PaperTrade) => s + (t.pnl ?? 0), 0);
  const wins = sells.filter((t: PaperTrade) => (t.pnl ?? 0) > 0).length;
  const winRate = sells.length > 0 ? ((wins / sells.length) * 100).toFixed(1) : "—";

  const rows = trades.map((t: PaperTrade) => {
    const pnlCls = t.pnl != null ? (t.pnl >= 0 ? "color:#10b981" : "color:#ef4444") : "";
    return `<tr>
      <td style="font-size:.78rem;color:var(--text-muted)">${(t.traded_at||"").slice(0,16)}</td>
      <td style="font-weight:700;color:var(--accent)">${esc(t.symbol)}</td>
      <td style="font-size:.82rem">${esc(t.company_name||"")}</td>
      <td><span class="${t.action==="BUY"?"mpt-action-buy":"mpt-action-sell"}">${t.action}</span></td>
      <td style="text-align:right">${t.qty}</td>
      <td style="text-align:right">₹${t.price.toFixed(2)}</td>
      <td style="text-align:right">₹${t.total.toFixed(2)}</td>
      <td style="text-align:right;font-weight:700;${pnlCls}">${t.pnl != null ? (t.pnl >= 0 ? "+" : "") + "₹" + t.pnl.toFixed(2) : "—"}</td>
      <td style="text-align:right;${pnlCls}">${t.pnl_pct != null ? (t.pnl_pct >= 0 ? "+" : "") + t.pnl_pct.toFixed(2) + "%" : "—"}</td>
      <td style="text-align:right">₹${t.balance_after.toFixed(2)}</td>
    </tr>`;
  }).join("");

  res.send(`<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(user.name)} — Paper Trades — Admin</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head><body>${nav("admin-users", req)}
<div class="container" style="max-width:1100px;padding-top:24px">
  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:24px">
    <a href="/admin/users" style="font-size:.85rem;color:var(--text-muted);text-decoration:none">← Admin / Users</a>
    <span style="color:var(--border)">/</span>
    <span style="font-weight:700">${esc(user.name)}</span>
    <span style="font-size:.78rem;color:var(--text-muted)">&lt;${esc(user.email)}&gt;</span>
    <span style="margin-left:auto">
      <a href="/admin/users/${userId}/trades/export" style="font-size:.82rem;padding:6px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;color:var(--text-muted);text-decoration:none;font-weight:700">⬇ Export CSV</a>
    </span>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px">
    <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:14px 18px">
      <div style="font-size:.72rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Balance</div>
      <div style="font-size:1.3rem;font-weight:800;color:var(--accent)">₹${port ? port.balance.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—"}</div>
    </div>
    <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:14px 18px">
      <div style="font-size:.72rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Total Trades</div>
      <div style="font-size:1.3rem;font-weight:800">${totalTrades}</div>
    </div>
    <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:14px 18px">
      <div style="font-size:.72rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Total P&L</div>
      <div style="font-size:1.3rem;font-weight:800;color:${totalPnl >= 0 ? "#10b981" : "#ef4444"}">${totalPnl >= 0 ? "+" : ""}₹${totalPnl.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
    </div>
    <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:14px 18px">
      <div style="font-size:.72rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Win Rate</div>
      <div style="font-size:1.3rem;font-weight:800;color:#f59e0b">${winRate}${winRate !== "—" ? "%" : ""}</div>
    </div>
  </div>
  <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;overflow:hidden">
    <div style="padding:14px 18px;border-bottom:1px solid var(--border);font-weight:700;font-size:.9rem">📋 Paper Trade History (${totalTrades} trades)</div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:.84rem">
        <thead><tr style="background:var(--bg2)">
          <th style="padding:9px 12px;text-align:left;font-size:.68rem;color:var(--text-muted);text-transform:uppercase">Date</th>
          <th style="padding:9px 12px;text-align:left;font-size:.68rem;color:var(--text-muted);text-transform:uppercase">Symbol</th>
          <th style="padding:9px 12px;text-align:left;font-size:.68rem;color:var(--text-muted);text-transform:uppercase">Company</th>
          <th style="padding:9px 12px;text-align:left;font-size:.68rem;color:var(--text-muted);text-transform:uppercase">Action</th>
          <th style="padding:9px 12px;text-align:right;font-size:.68rem;color:var(--text-muted);text-transform:uppercase">Qty</th>
          <th style="padding:9px 12px;text-align:right;font-size:.68rem;color:var(--text-muted);text-transform:uppercase">Price</th>
          <th style="padding:9px 12px;text-align:right;font-size:.68rem;color:var(--text-muted);text-transform:uppercase">Total</th>
          <th style="padding:9px 12px;text-align:right;font-size:.68rem;color:var(--text-muted);text-transform:uppercase">P&L (₹)</th>
          <th style="padding:9px 12px;text-align:right;font-size:.68rem;color:var(--text-muted);text-transform:uppercase">P&L (%)</th>
          <th style="padding:9px 12px;text-align:right;font-size:.68rem;color:var(--text-muted);text-transform:uppercase">Balance After</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="10" style="padding:28px;text-align:center;color:var(--text-muted)">No trades yet</td></tr>`}</tbody>
      </table>
    </div>
  </div>
</div>
<script src="/public/js/app.js"></script></body></html>`);
});

// ── GET /admin/users/:id/trades/export — CSV download ─────────────────────────
app.get("/admin/users/:id/trades/export", requireAdmin, async (req: Request, res: Response) => {
  const userId = parseInt(req.params.id, 10);
  if (!Number.isInteger(userId) || userId <= 0) { res.status(400).send("Invalid user id"); return; }
  const [user, trades] = await Promise.all([getUserById(userId), getPaperTrades(userId, 5000)]);
  if (!user) { res.status(404).send("User not found"); return; }
  const header = ["Date","Symbol","Company","Action","Qty","Price (₹)","Total (₹)","P&L (₹)","P&L (%)","Balance After (₹)"];
  const rows = trades.map((t: PaperTrade) => [
    t.traded_at || "", t.symbol, (t.company_name || "").replace(/,/g," "),
    t.action, t.qty, t.price.toFixed(2), t.total.toFixed(2),
    t.pnl != null ? t.pnl.toFixed(2) : "", t.pnl_pct != null ? t.pnl_pct.toFixed(2) : "",
    t.balance_after.toFixed(2),
  ]);
  const csv = [header, ...rows].map(r => r.map((v: any) => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  res.setHeader("Content-Type","text/csv");
  res.setHeader("Content-Disposition",`attachment; filename="user-${userId}-trades-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csv);
});
app.get("/admin/data", requireAdmin, async (req: Request, res: Response) => {
  const stats = await getDbStats();
  const msg = req.query.msg as string | undefined;
  const err = req.query.err as string | undefined;
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Data Control — ZeroScreen Admin</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .settings-section { margin-top:32px; }
    .settings-section h2 { font-size:16px; font-weight:600; margin-bottom:16px; color:var(--text-main); }
    .setting-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 20px; background:var(--card-bg); border:1px solid var(--border); border-radius:10px; margin-bottom:12px; }
    .setting-info { flex:1; }
    .setting-title { font-weight:600; font-size:14px; color:var(--text-main); }
    .setting-desc  { font-size:12px; color:var(--text-dim); margin-top:3px; }
    .toggle-wrap { display:flex; align-items:center; gap:10px; flex-shrink:0; }
    .toggle-label { font-size:13px; font-weight:600; }
    .toggle-label.on  { color:#16a34a; }
    .toggle-label.off { color:#dc2626; }
    .toggle-btn { position:relative; width:52px; height:28px; cursor:pointer; }
    .toggle-btn input { opacity:0; width:0; height:0; position:absolute; }
    .toggle-slider { position:absolute; inset:0; border-radius:28px; background:#cbd5e1; transition:.25s; }
    .toggle-slider:before { content:""; position:absolute; height:20px; width:20px; left:4px; bottom:4px; border-radius:50%; background:#fff; transition:.25s; }
    .toggle-btn input:checked + .toggle-slider { background:#16a34a; }
    .toggle-btn input:checked + .toggle-slider:before { transform:translateX(24px); }
  </style>
</head>
<body>
  ${nav("admin-users", req)}
  <div class="container" style="max-width:700px">
    <div class="page-header">
      <div>
        <a href="/admin" class="back-link">← Admin</a>
        <h1>📊 Data Control</h1>
        <p class="page-sub">Manage stock data and feature settings</p>
      </div>
    </div>
    ${msg ? `<div class="auth-success" style="margin-bottom:18px">✅ ${esc(msg)}</div>` : ""}
    ${err ? `<div class="auth-error"   style="margin-bottom:18px">⚠️ ${esc(err)}</div>`  : ""}

    <div class="admin-data-grid">
      <div class="admin-data-card">
        <div class="admin-data-icon">💰</div>
        <div class="admin-data-info">
          <div class="admin-data-title">Refresh Prices</div>
          <div class="admin-data-desc">Fetch latest NSE bhavcopy (daily prices, volume, change%)</div>
          <div class="admin-data-stat">${stats.priced} stocks with prices · Last: ${stats.lastPriceUpdate ? new Date(stats.lastPriceUpdate).toLocaleString("en-IN") : "Never"}</div>
        </div>
        <button class="btn-primary" onclick="triggerJob('prices', this)">▶ Run Now</button>
      </div>
      <div class="admin-data-card">
        <div class="admin-data-icon">📈</div>
        <div class="admin-data-info">
          <div class="admin-data-title">Refresh Fundamentals</div>
          <div class="admin-data-desc">Fetch ROCE, D/E, PE, promoter% etc. from screener.in (batch of 500)</div>
          <div class="admin-data-stat">${stats.fetched}/${stats.total} stocks have fundamentals</div>
        </div>
        <button class="btn-primary" onclick="triggerJob('fundamentals', this)">▶ Run Now</button>
      </div>
    </div>

    <div class="admin-data-progress" id="job-status" style="display:none">
      <div class="progress-spinner"></div>
      <span id="job-status-text">Running…</span>
    </div>

  </div>
  <script>
    async function triggerJob(type, btn) {
      btn.disabled = true;
      const statusEl = document.getElementById('job-status');
      const statusText = document.getElementById('job-status-text');
      statusEl.style.display = 'flex';
      statusText.textContent = type === 'prices' ? 'Fetching prices from NSE…' : 'Fetching fundamentals (this takes a few minutes)…';
      try {
        const r = await fetch('/api/refresh/' + type, { method: 'POST' });
        const d = await r.json();
        if (r.ok) {
          statusText.textContent = '✅ Done! ' + (d.count ? d.count + ' stocks updated.' : '');
        } else {
          statusText.textContent = '⚠️ Error: ' + (d.error || 'Unknown');
        }
      } catch(e) {
        statusText.textContent = '⚠️ Network error';
      }
      btn.disabled = false;
    }


  </script>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── POST /admin/settings/toggle ───────────────────────────────────────────────
app.post("/admin/settings/toggle", requireAdmin, async (req: Request, res: Response) => {
  const allowed = [
    "otp_required", "razorpay_enabled",
    "registration_open",
    "feature_signals", "feature_dashboard", "feature_strategies",
    "feature_paper_trade_bot", "feature_my_paper_trade",
    "feature_watchlists", "feature_alerts", "feature_compare",
    "feature_strategy_builder", "feature_contact",
    "watchlists_premium_only", "alerts_premium_only", "paper_trade_premium_only",
    // New premium-only gates for all features
    "signals_premium_only", "dashboard_premium_only", "strategies_premium_only",
    "paper_trade_bot_premium_only", "compare_premium_only",
    "strategy_builder_premium_only", "contact_premium_only",
    // Telegram notification toggles
    "notify_user_signup", "notify_trade_entry", "notify_trade_exit",
    "notify_eod_sleep", "notify_bot_start", "notify_token_expired",
    "notify_sl_hit", "notify_daily_loss", "notify_crash", "notify_api_error",
  ];
  const { key, value } = req.body as { key: string; value: string };
  if (!allowed.includes(key) || !["true", "false"].includes(value)) {
    res.status(400).json({ error: "Invalid setting" }); return;
  }
  await setSetting(key, value);
  res.json({ ok: true });
});

// ── GET /admin/settings ────────────────────────────────────────────────────────
app.get("/admin/settings", requireAdmin, async (req: Request, res: Response) => {
  const s: Record<string, string> = {};
  const keys = [
    "otp_required", "registration_open",
    "feature_signals", "feature_dashboard", "feature_strategies",
    "feature_paper_trade_bot", "feature_my_paper_trade",
    "feature_watchlists", "feature_alerts", "feature_compare",
    "feature_strategy_builder", "feature_contact",
    "watchlists_premium_only", "alerts_premium_only", "paper_trade_premium_only",
  ];
  await Promise.all(keys.map(async k => { s[k] = await getSetting(k); }));

  const isOn  = (k: string) => s[k] !== "false";
  const isOff = (k: string) => s[k] === "false";

  function toggle(key: string, label: string, desc: string, extra = "") {
    const on = isOn(key);
    return `
    <div class="setting-row">
      <div class="setting-info">
        <div class="setting-title">${label}</div>
        <div class="setting-desc">${desc}${extra ? `<br><span style="color:#f59e0b;font-size:11px">⚠️ ${extra}</span>` : ""}</div>
      </div>
      <div class="toggle-wrap">
        <span class="toggle-label ${on ? "on" : "off"}" id="lbl-${key}">${on ? "ON" : "OFF"}</span>
        <label class="toggle-btn">
          <input type="checkbox" id="tog-${key}" ${on ? "checked" : ""} onchange="save('${key}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>`;
  }

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Feature Settings — ZeroScreen Admin</title>
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
    .toast { position:fixed; bottom:24px; right:24px; background:#1e293b; color:#fff; padding:10px 18px; border-radius:8px; font-size:13px; opacity:0; transition:opacity .3s; pointer-events:none; z-index:9999; }
    .toast.show { opacity:1; }
  </style>
</head>
<body>
  ${nav("admin-users", req)}
  <div class="container" style="max-width:720px">
    <div class="page-header">
      <div>
        <a href="/admin" class="back-link">← Admin</a>
        <h1>⚙️ Feature Settings</h1>
        <p class="page-sub">Enable or disable pages and control role-based access</p>
      </div>
    </div>

    <div class="settings-section">
      <h2>🔐 Registration & Auth</h2>
      ${toggle("otp_required", "📱 Mobile OTP Verification", "Require users to verify mobile via OTP before accessing Paper Trade. Disable if SMS delivery is unavailable.")}
      ${toggle("registration_open", "🆕 New User Registration", "Allow new users to sign up. Disable to make the platform invite-only.", "Existing users can still log in.")}
    </div>

    <div class="settings-section">
      <h2>📄 Page Visibility <span style="font-size:11px;font-weight:400;color:var(--text-dim)">(OFF = 404 for all users)</span></h2>
      ${toggle("feature_signals", "📡 Signals Page", "Live BANKNIFTY bot signals and trade history.")}
      ${toggle("feature_dashboard", "📊 Dashboard Page", "Bot analytics, equity curve, 5-year backtest stats.")}
      ${toggle("feature_strategies", "⚙️ Strategies Page", "Strategy showcase with backtest numbers.")}
      ${toggle("feature_paper_trade_bot", "📋 Bot Paper Trade Page", "Public paper trade portfolio run by the bot engine.")}
      ${toggle("feature_my_paper_trade", "👤 My Paper Trade", "Personal paper trading portfolio for logged-in users.")}
      ${toggle("feature_watchlists", "⭐ Watchlists", "Named stock watchlists for logged-in users.")}
      ${toggle("feature_alerts", "🔔 Alerts", "Saved screener filter alerts with email digest.")}
      ${toggle("feature_compare", "⚖️ Compare Tool", "Side-by-side stock comparison.")}
      ${toggle("feature_strategy_builder", "🔨 Strategy Builder", "Plain-English strategy parser.")}
      ${toggle("feature_contact", "📬 Contact Page", "Contact form and support enquiries.")}
    </div>

    <div class="settings-section">
      <h2>💎 Premium-Only Access <span style="font-size:11px;font-weight:400;color:var(--text-dim)">(ON = Premium or Admin only)</span></h2>
      ${toggle("watchlists_premium_only", "⭐ Watchlists — Premium Only", "Restrict Watchlists to Premium subscribers and admins.")}
      ${toggle("alerts_premium_only", "🔔 Alerts — Premium Only", "Restrict Alerts to Premium subscribers and admins.")}
      ${toggle("paper_trade_premium_only", "👤 My Paper Trade — Premium Only", "Restrict personal Paper Trading to Premium subscribers and admins.", "Users on the free plan will be redirected to the upgrade page.")}
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    async function save(key, value) {
      const lbl  = document.getElementById('lbl-' + key);
      const chk  = document.getElementById('tog-' + key);
      try {
        const r = await fetch('/admin/settings/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value: value ? 'true' : 'false' })
        });
        if (r.ok) {
          lbl.textContent = value ? 'ON' : 'OFF';
          lbl.className = 'toggle-label ' + (value ? 'on' : 'off');
          showToast('✅ Saved');
        } else {
          chk.checked = !value;
          showToast('⚠️ Failed to save');
        }
      } catch(e) {
        chk.checked = !value;
        showToast('⚠️ Network error');
      }
    }
    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2200);
    }
  </script>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── GET /admin/permissions ─────────────────────────────────────────────────────
app.get("/admin/permissions", requireAdmin, async (req: Request, res: Response) => {
  // [label, icon, featureKey, premiumOnlyKey | null, requiresLogin]
  const FEATURES: [string, string, string, string | null, boolean][] = [
    ["NSE Screener",     "🔍", "",                        null,                           false],
    ["Today's Picks",    "🔥", "",                        null,                           false],
    ["Live Bot",         "🤖", "feature_signals",         "signals_premium_only",         false],
    ["Dashboard",        "📊", "feature_dashboard",       "dashboard_premium_only",       false],
    ["Strategies",       "⚙️", "feature_strategies",      "strategies_premium_only",      false],
    ["Paper Trade Bot",  "📋", "feature_paper_trade_bot", "paper_trade_bot_premium_only", false],
    ["My Paper Trade",   "👤", "feature_my_paper_trade",  "paper_trade_premium_only",     true],
    ["Watchlists",       "⭐", "feature_watchlists",      "watchlists_premium_only",      true],
    ["Alerts",           "🔔", "feature_alerts",          "alerts_premium_only",          true],
    ["Compare",          "⚖️", "feature_compare",         "compare_premium_only",         false],
    ["Strategy Builder", "🔨", "feature_strategy_builder","strategy_builder_premium_only",false],
    ["Contact",          "📬", "feature_contact",         "contact_premium_only",         false],
  ];

  const allKeys = FEATURES.flatMap(([,, fk, pk]) => [fk, pk]).filter(Boolean) as string[];
  const s: Record<string, string> = {};
  await Promise.all(allKeys.map(async k => { s[k] = await getSetting(k); }));

  const featureOn   = (fk: string) => !fk || s[fk] !== "false";
  const premiumOnly = (pk: string | null) => pk ? s[pk] === "true" : false;

  const rows = FEATURES.map(([label, icon, fk, pk, reqLogin]) => {
    const isAlwaysOn = !fk;
    const fOn   = featureOn(fk);
    const pOnly = premiumOnly(pk);

    // Derived access per role
    const guestChecked   = isAlwaysOn ? !reqLogin : (fOn && !pOnly && !reqLogin);
    const memberChecked  = isAlwaysOn || (fOn && !pOnly);
    const premiumChecked = isAlwaysOn || fOn;
    // Admin always ✓

    const rowId = fk || label.replace(/\s+/g, "_").toLowerCase();
    const noGate = !pk;

    if (isAlwaysOn) {
      return `
      <tr>
        <td class="perm-feature"><span class="perm-icon">${icon}</span><strong>${label}</strong></td>
        <td class="perm-cell"><label class="perm-check always-on"><input type="checkbox" ${!reqLogin ? "checked" : ""} disabled><span class="perm-checkmark"></span></label></td>
        <td class="perm-cell"><label class="perm-check always-on"><input type="checkbox" checked disabled><span class="perm-checkmark"></span></label></td>
        <td class="perm-cell"><label class="perm-check always-on"><input type="checkbox" checked disabled><span class="perm-checkmark"></span></label></td>
        <td class="perm-cell"><label class="perm-check always-on"><input type="checkbox" checked disabled><span class="perm-checkmark"></span></label></td>
        <td class="perm-status"><span class="perm-badge perm-on">Always On</span></td>
      </tr>`;
    }

    const statusHtml = !fOn
      ? '<span class="perm-badge perm-off">Disabled</span>'
      : pOnly ? '<span class="perm-badge perm-premium">Premium Only</span>'
      : reqLogin ? '<span class="perm-badge perm-login">Login Required</span>'
      : '<span class="perm-badge perm-on">All Users</span>';

    return `
    <tr id="row-${rowId}">
      <td class="perm-feature"><span class="perm-icon">${icon}</span><strong>${label}</strong>${reqLogin ? '<span class="perm-login-tag" title="Requires account login">🔑</span>' : ''}</td>
      <td class="perm-cell perm-guest-cell" title="${reqLogin ? 'Requires login — guests always blocked' : 'Derived from Member access'}">
        <label class="perm-check always-on ${guestChecked ? 'is-on' : ''}">
          <input type="checkbox" ${guestChecked ? "checked" : ""} disabled>
          <span class="perm-checkmark"></span>
        </label>
      </td>
      <td class="perm-cell">
        <label class="perm-check ${memberChecked ? "is-on" : ""}">
          <input type="checkbox" id="free-${rowId}" ${memberChecked ? "checked" : ""} ${noGate ? 'disabled title="No premium gate"' : ''}
            onchange="onMemberChange('${rowId}','${fk}','${pk || ""}','${reqLogin}',this.checked)">
          <span class="perm-checkmark"></span>
        </label>
      </td>
      <td class="perm-cell">
        <label class="perm-check ${premiumChecked ? "is-on" : ""}">
          <input type="checkbox" id="premium-${rowId}" ${premiumChecked ? "checked" : ""}
            onchange="onPremiumChange('${rowId}','${fk}','${pk || ""}','${reqLogin}',this.checked)">
          <span class="perm-checkmark"></span>
        </label>
      </td>
      <td class="perm-cell">
        <label class="perm-check always-on"><input type="checkbox" checked disabled><span class="perm-checkmark"></span></label>
      </td>
      <td class="perm-status" id="status-${rowId}">${statusHtml}</td>
    </tr>`;
  }).join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Permissions — ZeroScreen Admin</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .perm-table { width:100%; border-collapse:collapse; margin-top:18px; }
    .perm-table th { text-align:center; padding:12px 14px; font-size:12px; font-weight:700; color:var(--text-dim); background:var(--bg-card); border-bottom:2px solid var(--border); }
    .perm-table th.perm-th-feature { text-align:left; min-width:160px; }
    .perm-table td { padding:11px 14px; border-bottom:1px solid var(--border); vertical-align:middle; }
    .perm-table tr:hover td { background:rgba(255,255,255,0.02); }
    .perm-feature { display:flex; align-items:center; gap:9px; }
    .perm-icon { font-size:17px; width:26px; text-align:center; flex-shrink:0; }
    .perm-login-tag { font-size:12px; margin-left:4px; opacity:0.6; cursor:help; }
    .perm-cell { text-align:center; }
    .perm-guest-cell { opacity:0.65; }
    .perm-check { display:inline-flex; align-items:center; cursor:pointer; }
    .perm-check input { position:absolute; opacity:0; width:0; height:0; }
    .perm-checkmark {
      width:22px; height:22px; border-radius:6px;
      border:2px solid var(--border); background:var(--bg-card);
      display:flex; align-items:center; justify-content:center;
      transition:.15s; font-size:13px;
    }
    .perm-check input:checked + .perm-checkmark { background:#16a34a; border-color:#16a34a; }
    .perm-check input:checked + .perm-checkmark::after { content:"✓"; color:#fff; font-weight:700; }
    .perm-check.always-on input:checked + .perm-checkmark { background:#94a3b8; border-color:#94a3b8; }
    .perm-check input:disabled + .perm-checkmark { opacity:.6; cursor:not-allowed; }
    .perm-status { text-align:center; }
    .perm-badge { font-size:11px; font-weight:700; padding:3px 10px; border-radius:20px; white-space:nowrap; }
    .perm-on      { background:rgba(16,185,129,0.18); color:#34d399; border:1px solid rgba(16,185,129,0.3); }
    .perm-premium { background:rgba(139,92,246,0.18); color:#c4b5fd; border:1px solid rgba(139,92,246,0.3); }
    .perm-off     { background:rgba(239,68,68,0.18);  color:#f87171; border:1px solid rgba(239,68,68,0.3); }
    .perm-login   { background:rgba(245,158,11,0.18); color:#fbbf24; border:1px solid rgba(245,158,11,0.3); }
    .perm-role-header { text-align:center; }
    .perm-role-icon { font-size:18px; display:block; margin-bottom:3px; }
    .perm-role-name { font-size:11px; font-weight:700; color:var(--text-dim); }
    .perm-role-sub  { font-size:10px; color:var(--text-muted); display:block; margin-top:1px; }
    .perm-legend { display:flex; gap:12px; flex-wrap:wrap; margin:14px 0; font-size:12px; }
    .perm-legend-item { display:flex; align-items:center; gap:6px; color:var(--text-dim); }
    .perm-guest-note { font-size:12px; color:var(--text-muted); margin-bottom:14px; padding:10px 14px; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.2); border-radius:8px; }
    .toast { position:fixed; bottom:24px; right:24px; background:#1e293b; color:#fff; padding:10px 18px; border-radius:8px; font-size:13px; opacity:0; transition:opacity .3s; pointer-events:none; z-index:9999; }
    .toast.show { opacity:1; }
  </style>
</head>
<body>
  ${nav("admin-permissions", req)}
  <div class="container" style="max-width:900px">
    <div class="admin-header">
      <div>
        <a href="/admin" class="back-link">← Admin</a>
        <h1>🔐 Role Permissions</h1>
        <p class="page-sub">Control which user roles can access each feature. Changes take effect immediately.</p>
      </div>
    </div>

    <div class="perm-guest-note">
      👁 <strong>Guest column</strong> is read-only — it's automatically derived. Features marked 🔑 always block guests (login required). Uncheck <em>Member</em> to restrict a feature to Premium+ users.
    </div>

    <div class="perm-legend">
      <div class="perm-legend-item"><span class="perm-badge perm-on">All Users</span> Everyone including guests</div>
      <div class="perm-legend-item"><span class="perm-badge perm-login">Login Required</span> Members &amp; Premium only (guests blocked)</div>
      <div class="perm-legend-item"><span class="perm-badge perm-premium">Premium Only</span> Premium &amp; Admin only</div>
      <div class="perm-legend-item"><span class="perm-badge perm-off">Disabled</span> Nobody can access</div>
    </div>

    <div class="table-wrap">
      <table class="perm-table">
        <thead>
          <tr>
            <th class="perm-th-feature">Feature</th>
            <th class="perm-role-header">
              <span class="perm-role-icon">👁</span>
              <span class="perm-role-name">Guest</span>
              <span class="perm-role-sub">not logged in</span>
            </th>
            <th class="perm-role-header">
              <span class="perm-role-icon">👤</span>
              <span class="perm-role-name">Member</span>
              <span class="perm-role-sub">free account</span>
            </th>
            <th class="perm-role-header">
              <span class="perm-role-icon">💎</span>
              <span class="perm-role-name">Premium</span>
              <span class="perm-role-sub">paid</span>
            </th>
            <th class="perm-role-header">
              <span class="perm-role-icon">🛡️</span>
              <span class="perm-role-name">Admin</span>
              <span class="perm-role-sub">always ✓</span>
            </th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>

  <div class="toast" id="toast"></div>
  <script>
    async function toggleSetting(key, value) {
      const r = await fetch('/admin/settings/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: value ? 'true' : 'false' })
      });
      if (!r.ok) throw new Error('Failed');
    }

    function updateStatus(rowId, memberChecked, premiumChecked, reqLogin) {
      const el = document.getElementById('status-' + rowId);
      if (!el) return;
      // Update guest cell derived state
      const guestCell = document.querySelector('#row-' + rowId + ' .perm-guest-cell input');
      if (guestCell) guestCell.checked = memberChecked && reqLogin !== 'true';

      if (!premiumChecked) {
        el.innerHTML = '<span class="perm-badge perm-off">Disabled</span>';
      } else if (!memberChecked) {
        el.innerHTML = '<span class="perm-badge perm-premium">Premium Only</span>';
      } else if (reqLogin === 'true') {
        el.innerHTML = '<span class="perm-badge perm-login">Login Required</span>';
      } else {
        el.innerHTML = '<span class="perm-badge perm-on">All Users</span>';
      }
    }

    async function onPremiumChange(rowId, featureKey, premiumKey, reqLogin, checked) {
      try {
        await toggleSetting(featureKey, checked);
        const memberChk = document.getElementById('free-' + rowId);
        if (!checked && memberChk) {
          memberChk.checked = false;
          if (premiumKey) await toggleSetting(premiumKey, false);
        }
        const memberChecked = memberChk ? memberChk.checked : false;
        updateStatus(rowId, memberChecked, checked, reqLogin);
        showToast(checked ? '✅ Enabled' : '🚫 Disabled');
      } catch(e) {
        document.getElementById('premium-' + rowId).checked = !checked;
        showToast('⚠️ Failed to save');
      }
    }

    async function onMemberChange(rowId, featureKey, premiumKey, reqLogin, checked) {
      if (!premiumKey) return;
      try {
        if (checked) {
          await toggleSetting(featureKey, true);
          await toggleSetting(premiumKey, false);
          const premChk = document.getElementById('premium-' + rowId);
          if (premChk) premChk.checked = true;
        } else {
          const premChk = document.getElementById('premium-' + rowId);
          if (premChk && premChk.checked) await toggleSetting(premiumKey, true);
        }
        const premChecked = document.getElementById('premium-' + rowId)?.checked ?? false;
        updateStatus(rowId, checked, premChecked, reqLogin);
        showToast('✅ Saved');
      } catch(e) {
        document.getElementById('free-' + rowId).checked = !checked;
        showToast('⚠️ Failed to save');
      }
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2000);
    }
  </script>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── GET /admin/notifications ───────────────────────────────────────────────────
app.get("/admin/notifications", requireAdmin, async (req: Request, res: Response) => {
  const notifyKeys = [
    "notify_user_signup", "notify_trade_entry", "notify_trade_exit",
    "notify_eod_sleep", "notify_bot_start", "notify_token_expired",
    "notify_sl_hit", "notify_daily_loss", "notify_crash", "notify_api_error",
  ];
  const s: Record<string, string> = {};
  await Promise.all(notifyKeys.map(async k => { s[k] = await getSetting(k); }));
  const isOn = (k: string) => s[k] !== "false";

  function ntoggle(key: string, label: string, desc: string) {
    const on = isOn(key);
    return `
    <div class="setting-row">
      <div class="setting-info">
        <div class="setting-title">${label}</div>
        <div class="setting-desc">${desc}</div>
      </div>
      <div class="toggle-wrap">
        <span class="toggle-label ${on ? "on" : "off"}" id="lbl-${key}">${on ? "ON" : "OFF"}</span>
        <label class="toggle-btn">
          <input type="checkbox" id="tog-${key}" ${on ? "checked" : ""} onchange="save('${key}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>`;
  }

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Notifications — ZeroScreen Admin</title>
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
    .toast { position:fixed; bottom:24px; right:24px; background:#1e293b; color:#fff; padding:10px 18px; border-radius:8px; font-size:13px; opacity:0; transition:opacity .3s; pointer-events:none; z-index:9999; }
    .toast.show { opacity:1; }
    .notify-note { background:var(--card-bg); border:1px solid var(--border); border-radius:10px; padding:14px 18px; margin-bottom:20px; font-size:13px; color:var(--text-dim); line-height:1.6; }
    .notify-note strong { color:var(--text-main); }
  </style>
</head>
<body>
  ${nav("admin-notifications", req)}
  <div class="container" style="max-width:720px">
    <div class="page-header">
      <div>
        <a href="/admin" class="back-link">← Admin</a>
        <h1>🔔 Telegram Notifications</h1>
        <p class="page-sub">Control which events trigger Telegram messages</p>
      </div>
    </div>

    <div class="notify-note">
      <strong>Note:</strong> Server-side notifications (user signup) are controlled instantly.
      Bot notifications (trade signals, EOD sleep, etc.) take effect on the next bot restart — the bot reads these settings at startup.
    </div>

    <div class="settings-section">
      <h2>👤 User Events</h2>
      ${ntoggle("notify_user_signup", "🆕 New User Registration", "Send Telegram alert when a new user registers on ZeroScreen.")}
    </div>

    <div class="settings-section">
      <h2>🤖 Bot Lifecycle</h2>
      ${ntoggle("notify_bot_start", "🟢 Bot Wake-Up", "Alert when the trading bot starts up for the day (9:00 AM IST).")}
      ${ntoggle("notify_eod_sleep", "😴 Bot EOD Sleep", "Alert when the bot shuts down at market close (3:30 PM IST) with day's P&L summary.")}
    </div>

    <div class="settings-section">
      <h2>📊 Trading Signals</h2>
      ${ntoggle("notify_trade_entry", "📈 Trade Entry", "Alert when the bot takes a new BANKNIFTY options position.")}
      ${ntoggle("notify_trade_exit", "📉 Trade Exit", "Alert when the bot exits a position (target hit, manual exit, etc.).")}
      ${ntoggle("notify_sl_hit", "⛔ Stop Loss Hit", "Alert when a trade hits the stop loss.")}
      ${ntoggle("notify_daily_loss", "🚨 Daily Loss Limit", "Alert when the daily loss limit is reached and trading is stopped.")}
    </div>

    <div class="settings-section">
      <h2>⚠️ System Alerts</h2>
      ${ntoggle("notify_token_expired", "🔑 Token Expired", "Alert when the Zerodha API token is invalid or expired.")}
      ${ntoggle("notify_crash", "💥 Bot Crash", "Alert when the bot crashes with an uncaught exception.")}
      ${ntoggle("notify_api_error", "🔌 API Errors", "Alert on repeated broker API failures.")}
    </div>
  </div>

  <div class="toast" id="toast"></div>
  <script>
    async function save(key, value) {
      const lbl = document.getElementById('lbl-' + key);
      const chk = document.getElementById('tog-' + key);
      try {
        const r = await fetch('/admin/settings/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value: value ? 'true' : 'false' })
        });
        if (r.ok) {
          lbl.textContent = value ? 'ON' : 'OFF';
          lbl.className = 'toggle-label ' + (value ? 'on' : 'off');
          showToast('✅ Saved');
        } else {
          chk.checked = !value;
          showToast('⚠️ Failed to save');
        }
      } catch(e) {
        chk.checked = !value;
        showToast('⚠️ Network error');
      }
    }
    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2200);
    }
  </script>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── GET /api/screen/csv ────────────────────────────────────────────────────────
app.get("/api/screen/csv", requireAuth, async (req: Request, res: Response) => {
  const f: ScreenerFilter = {
    minRoce:          req.query.minRoce     ? parseFloat(req.query.minRoce as string)     : undefined,
    maxRoce:          req.query.maxRoce     ? parseFloat(req.query.maxRoce as string)     : undefined,
    maxDe:            req.query.maxDe       ? parseFloat(req.query.maxDe as string)       : undefined,
    minPromoter:      req.query.minPromoter ? parseFloat(req.query.minPromoter as string) : undefined,
    maxPe:            req.query.maxPe       ? parseFloat(req.query.maxPe as string)       : undefined,
    minPe:            req.query.minPe       ? parseFloat(req.query.minPe as string)       : undefined,
    minPrice:         req.query.minPrice    ? parseFloat(req.query.minPrice as string)    : undefined,
    maxPrice:         req.query.maxPrice    ? parseFloat(req.query.maxPrice as string)    : undefined,
    minVolume:        req.query.minVolume   ? parseInt(req.query.minVolume as string, 10) : undefined,
    minMarketCap:     req.query.minMc       ? parseFloat(req.query.minMc as string)       : undefined,
    maxMarketCap:     req.query.maxMc       ? parseFloat(req.query.maxMc as string)       : undefined,
    minDividendYield: req.query.minDivYield ? parseFloat(req.query.minDivYield as string) : undefined,
    allProfitable:    req.query.allProfit === "1",
    profitUptrend:    req.query.uptrend  === "1",
    sector:           req.query.sector ? req.query.sector as string : undefined,
    sortBy:           (req.query.sortBy as string) || "roce",
    sortDir:          (req.query.sortDir as "asc" | "desc") || "desc",
    limit:            500,
  };
  const stocks = await screenStocks(f);
  const header = "Symbol,Company,Sector,Price,Change%,Volume,ROCE%,ROE%,D/E,Promoter%,PE,MarketCap_Cr,AllProfitable,ProfitUptrend";
  const csvRows = stocks.map(s => [
    s.symbol,
    `"${(s.company_name || "").replace(/"/g, '""')}"`,
    `"${(s.sector || "").replace(/"/g, '""')}"`,
    s.price?.toFixed(2) || "",
    s.change_pct?.toFixed(2) || "",
    s.volume || "",
    s.roce?.toFixed(2) || "",
    s.roe?.toFixed(2) || "",
    s.de_ratio?.toFixed(2) || "",
    s.promoter_pct?.toFixed(2) || "",
    s.pe_ratio?.toFixed(1) || "",
    s.market_cap?.toFixed(0) || "",
    s.all_profitable ? "Yes" : "No",
    s.profit_uptrend ? "Yes" : "No",
  ].join(","));
  const csv = [header, ...csvRows].join("\n");
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="zeroscreen-${date}.csv"`);
  res.send("\uFEFF" + csv); // BOM for Excel UTF-8 support
});

// ── GET /compare ──────────────────────────────────────────────────────────────
app.get("/compare", featureGate("feature_compare", "Compare"), premiumGate("compare_premium_only", "Compare"), async (req: Request, res: Response) => {
  const symbolsParam = (req.query.symbols as string || "").toUpperCase();
  const symbols = symbolsParam.split(",").map(s => s.trim()).filter(Boolean).slice(0, 5);

  // No symbols — show search/pick form
  if (symbols.length < 2) {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Compare Stocks — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("compare", req)}
  <div class="container">
    <div class="page-header">
      <h1>⚖️ Compare Stocks</h1>
      <p class="page-sub">Enter 2–5 NSE symbols to compare side-by-side</p>
    </div>
    <div class="cmp-pick-card">
      <div class="cmp-pick-inputs" id="cmpInputs">
        <div class="cmp-ac-wrap"><input class="input cmp-sym-input" placeholder="Symbol 1 e.g. RELIANCE" maxlength="20" autocomplete="off"><div class="cmp-ac-drop"></div></div>
        <div class="cmp-ac-wrap"><input class="input cmp-sym-input" placeholder="Symbol 2 e.g. TCS" maxlength="20" autocomplete="off"><div class="cmp-ac-drop"></div></div>
        <div class="cmp-ac-wrap"><input class="input cmp-sym-input" placeholder="Symbol 3 (optional)" maxlength="20" autocomplete="off"><div class="cmp-ac-drop"></div></div>
        <div class="cmp-ac-wrap"><input class="input cmp-sym-input" placeholder="Symbol 4 (optional)" maxlength="20" autocomplete="off"><div class="cmp-ac-drop"></div></div>
        <div class="cmp-ac-wrap"><input class="input cmp-sym-input" placeholder="Symbol 5 (optional)" maxlength="20" autocomplete="off"><div class="cmp-ac-drop"></div></div>
      </div>
      <div style="margin-top:20px;display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn-primary" onclick="goCompare()">⚖️ Compare</button>
        <a href="/" class="btn-secondary">← Back to Screener</a>
      </div>
      <p style="margin-top:14px;font-size:12px;color:var(--text-dim)">Tip: you can also tick checkboxes on the screener and use the Compare button there.</p>
    </div>
  </div>
  <script>
    function goCompare() {
      const syms = [...document.querySelectorAll('.cmp-sym-input')]
        .map(i => i.value.trim().toUpperCase().replace(/[^A-Z0-9&]/g,''))
        .filter(Boolean);
      if (syms.length < 2) { alert('Enter at least 2 symbols'); return; }
      window.location.href = '/compare?symbols=' + syms.join(',');
    }

    // Autocomplete
    let _acTimer = null;
    document.querySelectorAll('.cmp-ac-wrap').forEach(function(wrap) {
      const inp = wrap.querySelector('.cmp-sym-input');
      const drop = wrap.querySelector('.cmp-ac-drop');
      inp.addEventListener('input', function() {
        clearTimeout(_acTimer);
        const q = inp.value.trim();
        if (q.length < 1) { drop.innerHTML=''; drop.style.display='none'; return; }
        _acTimer = setTimeout(async function() {
          try {
            const r = await fetch('/api/search?q=' + encodeURIComponent(q));
            const items = await r.json();
            if (!items.length) { drop.innerHTML=''; drop.style.display='none'; return; }
            drop.innerHTML = items.map(function(it) {
              return '<div class="cmp-ac-item" data-sym="'+it.symbol+'">' +
                '<span class="cmp-ac-sym">'+it.symbol+'</span>' +
                '<span class="cmp-ac-name">'+it.company_name+'</span>' +
                '</div>';
            }).join('');
            drop.style.display = 'block';
          } catch(_) {}
        }, 180);
      });
      drop.addEventListener('mousedown', function(e) {
        const item = e.target.closest('.cmp-ac-item');
        if (!item) return;
        inp.value = item.dataset.sym;
        drop.innerHTML = ''; drop.style.display = 'none';
      });
      inp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { drop.innerHTML=''; drop.style.display='none'; goCompare(); }
        if (e.key === 'Escape') { drop.innerHTML=''; drop.style.display='none'; }
        if (e.key === 'ArrowDown') {
          const first = drop.querySelector('.cmp-ac-item'); if (first) first.focus();
        }
      });
      inp.addEventListener('blur', function() {
        setTimeout(function(){ drop.innerHTML=''; drop.style.display='none'; }, 200);
      });
    });
  </script>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
    return;
  }

  const stocks = (await Promise.all(symbols.map(sym => getStock(sym)))).filter(Boolean) as any[];
  if (stocks.length < 2) {
    res.redirect("/?error=stocks_not_found"); return;
  }

  const metrics: [string, string, (s: any) => string][] = [
    ["Price",        "₹",  s => s.price != null ? `₹${fmt(s.price, 2)}` : "—"],
    ["Change %",     "%",  s => s.change_pct != null ? `<span style="color:${changeColor(s.change_pct)}">${s.change_pct >= 0 ? "+" : ""}${fmt(s.change_pct, 2)}%</span>` : "—"],
    ["ROCE %",       "%",  s => `<span style="color:${roceColor(s.roce)}">${fmt(s.roce)}%</span>`],
    ["ROE %",        "%",  s => `${fmt(s.roe)}%`],
    ["D/E Ratio",    "",   s => `<span style="color:${deColor(s.de_ratio)}">${s.de_ratio === 0 ? "Debt-free 💎" : fmt(s.de_ratio)}</span>`],
    ["Promoter %",   "%",  s => `${fmt(s.promoter_pct)}%`],
    ["P/E Ratio",    "",   s => fmt(s.pe_ratio, 1)],
    ["EPS",          "₹",  s => `₹${fmt(s.eps, 1)}`],
    ["Book Value",   "₹",  s => `₹${fmt(s.book_value, 1)}`],
    ["Dividend Yld", "%",  s => `${fmt(s.dividend_yield)}%`],
    ["Current Ratio","",   s => fmt(s.current_ratio, 2)],
    ["Market Cap",   "",   s => fmtCr(s.market_cap)],
    ["Volume",       "",   s => fmtVol(s.volume)],
    ["All Profitable","",  s => s.all_profitable ? "✅ Yes" : "❌ No"],
    ["Profit Uptrend","",  s => s.profit_uptrend ? "↑ Yes" : "↓ No"],
    ["Sector",       "",   s => s.sector || "—"],
  ];

  const headerCols = stocks.map(s => `
    <th class="cmp-stock-col">
      <a href="/stock/${s.symbol}" class="sym-link">${s.symbol}</a>
      <div class="cmp-co-name">${s.company_name || ""}</div>
    </th>`).join("");

  const bodyRows = metrics.map(([label, , fn]) => `
    <tr>
      <td class="cmp-label">${label}</td>
      ${stocks.map(s => `<td class="cmp-val">${fn(s)}</td>`).join("")}
    </tr>`).join("");

  const symbolList = stocks.map(s => s.symbol).join(",");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Compare: ${symbolList} — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("compare", req)}
  <div class="container">
    <div class="page-header">
      <div>
        <a href="/" class="back-link">← Back to Screener</a>
        <h1>⚖️ Stock Comparison</h1>
      </div>
      <a href="/" class="btn-secondary">+ Add More Stocks</a>
    </div>
    <div class="table-wrap compare-table-wrap">
      <table class="stocks-table compare-table">
        <thead>
          <tr>
            <th class="cmp-label-col">Metric</th>
            ${headerCols}
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <div style="margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
      <button class="btn-primary" id="refreshAllBtn" onclick="refreshAll()">🔄 Refresh All Data</button>
      <a href="/compare" class="btn-secondary">⚖️ Compare Different Stocks</a>
      <a href="/" class="btn-ghost">← Back to Screener</a>
    </div>
    <p id="refreshNote" style="margin-top:10px;font-size:12px;color:var(--text-dim)">If values show —, click Refresh All Data to fetch fundamentals from screener.in</p>
  </div>
  <script>
    async function refreshAll() {
      const btn = document.getElementById('refreshAllBtn');
      const note = document.getElementById('refreshNote');
      btn.disabled = true; btn.textContent = 'Refreshing…';
      note.textContent = 'Fetching data for ${symbolList} — this may take 15–30 seconds…';
      const syms = '${symbolList}'.split(',');
      for (const sym of syms) {
        note.textContent = 'Fetching ' + sym + '…';
        try { await fetch('/api/refresh/stock/' + sym, {method:'POST'}); } catch(_) {}
      }
      location.reload();
    }
  </script>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── GET /alerts ───────────────────────────────────────────────────────────────
app.get("/alerts", requireAuth, featureGate("feature_alerts", "Alerts"), premiumGate("alerts_premium_only", "Alerts"), async (req: Request, res: Response) => {
  const alerts = await getAlerts(req.session.userId!);

  const cards = alerts.map(a => {
    let filters: Record<string, string> = {};
    try { filters = JSON.parse(a.filters_json); } catch (_) {}
    const qs = new URLSearchParams(filters).toString();
    const filterPills = Object.entries(filters)
      .filter(([, v]) => v && v !== "roce" && v !== "desc")
      .map(([k, v]) => `<span class="filter-pill">${k}: ${v}</span>`)
      .join("");
    return `
      <div class="alert-card">
        <div class="alert-card-header">
          <span class="alert-name">🔔 ${a.name}</span>
          <span class="alert-date">Saved ${new Date(a.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
        </div>
        <div class="alert-pills">${filterPills || '<span class="text-dim">No filters (matches all stocks)</span>'}</div>
        <div class="alert-actions">
          <a href="/?${qs}" class="btn-primary">▶ Run Now</a>
          <span class="alert-sent">${a.last_sent ? `Last emailed: ${new Date(a.last_sent).toLocaleDateString("en-IN")}` : "Email not sent yet"}</span>
          <button class="btn-danger" onclick="deleteAlert(${a.id})">Delete</button>
        </div>
      </div>`;
  }).join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Alerts — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("alerts", req)}
  <div class="container">
    <div class="page-header">
      <div>
        <h1>🔔 My Alerts</h1>
        <p class="page-sub">Daily email when stocks match your saved filters (sent weekday mornings)</p>
      </div>
      <a href="/" class="btn-primary">+ Create Alert from Screener</a>
    </div>
    <div class="alerts-grid">
      ${cards || `
        <div class="empty-state">
          <div class="empty-icon">🔔</div>
          <h2>No alerts yet</h2>
          <p>Go to the screener, set your filters, and click <strong>🔔 Save Alert</strong> to get daily emails.</p>
          <a href="/" class="btn-primary">Go to Screener →</a>
        </div>`}
    </div>
  </div>
  <script>
    async function deleteAlert(id) {
      if (!confirm('Delete this alert?')) return;
      const r = await fetch('/alerts/' + id, { method: 'DELETE' });
      if (r.ok) location.reload(); else alert('Error deleting alert');
    }
  </script>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// POST /alerts
app.post("/alerts", requireAuth, async (req: Request, res: Response) => {
  const { name, filtersJson } = req.body;
  if (!name || !filtersJson) { res.status(400).json({ error: "name and filtersJson required" }); return; }
  try { JSON.parse(filtersJson); } catch (_) { res.status(400).json({ error: "invalid filtersJson" }); return; }
  const id = await createAlert(req.session.userId!, name.trim().substring(0, 60), filtersJson);
  res.json({ id, ok: true });
});

// DELETE /alerts/:id
app.delete("/alerts/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
  await deleteAlert(id, req.session.userId!);
  res.json({ ok: true });
});

// ── GET /my-alerts — price alerts for specific stocks ─────────────────────────
app.get("/my-alerts", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const alerts = await getUserPriceAlerts(userId);
  const msg = esc(req.query.msg as string || "");
  const prefill = esc(req.query.symbol as string || "");

  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const rows = alerts.map(a => {
    const badge = a.active
      ? `<span class="pa-badge pa-active">${a.direction === "above" ? "▲ Above" : "▼ Below"} ₹${a.target_price.toLocaleString("en-IN")}</span>`
      : `<span class="pa-badge pa-done">✓ Triggered ${fmtDate(a.triggered_at)}</span>`;
    const del = a.active
      ? `<form method="POST" action="/my-alerts/${a.id}/delete" style="display:inline"><button class="btn-sm btn-ghost" onclick="return confirm('Delete this alert?')">✕</button></form>`
      : "";
    return `<tr>
      <td><a href="/stock/${esc(a.symbol)}" class="sym-link">${esc(a.symbol)}</a></td>
      <td>${badge}</td>
      <td class="pa-note">${esc(a.note || "—")}</td>
      <td class="pa-date">${fmtDate(a.created_at)}</td>
      <td>${del}</td>
    </tr>`;
  }).join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Price Alerts — ZeroScreen</title>
  ${seoMeta({ title: "Price Alerts — ZeroScreen", description: "Get email alerts when NSE stocks hit your target price.", url: "/my-alerts" })}
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .pa-wrap{max-width:760px;margin:0 auto;padding:24px 16px}
    .pa-hero{padding:20px 0 4px}
    .pa-hero h1{font-size:1.6rem;font-weight:800;margin-bottom:4px}
    .pa-hero p{color:var(--text-muted);font-size:.9rem;margin-bottom:20px}
    .pa-card{background:var(--bg-card);border:1px solid var(--border);border-radius:14px;overflow:hidden;box-shadow:var(--shadow-card)}
    .pa-form{padding:20px 20px 0}
    .pa-form h3{font-size:.95rem;font-weight:700;margin-bottom:12px;color:var(--text)}
    .pa-grid{display:grid;grid-template-columns:1fr 110px 120px 1fr;gap:8px;align-items:end}
    @media(max-width:600px){.pa-grid{grid-template-columns:1fr 1fr}}
    .pa-grid .form-group{margin:0}
    .pa-submit{margin:12px 0 16px}
    .pa-table{width:100%;border-collapse:collapse}
    .pa-table thead th{padding:9px 14px;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);border-bottom:2px solid var(--border);text-align:left;background:var(--bg3)}
    .pa-table tbody td{padding:10px 14px;border-bottom:1px solid var(--border);font-size:.88rem;vertical-align:middle}
    .pa-table tbody tr:last-child td{border-bottom:none}
    .pa-table tbody tr:hover td{background:var(--hover-bg)}
    .pa-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:.75rem;font-weight:700}
    .pa-active{background:rgba(16,185,129,.12);color:#10b981}
    .pa-done{background:var(--bg3);color:var(--text-muted)}
    .pa-note{color:var(--text-muted);font-size:.82rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pa-date{color:var(--text-dim);font-size:.78rem}
    .pa-empty{text-align:center;padding:40px;color:var(--text-muted);font-size:.9rem}
    .sym-link{font-weight:700;color:var(--primary);text-decoration:none}
    .sym-link:hover{text-decoration:underline}
    .msg-ok{background:rgba(16,185,129,.12);border:1px solid #10b981;border-radius:8px;padding:10px 16px;font-size:.88rem;color:#10b981;margin-bottom:16px}
  </style>
</head>
<body>
  ${nav("my-alerts", req)}
  <div class="pa-wrap">
    <div class="pa-hero">
      <h1>🎯 Price Alerts</h1>
      <p>Get an email when a stock crosses your target price. Alerts fire during market hours.</p>
    </div>
    ${msg === "created" ? `<div class="msg-ok">✓ Alert created! You'll get an email when the price is hit.</div>` : ""}
    ${msg === "deleted" ? `<div class="msg-ok">✓ Alert deleted.</div>` : ""}
    <div class="pa-card">
      <div class="pa-form">
        <h3>+ Set New Alert</h3>
        <form method="POST" action="/my-alerts">
          <div class="pa-grid">
            <div class="form-group">
              <label>Symbol (NSE)</label>
              <input type="text" name="symbol" value="${prefill}" placeholder="e.g. RELIANCE" class="form-input" required style="text-transform:uppercase">
            </div>
            <div class="form-group">
              <label>Direction</label>
              <select name="direction" class="form-input">
                <option value="above">▲ Above</option>
                <option value="below">▼ Below</option>
              </select>
            </div>
            <div class="form-group">
              <label>Target Price (₹)</label>
              <input type="number" name="target_price" placeholder="0.00" step="0.01" min="0.01" class="form-input" required>
            </div>
            <div class="form-group">
              <label>Note (optional)</label>
              <input type="text" name="note" maxlength="80" placeholder="e.g. breakout level" class="form-input">
            </div>
          </div>
          <div class="pa-submit"><button type="submit" class="btn-primary">Set Alert →</button></div>
        </form>
      </div>
      <table class="pa-table">
        <thead><tr>
          <th>Symbol</th><th>Alert</th><th>Note</th><th>Created</th><th></th>
        </tr></thead>
        <tbody>
          ${rows || `<tr><td colspan="5" class="pa-empty">No alerts yet. Set your first alert above!</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// POST /my-alerts — create price alert
app.post("/my-alerts", requireAuth, async (req: Request, res: Response) => {
  const { symbol, direction, target_price, note } = req.body;
  const sym = (symbol || "").toString().trim().toUpperCase().substring(0, 20);
  const dir = direction === "below" ? "below" : "above";
  const tp  = parseFloat(target_price);
  if (!sym || isNaN(tp) || tp <= 0) { res.redirect("/my-alerts?msg=error"); return; }
  await createPriceAlert(req.session.userId!, sym, tp, dir, note ? note.toString().trim().substring(0, 80) : undefined);
  res.redirect("/my-alerts?msg=created");
});

// POST /my-alerts/:id/delete
app.post("/my-alerts/:id/delete", requireAuth, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) { res.redirect("/my-alerts"); return; }
  await deletePriceAlert(id, req.session.userId!);
  res.redirect("/my-alerts?msg=deleted");
});

// ── JSON API ───────────────────────────────────────────────────────────────────
app.get("/api/screen", async (req: Request, res: Response) => {
  const f: ScreenerFilter = {
    minRoce:     req.query.minRoce     ? parseFloat(req.query.minRoce as string) : undefined,
    maxDe:       req.query.maxDe       ? parseFloat(req.query.maxDe as string)   : undefined,
    minPromoter: req.query.minPromoter ? parseFloat(req.query.minPromoter as string) : undefined,
    maxPe:       req.query.maxPe       ? parseFloat(req.query.maxPe as string)   : undefined,
    minPrice:    req.query.minPrice    ? parseFloat(req.query.minPrice as string) : undefined,
    maxPrice:    req.query.maxPrice    ? parseFloat(req.query.maxPrice as string) : undefined,
    minVolume:   req.query.minVolume   ? parseInt(req.query.minVolume as string, 10) : undefined,
    allProfitable: req.query.allProfit === "1",
    profitUptrend: req.query.uptrend  === "1",
    sortBy:      (req.query.sortBy as string) || "roce",
    sortDir:     (req.query.sortDir as "asc" | "desc") || "desc",
    limit:       Math.min(parseInt((req.query.limit as string) || "100", 10), 500),
  };
  res.json(await screenStocks(f));
});

app.get("/api/stock/:symbol", async (req: Request, res: Response) => {
  const s = await getStock(req.params.symbol.toUpperCase());
  if (!s) { res.status(404).json({ error: "Not found" }); return; }
  res.json(s);
});

app.get("/api/stats", async (_req: Request, res: Response) => {
  res.json(await getDbStats());
});

app.get("/api/search", async (req: Request, res: Response) => {
  const q = ((req.query.q as string) || "").trim();
  if (q.length < 1) { res.json([]); return; }
  const results = await searchStocks(q, 8);
  res.json(results);
});

// ── GET /my-notes — all research notes ────────────────────────────────────────
app.get("/my-notes", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const notes  = await getAllStockNotes(userId);
  const deleted = req.query.deleted as string || "";

  function timeAgo(isoStr: string): string {
    const diff = Date.now() - new Date(isoStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 2)  return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  const noteRows = notes.map(n => {
    const excerpt = n.content.length > 120 ? n.content.slice(0, 120).trimEnd() + "…" : n.content;
    return `
    <div class="mn-card">
      <div class="mn-card-hd">
        <a href="/stock/${esc(n.symbol)}" class="mn-sym">${esc(n.symbol)}</a>
        <span class="mn-time">${timeAgo(n.updated_at)}</span>
      </div>
      <p class="mn-excerpt">${esc(excerpt)}</p>
      <div class="mn-card-ft">
        <a href="/stock/${esc(n.symbol)}#notes" class="mn-edit-btn">✏️ Edit note</a>
        <form method="POST" action="/my-notes/${esc(n.symbol)}/delete" onsubmit="return confirm('Delete note for ${esc(n.symbol)}?')" style="display:inline">
          <button type="submit" class="mn-del-btn">🗑</button>
        </form>
      </div>
    </div>`;
  }).join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>My Research Notes — ZeroScreen</title>
  ${seoMeta({ title: "My Research Notes — ZeroScreen", description: "Your private stock research notes across all stocks.", url: "/my-notes" })}
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .mn-wrap{max-width:860px;margin:0 auto;padding:1.5rem .75rem 3rem}
    .mn-hdr{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;margin-bottom:1.4rem}
    .mn-title{font-size:1.2rem;font-weight:800;color:var(--text)}
    .mn-count{font-size:.78rem;color:var(--text-muted);margin-top:2px}
    .mn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
    .mn-card{background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:8px}
    .mn-card-hd{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .mn-sym{font-size:.92rem;font-weight:800;color:var(--accent);text-decoration:none}
    .mn-sym:hover{text-decoration:underline}
    .mn-time{font-size:.68rem;color:var(--text-muted);white-space:nowrap}
    .mn-excerpt{font-size:.8rem;color:var(--text-muted);line-height:1.55;margin:0;white-space:pre-wrap;word-break:break-word;flex:1}
    .mn-card-ft{display:flex;align-items:center;justify-content:space-between;margin-top:4px}
    .mn-edit-btn{font-size:.72rem;font-weight:700;color:var(--accent);text-decoration:none;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg2)}
    .mn-edit-btn:hover{background:var(--hover-bg)}
    .mn-del-btn{font-size:.78rem;background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px 8px;border-radius:6px}
    .mn-del-btn:hover{color:#ef4444;background:rgba(239,68,68,.08)}
    .mn-empty{text-align:center;padding:48px 24px;color:var(--text-muted)}
    .mn-empty h3{font-size:1rem;margin-bottom:8px;color:var(--text)}
    .mn-empty p{font-size:.82rem;margin-bottom:16px}
    .mn-del-flash{background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.3);color:#34d399;border-radius:8px;padding:9px 14px;font-size:.8rem;font-weight:600;margin-bottom:14px}
  </style>
</head>
<body>
  ${nav("my-notes", req)}
  <div class="mn-wrap">
    <div class="mn-hdr">
      <div>
        <div class="mn-title">📝 My Research Notes</div>
        <div class="mn-count">${notes.length} note${notes.length !== 1 ? "s" : ""} across ${notes.length} stock${notes.length !== 1 ? "s" : ""}</div>
      </div>
    </div>
    ${deleted ? `<div class="mn-del-flash">Note for <strong>${esc(deleted)}</strong> deleted.</div>` : ""}
    ${notes.length > 0
      ? `<div class="mn-grid">${noteRows}</div>`
      : `<div class="mn-empty">
           <h3>No research notes yet</h3>
           <p>Open any stock page and start writing private notes. They're saved automatically.</p>
           <a href="/" class="btn-primary">Browse Stocks →</a>
         </div>`}
  </div>
  <footer class="site-footer"><span>© 2026 ZeroScreen — Not investment advice. Invest at your own risk.</span></footer>
</body>
</html>`);
});

// ── POST /my-notes/:symbol/delete — delete a note ─────────────────────────────
app.post("/my-notes/:symbol/delete", requireAuth, async (req: Request, res: Response) => {
  const sym = req.params.symbol.toUpperCase().replace(/[^A-Z0-9&-]/g, "").substring(0, 20);
  await dbRun("DELETE FROM stock_notes WHERE user_id=? AND symbol=?", [req.session.userId!, sym]);
  res.redirect("/my-notes?deleted=" + encodeURIComponent(sym));
});

// ── Stock Notes API ────────────────────────────────────────────────────────────
app.get("/api/note/:symbol", requireAuth, async (req: Request, res: Response) => {
  const sym = req.params.symbol.toUpperCase().replace(/[^A-Z0-9&-]/g, "").substring(0, 20);
  const note = await getStockNote(req.session.userId!, sym);
  res.json({ content: note?.content ?? "", updated_at: note?.updated_at ?? null });
});

app.post("/api/note/:symbol", requireAuth, async (req: Request, res: Response) => {
  const sym = req.params.symbol.toUpperCase().replace(/[^A-Z0-9&-]/g, "").substring(0, 20);
  const content = ((req.body.content as string) || "").trim();
  await saveStockNote(req.session.userId!, sym, content);
  res.json({ ok: true });
});

app.get("/api/news", async (_req: Request, res: Response) => {
  res.json(await fetchMarketNews());
});

// ── GET /api/markets ─ live index prices from NSE India ──────────────────────
let _mktCache: any[] = [];
let _mktCacheAt = 0;
const NSE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-IN,en;q=0.9",
  "Referer": "https://www.nseindia.com/",
};

async function fetchNseMarkets(): Promise<any[]> {
  if (Date.now() - _mktCacheAt < 60_000 && _mktCache.length) return _mktCache;
  try {
    const idxRes = await fetch("https://www.nseindia.com/api/allIndices", {
      headers: NSE_HEADERS,
      signal: AbortSignal.timeout(9000)
    });
    if (!idxRes.ok) throw new Error(`NSE HTTP ${idxRes.status}`);
    const data = await idxRes.json() as any;
    const indices: any[] = data?.data || [];

    const pick = (name: string, label: string) => {
      const i = indices.find((x: any) => x.indexSymbol === name || x.index === name);
      if (!i) return null;
      return { symbol: name, label, price: i.last, change: i.variation, changePct: i.percentChange, region: "india" };
    };

    const results: any[] = [
      pick("NIFTY 50",         "NIFTY 50"),
      pick("NIFTY BANK",       "BANK NIFTY"),
      pick("NIFTY IT",         "NIFTY IT"),
      pick("NIFTY MIDCAP 100", "MIDCAP 100"),
      pick("INDIA VIX",        "INDIA VIX"),
    ].filter(Boolean) as any[];

    const fin = pick("NIFTY FINANCIAL SERVICES", "FIN NIFTY");
    if (fin) results.splice(1, 0, fin);

    if (results.length >= 3) { _mktCache = results; _mktCacheAt = Date.now(); }
    return results;
  } catch (e: any) {
    console.warn("[Markets]", e?.message);
    return _mktCache;
  }
}

let _globalCache: any[] = [];
let _globalCacheAt = 0;
const GLOBAL_SYMBOLS: [string, string][] = [
  ["^DJI",   "Dow Jones"],
  ["^IXIC",  "NASDAQ"],
  ["^GSPC",  "S&P 500"],
  ["^N225",  "Nikkei 225"],
  ["^HSI",   "Hang Seng"],
];

async function fetchGlobalMarkets(): Promise<any[]> {
  if (Date.now() - _globalCacheAt < 120_000 && _globalCache.length) return _globalCache;
  try {
    const results = await Promise.all(GLOBAL_SYMBOLS.map(async ([sym, label]) => {
      try {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
          { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) }
        );
        const d = await r.json() as any;
        const meta = d?.chart?.result?.[0]?.meta;
        const price: number = meta?.regularMarketPrice;
        const prev: number = meta?.chartPreviousClose ?? meta?.previousClose;
        const change = (price && prev) ? +(price - prev).toFixed(2) : 0;
        const changePct = (price && prev) ? +((price - prev) / prev * 100).toFixed(2) : 0;
        if (!price) return null;
        return { symbol: sym, label, price, change, changePct, region: "global" };
      } catch { return null; }
    }));
    const valid = results.filter(Boolean) as any[];
    if (valid.length >= 2) { _globalCache = valid; _globalCacheAt = Date.now(); }
    return valid.length ? valid : _globalCache;
  } catch (e: any) {
    console.warn("[GlobalMarkets]", e?.message);
    return _globalCache;
  }
}

app.get("/api/markets", async (_req: Request, res: Response) => {
  const [india, global] = await Promise.all([fetchNseMarkets(), fetchGlobalMarkets()]);
  res.json([...india, ...global]);
});

// ── GET /api/news/:symbol ─ stock-specific news from Google News RSS ──────────
app.get("/api/news/:symbol", async (req: Request, res: Response) => {
  const symbol = req.params.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const s = await getStock(symbol);
  // Build search query using company name + NSE to get relevant results
  const co = s?.company_name ? s.company_name.replace(/[^a-zA-Z0-9 ]/g, " ").trim() : symbol;
  const query = encodeURIComponent(`${co} NSE India stock`);
  const feedUrl = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
  try {
    const xml = await new Promise<string>((resolve, reject) => {
      const reqH = https.get(feedUrl, {
        timeout: 8000,
        headers: { "User-Agent": "ZeroScreen/1.0 RSS Reader", "Accept": "application/rss+xml,application/xml,*/*" },
      }, (r) => {
        if (r.statusCode && r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          https.get(r.headers.location, { timeout: 8000, headers: { "User-Agent": "ZeroScreen/1.0" } }, (r2) => {
            let d = ""; r2.on("data", c => d += c); r2.on("end", () => resolve(d));
          }).on("error", reject);
          return;
        }
        let d = ""; r.on("data", c => d += c); r.on("end", () => resolve(d));
      });
      reqH.on("error", reject);
      reqH.on("timeout", () => { reqH.destroy(); reject(new Error("timeout")); });
    });
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    const now = Date.now();
    const news = items.slice(0, 20).map(item => {
      const title   = (item.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/) || item.match(/<title>([^<]+)<\/title>/) || [])[1]?.trim() || "";
      const link    = (item.match(/<link>([^<]+)<\/link>/) || [])[1]?.trim() || "";
      const pubDate = (item.match(/<pubDate>([^<]+)<\/pubDate>/) || [])[1]?.trim() || "";
      const source  = (item.match(/<source[^>]*>([^<]+)<\/source>/) || item.match(/\.com\/([^/]+)/g) || [])[1]?.trim() || "";
      const ts = pubDate ? new Date(pubDate).getTime() : 0;
      const diffMs = now - ts;
      const diffH  = diffMs / 3600000;
      let period: string;
      if (diffH < 24)        period = "Today";
      else if (diffH < 48)   period = "Yesterday";
      else if (diffH < 168)  period = "Last 7 Days";
      else                   period = "Older";
      return { title, link, pubDate, source, period, ts };
    }).filter(n => n.title && n.link);
    res.json(news);
  } catch {
    res.json([]);
  }
});

app.post("/api/refresh/prices", async (_req: Request, res: Response) => {
  try {
    const count = await refreshPrices();
    res.json({ ok: true, count });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/refresh/fundamentals", requireAdmin, async (_req: Request, res: Response) => {
  try {
    // Fire and forget — runs in background
    refreshFundamentals().catch(e => console.error("[API] fundamentals error:", e.message));
    const stats = await getDbStats();
    res.json({ ok: true, message: `Running in background. Currently ${stats.fetched}/${stats.total} stocks fetched.` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/refresh/stock/:symbol", async (req: Request, res: Response) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const f = await fetchFundamentals(symbol);
    if (f.error) { res.status(400).json({ error: f.error }); return; }
    upsertStock({
      symbol,
      company_name: f.companyName, sector: f.sector, market_cap: f.marketCap,
      pe_ratio: f.peRatio, roce: f.roce, roe: f.roe, de_ratio: f.deRatio,
      promoter_pct: f.promoterPct, eps: f.eps, book_value: f.bookValue,
      dividend_yield: f.dividendYield, current_ratio: f.currentRatio,
      net_profit_1: f.netProfits[f.netProfits.length - 3] ?? null,
      net_profit_2: f.netProfits[f.netProfits.length - 2] ?? null,
      net_profit_3: f.netProfits[f.netProfits.length - 1] ?? null,
      revenue_1: f.revenues[f.revenues.length - 3] ?? null,
      revenue_2: f.revenues[f.revenues.length - 2] ?? null,
      revenue_3: f.revenues[f.revenues.length - 1] ?? null,
      all_profitable: f.allProfitable ? 1 : 0,
      profit_uptrend: f.profitUptrend ? 1 : 0,
      week52_high: f.week52High,
      week52_low:  f.week52Low,
      about:       f.about,
      incorporated: f.incorporated,
      screener_data: JSON.stringify({ netProfits: f.netProfits, revenues: f.revenues }),
      fetch_error: null, fetched_at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /contact ──────────────────────────────────────────────────────────────
app.get("/contact", featureGate("feature_contact", "Contact"), premiumGate("contact_premium_only", "Contact"), (req: Request, res: Response) => {
  const success = req.query.sent === "1";
  const error   = req.query.error as string | undefined;
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Contact Us — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("contact", req)}
  <div class="container">
    <div class="contact-wrap">
      <div class="contact-left">
        <div class="contact-tag">Get in touch</div>
        <h1>We'd love to hear from you</h1>
        <p class="contact-desc">Whether you're interested in acquiring ZeroScreen, want to collaborate, have a feature request, or just want to say hello — drop us a message and we'll get back to you within 24 hours.</p>
        <div class="contact-cards">
          <div class="contact-info-card">
            <span class="cic-icon">💼</span>
            <div>
              <div class="cic-title">Business &amp; Acquisition</div>
              <div class="cic-desc">Interested in buying or partnering? Let's talk.</div>
            </div>
          </div>
          <div class="contact-info-card">
            <span class="cic-icon">🛠️</span>
            <div>
              <div class="cic-title">Feature Requests</div>
              <div class="cic-desc">Have an idea to make ZeroScreen better?</div>
            </div>
          </div>
          <div class="contact-info-card">
            <span class="cic-icon">🐛</span>
            <div>
              <div class="cic-title">Bug Reports</div>
              <div class="cic-desc">Found something broken? Tell us.</div>
            </div>
          </div>
          <div class="contact-info-card">
            <span class="cic-icon">💬</span>
            <div>
              <div class="cic-title">General Enquiry</div>
              <div class="cic-desc">Any other question or feedback.</div>
            </div>
          </div>
        </div>
        <div style="margin-top:22px;padding:14px 16px;background:rgba(59,130,246,0.07);border:1px solid rgba(59,130,246,0.2);border-radius:12px;display:flex;align-items:center;gap:12px;">
          <span style="font-size:1.4rem;flex-shrink:0;">📧</span>
          <div>
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Email us directly</div>
            <a href="mailto:support@zeroscreen.in" style="font-size:15px;font-weight:700;color:#60a5fa;text-decoration:none;letter-spacing:-0.2px;">support@zeroscreen.in</a>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">We reply within 24 hours</div>
          </div>
        </div>
      </div>
      <div class="contact-right">
        <div class="contact-form-card">
          <h2>Send us a message</h2>
          ${success ? '<div class="auth-success">✅ Message sent! We\'ll reply within 24 hours.</div>' : ''}
          ${error   ? `<div class="auth-error">${esc(error)}</div>` : ''}
          <form class="auth-form" method="POST" action="/contact">
            <div class="form-group">
              <label>Your Name</label>
              <input type="text" name="name" placeholder="Rahul Sharma" required>
            </div>
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" name="email" placeholder="you@example.com" required>
            </div>
            <div class="form-group">
              <label>Subject</label>
              <select name="subject" style="width:100%;background:var(--bg3);border:1.5px solid var(--border);color:var(--text);padding:11px 14px;border-radius:9px;font-size:14px;outline:none;font-family:inherit;">
                <option value="Acquisition / Purchase Inquiry">💼 Acquisition / Purchase Inquiry</option>
                <option value="Feature Request">🛠️ Feature Request</option>
                <option value="Partnership / Collaboration">🤝 Partnership / Collaboration</option>
                <option value="Bug Report">🐛 Bug Report</option>
                <option value="General Enquiry">💬 General Enquiry</option>
              </select>
            </div>
            <div class="form-group">
              <label>Message</label>
              <textarea name="message" placeholder="Tell us more..." required rows="5" style="width:100%;background:var(--bg3);border:1.5px solid var(--border);color:var(--text);padding:11px 14px;border-radius:9px;font-size:14px;outline:none;font-family:inherit;resize:vertical;transition:border-color 0.15s;"></textarea>
            </div>
            <button type="submit" class="btn-auth">Send Message →</button>
          </form>
        </div>
      </div>
    </div>
  </div>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// POST /contact
app.post("/contact", async (req: Request, res: Response) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) {
    res.redirect("/contact?error=Name%2C+email+and+message+are+required"); return;
  }
  sendContactNotification(name, email, subject || "General Enquiry", message).catch(() => {});
  res.redirect("/contact?sent=1");
});

// ── /learn — helper ────────────────────────────────────────────────────────────
function learnLayout(req: Request, active: string, title: string, metaDesc: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)} — ZeroScreen</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("learn", req)}
  <div class="lrn-wrap">
    ${body}
  </div>
  <script src="/public/js/app.js"></script>
</body>
</html>`;
}

// ── GET /learn ─────────────────────────────────────────────────────────────────
app.get("/learn", (req: Request, res: Response) => {
  const topics = [
    { slug: "basics",            icon: "📈", title: "Stock Market Basics",       desc: "What is a stock, how BSE & NSE work, and why you should invest.",       level: "Beginner", mins: 5 },
    { slug: "intraday",          icon: "⚡", title: "Intraday Trading Guide",    desc: "How intraday works, key rules, risk management, and common mistakes.",   level: "Beginner", mins: 7 },
    { slug: "candles",           icon: "🕯", title: "Candlestick Patterns",      desc: "Read OHLC candles and spot reversal & continuation patterns.",           level: "Intermediate", mins: 8 },
    { slug: "screener-guide",    icon: "🔍", title: "How to Use the Screener",   desc: "Filter 1,700+ NSE stocks by ROCE, D/E, P/E, strategies and more.",      level: "Beginner", mins: 4 },
    { slug: "paper-trade-guide", icon: "💰", title: "Paper Trading Guide",       desc: "Practice buying & selling with ₹1,00,000 virtual money — zero risk.",   level: "Beginner", mins: 5 },
    { slug: "signals-guide",     icon: "📡", title: "Reading Bot Signals",       desc: "Understand the BANKNIFTY bot — entries, stop losses, and P&L.",         level: "Intermediate", mins: 6 },
  ];
  const cards = topics.map(t => `
    <a href="/learn/${t.slug}" class="lrn-card">
      <div class="lrn-card-icon">${t.icon}</div>
      <div class="lrn-card-body">
        <div class="lrn-card-title">${t.title}</div>
        <div class="lrn-card-desc">${t.desc}</div>
        <div class="lrn-card-meta">
          <span class="lrn-level lrn-level-${t.level.toLowerCase().replace(" ","")}">${t.level}</span>
          <span class="lrn-mins">⏱ ${t.mins} min read</span>
        </div>
      </div>
      <span class="lrn-arrow">→</span>
    </a>`).join("");

  res.send(learnLayout(req, "learn", "Learn — Beginner Guides", "Free guides to help you understand stock markets, intraday trading, candlestick patterns, and ZeroScreen tools.",
  `<div class="lrn-hero">
    <h1>📚 Learn — Trading & Investing Guides</h1>
    <p class="lrn-hero-sub">From complete beginner to confident trader — free guides curated for Indian markets.</p>
  </div>
  <div class="lrn-grid">${cards}</div>
  <div class="lrn-cta-bar">
    <span>Ready to practice?</span>
    <a href="/my-paper-trade" class="lrn-cta-btn">💰 Start Paper Trading →</a>
  </div>`));
});

// ── GET /learn/basics ──────────────────────────────────────────────────────────
app.get("/learn/basics", (req: Request, res: Response) => {
  res.send(learnLayout(req, "learn", "Stock Market Basics", "Learn what stocks are, how BSE and NSE work, and why investing matters for Indian retail investors.",
  `<div class="lrn-article">
    <a href="/learn" class="lrn-back">← All Guides</a>
    <div class="lrn-article-hdr">
      <span class="lrn-art-icon">📈</span>
      <div>
        <h1>Stock Market Basics</h1>
        <div class="lrn-art-meta"><span class="lrn-level lrn-level-beginner">Beginner</span> · <span>⏱ 5 min read</span></div>
      </div>
    </div>

    <div class="lrn-section">
      <h2>What is a stock?</h2>
      <p>A <strong>stock</strong> (also called a share or equity) is a small ownership stake in a company. When you buy 1 share of Reliance Industries, you own a tiny fraction of that company. If Reliance grows and becomes more valuable, your share is worth more. If it struggles, your share is worth less.</p>
      <div class="lrn-callout lrn-callout-green">
        <strong>💡 Simple example:</strong> If a company is worth ₹1,00,000 and is divided into 1,000 shares, each share is worth ₹100. Buy 10 shares and you own 1% of the company for ₹1,000.
      </div>
    </div>

    <div class="lrn-section">
      <h2>NSE vs BSE — what's the difference?</h2>
      <p>India has two major stock exchanges:</p>
      <div class="lrn-table-wrap">
        <table class="lrn-table">
          <thead><tr><th></th><th>NSE</th><th>BSE</th></tr></thead>
          <tbody>
            <tr><td>Full name</td><td>National Stock Exchange</td><td>Bombay Stock Exchange</td></tr>
            <tr><td>Founded</td><td>1992</td><td>1875 (Asia's oldest)</td></tr>
            <tr><td>Index</td><td>Nifty 50</td><td>Sensex 30</td></tr>
            <tr><td>Stocks listed</td><td>~1,800</td><td>~5,500</td></tr>
            <tr><td>Volume</td><td>Higher for F&amp;O</td><td>Higher for smaller stocks</td></tr>
          </tbody>
        </table>
      </div>
      <p>Most active traders use <strong>NSE</strong> because it has higher liquidity for F&amp;O (Futures &amp; Options) trading. ZeroScreen data comes from NSE.</p>
    </div>

    <div class="lrn-section">
      <h2>How does the market work?</h2>
      <p>The stock market is open <strong>Monday–Friday, 9:15 AM to 3:30 PM IST</strong>. Buyers and sellers are matched electronically through a system called the order book.</p>
      <ul class="lrn-list">
        <li><strong>Market order:</strong> Buy/sell at current market price immediately.</li>
        <li><strong>Limit order:</strong> Set a specific price you're willing to pay/sell at.</li>
        <li><strong>Demat account:</strong> Where your shares are held electronically (like a bank account for stocks).</li>
        <li><strong>Broker:</strong> Intermediary like Zerodha, Upstox, or ICICI Direct who execute your orders.</li>
      </ul>
    </div>

    <div class="lrn-section">
      <h2>Key things to know before investing</h2>
      <div class="lrn-callout lrn-callout-amber">
        <strong>⚠️ Important:</strong> Stock markets involve real financial risk. Never invest money you can't afford to lose. Always do your own research.
      </div>
      <ul class="lrn-list">
        <li><strong>Diversify:</strong> Don't put all your money in one stock or sector.</li>
        <li><strong>Long-term thinking:</strong> Historically, markets go up over long periods despite short-term volatility.</li>
        <li><strong>Fundamentals matter:</strong> Revenue, profit, debt, and management quality drive long-term stock value.</li>
        <li><strong>ROCE & ROE:</strong> Two of the best metrics to judge a company's efficiency — ZeroScreen filters by these by default.</li>
      </ul>
    </div>

    <div class="lrn-nav-btns">
      <span></span>
      <a href="/learn/intraday" class="lrn-nav-btn lrn-nav-btn-next">Next: Intraday Trading Guide →</a>
    </div>

    <div class="lrn-bottom-cta">
      <strong>Want to practice without risking real money?</strong>
      <a href="/my-paper-trade" class="lrn-cta-btn">💰 Try Paper Trading Free →</a>
    </div>
  </div>`));
});

// ── GET /learn/intraday ────────────────────────────────────────────────────────
app.get("/learn/intraday", (req: Request, res: Response) => {
  res.send(learnLayout(req, "learn", "Intraday Trading Guide", "Learn how intraday trading works in NSE, key rules, margin, risk management and common mistakes to avoid.",
  `<div class="lrn-article">
    <a href="/learn" class="lrn-back">← All Guides</a>
    <div class="lrn-article-hdr">
      <span class="lrn-art-icon">⚡</span>
      <div>
        <h1>Intraday Trading Guide</h1>
        <div class="lrn-art-meta"><span class="lrn-level lrn-level-beginner">Beginner</span> · <span>⏱ 7 min read</span></div>
      </div>
    </div>

    <div class="lrn-section">
      <h2>What is intraday trading?</h2>
      <p>In <strong>intraday trading</strong>, you buy and sell stocks within the <em>same trading day</em>. You do not hold any position overnight. All open positions are automatically squared off at 3:20 PM IST by most brokers.</p>
      <div class="lrn-callout lrn-callout-green">
        <strong>💡 Key difference:</strong> Delivery trading = you hold shares for days/months. Intraday = everything is closed by end of day.
      </div>
    </div>

    <div class="lrn-section">
      <h2>Why do people trade intraday?</h2>
      <ul class="lrn-list">
        <li><strong>Leverage / margin:</strong> Brokers give 3–5× leverage intraday. ₹1,000 controls ₹5,000 worth of stock.</li>
        <li><strong>No overnight risk:</strong> News, global events, results don't affect you after market close.</li>
        <li><strong>Daily income potential:</strong> Skilled traders aim for consistent daily profits.</li>
      </ul>
    </div>

    <div class="lrn-section">
      <h2>How intraday P&amp;L works</h2>
      <div class="lrn-table-wrap">
        <table class="lrn-table">
          <thead><tr><th>Action</th><th>Example</th><th>P&amp;L</th></tr></thead>
          <tbody>
            <tr><td>Buy 100 shares at ₹500 → sell at ₹510</td><td>+₹10/share × 100</td><td class="lrn-green">+₹1,000</td></tr>
            <tr><td>Buy 100 shares at ₹500 → sell at ₹490</td><td>−₹10/share × 100</td><td class="lrn-red">−₹1,000</td></tr>
          </tbody>
        </table>
      </div>
      <p>Plus brokerage charges: typically 0.01–0.03% per side + STT, GST, exchange charges. Always factor in costs.</p>
    </div>

    <div class="lrn-section">
      <h2>The 5 golden rules of intraday trading</h2>
      <ol class="lrn-list">
        <li><strong>Always set a stop loss.</strong> Decide your maximum loss before entering a trade. If the stock falls to that level, exit immediately — no exceptions.</li>
        <li><strong>Risk only 1–2% per trade.</strong> If you have ₹50,000 capital, risk ₹500–₹1,000 per trade maximum.</li>
        <li><strong>Trade with the trend.</strong> Don't fight the market. "The trend is your friend."</li>
        <li><strong>Avoid trading in the first 15 minutes.</strong> 9:15–9:30 AM is highly volatile. Wait for the market to settle.</li>
        <li><strong>Book profits, don't be greedy.</strong> A 1:2 risk-reward ratio (risk ₹500 to make ₹1,000) is the minimum you should aim for.</li>
      </ol>
    </div>

    <div class="lrn-section">
      <h2>Common mistakes beginners make</h2>
      <ul class="lrn-list">
        <li>❌ Trading without a stop loss ("it'll recover")</li>
        <li>❌ Overtrading — taking too many positions at once</li>
        <li>❌ Revenge trading — trying to recover losses by taking bigger risks</li>
        <li>❌ Following tips from Telegram groups blindly</li>
        <li>❌ Trading illiquid stocks with large bid-ask spreads</li>
      </ul>
      <div class="lrn-callout lrn-callout-amber">
        <strong>⚠️ Most beginners lose money intraday.</strong> Practice with paper trading first — get confident with your strategy before using real money.
      </div>
    </div>

    <div class="lrn-nav-btns">
      <a href="/learn/basics" class="lrn-nav-btn lrn-nav-btn-prev">← Stock Market Basics</a>
      <a href="/learn/candles" class="lrn-nav-btn lrn-nav-btn-next">Next: Candlestick Patterns →</a>
    </div>
    <div class="lrn-bottom-cta">
      <strong>Practice intraday with zero risk</strong>
      <a href="/my-paper-trade" class="lrn-cta-btn">💰 Start Paper Trading →</a>
    </div>
  </div>`));
});

// ── GET /learn/candles ─────────────────────────────────────────────────────────
app.get("/learn/candles", (req: Request, res: Response) => {
  res.send(learnLayout(req, "learn", "Candlestick Patterns", "Learn to read OHLC candlestick charts and identify key reversal and continuation patterns used in technical analysis.",
  `<div class="lrn-article">
    <a href="/learn" class="lrn-back">← All Guides</a>
    <div class="lrn-article-hdr">
      <span class="lrn-art-icon">🕯</span>
      <div>
        <h1>Candlestick Patterns</h1>
        <div class="lrn-art-meta"><span class="lrn-level lrn-level-intermediate">Intermediate</span> · <span>⏱ 8 min read</span></div>
      </div>
    </div>

    <div class="lrn-section">
      <h2>What is a candlestick?</h2>
      <p>A <strong>candlestick</strong> represents price movement in a given time period (1 min, 5 min, 1 hour, 1 day). It shows 4 values: <strong>Open, High, Low, Close (OHLC)</strong>.</p>
      <div class="lrn-candle-demo">
        <div class="lrn-candle-diagram">
          <div class="lrn-candle-row">
            <div class="lrn-candle-box lrn-candle-bull">
              <div class="lrn-candle-wick-top"></div>
              <div class="lrn-candle-body-bull"></div>
              <div class="lrn-candle-wick-bot"></div>
              <span class="lrn-candle-lbl lrn-candle-lbl-top">High</span>
              <span class="lrn-candle-lbl lrn-candle-lbl-open">Close (higher)</span>
              <span class="lrn-candle-lbl lrn-candle-lbl-close">Open (lower)</span>
              <span class="lrn-candle-lbl lrn-candle-lbl-bot">Low</span>
            </div>
            <div class="lrn-candle-box lrn-candle-bear">
              <div class="lrn-candle-wick-top"></div>
              <div class="lrn-candle-body-bear"></div>
              <div class="lrn-candle-wick-bot"></div>
              <span class="lrn-candle-lbl lrn-candle-lbl-top">High</span>
              <span class="lrn-candle-lbl lrn-candle-lbl-open">Open (higher)</span>
              <span class="lrn-candle-lbl lrn-candle-lbl-close">Close (lower)</span>
              <span class="lrn-candle-lbl lrn-candle-lbl-bot">Low</span>
            </div>
          </div>
          <div class="lrn-candle-legend">
            <span class="lrn-candle-legend-bull">● Bullish (Green)</span>
            <span class="lrn-candle-legend-bear">● Bearish (Red)</span>
          </div>
        </div>
      </div>
    </div>

    <div class="lrn-section">
      <h2>Key reversal patterns</h2>

      <div class="lrn-pattern-grid">
        <div class="lrn-pattern-card lrn-pattern-bull">
          <div class="lrn-pattern-name">🔼 Hammer</div>
          <div class="lrn-pattern-mini">
            <div class="lrn-mini-candle lrn-mini-hammer"></div>
          </div>
          <div class="lrn-pattern-desc">Small body at top, long lower wick. Appears at <strong>bottom of downtrend</strong>. Signal: bulls rejected lower prices — reversal likely.</div>
        </div>
        <div class="lrn-pattern-card lrn-pattern-bear">
          <div class="lrn-pattern-name">🔽 Shooting Star</div>
          <div class="lrn-pattern-mini">
            <div class="lrn-mini-candle lrn-mini-shooting"></div>
          </div>
          <div class="lrn-pattern-desc">Small body at bottom, long upper wick. Appears at <strong>top of uptrend</strong>. Signal: bears rejected higher prices — reversal likely.</div>
        </div>
        <div class="lrn-pattern-card lrn-pattern-bull">
          <div class="lrn-pattern-name">🔼 Bullish Engulfing</div>
          <div class="lrn-pattern-mini lrn-mini-pair">
            <div class="lrn-mini-candle lrn-mini-bear-small"></div>
            <div class="lrn-mini-candle lrn-mini-bull-large"></div>
          </div>
          <div class="lrn-pattern-desc">Large green candle completely covers previous red candle. Strong bullish reversal signal at end of downtrend.</div>
        </div>
        <div class="lrn-pattern-card lrn-pattern-bear">
          <div class="lrn-pattern-name">🔽 Bearish Engulfing</div>
          <div class="lrn-pattern-mini lrn-mini-pair">
            <div class="lrn-mini-candle lrn-mini-bull-small"></div>
            <div class="lrn-mini-candle lrn-mini-bear-large"></div>
          </div>
          <div class="lrn-pattern-desc">Large red candle completely covers previous green candle. Strong bearish reversal signal at end of uptrend.</div>
        </div>
        <div class="lrn-pattern-card lrn-pattern-neutral">
          <div class="lrn-pattern-name">◆ Doji</div>
          <div class="lrn-pattern-mini">
            <div class="lrn-mini-candle lrn-mini-doji"></div>
          </div>
          <div class="lrn-pattern-desc">Open and close are almost equal. Indecision in the market. Often precedes a big move — watch for the next candle's direction.</div>
        </div>
        <div class="lrn-pattern-card lrn-pattern-bull">
          <div class="lrn-pattern-name">🔼 Morning Star</div>
          <div class="lrn-pattern-mini lrn-mini-three">
            <div class="lrn-mini-candle lrn-mini-bear-large"></div>
            <div class="lrn-mini-candle lrn-mini-doji"></div>
            <div class="lrn-mini-candle lrn-mini-bull-large"></div>
          </div>
          <div class="lrn-pattern-desc">3-candle pattern: big red, small doji/hammer, big green. Powerful bottom reversal signal.</div>
        </div>
      </div>
    </div>

    <div class="lrn-section">
      <h2>Tips for using candlestick patterns</h2>
      <ul class="lrn-list">
        <li>Always use patterns with <strong>volume confirmation</strong> — a reversal candle on high volume is much more reliable.</li>
        <li>Look at the <strong>broader trend</strong> first — a hammer in an uptrend means nothing.</li>
        <li>Use <strong>support/resistance levels</strong> as context — patterns at key levels carry more weight.</li>
        <li>Never trade a pattern in isolation — combine with RSI, MACD, or moving averages for confirmation.</li>
      </ul>
    </div>

    <div class="lrn-nav-btns">
      <a href="/learn/intraday" class="lrn-nav-btn lrn-nav-btn-prev">← Intraday Guide</a>
      <a href="/learn/screener-guide" class="lrn-nav-btn lrn-nav-btn-next">Next: Screener Guide →</a>
    </div>
    <div class="lrn-bottom-cta">
      <strong>See live NSE stock charts</strong>
      <a href="/" class="lrn-cta-btn">🔍 Open Screener →</a>
    </div>
  </div>`));
});

// ── GET /learn/screener-guide ──────────────────────────────────────────────────
app.get("/learn/screener-guide", (req: Request, res: Response) => {
  res.send(learnLayout(req, "learn", "How to Use the ZeroScreen Screener", "Learn how to filter 1,700+ NSE stocks by ROCE, debt, P/E, promoter holding and built-in strategies.",
  `<div class="lrn-article">
    <a href="/learn" class="lrn-back">← All Guides</a>
    <div class="lrn-article-hdr">
      <span class="lrn-art-icon">🔍</span>
      <div>
        <h1>How to Use the Screener</h1>
        <div class="lrn-art-meta"><span class="lrn-level lrn-level-beginner">Beginner</span> · <span>⏱ 4 min read</span></div>
      </div>
    </div>

    <div class="lrn-section">
      <h2>What is a stock screener?</h2>
      <p>A stock screener lets you <strong>filter thousands of stocks</strong> down to a handful that match your criteria. Instead of checking each company manually, you set rules and the screener finds matches instantly.</p>
      <p>ZeroScreen covers <strong>1,700+ NSE stocks</strong> with end-of-day prices updated from NSE and weekly fundamentals.</p>
    </div>

    <div class="lrn-section">
      <h2>Key filters explained</h2>
      <div class="lrn-table-wrap">
        <table class="lrn-table">
          <thead><tr><th>Filter</th><th>What it means</th><th>Good range</th></tr></thead>
          <tbody>
            <tr><td><strong>ROCE %</strong></td><td>Return on Capital Employed — how efficiently the company uses capital</td><td class="lrn-green">&gt; 15%</td></tr>
            <tr><td><strong>ROE %</strong></td><td>Return on Equity — profit relative to shareholders' equity</td><td class="lrn-green">&gt; 15%</td></tr>
            <tr><td><strong>D/E Ratio</strong></td><td>Debt-to-Equity — how much debt vs equity</td><td class="lrn-green">&lt; 1.0 (lower is safer)</td></tr>
            <tr><td><strong>P/E Ratio</strong></td><td>Price-to-Earnings — how expensive the stock is relative to earnings</td><td>Depends on sector</td></tr>
            <tr><td><strong>Promoter %</strong></td><td>Percentage of shares held by founders/promoters</td><td class="lrn-green">&gt; 50%</td></tr>
            <tr><td><strong>All Profitable</strong></td><td>Company has been profitable in all recent years</td><td class="lrn-green">✅ Yes</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="lrn-section">
      <h2>Using built-in strategies</h2>
      <p>ZeroScreen has <strong>14 one-click strategies</strong> at the top of the screener. Click any strategy card to instantly apply a preset filter combination:</p>
      <ul class="lrn-list">
        <li><strong>Quality Growth</strong> — High ROCE + low debt + profit uptrend (Buffett style)</li>
        <li><strong>High ROCE</strong> — Companies earning &gt;20% return on capital</li>
        <li><strong>Debt Free</strong> — Zero or near-zero debt companies only</li>
        <li><strong>Dividend Kings</strong> — High dividend yield stocks</li>
        <li><strong>Momentum</strong> — Stocks near 52-week highs (price momentum)</li>
        <li><strong>Undervalued</strong> — Low P/E ratio relative to earnings</li>
      </ul>
    </div>

    <div class="lrn-section">
      <h2>Step-by-step: find your first stock</h2>
      <ol class="lrn-list">
        <li>Go to the <a href="/" class="lrn-link">Stock Screener</a></li>
        <li>Click the <strong>"Quality Growth"</strong> strategy card to apply a proven filter set</li>
        <li>Look at the results — review ROCE, D/E, and profit history columns</li>
        <li>Click any stock symbol to open its detail page (price chart, fundamentals, sector peers)</li>
        <li>Add interesting stocks to your <a href="/watchlists" class="lrn-link">Watchlist</a> (requires free account)</li>
      </ol>
    </div>

    <div class="lrn-nav-btns">
      <a href="/learn/candles" class="lrn-nav-btn lrn-nav-btn-prev">← Candlestick Patterns</a>
      <a href="/learn/paper-trade-guide" class="lrn-nav-btn lrn-nav-btn-next">Next: Paper Trade Guide →</a>
    </div>
    <div class="lrn-bottom-cta">
      <strong>Try the screener now — no login needed</strong>
      <a href="/?strategy=quality_growth" class="lrn-cta-btn">🔍 Open Screener →</a>
    </div>
  </div>`));
});

// ── GET /learn/paper-trade-guide ───────────────────────────────────────────────
app.get("/learn/paper-trade-guide", (req: Request, res: Response) => {
  res.send(learnLayout(req, "learn", "Paper Trading Guide", "Learn how to use ZeroScreen's paper trading feature to practice buying and selling stocks with ₹1,00,000 virtual money.",
  `<div class="lrn-article">
    <a href="/learn" class="lrn-back">← All Guides</a>
    <div class="lrn-article-hdr">
      <span class="lrn-art-icon">💰</span>
      <div>
        <h1>Paper Trading Guide</h1>
        <div class="lrn-art-meta"><span class="lrn-level lrn-level-beginner">Beginner</span> · <span>⏱ 5 min read</span></div>
      </div>
    </div>

    <div class="lrn-section">
      <h2>What is paper trading?</h2>
      <p><strong>Paper trading</strong> (also called virtual trading or simulated trading) lets you practice buying and selling stocks with fake money — but using real market prices. You get all the experience of trading without the risk of losing real money.</p>
      <div class="lrn-callout lrn-callout-green">
        <strong>💡 ZeroScreen gives every new member ₹1,00,000 virtual balance</strong> to practice with. Completely free.
      </div>
    </div>

    <div class="lrn-section">
      <h2>Why paper trade first?</h2>
      <ul class="lrn-list">
        <li>Build confidence before risking real capital</li>
        <li>Test your strategy — see if your ideas actually work</li>
        <li>Understand how slippage, charges, and market timing affect returns</li>
        <li>Track your win rate and P&amp;L over time</li>
        <li>Learn the mechanics: how to enter, set stop loss, and book profits</li>
      </ul>
    </div>

    <div class="lrn-section">
      <h2>How to make your first paper trade</h2>
      <ol class="lrn-list">
        <li><a href="/signup" class="lrn-link">Create a free account</a> — you get ₹1,00,000 virtual balance instantly</li>
        <li>Go to <a href="/" class="lrn-link">the screener</a> and find a stock you want to buy</li>
        <li>Click the stock symbol → open stock detail page</li>
        <li>Click <strong>"Buy (Paper)"</strong> → enter quantity → confirm</li>
        <li>Track your position in <a href="/my-paper-trade" class="lrn-link">My Paper Trade</a></li>
        <li>When ready to sell: click your position → <strong>"Sell"</strong></li>
      </ol>
    </div>

    <div class="lrn-section">
      <h2>Your Paper Trade Dashboard</h2>
      <p>The <a href="/my-paper-trade" class="lrn-link">My Paper Trade</a> page shows:</p>
      <div class="lrn-table-wrap">
        <table class="lrn-table">
          <thead><tr><th>Section</th><th>What you see</th></tr></thead>
          <tbody>
            <tr><td>Portfolio Value</td><td>Current worth of all your positions + cash balance</td></tr>
            <tr><td>Open Positions</td><td>Stocks you currently hold (buy price, current price, unrealised P&amp;L)</td></tr>
            <tr><td>Trade History</td><td>All completed trades with P&amp;L and % return</td></tr>
            <tr><td>Export</td><td>Download your full trade history as CSV</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="lrn-section">
      <h2>Paper trading tips</h2>
      <ul class="lrn-list">
        <li>Trade as if it's real money — don't take risks you wouldn't take with real capital</li>
        <li>Set stop losses on every trade, just like you would in real trading</li>
        <li>Keep a trading journal — write down why you entered each trade</li>
        <li>Review your trade history weekly — identify patterns in your wins and losses</li>
        <li>Aim for 20+ trades before drawing any conclusions about your strategy</li>
      </ul>
      <div class="lrn-callout lrn-callout-amber">
        <strong>⚠️ Paper trading doesn't replicate emotions.</strong> When real money is on the line, fear and greed affect decisions. Treat paper trading as a skills lab, not a profitability guarantee.
      </div>
    </div>

    <div class="lrn-nav-btns">
      <a href="/learn/screener-guide" class="lrn-nav-btn lrn-nav-btn-prev">← Screener Guide</a>
      <a href="/learn/signals-guide" class="lrn-nav-btn lrn-nav-btn-next">Next: Signals Guide →</a>
    </div>
    <div class="lrn-bottom-cta">
      <strong>Start practicing with ₹1,00,000 virtual money</strong>
      <a href="/signup" class="lrn-cta-btn">🚀 Create Free Account →</a>
    </div>
  </div>`));
});

// ── GET /learn/signals-guide ───────────────────────────────────────────────────
app.get("/learn/signals-guide", (req: Request, res: Response) => {
  res.send(learnLayout(req, "learn", "How to Read Bot Signals", "Learn how to interpret ZeroScreen's BANKNIFTY automated bot signals — entries, stop losses, P&L, and what it all means.",
  `<div class="lrn-article">
    <a href="/learn" class="lrn-back">← All Guides</a>
    <div class="lrn-article-hdr">
      <span class="lrn-art-icon">📡</span>
      <div>
        <h1>Reading Bot Signals</h1>
        <div class="lrn-art-meta"><span class="lrn-level lrn-level-intermediate">Intermediate</span> · <span>⏱ 6 min read</span></div>
      </div>
    </div>

    <div class="lrn-section">
      <h2>What is the ZeroScreen trading bot?</h2>
      <p>ZeroScreen runs an <strong>automated intraday trading bot</strong> on BANKNIFTY options (CE and PE). The bot uses a momentum-based strategy (HYBRID_REVERSE) to identify breakout signals during market hours.</p>
      <div class="lrn-callout lrn-callout-green">
        <strong>📡 This is a real bot running live paper trades.</strong> The results you see on the Signals page are from actual simulated trades — not backtested paper numbers.
      </div>
    </div>

    <div class="lrn-section">
      <h2>CE vs PE — what does it mean?</h2>
      <div class="lrn-table-wrap">
        <table class="lrn-table">
          <thead><tr><th>Direction</th><th>Type</th><th>Meaning</th><th>Profit when…</th></tr></thead>
          <tbody>
            <tr><td><span style="color:#60a5fa;font-weight:700">CE</span></td><td>Call option</td><td>Bullish bet — expecting BANKNIFTY to go UP</td><td class="lrn-green">Index rises</td></tr>
            <tr><td><span style="color:#f87171;font-weight:700">PE</span></td><td>Put option</td><td>Bearish bet — expecting BANKNIFTY to go DOWN</td><td class="lrn-green">Index falls</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="lrn-section">
      <h2>Understanding P&amp;L (Points)</h2>
      <p>The bot's P&amp;L is expressed in <strong>index points</strong>. To convert to rupees:</p>
      <div class="lrn-callout lrn-callout-green">
        <strong>Formula: ₹ P&amp;L = Points × 15</strong><br>
        (Based on 30 qty × 0.5 delta — option premium sensitivity to index movement)
      </div>
      <div class="lrn-table-wrap">
        <table class="lrn-table">
          <thead><tr><th>Points P&amp;L</th><th>Approx ₹ P&amp;L</th></tr></thead>
          <tbody>
            <tr><td class="lrn-green">+100 pts</td><td class="lrn-green">+₹1,500</td></tr>
            <tr><td class="lrn-green">+50 pts</td><td class="lrn-green">+₹750</td></tr>
            <tr><td class="lrn-red">−50 pts</td><td class="lrn-red">−₹750</td></tr>
            <tr><td class="lrn-red">−100 pts</td><td class="lrn-red">−₹1,500</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="lrn-section">
      <h2>Trade exit reasons</h2>
      <div class="lrn-table-wrap">
        <table class="lrn-table">
          <thead><tr><th>Exit Label</th><th>Meaning</th></tr></thead>
          <tbody>
            <tr><td><span style="background:rgba(239,68,68,.12);color:#f87171;padding:2px 6px;border-radius:3px;font-size:.8rem;font-weight:600">SL Hit</span></td><td>Stop loss triggered — price moved against the trade</td></tr>
            <tr><td><span style="background:rgba(245,158,11,.12);color:#f59e0b;padding:2px 6px;border-radius:3px;font-size:.8rem;font-weight:600">Early Exit</span></td><td>Bot exited early based on momentum weakening</td></tr>
            <tr><td><span style="background:rgba(99,102,241,.12);color:#818cf8;padding:2px 6px;border-radius:3px;font-size:.8rem;font-weight:600">EOD</span></td><td>End-of-day square-off at 3:20 PM IST</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="lrn-section">
      <h2>What members can see vs Premium</h2>
      <div class="lrn-table-wrap">
        <table class="lrn-table">
          <thead><tr><th>Feature</th><th>Free Member</th><th>Premium</th></tr></thead>
          <tbody>
            <tr><td>Today's closed trades</td><td class="lrn-green">✅ Yes</td><td class="lrn-green">✅ Yes</td></tr>
            <tr><td>Monthly P&amp;L history</td><td class="lrn-green">✅ Yes</td><td class="lrn-green">✅ Yes</td></tr>
            <tr><td>Live entry price</td><td class="lrn-red">❌ Locked</td><td class="lrn-green">✅ Yes</td></tr>
            <tr><td>Live stop loss level</td><td class="lrn-red">❌ Locked</td><td class="lrn-green">✅ Yes</td></tr>
            <tr><td>Live unrealised P&amp;L</td><td>Blurred</td><td class="lrn-green">✅ Yes</td></tr>
            <tr><td>Telegram alerts</td><td class="lrn-red">❌ No</td><td class="lrn-green">✅ Yes</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="lrn-nav-btns">
      <a href="/learn/paper-trade-guide" class="lrn-nav-btn lrn-nav-btn-prev">← Paper Trade Guide</a>
      <a href="/learn" class="lrn-nav-btn lrn-nav-btn-next">← Back to All Guides</a>
    </div>
    <div class="lrn-bottom-cta">
      <strong>Watch the bot live — free for members</strong>
      <a href="/signals" class="lrn-cta-btn">📡 View Live Signals →</a>
    </div>
  </div>`));
});

// ── GET /blog — public blog list ──────────────────────────────────────────────
app.get("/blog", async (req: Request, res: Response) => {
  const posts = await getPublishedPosts(20);
  const cards = posts.length
    ? posts.map(p => `
    <a href="/blog/${esc(p.slug)}" class="blog-card">
      <div class="blog-card-meta">${(p.published_at || p.created_at).slice(0,10)}</div>
      <div class="blog-card-title">${esc(p.title)}</div>
      ${p.excerpt ? `<div class="blog-card-excerpt">${esc(p.excerpt)}</div>` : ""}
      <div class="blog-card-readmore">Read →</div>
    </a>`).join("")
    : `<div class="blog-empty">No articles published yet. Check back soon!</div>`;
  res.send(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Blog & Insights — ZeroScreen</title>
  ${seoMeta({ title: "Blog & Insights — ZeroScreen", description: "Trading tips, market analysis, stock education and platform guides from the ZeroScreen team.", url: "/blog" })}
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .blog-wrap{max-width:860px;margin:0 auto;padding:0 16px 60px}
    .blog-hero{padding:32px 0 20px}
    .blog-hero-title{font-size:1.8rem;font-weight:800;margin-bottom:6px}
    .blog-hero-sub{color:var(--text-muted);font-size:.9rem}
    .blog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-top:24px}
    .blog-card{display:block;background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:20px;text-decoration:none;color:var(--text);transition:border-color .18s,box-shadow .18s}
    .blog-card:hover{border-color:var(--accent);box-shadow:0 4px 20px rgba(0,0,0,.1)}
    .blog-card-meta{font-size:.72rem;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em}
    .blog-card-title{font-size:1rem;font-weight:700;margin-bottom:8px;line-height:1.35}
    .blog-card-excerpt{font-size:.82rem;color:var(--text-muted);line-height:1.5;margin-bottom:12px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
    .blog-card-readmore{font-size:.78rem;font-weight:700;color:var(--accent)}
    .blog-empty{padding:48px;text-align:center;color:var(--text-muted);font-size:.9rem}
  </style>
</head><body>
  ${nav("", req)}
  <div class="blog-wrap">
    <div class="blog-hero">
      <div class="blog-hero-title">📝 Blog &amp; Insights</div>
      <div class="blog-hero-sub">Trading tips, market guides and platform updates from the ZeroScreen team</div>
    </div>
    <div class="blog-grid">${cards}</div>
  </div>
<script src="/public/js/app.js"></script></body></html>`);
});

// ── GET /blog/:slug — public article ─────────────────────────────────────────
app.get("/blog/:slug", async (req: Request, res: Response) => {
  const slug = req.params.slug.replace(/[^a-z0-9\-]/gi, "");
  const post = await getBlogPost(slug);
  if (!post || !post.published) {
    res.status(404).send(`<!DOCTYPE html><html><head><title>Not Found</title><link rel="stylesheet" href="/public/css/style.css"></head><body>${nav("", req)}<div class="container"><div style="padding:60px 0;text-align:center"><h2>Article not found</h2><a href="/blog" style="color:var(--accent)">← Back to Blog</a></div></div></body></html>`);
    return;
  }
  // Render markdown-lite: convert \n\n to paragraphs, **bold**, `code`, # headings
  function renderContent(md: string): string {
    return md
      .split(/\n{2,}/)
      .map(para => {
        const trimmed = para.trim();
        if (/^#{1,3}\s/.test(trimmed)) {
          const level = (trimmed.match(/^(#{1,3})/) || ["#"])[0].length;
          return `<h${level+1} class="blog-h">${esc(trimmed.replace(/^#{1,3}\s+/, ""))}</h${level+1}>`;
        }
        if (/^[-*]\s/.test(trimmed)) {
          const items = trimmed.split(/\n/).filter(l => /^[-*]\s/.test(l)).map(l => `<li>${esc(l.replace(/^[-*]\s+/, ""))}</li>`).join("");
          return `<ul class="blog-ul">${items}</ul>`;
        }
        return `<p>${esc(trimmed).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\`(.*?)\`/g, "<code>$1</code>")}</p>`;
      })
      .join("\n");
  }
  res.send(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(post.title)} — ZeroScreen Blog</title>
  ${seoMeta({ title: post.title, description: post.excerpt || post.title, url: `/blog/${post.slug}`, type: "article" })}
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .blog-article-wrap{max-width:720px;margin:0 auto;padding:32px 16px 80px}
    .blog-article-meta{font-size:.78rem;color:var(--text-muted);margin-bottom:16px}
    .blog-article-title{font-size:1.9rem;font-weight:800;line-height:1.25;margin-bottom:10px}
    .blog-article-excerpt{font-size:1rem;color:var(--text-muted);margin-bottom:24px;line-height:1.6}
    .blog-article-body{line-height:1.75;font-size:.97rem}
    .blog-article-body p{margin-bottom:1em}
    .blog-article-body .blog-h{font-size:1.1rem;font-weight:700;margin:1.6em 0 .5em;color:var(--text)}
    .blog-article-body .blog-ul{margin:0 0 1em 1.5em;padding:0}
    .blog-article-body .blog-ul li{margin-bottom:.35em}
    .blog-article-body code{background:var(--bg2);padding:1px 6px;border-radius:4px;font-size:.88em}
    .blog-share{display:flex;gap:10px;margin-top:32px;padding-top:20px;border-top:1px solid var(--border);flex-wrap:wrap}
    .blog-back{display:inline-block;margin-bottom:20px;font-size:.85rem;color:var(--accent);text-decoration:none}
  </style>
</head><body>
  ${nav("", req)}
  <div class="blog-article-wrap">
    <a href="/blog" class="blog-back">← All Articles</a>
    <div class="blog-article-meta">${(post.published_at || post.created_at).slice(0,10)}</div>
    <h1 class="blog-article-title">${esc(post.title)}</h1>
    ${post.excerpt ? `<div class="blog-article-excerpt">${esc(post.excerpt)}</div>` : ""}
    <div class="blog-article-body">${renderContent(post.content)}</div>
    <div class="blog-share">
      <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(`${BASE_URL}/blog/${post.slug}`)}" target="_blank" rel="noopener" style="padding:7px 16px;background:#1d9bf022;border:1px solid #1d9bf055;border-radius:8px;font-size:.82rem;font-weight:700;color:#1d9bf0;text-decoration:none">𝕏 Share on X</a>
      <button onclick="navigator.clipboard.writeText('${BASE_URL}/blog/${post.slug}').then(()=>{this.textContent='✅ Copied!';setTimeout(()=>this.textContent='🔗 Copy Link',2000)})" style="padding:7px 16px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;font-size:.82rem;font-weight:700;color:var(--text-muted);cursor:pointer">🔗 Copy Link</button>
    </div>
  </div>
<script src="/public/js/app.js"></script></body></html>`);
});

// ── Admin Blog: GET /admin/blog ───────────────────────────────────────────────
app.get("/admin/blog", requireAdmin, async (req: Request, res: Response) => {
  const posts = await getAllBlogPosts();
  const rows = posts.map(p => `
    <tr>
      <td>${p.id}</td>
      <td><a href="/blog/${esc(p.slug)}" target="_blank" style="color:var(--accent)">${esc(p.title)}</a></td>
      <td><code style="font-size:.72rem">${esc(p.slug)}</code></td>
      <td>${p.published ? `<span style="color:#10b981;font-weight:700">✅ Published</span><br><span style="font-size:.7rem;color:var(--text-muted)">${(p.published_at||'').slice(0,10)}</span>` : `<span style="color:var(--text-muted)">Draft</span>`}</td>
      <td style="white-space:nowrap">
        <a href="/admin/blog/${p.id}/edit" class="btn-sm" style="font-size:.74rem;padding:4px 10px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);text-decoration:none">✏️ Edit</a>
        ${!p.published
          ? `<form method="POST" action="/admin/blog/${p.id}/publish" style="display:inline"><button class="btn-sm" style="font-size:.74rem;padding:4px 10px;background:#10b98122;border:1px solid #10b98155;border-radius:6px;color:#10b981;cursor:pointer">✅ Publish</button></form>`
          : `<form method="POST" action="/admin/blog/${p.id}/unpublish" style="display:inline"><button class="btn-sm" style="font-size:.74rem;padding:4px 10px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text-muted);cursor:pointer">⏸ Unpublish</button></form>`}
        <form method="POST" action="/admin/blog/${p.id}/delete" style="display:inline" onsubmit="return confirm('Delete this post?')"><button class="btn-sm" style="font-size:.74rem;padding:4px 10px;background:#ef444422;border:1px solid #ef444455;border-radius:6px;color:#ef4444;cursor:pointer">🗑</button></form>
      </td>
    </tr>`).join("");
  res.send(`<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Blog Manager — Admin</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head><body>${nav("", req)}
<div class="container">
  <div class="page-header"><h1 class="page-title">📝 Blog Manager</h1><a href="/admin/blog/new" class="btn-primary">+ New Post</a></div>
  <div class="admin-card">
    <table style="width:100%;border-collapse:collapse;font-size:.88rem">
      <thead><tr style="border-bottom:2px solid var(--border)"><th style="padding:8px 10px;text-align:left">ID</th><th>Title</th><th>Slug</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="padding:28px;text-align:center;color:var(--text-muted)">No posts yet</td></tr>'}</tbody>
    </table>
  </div>
</div><script src="/public/js/app.js"></script></body></html>`);
});

// ── Admin Blog: GET /admin/blog/new ──────────────────────────────────────────
app.get("/admin/blog/new", requireAdmin, (req: Request, res: Response) => {
  res.send(_blogEditForm(null, req));
});

// ── Admin Blog: GET /admin/blog/:id/edit ─────────────────────────────────────
app.get("/admin/blog/:id/edit", requireAdmin, async (req: Request, res: Response) => {
  const posts = await getAllBlogPosts();
  const post = posts.find(p => p.id === parseInt(req.params.id, 10)) || null;
  if (!post) { res.redirect("/admin/blog"); return; }
  res.send(_blogEditForm(post, req));
});

function _blogEditForm(post: BlogPost | null, req: Request): string {
  const action = post ? `/admin/blog/${post.id}/update` : "/admin/blog/create";
  return `<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${post ? "Edit" : "New"} Post — Admin</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .blog-form{max-width:800px;margin:0 auto;padding:0 16px 60px}
    .blog-form label{display:block;font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:5px;margin-top:18px}
    .blog-form input,.blog-form textarea{width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);color:var(--text);font-size:.9rem;box-sizing:border-box}
    .blog-form textarea{min-height:380px;font-family:monospace;font-size:.82rem;line-height:1.6;resize:vertical}
    .blog-form .hint{font-size:.72rem;color:var(--text-muted);margin-top:4px}
  </style>
</head><body>${nav("", req)}
<div class="blog-form">
  <div class="page-header"><h1 class="page-title">${post ? "✏️ Edit Post" : "📝 New Post"}</h1><a href="/admin/blog" style="font-size:.85rem;color:var(--accent)">← All Posts</a></div>
  <form method="POST" action="${action}">
    <label>Title</label>
    <input name="title" value="${post ? esc(post.title) : ""}" required maxlength="200">
    <label>Slug <span style="font-weight:400">(URL path, lowercase, hyphens only)</span></label>
    <input name="slug" value="${post ? esc(post.slug) : ""}" required pattern="[a-z0-9\\-]+" maxlength="100" ${post ? "readonly" : ""}>
    <div class="hint">/blog/<em>your-slug-here</em></div>
    <label>Excerpt <span style="font-weight:400">(shown in list + SEO description)</span></label>
    <input name="excerpt" value="${post ? esc(post.excerpt || "") : ""}" maxlength="300">
    <label>Content <span style="font-weight:400">(Markdown-lite: ## heading, **bold**, \`code\`, - list)</span></label>
    <textarea name="content">${post ? esc(post.content) : ""}</textarea>
    <div style="margin-top:20px;display:flex;gap:10px">
      <button type="submit" class="btn-primary">${post ? "Save Changes" : "Create Post"}</button>
      <a href="/admin/blog" class="btn-ghost">Cancel</a>
    </div>
  </form>
</div><script src="/public/js/app.js"></script></body></html>`;
}

// ── Admin Blog: POST /admin/blog/create ──────────────────────────────────────
app.post("/admin/blog/create", requireAdmin, async (req: Request, res: Response) => {
  const title   = ((req.body.title as string) || "").trim().slice(0, 200);
  const slug    = ((req.body.slug as string) || "").toLowerCase().replace(/[^a-z0-9\-]/g, "-").slice(0, 100);
  const excerpt = ((req.body.excerpt as string) || "").trim().slice(0, 300) || undefined;
  const content = ((req.body.content as string) || "").trim();
  if (!title || !slug || !content) { res.redirect("/admin/blog/new"); return; }
  await createBlogPost({ slug, title, excerpt, content, author_id: req.session.userId });
  res.redirect("/admin/blog");
});

// ── Admin Blog: POST /admin/blog/:id/update ───────────────────────────────────
app.post("/admin/blog/:id/update", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const title   = ((req.body.title as string) || "").trim().slice(0, 200) || undefined;
  const excerpt = ((req.body.excerpt as string) || "").trim().slice(0, 300) || undefined;
  const content = ((req.body.content as string) || "").trim() || undefined;
  await updateBlogPost(id, { title, excerpt, content });
  res.redirect("/admin/blog");
});

// ── Admin Blog: POST /admin/blog/:id/publish ──────────────────────────────────
app.post("/admin/blog/:id/publish", requireAdmin, async (req: Request, res: Response) => {
  await publishBlogPost(parseInt(req.params.id, 10));
  res.redirect("/admin/blog");
});

// ── Admin Blog: POST /admin/blog/:id/unpublish ────────────────────────────────
app.post("/admin/blog/:id/unpublish", requireAdmin, async (req: Request, res: Response) => {
  await unpublishBlogPost(parseInt(req.params.id, 10));
  res.redirect("/admin/blog");
});

// ── Admin Blog: POST /admin/blog/:id/delete ───────────────────────────────────
app.post("/admin/blog/:id/delete", requireAdmin, async (req: Request, res: Response) => {
  await deleteBlogPost(parseInt(req.params.id, 10));
  res.redirect("/admin/blog");
});

// ── Admin Blog: POST /admin/blog/:id/delete ───────────────────────────────────
app.post("/admin/blog/:id/delete", requireAdmin, async (req: Request, res: Response) => {
  await deleteBlogPost(parseInt(req.params.id, 10));
  res.redirect("/admin/blog");
});

// ── Admin Premium Picks ───────────────────────────────────────────────────────
function _ppForm(p: PremiumPick | null): string {
  const v = (x: unknown) => esc(String(x ?? ""));
  return `
  <form method="POST" action="${p ? `/admin/premium-picks/${p.id}/update` : "/admin/premium-picks/create"}">
    <div class="admin-form-card">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><label class="form-label">Symbol *</label><input class="form-input" name="symbol" value="${p ? v(p.symbol) : ""}" required placeholder="e.g. HDFCBANK" style="text-transform:uppercase"></div>
        <div><label class="form-label">Company Name</label><input class="form-input" name="company_name" value="${p ? v(p.company_name) : ""}" placeholder="e.g. HDFC Bank Ltd"></div>
        <div><label class="form-label">Strategy *</label>
          <select class="form-input" name="strategy">
            ${["Swing","Breakout","Pullback","Momentum","Positional","Reversal"].map(s => `<option value="${s}"${p?.strategy===s?" selected":""}>${s}</option>`).join("")}
          </select></div>
        <div><label class="form-label">Timeframe *</label>
          <select class="form-input" name="timeframe">
            ${["Intraday","Short-term","Medium-term","Long-term"].map(t => `<option value="${t}"${p?.timeframe===t?" selected":""}>${t}</option>`).join("")}
          </select></div>
        <div><label class="form-label">Entry Low ₹ *</label><input class="form-input" name="entry_low" type="number" step="0.01" value="${p ? v(p.entry_low) : ""}" required></div>
        <div><label class="form-label">Entry High ₹ *</label><input class="form-input" name="entry_high" type="number" step="0.01" value="${p ? v(p.entry_high) : ""}" required></div>
        <div><label class="form-label">Target ₹</label><input class="form-input" name="target" type="number" step="0.01" value="${p ? v(p.target) : ""}"></div>
        <div><label class="form-label">Stop Loss ₹</label><input class="form-input" name="stop_loss" type="number" step="0.01" value="${p ? v(p.stop_loss) : ""}"></div>
      </div>
      <div style="margin-top:12px"><label class="form-label">Thesis / Analysis *</label>
        <textarea class="form-input" name="thesis" rows="4" required placeholder="Describe the trade setup, technicals, and reasoning...">${p ? v(p.thesis) : ""}</textarea></div>
      <div style="margin-top:16px;display:flex;gap:10px">
        <button class="btn-primary" type="submit">${p ? "💾 Save Changes" : "➕ Create Pick"}</button>
        <a href="/admin/premium-picks" class="btn-ghost">Cancel</a>
      </div>
    </div>
  </form>`;
}

app.get("/admin/premium-picks", requireAdmin, async (req: Request, res: Response) => {
  const picks = await getAllPremiumPicks();
  res.send(`<!DOCTYPE html><html lang="en"><head>
    <meta charset="UTF-8"><title>Premium Picks — Admin</title>
    <link rel="stylesheet" href="/public/css/style.css">
  </head><body>${nav("admin-pp", req)}
  <div class="container" style="max-width:960px">
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <h1 class="page-title">⭐ Premium Strategy Picks</h1>
      <a href="/admin/premium-picks/new" class="btn-primary">+ New Pick</a>
    </div>
    <div class="admin-data-card" style="overflow-x:auto">
      <table class="admin-table" style="min-width:700px">
        <thead><tr>
          <th>Symbol</th><th>Strategy</th><th>Timeframe</th>
          <th>Entry Range</th><th>Target</th><th>SL</th>
          <th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${picks.length === 0 ? `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No picks yet</td></tr>` :
            picks.map(p => `<tr>
              <td><strong>${esc(p.symbol)}</strong>${p.company_name ? `<br><span style="font-size:11px;color:var(--text-muted)">${esc(p.company_name)}</span>` : ""}</td>
              <td>${esc(p.strategy)}</td>
              <td>${esc(p.timeframe)}</td>
              <td style="font-family:monospace">₹${p.entry_low}–${p.entry_high}</td>
              <td style="font-family:monospace;color:var(--green)">${p.target ? `₹${p.target}` : "—"}</td>
              <td style="font-family:monospace;color:var(--red)">${p.stop_loss ? `₹${p.stop_loss}` : "—"}</td>
              <td><span class="badge ${p.published ? "badge-active" : "badge-pending"}">${p.published ? "Live" : "Draft"}</span></td>
              <td style="display:flex;gap:6px;flex-wrap:wrap">
                <a href="/admin/premium-picks/${p.id}/edit" class="btn-admin-action">Edit</a>
                <form method="POST" action="/admin/premium-picks/${p.id}/${p.published ? "unpublish" : "publish"}"><button class="btn-admin-action">${p.published ? "Unpublish" : "Publish"}</button></form>
                <form method="POST" action="/admin/premium-picks/${p.id}/delete" onsubmit="return confirm('Delete this pick?')"><button class="btn-admin-action" style="color:var(--red)">Delete</button></form>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </div><script src="/public/js/app.js"></script></body></html>`);
});

app.get("/admin/premium-picks/new", requireAdmin, (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html><html lang="en"><head>
    <meta charset="UTF-8"><title>New Premium Pick</title>
    <link rel="stylesheet" href="/public/css/style.css">
  </head><body>${nav("admin-pp", _req)}
  <div class="container" style="max-width:720px">
    <div class="page-header"><h1 class="page-title">➕ New Premium Pick</h1><a href="/admin/premium-picks" style="font-size:.85rem;color:var(--accent)">← All Picks</a></div>
    ${_ppForm(null)}
  </div><script src="/public/js/app.js"></script></body></html>`);
});

app.get("/admin/premium-picks/:id/edit", requireAdmin, async (req: Request, res: Response) => {
  const picks = await getAllPremiumPicks();
  const p = picks.find(x => x.id === parseInt(req.params.id, 10));
  if (!p) { res.redirect("/admin/premium-picks"); return; }
  res.send(`<!DOCTYPE html><html lang="en"><head>
    <meta charset="UTF-8"><title>Edit Pick</title>
    <link rel="stylesheet" href="/public/css/style.css">
  </head><body>${nav("admin-pp", req)}
  <div class="container" style="max-width:720px">
    <div class="page-header"><h1 class="page-title">✏️ Edit Premium Pick</h1><a href="/admin/premium-picks" style="font-size:.85rem;color:var(--accent)">← All Picks</a></div>
    ${_ppForm(p)}
  </div><script src="/public/js/app.js"></script></body></html>`);
});

app.post("/admin/premium-picks/create", requireAdmin, async (req: Request, res: Response) => {
  const b = req.body;
  await createPremiumPick({
    symbol: String(b.symbol || "").toUpperCase().trim().slice(0, 20),
    company_name: b.company_name || null,
    strategy: b.strategy || "Swing",
    entry_low: parseFloat(b.entry_low) || 0,
    entry_high: parseFloat(b.entry_high) || 0,
    target: b.target ? parseFloat(b.target) : undefined,
    stop_loss: b.stop_loss ? parseFloat(b.stop_loss) : undefined,
    timeframe: b.timeframe || "Short-term",
    thesis: String(b.thesis || "").slice(0, 2000),
    created_by: req.session.userId,
  });
  res.redirect("/admin/premium-picks");
});

app.post("/admin/premium-picks/:id/update", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body;
  await updatePremiumPick(id, {
    symbol: String(b.symbol || "").toUpperCase().trim().slice(0, 20) || undefined,
    company_name: b.company_name || null,
    strategy: b.strategy || undefined,
    entry_low: b.entry_low ? parseFloat(b.entry_low) : undefined,
    entry_high: b.entry_high ? parseFloat(b.entry_high) : undefined,
    target: b.target ? parseFloat(b.target) : undefined,
    stop_loss: b.stop_loss ? parseFloat(b.stop_loss) : undefined,
    timeframe: b.timeframe || undefined,
    thesis: b.thesis ? String(b.thesis).slice(0, 2000) : undefined,
  });
  res.redirect("/admin/premium-picks");
});

app.post("/admin/premium-picks/:id/publish", requireAdmin, async (req: Request, res: Response) => {
  await publishPremiumPick(parseInt(req.params.id, 10));
  res.redirect("/admin/premium-picks");
});

app.post("/admin/premium-picks/:id/unpublish", requireAdmin, async (req: Request, res: Response) => {
  await unpublishPremiumPick(parseInt(req.params.id, 10));
  res.redirect("/admin/premium-picks");
});

app.post("/admin/premium-picks/:id/delete", requireAdmin, async (req: Request, res: Response) => {
  await deletePremiumPick(parseInt(req.params.id, 10));
  res.redirect("/admin/premium-picks");
});

// ── GET /about ─────────────────────────────────────────────────────────────────
app.get("/about", (req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>About ZeroScreen — Free NSE Research & Paper Trading Platform</title>
  ${seoMeta({ title: "About ZeroScreen — Free NSE Research & Paper Trading Platform", description: "ZeroScreen is a free, open-access stock education platform for the Indian market. Learn trading, screen stocks, practice paper trading — no SEBI registration required.", url: "/about" })}
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("about", req)}
  <div class="container" style="max-width:900px">

    <!-- Hero -->
    <div class="about-hero">
      <div class="about-hero-tag">Who We Are</div>
      <h1 class="about-hero-title">Built by traders,<br>for every kind of learner</h1>
      <p class="about-hero-desc">ZeroScreen is a free, open-access stock education &amp; research platform for the Indian market. We are <strong>not</strong> a SEBI-registered advisor. Everything here is built to help you <em>learn, practise, and build conviction</em> — not to tell you what to buy or sell.</p>
      <div class="about-disclaimer-bar">
        ⚠️ ZeroScreen is purely educational. It does not provide investment advice. All data is for learning purposes only. Invest at your own risk.
      </div>
    </div>

    <!-- Mission -->
    <div class="about-mission">
      <div class="about-mission-icon">🎯</div>
      <div>
        <h2>Our Mission</h2>
        <p>Most retail investors lose money not because markets are hard — but because they start trading before they understand the basics. We built ZeroScreen to bridge that gap: give everyone from a complete beginner to a seasoned investor the same professional-grade tools, for free.</p>
      </div>
    </div>

    <!-- 3-tier audience cards -->
    <h2 class="about-section-title">ZeroScreen is built for three kinds of people</h2>
    <div class="about-tiers">

      <div class="about-tier-card tier-beginner">
        <div class="tier-badge" style="background:#dcfce7;color:#166534">🟢 Beginners</div>
        <h3>Start here — no real money needed</h3>
        <p>You're new to stock markets or trading. You want to understand how it works before risking a single rupee.</p>
        <ul class="tier-list">
          <li>📋 <strong>Paper Trade</strong> — simulate trades across 3 strategies with zero real money. Watch how they perform over time.</li>
          <li>🎓 <strong>Strategy Showcase</strong> — see exactly what "ROCE > 20%" or "Debt-free" means with real stock examples.</li>
          <li>📡 <strong>Signals</strong> — watch our live BANKNIFTY bot trade in real-time. Learn entry/exit logic by observation.</li>
          <li>📬 <strong>Regular guidance</strong> — follow Today's Picks to see how analysis-backed ideas play out.</li>
        </ul>
        <a href="/my-paper-trade" class="about-tier-cta" style="background:#10b981">Start Paper Trading →</a>
      </div>

      <div class="about-tier-card tier-trader">
        <div class="tier-badge" style="background:#fef9c3;color:#713f12">🟡 Mid-Level Traders</div>
        <h3>Use curated ideas and build your own strategy</h3>
        <p>You understand markets but want structured ideas and tools to sharpen your edge without spending hours on research.</p>
        <ul class="tier-list">
          <li>🔥 <strong>Today's Picks</strong> — daily curated LONG/SHORT ideas with entry range, target and stop loss, backed by analysis.</li>
          <li>🔨 <strong>Strategy Builder</strong> — type a strategy in plain English (e.g. "Debt-free pharma stocks with ROCE above 25%") and get an instant screener filter set.</li>
          <li>📊 <strong>Bot Performance Dashboard</strong> — study 5-year backtest data and real live trades to understand what edge looks like.</li>
          <li>⚖️ <strong>Stock Comparison</strong> — compare up to 5 NSE stocks side-by-side on every fundamental metric.</li>
        </ul>
        <a href="/today" class="about-tier-cta" style="background:#f59e0b;color:#1c1917">See Today's Picks →</a>
      </div>

      <div class="about-tier-card tier-investor">
        <div class="tier-badge" style="background:#fee2e2;color:#991b1b">🔴 Serious Investors</div>
        <h3>Deep-screen 1,700+ NSE stocks yourself</h3>
        <p>You know what you're looking for and want the raw data and tools to do independent fundamental + technical research.</p>
        <ul class="tier-list">
          <li>🔍 <strong>Advanced Screener</strong> — 14 filters (ROCE, ROE, D/E, Promoter %, P/E, Market Cap, Sector, Volume, 52-week range, profit growth) across 1,700+ NSE stocks.</li>
          <li>📈 <strong>Stock Detail Page</strong> — TradingView chart, 8 KPI cards, 6 financial charts, full metrics table, company info and live news.</li>
          <li>⭐ <strong>Watchlists</strong> — save your research shortlist, track it across sessions.</li>
          <li>🔔 <strong>Alerts</strong> — save filter combos and get email digests every morning when stocks match your criteria.</li>
        </ul>
        <a href="/" class="about-tier-cta" style="background:#ef4444">Open Screener →</a>
      </div>

    </div>

    <!-- Premium / AI Bot section -->
    <div class="about-premium-section">
      <div class="about-premium-left">
        <div class="tier-badge" style="background:#ede9fe;color:#4c1d95;margin-bottom:12px">⚡ Advanced — AI Bot on Request</div>
        <h2>Want the bot to trade for you?</h2>
        <p>Beyond learning and research, we run a live BANKNIFTY intraday trading bot using two proprietary signal models. If you want the bot to execute on your account — that's a separate, request-based service with a subscription or commission arrangement.</p>
        <p style="margin-top:10px;font-size:13px;color:var(--text-dim)">This is not sold as a guaranteed system. Past backtest results do not guarantee future returns. You invest, you decide.</p>
        <a href="/premium" class="about-tier-cta" style="background:#7c3aed;margin-top:20px;display:inline-block">Learn About Premium →</a>
      </div>
      <div class="about-premium-stats">
        <div class="ap-stat"><div class="ap-val">5 Yrs</div><div class="ap-label">Backtested</div></div>
        <div class="ap-stat"><div class="ap-val">2</div><div class="ap-label">Signal Models</div></div>
        <div class="ap-stat"><div class="ap-val">Live</div><div class="ap-label">Real Trades</div></div>
        <div class="ap-stat"><div class="ap-val">9:15–3:30</div><div class="ap-label">Auto Hours</div></div>
      </div>
    </div>

    <!-- What we are NOT -->
    <div class="about-nolist-wrap">
      <h2>What ZeroScreen is <em>not</em></h2>
      <div class="about-nolist">
        <div class="about-no-item">❌ Not a SEBI-registered investment advisor</div>
        <div class="about-no-item">❌ Not a broker or trading platform — we don't execute trades on your behalf</div>
        <div class="about-no-item">❌ Not a guarantee of returns — all data is historical and educational</div>
        <div class="about-no-item">❌ Not affiliated with NSE, BSE, or SEBI</div>
        <div class="about-no-item">❌ Not responsible for your investment decisions</div>
      </div>
      <p class="about-nolist-footer">All stock data is sourced from public NSE APIs and fundamentals databases. Use it to learn, form your own views, and always consult a registered advisor for personal investment decisions.</p>
    </div>

    <!-- Contact CTA -->
    <div class="about-contact-cta">
      <p>Questions, feedback, or want to collaborate?</p>
      <a href="/contact" class="btn-primary">📬 Get in Touch →</a>
    </div>

    <footer class="page-footer">
      © 2026 ZeroScreen — For educational and informational purposes only. Not SEBI registered. Not investment advice. Past data does not guarantee future returns. Trade at your own risk.
    </footer>
  </div>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── Start ──────────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();

// ── Bot data helpers ────────────────────────────────────────────────────────────
const BOT_DIR = "/home/ubuntu/trading-bot";

function readBotJSON(file: string, fallback: any = null) {
  try {
    const p = `${BOT_DIR}/${file}`;
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch { return fallback; }
}

function getTodayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function computeAnalytics(trades: any[]) {
  const today = getTodayIST();
  const todayTrades = trades.filter((t: any) => (t.date || "").startsWith(today));
  const allWins  = trades.filter((t: any) => t.pnl > 0).length;
  const allTotal = trades.length;

  let equity = 0, peak = 0, maxDD = 0;
  const equityCurve: number[] = [];
  for (const t of trades) {
    equity += t.pnl ?? 0;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
    equityCurve.push(parseFloat(equity.toFixed(1)));
  }

  let todayEq = 0, todayPeak = 0, todayMaxDD = 0;
  for (const t of todayTrades) {
    todayEq += t.pnl ?? 0;
    if (todayEq > todayPeak) todayPeak = todayEq;
    const dd = todayPeak - todayEq;
    if (dd > todayMaxDD) todayMaxDD = dd;
  }

  // Weekly P&L (last 7 days)
  const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const wkAgo = new Date(nowIST); wkAgo.setDate(nowIST.getDate() - 7);
  const wkTrades = trades.filter((t: any) => t.date && new Date(t.date) >= wkAgo);
  const wkWins = wkTrades.filter((t: any) => t.pnl > 0).length;
  const wkPnl = parseFloat(wkTrades.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0).toFixed(1));

  // Monthly breakdown
  const monthMap: Record<string, { trades: number; wins: number; losses: number; pnl: number }> = {};
  for (const t of trades) {
    if (!t.date) continue;
    const mk = t.date.slice(0, 7);
    if (!monthMap[mk]) monthMap[mk] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
    monthMap[mk].trades++;
    monthMap[mk].pnl = parseFloat((monthMap[mk].pnl + (t.pnl ?? 0)).toFixed(1));
    if ((t.pnl ?? 0) > 0) monthMap[mk].wins++; else monthMap[mk].losses++;
  }
  const monthly = Object.keys(monthMap).sort().map(month => ({
    month,
    ...monthMap[month],
    winRate: monthMap[month].trades > 0 ? parseFloat(((monthMap[month].wins / monthMap[month].trades) * 100).toFixed(1)) : 0,
  }));

  return {
    today: {
      trades: todayTrades.length,
      wins: todayTrades.filter((t: any) => t.pnl > 0).length,
      losses: todayTrades.filter((t: any) => t.pnl <= 0).length,
      pnl: parseFloat(todayEq.toFixed(1)),
      maxDD: parseFloat(todayMaxDD.toFixed(1)),
    },
    weekly: {
      trades: wkTrades.length,
      wins: wkWins,
      losses: wkTrades.length - wkWins,
      pnl: wkPnl,
    },
    monthly,
    allTime: {
      trades: allTotal,
      wins: allWins,
      losses: allTotal - allWins,
      winRate: allTotal > 0 ? parseFloat(((allWins / allTotal) * 100).toFixed(1)) : 0,
      pnl: parseFloat(equity.toFixed(1)),
      maxDD: parseFloat(maxDD.toFixed(1)),
    },
    equityCurve,
    recentTrades: trades.slice(-20).reverse(),
  };
}

// ── Technical Indicator Engine ─────────────────────────────────────────────────

// Compute EMA from closes
function computeEMA(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema.push(prev);
  for (let i = period; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    ema.push(prev);
  }
  return ema;
}

function computeSMA(closes: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    const sum = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }
  return sma;
}

function computeRSI(closes: number[], period = 14): { value: number; signal: string } {
  if (closes.length < period + 1) return { value: 50, signal: "NEUTRAL" };
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = parseFloat((100 - 100 / (1 + rs)).toFixed(2));
  return {
    value: rsi,
    signal: rsi < 30 ? "BUY" : rsi > 70 ? "SELL" : "NEUTRAL",
  };
}

function computeMACD(closes: number[]): { macd: number; signal: number; hist: number; trend: string } {
  if (closes.length < 35) return { macd: 0, signal: 0, hist: 0, trend: "NEUTRAL" };
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine: number[] = [];
  const startIdx = closes.length - ema26.length;
  for (let i = 0; i < ema26.length; i++) {
    macdLine.push(ema12[startIdx + i] - ema26[i]);
  }
  const signalLine = computeEMA(macdLine, 9);
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  const hist = lastMacd - lastSignal;
  // Crossover: check if previous histogram was negative and current is positive (or vice versa)
  const prevHist = macdLine[macdLine.length - 2] - signalLine[signalLine.length - 2];
  let trend = "NEUTRAL";
  if (prevHist < 0 && hist > 0) trend = "BUY";
  else if (prevHist > 0 && hist < 0) trend = "SELL";
  else if (hist > 0) trend = "BULLISH";
  else if (hist < 0) trend = "BEARISH";
  return { macd: parseFloat(lastMacd.toFixed(3)), signal: parseFloat(lastSignal.toFixed(3)), hist: parseFloat(hist.toFixed(3)), trend };
}

function computeBollinger(closes: number[], period = 20, mult = 2): { upper: number; lower: number; mid: number; signal: string; pct: number } {
  if (closes.length < period) return { upper: 0, lower: 0, mid: 0, signal: "NEUTRAL", pct: 50 };
  const slice = closes.slice(-period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mid) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  const upper = mid + mult * std;
  const lower = mid - mult * std;
  const last = closes[closes.length - 1];
  const pct = parseFloat(((last - lower) / (upper - lower) * 100).toFixed(1));
  const signal = last < lower ? "BUY" : last > upper ? "SELL" : "NEUTRAL";
  return { upper: parseFloat(upper.toFixed(2)), lower: parseFloat(lower.toFixed(2)), mid: parseFloat(mid.toFixed(2)), signal, pct };
}

function computeEMACross(closes: number[], fast = 20, slow = 50): { fastEMA: number; slowEMA: number; signal: string } {
  if (closes.length < slow + 1) return { fastEMA: 0, slowEMA: 0, signal: "NEUTRAL" };
  const emaFast = computeEMA(closes, fast);
  const emaSlow = computeEMA(closes, slow);
  const lastFast = emaFast[emaFast.length - 1];
  const lastSlow = emaSlow[emaSlow.length - 1];
  const prevFast = emaFast[emaFast.length - 2];
  const prevSlow = emaSlow[emaSlow.length - 2];
  let signal = "NEUTRAL";
  if (prevFast <= prevSlow && lastFast > lastSlow) signal = "BUY";
  else if (prevFast >= prevSlow && lastFast < lastSlow) signal = "SELL";
  else if (lastFast > lastSlow) signal = "BULLISH";
  else signal = "BEARISH";
  return { fastEMA: parseFloat(lastFast.toFixed(2)), slowEMA: parseFloat(lastSlow.toFixed(2)), signal };
}

function computeSMACross(closes: number[], fast = 20, slow = 50): { fastSMA: number; slowSMA: number; signal: string } {
  const smaFast = computeSMA(closes, fast);
  const smaSlow = computeSMA(closes, slow);
  if (smaFast.length < 2 || smaSlow.length < 2) return { fastSMA: 0, slowSMA: 0, signal: "NEUTRAL" };
  const lastFast = smaFast[smaFast.length - 1];
  const lastSlow = smaSlow[smaSlow.length - 1];
  const prevFast = smaFast[smaFast.length - 2];
  const prevSlow = smaSlow[smaSlow.length - 2];
  let signal = "NEUTRAL";
  if (prevFast <= prevSlow && lastFast > lastSlow) signal = "BUY";
  else if (prevFast >= prevSlow && lastFast < lastSlow) signal = "SELL";
  else if (lastFast > lastSlow) signal = "BULLISH";
  else signal = "BEARISH";
  return { fastSMA: parseFloat(lastFast.toFixed(2)), slowSMA: parseFloat(lastSlow.toFixed(2)), signal };
}

function computeVWAP(highs: number[], lows: number[], closes: number[], volumes: number[]): { vwap: number; signal: string } {
  const len = Math.min(highs.length, lows.length, closes.length, volumes.length);
  if (len < 1) return { vwap: 0, signal: "NEUTRAL" };
  let cumVP = 0, cumVol = 0;
  for (let i = 0; i < len; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumVP += tp * volumes[i];
    cumVol += volumes[i];
  }
  const vwap = parseFloat((cumVol > 0 ? cumVP / cumVol : 0).toFixed(2));
  const last = closes[closes.length - 1];
  return { vwap, signal: last > vwap * 1.002 ? "BULLISH" : last < vwap * 0.998 ? "BEARISH" : "NEUTRAL" };
}

function computeSupertrend(highs: number[], lows: number[], closes: number[], period = 7, mult = 3): { signal: string; value: number } {
  if (closes.length < period + 1) return { signal: "NEUTRAL", value: 0 };
  // ATR
  const atr: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    atr.push(Math.max(hl, hc, lc));
  }
  const atrEMA = computeEMA(atr.slice(-period * 3), period);
  const lastATR = atrEMA[atrEMA.length - 1];
  const lastClose = closes[closes.length - 1];
  const lastHigh = highs[highs.length - 1];
  const lastLow = lows[lows.length - 1];
  const mid = (lastHigh + lastLow) / 2;
  const upper = mid + mult * lastATR;
  const lower = mid - mult * lastATR;
  const prevClose = closes[closes.length - 2];
  // Simplified: if close > upper band area → bullish, < lower → bearish
  const signal = lastClose > upper ? "BULLISH" : lastClose < lower ? "BEARISH" :
    lastClose > mid && prevClose <= mid ? "BUY" :
    lastClose < mid && prevClose >= mid ? "SELL" : "NEUTRAL";
  return { signal, value: parseFloat(mid.toFixed(2)) };
}

function computeStochastic(highs: number[], lows: number[], closes: number[], kPeriod = 14, dPeriod = 3): { k: number; d: number; signal: string } {
  if (closes.length < kPeriod + dPeriod) return { k: 50, d: 50, signal: "NEUTRAL" };
  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const highSlice = highs.slice(i - kPeriod + 1, i + 1);
    const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
    const highest = Math.max(...highSlice);
    const lowest = Math.min(...lowSlice);
    kValues.push(highest === lowest ? 50 : ((closes[i] - lowest) / (highest - lowest)) * 100);
  }
  const dValues = computeSMA(kValues, dPeriod);
  const k = parseFloat(kValues[kValues.length - 1].toFixed(2));
  const d = parseFloat(dValues[dValues.length - 1].toFixed(2));
  const signal = k < 20 && d < 20 ? "BUY" : k > 80 && d > 80 ? "SELL" : k > d ? "BULLISH" : "BEARISH";
  return { k, d, signal };
}

function computeWilliamsR(highs: number[], lows: number[], closes: number[], period = 14): { value: number; signal: string } {
  if (closes.length < period) return { value: -50, signal: "NEUTRAL" };
  const highest = Math.max(...highs.slice(-period));
  const lowest = Math.min(...lows.slice(-period));
  const wr = highest === lowest ? -50 : ((highest - closes[closes.length - 1]) / (highest - lowest)) * -100;
  const value = parseFloat(wr.toFixed(2));
  return { value, signal: value < -80 ? "BUY" : value > -20 ? "SELL" : "NEUTRAL" };
}

function computeADX(highs: number[], lows: number[], closes: number[], period = 14): { adx: number; signal: string } {
  if (closes.length < period * 2) return { adx: 0, signal: "NEUTRAL" };
  const trArr: number[] = [];
  const dmPArr: number[] = [];
  const dmNArr: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    trArr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
    const upMove = highs[i] - highs[i-1];
    const dnMove = lows[i-1] - lows[i];
    dmPArr.push(upMove > dnMove && upMove > 0 ? upMove : 0);
    dmNArr.push(dnMove > upMove && dnMove > 0 ? dnMove : 0);
  }
  const atr14  = computeEMA(trArr, period);
  const diP14  = computeEMA(dmPArr, period).map((v, i) => atr14[i] > 0 ? (v / atr14[i]) * 100 : 0);
  const diN14  = computeEMA(dmNArr, period).map((v, i) => atr14[i] > 0 ? (v / atr14[i]) * 100 : 0);
  const dx     = diP14.map((v, i) => (v + diN14[i]) > 0 ? Math.abs(v - diN14[i]) / (v + diN14[i]) * 100 : 0);
  const adxArr = computeEMA(dx, period);
  const adx = parseFloat(adxArr[adxArr.length - 1].toFixed(2));
  const lastDiP = diP14[diP14.length - 1];
  const lastDiN = diN14[diN14.length - 1];
  const signal = adx > 25 ? (lastDiP > lastDiN ? "BULLISH" : "BEARISH") : "NEUTRAL";
  return { adx, signal };
}

// Yahoo Finance price history fetch with caching
const _yhCache: Map<string, { ts: number; closes: number[]; highs: number[]; lows: number[]; volumes: number[] }> = new Map();
const YH_CACHE_TTL = 20 * 60 * 1000; // 20 min
let _yhHostIdx = 0; // rotate between query1 and query2
const YH_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const YH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://finance.yahoo.com",
  "Referer": "https://finance.yahoo.com/",
};

async function fetchYahooHistory(symbol: string): Promise<{ closes: number[]; highs: number[]; lows: number[]; volumes: number[] } | null> {
  const nseSym = symbol.replace(/\.NS$/, "") + ".NS";
  const cached = _yhCache.get(nseSym);
  if (cached && Date.now() - cached.ts < YH_CACHE_TTL) return cached;

  const parseResult = (d: any) => {
    const result = d?.chart?.result?.[0];
    if (!result) return null;
    const q0 = result.indicators?.quote?.[0] || {};
    const closes  = (q0.close  || []).filter((v: any) => v != null);
    const highs   = (q0.high   || []).filter((v: any) => v != null);
    const lows    = (q0.low    || []).filter((v: any) => v != null);
    const volumes = (q0.volume || []).filter((v: any) => v != null);
    if (closes.length < 15) return null;
    return { closes, highs, lows, volumes };
  };

  // Try both hosts, rotating to spread load
  for (let attempt = 0; attempt < 2; attempt++) {
    const host = YH_HOSTS[(_yhHostIdx + attempt) % YH_HOSTS.length];
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(nseSym)}?interval=1d&range=6mo&events=none`;
      const r = await fetch(url, { headers: YH_HEADERS, signal: AbortSignal.timeout(10000) });
      if (r.status === 429) continue; // try other host
      if (!r.ok) continue;
      const d: any = await r.json();
      const parsed = parseResult(d);
      if (!parsed) continue;
      _yhHostIdx = (_yhHostIdx + 1) % YH_HOSTS.length; // advance rotation
      const data = { ts: Date.now(), ...parsed };
      _yhCache.set(nseSym, data);
      return data;
    } catch { continue; }
  }
  return null;
}

// ── GET /api/indicator-scan ────────────────────────────────────────────────────
const _scanCache: Map<string, { ts: number; results: any[] }> = new Map();

app.get("/api/indicator-scan", async (req: Request, res: Response) => {
  const indicator = (req.query.indicator as string || "RSI").toUpperCase();
  const signal    = (req.query.signal    as string || "BUY").toUpperCase();
  const universe  = parseInt(req.query.universe as string || "100");
  const sector    = (req.query.sector as string || "").trim();

  const cacheKey = `${indicator}|${signal}|${universe}|${sector}`;
  const cached = _scanCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 60 * 60 * 1000) {
    return res.json({ results: cached.results, cached: true, indicator, signal, scanned: universe });
  }

  // Get top N stocks from DB by market cap (optionally filtered by sector)
  let sectorClause = "";
  const sectorArgs: any[] = [];
  if (sector) { sectorClause = "AND (s.sector LIKE ? OR s.sector LIKE ?)"; sectorArgs.push(`%${sector}%`, `${sector}%`); }
  const stocks = await dbAll<{ symbol: string; company_name: string; market_cap: number; sector: string; price: number; change_pct: number }>(
    `SELECT s.symbol, s.company_name, s.market_cap, s.sector, p.price, p.change_pct
     FROM stocks s LEFT JOIN prices p ON p.symbol = s.symbol
     WHERE s.market_cap IS NOT NULL AND s.market_cap > 0 ${sectorClause}
     ORDER BY s.market_cap DESC LIMIT ?`,
    [...sectorArgs, universe]
  );

  // Fetch historical data in parallel (batch of 3 with delay to avoid Yahoo rate limits)
  const results: any[] = [];
  const BATCH = 3;
  for (let i = 0; i < stocks.length; i += BATCH) {
    if (i > 0) await new Promise(r => setTimeout(r, 350)); // 350ms between batches
    const batch = stocks.slice(i, i + BATCH);
    const settled = await Promise.allSettled(batch.map(async (s) => {
      const hist = await fetchYahooHistory(s.symbol);
      if (!hist) return null;
      const { closes, highs, lows, volumes } = hist;

      let sig = "NEUTRAL", detail = "", value: number | null = null;

      if (indicator === "RSI") {
        const r = computeRSI(closes);
        sig = r.signal; value = r.value; detail = `RSI ${r.value}`;
      } else if (indicator === "MACD") {
        const r = computeMACD(closes);
        sig = r.trend; detail = `MACD ${r.macd} / Sig ${r.signal} / Hist ${r.hist}`;
      } else if (indicator === "BOLLINGER") {
        const r = computeBollinger(closes);
        sig = r.signal; value = r.pct; detail = `B% ${r.pct}% | Upper ₹${r.upper} Mid ₹${r.mid} Lower ₹${r.lower}`;
      } else if (indicator === "EMA_CROSS") {
        const r = computeEMACross(closes);
        sig = r.signal; detail = `EMA20 ₹${r.fastEMA} vs EMA50 ₹${r.slowEMA}`;
      } else if (indicator === "SMA_CROSS") {
        const r = computeSMACross(closes);
        sig = r.signal; detail = `SMA20 ₹${r.fastSMA} vs SMA50 ₹${r.slowSMA}`;
      } else if (indicator === "SUPERTREND") {
        const r = computeSupertrend(highs, lows, closes);
        sig = r.signal; detail = `Supertrend Mid ₹${r.value}`;
      } else if (indicator === "STOCHASTIC") {
        const r = computeStochastic(highs, lows, closes);
        sig = r.signal; value = r.k; detail = `%K ${r.k} / %D ${r.d}`;
      } else if (indicator === "WILLIAMS_R") {
        const r = computeWilliamsR(highs, lows, closes);
        sig = r.signal; value = r.value; detail = `W%R ${r.value}`;
      } else if (indicator === "ADX") {
        const r = computeADX(highs, lows, closes);
        sig = r.signal; value = r.adx; detail = `ADX ${r.adx}`;
      } else if (indicator === "VWAP") {
        const r = computeVWAP(highs, lows, closes, volumes);
        sig = r.signal; value = r.vwap; detail = `VWAP ₹${r.vwap}`;
      }

      const wantedSignals = signal === "ALL"
        ? ["BUY", "SELL", "BULLISH", "BEARISH", "NEUTRAL"]
        : signal === "BUY"   ? ["BUY", "BULLISH"]
        : signal === "SELL"  ? ["SELL", "BEARISH"]
        : [signal];
      if (!wantedSignals.includes(sig)) return null;

      return {
        symbol: s.symbol,
        company: s.company_name,
        sector: s.sector,
        price: s.price,
        change_pct: s.change_pct,
        signal: sig,
        detail,
        value,
      };
    }));
    settled.forEach(r => { if (r.status === "fulfilled" && r.value) results.push(r.value); });
  }

  _scanCache.set(cacheKey, { ts: Date.now(), results });
  res.json({ results, cached: false, indicator, signal, scanned: stocks.length });
});

// ── GET /strategy-builder ──────────────────────────────────────────────────────
app.get("/strategy-builder", featureGate("feature_strategy_builder", "Strategy Builder"), premiumGate("strategy_builder_premium_only", "Strategy Builder"), (req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Strategy Builder — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>
  <style>
    .sb-hero { background: linear-gradient(135deg,#7c3aed 0%,#4f46e5 60%,#059669 100%); padding: 56px 24px 48px; text-align:center; color:#fff; }
    .sb-hero h1 { font-size: clamp(28px,5vw,46px); font-weight:800; letter-spacing:-1.5px; margin:0 0 12px; }
    .sb-hero p  { opacity:.85; font-size:17px; max-width:560px; margin:0 auto; }
    .sb-main { max-width:860px; margin:0 auto; padding:40px 20px 80px; }
    .sb-input-card { background:var(--bg-card); border:2px solid var(--border); border-radius:var(--radius-lg); padding:28px; box-shadow:var(--shadow); }
    .sb-label { font-size:13px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:8px; }
    .sb-textarea { width:100%; min-height:120px; resize:vertical; border:1.5px solid var(--border); border-radius:12px; padding:14px 16px; font-size:15px; font-family:inherit; background:var(--bg2); color:var(--text); outline:none; transition:border 0.2s; box-sizing:border-box; }
    .sb-textarea:focus { border-color:var(--accent); }
    .sb-examples { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 18px; }
    .sb-example { cursor:pointer; background:var(--bg4); border:1.5px solid var(--border); border-radius:20px; padding:6px 14px; font-size:12.5px; color:var(--text-muted); font-weight:500; transition:all 0.15s; }
    .sb-example:hover { background:var(--accent); color:#fff; border-color:var(--accent); }
    .sb-btn-parse { width:100%; padding:13px; background:var(--grad-brand); color:#fff; border:none; border-radius:12px; font-size:15px; font-weight:700; cursor:pointer; transition:opacity 0.2s; margin-top:4px; font-family:inherit; }
    .sb-btn-parse:hover { opacity:.9; }
    .sb-result { margin-top:28px; }
    .sb-result-title { font-size:13px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:12px; }
    .sb-filters { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px; }
    .sb-filter-tag { background:var(--accent-glow,rgba(124,58,237,.12)); border:1.5px solid var(--accent); color:var(--accent); border-radius:20px; padding:5px 13px; font-size:12.5px; font-weight:600; }
    .sb-empty { color:var(--text-muted); font-size:14px; padding:16px 0; }
    .sb-btn-apply { display:inline-block; padding:11px 28px; background:var(--grad-brand); color:#fff; border-radius:12px; text-decoration:none; font-size:14px; font-weight:700; transition:opacity 0.2s; }
    .sb-btn-apply:hover { opacity:.88; }
    .sb-explain { font-size:13.5px; color:var(--text-muted); line-height:1.6; background:var(--bg2); border-radius:10px; padding:14px 16px; margin-bottom:16px; }
    .sb-tips { background:var(--bg2); border-radius:var(--radius-lg); padding:24px; margin-top:32px; }
    .sb-tips h3 { margin:0 0 12px; font-size:15px; color:var(--text); }
    .sb-tips ul { margin:0; padding-left:18px; color:var(--text-muted); font-size:13.5px; line-height:2; }
    .sb-tips code { background:var(--bg4); border-radius:5px; padding:1px 6px; font-size:12px; color:var(--accent); }
  </style>
</head>
<body>
  ${nav("strategy-builder", req)}
  <div class="sb-hero">
    <h1>🔨 Strategy Builder</h1>
    <p>Describe your ideal stock in plain English — we'll convert it into screener filters instantly.</p>
  </div>
  <div class="sb-main">
    <div class="sb-input-card">
      <div class="sb-label">Describe your strategy</div>
      <textarea class="sb-textarea" id="sb-input" placeholder="e.g. Large cap pharma stocks with ROCE above 20 and debt free, profitable for 3 years…"></textarea>
      <div class="sb-label" style="margin-top:16px">Try an example</div>
      <div class="sb-examples" id="sb-examples">
        <span class="sb-example">Debt-free large cap with high ROCE</span>
        <span class="sb-example">Pharma stocks with promoter above 60%</span>
        <span class="sb-example">IT stocks with ROE above 20 and PE below 30</span>
        <span class="sb-example">Undervalued small cap with growing profits</span>
        <span class="sb-example">Top gainers today above 2%</span>
        <span class="sb-example">Dividend paying blue chips</span>
        <span class="sb-example">Near 52-week high with strong fundamentals</span>
        <span class="sb-example">Banking stocks below ₹500</span>
      </div>
      <button class="sb-btn-parse" id="sb-parse-btn" onclick="parseStrategy()">Parse Strategy →</button>
    </div>

    <div class="sb-result" id="sb-result" style="display:none">
      <div class="sb-result-title">Parsed Filters</div>
      <div class="sb-explain" id="sb-explain"></div>
      <div class="sb-filters" id="sb-filters"></div>
      <a href="#" class="sb-btn-apply" id="sb-apply-btn">Apply to Screener →</a>
    </div>

    <div class="sb-result" id="sb-no-match" style="display:none">
      <div class="sb-empty">No filters could be parsed. Try being more specific — e.g., <em>"ROCE above 20, debt free, large cap"</em>.</div>
    </div>

    <div class="sb-tips">
      <h3>💡 Tips for better results</h3>
      <ul>
        <li>Use numbers: <code>ROCE above 20</code>, <code>PE below 25</code>, <code>price below ₹500</code></li>
        <li>Mention company size: <code>large cap</code>, <code>mid cap</code>, <code>small cap</code></li>
        <li>Reference sectors: <code>pharma</code>, <code>IT</code>, <code>banking</code>, <code>auto</code>, <code>FMCG</code></li>
        <li>Use quality terms: <code>debt free</code>, <code>profitable</code>, <code>growing profit</code></li>
        <li>Use promoter: <code>high promoter</code>, <code>promoter above 60</code></li>
        <li>Mix criteria: <code>large cap IT with high ROCE, low debt and growing profits</code></li>
      </ul>
    </div>

    <!-- ── INDICATOR SCANNER ─────────────────────────────────────────── -->
    <div class="ind-scanner-wrap">
      <div class="ind-scanner-header">
        <div class="ind-scanner-title">
          <span class="ind-scanner-icon">📈</span>
          <div>
            <h2>Technical Indicator Scanner</h2>
            <p>Pick any indicator — scan top NSE stocks in real-time and find BUY / SELL signals right now.</p>
          </div>
        </div>
        <span class="tier-pill tier-mid">🟡 Traders</span>
      </div>

      <div class="ind-scanner-controls">
        <div class="ind-ctrl-group">
          <label class="ind-ctrl-label">Indicator</label>
          <select id="ind-indicator" class="ind-select">
            <optgroup label="Momentum">
              <option value="RSI">RSI — Relative Strength Index (14)</option>
              <option value="STOCHASTIC">Stochastic Oscillator (%K/%D)</option>
              <option value="WILLIAMS_R">Williams %R (14)</option>
            </optgroup>
            <optgroup label="Trend">
              <option value="MACD">MACD (12,26,9)</option>
              <option value="EMA_CROSS">EMA Crossover (20 / 50)</option>
              <option value="SMA_CROSS">SMA Crossover (20 / 50)</option>
              <option value="SUPERTREND">Supertrend (7, 3×ATR)</option>
              <option value="ADX">ADX — Trend Strength (14)</option>
            </optgroup>
            <optgroup label="Volatility / Volume">
              <option value="BOLLINGER">Bollinger Bands (20, 2σ)</option>
              <option value="VWAP">VWAP Position</option>
            </optgroup>
          </select>
        </div>

        <div class="ind-ctrl-group">
          <label class="ind-ctrl-label">Signal</label>
          <select id="ind-signal" class="ind-select">
            <option value="BUY">🟢 BUY / Bullish</option>
            <option value="SELL">🔴 SELL / Bearish</option>
            <option value="ALL">⚪ All Signals</option>
          </select>
        </div>

        <div class="ind-ctrl-group">
          <label class="ind-ctrl-label">Universe</label>
          <select id="ind-universe" class="ind-select">
            <option value="50">Nifty 50 — Top 50 stocks (fastest)</option>
            <option value="100" selected>Nifty 100 — Top 100 stocks</option>
            <option value="200">Nifty 200 — Top 200 stocks</option>
            <option value="500">Nifty 500 — Top 500 stocks (slow)</option>
          </select>
        </div>

        <div class="ind-ctrl-group">
          <label class="ind-ctrl-label">Sector (optional)</label>
          <select id="ind-sector" class="ind-select">
            <option value="">All Sectors</option>
            <option>Banks</option>
            <option>IT</option>
            <option>Pharmaceuticals</option>
            <option>Auto</option>
            <option>FMCG</option>
            <option>Infrastructure</option>
            <option>Metals</option>
            <option>Energy</option>
            <option>Realty</option>
            <option>Chemicals</option>
            <option>Telecom</option>
            <option>Cement</option>
            <option>Finance</option>
            <option>Insurance</option>
          </select>
        </div>
      </div>

      <!-- Indicator description -->
      <div class="ind-desc-bar" id="ind-desc-bar">
        <strong>RSI (14)</strong> — Values below 30 indicate oversold (BUY signal), above 70 indicate overbought (SELL signal). Based on 14-day closing prices.
      </div>

      <button class="ind-scan-btn" id="ind-scan-btn" onclick="runIndicatorScan()">
        <span class="ind-scan-icon">⚡</span> Scan Now
      </button>

      <!-- Results -->
      <div id="ind-results" style="display:none">
        <div class="ind-results-meta" id="ind-results-meta"></div>
        <div class="ind-results-table-wrap">
          <table class="ind-results-table" id="ind-results-table">
            <thead id="ind-results-thead"></thead>
            <tbody id="ind-results-tbody"></tbody>
          </table>
        </div>
        <p class="ind-disclaimer">⚠️ Indicators are computed from historical daily closing prices. This is for educational purposes only — not investment advice. Always do your own research.</p>
      </div>
      <div id="ind-loading" style="display:none" class="ind-loading">
        <div class="ind-spinner"></div>
        <span id="ind-loading-text">Fetching price history and computing signals…</span>
      </div>
      <div id="ind-error" style="display:none" class="ind-error"></div>
    </div>
  </div>
  <script src="/public/js/app.js"></script>
  <script>
  // ── Indicator descriptions ────────────────────────────────────────────────────
  var IND_DESCS = {
    RSI:        '<strong>RSI (14)</strong> — Values below 30 = oversold (BUY), above 70 = overbought (SELL). Measures speed and change of price movements.',
    MACD:       '<strong>MACD (12,26,9)</strong> — When MACD line crosses above signal line = BUY, crosses below = SELL. Histogram shows momentum strength.',
    BOLLINGER:  '<strong>Bollinger Bands (20, 2σ)</strong> — Price below lower band = oversold (BUY), above upper band = overbought (SELL). B% shows position within bands.',
    EMA_CROSS:  '<strong>EMA Crossover (20/50)</strong> — When EMA20 crosses above EMA50 = BUY signal. When EMA20 crosses below EMA50 = SELL signal.',
    SMA_CROSS:  '<strong>SMA Crossover (20/50)</strong> — Golden Cross (SMA20 > SMA50) = BUY. Death Cross (SMA20 < SMA50) = SELL.',
    SUPERTREND: '<strong>Supertrend (7, 3×ATR)</strong> — Price above supertrend line = BULLISH. Price flips below line = SELL signal.',
    STOCHASTIC: '<strong>Stochastic (14, 3)</strong> — %K and %D below 20 = oversold (BUY). Above 80 = overbought (SELL). %K crossing %D gives signal.',
    WILLIAMS_R: '<strong>Williams %R (14)</strong> — Values below −80 = oversold (BUY), above −20 = overbought (SELL). Range: 0 to −100.',
    ADX:        '<strong>ADX (14)</strong> — ADX > 25 = strong trend. +DI > −DI = bullish trend. Helps identify trending vs ranging markets.',
    VWAP:       '<strong>VWAP</strong> — Price above VWAP = bullish momentum. Price below VWAP = bearish. Calculated from 6 months of daily OHLCV.',
  };
  var IND_COLS = {
    RSI:        ['Symbol','Company','Sector','Price','Chg%','Signal','RSI Value'],
    MACD:       ['Symbol','Company','Sector','Price','Chg%','Signal','Detail'],
    BOLLINGER:  ['Symbol','Company','Sector','Price','Chg%','Signal','B% Position','Detail'],
    EMA_CROSS:  ['Symbol','Company','Sector','Price','Chg%','Signal','EMA20 vs EMA50'],
    SMA_CROSS:  ['Symbol','Company','Sector','Price','Chg%','Signal','SMA20 vs SMA50'],
    SUPERTREND: ['Symbol','Company','Sector','Price','Chg%','Signal','Detail'],
    STOCHASTIC: ['Symbol','Company','Sector','Price','Chg%','Signal','%K Value','Detail'],
    WILLIAMS_R: ['Symbol','Company','Sector','Price','Chg%','Signal','W%R Value'],
    ADX:        ['Symbol','Company','Sector','Price','Chg%','Trend','ADX Value'],
    VWAP:       ['Symbol','Company','Sector','Price','Chg%','Signal','VWAP'],
  };

  document.getElementById('ind-indicator').addEventListener('change', function() {
    document.getElementById('ind-desc-bar').innerHTML = IND_DESCS[this.value] || '';
  });

  function signalBadge(sig) {
    var cls = sig === 'BUY' || sig === 'BULLISH' ? 'ind-sig-buy'
            : sig === 'SELL' || sig === 'BEARISH' ? 'ind-sig-sell'
            : 'ind-sig-neutral';
    return '<span class="ind-sig-badge ' + cls + '">' + sig + '</span>';
  }

  async function runIndicatorScan() {
    var indicator = document.getElementById('ind-indicator').value;
    var signal    = document.getElementById('ind-signal').value;
    var universe  = document.getElementById('ind-universe').value;
    var sector    = document.getElementById('ind-sector').value;

    document.getElementById('ind-results').style.display = 'none';
    document.getElementById('ind-error').style.display   = 'none';
    document.getElementById('ind-loading').style.display = 'flex';
    document.getElementById('ind-scan-btn').disabled = true;

    var msgs = ['Fetching 6-month price history…','Computing ' + indicator + ' signals…','Filtering ' + signal + ' signals…','This may take 1-2 minutes for large universes…'];
    var mi = 0;
    var msgTimer = setInterval(function() {
      mi = (mi + 1) % msgs.length;
      document.getElementById('ind-loading-text').textContent = msgs[mi];
    }, 1800);

    try {
      var qs = 'indicator=' + indicator + '&signal=' + signal + '&universe=' + universe + (sector ? '&sector=' + encodeURIComponent(sector) : '');
      var res = await fetch('/api/indicator-scan?' + qs);
      if (!res.ok) throw new Error('Server error ' + res.status);
      var data = await res.json();

      clearInterval(msgTimer);
      document.getElementById('ind-loading').style.display = 'none';
      document.getElementById('ind-scan-btn').disabled = false;

      if (!data.results || data.results.length === 0) {
        document.getElementById('ind-error').style.display = 'block';
        document.getElementById('ind-error').textContent = 'No stocks matched ' + signal + ' signal for ' + indicator + ' in top ' + universe + ' stocks' + (sector ? ' (' + sector + ')' : '') + '.';
        return;
      }

      var cols = IND_COLS[indicator] || ['Symbol','Company','Sector','Price','Chg%','Signal','Detail'];
      var meta = data.results.length + ' stock' + (data.results.length > 1 ? 's' : '') + ' matched · Scanned ' + (data.scanned || universe) + ' stocks · ' + (data.cached ? 'Cached result' : 'Live computation') + ' · ' + new Date().toLocaleTimeString('en-IN');
      document.getElementById('ind-results-meta').textContent = meta;

      // Build table header
      document.getElementById('ind-results-thead').innerHTML = '<tr>' + cols.map(function(c){ return '<th>' + c + '</th>'; }).join('') + '</tr>';

      // Build table body
      var rows = data.results.map(function(r) {
        var chgCls = r.change_pct >= 0 ? 'pos' : 'neg';
        var chgStr = (r.change_pct >= 0 ? '+' : '') + (r.change_pct || 0).toFixed(2) + '%';
        var priceStr = r.price ? '₹' + r.price.toLocaleString('en-IN', {minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
        var sectorStr = r.sector || '—';
        var base = '<td><a href="/stock/' + r.symbol + '" class="ind-sym-link">' + r.symbol + '</a></td>'
          + '<td>' + (r.company || '—') + '</td>'
          + '<td><span class="sector-badge" style="font-size:10px">' + sectorStr + '</span></td>'
          + '<td>' + priceStr + '</td>'
          + '<td class="' + chgCls + '">' + chgStr + '</td>'
          + '<td>' + signalBadge(r.signal) + '</td>';

        if (indicator === 'RSI')       return '<tr>' + base + '<td>' + (r.value || '—') + '</td></tr>';
        if (indicator === 'BOLLINGER') return '<tr>' + base + '<td>' + (r.value != null ? r.value + '%' : '—') + '</td><td style="font-size:11px">' + (r.detail || '') + '</td></tr>';
        if (indicator === 'STOCHASTIC') return '<tr>' + base + '<td>' + (r.value || '—') + '</td><td style="font-size:11px">' + (r.detail || '') + '</td></tr>';
        if (indicator === 'WILLIAMS_R') return '<tr>' + base + '<td>' + (r.value || '—') + '</td></tr>';
        if (indicator === 'ADX')       return '<tr>' + base + '<td>' + (r.value || '—') + '</td></tr>';
        if (indicator === 'VWAP')      return '<tr>' + base + '<td>' + (r.value ? '₹' + r.value : '—') + '</td></tr>';
        return '<tr>' + base + '<td style="font-size:11px">' + (r.detail || '') + '</td></tr>';
      }).join('');

      document.getElementById('ind-results-tbody').innerHTML = rows;
      document.getElementById('ind-results').style.display = 'block';
    } catch(e) {
      clearInterval(msgTimer);
      document.getElementById('ind-loading').style.display = 'none';
      document.getElementById('ind-scan-btn').disabled = false;
      document.getElementById('ind-error').style.display = 'block';
      document.getElementById('ind-error').textContent = 'Error: ' + e.message;
    }
  }

  // NLP Filter Parser
  var EXAMPLES = document.querySelectorAll('.sb-example');
  EXAMPLES.forEach(function(el) {
    el.addEventListener('click', function() {
      document.getElementById('sb-input').value = el.textContent;
      parseStrategy();
    });
  });

  function parseStrategy() {
    var text = document.getElementById('sb-input').value.trim();
    if (!text) return;
    var params = {};
    var labels = {};
    var t = text.toLowerCase();

    // ── ROCE ───────────────────────────────────────────────────────────────────
    var m;
    m = t.match(/roce\\s*(?:above|>|greater than|more than|over|>=)\\s*(\\d+)/);
    if (m) { params.minRoce = m[1]; labels['ROCE ≥ ' + m[1] + '%'] = true; }
    m = t.match(/roce\\s*(?:below|<|less than|under|<=)\\s*(\\d+)/);
    if (m) { params.maxRoce = m[1]; labels['ROCE ≤ ' + m[1] + '%'] = true; }

    // ── ROE ────────────────────────────────────────────────────────────────────
    m = t.match(/roe\\s*(?:above|>|greater than|more than|over|>=)\\s*(\\d+)/);
    if (m) { params.minRoe = m[1]; labels['ROE ≥ ' + m[1] + '%'] = true; }

    // ── Debt ───────────────────────────────────────────────────────────────────
    if (/debt.?free|no debt|zero debt/i.test(t)) {
      params.maxDe = '0.1'; labels['Debt-Free (D/E ≤ 0.1)'] = true;
    } else {
      m = t.match(/d\\/e\\s*(?:below|<|less than|under)\\s*([\\d.]+)/);
      if (m) { params.maxDe = m[1]; labels['D/E ≤ ' + m[1]] = true; }
      m = t.match(/low debt|minimal debt/);
      if (m) { params.maxDe = '0.5'; labels['Low Debt (D/E ≤ 0.5)'] = true; }
    }

    // ── Market Cap ─────────────────────────────────────────────────────────────
    if (/large.?cap|bluechip|blue.?chip|nifty 50/i.test(t)) {
      params.minPrice = '500'; labels['Large Cap (Price ≥ ₹500)'] = true;
    } else if (/mid.?cap/i.test(t)) {
      params.minPrice = '100'; params.maxPrice = '1500'; labels['Mid Cap (₹100–1500)'] = true;
    } else if (/small.?cap/i.test(t)) {
      params.maxPrice = '300'; labels['Small Cap (Price ≤ ₹300)'] = true;
    } else if (/micro.?cap|penny/i.test(t)) {
      params.maxPrice = '50'; labels['Micro Cap / Penny (Price ≤ ₹50)'] = true;
    }

    // ── Profitability ──────────────────────────────────────────────────────────
    if (/all profitable|consistently profitable|profit(?:able)?(?: for| every| all)/i.test(t)) {
      params.allProfit = '1'; labels['Consistently Profitable'] = true;
    }
    if (/growing profit|profit.?growing|profit.?uptrend|increasing profit|profit.?increase|earnings? growth/i.test(t)) {
      params.uptrend = '1'; labels['Growing Profits (Uptrend)'] = true;
    }

    // ── P/E ────────────────────────────────────────────────────────────────────
    m = t.match(/p\\/e\\s*(?:above|>|more than|greater than)\\s*(\\d+)/);
    if (m) { params.minPe = m[1]; labels['P/E ≥ ' + m[1]] = true; }
    m = t.match(/p\\/e\\s*(?:below|<|less than|under)\\s*(\\d+)/);
    if (m) { params.maxPe = m[1]; labels['P/E ≤ ' + m[1]] = true; }
    m = t.match(/pe\\s*(?:above|>|more than|greater than)\\s*(\\d+)/);
    if (m && !params.minPe) { params.minPe = m[1]; labels['P/E ≥ ' + m[1]] = true; }
    m = t.match(/pe\\s*(?:below|<|less than|under)\\s*(\\d+)/);
    if (m && !params.maxPe) { params.maxPe = m[1]; labels['P/E ≤ ' + m[1]] = true; }
    if (/undervalued|cheap stock/i.test(t) && !params.maxPe) {
      params.maxPe = '15'; labels['P/E ≤ 15 (Undervalued)'] = true;
    }

    // ── Promoter ───────────────────────────────────────────────────────────────
    m = t.match(/promoter(?:\\s*holding)?\\s*(?:above|>|greater than|more than|over|>=)\\s*(\\d+)/);
    if (m) { params.minPromoter = m[1]; labels['Promoter ≥ ' + m[1] + '%'] = true; }
    else if (/high promoter|strong promoter|promoter.backed/i.test(t)) {
      params.minPromoter = '60'; labels['High Promoter (≥60%)'] = true;
    }

    // ── Dividend ───────────────────────────────────────────────────────────────
    if (/dividend|income stock|dividend.paying|yield/i.test(t)) {
      params.minDivYield = '0.5'; labels['Dividend Yield ≥ 0.5%'] = true;
    }

    // ── Price ──────────────────────────────────────────────────────────────────
    m = t.match(/price\\s*(?:above|>|over|more than)\\s*[₹]?(\\d+)/);
    if (m) { params.minPrice = m[1]; labels['Price ≥ ₹' + m[1]] = true; }
    m = t.match(/price\\s*(?:below|<|under|less than)\\s*[₹]?(\\d+)/);
    if (m) { params.maxPrice = m[1]; labels['Price ≤ ₹' + m[1]] = true; }
    m = t.match(/(?:below|under|less than)\\s*[₹](\\d+)/);
    if (m && !params.maxPrice) { params.maxPrice = m[1]; labels['Price ≤ ₹' + m[1]] = true; }

    // ── Change % ───────────────────────────────────────────────────────────────
    m = t.match(/(?:up|gain|risen?|change)\\s*(?:more than|above|>)\\s*(\\d+)%/);
    if (m) { params.minChg = m[1]; labels['Change ≥ +' + m[1] + '%'] = true; }
    if (/top gainers?|biggest gainers?/i.test(t) && !params.minChg) {
      params.minChg = '2'; labels['Top Gainers (≥+2%)'] = true;
    }
    if (/top losers?|biggest losers?/i.test(t)) {
      params.maxChg = '-2'; labels['Top Losers (≤-2%)'] = true;
    }

    // ── 52-week ────────────────────────────────────────────────────────────────
    if (/52.?week high|near high|all.?time high|hitting high/i.test(t)) {
      params.near52H = '5'; labels['Near 52-Week High (±5%)'] = true;
    }
    if (/52.?week low|near low|at low/i.test(t)) {
      params.near52L = '5'; labels['Near 52-Week Low (±5%)'] = true;
    }

    // ── Sectors ────────────────────────────────────────────────────────────────
    var sectorMap = [
      [/\\bbanking?\\b|bank stocks?|psu bank/i, 'Banks'],
      [/\\bit\\b|information tech|software/i, 'IT'],
      [/pharma|pharmaceutical|healthcare/i, 'Pharmaceuticals'],
      [/auto\\b|automobile|car stocks?/i, 'Auto'],
      [/fmcg|consumer goods|consumer staple/i, 'FMCG'],
      [/infra|infrastructure/i, 'Infrastructure'],
      [/metal|steel|mining|aluminium/i, 'Metals'],
      [/energy|power|electricity|solar/i, 'Energy'],
      [/realty|real estate|housing/i, 'Realty'],
      [/chemical/i, 'Chemicals'],
      [/telecom|telecommunication/i, 'Telecom'],
      [/cement/i, 'Cement'],
      [/nbfc|finance co/i, 'Finance'],
      [/insurance/i, 'Insurance'],
    ];
    for (var si = 0; si < sectorMap.length; si++) {
      if (sectorMap[si][0].test(t)) {
        params.sector = sectorMap[si][1];
        labels[sectorMap[si][1] + ' Sector'] = true;
        break;
      }
    }

    // ── Strong / quality shortcuts ─────────────────────────────────────────────
    if (/strong fundamental|quality stock|fundamentally strong/i.test(t)) {
      if (!params.minRoce) { params.minRoce = '15'; labels['ROCE ≥ 15%'] = true; }
      if (!params.maxDe)   { params.maxDe   = '1';  labels['D/E ≤ 1']    = true; }
      params.allProfit = '1'; labels['Consistently Profitable'] = true;
    }

    // ── Sort hints ─────────────────────────────────────────────────────────────
    if (/sort.*roce|high roce first/i.test(t)) params.sortBy = 'roce';
    if (/sort.*volume|high volume first/i.test(t)) params.sortBy = 'volume';
    if (/sort.*pe|low pe first/i.test(t)) { params.sortBy = 'pe'; params.sortDir = 'asc'; }

    var labelKeys = Object.keys(labels);
    var resultDiv  = document.getElementById('sb-result');
    var noMatchDiv = document.getElementById('sb-no-match');
    var filtersDiv = document.getElementById('sb-filters');
    var explainDiv = document.getElementById('sb-explain');
    var applyBtn   = document.getElementById('sb-apply-btn');

    if (!labelKeys.length) {
      resultDiv.style.display  = 'none';
      noMatchDiv.style.display = 'block';
      return;
    }

    noMatchDiv.style.display = 'none';
    resultDiv.style.display  = 'block';
    explainDiv.textContent   = 'Found ' + labelKeys.length + ' filter' + (labelKeys.length>1?'s':'') + ' from your description.';
    filtersDiv.innerHTML     = labelKeys.map(function(l){ return '<span class="sb-filter-tag">'+l+'</span>'; }).join('');

    var qs = new URLSearchParams(params).toString();
    applyBtn.href = '/?' + qs + '&strategy=custom';
  }
  </script>
</body>
</html>`);
});

// ── GET /admin/analytics ───────────────────────────────────────────────────────
app.get("/admin/analytics", requireAdmin, async (req: Request, res: Response) => {
  // Daily views (last 14 days)
  const daily = await dbAll<{day:string;views:number;unique:number}>(
    `SELECT date(created_at) as day,
            COUNT(*) as views,
            COUNT(DISTINCT ip_hash) as unique_visitors
     FROM page_views
     WHERE created_at >= date('now','localtime','-14 days')
     GROUP BY date(created_at) ORDER BY day DESC`
  );
  // Top pages (last 30 days)
  const topPages = await dbAll<{path:string;views:number}>(
    `SELECT path, COUNT(*) as views FROM page_views
     WHERE created_at >= date('now','localtime','-30 days')
     GROUP BY path ORDER BY views DESC LIMIT 15`
  );
  // Total views today
  const todayRow = await dbAll<{c:number}>(
    `SELECT COUNT(*) as c FROM page_views WHERE date(created_at) = date('now','localtime')`
  );
  const todayViews  = todayRow[0]?.c || 0;
  const todayUnique = await dbAll<{c:number}>(
    `SELECT COUNT(DISTINCT ip_hash) as c FROM page_views WHERE date(created_at) = date('now','localtime')`
  );
  const todayUniqueV = todayUnique[0]?.c || 0;
  // Recent visits
  const recent = await dbAll<{path:string;ip_hash:string;user_agent:string;created_at:string}>(
    `SELECT path, ip_hash, substr(user_agent,1,60) as user_agent, created_at
     FROM page_views ORDER BY id DESC LIMIT 30`
  );
  const totalAllTime = await dbAll<{c:number}>(`SELECT COUNT(*) as c FROM page_views`);
  const totalV = totalAllTime[0]?.c || 0;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Analytics — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("admin-analytics", req)}
  <div class="container" style="max-width:1100px;padding:32px 20px 80px">
    <h1 style="font-size:26px;font-weight:800;margin-bottom:6px">📊 Visitor Analytics</h1>
    <p style="color:var(--text-muted);margin-bottom:28px">Page view tracking · Last 30 days</p>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:32px">
      ${[
        ["Today's Views", todayViews],
        ["Today Unique", todayUniqueV],
        ["All-Time Views", totalV],
        ["Pages Tracked", topPages.length],
      ].map(([k,v]) => `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px 18px">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${k}</div>
          <div style="font-size:28px;font-weight:800;color:var(--accent)">${v}</div>
        </div>`).join("")}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px">
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px">
        <h3 style="margin:0 0 16px;font-size:15px">Top Pages (30d)</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          ${topPages.map(p => `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:7px 0;color:var(--text)">${esc(p.path)}</td>
            <td style="padding:7px 0;text-align:right;color:var(--accent);font-weight:700">${p.views}</td>
          </tr>`).join("")}
        </table>
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px">
        <h3 style="margin:0 0 16px;font-size:15px">Daily Breakdown (14d)</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr style="color:var(--text-muted);font-size:11px;text-transform:uppercase">
            <th style="padding:4px 0;text-align:left">Date</th>
            <th style="padding:4px 0;text-align:right">Views</th>
            <th style="padding:4px 0;text-align:right">Unique</th>
          </tr>
          ${daily.map(d => `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:6px 0">${esc(d.day)}</td>
            <td style="padding:6px 0;text-align:right;font-weight:600">${d.views}</td>
            <td style="padding:6px 0;text-align:right;color:var(--accent)">${(d as any).unique_visitors}</td>
          </tr>`).join("")}
        </table>
      </div>
    </div>

    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px">
      <h3 style="margin:0 0 16px;font-size:15px">Recent Visits</h3>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <tr style="color:var(--text-muted);font-size:11px;text-transform:uppercase;border-bottom:1px solid var(--border)">
            <th style="padding:6px 8px;text-align:left">Time</th>
            <th style="padding:6px 8px;text-align:left">Path</th>
            <th style="padding:6px 8px;text-align:left">Visitor Hash</th>
            <th style="padding:6px 8px;text-align:left">Agent</th>
          </tr>
          ${recent.map(r => `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:6px 8px;color:var(--text-muted);white-space:nowrap">${esc(r.created_at)}</td>
            <td style="padding:6px 8px;color:var(--accent)">${esc(r.path)}</td>
            <td style="padding:6px 8px;font-family:monospace;font-size:11px;color:var(--text-muted)">${esc(r.ip_hash)}</td>
            <td style="padding:6px 8px;color:var(--text-muted)">${esc(r.user_agent)}</td>
          </tr>`).join("")}
        </table>
      </div>
    </div>
    <div style="margin-top:16px"><a href="/admin" style="color:var(--text-muted);font-size:13px">← Back to Admin</a></div>
  </div>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── Admin Picks CRUD ──────────────────────────────────────────────────────────
app.get("/admin/picks", requireAdmin, async (req: Request, res: Response) => {
  const picks = await getAllPicks();
  const msg = req.query.msg as string | undefined;
  const err = req.query.err as string | undefined;

  const riskColors: Record<string, string> = { Low: "#10b981", Medium: "#f59e0b", High: "#ef4444" };

  const typeLabel: Record<string, string> = { intraday: "⚡ Intraday", swing: "🌊 Swing", longterm: "📈 Long Term" };
  const rows = picks.map(p => `
    <tr>
      <td><strong>${esc(p.stock_symbol)}</strong>${p.company_name ? `<br><small class="text-dim">${esc(p.company_name)}</small>` : ""}</td>
      <td><span class="pick-type-badge pick-type-${(p.pick_type||'intraday').replace(' ','-')}">${typeLabel[p.pick_type ?? 'intraday'] ?? p.pick_type}</span></td>
      <td><span class="pick-badge-${p.direction.toLowerCase()}">${p.direction}</span></td>
      <td>₹${p.entry_low}–${p.entry_high}</td>
      <td>${p.target ? "₹" + p.target : "—"}</td>
      <td>${p.stop_loss ? "₹" + p.stop_loss : "—"}</td>
      <td><span style="color:${riskColors[p.risk_level] ?? "#888"}">${esc(p.risk_level)}</span></td>
      <td><span class="pick-status-badge pick-status-${p.status}">${p.status}</span></td>
      <td style="font-size:12px;color:var(--text-muted)">${p.published_at?.slice(0, 16) ?? "—"}</td>
      <td>
        <form method="POST" action="/admin/picks/${p.id}/status" style="display:inline">
          <input type="hidden" name="status" value="${p.status === "active" ? "expired" : "active"}">
          <button class="btn-admin-action" style="min-width:72px">${p.status === "active" ? "Archive" : "Activate"}</button>
        </form>
        <form method="POST" action="/admin/picks/${p.id}/delete" style="display:inline;margin-left:4px"
              onsubmit="return confirm('Delete this pick?')">
          <button class="btn-admin-action btn-danger">Delete</button>
        </form>
      </td>
    </tr>`).join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Picks Manager — ZeroScreen Admin</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("admin-picks", req)}
  <div class="container" style="max-width:1100px">
    <div class="admin-header">
      <div>
        <h1>🛠 Picks Manager</h1>
        <p class="page-sub">Curate today's trading opportunities shown on /today</p>
      </div>
      <a href="/admin" class="btn-secondary">← Overview</a>
    </div>

    ${msg ? `<div class="auth-success" style="margin-bottom:18px">✅ ${esc(msg)}</div>` : ""}
    ${err ? `<div class="auth-error"   style="margin-bottom:18px">⚠️ ${esc(err)}</div>`  : ""}

    <!-- Add Pick Form -->
    <div class="admin-form-card">
      <h3 style="margin:0 0 16px">➕ Add New Pick</h3>
      <form method="POST" action="/admin/picks" class="picks-form">
        <div class="picks-form-row">
          <div class="form-group">
            <label>Symbol *</label>
            <input type="text" name="stock_symbol" required placeholder="e.g. RELIANCE" class="form-input" style="text-transform:uppercase">
          </div>
          <div class="form-group">
            <label>Company Name</label>
            <input type="text" name="company_name" placeholder="Optional" class="form-input">
          </div>
          <div class="form-group">
            <label>Type *</label>
            <select name="pick_type" class="form-input">
              <option value="intraday" selected>⚡ Intraday</option>
              <option value="swing">🌊 Swing</option>
              <option value="longterm">📈 Long Term</option>
            </select>
          </div>
          <div class="form-group">
            <label>Direction *</label>
            <select name="direction" class="form-input">
              <option value="LONG">LONG</option>
              <option value="SHORT">SHORT</option>
            </select>
          </div>
          <div class="form-group">
            <label>Entry Low (₹) *</label>
            <input type="number" name="entry_low" required step="0.01" class="form-input">
          </div>
          <div class="form-group">
            <label>Entry High (₹) *</label>
            <input type="number" name="entry_high" required step="0.01" class="form-input">
          </div>
          <div class="form-group">
            <label>Target (₹)</label>
            <input type="number" name="target" step="0.01" class="form-input">
          </div>
          <div class="form-group">
            <label>Stop Loss (₹)</label>
            <input type="number" name="stop_loss" step="0.01" class="form-input">
          </div>
          <div class="form-group">
            <label>Risk Level *</label>
            <select name="risk_level" class="form-input">
              <option value="Low">Low</option>
              <option value="Medium" selected>Medium</option>
              <option value="High">High</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-top:10px">
          <label>Reason / Thesis *</label>
          <textarea name="reason" required rows="3" class="form-input" placeholder="Why this pick? e.g. Breakout above resistance, strong volume, sector tailwind…" style="width:100%;resize:vertical"></textarea>
        </div>
        <button type="submit" class="btn-primary" style="margin-top:12px">Add Pick</button>
      </form>
    </div>

    <!-- Picks Table -->
    <div class="table-wrap" style="margin-top:24px;overflow-x:auto">
      <table class="stocks-table">
        <thead>
          <tr>
            <th>Symbol</th><th>Type</th><th>Dir</th><th>Entry Zone</th><th>Target</th>
            <th>SL</th><th>Risk</th><th>Status</th><th>Published</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="10" class="no-data">No picks yet. Add one above.</td></tr>'}</tbody>
      </table>
    </div>
  </div>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

app.post("/admin/picks", requireAdmin, async (req: Request, res: Response) => {
  const { stock_symbol, company_name, direction, pick_type, entry_low, entry_high, target, stop_loss, reason, risk_level } = req.body;
  const sym = (stock_symbol || "").trim().toUpperCase();
  const eLow = parseFloat(entry_low);
  const eHigh = parseFloat(entry_high);
  if (!sym || !reason?.trim() || isNaN(eLow) || isNaN(eHigh)) {
    res.redirect("/admin/picks?err=Missing+required+fields");
    return;
  }
  await createPick({
    stock_symbol: sym,
    company_name: company_name?.trim() || undefined,
    direction: direction === "SHORT" ? "SHORT" : "LONG",
    pick_type: ["intraday","swing","longterm"].includes(pick_type) ? pick_type : "intraday",
    entry_low: eLow, entry_high: eHigh,
    target: target ? parseFloat(target) : undefined,
    stop_loss: stop_loss ? parseFloat(stop_loss) : undefined,
    reason: reason.trim(),
    risk_level: ["Low", "Medium", "High"].includes(risk_level) ? risk_level : "Medium",
    status: "active",
    created_by: req.session.userId,
  });
  // Send daily picks email digest to all opted-in users (non-blocking)
  getActivePicks().then(async allPicks => {
    if (!allPicks.length) return;
    const subs = await getPicksEmailSubscribers();
    if (subs.length) sendPicksDigest(subs, allPicks).catch(() => {});
  }).catch(() => {});
  res.redirect("/admin/picks?msg=Pick+added+successfully");
});

app.post("/admin/picks/:id/status", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  if (!Number.isInteger(id) || !["active", "expired"].includes(status)) {
    res.redirect("/admin/picks?err=Invalid+request");
    return;
  }
  await updatePickStatus(id, status);
  res.redirect("/admin/picks?msg=Status+updated");
});

app.post("/admin/picks/:id/delete", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) { res.redirect("/admin/picks?err=Invalid+id"); return; }
  await deletePick(id);
  res.redirect("/admin/picks?msg=Pick+deleted");
});

// ── Admin Content ─────────────────────────────────────────────────────────────
app.get("/admin/content", requireAdmin, async (req: Request, res: Response) => {
  const settings = await getAllSettings();
  const msg = req.query.msg as string | undefined;
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Content — ZeroScreen Admin</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("admin-content", req)}
  <div class="container" style="max-width:700px">
    <div class="admin-header">
      <div>
        <h1>📢 Content Control</h1>
        <p class="page-sub">Update site text and links</p>
      </div>
      <a href="/admin" class="btn-secondary">← Overview</a>
    </div>
    ${msg ? `<div class="auth-success" style="margin-bottom:18px">✅ ${esc(msg)}</div>` : ""}
    <form method="POST" action="/admin/content" class="admin-form-card" style="display:flex;flex-direction:column;gap:16px">
      <div class="form-group">
        <label>Home Page Headline</label>
        <input type="text" name="home_headline" class="form-input" value="${esc(settings.home_headline ?? "India\\'s sharpest NSE screener")}">
      </div>
      <div class="form-group">
        <label>Banner Text <small class="text-dim">(optional — shown at top of home page)</small></label>
        <input type="text" name="banner_text" class="form-input" value="${esc(settings.banner_text ?? "")}" placeholder="e.g. 🎉 New feature: Picks page is live!">
      </div>
      <div class="form-group">
        <label>Telegram Link</label>
        <input type="url" name="telegram_link" class="form-input" value="${esc(settings.telegram_link ?? "")}" placeholder="https://t.me/your_channel">
      </div>
      <button type="submit" class="btn-primary">Save Changes</button>
    </form>
  </div>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

app.post("/admin/content", requireAdmin, async (req: Request, res: Response) => {
  const { home_headline, banner_text, telegram_link } = req.body;
  await Promise.all([
    setSetting("home_headline", (home_headline ?? "").trim()),
    setSetting("banner_text", (banner_text ?? "").trim()),
    setSetting("telegram_link", (telegram_link ?? "").trim()),
  ]);
  res.redirect("/admin/content?msg=Content+updated+successfully");
});

// ── Admin Signal Control ───────────────────────────────────────────────────────
app.get("/admin/signals", requireAdmin, async (req: Request, res: Response) => {
  const signalsMode   = await getSetting("signals_mode");
  const kiteToken     = await getSetting("kite_access_token");
  const kiteTokenAt   = await getSetting("kite_token_set_at");
  const msg  = req.query.msg  as string | undefined;
  const err  = req.query.err  as string | undefined;
  const tokenMasked = kiteToken ? kiteToken.slice(0, 6) + "••••••••••••••" + kiteToken.slice(-4) : "";
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Signal Control — ZeroScreen Admin</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("admin-signals", req)}
  <div class="container" style="max-width:640px">
    <div class="admin-header">
      <div>
        <h1>🤖 Signal Control</h1>
        <p class="page-sub">Zerodha token · Guest display mode</p>
      </div>
      <a href="/admin" class="btn-secondary">← Overview</a>
    </div>
    ${msg ? `<div class="auth-success" style="margin-bottom:18px">✅ ${esc(msg)}</div>` : ""}
    ${err ? `<div class="auth-error"   style="margin-bottom:18px">⚠️ ${esc(err)}</div>` : ""}

    <!-- ── Zerodha Token ─────────────────────────────────────────────────── -->
    <div class="admin-form-card" style="margin-bottom:20px">
      <h3 style="margin:0 0 6px">🔑 Zerodha Access Token</h3>
      <p class="text-dim" style="margin-bottom:14px;font-size:13px">
        1. Login at <a href="https://kite.zerodha.com" target="_blank" rel="noopener" style="color:var(--accent)">kite.zerodha.com</a> →
        Developer Console → copy your <strong>access_token</strong>.<br>
        2. Paste it here. The trading bot polls <code>/internal/kite-token</code> and starts automatically.
      </p>
      ${kiteToken ? `
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px;display:flex;align-items:center;gap:10px">
        <span style="color:#22c55e">●</span>
        <span>Token set: <code>${esc(tokenMasked)}</code></span>
        <span class="text-dim" style="margin-left:auto;font-size:12px">${esc(kiteTokenAt)}</span>
      </div>` : `
      <div style="background:var(--bg-card);border:1px solid #ef444440;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:#ef4444">
        ● No token set — bot cannot authenticate with Zerodha
      </div>`}
      <form method="POST" action="/admin/signals/token" style="display:flex;gap:10px;flex-wrap:wrap">
        <input type="text" name="token" placeholder="Paste access_token here"
          style="flex:1;min-width:220px;padding:8px 12px;background:var(--bg-input,#1e293b);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px"
          autocomplete="off" spellcheck="false">
        <button type="submit" class="btn-primary">Save Token</button>
        ${kiteToken ? `<button type="submit" name="clear" value="1" class="btn-secondary" style="color:#ef4444">Clear</button>` : ""}
      </form>
      <p class="text-dim" style="margin-top:10px;font-size:12px">
        Token is stored in the DB and served only to the bot via a secret-protected endpoint.<br>
        <strong>Set <code>INTERNAL_BOT_SECRET</code></strong> in your <code>.env</code> — bot must send the same secret in <code>X-Bot-Secret</code> header.
      </p>
    </div>

    <!-- ── Guest Display Mode ────────────────────────────────────────────── -->
    <div class="admin-form-card">
      <h3 style="margin:0 0 12px">👁 Guest Signals Display</h3>
      <p class="text-dim" style="margin-bottom:16px">Controls what guests see on the Signals page.</p>
      <form method="POST" action="/admin/signals" style="display:flex;gap:12px;flex-wrap:wrap">
        <button type="submit" name="mode" value="live"
          class="${signalsMode === "live" ? "btn-primary" : "btn-secondary"}">
          📡 Live Mode ${signalsMode === "live" ? "✓ Active" : ""}
        </button>
        <button type="submit" name="mode" value="teaser"
          class="${signalsMode === "teaser" ? "btn-primary" : "btn-secondary"}">
          🔒 Teaser Mode ${signalsMode === "teaser" ? "✓ Active" : ""}
        </button>
      </form>
      <div class="text-dim" style="margin-top:16px;font-size:13px">
        <strong>Live Mode</strong>: Guests see simplified live stats (no exact prices).<br>
        <strong>Teaser Mode</strong>: Guests see a static teaser — "Bot is active" with sign-in CTA only.
      </div>
    </div>
  </div>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

app.post("/admin/signals/token", requireAdmin, async (req: Request, res: Response) => {
  if (req.body.clear === "1") {
    await setSetting("kite_access_token", "");
    await setSetting("kite_token_set_at", "");
    res.redirect("/admin/signals?msg=Token+cleared");
    return;
  }
  const token = (req.body.token || "").trim();
  if (!token) { res.redirect("/admin/signals?err=Token+cannot+be+empty"); return; }
  await setSetting("kite_access_token", token);
  await setSetting("kite_token_set_at", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }));
  res.redirect("/admin/signals?msg=Zerodha+token+saved.+Bot+will+pick+it+up+on+next+poll.");
});

// ── GET /today ─────────────────────────────────────────────────────────────────
app.get("/today", async (req: Request, res: Response) => {
  const picks = await getActivePicks();
  const isPremium = userIsPremium(req);
  const isLoggedIn = !!req.session?.userId;
  const isAdmin = req.session?.userRole === 'admin';
  const autoPicks = isLoggedIn ? await getAutoPaperPicks(req.session.userId!) : false;

  // Last generated: use the most recent pick's published_at
  const lastGenerated = picks.length > 0 ? picks[0].published_at?.slice(0, 10) : null;
  // Determine "based on" close date (picks generated at 6:45 PM from same-day close)
  const basedOnDate = lastGenerated ?? new Date().toISOString().slice(0, 10);

  // Access tiers:
  // Guest       → intraday direction only (prices locked), swing/longterm fully locked
  // Free user   → intraday full + swing direction only (prices locked), longterm locked
  // Premium/Admin → all picks, full detail

  const riskClass: Record<string, string> = { Low: "risk-low", Medium: "risk-medium", High: "risk-high" };
  const riskIcon:  Record<string, string> = { Low: "🟢", Medium: "🟡", High: "🔴" };

  const intradayPicks  = picks.filter(p => p.pick_type === 'intraday');
  const swingPicks     = picks.filter(p => p.pick_type === 'swing');
  const longtermPicks  = picks.filter(p => p.pick_type === 'longterm');

  function renderPickCard(p: any, showPrices: boolean): string {
    return `<div class="pick-card pick-card-${p.direction.toLowerCase()}">
      <div class="pick-card-top">
        <div>
          <span class="pick-symbol">${esc(p.stock_symbol)}</span>
          ${p.company_name ? `<span class="pick-company">${esc(p.company_name)}</span>` : ""}
        </div>
        <span class="pick-badge-${p.direction.toLowerCase()}">${p.direction === "LONG" ? "▲ LONG" : "▼ SHORT"}</span>
      </div>
      ${showPrices ? `
      <div class="pick-entry-zone">
        <span class="pick-entry-label">Entry Zone</span>
        <span class="pick-entry-val">₹${p.entry_low} – ₹${p.entry_high}</span>
      </div>
      ${p.target   ? `<div class="pick-tp"><span class="pick-tp-label">🎯 Target</span><span class="pick-tp-val">₹${p.target}</span></div>` : ""}
      ${p.stop_loss? `<div class="pick-sl"><span class="pick-sl-label">🛡️ Stop Loss</span><span class="pick-sl-val">₹${p.stop_loss}</span></div>` : ""}
      <div class="pick-reason">${esc(p.reason)}</div>
      <div class="pick-footer">
        <span class="pick-risk-badge ${riskClass[p.risk_level] ?? "risk-medium"}">${riskIcon[p.risk_level] ?? "🟡"} ${p.risk_level} Risk</span>
        <span class="pick-date">${p.published_at?.slice(0, 10) ?? ""}</span>
      </div>` : `
      <div class="pick-locked-body">
        <div class="pick-locked-row"><span>Entry Zone</span><span class="lock-val">🔒</span></div>
        <div class="pick-locked-row"><span>Target</span><span class="lock-val">🔒</span></div>
        <div class="pick-locked-row"><span>Stop Loss</span><span class="lock-val">🔒</span></div>
      </div>
      <div class="pick-footer">
        <span class="pick-risk-badge ${riskClass[p.risk_level] ?? "risk-medium"}">${riskIcon[p.risk_level] ?? "🟡"} ${p.risk_level} Risk</span>
        <span class="pick-date">${p.published_at?.slice(0, 10) ?? ""}</span>
      </div>`}
    </div>`;
  }

  function renderSection(
    icon: string, title: string, subtitle: string,
    sectionPicks: any[], visible: boolean, showPrices: boolean,
    requiredTier: string
  ): string {
    if (!visible || sectionPicks.length === 0) {
      if (sectionPicks.length === 0 && visible) return "";
      // Fully locked section teaser
      return `<div class="picks-section">
        <div class="picks-section-header picks-section-locked-header">
          <div>
            <span class="picks-section-icon">${icon}</span>
            <span class="picks-section-title">${title}</span>
            <span class="picks-section-sub">${subtitle}</span>
          </div>
          <span class="picks-tier-lock">🔒 ${requiredTier} only</span>
        </div>
        <div class="picks-locked-section">
          <div class="picks-locked-msg">
            <span class="picks-locked-icon">🔒</span>
            <div>
              <strong>${title} picks are ${requiredTier}-only</strong>
              <p>${requiredTier === 'Free' ? 'Sign in' : 'Upgrade to Premium'} to unlock entry zones, targets, and stop losses for ${title.toLowerCase()} trades.</p>
            </div>
            <a href="${requiredTier === 'Free' ? '/login' : '/premium'}" class="btn-upgrade">${requiredTier === 'Free' ? 'Sign In Free →' : 'Upgrade ₹499/mo →'}</a>
          </div>
        </div>
      </div>`;
    }
    return `<div class="picks-section">
      <div class="picks-section-header">
        <div>
          <span class="picks-section-icon">${icon}</span>
          <span class="picks-section-title">${title}</span>
          <span class="picks-section-sub">${subtitle}</span>
        </div>
        <span class="picks-section-count">${sectionPicks.length} pick${sectionPicks.length !== 1 ? 's' : ''}</span>
      </div>
      ${!showPrices ? `<div class="picks-prices-locked-bar">🔒 Entry, target &amp; stop loss prices require <a href="/premium">Premium</a></div>` : ""}
      <div class="picks-grid">${sectionPicks.map(p => renderPickCard(p, showPrices)).join("")}</div>
    </div>`;
  }

  // Determine visibility + price access per tier
  // Guest:   intraday visible (prices locked), swing+longterm locked
  // Free:    intraday visible (prices shown), swing visible (prices locked), longterm locked
  // Premium/Admin: all visible, all prices shown
  const intradayVisible  = true;
  const intradayPrices   = isLoggedIn || isPremium;
  const swingVisible     = isLoggedIn || isPremium;
  const swingPrices      = isPremium;
  const longtermVisible  = isPremium;
  const longtermPrices   = isPremium;

  const intradaySection  = renderSection("⚡", "Intraday Picks", "Same-day entry & exit", intradayPicks, intradayVisible, intradayPrices, "Free");
  const swingSection     = renderSection("🌊", "Swing Picks", "2–10 day holding period", swingPicks, swingVisible, swingPrices, "Premium");
  const longtermSection  = renderSection("📈", "Long Term Picks", "Months to years horizon", longtermPicks, longtermVisible, longtermPrices, "Premium");

  // For locked sections when not logged in or not premium, show teaser cards
  const swingTeaser = !swingVisible ? renderSection("🌊", "Swing Picks", "2–10 day holding period", swingPicks.length > 0 ? swingPicks : [{id:0,stock_symbol:"?",company_name:null,direction:"LONG",pick_type:"swing",entry_low:0,entry_high:0,target:null,stop_loss:null,reason:"",risk_level:"Medium",status:"active",published_at:"",expires_at:null,created_by:null}], false, false, "Free") : "";
  const longtermTeaser = !longtermVisible ? renderSection("📈", "Long Term Picks", "Months to years horizon", longtermPicks.length > 0 ? longtermPicks : [{id:0,stock_symbol:"?",company_name:null,direction:"LONG",pick_type:"longterm",entry_low:0,entry_high:0,target:null,stop_loss:null,reason:"",risk_level:"Low",status:"active",published_at:"",expires_at:null,created_by:null}], false, false, "Premium") : "";

  const tierLabel = isAdmin ? "👑 Admin" : isPremium ? "⚡ Premium" : isLoggedIn ? "🔓 Free User" : "👤 Guest";
  const tierClass = isAdmin ? "sig-tier-admin" : isPremium ? "sig-tier-premium" : isLoggedIn ? "sig-tier-free" : "sig-tier-guest";

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Today's Picks — ZeroScreen</title>
  ${seoMeta({ title: "Today's Expert Stock Picks — ZeroScreen", description: "Daily NSE stock picks with entry zone, target and stop-loss. Practice paper trading on every pick. Updated every market day.", url: "/today" })}
  <link rel="stylesheet" href="/public/css/style.css">
  <meta http-equiv="refresh" content="300">
  <style>
    .auto-paper-panel{display:flex;align-items:center;gap:14px;background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:14px 18px;margin-bottom:1.25rem;flex-wrap:wrap}
    .auto-paper-icon{font-size:1.4rem;flex-shrink:0}
    .auto-paper-body{flex:1;min-width:0}
    .auto-paper-title{font-size:.9rem;font-weight:700;color:var(--text)}
    .auto-paper-desc{font-size:.75rem;color:var(--text-muted);margin-top:2px}
    .auto-paper-toggle{display:flex;align-items:center;gap:10px;flex-shrink:0}
    .atp-switch{position:relative;display:inline-block;width:46px;height:26px;cursor:pointer}
    .atp-switch input{opacity:0;width:0;height:0}
    .atp-knob{position:absolute;top:0;left:0;right:0;bottom:0;background:#374151;border-radius:26px;transition:.3s}
    .atp-knob:before{position:absolute;content:"";height:20px;width:20px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.3s}
    input:checked+.atp-knob{background:#10b981}
    input:checked+.atp-knob:before{transform:translateX(20px)}
    .atp-label{font-size:.78rem;font-weight:600;color:var(--text-muted);min-width:44px}
    .picks-close-badge{display:inline-flex;align-items:center;gap:5px;font-size:.74rem;background:var(--bg2,#0f172a);border:1px solid var(--border);border-radius:8px;padding:4px 10px;color:var(--text-muted);margin-left:8px}
  </style>
</head>
<body class="page-theme-picks">
  ${nav("today", req)}
  <div class="container" style="max-width:1060px">
    <div class="picks-hero">
      <div class="picks-hero-left">
        <h1 class="picks-hero-title">🔥 Today's Picks</h1>
        <p class="picks-hero-sub">Curated trading opportunities across 3 horizons · Updated daily
          <span class="picks-close-badge">📊 Based on ${basedOnDate} market close</span>
        </p>
        ${picks.length > 0 ? `<div class="picks-hero-count">🎯 ${picks.length} active pick${picks.length !== 1 ? "s" : ""} today</div>` : ""}
        <div class="picks-disclaimer-banner">📋 Picks are generated every weekday at <strong>6:45 PM IST</strong> from the day's closing data — fundamentals, price action &amp; signals. Entry zones are reference prices only. <strong>Not SEBI registered. Not investment advice. Do your own research.</strong></div>
      </div>
      <div class="picks-hero-meta">
        <span class="picks-hero-updated">🕐 ${new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</span>
        <span class="sig-tier-badge ${tierClass}">${tierLabel}</span>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(`📈 Today's NSE Picks on ZeroScreen — ${picks.length} active ideas with entry, target & SL`)}&url=${encodeURIComponent(`${BASE_URL}/today`)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;background:#1d9bf022;border:1px solid #1d9bf055;border-radius:8px;font-size:.74rem;font-weight:700;color:#1d9bf0;text-decoration:none">𝕏 Share on X</a>
          <button onclick="navigator.clipboard.writeText('${BASE_URL}/today').then(()=>{this.textContent='✅ Copied!';setTimeout(()=>this.textContent='🔗 Copy Link',2000)})" style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;font-size:.74rem;font-weight:700;color:var(--text-muted);cursor:pointer">🔗 Copy Link</button>
        </div>
      </div>
    </div>

    ${/* ── Auto Paper Trade panel (logged-in users) ── */ ""}
    ${isLoggedIn ? `
    <div class="auto-paper-panel">
      <div class="auto-paper-icon">🤖</div>
      <div class="auto-paper-body">
        <div class="auto-paper-title">Auto Paper Trade Today's Picks ${!isPremium ? '<span style="font-size:.7rem;background:#f59e0b22;color:#f59e0b;border:1px solid #f59e0b44;border-radius:6px;padding:1px 7px;margin-left:6px">💎 Premium</span>' : ''}</div>
        <div class="auto-paper-desc">${isPremium
          ? `At <strong>9:15 AM IST</strong> after market opens, all today's picks are automatically paper-traded in your portfolio at the entry zone midpoint price with SL &amp; target set.`
          : `Upgrade to Premium — picks will be auto-bought in your paper portfolio at 9:15 AM IST every trading day.`
        }</div>
      </div>
      <div class="auto-paper-toggle">
        ${isPremium ? `
        <span class="atp-label" id="atp-lbl">${autoPicks ? "ON" : "OFF"}</span>
        <label class="atp-switch">
          <input type="checkbox" id="atp-chk" ${autoPicks ? "checked" : ""} onchange="toggleAutoPaper(this.checked)">
          <span class="atp-knob"></span>
        </label>` : `
        <a href="/my-paper-trade/upgrade" style="font-size:.8rem;background:var(--accent);color:#fff;border-radius:8px;padding:7px 14px;text-decoration:none;font-weight:700;white-space:nowrap">🔓 Upgrade</a>`}
      </div>
    </div>` : `
    <div class="auto-paper-panel" style="justify-content:space-between">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:1.3rem">🤖</span>
        <div><div class="auto-paper-title">Auto Paper Trade Today's Picks</div><div class="auto-paper-desc">Sign in to auto-buy these picks in your paper portfolio at 9:15 AM IST daily.</div></div>
      </div>
      <a href="/login?next=/today" style="font-size:.8rem;background:var(--accent);color:#fff;border-radius:8px;padding:7px 14px;text-decoration:none;font-weight:700;white-space:nowrap">Sign In Free →</a>
    </div>`}

    ${intradaySection}
    ${swingSection || swingTeaser}
    ${longtermSection || longtermTeaser}

    <footer class="site-footer"><span>© 2026 ZeroScreen &mdash; Picks are for educational &amp; informational purposes only. Not SEBI registered. Not investment advice. Invest at your own risk.</span></footer>
  </div>
  <script src="/public/js/app.js"></script>
  ${isPremium ? `<script>
  async function toggleAutoPaper(enabled) {
    const lbl = document.getElementById('atp-lbl');
    if (lbl) lbl.textContent = enabled ? 'ON' : 'OFF';
    try {
      const r = await fetch('/api/auto-paper-picks/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      const d = await r.json();
      if (!d.ok) { alert(d.msg || 'Failed to update'); if (lbl) lbl.textContent = enabled ? 'OFF' : 'ON'; }
    } catch (e) { console.error(e); }
  }
  </script>` : ""}
</body>
</html>`);
});

// ── Admin Subscriptions ────────────────────────────────────────────────────────
app.get("/admin/subs", requireAdmin, async (req: Request, res: Response) => {
  const subs = await getAllSubscriptions();
  const active  = subs.filter(s => s.status === "active").length;
  const revenue = subs.filter(s => s.status === "active").reduce((sum) => sum + 499, 0);
  const rows = subs.map(s => `
    <tr>
      <td>${esc(s.user_name)}<br><small class="text-dim">${esc(s.user_email)}</small></td>
      <td><span class="pick-status-badge pick-status-${s.status}">${s.status}</span></td>
      <td>₹${(s.amount / 100).toFixed(0)}</td>
      <td style="font-size:12px;color:var(--text-muted)">${s.starts_at?.slice(0,10) ?? "—"}</td>
      <td style="font-size:12px;color:var(--text-muted)">${s.expires_at?.slice(0,10) ?? "—"}</td>
      <td style="font-family:monospace;font-size:11px;color:var(--text-muted)">${s.razorpay_payment_id ?? "—"}</td>
    </tr>`).join("");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Subscriptions — ZeroScreen Admin</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body>
  ${nav("admin-subs", req)}
  <div class="container" style="max-width:1100px">
    <div class="admin-header">
      <div><h1>💳 Subscriptions</h1><p class="page-sub">All Premium subscriptions</p></div>
      <a href="/admin" class="btn-secondary">← Overview</a>
    </div>
    <div class="admin-stats-row">
      <div class="admin-stat-card"><div class="admin-stat-num green">${active}</div><div class="admin-stat-label">Active</div></div>
      <div class="admin-stat-card"><div class="admin-stat-num">₹${revenue}</div><div class="admin-stat-label">Monthly Revenue</div></div>
      <div class="admin-stat-card"><div class="admin-stat-num">${subs.length}</div><div class="admin-stat-label">Total Orders</div></div>
    </div>
    <div class="table-wrap" style="margin-top:20px;overflow-x:auto">
      <table class="stocks-table">
        <thead><tr><th>User</th><th>Status</th><th>Amount</th><th>Started</th><th>Expires</th><th>Payment ID</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="no-data">No subscriptions yet.</td></tr>'}</tbody>
      </table>
    </div>
  </div>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── GET /premium ────────────────────────────────────────────────────────────────
app.get("/premium", async (req: Request, res: Response) => {
  const isPremium = userIsPremium(req);
  const isLoggedIn = !!req.session?.userId;
  let activeSub = null;
  if (isLoggedIn) activeSub = await getActiveSubscription(req.session.userId!);
  const razorpayEnabled = RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Premium — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
  ${razorpayEnabled ? `<script src="https://checkout.razorpay.com/v1/checkout.js"></script>` : ""}
</head>
<body class="page-theme-premium">
  ${nav("premium", req)}
  <div class="container" style="max-width:860px">

    ${isPremium ? `
    <!-- ALREADY PREMIUM -->
    <div class="premium-hero">
      <div class="premium-badge-large">💎</div>
      <h1>You're a Premium Member</h1>
      <p>Your premium access is active${activeSub?.expires_at ? ` until <strong>${activeSub.expires_at.slice(0,10)}</strong>` : ""}.</p>
      <div class="premium-active-features">
        <div class="paf-item">✅ Live position — exact entry price &amp; stop loss in real time</div>
        <div class="paf-item">✅ Telegram instant alerts when bot enters or exits</div>
      </div>
      <a href="/signals" class="btn-primary" style="margin-top:24px">View Signals →</a>
    </div>
    ` : `
    <!-- UPGRADE PAGE -->
    <div class="premium-hero">
      <div class="premium-badge-large">⚡</div>
      <h1 class="premium-hero-title">Upgrade to <span class="premium-highlight">Premium</span></h1>
      <p class="premium-hero-sub">Get the full edge — real-time signals, stop loss data, and 5-year backtest insights</p>
    </div>

    <div class="premium-features-grid">
      <div class="pf-card">
        <div class="pf-icon">📡</div>
        <h3>Real-Time Signals</h3>
        <p>See exact entry price, stop loss, quantity, and AI confidence score for every BANKNIFTY trade — live.</p>
        <div class="pf-compare">
          <span class="pf-free">Free: Direction only</span>
          <span class="pf-premium">Premium: Full details</span>
        </div>
      </div>

      <div class="pf-card">
        <div class="pf-icon">📢</div>
        <h3>Telegram Alerts</h3>
        <p>Get instant notifications when the bot enters or exits a trade — direct to your Telegram.</p>
        <div class="pf-compare">
          <span class="pf-free">Free: Email digest only</span>
          <span class="pf-premium">Premium: Instant Telegram</span>
        </div>
      </div>
    </div>

    <!-- Pricing card -->
    <div class="premium-pricing-card">
      <div class="pricing-amount">₹499 <span class="pricing-period">/month</span></div>
      <div class="pricing-label">Cancel anytime · Instant activation</div>
      <ul class="pricing-features">
        <li>✅ Live active position — exact entry &amp; stop loss</li>
        <li>✅ Telegram instant alerts on every trade</li>
        <li>✅ Priority support</li>
      </ul>
      ${isLoggedIn
        ? razorpayEnabled
          ? `<button id="pay-btn" class="btn-premium-cta" onclick="startPayment()">⚡ Upgrade Now — ₹499/month</button>`
          : `<div class="premium-coming-soon">💳 Payment system coming soon<br><small>Contact us to get early access</small></div>`
        : `<a href="/login?next=/premium" class="btn-premium-cta">Sign In to Upgrade</a>`}
    </div>

    <!-- Comparison table -->
    <div class="compare-table-wrap">
      <h2 style="text-align:center;margin-bottom:20px">Free vs Premium</h2>
      <table class="compare-table">
        <thead><tr><th>Feature</th><th>Free</th><th>💎 Premium</th></tr></thead>
        <tbody>
          <tr><td>NSE Screener</td><td>✅</td><td>✅</td></tr>
          <tr><td>Stock Detail Pages</td><td>✅</td><td>✅</td></tr>
          <tr><td>Today's Picks (entry zone + stop loss)</td><td>✅</td><td>✅</td></tr>
          <tr><td>Signals (direction + PnL + history)</td><td>✅</td><td>✅</td></tr>
          <tr><td>Full 5-Year Backtest Dashboard</td><td>✅</td><td>✅</td></tr>
          <tr class="premium-row"><td>🔴 Live position — entry price + SL + AI score</td><td>🔒</td><td>✅</td></tr>
          <tr class="premium-row"><td>Telegram instant alerts</td><td>🔒</td><td>✅</td></tr>
        </tbody>
      </table>
    </div>
    `}
    <footer class="site-footer"><span>© 2026 ZeroScreen · Secure payment via Razorpay · Cancel anytime</span></footer>
  </div>
  <script src="/public/js/app.js"></script>
  ${isLoggedIn && razorpayEnabled ? `<script>
  async function startPayment() {
    const btn = document.getElementById('pay-btn');
    btn.disabled = true;
    btn.textContent = 'Creating order…';
    try {
      const r = await fetch('/api/razorpay/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!r.ok) throw new Error('Order creation failed');
      const order = await r.json();
      if (order.error) throw new Error(order.error);
      const options = {
        key: '${RAZORPAY_KEY_ID}',
        amount: order.amount,
        currency: 'INR',
        name: 'ZeroScreen Premium',
        description: '1 Month Premium Subscription',
        order_id: order.id,
        prefill: { name: '${req.session?.userName ?? ""}', email: '' },
        theme: { color: '#7c3aed' },
        handler: async function(response) {
          btn.textContent = 'Verifying…';
          const v = await fetch('/api/razorpay/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response)
          });
          const vd = await v.json();
          if (vd.ok) {
            window.location.href = '/premium?success=1';
          } else {
            alert('Payment verification failed. Contact support.');
            btn.disabled = false;
            btn.textContent = '⚡ Upgrade Now — ₹499/month';
          }
        },
        modal: {
          ondismiss: function() {
            btn.disabled = false;
            btn.textContent = '⚡ Upgrade Now — ₹499/month';
          }
        }
      };
      const rzp = new Razorpay(options);
      rzp.open();
    } catch(e) {
      alert('Could not start payment. Please try again.');
      btn.disabled = false;
      btn.textContent = '⚡ Upgrade Now — ₹499/month';
    }
  }
  </script>` : ""}
</body>
</html>`);
});

// ── GET /leaderboard ──────────────────────────────────────────────────────────
app.get("/leaderboard", async (req: Request, res: Response) => {
  const isLoggedIn = !!req.session?.userId;
  const myUserId   = req.session?.userId;
  const entries    = await getPaperLeaderboard(25);
  const fmtInr     = (n: number) => "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const medalOf = (rank: number) => rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;

  const rows = entries.map(e => {
    const winRate = e.trade_count > 0 ? ((e.win_count / e.trade_count) * 100).toFixed(0) + "%" : "—";
    const pctStr  = (e.net_pct >= 0 ? "+" : "") + e.net_pct.toFixed(2) + "%";
    const pnlStr  = (e.net_pnl >= 0 ? "+" : "-") + fmtInr(e.net_pnl);
    const pnlCls  = e.net_pnl >= 0 ? "lb-pos" : "lb-neg";
    return `<tr class="lb-row${e.rank <= 3 ? " lb-top3" : ""}">
      <td class="lb-rank">${medalOf(e.rank)}</td>
      <td class="lb-name">${esc(e.display_name)}</td>
      <td class="lb-bal">${fmtInr(e.balance)}</td>
      <td class="${pnlCls} lb-pnl">${pnlStr}</td>
      <td class="${pnlCls} lb-pct">${pctStr}</td>
      <td class="lb-trades">${e.trade_count}</td>
      <td class="lb-wr">${winRate}</td>
    </tr>`;
  }).join("");

  const myEntry = myUserId
    ? await (async () => {
        const all = await getPaperLeaderboard(1000);
        return all.find((_, i) => false); // placeholder; actual lookup below
      })()
    : null;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Paper Trade Leaderboard — ZeroScreen</title>
  ${seoMeta({ title: "Paper Trade Leaderboard — ZeroScreen", description: "Top virtual traders on ZeroScreen NSE paper trading platform. Track rankings by portfolio balance, returns and win rate.", url: "/leaderboard" })}
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .lb-wrap{max-width:860px;margin:0 auto;padding:24px 16px}
    .lb-hero{text-align:center;padding:28px 16px 8px}
    .lb-hero h1{font-size:1.9rem;font-weight:800;margin-bottom:6px}
    .lb-hero p{color:var(--text-muted);max-width:500px;margin:0 auto;font-size:.95rem}
    .lb-card{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;overflow:hidden;margin-top:24px;box-shadow:var(--shadow-card)}
    .lb-table{width:100%;border-collapse:collapse}
    .lb-table thead th{padding:10px 14px;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);border-bottom:2px solid var(--border);text-align:left;background:var(--bg3);font-weight:700}
    .lb-table thead th:not(:first-child):not(:nth-child(2)){text-align:right}
    .lb-row td{padding:11px 14px;border-bottom:1px solid var(--border);vertical-align:middle;font-size:.88rem}
    .lb-row:last-child td{border-bottom:none}
    .lb-row:hover td{background:var(--hover-bg)}
    .lb-top3 td{font-weight:700}
    .lb-top3:nth-child(1) td{background:linear-gradient(90deg,rgba(245,158,11,.07),transparent)}
    .lb-top3:nth-child(2) td{background:linear-gradient(90deg,rgba(148,163,184,.07),transparent)}
    .lb-top3:nth-child(3) td{background:linear-gradient(90deg,rgba(180,83,9,.07),transparent)}
    .lb-rank{font-size:1.1rem;width:48px}
    .lb-name{font-weight:600;color:var(--text)}
    .lb-bal,.lb-pnl,.lb-pct,.lb-trades,.lb-wr{text-align:right;font-variant-numeric:tabular-nums}
    .lb-pos{color:var(--green);font-weight:700}
    .lb-neg{color:var(--red);font-weight:700}
    .lb-cta{text-align:center;padding:24px 16px;color:var(--text-muted);font-size:.88rem}
    .lb-empty{text-align:center;padding:48px;color:var(--text-muted)}
    .lb-refresh{font-size:.72rem;color:var(--text-dim);text-align:right;padding:8px 14px 0}
  </style>
</head>
<body>
  ${nav("leaderboard", req)}
  <div class="lb-wrap">
    <div class="lb-hero">
      <h1>🏆 Paper Trade Leaderboard</h1>
      <p>Top virtual traders ranked by portfolio return. All figures are simulated — no real money involved.</p>
    </div>
    <div class="lb-refresh">Updated in real-time · Min. 3 trades to qualify</div>
    <div class="lb-card">
      <div style="overflow-x:auto">
        <table class="lb-table">
          <thead><tr>
            <th>Rank</th>
            <th>Trader</th>
            <th style="text-align:right">Balance</th>
            <th style="text-align:right">Net P&amp;L</th>
            <th style="text-align:right">Return</th>
            <th style="text-align:right">Trades</th>
            <th style="text-align:right">Win %</th>
          </tr></thead>
          <tbody>
            ${rows || `<tr><td colspan="7" class="lb-empty">No traders yet — <a href="/my-paper-trade">start trading</a> to appear here!</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
    <div class="lb-cta">
      ${isLoggedIn
        ? `<a href="/my-paper-trade" class="btn-primary">📊 My Portfolio →</a>`
        : `<a href="/signup" class="btn-primary">Create Free Account to Join</a>`}
      <p style="margin-top:12px;font-size:.78rem;color:var(--text-dim)">Names are anonymised. Rankings update after every trade.</p>
    </div>
  </div>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── GET /premium-picks ────────────────────────────────────────────────────────
app.get("/premium-picks", requireAuth, async (req: Request, res: Response) => {
  const isPremium = userIsPremium(req);
  const picks = await getPublishedPremiumPicks();
  const fmtPrice = (n: number | null) => n != null ? `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
  const upside = (p: PremiumPick) => {
    if (!p.target || !p.entry_high) return null;
    const pct = ((p.target - p.entry_high) / p.entry_high) * 100;
    return pct.toFixed(1);
  };

  const cardHtml = (p: PremiumPick, locked: boolean) => `
  <div class="pp-card ${p.strategy.toLowerCase()}">
    <div class="pp-card-header">
      <div>
        <span class="pp-symbol">${esc(p.symbol)}</span>
        ${p.company_name ? `<span class="pp-company">${esc(p.company_name)}</span>` : ""}
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span class="pp-badge pp-strat">${esc(p.strategy)}</span>
        <span class="pp-badge pp-tf">${esc(p.timeframe)}</span>
      </div>
    </div>
    ${locked ? `
    <div class="pp-locked-body">
      <div class="pp-locked-icon">🔒</div>
      <p class="pp-locked-msg">Entry price, target &amp; stop loss are <strong>Premium only</strong></p>
      <a href="/premium" class="btn-primary" style="margin-top:8px;font-size:.82rem">Upgrade ₹499/mo →</a>
    </div>` : `
    <div class="pp-prices">
      <div class="pp-price-item">
        <span class="pp-price-label">Entry Zone</span>
        <span class="pp-price-val">${fmtPrice(p.entry_low)} – ${fmtPrice(p.entry_high)}</span>
      </div>
      <div class="pp-price-item">
        <span class="pp-price-label">Target</span>
        <span class="pp-price-val pp-green">${fmtPrice(p.target)}${upside(p) ? ` <small>(+${upside(p)}%)</small>` : ""}</span>
      </div>
      <div class="pp-price-item">
        <span class="pp-price-label">Stop Loss</span>
        <span class="pp-price-val pp-red">${fmtPrice(p.stop_loss)}</span>
      </div>
    </div>
    <div class="pp-thesis">${esc(p.thesis)}</div>`}
    <div class="pp-footer">
      <span class="pp-date">${p.published_at ? new Date(p.published_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : ""}</span>
    </div>
  </div>`;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Premium Strategy Picks — ZeroScreen</title>
  ${seoMeta({ title: "Premium Strategy Picks — ZeroScreen", description: "Expert-curated NSE stock setups with entry zones, targets, stop loss and trade thesis. Exclusive for Premium members.", url: "/premium-picks" })}
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .pp-wrap{max-width:900px;margin:0 auto;padding:24px 16px}
    .pp-hero{text-align:center;padding:32px 16px 8px}
    .pp-hero h1{font-size:2rem;font-weight:800;margin-bottom:8px}
    .pp-hero p{color:var(--text-muted);font-size:1rem;max-width:520px;margin:0 auto}
    .pp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:20px;margin-top:28px}
    .pp-card{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;overflow:hidden;transition:box-shadow .18s,border-color .18s}
    .pp-card:hover{box-shadow:var(--shadow-lg);border-color:var(--accent)}
    .pp-card-header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:16px 18px 10px}
    .pp-symbol{font-size:1.15rem;font-weight:800;color:var(--text);display:block}
    .pp-company{font-size:.78rem;color:var(--text-muted)}
    .pp-badge{padding:3px 9px;border-radius:99px;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
    .pp-strat{background:var(--accent-glow);color:var(--accent)}
    .pp-tf{background:rgba(124,58,237,.1);color:var(--purple)}
    .pp-prices{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
    .pp-price-item{padding:10px 14px;text-align:center}
    .pp-price-item+.pp-price-item{border-left:1px solid var(--border)}
    .pp-price-label{display:block;font-size:.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}
    .pp-price-val{font-size:.88rem;font-weight:700;font-variant-numeric:tabular-nums}
    .pp-green{color:var(--green)}
    .pp-red{color:var(--red)}
    .pp-thesis{padding:12px 18px;font-size:.82rem;color:var(--text-muted);line-height:1.6;border-bottom:1px solid var(--border)}
    .pp-footer{padding:8px 18px;font-size:.72rem;color:var(--text-dim)}
    .pp-date{float:right}
    .pp-locked-body{padding:24px 18px;text-align:center;background:var(--bg3)}
    .pp-locked-icon{font-size:2rem;margin-bottom:8px}
    .pp-locked-msg{font-size:.85rem;color:var(--text-muted);margin-bottom:8px}
    .pp-empty{text-align:center;padding:60px 20px;color:var(--text-muted)}
    .pp-upgrade-bar{background:linear-gradient(135deg,rgba(124,58,237,.08),rgba(37,99,235,.08));border:1px solid var(--border);border-radius:14px;padding:18px 22px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  </style>
</head>
<body>
  ${nav("premium-picks", req)}
  <div class="pp-wrap">
    <div class="pp-hero">
      <h1>⭐ Premium Strategy Picks</h1>
      <p>Hand-picked NSE setups with precise entry zones, targets &amp; stop losses — curated by our research team.</p>
    </div>

    ${!isPremium ? `
    <div class="pp-upgrade-bar">
      <div>
        <strong>🔒 Full details are Premium-only</strong>
        <span style="display:block;font-size:.82rem;color:var(--text-muted);margin-top:2px">Upgrade to see exact entry price, target &amp; stop loss for every pick.</span>
      </div>
      <a href="/premium" class="btn-primary" style="white-space:nowrap">Upgrade ₹499/mo →</a>
    </div>` : ""}

    ${picks.length === 0 ? `
    <div class="pp-empty">
      <div style="font-size:2.5rem;margin-bottom:12px">📭</div>
      <p>No premium picks published yet.<br>Check back soon!</p>
    </div>` : `
    <div class="pp-grid">
      ${picks.map(p => cardHtml(p, !isPremium)).join("")}
    </div>`}
  </div>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── POST /api/razorpay/create-order ──────────────────────────────────────────
app.post("/api/razorpay/create-order", requireAuth, async (req: Request, res: Response) => {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    res.status(503).json({ error: "Payment not configured" });
    return;
  }
  // Check if already premium
  const existing = await getActiveSubscription(req.session.userId!);
  if (existing) { res.status(400).json({ error: "Already a Premium member" }); return; }

  const amount = PREMIUM_PRICE_PAISE;
  const payload = { amount, currency: "INR", receipt: `zs_${req.session.userId}_${Date.now()}` };
  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");

  const r = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Basic ${auth}` },
    body: JSON.stringify(payload),
  });
  if (!r.ok) { res.status(502).json({ error: "Razorpay API error" }); return; }
  const order: any = await r.json();
  await createOrder(req.session.userId!, order.id, amount);
  res.json({ id: order.id, amount: order.amount, currency: order.currency });
});

// ── POST /api/razorpay/verify ─────────────────────────────────────────────────
app.post("/api/razorpay/verify", requireAuth, async (req: Request, res: Response) => {
  if (!RAZORPAY_KEY_SECRET) { res.status(503).json({ ok: false }); return; }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    res.status(400).json({ ok: false }); return;
  }
  // HMAC-SHA256 signature check
  const crypto = await import("crypto");
  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expected = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET).update(body).digest("hex");
  if (expected !== razorpay_signature) {
    res.status(400).json({ ok: false, error: "Invalid signature" }); return;
  }
  const userId = await activateSubscription(razorpay_order_id, razorpay_payment_id);
  if (!userId) { res.json({ ok: false, error: "Order not found" }); return; }
  // Update session role
  req.session.userRole = "premium";
  res.json({ ok: true });
});

// ── GET /api/bot/status ─────────────────────────────────────────────────────────
app.get("/api/bot/status", async (_req: Request, res: Response) => {
  // Primary: DB (pushed by bot via webhook)
  const dbState: any = await getBotState().catch(() => null);
  const dbTrades = await getBotTrades(50).catch(() => []);

  // Fallback: JSON files on disk (existing behaviour — never breaks)
  const fileState  = readBotJSON("trade-state.json", {});
  const hb         = readBotJSON("bot-heartbeat.json", null);
  const fileTrades: any[] = readBotJSON("trades.json", []);

  // Prefer DB state if it was updated in the last 10 min, else fall back to files
  const dbUpdatedAt = dbState?._db_updated_at ? new Date(dbState._db_updated_at).getTime() : 0;
  const useDb = dbUpdatedAt > 0 && (Date.now() - dbUpdatedAt) < 10 * 60 * 1000;

  const state    = useDb ? dbState    : fileState;
  const trades   = useDb && dbTrades.length > 0
    ? dbTrades.map((t: BotTrade) => ({ ...JSON.parse(t.raw_json || "{}"), pnl: t.pnl }))
    : fileTrades;

  const analytics = computeAnalytics(trades);

  const isAlive = hb?.at ? (Date.now() - new Date(hb.at).getTime()) < 3 * 60 * 1000
                         : (useDb && (Date.now() - dbUpdatedAt) < 3 * 60 * 1000);
  const botStatus = isAlive ? (hb?.status ?? "RUNNING") : (hb ? "STOPPED" : "UNKNOWN");
  const botColor  = isAlive ? (hb?.inTrade ? (hb.direction === "CE" ? "blue" : "red") : "green") : "red";

  res.json({
    timestamp: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    activeState: state,
    heartbeat: hb,
    botStatus,
    botColor,
    isAlive,
    source: useDb ? "db" : "files",
    ...analytics,
  });
});

// ── POST /internal/bot-update ── bot pushes state + completed trades here ──────
app.post("/internal/bot-update", async (req: Request, res: Response) => {
  const secret = req.headers["x-bot-secret"];
  const expected = process.env.INTERNAL_BOT_SECRET || "";
  if (!expected || secret !== expected) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  const { state, trade } = req.body;

  if (state && typeof state === "object") {
    await saveBotState(state).catch(() => {});
  }

  if (trade && typeof trade === "object") {
    await saveBotTrade({
      symbol:      trade.symbol      ?? null,
      direction:   trade.direction   ?? null,
      entry_price: trade.entry_price ?? trade.entry ?? null,
      exit_price:  trade.exit_price  ?? trade.exit  ?? null,
      qty:         trade.qty         ?? null,
      pnl:         trade.pnl         ?? null,
      exit_reason: trade.exit_reason ?? trade.reason ?? null,
      trade_date:  trade.date        ?? new Date().toISOString().slice(0, 10),
      duration:    trade.duration    ?? null,
      raw_json:    JSON.stringify(trade),
    }).catch(() => {});

    // Telegram alert — notify premium subscribers when a new trade opens
    if (!trade.exit_price && !trade.exit && trade.entry_price) {
      getTelegramSubscribers().then(subs => {
        if (subs.length) {
          sendTelegramSignalAlert(subs, {
            direction:   trade.direction   ?? "",
            entryPrice:  trade.entry_price ?? trade.entry ?? 0,
            stopLoss:    trade.stop_loss   ?? 0,
            symbol:      trade.symbol      ?? "BANKNIFTY",
            mode:        state?.mode       ?? "PAPER",
          }).catch(() => {});
        }
      }).catch(() => {});
    }
  }

  res.json({ ok: true });
});

// ── POST /api/picks/:id/result ─ admin manually mark a pick result ───────────
app.post("/api/picks/:id/result", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { result, result_price } = req.body;
  const validResults = ['target_hit', 'sl_hit', 'entry_triggered', 'active'];
  if (!Number.isInteger(id) || id <= 0 || !validResults.includes(result)) {
    res.status(400).json({ ok: false, error: "Invalid request" });
    return;
  }
  await updatePickResult(id, result, parseFloat(result_price) || 0);
  res.json({ ok: true });
});

// ── GET /api/my-paper-positions ─ returns open paper positions for the logged-in user ──
app.get("/api/my-paper-positions", requireAuth, async (req: Request, res: Response) => {
  try {
    const positions = await getPaperPositions(req.session.userId!);
    res.json({ ok: true, positions });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

// ── GET /api/picks/results ─ returns all active picks with result tracking ────
app.get("/api/picks/results", async (_req: Request, res: Response) => {
  try {
    const picks = await getAllPicks();
    res.json({ ok: true, picks });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

// ── POST /api/picks/trigger-all ─ trigger all watching picks at current price ─
app.post("/api/picks/trigger-all", requireAdmin, async (req: Request, res: Response) => {
  try {
    const picks = await getActivePicks();
    const watching = picks.filter(p => p.result === null || p.result === undefined || p.result === '');
    if (!watching.length) { res.json({ ok: true, triggered: 0, message: 'No watching picks' }); return; }
    const results: { symbol: string; price: number; target: number; sl: number }[] = [];
    for (const p of watching) {
      const currentPrice = await fetchNseStockPrice(p.stock_symbol);
      if (!currentPrice || currentPrice <= 0) continue;
      const entryMid = (p.entry_low + p.entry_high) / 2;
      let newTarget: number;
      let newSl: number;
      if (p.direction.toUpperCase() === 'LONG') {
        const targetPct = p.target && entryMid > 0 ? (p.target - entryMid) / entryMid : 0.05;
        const slPct = p.stop_loss && entryMid > 0 ? (entryMid - p.stop_loss) / entryMid : 0.03;
        newTarget = currentPrice * (1 + Math.abs(targetPct));
        newSl = currentPrice * (1 - Math.abs(slPct));
      } else {
        const targetPct = p.target && entryMid > 0 ? (entryMid - p.target) / entryMid : 0.05;
        const slPct = p.stop_loss && entryMid > 0 ? (p.stop_loss - entryMid) / entryMid : 0.03;
        newTarget = currentPrice * (1 - Math.abs(targetPct));
        newSl = currentPrice * (1 + Math.abs(slPct));
      }
      await triggerPickNow(p.id, currentPrice, newTarget, newSl);
      results.push({ symbol: p.stock_symbol, price: currentPrice, target: parseFloat(newTarget.toFixed(2)), sl: parseFloat(newSl.toFixed(2)) });
    }
    res.json({ ok: true, triggered: results.length, results });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

// ── GET /internal/kite-token ── bot polls here to get the Zerodha access token ─
app.get("/internal/kite-token", async (req: Request, res: Response) => {
  const secret = req.headers["x-bot-secret"] || req.query.secret;
  const expected = process.env.INTERNAL_BOT_SECRET || "";
  if (!expected || secret !== expected) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  const token = await getSetting("kite_access_token").catch(() => "");
  const setAt  = await getSetting("kite_token_set_at").catch(() => "");

  if (!token) {
    res.json({ ok: false, token: null, message: "No token set. Paste it in Admin → Signal Control." });
    return;
  }

  res.json({ ok: true, token, set_at: setAt });
});


// ── GET /paper-trade ───────────────────────────────────────────────────────────
app.get("/paper-trade", featureGate("feature_paper_trade_bot", "Paper Trade"), premiumGate("paper_trade_bot_premium_only", "Paper Trade"), async (req: Request, res: Response) => {
  const PAPER_DIR = "/home/ubuntu/trading-bot";
  function readPaperJSON(file: string, fallback: any = null) {
    try {
      const p = `${PAPER_DIR}/${file}`;
      if (!fs.existsSync(p)) return fallback;
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch { return fallback; }
  }

  // ── Bot performance stats (always shown for social proof) ──────────────────
  const botTrades: any[] = readPaperJSON("paper-trades.json", []);
  const closed   = botTrades.filter((t: any) => t.status !== "OPEN");
  const wins     = closed.filter((t: any) => (t.pnl ?? 0) > 0).length;
  const totalPnl = closed.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);
  const winRate  = closed.length > 0 ? ((wins / closed.length) * 100).toFixed(1) : "—";
  const avgPnl   = closed.length > 0 ? (totalPnl / closed.length).toFixed(1) : "—";
  const openCount = botTrades.filter((t: any) => t.status === "OPEN").length;

  // ── User-specific data (only when logged in) ───────────────────────────────
  const userId = req.session?.userId;
  const isLoggedIn = !!userId;
  let port: any = { balance: 100000 }, tradeCount = 0, ptConfig: any = { trade_type: "INTRADAY", default_qty: 1 };
  let isPremiumUser = false, creditsOut = false, tradesLeft: number | null = null, freeLimit = 10;
  let userPositions: any[] = [];

  if (isLoggedIn) {
    const [activeSub, portData, count, config, fl] = await Promise.all([
      getActiveSubscription(userId!),
      getPaperPortfolio(userId!),
      countPaperTrades(userId!),
      getPaperTradeConfig(userId!),
      getSetting("paper_free_limit"),
    ]);
    port = portData;
    tradeCount = count;
    ptConfig = config;
    freeLimit = parseInt(fl || "10", 10);
    isPremiumUser = !!activeSub || req.session!.userRole === "premium" || req.session!.userRole === "admin";
    tradesLeft = isPremiumUser ? null : Math.max(0, freeLimit - tradeCount);
    creditsOut = !isPremiumUser && tradeCount >= freeLimit;

    // Load open positions for quick reference
    userPositions = await getPaperPositions(userId!);
    const dbPrices = userPositions.length
      ? await dbAll<{ symbol: string; price: number | null }>(
          `SELECT symbol, price FROM prices WHERE symbol IN (${userPositions.map(() => "?").join(",")})`,
          userPositions.map((p: any) => p.symbol)
        )
      : [];
    const priceMap: Record<string, number> = {};
    for (const r of dbPrices) if (r.price != null) priceMap[r.symbol] = r.price;
    userPositions = userPositions.map(p => {
      const livePrice = priceMap[p.symbol] ?? p.avg_price;
      const pnl = parseFloat(((livePrice - p.avg_price) * p.qty).toFixed(2));
      return { ...p, livePrice, pnl };
    });
  }

  const marketOpen = isMarketHours();
  const msgParam = req.query.msg ? `<div class="mpt-msg mpt-msg-ok" style="margin-bottom:16px">✅ ${esc(req.query.msg as string)}</div>` : "";
  const errParam = req.query.err ? `<div class="mpt-msg mpt-msg-err" style="margin-bottom:16px">❌ ${esc(req.query.err as string)}</div>` : "";

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Paper Trade — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    /* ── Layout ── */
    .pt2-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px}
    .pt2-hero-title{font-size:1.7rem;font-weight:800}
    .pt2-hero-sub{color:var(--text-muted);font-size:0.9rem;margin-top:4px}
    /* ── Gate (not logged in) ── */
    .pt2-gate{background:var(--card-bg);border:1px solid var(--border);border-radius:16px;padding:36px 28px;text-align:center;margin-bottom:28px}
    .pt2-gate-icon{font-size:2.8rem;margin-bottom:12px}
    .pt2-gate-title{font-size:1.3rem;font-weight:800;margin-bottom:8px}
    .pt2-gate-sub{color:var(--text-muted);font-size:0.92rem;margin-bottom:24px}
    .pt2-gate-btn{display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border-radius:10px;padding:13px 32px;font-weight:700;font-size:1rem;text-decoration:none}
    .pt2-features{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:24px 0}
    .pt2-feat{background:var(--bg2);border-radius:10px;padding:14px;text-align:center;font-size:0.88rem}
    .pt2-feat-icon{font-size:1.4rem;margin-bottom:6px}
    .pt2-feat-label{font-weight:700}
    .pt2-feat-desc{color:var(--text-muted);font-size:0.8rem;margin-top:3px}
    /* ── Credits bar ── */
    .pt2-credits{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:10px 16px;margin-bottom:16px;font-size:0.85rem}
    .pt2-mh-open{background:#10b98122;color:#10b981;border:1px solid #10b98155;border-radius:20px;padding:3px 10px;font-size:0.78rem;font-weight:700}
    .pt2-mh-closed{background:#ef444415;color:#ef4444;border:1px solid #ef444455;border-radius:20px;padding:3px 10px;font-size:0.78rem;font-weight:700}
    /* ── Rich Trade Card ── */
    .pt2-trade-card{background:var(--card-bg);border:1px solid var(--border);border-radius:16px;overflow:visible;margin-bottom:24px;box-shadow:0 2px 16px rgba(0,0,0,0.06)}
    .pt2-card-hdr{background:linear-gradient(135deg,#0d9488 0%,#059669 100%);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;border-radius:15px 15px 0 0}
    .pt2-card-title{font-size:0.95rem;font-weight:800;color:#fff;letter-spacing:0.02em}
    /* Segmented controls */
    .pt2-seg{display:inline-flex;background:rgba(0,0,0,0.2);border-radius:8px;padding:3px;gap:2px}
    .pt2-seg-btn{padding:4px 14px;border:none;border-radius:6px;font-weight:700;font-size:0.78rem;cursor:pointer;background:transparent;color:rgba(255,255,255,0.78);transition:all .15s}
    .pt2-seg-btn.active{background:#fff;color:#059669}
    .pt2-seg2{display:inline-flex;background:var(--bg2);border-radius:8px;padding:3px;gap:2px}
    .pt2-seg2-btn{padding:5px 14px;border:none;border-radius:6px;font-weight:700;font-size:0.8rem;cursor:pointer;background:transparent;color:var(--text-muted);transition:all .15s}
    .pt2-seg2-btn.active{background:#10b981;color:#fff}
    /* Card body */
    .pt2-card-body{padding:18px 20px}
    /* Symbol search row */
    .pt2-sym-row{margin-bottom:14px}
    .pt2-sym-inp-wrap{position:relative;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .pt2-sym-inp{flex:1;min-width:160px;background:var(--input-bg,#f4f7fe);border:1.5px solid var(--border);border-radius:10px;padding:10px 14px;color:var(--text);font-size:0.95rem;font-weight:600}
    .pt2-sym-inp:focus{border-color:#10b981;outline:none;box-shadow:0 0 0 3px rgba(16,185,129,0.12)}
    html.dark .pt2-sym-inp{background:#1c2128}
    .pt2-search-drop{position:absolute;top:calc(100% + 4px);left:0;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;z-index:200;width:280px;box-shadow:0 8px 28px rgba(0,0,0,0.18);max-height:240px;overflow-y:auto}
    .pt2-search-item{padding:9px 14px;cursor:pointer;font-size:0.88rem}
    .pt2-search-item:hover{background:var(--hover-bg)}
    /* Live price badge */
    .pt2-lpb{display:none;align-items:center;gap:8px;background:var(--bg2);border:1px solid var(--border);border-radius:20px;padding:5px 12px;font-size:0.85rem;font-weight:800;white-space:nowrap}
    .pt2-lpb.visible{display:inline-flex}
    .pt2-lpb-chg{font-size:0.76rem}
    .pt2-lpb-chg.pos{color:#10b981}
    .pt2-lpb-chg.neg{color:#ef4444}
    /* Order type row */
    .pt2-ot-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
    .pt2-ot-label{font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted)}
    /* Fields row */
    .pt2-fields-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px}
    .pt2-fld{display:flex;flex-direction:column;gap:4px}
    .pt2-fld>label{font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted)}
    .pt2-fld input,.pt2-fld select{background:var(--input-bg,#f4f7fe);border:1.5px solid var(--border);border-radius:8px;padding:8px 11px;color:var(--text);font-size:0.9rem;font-weight:600;transition:border-color .15s}
    .pt2-fld input:focus,.pt2-fld select:focus{border-color:#10b981;outline:none}
    html.dark .pt2-fld input,html.dark .pt2-fld select{background:#1c2128}
    .pt2-cost-disp{padding:8px 12px;font-weight:800;font-size:1.05rem;color:#10b981;background:rgba(16,185,129,0.09);border:1.5px solid rgba(16,185,129,0.22);border-radius:8px;min-width:110px;text-align:right;font-variant-numeric:tabular-nums}
    /* Risk row — SL & Target */
    .pt2-risk-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
    .pt2-risk-card{border-radius:12px;padding:12px 14px;border:1.5px solid}
    .pt2-risk-card.sl{background:rgba(239,68,68,0.05);border-color:rgba(239,68,68,0.28)}
    .pt2-risk-card.tgt{background:rgba(16,185,129,0.05);border-color:rgba(16,185,129,0.28)}
    .pt2-risk-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
    .pt2-risk-lbl{font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em}
    .pt2-risk-card.sl .pt2-risk-lbl{color:#ef4444}
    .pt2-risk-card.tgt .pt2-risk-lbl{color:#10b981}
    .pt2-pct-wrap{display:flex;align-items:center;gap:3px}
    .pt2-pct-inp{width:52px;padding:4px 6px;border-radius:6px;border:1.5px solid var(--border);background:var(--input-bg,#f4f7fe);font-size:0.82rem;font-weight:700;text-align:center;color:var(--text)}
    html.dark .pt2-pct-inp{background:#1c2128}
    .pt2-pct-suf{font-size:0.78rem;color:var(--text-muted);font-weight:600}
    .pt2-risk-price{font-size:1.08rem;font-weight:800;margin:4px 0 2px;font-variant-numeric:tabular-nums}
    .pt2-risk-card.sl .pt2-risk-price{color:#ef4444}
    .pt2-risk-card.tgt .pt2-risk-price{color:#10b981}
    .pt2-risk-note{font-size:0.72rem;color:var(--text-muted)}
    /* Buy row */
    .pt2-buy-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .pt2-rr-badge{font-size:0.78rem;background:var(--bg2);border-radius:20px;padding:5px 14px;color:var(--text-muted);font-weight:700;border:1px solid var(--border)}
    .pt2-btn-place{background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;border:none;border-radius:10px;padding:12px 32px;font-weight:800;font-size:1rem;cursor:pointer;transition:filter .15s;white-space:nowrap}
    .pt2-btn-place:hover{filter:brightness(1.08)}
    .pt2-btn-place:disabled{opacity:.5;cursor:not-allowed;filter:none}
    /* Open positions */
    .pt2-pos-section{border-top:1px solid var(--border);margin-top:18px;padding-top:14px}
    .pt2-pos-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.87rem;flex-wrap:wrap}
    .pt2-pos-sym{font-weight:700;color:var(--accent)}
    .pt2-pos-badge{font-size:0.7rem;padding:2px 7px;border-radius:12px;font-weight:700}
    .pt2-pos-sl{background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.3)}
    .pt2-pos-tgt{background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.3)}
    /* Bot stats */
    .pt2-stats-bar{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:28px 0 8px}
    .pt2-stat{background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:12px 14px;text-align:center}
    .pt2-stat-label{font-size:0.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:4px}
    .pt2-stat-val{font-size:1.15rem;font-weight:700}
    /* Options panel */
    .pt2-opts-panel{background:var(--bg2,#f8f6ff);border:1.5px solid rgba(124,58,237,0.22);border-radius:10px;padding:14px 16px;margin-top:14px;display:none}
    .pt2-opts-panel.show{display:block}
    .pt2-opts-title{font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7c3aed;margin-bottom:12px}
    .pt2-opts-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
    .pt2-opt-type-btn{padding:7px 18px;border-radius:7px;border:1.5px solid #7c3aed;font-weight:700;font-size:0.88rem;cursor:pointer;background:transparent;color:#7c3aed;transition:all .15s}
    .pt2-opt-type-btn.active{background:#7c3aed;color:#fff}
    .pt2-strike-wrap{display:flex;align-items:center;gap:4px}
    .pt2-strike-step{width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:var(--bg2,#f4f7fe);font-weight:700;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text)}
    .pt2-expiry-badge{font-size:0.78rem;background:rgba(124,58,237,0.1);color:#7c3aed;border-radius:20px;padding:3px 10px;font-weight:600}
    .pt2-atm-label{font-size:0.72rem;color:#10b981;font-weight:700;margin-top:2px}
    /* Messages */
    .mpt-msg{padding:12px 16px;border-radius:8px;font-size:0.9rem;font-weight:600}
    .mpt-msg-ok{background:#10b98122;color:#10b981;border:1px solid #10b98155}
    .mpt-msg-err{background:#ef444422;color:#ef4444;border:1px solid #ef444455}
    .mpt-green{color:#10b981} .mpt-red{color:#ef4444} .mpt-yellow{color:#f59e0b}
    @media(max-width:580px){
      .pt2-risk-row{grid-template-columns:1fr}
      .pt2-fields-row{flex-direction:column}
      .pt2-fld input,.pt2-fld select{width:100%;box-sizing:border-box}
      .pt2-cost-disp{text-align:left}
      .pt2-buy-row{flex-direction:column-reverse;align-items:stretch}
      .pt2-btn-place{text-align:center;width:100%}
      .pt2-opts-row{flex-direction:column}
    }
  </style>
</head>
<body class="page-theme-paper">
  ${nav("paper-trade", req)}
  <div class="container" style="max-width:840px">

    ${msgParam}${errParam}

    <div class="pt2-hero">
      <div>
        <h1 class="pt2-hero-title">📋 Paper Trade</h1>
        <p class="pt2-hero-sub">Practice trading any NSE stock with ₹1,00,000 virtual money · Zero risk</p>
      </div>
      ${isLoggedIn ? `<a href="/my-paper-trade" style="display:inline-flex;align-items:center;gap:8px;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:10px 18px;font-weight:700;font-size:0.88rem;text-decoration:none;color:var(--text)">📊 My Portfolio →</a>` : ""}
    </div>

    ${!isLoggedIn ? `
    <!-- SIGN-IN GATE -->
    <div class="pt2-gate">
      <div class="pt2-gate-icon">📋</div>
      <div class="pt2-gate-title">Paper Trade Any NSE Stock — Free</div>
      <div class="pt2-gate-sub">Create a free account to get ₹1,00,000 virtual cash and start practising trades with zero real risk.</div>
      <a href="/login?next=/paper-trade" class="pt2-gate-btn">🔑 Sign In to Start Trading →</a>
      <div style="margin-top:12px"><a href="/signup" style="font-size:0.85rem;color:var(--text-muted)">No account? Sign up free →</a></div>
    </div>

    <div class="pt2-features">
      <div class="pt2-feat"><div class="pt2-feat-icon">💰</div><div class="pt2-feat-label">₹1,00,000 Virtual Cash</div><div class="pt2-feat-desc">Start with real-scale capital</div></div>
      <div class="pt2-feat"><div class="pt2-feat-icon">📈</div><div class="pt2-feat-label">1,700+ NSE Stocks</div><div class="pt2-feat-desc">Trade any NSE-listed stock</div></div>
      <div class="pt2-feat"><div class="pt2-feat-icon">🕐</div><div class="pt2-feat-label">Intraday & Holding</div><div class="pt2-feat-desc">Both trade types supported</div></div>
      <div class="pt2-feat"><div class="pt2-feat-icon">📊</div><div class="pt2-feat-label">Live P&L Tracking</div><div class="pt2-feat-desc">Real NSE prices from DB</div></div>
    </div>

    ` : `
    <!-- LOGGED-IN: CREDITS BAR -->
    <div class="pt2-credits">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        ${isPremiumUser
          ? `<span style="color:#10b981;font-weight:700">👑 Premium — Unlimited trades</span>`
          : creditsOut
            ? `<span style="color:#ef4444;font-weight:700">⚠️ Free limit reached (${tradeCount}/${freeLimit}) — <a href="/my-paper-trade/upgrade" style="color:#ef4444">Upgrade →</a></span>`
            : `<span style="color:#f59e0b;font-weight:700">🎫 ${tradesLeft} of ${freeLimit} free trades left</span>`
        }
        <span style="font-size:0.8rem;color:var(--text-muted)">Cash: <strong>₹${port.balance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong></span>
      </div>
      <span class="${marketOpen ? "pt2-mh-open" : "pt2-mh-closed"}">${marketOpen ? "🟢 Market Open" : "🔴 Market Closed"}</span>
    </div>

    <!-- RICH TRADE CARD -->
    <div class="pt2-trade-card">
      <div class="pt2-card-hdr">
        <div class="pt2-card-title">🛒 New Order</div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          ${!marketOpen ? `<span style="font-size:0.74rem;background:rgba(255,255,255,0.15);color:#fff;border-radius:12px;padding:3px 10px;font-weight:600">⏸ Market Closed</span>` : ""}
          <div class="pt2-seg" id="pt2-type-seg">
            <button type="button" class="pt2-seg-btn ${ptConfig.trade_type === 'HOLDING' ? '' : 'active'}" data-t="INTRADAY" onclick="pt2SetType('INTRADAY')">Intraday</button>
            <button type="button" class="pt2-seg-btn ${ptConfig.trade_type === 'HOLDING' ? 'active' : ''}" data-t="HOLDING" onclick="pt2SetType('HOLDING')">Holding</button>
          </div>
        </div>
      </div>
      <div class="pt2-card-body">
        ${creditsOut ? `<div style="background:#ef444415;border:1px solid #ef444455;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:0.85rem;color:#ef4444;font-weight:600">⚠️ Free trade limit reached — <a href="/my-paper-trade/upgrade" style="color:#ef4444;text-decoration:underline">Upgrade to Premium →</a></div>` : ""}

        <form method="POST" action="/my-paper-trade/buy" id="pt2-buy-form">
          <input type="hidden" name="trade_type" id="pt2-trade-type" value="${ptConfig.trade_type || 'INTRADAY'}">
          <input type="hidden" name="order_type" id="pt2-order-type-val" value="MARKET">
          <input type="hidden" name="symbol" id="pt2-symbol-val" required>

          <!-- Symbol search -->
          <div class="pt2-sym-row">
            <label style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);display:block;margin-bottom:5px">Stock / Symbol</label>
            <div class="pt2-sym-inp-wrap">
              <div style="position:relative;flex:1;min-width:160px">
                <input type="text" id="pt2-stock-search" class="pt2-sym-inp" placeholder="Search symbol or company name…" autocomplete="off" required>
                <div class="pt2-search-drop" id="pt2-search-drop" style="display:none"></div>
              </div>
              <div class="pt2-lpb" id="pt2-lpb">
                <span id="pt2-lpb-sym" style="color:var(--accent)"></span>
                <span id="pt2-lpb-price" style="font-variant-numeric:tabular-nums">—</span>
                <span class="pt2-lpb-chg" id="pt2-lpb-chg"></span>
              </div>
            </div>
          </div>

          <!-- Order type -->
          <div class="pt2-ot-row">
            <span class="pt2-ot-label">Order Type</span>
            <div class="pt2-seg2">
              <button type="button" class="pt2-seg2-btn active" data-ot="MARKET" onclick="pt2SetOrderType('MARKET')">Market</button>
              <button type="button" class="pt2-seg2-btn" data-ot="LIMIT" onclick="pt2SetOrderType('LIMIT')">Limit</button>
            </div>
            <span id="pt2-ot-note" style="font-size:0.74rem;color:var(--text-muted)">Executes at current market price</span>
          </div>

          <!-- Qty / Price / Cost -->
          <div class="pt2-fields-row">
            <div class="pt2-fld">
              <label>Quantity</label>
              <input type="number" name="qty" id="pt2-qty" min="1" max="10000" value="${ptConfig.default_qty || 1}" required style="width:90px" oninput="pt2UpdateRisk()">
            </div>
            <div class="pt2-fld">
              <label id="pt2-price-label">Market Price</label>
              <input type="number" name="price" id="pt2-price" step="0.05" min="0.1" placeholder="Select a stock" required style="width:130px" readonly oninput="pt2UpdateRisk()">
            </div>
            <div class="pt2-fld">
              <label>Est. Cost</label>
              <div class="pt2-cost-disp" id="pt2-est-cost">—</div>
            </div>
          </div>

          <!-- SL & Target -->
          <div class="pt2-risk-row">
            <div class="pt2-risk-card sl">
              <div class="pt2-risk-hdr">
                <span class="pt2-risk-lbl">🛡️ Stop Loss</span>
                <span class="pt2-pct-wrap">
                  <input type="number" class="pt2-pct-inp" id="pt2-sl-pct" name="sl_pct" step="0.1" min="0" max="50" value="${ptConfig.default_sl_pct || 2.0}" oninput="pt2UpdateRisk()">
                  <span class="pt2-pct-suf">%</span>
                </span>
              </div>
              <div class="pt2-risk-price" id="pt2-sl-price">₹ —</div>
              <div class="pt2-risk-note" id="pt2-sl-note">Select a stock first</div>
            </div>
            <div class="pt2-risk-card tgt">
              <div class="pt2-risk-hdr">
                <span class="pt2-risk-lbl">🎯 Target</span>
                <span class="pt2-pct-wrap">
                  <input type="number" class="pt2-pct-inp" id="pt2-tgt-pct" name="target_pct" step="0.1" min="0" max="200" value="${ptConfig.default_tgt_pct || 4.0}" oninput="pt2UpdateRisk()">
                  <span class="pt2-pct-suf">%</span>
                </span>
              </div>
              <div class="pt2-risk-price" id="pt2-tgt-price">₹ —</div>
              <div class="pt2-risk-note" id="pt2-tgt-note">Select a stock first</div>
            </div>
          </div>

          <!-- Place order row -->
          <div class="pt2-buy-row">
            <div class="pt2-rr-badge" id="pt2-rr-badge">Select a stock to see R:R</div>
            <button type="submit" class="pt2-btn-place" ${creditsOut ? 'disabled onclick="window.location=\'/my-paper-trade/upgrade\';return false;"' : ""}>📈 Place Order</button>
          </div>

          <!-- OPTIONS PANEL: shown when index symbol detected -->
          <div class="pt2-opts-panel" id="pt2-opts-panel">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
              <div class="pt2-opts-title" style="margin-bottom:0">📊 Options Details</div>
              <button type="button" onclick="document.getElementById('pt2-opts-panel').classList.remove('show');document.getElementById('pt2-stock-search').value='';document.getElementById('pt2-symbol-val').value='';" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--text-muted);line-height:1;padding:2px 6px" title="Close options panel">✕</button>
            </div>
            <div class="pt2-opts-row">
              <div class="pt2-fld">
                <label>Option Type</label>
                <div style="display:flex;gap:6px">
                  <button type="button" class="pt2-opt-type-btn active" id="pt2-btn-ce" onclick="pt2SelectOptType('CE')">CE</button>
                  <button type="button" class="pt2-opt-type-btn" id="pt2-btn-pe" onclick="pt2SelectOptType('PE')">PE</button>
                </div>
              </div>
              <div class="pt2-fld">
                <label>Strike Price</label>
                <div class="pt2-strike-wrap">
                  <button type="button" class="pt2-strike-step" onclick="pt2StepStrike(-1)">−</button>
                  <input type="number" id="pt2-strike-inp" step="1" placeholder="Strike…" style="width:100px;padding:7px 10px;border-radius:7px;border:1px solid var(--border);background:var(--input-bg,#fff);color:var(--text);font-size:0.9rem;font-weight:700" oninput="pt2UpdateOptSymbol()">
                  <button type="button" class="pt2-strike-step" onclick="pt2StepStrike(1)">+</button>
                </div>
                <div class="pt2-atm-label" id="pt2-strike-hint"></div>
              </div>
              <div class="pt2-fld">
                <label>Expiry</label>
                <div class="pt2-expiry-badge" id="pt2-expiry-badge">—</div>
              </div>
              <div class="pt2-fld">
                <label>Option Symbol</label>
                <div style="font-size:0.85rem;font-weight:700;color:var(--accent);padding:8px 0" id="pt2-opt-sym-disp">—</div>
              </div>
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:8px">💡 Enter the current option premium in the <strong>Market Price</strong> field above · Qty = number of lots</div>
          </div>
        </form>

        ${userPositions.length > 0 ? `
        <div class="pt2-pos-section">
          <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px">Open Positions (${userPositions.length})</div>
          ${userPositions.map((p: any) => `
          <div class="pt2-pos-row">
            <span class="pt2-pos-sym"><a href="/stock/${p.symbol}" style="color:var(--accent);text-decoration:none">${p.symbol}</a></span>
            <span style="font-size:0.8rem;color:var(--text-muted)">${p.trade_type === 'HOLDING' ? 'HOLD' : 'INTRA'} · ${p.qty} qty · ₹${p.avg_price.toFixed(2)}</span>
            <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
              ${p.sl_price ? `<span class="pt2-pos-badge pt2-pos-sl">SL ₹${parseFloat(p.sl_price).toFixed(2)}</span>` : ""}
              ${p.target_price ? `<span class="pt2-pos-badge pt2-pos-tgt">TGT ₹${parseFloat(p.target_price).toFixed(2)}</span>` : ""}
            </div>
            <span style="font-weight:700" class="${p.pnl >= 0 ? "mpt-green" : "mpt-red"}">${p.pnl >= 0 ? "+" : ""}₹${p.pnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
            <form method="POST" action="/my-paper-trade/sell" style="display:inline-flex;gap:6px;align-items:center">
              <input type="hidden" name="symbol" value="${p.symbol}">
              <input type="number" name="qty" min="1" max="${p.qty}" value="${p.qty}" style="width:56px;padding:3px 7px;border-radius:5px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:0.8rem">
              <input type="hidden" name="price" value="${p.livePrice.toFixed(2)}">
              <button type="submit" style="background:#ef444422;color:#ef4444;border:1px solid #ef444455;border-radius:6px;padding:3px 10px;font-size:0.78rem;cursor:pointer;font-weight:600">Sell</button>
            </form>
          </div>`).join("")}
        </div>` : ""}
      </div>
    </div>
    `}

    <!-- BOT PERFORMANCE (social proof / always shown) -->
    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);border-bottom:1px solid var(--border);padding-bottom:8px;margin:28px 0 14px">📊 Bot's Paper Trade Performance — Strategy Benchmark</div>
    <div class="pt2-stats-bar">
      <div class="pt2-stat">
        <div class="pt2-stat-label">Total PnL (Bot)</div>
        <div class="pt2-stat-val ${totalPnl >= 0 ? "mpt-green" : "mpt-red"}">${totalPnl >= 0 ? "+" : ""}₹${Math.abs(totalPnl).toFixed(0)}</div>
      </div>
      <div class="pt2-stat">
        <div class="pt2-stat-label">Closed Trades</div>
        <div class="pt2-stat-val">${closed.length}</div>
      </div>
      <div class="pt2-stat">
        <div class="pt2-stat-label">Win Rate</div>
        <div class="pt2-stat-val">${winRate}${winRate !== "—" ? "%" : ""}</div>
      </div>
      <div class="pt2-stat">
        <div class="pt2-stat-label">Avg PnL / Trade</div>
        <div class="pt2-stat-val">${avgPnl !== "—" ? "₹" + avgPnl : "—"}</div>
      </div>
      <div class="pt2-stat">
        <div class="pt2-stat-label">Open Now</div>
        <div class="pt2-stat-val pt2-yellow">${openCount}</div>
      </div>
    </div>
    <div style="text-align:right;margin-bottom:8px"><a href="/paper-trade/bot-stats" style="font-size:0.8rem;color:var(--text-muted)">View full bot history →</a></div>

    <footer class="site-footer"><span>© 2026 ZeroScreen · Paper trading uses virtual money — no real capital at risk · Prices from NSE data updated periodically</span></footer>
  </div>
  <script src="/public/js/app.js"></script>
  <script>
  // ── Trade form interaction ──────────────────────────────────────────────────
  function pt2SetType(t) {
    document.getElementById('pt2-trade-type').value = t;
    document.querySelectorAll('.pt2-seg-btn[data-t]').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-t') === t);
    });
  }

  function pt2SetOrderType(ot) {
    document.getElementById('pt2-order-type-val').value = ot;
    document.querySelectorAll('.pt2-seg2-btn[data-ot]').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-ot') === ot);
    });
    var priceInp = document.getElementById('pt2-price');
    var priceLabel = document.getElementById('pt2-price-label');
    var note = document.getElementById('pt2-ot-note');
    if (ot === 'MARKET') {
      priceInp.readOnly = true;
      priceInp.style.opacity = '0.75';
      if (priceLabel) priceLabel.textContent = 'Market Price';
      if (note) note.textContent = 'Executes at current market price';
    } else {
      priceInp.readOnly = false;
      priceInp.style.opacity = '1';
      if (priceLabel) priceLabel.textContent = 'Limit Price';
      if (note) note.textContent = 'Enter your desired limit price';
    }
  }

  function pt2UpdateRisk() {
    var p = parseFloat(document.getElementById('pt2-price').value) || 0;
    var q = parseInt(document.getElementById('pt2-qty').value) || 1;
    var slPct  = parseFloat(document.getElementById('pt2-sl-pct')  ? document.getElementById('pt2-sl-pct').value  : '2') || 0;
    var tgtPct = parseFloat(document.getElementById('pt2-tgt-pct') ? document.getElementById('pt2-tgt-pct').value : '4') || 0;

    // Cost
    var cost = p * q;
    var costEl = document.getElementById('pt2-est-cost');
    if (costEl) costEl.textContent = cost > 0 ? '₹' + cost.toLocaleString('en-IN', {maximumFractionDigits:0}) : '—';

    if (p > 0) {
      var slPrice  = p * (1 - slPct / 100);
      var tgtPrice = p * (1 + tgtPct / 100);
      var slLoss   = (p - slPrice) * q;
      var tgtGain  = (tgtPrice - p) * q;

      var slPEl  = document.getElementById('pt2-sl-price');
      var tgtPEl = document.getElementById('pt2-tgt-price');
      var slNEl  = document.getElementById('pt2-sl-note');
      var tgtNEl = document.getElementById('pt2-tgt-note');
      var rrEl   = document.getElementById('pt2-rr-badge');

      if (slPEl)  slPEl.textContent  = '₹' + slPrice.toFixed(2);
      if (tgtPEl) tgtPEl.textContent = '₹' + tgtPrice.toFixed(2);
      if (slNEl)  slNEl.textContent  = slPct > 0 ? 'Max loss ₹' + slLoss.toFixed(0) : 'No stop loss set';
      if (tgtNEl) tgtNEl.textContent = tgtPct > 0 ? 'Potential gain ₹' + tgtGain.toFixed(0) : 'No target set';

      if (rrEl) {
        if (slPct > 0 && tgtPct > 0) {
          var rr = tgtPct / slPct;
          rrEl.textContent = 'R:R = 1 : ' + rr.toFixed(1) + (rr >= 2 ? '  ✅' : rr < 1 ? '  ⚠️' : '');
        } else {
          rrEl.textContent = 'Set both SL & Target for R:R';
        }
      }
    } else {
      ['pt2-sl-price','pt2-tgt-price'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.textContent = '₹ —';
      });
      var slNEl  = document.getElementById('pt2-sl-note');
      var tgtNEl = document.getElementById('pt2-tgt-note');
      if (slNEl)  slNEl.textContent  = 'Select a stock first';
      if (tgtNEl) tgtNEl.textContent = 'Select a stock first';
      var rrEl = document.getElementById('pt2-rr-badge');
      if (rrEl) rrEl.textContent = 'Select a stock to see R:R';
    }
  }

  // ── Search autocomplete ─────────────────────────────────────────────────────
  (function() {
    var inp    = document.getElementById('pt2-stock-search');
    var symVal = document.getElementById('pt2-symbol-val');
    var drop   = document.getElementById('pt2-search-drop');
    var priceInp = document.getElementById('pt2-price');
    var lpb    = document.getElementById('pt2-lpb');
    if (!inp) return;

    function selectSymbol(sym, price, changePct) {
      inp.value = sym;
      symVal.value = sym;
      drop.style.display = 'none';
      var lpbSym = document.getElementById('pt2-lpb-sym');
      var lpbPrc = document.getElementById('pt2-lpb-price');
      var lpbChg = document.getElementById('pt2-lpb-chg');
      if (lpbSym) lpbSym.textContent = sym;
      if (price) {
        priceInp.value = price.toFixed(2);
        priceInp.dataset.indexPrice = price.toFixed(2);
        if (lpbPrc) lpbPrc.textContent = '₹' + price.toFixed(2);
        if (lpbChg && changePct != null) {
          lpbChg.textContent = (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%';
          lpbChg.className = 'pt2-lpb-chg ' + (changePct >= 0 ? 'pos' : 'neg');
        }
        if (lpb) lpb.classList.add('visible');
        pt2UpdateRisk();
      }
      pt2CheckIndex(sym);
    }

    var timer;
    inp.addEventListener('input', function() {
      clearTimeout(timer);
      var q = inp.value.trim();
      if (q.length < 1) {
        drop.style.display = 'none';
        var panel = document.getElementById('pt2-opts-panel');
        if (panel) panel.classList.remove('show');
        var symVal2 = document.getElementById('pt2-symbol-val');
        if (symVal2) symVal2.value = '';
        return;
      }
      timer = setTimeout(function() {
        var qUpper = q.toUpperCase();
        // Check for index symbol matches (BANKNIFTY, NIFTY, etc.)
        var indexKeys = ['BANKNIFTY','NIFTY','FINNIFTY','MIDCPNIFTY','SENSEX','BANKEX'];
        var idxMatches = indexKeys.filter(function(k) { return k.indexOf(qUpper) === 0; });
        fetch('/api/search?q=' + encodeURIComponent(q))
          .then(function(r) { return r.json(); })
          .then(function(data) {
            var idxItems = idxMatches.map(function(sym) {
              return '<div class="pt2-search-item" data-sym="' + sym + '" data-isindex="1">'
                + '<span style="font-weight:700">' + sym + '</span>'
                + ' <span style="color:var(--text-muted);font-size:0.8rem">— Index Options (CE/PE)</span>'
                + '</div>';
            }).join('');
            if (!data.length && !idxMatches.length) { drop.style.display = 'none'; return; }
            drop.innerHTML = idxItems + data.map(function(s) {
              return '<div class="pt2-search-item" data-sym="' + s.symbol + '">'
                + '<span style="font-weight:700">' + s.symbol + '</span>'
                + (s.company_name ? ' <span style="color:var(--text-muted);font-size:0.8rem">— ' + s.company_name + '</span>' : '')
                + '</div>';
            }).join('');
            drop.style.display = 'block';
            drop.querySelectorAll('.pt2-search-item').forEach(function(el) {
              el.addEventListener('click', function() {
                var sym = el.getAttribute('data-sym');
                var isIdx = el.getAttribute('data-isindex') === '1';
                if (isIdx) {
                  selectSymbol(sym, null, null);
                } else {
                  fetch('/api/price/' + sym)
                    .then(function(r) { return r.json(); })
                    .then(function(d) { selectSymbol(sym, d.price || null, d.change_pct != null ? d.change_pct : null); })
                    .catch(function() { selectSymbol(sym, null, null); });
                }
              });
            });
          }).catch(function() {});
      }, 220);
    });

    document.addEventListener('click', function(e) {
      if (!e.target.closest('.pt2-sym-row')) drop.style.display = 'none';
    });

    // Auto-fill from URL ?buy=SYMBOL
    var urlSym = new URLSearchParams(window.location.search).get('buy');
    if (urlSym) {
      inp.value = urlSym; symVal.value = urlSym;
      pt2CheckIndex(urlSym);
      fetch('/api/price/' + urlSym)
        .then(function(r) { return r.json(); })
        .then(function(d) { selectSymbol(urlSym, d.price || null, d.change_pct != null ? d.change_pct : null); })
        .catch(function() {});
    }

    // Initial order type setup
    pt2SetOrderType('MARKET');
  })();

  // ── Options index detection & strike picker ─────────────────────────────────
  var pt2OptType = 'CE';
  var pt2IndexConfig = {
    BANKNIFTY:  { step:100, expiry:'WED', lotSize:15 },
    NIFTY:      { step:50,  expiry:'THU', lotSize:25 },
    FINNIFTY:   { step:50,  expiry:'TUE', lotSize:40 },
    MIDCPNIFTY: { step:25,  expiry:'MON', lotSize:75 },
    SENSEX:     { step:100, expiry:'FRI', lotSize:10 },
    BANKEX:     { step:100, expiry:'MON', lotSize:15 },
  };

  function pt2GetExpiry(expiryDay) {
    var days = {SUN:0,MON:1,TUE:2,WED:3,THU:4,FRI:5,SAT:6};
    var target = days[expiryDay] || 4;
    var now = new Date();
    var ist = new Date(now.toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
    var diff = (target - ist.getDay() + 7) % 7;
    if (diff === 0 && ist.getHours() >= 16) diff = 7;
    var exp = new Date(ist); exp.setDate(ist.getDate() + diff);
    var dd = String(exp.getDate()).padStart(2,'0');
    var mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][exp.getMonth()];
    var yy = String(exp.getFullYear()).slice(2);
    return { label: dd+' '+mon+' '+exp.getFullYear(), code: yy+mon+dd };
  }

  function pt2FormatSymbol(index, expCode, strike, optType) {
    return index + expCode + strike + optType;
  }

  function pt2UpdateOptSymbol() {
    var symInp   = document.getElementById('pt2-symbol-val');
    var strikeInp = document.getElementById('pt2-strike-inp');
    var disp     = document.getElementById('pt2-opt-sym-disp');
    var hint     = document.getElementById('pt2-strike-hint');
    var idx      = document.getElementById('pt2-stock-search').value.trim().toUpperCase();
    var cfg      = pt2IndexConfig[idx];
    if (!cfg || !strikeInp.value) { if (disp) disp.textContent = '—'; return; }
    var exp = pt2GetExpiry(cfg.expiry);
    var sym = pt2FormatSymbol(idx, exp.code, strikeInp.value, pt2OptType);
    if (symInp) symInp.value = sym;
    if (disp) disp.textContent = sym;
    var atmPrice = parseFloat(document.getElementById('pt2-price').dataset.indexPrice || '0');
    var atm = Math.round(atmPrice / cfg.step) * cfg.step;
    var s = parseInt(strikeInp.value);
    if (hint) {
      if (s === atm) hint.textContent = '✓ ATM';
      else if ((pt2OptType === 'CE' && s < atm) || (pt2OptType === 'PE' && s > atm)) hint.textContent = 'ITM (' + (Math.abs(s - atm) / cfg.step) + ' strikes)';
      else hint.textContent = 'OTM (' + (Math.abs(s - atm) / cfg.step) + ' strikes)';
    }
  }

  function pt2SelectOptType(t) {
    pt2OptType = t;
    document.getElementById('pt2-btn-ce').classList.toggle('active', t === 'CE');
    document.getElementById('pt2-btn-pe').classList.toggle('active', t === 'PE');
    pt2UpdateOptSymbol();
  }

  function pt2StepStrike(dir) {
    var si  = document.getElementById('pt2-strike-inp');
    var idx = document.getElementById('pt2-stock-search').value.trim().toUpperCase();
    var step = (pt2IndexConfig[idx] || {}).step || 100;
    var cur  = parseInt(si.value) || 0;
    si.value = cur + dir * step;
    pt2UpdateOptSymbol();
  }

  function pt2CheckIndex(sym) {
    var panel = document.getElementById('pt2-opts-panel');
    if (!panel) return;
    var cfg = pt2IndexConfig[sym.toUpperCase()];
    if (cfg) {
      panel.classList.add('show');
      pt2SetOrderType('LIMIT'); // options need limit price
      var exp = pt2GetExpiry(cfg.expiry);
      var badge = document.getElementById('pt2-expiry-badge');
      if (badge) badge.textContent = exp.label;
      var priceInp = document.getElementById('pt2-price');
      var atmPrice = parseFloat(priceInp.value) || 0;
      if (atmPrice > 0) {
        var atm = Math.round(atmPrice / cfg.step) * cfg.step;
        var si  = document.getElementById('pt2-strike-inp');
        if (si && !si.value) { si.value = String(atm); priceInp.dataset.indexPrice = String(atmPrice); }
        pt2UpdateOptSymbol();
      }
    } else {
      panel.classList.remove('show');
      var symVal = document.getElementById('pt2-symbol-val');
      if (symVal) symVal.value = sym.toUpperCase();
    }
  }
  </script>
</body>
</html>`);
});

// ── GET /my-paper-trade ─ Personal paper trading portfolio ──────────────────
app.get("/my-paper-trade", requireAuth, featureGate("feature_my_paper_trade", "Paper Trading"), premiumGate("paper_trade_premium_only", "Paper Trading"), async (req: Request, res: Response) => {
  const userId   = req.session.userId!;
  const userName = req.session.userName || "Trader";

  // ── Mobile verification gate ────────────────────────────────────────────────
  const otpRequired = (await getSetting("otp_required")) !== "false";
  if (otpRequired) {
    const uInfo = await dbAll<{ mobile_verified: number }>(
      "SELECT mobile_verified FROM users WHERE id=?", [userId]
    );
    if (!uInfo[0]?.mobile_verified) {
      res.redirect("/verify-mobile?next=/my-paper-trade"); return;
    }
  }

  const [port, positions, trades, tradeCount, ptConfig, activeSub, allPicksForTrade] = await Promise.all([
    getPaperPortfolio(userId),
    getPaperPositions(userId),
    getPaperTrades(userId, 60),
    countPaperTrades(userId),
    getPaperTradeConfig(userId),
    getActiveSubscription(userId),
    getAllPicks().catch(() => [] as PickRow[]),
  ]);

  // ── Credits ─────────────────────────────────────────────────────────────────
  const freeLimit  = parseInt(await getSetting("paper_free_limit") || "10", 10);
  const isPremium  = !!activeSub || req.session.userRole === "premium" || req.session.userRole === "admin";
  const tradesLeft = isPremium ? null : Math.max(0, freeLimit - tradeCount);
  const creditsOut = !isPremium && tradeCount >= freeLimit;

  // Portfolio value: balance + current market value of positions
  // (use avg_price as proxy since live prices may not all be in DB)
  const watchingSymbols = allPicksForTrade.filter(p => !p.result || p.result === 'entry_triggered').map(p => p.stock_symbol);
  const priceSymbols = [...new Set([...positions.map(p => p.symbol), ...watchingSymbols])];
  const dbPrices = priceSymbols.length
    ? await dbAll<{ symbol: string; price: number | null }>(
        `SELECT symbol, price FROM prices WHERE symbol IN (${priceSymbols.map(() => "?").join(",")})`,
        priceSymbols
      )
    : [];
  const priceMap: Record<string, number> = {};
  for (const r of dbPrices) if (r.price != null) priceMap[r.symbol] = r.price;

  const posRows = positions.map(p => {
    const livePrice = priceMap[p.symbol] ?? p.avg_price;
    const curVal    = parseFloat((livePrice * p.qty).toFixed(2));
    const pnl       = parseFloat((curVal - p.invested).toFixed(2));
    const pnlPct    = parseFloat(((pnl / p.invested) * 100).toFixed(2));
    return { ...p, livePrice, curVal, pnl, pnlPct };
  });

  const investedTotal  = posRows.reduce((s, p) => s + p.invested, 0);
  const curValTotal    = posRows.reduce((s, p) => s + p.curVal,   0);
  const portfolioValue = parseFloat((port.balance + curValTotal).toFixed(2));
  const totalPnl       = parseFloat((portfolioValue - 100000).toFixed(2));
  const totalPnlPct    = parseFloat(((totalPnl / 100000) * 100).toFixed(2));

  const sellTrades     = trades.filter(t => t.action === "SELL");
  const realizedPnl    = parseFloat(sellTrades.reduce((s, t) => s + (t.pnl ?? 0), 0).toFixed(2));
  const wins           = sellTrades.filter(t => (t.pnl ?? 0) > 0).length;
  const losses         = sellTrades.filter(t => (t.pnl ?? 0) <= 0).length;
  const winRate        = sellTrades.length > 0 ? ((wins / sellTrades.length) * 100).toFixed(1) : "—";

  // Equity curve from sell trades
  let eq = 0;
  const eqData   = sellTrades.slice().reverse().map(t => { eq += t.pnl ?? 0; return parseFloat(eq.toFixed(2)); });
  const eqLabels = sellTrades.slice().reverse().map(t => t.traded_at.slice(5, 10));

  // Monthly P&L rollup from sell trades
  const monthPnlMap: Record<string, number> = {};
  for (const t of sellTrades) {
    const mo = t.traded_at.slice(0, 7); // "2026-01"
    monthPnlMap[mo] = (monthPnlMap[mo] || 0) + (t.pnl ?? 0);
  }
  const monthKeys   = Object.keys(monthPnlMap).sort();
  const monthLabels = monthKeys.map(k => { const [y, m] = k.split("-"); return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)-1] + " '" + y.slice(2); });
  const monthValues = monthKeys.map(k => parseFloat(monthPnlMap[k].toFixed(2)));

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>My Paper Trade — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>
  <style>
    .mpt-hero { background: var(--card-bg); border: 1px solid var(--border); border-radius: 14px; padding: 24px 28px; margin-bottom: 24px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
    .mpt-hero-title { font-size: 1.5rem; font-weight: 800; }
    .mpt-hero-sub   { color: var(--text-muted); font-size: 0.88rem; margin-top: 4px; }
    .mpt-balance    { font-size: 2rem; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; }
    .mpt-bal-label  { font-size: 0.78rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; }
    .mpt-kpi-row    { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap: 12px; margin-bottom: 24px; }
    .mpt-kpi        { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
    .mpt-kpi-label  { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
    .mpt-kpi-val    { font-size: 1.25rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .mpt-green { color: #10b981; } .mpt-red { color: #ef4444; } .mpt-yellow { color: #f59e0b; }
    .mpt-section    { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--text-muted); border-bottom: 1px solid var(--border); padding-bottom: 8px; margin: 24px 0 14px; }
    .mpt-pos-table, .mpt-history-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    .mpt-pos-table th, .mpt-history-table th { text-align: left; padding: 8px 10px; border-bottom: 2px solid var(--border); font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); }
    .mpt-pos-table td, .mpt-history-table td { padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    .mpt-pos-table tr:hover td, .mpt-history-table tr:hover td { background: var(--hover-bg); }
    .mpt-sym { font-weight: 700; color: var(--accent); cursor:pointer; }
    .mpt-sym:hover { text-decoration: underline; }
    .mpt-action-buy  { background:#10b98122; color:#10b981; border:1px solid #10b98155; border-radius:4px; padding:2px 8px; font-size:0.75rem; font-weight:700; }
    .mpt-action-sell { background:#ef444422; color:#ef4444; border:1px solid #ef444455; border-radius:4px; padding:2px 8px; font-size:0.75rem; font-weight:700; }
    .mpt-sell-btn   { background: #ef444422; color: #ef4444; border: 1px solid #ef444455; border-radius: 6px; padding: 4px 12px; font-size: 0.8rem; cursor:pointer; font-weight:600; }
    .mpt-sell-btn:hover { background: #ef444440; }
    .mpt-buy-form   { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; }
    .mpt-buy-form h3 { margin: 0 0 16px; font-size: 1rem; font-weight: 700; }
    .mpt-form-row   { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }
    .mpt-form-group { display: flex; flex-direction: column; gap: 5px; }
    .mpt-form-group label { font-size: 0.78rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; }
    .mpt-form-group input, .mpt-form-group select { background: var(--input-bg); border: 1px solid var(--border); border-radius: 7px; padding: 8px 12px; color: var(--text); font-size: 0.9rem; width: 160px; }
    .mpt-btn-buy    { background: #10b981; color: #fff; border: none; border-radius: 8px; padding: 10px 22px; font-weight: 700; font-size: 0.9rem; cursor: pointer; }
    .mpt-btn-buy:hover { background: #059669; }
    .mpt-btn-reset  { background: transparent; color: var(--text-muted); border: 1px solid var(--border); border-radius: 8px; padding: 8px 16px; font-size: 0.82rem; cursor: pointer; }
    .mpt-btn-reset:hover { color: #ef4444; border-color: #ef4444; }
    .mpt-msg { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.9rem; font-weight: 600; }
    .mpt-msg-ok  { background: #10b98122; color: #10b981; border: 1px solid #10b98155; }
    .mpt-msg-err { background: #ef444422; color: #ef4444; border: 1px solid #ef444455; }
    .mpt-empty  { color: var(--text-muted); font-size: 0.9rem; padding: 24px; text-align: center; }
    .mpt-chart-wrap { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; }
    .mpt-search-wrap { position: relative; }
    .mpt-search-drop { position: absolute; top: 100%; left: 0; background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; z-index: 200; width: 240px; box-shadow: 0 8px 24px rgba(0,0,0,.2); max-height: 240px; overflow-y: auto; }
    .mpt-search-item { padding: 9px 14px; cursor: pointer; font-size: 0.88rem; }
    .mpt-search-item:hover { background: var(--hover-bg); }
    .mpt-search-sym  { font-weight: 700; }
    .mpt-search-co   { color: var(--text-muted); font-size: 0.8rem; }
    .mpt-disclaimer  { font-size: 0.78rem; color: var(--text-muted); background: var(--bg2); border-radius: 8px; padding: 12px 16px; margin-top: 24px; }
    .mpt-credits-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; background:var(--card-bg); border:1px solid var(--border); border-radius:10px; padding:12px 18px; margin-bottom:18px; font-size:0.88rem; }
    .mpt-credits-free { color:#f59e0b; font-weight:700; }
    .mpt-credits-prem { color:#10b981; font-weight:700; }
    .mpt-credits-out  { background:#ef444415; border-color:#ef444455; }
    .mpt-mh-badge { font-size:0.78rem; padding:3px 10px; border-radius:20px; font-weight:700; }
    .mpt-mh-open  { background:#10b98122; color:#10b981; border:1px solid #10b98155; }
    .mpt-mh-closed{ background:#ef444415; color:#ef4444; border:1px solid #ef444455; }
    .mpt-type-intra { background:#3b82f622; color:#3b82f6; border:1px solid #3b82f655; border-radius:4px; padding:2px 7px; font-size:0.73rem; font-weight:700; }
    .mpt-type-hold  { background:#a855f722; color:#a855f7; border:1px solid #a855f755; border-radius:4px; padding:2px 7px; font-size:0.73rem; font-weight:700; }
    @media (max-width:600px) { .mpt-form-row { flex-direction: column; } .mpt-form-group input, .mpt-form-group select { width: 100%; } }

    /* ── Picks table ────────────────────────────────────────────────────────── */
    .mpt-picks-wrap{background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:20px 22px;margin-bottom:24px}
    .mpt-picks-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
    .mpt-picks-title{font-size:1rem;font-weight:800}
    .mpt-picks-stats{display:flex;gap:14px;flex-wrap:wrap;font-size:.77rem;margin-bottom:10px}
    .mpt-ptbl-wrap{overflow-x:auto}
    .mpt-ptbl{width:100%;border-collapse:collapse;font-size:.82rem;white-space:nowrap}
    .mpt-ptbl thead th{background:linear-gradient(135deg,#0d1b2e 0%,#1e3a5f 100%);padding:10px 12px;text-align:left;font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#93c5fd;border-bottom:none;position:sticky;top:0;z-index:1;white-space:nowrap}
    .mpt-ptbl tbody tr{border-bottom:1px solid var(--border);transition:all .12s}
    .mpt-ptbl tbody tr:nth-child(even){background:rgba(255,255,255,.02)}
    .mpt-ptbl tbody tr:last-child{border-bottom:none}
    .mpt-ptbl tbody tr:hover{background:rgba(96,165,250,.07)!important;box-shadow:inset 3px 0 0 #3b82f6}
    .mpt-ptbl td{padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:middle;white-space:nowrap}
    .mpt-ptbl-date{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#93c5fd;padding:7px 12px;background:linear-gradient(135deg,#0d1b2e,#162640);border-bottom:1px solid rgba(96,165,250,.15)}
    .mpt-ptbl-today{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#f59e0b;padding:8px 12px;background:rgba(245,158,11,.08);border-bottom:1px solid rgba(245,158,11,.2)}
    .pb-long{background:#052e16;color:#4ade80;font-size:.65rem;font-weight:800;padding:.1rem .36rem;border-radius:3px}
    .pb-short{background:#3b1010;color:#f87171;font-size:.65rem;font-weight:800;padding:.1rem .36rem;border-radius:3px}
    .pb-type-i{background:rgba(59,130,246,.12);color:#60a5fa;font-size:.63rem;font-weight:700;padding:.1rem .3rem;border-radius:3px}
    .pb-type-s{background:rgba(245,158,11,.1);color:#f59e0b;font-size:.63rem;font-weight:700;padding:.1rem .3rem;border-radius:3px}
    .pb-type-l{background:rgba(168,85,247,.1);color:#c084fc;font-size:.63rem;font-weight:700;padding:.1rem .3rem;border-radius:3px}
    .pb-res-target{background:rgba(16,185,129,.15);color:#10b981;font-size:.68rem;font-weight:700;padding:.12rem .42rem;border-radius:3px}
    .pb-res-sl{background:rgba(239,68,68,.12);color:#f87171;font-size:.68rem;font-weight:700;padding:.12rem .42rem;border-radius:3px}
    .pb-res-entry{background:rgba(59,130,246,.12);color:#60a5fa;font-size:.68rem;font-weight:700;padding:.12rem .42rem;border-radius:3px}
    .pb-res-watch{background:rgba(255,255,255,.06);color:var(--text-muted);font-size:.68rem;font-weight:700;padding:.12rem .42rem;border-radius:3px}
    .pb-row-target td{background:rgba(16,185,129,.04)}
    .pb-row-sl td{background:rgba(239,68,68,.04)}
    .pb-row-entry td{background:rgba(59,130,246,.03)}
    @media(max-width:600px){.mpt-ptbl td:nth-child(n+7){display:none}.mpt-ptbl th:nth-child(n+7){display:none}}
    /* ── Picks layout ───────────────────────────────────────────────────── */
    /* top bar */
    .mpt-topbar2{display:flex;align-items:stretch;justify-content:space-between;gap:0;background:var(--card-bg);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:16px}
    /* left: big today pnl */
    .mpt-topbar2-left{display:flex;flex-direction:column;justify-content:center;padding:20px 28px;min-width:200px;border-right:1px solid var(--border)}
    .mpt-pnl-lbl{font-size:.62rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:6px;font-weight:600}
    .mpt-pnl-val{font-size:2rem;font-weight:900;font-variant-numeric:tabular-nums;line-height:1;letter-spacing:-.02em}
    .mpt-pnl-sub{font-size:.68rem;color:var(--text-muted);margin-top:5px}
    /* right: stats + cash + btn */
    .mpt-topbar2-right{display:flex;align-items:center;flex:1;flex-wrap:wrap;gap:0}
    .mpt-topbar2-stat{display:flex;flex-direction:column;justify-content:center;padding:14px 20px;border-right:1px solid var(--border);flex-shrink:0}
    .mpt-topbar2-stat-lbl{font-size:.58rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:3px;white-space:nowrap}
    .mpt-topbar2-stat-val{font-size:.95rem;font-weight:800;font-variant-numeric:tabular-nums}
    .mpt-topbar2-cash{display:flex;flex-direction:column;justify-content:center;padding:14px 20px;border-right:1px solid var(--border);flex-shrink:0}
    .mpt-cash-lbl{font-size:.58rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:3px}
    .mpt-cash-val{font-size:1.1rem;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
    .mpt-topbar2-actions{display:flex;align-items:center;gap:10px;padding:14px 18px;margin-left:auto}
    @media(max-width:700px){.mpt-topbar2{flex-direction:column}.mpt-topbar2-left{border-right:none;border-bottom:1px solid var(--border)}.mpt-topbar2-stat{border-right:none;border-bottom:1px solid var(--border)}.mpt-topbar2-cash{border-right:none}}
    /* mid grid */
    .mpt-midgrid{display:grid;grid-template-columns:1.25fr 1fr;gap:16px;margin-bottom:16px;align-items:start}
    @media(max-width:820px){.mpt-midgrid{grid-template-columns:1fr}}
    /* in-pos column */
    .mpt-ipcol{background:var(--card-bg);border:1px solid var(--border);border-radius:14px;overflow:hidden}
    .mpt-ipcol-hdr{display:flex;align-items:center;gap:8px;padding:11px 16px;border-bottom:1px solid var(--border)}
    .mpt-ipcol-title{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#f59e0b}
    /* two-row in-pos cards — adaptive for any count */
    .mpt-ip-card3{border-bottom:1px solid var(--border);padding:5px 10px}
    .mpt-ip-card3:last-child{border-bottom:none}
    .mpt-ip-card3:hover{background:rgba(59,130,246,.04)}
    .mpt-ip-r1{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px}
    .mpt-ip-r1 strong{font-size:.88rem;font-weight:800}
    .mpt-ip-levels{margin-left:auto;display:flex;gap:8px;font-size:.7rem;font-weight:700;flex-shrink:0}
    .mpt-ip-r2{display:flex;align-items:baseline;gap:8px}
    .mpt-ip-route{font-size:.72rem;color:var(--text-muted);flex-shrink:0}
    .mpt-ip-pnl{font-size:1.05rem;font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap;margin-left:auto}
    .mpt-ip-pnlpct{font-size:.68rem;font-weight:700;margin-left:4px}
    .mpt-ip-card3-meta{display:none}
    /* right panel */
    .mpt-rpanel{background:var(--card-bg);border:1px solid var(--border);border-radius:14px;overflow:hidden}
    .mpt-tabnav2{display:flex;border-bottom:1px solid var(--border)}
    .mpt-tab2{flex:1;padding:11px 6px;font-size:.74rem;font-weight:600;text-align:center;cursor:pointer;color:var(--text-muted);border-bottom:2px solid transparent;transition:color .15s;user-select:none;white-space:nowrap}
    .mpt-tab2:hover{color:var(--text)}
    .mpt-tab2.active.t2-pending{border-bottom-color:#a78bfa;color:#a78bfa}
    .mpt-tab2.active.t2-exec{border-bottom-color:#10b981;color:#10b981}
    .mpt-tab2.active.t2-inpos{border-bottom-color:#f59e0b;color:#f59e0b}
    .mpt-tab2-badge{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--bg2);font-size:.6rem;font-weight:700;margin-left:4px}
    .mpt-tabpane2{display:none;max-height:460px;overflow-y:auto}
    .mpt-tabpane2.active{display:block}
    .mpt-rpanel-tbl{width:100%;border-collapse:collapse;font-size:.8rem;white-space:nowrap}
    .mpt-rpanel-tbl thead th{background:linear-gradient(135deg,#0d1b2e 0%,#1e3a5f 100%);padding:9px 12px;text-align:left;font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#93c5fd;border-bottom:none;position:sticky;top:0;z-index:1}
    .mpt-rpanel-tbl tbody tr{border-bottom:1px solid var(--border);transition:all .12s}
    .mpt-rpanel-tbl tbody tr:nth-child(even){background:rgba(255,255,255,.02)}
    .mpt-rpanel-tbl tbody tr:last-child{border-bottom:none}
    .mpt-rpanel-tbl tbody tr:hover{background:rgba(96,165,250,.07)!important;box-shadow:inset 3px 0 0 #3b82f6}
    .mpt-rpanel-tbl td{padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle}
    /* history section */
    .mpt-hist-sec{background:var(--card-bg);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:16px}
    .mpt-hist-sec-hdr{display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap}
  </style>
</head>
<body>
  ${nav("my-paper-trade", req)}
  <div class="container" style="max-width:1060px">

    <!-- PICKS RESULTS DASHBOARD -->
    ${(() => {
      if (!allPicksForTrade.length) return "";
      const todayISO2 = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      // Show: all resolved picks (last 7 days) + only TODAY's watching picks
      const filtered = allPicksForTrade.filter(p => {
        if (p.result) return true; // resolved/triggered: show from last 7 days
        return true; // watching: show all (pending tab shows latest batch)
      });
      // group by date desc (last 7 days)
      const dateGroups: Record<string, PickRow[]> = {};
      for (const p of filtered) {
        const d = (p.published_at || "").slice(0, 10);
        if (!dateGroups[d]) dateGroups[d] = [];
        dateGroups[d].push(p);
      }
      const sortedDates = Object.keys(dateGroups).sort().reverse().slice(0, 7);
      const allShown = sortedDates.flatMap(d => dateGroups[d]);
      const totalHit   = allShown.filter(p => p.result === 'target_hit').length;
      const totalSL    = allShown.filter(p => p.result === 'sl_hit').length;
      const totalEnt   = allShown.filter(p => p.result === 'entry_triggered').length;
      const totalWatch = allShown.filter(p => !p.result).length;
      const pm: Record<string, number> = priceMap;
      function typeBadge(t: string): string {
        if (t === 'intraday') return '<span class="pb-type-i">⚡ Intra</span>';
        if (t === 'swing')    return '<span class="pb-type-s">🌊 Swing</span>';
        return '<span class="pb-type-l">📈 LT</span>';
      }
      function resBadge(r: string | null): string {
        if (r === 'target_hit')    return '<span class="pb-res-target">🎯 Target Hit</span>';
        if (r === 'sl_hit')        return '<span class="pb-res-sl">🔴 SL Hit</span>';
        if (r === 'entry_triggered') return '<span class="pb-res-entry">⚡ In Zone</span>';
        return '<span class="pb-res-watch">👁 Watching</span>';
      }
      function rowCls(r: string | null): string {
        if (r === 'target_hit') return 'pb-row-target';
        if (r === 'sl_hit')     return 'pb-row-sl';
        if (r === 'entry_triggered') return 'pb-row-entry';
        return '';
      }
      function fmtTime(iso: string | null): string {
        if (!iso) return '—';
        return new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
      }
      function fmtDate(iso: string): string {
        return new Date(iso + 'T00:00:00+05:30').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      }
      function pickSortOrder(r: string | null): number {
        if (r === 'entry_triggered') return 0;
        if (!r) return 1;
        if (r === 'target_hit') return 2;
        return 3; // sl_hit
      }
      const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      // Split into 3 buckets
      const inPosition   = allShown.filter(p => p.result === 'entry_triggered');
      // Pending = most recent batch's watching picks (same as what table shows)
      const latestPendingDate = allPicksForTrade.filter(p => !p.result).map(p => (p.published_at||'').slice(0,10)).sort().reverse()[0] || '';
      const pendingOrders = latestPendingDate ? allPicksForTrade.filter(p => !p.result && (p.published_at||'').slice(0,10) === latestPendingDate) : [];
      const resolved     = allShown.filter(p => p.result === 'target_hit' || p.result === 'sl_hit');
      // Symbols already in an open position — check BOTH sources:
      // 1. picks with result='entry_triggered' (picks tracker)
      // 2. actual paper_positions for this user (auto-buy may not mark pick as entry_triggered)
      const inPositionSymbols = new Set([
        ...allPicksForTrade.filter(p => p.result === 'entry_triggered').map((p: PickRow) => p.stock_symbol.toUpperCase()),
        ...positions.map((p: any) => p.symbol.toUpperCase()),
      ]);
      const pendingNonDupe = pendingOrders.filter(p => !inPositionSymbols.has(p.stock_symbol.toUpperCase()));
      const pendingDupeCount = pendingOrders.length - pendingNonDupe.length;

      // ── 1. In-Position: compact rows ──────────────────────────────────────
      function buildInPositionRow(p: PickRow): string {
        const ep = (p.entry_price as number) || ((p.entry_low + p.entry_high) / 2);
        const tgt = p.target ?? null;
        const sl = p.stop_loss ?? null;
        const tgtDist = tgt ? ((p.direction.toUpperCase() === 'LONG' ? tgt - ep : ep - tgt) / ep * 100).toFixed(1) : null;
        const slDist  = sl  ? ((p.direction.toUpperCase() === 'LONG' ? ep - sl  : sl  - ep) / ep * 100).toFixed(1) : null;
        const execDate = p.entry_at ? new Date(p.entry_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' }) : null;
        const execTime = p.entry_at ? new Date(p.entry_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : null;
        const lp = pm[p.stock_symbol];
        const livePnlPct = lp ? ((p.direction.toUpperCase() === 'LONG' ? lp - ep : ep - lp) / ep * 100) : null;
        return `<div class="mpt-ip-row2">
          <div class="mpt-ip-sym2"><span class="pb-${p.direction.toLowerCase()}" style="font-size:.6rem;margin-right:4px">${p.direction}</span>${esc(p.stock_symbol)}</div>
          <div class="mpt-ip-chips">
            ${typeBadge(p.pick_type ?? 'intraday')}
            <span class="mpt-ip-chip mpt-ip-chip-zone">Zone ₹${p.entry_low}–${p.entry_high}</span>
            <span class="mpt-ip-chip mpt-ip-chip-entry">Entry ₹${ep.toFixed(2)}</span>
            ${tgt ? `<span class="mpt-ip-chip mpt-ip-chip-tgt">Tgt ₹${tgt}${tgtDist ? ` +${tgtDist}%` : ''}</span>` : ''}
            ${sl  ? `<span class="mpt-ip-chip mpt-ip-chip-sl">SL ₹${sl}${slDist ? ` -${slDist}%` : ''}</span>` : ''}
            ${lp  ? `<span class="mpt-ip-chip" style="background:rgba(245,158,11,.12);color:${livePnlPct !== null && livePnlPct >= 0 ? '#10b981' : '#ef4444'};font-weight:700">CMP ₹${lp.toFixed(2)}${livePnlPct !== null ? ` (${livePnlPct >= 0 ? '+' : ''}${livePnlPct.toFixed(1)}%)` : ''}</span>` : ''}
            ${execDate && execTime ? `<span class="mpt-ip-chip mpt-ip-chip-time">📅 ${execDate} ${execTime}</span>` : ''}
          </div>
        </div>`;
      }

      // ── 2. Pending Orders: compact table ──────────────────────────────────
      function buildPendingRow(p: PickRow): string {
        const lp = pm[p.stock_symbol];
        const inZone = lp && lp >= p.entry_low && lp <= p.entry_high;
        return `<tr>
          <td><strong>${esc(p.stock_symbol)}</strong>${p.company_name ? `<br><span class="dim" style="font-size:.68rem">${esc(p.company_name)}</span>` : ''}</td>
          <td>${typeBadge(p.pick_type ?? 'intraday')}</td>
          <td><span class="pb-${p.direction.toLowerCase()}">${p.direction}</span></td>
          <td class="dim" style="font-size:.78rem">₹${p.entry_low}–${p.entry_high}</td>
          <td style="color:#10b981;font-size:.78rem">${p.target ? '₹' + p.target : '—'}</td>
          <td style="color:#ef4444;font-size:.78rem">${p.stop_loss ? '₹' + p.stop_loss : '—'}</td>
          <td style="font-weight:700;font-size:.82rem;color:${lp ? (inZone ? '#f59e0b' : lp > p.entry_high ? '#10b981' : '#94a3b8') : 'var(--text-muted)'}">
            ${lp ? '₹' + lp.toFixed(2) + (inZone ? ' 🔔' : '') : '—'}
          </td>
          <td class="dim" style="max-width:130px;overflow:hidden;text-overflow:ellipsis;font-size:.7rem" title="${esc(p.reason)}">${esc(p.reason.slice(0, 45))}${p.reason.length > 45 ? '…' : ''}</td>
        </tr>`;
      }

      // ── 3. History: only resolved, date-grouped ────────────────────────────
      function buildHistoryRow(p: PickRow): string {
        const ep = (p.entry_price as number) || ((p.entry_low + p.entry_high) / 2);
        const execStr = p.entry_price
          ? '₹' + (p.entry_price as number).toFixed(2) + (p.entry_at ? '<br><span class="dim" style="font-size:.6rem">' + fmtTime(p.entry_at) + '</span>' : '')
          : '<span class="dim" style="font-size:.7rem">zone mid</span>';
        const exitStr = p.result_price
          ? '₹' + (p.result_price as number).toFixed(2) + (p.result_at ? '<br><span class="dim" style="font-size:.6rem">' + fmtTime(p.result_at) + '</span>' : '')
          : '—';
        return `<tr>
          <td><strong>${esc(p.stock_symbol)}</strong>${p.company_name ? `<br><span class="dim" style="font-size:.68rem">${esc(p.company_name)}</span>` : ''}</td>
          <td>${typeBadge(p.pick_type ?? 'intraday')}</td>
          <td><span class="pb-${p.direction.toLowerCase()}">${p.direction}</span></td>
          <td class="dim" style="font-size:.78rem">₹${p.entry_low}–${p.entry_high}</td>
          <td>${resBadge(p.result)}</td>
          <td class="dim">${execStr}</td>
          <td class="${p.result === 'target_hit' ? 'mpt-green' : 'mpt-red'}" style="font-weight:700">${exitStr}</td>
          <td class="dim" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;font-size:.7rem" title="${esc(p.reason)}">${esc(p.reason.slice(0, 40))}${p.reason.length > 40 ? '…' : ''}</td>
        </tr>`;
      }
      const histGroups: Record<string, PickRow[]> = {};
      for (const p of resolved) {
        const d = (p.published_at || '').slice(0, 10);
        if (!histGroups[d]) histGroups[d] = [];
        histGroups[d].push(p);
      }
      const histDates = Object.keys(histGroups).sort().reverse();
      let histRows = '';
      for (const date of histDates) {
        const picks = histGroups[date];
        const hit = picks.filter(p => p.result === 'target_hit').length;
        const sl  = picks.filter(p => p.result === 'sl_hit').length;
        const isToday = date === todayISO;
        const hdrCls = isToday ? 'mpt-ptbl-today' : 'mpt-ptbl-date';
        histRows += `<tr><td class="${hdrCls}" colspan="8">${isToday ? '📅 TODAY — ' : ''}${fmtDate(date)} &nbsp;·&nbsp; <span style="color:#10b981">${hit} 🎯 hit</span> &nbsp;/&nbsp; <span style="color:#ef4444">${sl} 🔴 SL</span></td></tr>`;
        histRows += picks.map(buildHistoryRow).join('');
      }

      // ── Executed today = entry_triggered (entered) + closed today ─────────
      // Use result_at date (when pick was closed), NOT published_at (when it was created)
      const resolvedToday = resolved.filter(p => {
        const closedDate = p.result_at ? new Date(p.result_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : null;
        return closedDate === todayISO;
      });
      const execToday = [...inPosition, ...resolvedToday];
      // Today's P&L = closed picks P&L + unrealized P&L from in-position picks
      const closedPnl = resolvedToday.reduce((sum, p) => {
        const ep = (p.entry_price as number) || ((p.entry_low + p.entry_high) / 2);
        if (!p.result_price) return sum;
        return sum + (p.direction.toUpperCase() === 'LONG' ? (p.result_price as number) - ep : ep - (p.result_price as number));
      }, 0);
      const unrealizedPnlPicks = inPosition.reduce((sum, p) => {
        const ep = (p.entry_price as number) || ((p.entry_low + p.entry_high) / 2);
        const lp = pm[p.stock_symbol];
        if (!lp) return sum;
        return sum + (p.direction.toUpperCase() === 'LONG' ? lp - ep : ep - lp);
      }, 0);
      const todayPnl = closedPnl + unrealizedPnlPicks;
      const hasAnyPnl = resolvedToday.length > 0 || (inPosition.length > 0 && inPosition.some(p => pm[p.stock_symbol]));
      const todayPnlStr = hasAnyPnl
        ? (todayPnl >= 0 ? '+' : '') + '₹' + Math.abs(todayPnl).toLocaleString('en-IN', {minimumFractionDigits:2,maximumFractionDigits:2})
        : '—';

      // ── Virtual Picks Portfolio — fixed ₹25,000 per trade ──────────────────
      // Equal capital per pick — same as Smallcase / advisory services model
      const ALLOC_PER_TRADE = 25000;
      const calcQty = (ep: number) => Math.max(1, Math.floor(ALLOC_PER_TRADE / ep));
      const allInPositionAll = allPicksForTrade.filter(p => p.result === 'entry_triggered');
      const allResolvedAll = allPicksForTrade.filter(p => p.result === 'target_hit' || p.result === 'sl_hit');
      const allTimeClosedPnlRs = allResolvedAll.reduce((sum, p) => {
        const ep = (p.entry_price as number) || ((p.entry_low + p.entry_high) / 2);
        if (!ep || !p.result_price) return sum;
        const qty = calcQty(ep);
        const pnl = p.direction.toUpperCase() === 'LONG' ? (p.result_price as number) - ep : ep - (p.result_price as number);
        return sum + pnl * qty;
      }, 0);
      const unrealizedPicksRs = allInPositionAll.reduce((sum, p) => {
        const ep = (p.entry_price as number) || ((p.entry_low + p.entry_high) / 2);
        const lp = pm[p.stock_symbol];
        if (!lp || !ep) return sum;
        const qty = calcQty(ep);
        const pnl = p.direction.toUpperCase() === 'LONG' ? lp - ep : ep - lp;
        return sum + pnl * qty;
      }, 0);
      const deployedCash = allInPositionAll.reduce((sum, p) => {
        const ep = (p.entry_price as number) || ((p.entry_low + p.entry_high) / 2);
        return sum + calcQty(ep) * ep;
      }, 0);
      const picksAvailCash = port.balance + allTimeClosedPnlRs - deployedCash;
      const picksTotalPnl = allTimeClosedPnlRs + unrealizedPicksRs;
      const picksAvailColor = picksAvailCash < port.balance ? '#ef4444' : picksAvailCash > port.balance ? '#10b981' : 'var(--text)';
      const cashSubHtml = allInPositionAll.length > 0
        ? `<span style="color:#f59e0b">${allInPositionAll.length} active · ₹${deployedCash.toLocaleString('en-IN')} deployed</span>`
        : (picksTotalPnl !== 0
          ? `<span style="color:${picksTotalPnl>=0?'#10b981':'#ef4444'}">All-time P&amp;L ${picksTotalPnl>=0?'+':''}₹${Math.abs(picksTotalPnl).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:0})}</span>`
          : '<span style="color:var(--text-muted)">No picks yet</span>');

      // ── Top bar ────────────────────────────────────────────────────────────
      const todayPnlColor = hasAnyPnl ? (todayPnl >= 0 ? '#10b981' : '#ef4444') : 'var(--text-muted)';
      const todayPnlSubLabel = (resolvedToday.length || inPosition.length)
        ? `${resolvedToday.filter(p=>p.result==='target_hit').length} 🎯 &nbsp;/&nbsp; ${resolvedToday.filter(p=>p.result==='sl_hit').length} 🔴 closed${inPosition.length ? ` &nbsp;·&nbsp; ${inPosition.length} open` : ''}`
        : 'No picks today';
      const topBarHtml = `
      <div class="mpt-topbar2">
        <div class="mpt-topbar2-left">
          <div class="mpt-pnl-lbl">Today's P&amp;L</div>
          <div class="mpt-pnl-val" style="color:${todayPnlColor}" id="mpt-today-pnl">${todayPnlStr}</div>
          <div class="mpt-pnl-sub" id="mpt-today-pnl-sub">${todayPnlSubLabel}</div>
        </div>
        <div class="mpt-topbar2-right">
          <div class="mpt-topbar2-stat">
            <div class="mpt-topbar2-stat-lbl">⚡ In Position</div>
            <div class="mpt-topbar2-stat-val" style="color:#f59e0b">${inPosition.length || '—'}</div>
          </div>
          <div class="mpt-topbar2-stat">
            <div class="mpt-topbar2-stat-lbl">⏳ Pending</div>
            <div class="mpt-topbar2-stat-val" style="color:#a78bfa">${pendingNonDupe.length || '—'}${pendingDupeCount > 0 ? `<span style="color:#ef4444;font-size:.55em;margin-left:4px" title="${pendingDupeCount} duplicate(s) already in position">+${pendingDupeCount}⛔</span>` : ''}</div>
          </div>
          <div class="mpt-topbar2-stat">
            <div class="mpt-topbar2-stat-lbl">Results (7 days)</div>
            <div class="mpt-topbar2-stat-val"><span style="color:#10b981">${totalHit} 🎯</span>&nbsp;<span style="color:var(--text-muted);font-weight:400">/</span>&nbsp;<span style="color:#ef4444">${totalSL} 🔴</span></div>
          </div>
          <div class="mpt-topbar2-actions">
            <a href="/my-paper-trade/export" class="btn-sm" style="font-size:.74rem;padding:5px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;color:var(--text-muted);text-decoration:none;font-weight:700;white-space:nowrap" title="Download trade history as CSV">⬇ Export CSV</a>
            <button id="mpt-share-btn" onclick="_shareReport(this)" style="font-size:.74rem;padding:5px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;color:var(--text-muted);font-weight:700;cursor:pointer;white-space:nowrap" title="Get shareable link to your report">🔗 Share Report</button>
            <a href="/my-paper-trade/print" target="_blank" style="font-size:.74rem;padding:5px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;color:var(--text-muted);text-decoration:none;font-weight:700;white-space:nowrap" title="Print / save as PDF">🖨 Print</a>
            <span class="mpt-mh-badge ${isMarketHours() ? 'mpt-mh-open' : 'mpt-mh-closed'}">${isMarketHours() ? '🟢 Open' : '🔴 Closed'}</span>
            <div style="display:flex;flex-direction:column;justify-content:center;padding-left:14px;border-left:1px solid var(--border)">
              <div class="mpt-cash-lbl">Available Cash <span style="font-size:.5rem;letter-spacing:0;text-transform:none;font-weight:400;color:var(--text-muted)">(₹25k/trade)</span></div>
              <div class="mpt-cash-val" id="mpt-cash-display" data-base="${port.balance + allTimeClosedPnlRs}" style="color:${picksAvailColor}">₹${picksAvailCash.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
              <div style="font-size:.6rem;margin-top:2px" id="mpt-cash-pnl-sub">${cashSubHtml}</div>
            </div>
          </div>
        </div>
      </div>`;

      // ── Compact in-position cards — adaptive for any count ─────────────────
      function buildInPosCard3(p: PickRow): string {
        const ep = (p.entry_price as number) || ((p.entry_low + p.entry_high) / 2);
        const tgt = p.target ?? null;
        const sl = p.stop_loss ?? null;
        const lp = pm[p.stock_symbol];
        const livePnlPct = lp ? ((p.direction.toUpperCase() === 'LONG' ? lp - ep : ep - lp) / ep * 100) : null;
        const livePnlAmt = lp ? (p.direction.toUpperCase() === 'LONG' ? lp - ep : ep - lp) : null;
        const pnlColor = livePnlAmt !== null ? (livePnlAmt >= 0 ? '#10b981' : '#ef4444') : 'var(--text-muted)';
        const pnlStr = livePnlAmt !== null
          ? `<span class="mpt-ip-card3-pnl" style="color:${pnlColor}">${livePnlAmt >= 0 ? '+' : ''}₹${Math.abs(livePnlAmt).toFixed(2)}<span class="mpt-ip-card3-pnlpct" style="color:${pnlColor}">${livePnlPct !== null ? (livePnlPct >= 0 ? '+' : '') + livePnlPct.toFixed(2) + '%' : ''}</span></span>`
          : `<span class="mpt-ip-card3-pnl" style="color:var(--text-muted)">No CMP</span>`;
        return `<div class="mpt-ip-card3">
          <div class="mpt-ip-card3-sym">
            <span class="pb-${p.direction.toLowerCase()}" style="font-size:.58rem">${p.direction}</span>
            <strong>${esc(p.stock_symbol)}</strong>
            ${typeBadge(p.pick_type ?? 'intraday')}
          </div>
          <div class="mpt-ip-card3-prices">
            <span>₹${ep.toFixed(2)}</span>
            <span>→</span>
            ${lp ? `<span class="cmp">₹${lp.toFixed(2)}</span>` : '<span style="color:var(--text-muted)">—</span>'}
          </div>
          ${pnlStr}
          <div class="mpt-ip-card3-levels">
            ${tgt ? `<span style="color:#10b981">🎯₹${tgt}</span>` : ''}
            ${sl  ? `<span style="color:#ef4444">🛑₹${sl}</span>` : ''}
          </div>
        </div>`;
      }

      // ── In-Position rows (tab 1, 2-line per row) ────────────────────────────
      function buildInPosRow3(p: PickRow): string {
        const ep  = (p.entry_price as number) || ((p.entry_low + p.entry_high) / 2);
        const tgt = p.target ?? null;
        const sl  = p.stop_loss ?? null;
        const lp  = pm[p.stock_symbol];
        const qty = calcQty(ep);
        const livePnlAmt = lp ? (p.direction.toUpperCase() === 'LONG' ? lp - ep : ep - lp) : null;
        const livePnlPct = (lp && ep) ? (livePnlAmt! / ep * 100) : null;
        const livePnlTot = livePnlAmt !== null ? livePnlAmt * qty : null;
        const pnlColor   = livePnlAmt !== null ? (livePnlAmt >= 0 ? '#10b981' : '#ef4444') : 'var(--text-muted)';
        const cmpColor   = lp ? (livePnlAmt !== null ? (livePnlAmt >= 0 ? '#10b981' : '#ef4444') : 'var(--text)') : 'var(--text-muted)';
        return `<tr>
          <td><strong>${esc(p.stock_symbol)}</strong>${p.company_name ? `<br><span class="dim" style="font-size:.64rem">${esc(p.company_name)}</span>` : ''}</td>
          <td><span class="pb-${p.direction.toLowerCase()}">${p.direction}</span><br><span style="margin-top:3px;display:inline-block">${typeBadge(p.pick_type ?? 'intraday')}</span></td>
          <td><span class="dim" style="font-size:.64rem">Entry</span><br><strong style="font-size:.82rem">₹${ep.toFixed(2)}</strong></td>
          <td><span class="dim" style="font-size:.64rem">CMP</span><br><span style="font-weight:700;color:${cmpColor}">${lp ? '₹' + lp.toFixed(2) : '—'}</span></td>
          <td style="color:var(--text-muted)"><span class="dim" style="font-size:.64rem">Qty</span><br><strong style="color:var(--text);font-size:.82rem">${qty}</strong><br><span style="font-size:.6rem">₹${(qty*ep).toLocaleString('en-IN',{maximumFractionDigits:0})}</span></td>
          <td style="font-weight:800;color:${pnlColor}">${livePnlPct !== null ? (livePnlPct >= 0 ? '+' : '') + livePnlPct.toFixed(2) + '%' : '—'}${livePnlTot !== null ? `<br><span style="font-size:.7rem;font-weight:600">${livePnlTot >= 0 ? '+' : ''}₹${Math.abs(livePnlTot).toFixed(0)}</span>` : ''}</td>
          <td>${tgt ? `<span style="color:#10b981;font-size:.78rem">🎯 ₹${tgt}</span>` : '—'}${sl ? `<br><span style="color:#ef4444;font-size:.74rem">🛑 ₹${sl}</span>` : ''}</td>
        </tr>`;
      }

      // ── Pending rows (right panel tab 2) ───────────────────────────────────
      function buildPendRow2(p: PickRow): string {
        const lp = pm[p.stock_symbol];
        const inZone = lp && lp >= p.entry_low && lp <= p.entry_high;
        const aboveZone = lp && lp > p.entry_high;
        const isDupe = inPositionSymbols.has(p.stock_symbol.toUpperCase());
        if (isDupe) {
          return `<tr style="opacity:.45;background:rgba(239,68,68,.04)">
            <td><strong>${esc(p.stock_symbol)}</strong>${p.company_name ? `<br><span class="dim" style="font-size:.64rem">${esc(p.company_name)}</span>` : ''}</td>
            <td>${typeBadge(p.pick_type ?? 'intraday')}</td>
            <td><span class="pb-${p.direction.toLowerCase()}">${p.direction}</span></td>
            <td class="dim" style="font-size:.74rem;white-space:nowrap">₹${p.entry_low}–${p.entry_high}</td>
            <td style="color:#10b981;font-size:.74rem">${p.target ? '₹' + p.target : '—'}</td>
            <td style="color:#ef4444;font-size:.74rem">${p.stop_loss ? '₹' + p.stop_loss : '—'}</td>
            <td style="font-weight:700;white-space:nowrap"><span style="background:rgba(239,68,68,.15);color:#ef4444;font-size:.68rem;font-weight:700;padding:2px 7px;border-radius:4px;white-space:nowrap">⛔ Already In Position — Skip</span></td>
          </tr>`;
        }
        return `<tr>
          <td><strong>${esc(p.stock_symbol)}</strong>${p.company_name ? `<br><span class="dim" style="font-size:.64rem">${esc(p.company_name)}</span>` : ''}</td>
          <td>${typeBadge(p.pick_type ?? 'intraday')}</td>
          <td><span class="pb-${p.direction.toLowerCase()}">${p.direction}</span></td>
          <td class="dim" style="font-size:.74rem;white-space:nowrap">₹${p.entry_low}–${p.entry_high}</td>
          <td style="color:#10b981;font-size:.74rem">${p.target ? '₹' + p.target : '—'}</td>
          <td style="color:#ef4444;font-size:.74rem">${p.stop_loss ? '₹' + p.stop_loss : '—'}</td>
          <td style="font-weight:700;color:${lp ? (inZone ? '#f59e0b' : aboveZone ? '#10b981' : '#94a3b8') : 'var(--text-muted)'};white-space:nowrap">${lp ? '₹' + lp.toFixed(2) + (inZone ? ' 🔔' : '') : '—'}</td>
        </tr>`;
      }

      // ── Executed today rows (right panel tab 2) ────────────────────────────
      function buildExecRow2(p: PickRow): string {
        const ep = (p.entry_price as number) || ((p.entry_low + p.entry_high) / 2);
        const qty = calcQty(ep);
        const isOpen = p.result === 'entry_triggered';
        const pnlPerShare = (!isOpen && p.result_price) ? (p.direction.toUpperCase() === 'LONG' ? (p.result_price as number) - ep : ep - (p.result_price as number)) : null;
        const pnlTotal = pnlPerShare !== null ? pnlPerShare * qty : null;
        const pnlPct = (pnlPerShare !== null && ep) ? pnlPerShare / ep * 100 : null;
        const statusBadge = isOpen ? '<span class="pb-res-entry">⚡ In Position</span>' : resBadge(p.result);
        const exitCell = isOpen
          ? '<span style="color:var(--text-muted);font-size:.72rem">open</span>'
          : (p.result_price ? '₹' + (p.result_price as number).toFixed(2) : '—');
        const entryCell = p.entry_price
          ? '₹' + (p.entry_price as number).toFixed(2)
          : `<span class="dim" style="font-size:.68rem">₹${p.entry_low}–${p.entry_high}<br>zone</span>`;
        return `<tr>
          <td><strong>${esc(p.stock_symbol)}</strong>${p.company_name ? `<br><span class="dim" style="font-size:.64rem">${esc(p.company_name)}</span>` : ''}</td>
          <td>${typeBadge(p.pick_type ?? 'intraday')}</td>
          <td><span class="pb-${p.direction.toLowerCase()}">${p.direction}</span></td>
          <td>${statusBadge}</td>
          <td class="dim" style="font-size:.74rem">${entryCell}<br><span style="font-size:.6rem;color:var(--text-muted)">x${qty}</span></td>
          <td class="${p.result === 'target_hit' ? 'mpt-green' : (p.result === 'sl_hit' ? 'mpt-red' : '')}" style="font-weight:700;font-size:.8rem">${exitCell}</td>
          <td class="${pnlTotal !== null ? (pnlTotal >= 0 ? 'mpt-green' : 'mpt-red') : ''}" style="font-weight:700;font-size:.8rem">${pnlTotal !== null ? (pnlTotal >= 0 ? '+' : '') + '₹' + Math.abs(pnlTotal).toFixed(0) : '—'}${pnlPct !== null ? `<br><span style="font-size:.68rem;font-weight:500">${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%</span>` : ''}</td>
        </tr>`;
      }

      // ── History rows (bottom full-width table) ─────────────────────────────
      function buildHistRow2(p: PickRow): string {
        const ep = (p.entry_price as number) || ((p.entry_low + p.entry_high) / 2);
        const execStr = p.entry_price
          ? '₹' + (p.entry_price as number).toFixed(2) + (p.entry_at ? '<br><span class="dim" style="font-size:.6rem">' + fmtTime(p.entry_at) + '</span>' : '')
          : `<span class="dim" style="font-size:.68rem">₹${p.entry_low}–${p.entry_high}<br>zone</span>`;
        const exitStr = p.result_price ? '₹' + (p.result_price as number).toFixed(2) + (p.result_at ? '<br><span class="dim" style="font-size:.6rem">' + fmtTime(p.result_at) + '</span>' : '') : '—';
        const pct = (ep && p.result_price)
          ? (p.direction.toUpperCase() === 'LONG' ? ((p.result_price as number) - ep) / ep * 100 : (ep - (p.result_price as number)) / ep * 100)
          : null;
        const pnlRs = pct !== null ? pct / 100 * ep * calcQty(ep) : null;
        return `<tr>
          <td><strong>${esc(p.stock_symbol)}</strong>${p.company_name ? `<br><span class="dim" style="font-size:.64rem">${esc(p.company_name)}</span>` : ''}</td>
          <td>${typeBadge(p.pick_type ?? 'intraday')}</td>
          <td><span class="pb-${p.direction.toLowerCase()}">${p.direction}</span></td>
          <td class="dim" style="font-size:.74rem;white-space:nowrap">₹${p.entry_low}–${p.entry_high}</td>
          <td>${resBadge(p.result)}</td>
          <td class="dim" style="font-size:.76rem">${execStr}<br><span style="font-size:.6rem;color:var(--text-muted)">x${calcQty(ep)}</span></td>
          <td class="${p.result === 'target_hit' ? 'mpt-green' : 'mpt-red'}" style="font-weight:700;font-size:.8rem">${exitStr}</td>
          <td class="${pct !== null ? (pct >= 0 ? 'mpt-green' : 'mpt-red') : ''}" style="font-weight:800;font-size:.84rem">${pct !== null ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '—'}${pnlRs !== null ? `<br><span style="font-size:.7rem;font-weight:600">${pnlRs >= 0 ? '+' : ''}₹${Math.abs(pnlRs).toFixed(0)}</span>` : ''}</td>
          <td class="dim" style="max-width:110px;overflow:hidden;text-overflow:ellipsis;font-size:.68rem" title="${esc(p.reason)}">${esc(p.reason.slice(0,38))}${p.reason.length > 38 ? '…' : ''}</td>
        </tr>`;
      }
      // rebuild histRows with new 9-col format
      let histRows2 = '';
      for (const date of histDates) {
        const picks = histGroups[date];
        const hit = picks.filter(p => p.result === 'target_hit').length;
        const sl2  = picks.filter(p => p.result === 'sl_hit').length;
        const isToday2 = date === todayISO;
        const hdrCls2 = isToday2 ? 'mpt-ptbl-today' : 'mpt-ptbl-date';
        histRows2 += `<tr><td class="${hdrCls2}" colspan="9">${isToday2 ? '📅 TODAY — ' : ''}${fmtDate(date)} &nbsp;·&nbsp; <span style="color:#10b981">${hit} 🎯 hit</span> &nbsp;/&nbsp; <span style="color:#ef4444">${sl2} 🔴 SL</span></td></tr>`;
        histRows2 += picks.map(buildHistRow2).join('');
      }

      // ── % metrics (pick quality, capital-independent) ────────────────────
      const hitPicks2  = allResolvedAll.filter(p => p.result === 'target_hit');
      const slPicks2   = allResolvedAll.filter(p => p.result === 'sl_hit');
      const pctReturn2 = (p: PickRow) => {
        const ep = (p.entry_price as number) || ((p.entry_low + p.entry_high) / 2);
        if (!ep || !p.result_price) return 0;
        return p.direction.toUpperCase() === 'LONG'
          ? ((p.result_price as number) - ep) / ep * 100
          : (ep - (p.result_price as number)) / ep * 100;
      };
      const avgWinPct  = hitPicks2.length ? hitPicks2.reduce((s, p) => s + pctReturn2(p), 0) / hitPicks2.length : null;
      const avgLossPct = slPicks2.length  ? Math.abs(slPicks2.reduce((s, p) => s + pctReturn2(p), 0) / slPicks2.length) : null;
      const wr2        = allResolvedAll.length ? hitPicks2.length / allResolvedAll.length : null;
      const expectancy = (wr2 !== null && avgWinPct !== null && avgLossPct !== null)
        ? wr2 * avgWinPct - (1 - wr2) * avgLossPct : null;
      const overallHit = hitPicks2.length;
      const overallSL  = slPicks2.length;
      const overallWinRate = wr2 !== null ? Math.round(wr2 * 100) : null;

      const inPosRows = inPosition.length
        ? inPosition.map(buildInPosRow3).join('')
        : '<tr><td colspan="7" style="padding:28px;text-align:center;color:var(--text-muted)">No active positions right now</td></tr>';
      const pendContent = pendingOrders.length
        ? pendingOrders.map(buildPendRow2).join('')
        : '<tr><td colspan="7" style="padding:28px;text-align:center;color:var(--text-muted)">No pending orders for today</td></tr>';
      const execContent = execToday.length
        ? execToday.map(buildExecRow2).join('')
        : '<tr><td colspan="7" style="padding:28px;text-align:center;color:var(--text-muted)">No executions today</td></tr>';

      return `${topBarHtml}
      <div class="mpt-rpanel" style="margin-bottom:16px">
        <div class="mpt-tabnav2" style="align-items:center">
          <div class="mpt-tab2 t2-inpos active" onclick="_switchTab2('inpos',this)">⚡ In Position <span class="mpt-tab2-badge" id="mpt-inpos-count" style="${inPosition.length ? 'background:rgba(245,158,11,.15);color:#f59e0b' : ''}">${inPosition.length}</span></div>
          <div class="mpt-tab2 t2-pending" onclick="_switchTab2('pending',this)">⏳ Pending <span class="mpt-tab2-badge" id="mpt-pending-count" style="${pendingNonDupe.length ? 'background:rgba(167,139,250,.15);color:#a78bfa' : ''}">${pendingNonDupe.length}${pendingDupeCount > 0 ? ` <span style="color:#ef4444;font-size:.7em" title="${pendingDupeCount} duplicate(s) already in position">+${pendingDupeCount}⛔</span>` : ''}</span></div>
          <div class="mpt-tab2 t2-exec" onclick="_switchTab2('exec',this)">✅ Executed Today <span class="mpt-tab2-badge" id="mpt-exec-count" style="${execToday.length ? 'background:rgba(16,185,129,.12);color:#10b981' : ''}">${execToday.length}</span></div>
          <div style="margin-left:auto;display:flex;align-items:center;gap:6px;padding:0 12px">
            <span style="font-size:.65rem;color:var(--text-muted)" id="mpt-picks-upd"></span>
            <button onclick="_refreshPicks()" style="background:none;border:1px solid var(--border);color:var(--text-muted);border-radius:5px;padding:3px 8px;font-size:.7rem;cursor:pointer">↻</button>
          </div>
        </div>
        <div class="mpt-tabpane2 active" id="mpt-pane2-inpos">
          <div style="overflow-x:auto"><table class="mpt-rpanel-tbl">
            <thead><tr><th>Symbol</th><th>Dir / Type</th><th>Entry</th><th>CMP</th><th>Qty / Capital</th><th>Return % / P&amp;L</th><th>Target / SL</th></tr></thead>
            <tbody id="mpt-inpos-body">${inPosRows}</tbody>
          </table></div>
        </div>
        <div class="mpt-tabpane2" id="mpt-pane2-pending">
          <div style="overflow-x:auto"><table class="mpt-rpanel-tbl">
            <thead><tr><th>Symbol</th><th>Type</th><th>Dir</th><th>Zone</th><th>Target</th><th>SL</th><th>CMP</th></tr></thead>
            <tbody id="mpt-picks-body">${pendContent}</tbody>
          </table></div>
        </div>
        <div class="mpt-tabpane2" id="mpt-pane2-exec">
          <div style="overflow-x:auto"><table class="mpt-rpanel-tbl">
            <thead><tr><th>Symbol</th><th>Type</th><th>Dir</th><th>Status</th><th>Entry</th><th>Exit</th><th>P&amp;L</th></tr></thead>
            <tbody id="mpt-exec-body">${execContent}</tbody>
          </table></div>
        </div>
      </div>
      <div class="mpt-overall-pnl" style="display:flex;align-items:center;gap:20px;background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:14px 20px;margin-bottom:12px;flex-wrap:wrap">
        <div style="display:flex;flex-direction:column">
          <span style="font-size:.6rem;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:3px">Overall P&amp;L</span>
          <span style="font-size:1.15rem;font-weight:900;font-variant-numeric:tabular-nums;color:${picksTotalPnl >= 0 ? '#10b981' : '#ef4444'}">${picksTotalPnl >= 0 ? '+' : ''}₹${Math.abs(picksTotalPnl).toLocaleString('en-IN',{maximumFractionDigits:0})}</span>
          <span style="font-size:.58rem;color:var(--text-muted);margin-top:2px">closed + open unrealised</span>
        </div>
        <div style="width:1px;height:44px;background:var(--border)"></div>
        <div style="display:flex;flex-direction:column">
          <span style="font-size:.6rem;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:3px">Expectancy / trade</span>
          <span style="font-size:1.15rem;font-weight:900;font-variant-numeric:tabular-nums;color:${expectancy !== null ? (expectancy >= 0 ? '#10b981' : '#ef4444') : 'var(--text-muted)'}">${expectancy !== null ? (expectancy >= 0 ? '+' : '') + expectancy.toFixed(2) + '%' : '—'}</span>
          <span style="font-size:.58rem;color:var(--text-muted);margin-top:2px">(win_rate × avg_win) − (loss_rate × avg_loss)</span>
        </div>
        <div style="width:1px;height:44px;background:var(--border)"></div>
        <div style="display:flex;flex-direction:column">
          <span style="font-size:.6rem;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:3px">Avg Win %</span>
          <span style="font-size:.95rem;font-weight:800;color:#10b981">${avgWinPct !== null ? '+' + avgWinPct.toFixed(2) + '%' : '—'}</span>
          <span style="font-size:.58rem;color:var(--text-muted);margin-top:2px">${overallHit} target hit</span>
        </div>
        <div style="width:1px;height:44px;background:var(--border)"></div>
        <div style="display:flex;flex-direction:column">
          <span style="font-size:.6rem;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:3px">Avg Loss %</span>
          <span style="font-size:.95rem;font-weight:800;color:#ef4444">${avgLossPct !== null ? '−' + avgLossPct.toFixed(2) + '%' : '—'}</span>
          <span style="font-size:.58rem;color:var(--text-muted);margin-top:2px">${overallSL} SL hit</span>
        </div>
        <div style="width:1px;height:44px;background:var(--border)"></div>
        <div style="display:flex;flex-direction:column">
          <span style="font-size:.6rem;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:3px">Win Rate</span>
          <span style="font-size:.95rem;font-weight:800;color:${overallWinRate !== null ? (overallWinRate >= 50 ? '#10b981' : '#ef4444') : 'var(--text)'}">${overallWinRate !== null ? overallWinRate + '%' : '—'}</span>
          <span style="font-size:.58rem;color:var(--text-muted);margin-top:2px">${allResolvedAll.length} closed picks</span>
        </div>
        <div style="width:1px;height:44px;background:var(--border)"></div>
        <div style="display:flex;flex-direction:column">
          <span style="font-size:.6rem;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:3px">Reward / Risk</span>
          <span style="font-size:.95rem;font-weight:800;color:var(--text)">${(avgWinPct !== null && avgLossPct !== null && avgLossPct > 0) ? (avgWinPct / avgLossPct).toFixed(2) + 'R' : '—'}</span>
          <span style="font-size:.58rem;color:var(--text-muted);margin-top:2px">avg_win / avg_loss</span>
        </div>
        ${inPosition.length > 0 ? `
        <div style="width:1px;height:44px;background:var(--border)"></div>
        <div style="display:flex;flex-direction:column">
          <span style="font-size:.6rem;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:3px">In Position</span>
          <span style="font-size:.95rem;font-weight:800;color:#f59e0b">${inPosition.length} active</span>
          <span style="font-size:.58rem;color:var(--text-muted);margin-top:2px">awaiting exit</span>
        </div>` : ''}
      </div>
      <div class="mpt-hist-sec">
        <div class="mpt-hist-sec-hdr">
          <span style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted)">📋 Order History</span>
          <span style="font-size:.68rem;background:var(--bg2);border-radius:20px;padding:1px 9px;color:var(--text-muted)" id="mpt-hist-count">${resolved.length} closed</span>
          <span style="font-size:.72rem;color:#10b981;font-weight:600">${totalHit} 🎯 hit</span>
          <span style="font-size:.72rem;color:#ef4444;font-weight:600">${totalSL} 🔴 SL</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 0 6px">
          <input id="mpt-filter-sym" type="text" placeholder="Filter by symbol…" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);color:var(--text);font-size:.82rem;width:140px" oninput="_filterHistory()">
          <select id="mpt-filter-outcome" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);color:var(--text);font-size:.82rem" onchange="_filterHistory()">
            <option value="">All outcomes</option>
            <option value="target_hit">🎯 Target Hit</option>
            <option value="sl_hit">🔴 SL Hit</option>
          </select>
          <input id="mpt-filter-date" type="date" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);color:var(--text);font-size:.82rem" onchange="_filterHistory()" title="Filter by date">
          <span id="mpt-filter-reset" style="font-size:.78rem;color:var(--accent);cursor:pointer;text-decoration:underline;display:none" onclick="_resetHistFilter()">Clear filters</span>
        </div>
        <div style="overflow-x:auto"><table class="mpt-ptbl">
          <thead><tr><th>Symbol</th><th>Type</th><th>Dir</th><th>Entry Zone</th><th>Status</th><th>Entry Price</th><th>Exit Price</th><th>Return %</th><th>Reason</th></tr></thead>
          <tbody id="mpt-hist-body">${resolved.length ? histRows2 : '<tr><td colspan="9" style="padding:28px;text-align:center;color:var(--text-muted)">No closed orders yet</td></tr>'}</tbody>
        </table></div>
      </div>`;
    })()}

    <!-- FLASH MESSAGE -->
    ${req.query.msg ? `<div class="mpt-msg mpt-msg-ok">✅ ${esc(req.query.msg as string)}</div>` : ""}
    ${req.query.err ? `<div class="mpt-msg mpt-msg-err">❌ ${esc(req.query.err as string)}</div>` : ""}

    <!-- CREDITS BAR (only if free tier) -->
    ${!isPremium ? `<div class="mpt-credits-bar ${creditsOut ? 'mpt-credits-out' : ''}" style="margin-bottom:16px">
      ${creditsOut
        ? `<span style="color:#ef4444;font-weight:700">⚠️ Free trades used up (${tradeCount}/${freeLimit}) — <a href="/my-paper-trade/upgrade" style="color:#ef4444">Upgrade to Premium →</a></span>`
        : `<span class="mpt-credits-free">🎫 Free: ${tradesLeft} of ${freeLimit} trades left</span>
           <a href="/my-paper-trade/upgrade" style="font-size:0.8rem;color:var(--text-muted)">Upgrade for unlimited →</a>`
      }
    </div>` : ''}





    <!-- RESET -->
    <div style="margin-top:32px; padding-top:20px; border-top:1px solid var(--border); display:flex; align-items:center; gap:16px; flex-wrap:wrap">
      <form method="POST" action="/my-paper-trade/reset" onsubmit="return confirm('Reset your entire paper portfolio? This cannot be undone.')">
        <button type="submit" class="mpt-btn-reset">🔄 Reset Portfolio (restart with ₹1,00,000)</button>
      </form>
      <span style="font-size:0.8rem; color:var(--text-muted)">Hi ${esc(userName.split(" ")[0])} · Your portfolio is saved to your account</span>
    </div>

    <!-- MANUAL PAPER TRADE CHARTS -->
    ${eqData.length >= 2 ? `
    <div class="mpt-chart-wrap" style="margin-top:20px">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:12px">📈 Cumulative P&L Curve</div>
      <canvas id="mptEqChart" height="120"></canvas>
    </div>` : ""}
    ${monthValues.length >= 1 ? `
    <div class="mpt-chart-wrap" style="margin-top:12px">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:12px">📅 Monthly P&L</div>
      <canvas id="mptMonthChart" height="120"></canvas>
    </div>` : ""}

    <div class="mpt-disclaimer">
      ⚠️ <strong>Disclaimer:</strong> Paper trading uses simulated virtual money — no real funds are at risk.
      Prices used for buy/sell are from the ZeroScreen DB (NSE data, updated periodically) and may not reflect the exact live market price.
      Results from paper trading do not guarantee similar outcomes in real trading.
    </div>

    <footer class="site-footer" style="margin-top:24px"><span>© 2026 ZeroScreen · Paper trading simulation · no real capital at risk</span></footer>
  </div>

  <script src="/public/js/app.js"></script>
  <script>
  // ── Picks refresh ─────────────────────────────────────────────────────────
  async function _refreshPicks(){
    try{
      const [r,rp]=await Promise.all([fetch('/api/picks/results'),fetch('/api/my-paper-positions')]);
      const [d,dp]=await Promise.all([r.json(),rp.json()]);
      const upd=document.getElementById('mpt-picks-upd');if(upd)upd.textContent='↻ '+new Date().toLocaleTimeString('en-IN');
      if(!d.picks||!d.picks.length)return;
      function typeBadge(t){if(t==='intraday')return'<span class="pb-type-i">⚡ Intra</span>';if(t==='swing')return'<span class="pb-type-s">🌊 Swing</span>';return'<span class="pb-type-l">📈 LT</span>';}
      function resBadge(r){if(r==='target_hit')return'<span class="pb-res-target">🎯 Target Hit</span>';if(r==='sl_hit')return'<span class="pb-res-sl">🔴 SL Hit</span>';return'<span class="pb-res-entry">⚡ In Zone</span>';}
      function fmtTime(iso){if(!iso)return'—';return new Date(iso).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'});}
      function fmtDateShort(iso){return new Date(iso).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short'});}
      function fmtDate(d){return new Date(d+'T00:00:00+05:30').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});}
      const todayISO=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
      const inPos=d.picks.filter(p=>p.result==='entry_triggered');
      // Merge actual paper_positions into inPosSymSet so stocks bought via auto-trade are also detected
      const paperPositionSyms=(dp.ok&&dp.positions)?dp.positions.map(p=>p.symbol.toUpperCase()):[];
      const allPending=d.picks.filter(p=>!p.result);
      const latestPendDate=allPending.map(p=>(p.published_at||'').slice(0,10)).sort().reverse()[0]||'';
      const pending=latestPendDate?allPending.filter(p=>(p.published_at||'').slice(0,10)===latestPendDate):[];
      // Use result_at date (when closed), NOT published_at (when pick was created)
      const resolvedToday=d.picks.filter(p=>(p.result==='target_hit'||p.result==='sl_hit')&&(p.result_at?new Date(p.result_at).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}):null)===todayISO);
      const execToday=[...inPos,...resolvedToday];
      const resolved=d.picks.filter(p=>p.result==='target_hit'||p.result==='sl_hit');

      // Today's P&L: fetch CMP for in-pos picks from /api/picks/results prices field if available
      // closed P&L + unrealized from in-pos (server-side handles this on load, JS uses pick entry as fallback)
      const closedPnlVal=resolvedToday.reduce((sum,p)=>{
        const ep=p.entry_price?parseFloat(p.entry_price):((parseFloat(p.entry_low)+parseFloat(p.entry_high))/2);
        if(!p.result_price)return sum;
        return sum+(p.direction.toUpperCase()==='LONG'?parseFloat(p.result_price)-ep:ep-parseFloat(p.result_price));
      },0);
      const todayPnlEl=document.getElementById('mpt-today-pnl');
      const hasAnyPnl=resolvedToday.length>0||inPos.length>0;
      if(todayPnlEl){
        if(hasAnyPnl){
          todayPnlEl.textContent=(closedPnlVal>=0?'+':'')+'₹'+Math.abs(closedPnlVal).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
          todayPnlEl.style.color=closedPnlVal>=0?'#10b981':'#ef4444';
        }else{
          todayPnlEl.textContent='—';
          todayPnlEl.style.color='var(--text-muted)';
        }
      }
      const todaySubEl=document.getElementById('mpt-today-pnl-sub');
      if(todaySubEl){
        const hit=resolvedToday.filter(p=>p.result==='target_hit').length;
        const sl=resolvedToday.filter(p=>p.result==='sl_hit').length;
        if(resolvedToday.length||inPos.length){
          todaySubEl.innerHTML=hit+' 🎯 &nbsp;/&nbsp; '+sl+' 🔴 closed'+(inPos.length?' &nbsp;·&nbsp; '+inPos.length+' open':'');
        }else{
          todaySubEl.textContent='No picks today';
        }
      }

      // In-position cards
      const ic=document.getElementById('mpt-inpos-count');
      if(ic){ic.textContent=inPos.length;ic.style.background=inPos.length?'rgba(245,158,11,.15)':'var(--bg2)';ic.style.color=inPos.length?'#f59e0b':'var(--text-muted)';}
      const inposBody=document.getElementById('mpt-inpos-body');
      if(inposBody){
        inposBody.innerHTML=inPos.length?inPos.map(p=>{
          const ep=p.entry_price?parseFloat(p.entry_price):((parseFloat(p.entry_low)+parseFloat(p.entry_high))/2);
          const tgt=p.target?parseFloat(p.target):null;
          const sl=p.stop_loss?parseFloat(p.stop_loss):null;
          const qty=Math.max(1,Math.floor(25000/ep));
          const deployed=qty*ep;
          return '<tr>'+
            '<td><strong>'+p.stock_symbol+'</strong>'+(p.company_name?'<br><span class="dim" style="font-size:.64rem">'+p.company_name+'</span>':'')+
            '</td><td><span class="pb-'+p.direction.toLowerCase()+'">'+p.direction+'</span><br>'+typeBadge(p.pick_type||'intraday')+
            '</td><td><span class="dim" style="font-size:.64rem">Entry</span><br><strong style="font-size:.82rem">₹'+ep.toFixed(2)+'</strong>'+
            '</td><td><span class="dim" style="font-size:.64rem">CMP</span><br><span style="color:var(--text-muted)">—</span>'+
            '</td><td><span class="dim" style="font-size:.64rem">Qty</span><br><strong>'+qty+'</strong><br><span style="font-size:.6rem">₹'+Math.round(deployed).toLocaleString('en-IN')+'</span>'+
            '</td><td style="color:var(--text-muted)">—'+
            '</td><td>'+(tgt?'<span style="color:#10b981;font-size:.78rem">🎯 ₹'+tgt+'</span>':'—')+(sl?'<br><span style="color:#ef4444;font-size:.74rem">🛑 ₹'+sl+'</span>':'')+
            '</td></tr>';
        }).join(''):'<tr><td colspan="7" style="padding:28px;text-align:center;color:var(--text-muted)">No active positions right now</td></tr>';
      }
      // Update cash display: fixed ₹25,000 per trade allocation
      const cashEl=document.getElementById('mpt-cash-display');
      const cashSubEl=document.getElementById('mpt-cash-pnl-sub');
      if(cashEl||cashSubEl){
        const ALLOC=25000;
        const deployed=inPos.reduce((sum,p)=>{
          const ep=p.entry_price?parseFloat(p.entry_price):((parseFloat(p.entry_low)+parseFloat(p.entry_high))/2);
          const qty=Math.max(1,Math.floor(ALLOC/ep));
          return sum+qty*ep;
        },0);
        if(cashEl){
          const base=parseFloat(cashEl.getAttribute('data-base')||'0');
          const avail=base-deployed;
          cashEl.textContent='₹'+avail.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
          cashEl.style.color=avail<base?'#ef4444':avail>base?'#10b981':'var(--text)';
        }
        if(cashSubEl){
          if(inPos.length){
            cashSubEl.innerHTML='<span style="color:#f59e0b">'+inPos.length+' active · ₹'+Math.round(deployed).toLocaleString('en-IN')+' blocked</span>';
          }else{
            cashSubEl.innerHTML='<span style="color:var(--text-muted)">No active picks</span>';
          }
        }
      }
      // Pending tab — filter duplicates (already in position via picks tracker OR actual paper_positions)
      const inPosSymSet=new Set([...inPos.map(p=>p.stock_symbol.toUpperCase()),...paperPositionSyms]);
      const pendingNonDupe=pending.filter(p=>!inPosSymSet.has(p.stock_symbol.toUpperCase()));
      const pendingDupeCount=pending.length-pendingNonDupe.length;
      const pc=document.getElementById('mpt-pending-count');
      if(pc){
        pc.innerHTML=pendingNonDupe.length+(pendingDupeCount>0?(' <span style="color:#ef4444;font-size:.7em" title="'+pendingDupeCount+' duplicate(s) already in position">+'+pendingDupeCount+'⛔</span>'):'');
        pc.style.background=pendingNonDupe.length?'rgba(167,139,250,.15)':'var(--bg2)';
        pc.style.color=pendingNonDupe.length?'#a78bfa':'var(--text-muted)';
      }
      const pendBody=document.getElementById('mpt-picks-body');
      if(pendBody){
        pendBody.innerHTML=pending.length?pending.map(p=>{
          const isDupe=inPosSymSet.has(p.stock_symbol.toUpperCase());
          if(isDupe){
            return '<tr style="opacity:.45;background:rgba(239,68,68,.04)"><td><strong>'+p.stock_symbol+'</strong>'+(p.company_name?'<br><span class="dim" style="font-size:.64rem">'+p.company_name+'</span>':'')+
              '</td><td>'+typeBadge(p.pick_type||'intraday')+'</td><td><span class="pb-'+p.direction.toLowerCase()+'">'+p.direction+'</span></td>'+
              '<td class="dim" style="font-size:.74rem;white-space:nowrap">₹'+p.entry_low+'–'+p.entry_high+'</td>'+
              '<td style="color:#10b981;font-size:.74rem">'+(p.target?'₹'+p.target:'—')+'</td>'+
              '<td style="color:#ef4444;font-size:.74rem">'+(p.stop_loss?'₹'+p.stop_loss:'—')+'</td>'+
              '<td style="font-weight:700;white-space:nowrap"><span style="background:rgba(239,68,68,.15);color:#ef4444;font-size:.68rem;font-weight:700;padding:2px 7px;border-radius:4px">⛔ Already In Position — Skip</span></td></tr>';
          }
          return '<tr><td><strong>'+p.stock_symbol+'</strong>'+(p.company_name?'<br><span class="dim" style="font-size:.64rem">'+p.company_name+'</span>':'')+
            '</td><td>'+typeBadge(p.pick_type||'intraday')+'</td><td><span class="pb-'+p.direction.toLowerCase()+'">'+p.direction+'</span></td>'+
            '<td class="dim" style="font-size:.74rem;white-space:nowrap">₹'+p.entry_low+'–'+p.entry_high+'</td>'+
            '<td style="color:#10b981;font-size:.74rem">'+(p.target?'₹'+p.target:'—')+'</td>'+
            '<td style="color:#ef4444;font-size:.74rem">'+(p.stop_loss?'₹'+p.stop_loss:'—')+'</td>'+
            '<td style="font-weight:700;color:var(--text-muted)">—</td></tr>';
        }).join(''):'<tr><td colspan="7" style="padding:28px;text-align:center;color:var(--text-muted)">No pending orders for today</td></tr>';
      }
      // Executed today tab (entry_triggered + closed today)
      const ec=document.getElementById('mpt-exec-count');
      if(ec){ec.textContent=execToday.length;ec.style.background=execToday.length?'rgba(16,185,129,.12)':'var(--bg2)';ec.style.color=execToday.length?'#10b981':'var(--text-muted)';}
      const execBody=document.getElementById('mpt-exec-body');
      if(execBody){
        execBody.innerHTML=execToday.length?execToday.map(p=>{
          const ep=p.entry_price?parseFloat(p.entry_price):((parseFloat(p.entry_low)+parseFloat(p.entry_high))/2);
          const isOpen=p.result==='entry_triggered';
          const pnl=(!isOpen&&p.result_price)?(p.direction.toUpperCase()==='LONG'?parseFloat(p.result_price)-ep:ep-parseFloat(p.result_price)):null;
          const rCls=p.result==='target_hit'?'mpt-green':(p.result==='sl_hit'?'mpt-red':'');
          const pCls=pnl!==null?(pnl>=0?'mpt-green':'mpt-red'):'';
          const statusBadge=isOpen?'<span class="pb-res-entry">⚡ In Position</span>':resBadge(p.result);
          return '<tr><td><strong>'+p.stock_symbol+'</strong>'+(p.company_name?'<br><span class="dim" style="font-size:.64rem">'+p.company_name+'</span>':'')+
            '</td><td>'+typeBadge(p.pick_type||'intraday')+'</td><td><span class="pb-'+p.direction.toLowerCase()+'">'+p.direction+'</span></td>'+
            '<td>'+statusBadge+'</td>'+
            '<td class="dim" style="font-size:.74rem">₹'+ep.toFixed(2)+'</td>'+
            '<td class="'+rCls+'" style="font-weight:700;font-size:.8rem">'+(isOpen?'<span style="color:var(--text-muted)">open</span>':(p.result_price?'₹'+parseFloat(p.result_price).toFixed(2):'—'))+'</td>'+
            '<td class="'+pCls+'" style="font-weight:700;font-size:.8rem">'+(pnl!==null?(pnl>=0?'+':'')+'₹'+Math.abs(pnl).toFixed(2):'—')+'</td></tr>';
        }).join(''):'<tr><td colspan="7" style="padding:28px;text-align:center;color:var(--text-muted)">No executions today</td></tr>';
      }
      // History table
      const hc=document.getElementById('mpt-hist-count');
      if(hc)hc.textContent=resolved.length+' closed';
      const histBody=document.getElementById('mpt-hist-body');
      if(histBody){
        const histGroups={};
        for(const p of resolved){const dt=(p.published_at||'').slice(0,10);if(!histGroups[dt])histGroups[dt]=[];histGroups[dt].push(p);}
        const histDates=Object.keys(histGroups).sort().reverse();
        let html='';
        for(const date of histDates){
          const picks=histGroups[date];
          const hit=picks.filter(p=>p.result==='target_hit').length;
          const sl=picks.filter(p=>p.result==='sl_hit').length;
          const isToday=date===todayISO;
          html+='<tr><td class="'+(isToday?'mpt-ptbl-today':'mpt-ptbl-date')+'" colspan="9">'+(isToday?'📅 TODAY — ':'')+fmtDate(date)+' &nbsp;·&nbsp; <span style="color:#10b981">'+hit+' 🎯 hit</span> &nbsp;/&nbsp; <span style="color:#ef4444">'+sl+' 🔴 SL</span></td></tr>';
          for(const p of picks){
            const ep=p.entry_price?parseFloat(p.entry_price):((parseFloat(p.entry_low)+parseFloat(p.entry_high))/2);
            const execStr=p.entry_price?'₹'+parseFloat(p.entry_price).toFixed(2)+(p.entry_at?'<br><span class="dim" style="font-size:.6rem">'+fmtTime(p.entry_at)+'</span>':''):'<span class="dim" style="font-size:.68rem">zone mid</span>';
            const exitStr=p.result_price?'₹'+parseFloat(p.result_price).toFixed(2)+(p.result_at?'<br><span class="dim" style="font-size:.6rem">'+fmtTime(p.result_at)+'</span>':''):'—';
            const pct=p.result_price?(p.direction.toUpperCase()==='LONG'?(parseFloat(p.result_price)-ep)/ep*100:(ep-parseFloat(p.result_price))/ep*100):null;
            const rCls=p.result==='target_hit'?'mpt-green':'mpt-red';
            const pCls=pct!==null?(pct>=0?'mpt-green':'mpt-red'):'';
            html+='<tr data-sym="'+p.stock_symbol+'" data-outcome="'+p.result+'" data-date="'+date+'"><td><strong>'+p.stock_symbol+'</strong>'+(p.company_name?'<br><span class="dim" style="font-size:.64rem">'+p.company_name+'</span>':'')+
              '</td><td>'+typeBadge(p.pick_type||'intraday')+'</td><td><span class="pb-'+p.direction.toLowerCase()+'">'+p.direction+'</span></td>'+
              '<td class="dim" style="font-size:.74rem;white-space:nowrap">₹'+p.entry_low+'–'+p.entry_high+'</td>'+
              '<td>'+resBadge(p.result)+'</td>'+
              '<td class="dim" style="font-size:.76rem">'+execStr+'</td>'+
              '<td class="'+rCls+'" style="font-weight:700;font-size:.8rem">'+exitStr+'</td>'+
              '<td class="'+pCls+'" style="font-weight:800;font-size:.84rem">'+(pct!==null?(pct>=0?'+':'')+pct.toFixed(2)+'%':'—')+'</td>'+
              '<td class="dim" style="max-width:110px;overflow:hidden;text-overflow:ellipsis;font-size:.68rem">'+(p.reason||'').slice(0,38)+((p.reason||'').length>38?'…':'')+'</td></tr>';
          }
        }
        histBody.innerHTML=html||'<tr><td colspan="9" style="padding:28px;text-align:center;color:var(--text-muted)">No closed orders yet</td></tr>';
        // Re-apply filters after refresh
        _filterHistory();
      }
    }catch(e){console.warn('[PicksRefresh]',e);}
  }
  setInterval(_refreshPicks,5*60*1000);

  function _filterHistory(){
    const sym=(document.getElementById('mpt-filter-sym')?.value||'').trim().toUpperCase();
    const outcome=document.getElementById('mpt-filter-outcome')?.value||'';
    const date=document.getElementById('mpt-filter-date')?.value||'';
    const rows=document.querySelectorAll('#mpt-hist-body tr[data-sym]');
    let vis=0;
    rows.forEach(tr=>{
      const tsym=(tr.getAttribute('data-sym')||'').toUpperCase();
      const tout=tr.getAttribute('data-outcome')||'';
      const tdate=tr.getAttribute('data-date')||'';
      const show=(!sym||tsym.includes(sym))&&(!outcome||tout===outcome)&&(!date||tdate===date);
      tr.style.display=show?'':'none';
      if(show)vis++;
    });
    const reset=document.getElementById('mpt-filter-reset');
    if(reset)reset.style.display=(sym||outcome||date)?'':'none';
    const hc=document.getElementById('mpt-hist-count');
    if(hc){
      const total=rows.length;
      hc.textContent=(sym||outcome||date)?(vis+'/'+total+' shown'):(total+' closed');
    }
  }
  function _resetHistFilter(){
    const sym=document.getElementById('mpt-filter-sym');
    const outcome=document.getElementById('mpt-filter-outcome');
    const date=document.getElementById('mpt-filter-date');
    if(sym)sym.value='';
    if(outcome)outcome.value='';
    if(date)date.value='';
    _filterHistory();
  }

  async function _shareReport(btn){
    btn.disabled=true;btn.textContent='⏳ Getting link…';
    try{
      const r=await fetch('/my-paper-trade/share',{method:'POST',headers:{'Content-Type':'application/json'}});
      const d=await r.json();
      if(d.ok&&d.url){
        await navigator.clipboard.writeText(d.url);
        btn.textContent='✅ Link copied!';
        setTimeout(()=>{btn.textContent='🔗 Share Report';btn.disabled=false;},3000);
      }else{btn.textContent='❌ Failed';btn.disabled=false;}
    }catch(e){btn.textContent='❌ Error';btn.disabled=false;}
  }

  function _switchTab2(name,el){
    document.querySelectorAll('.mpt-tabnav2 .mpt-tab2').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.mpt-tabpane2').forEach(p=>p.classList.remove('active'));
    el.classList.add('active');
    const pane=document.getElementById('mpt-pane2-'+name);
    if(pane)pane.classList.add('active');
  }

  async function _triggerAllPicks(btn){
    if(!confirm('Trigger ALL watching picks at current market price?\\nSL and Target will be recalculated from current price using the same % as the original pick.'))return;
    btn.disabled=true;btn.textContent='Triggering…';
    try{
      const r=await fetch('/api/picks/trigger-all',{method:'POST',headers:{'Content-Type':'application/json'}});
      const d=await r.json();
      if(d.ok){
        const lines=d.results&&d.results.length?d.results.map(x=>x.symbol+' @ ₹'+x.price.toFixed(2)+' → T:₹'+x.target+' SL:₹'+x.sl).join('\\n'):'';
        alert('Done! Triggered '+d.triggered+' pick(s).\\n\\n'+(lines||d.message||''));
        _refreshPicks();
      }else{alert('Error: '+d.error);}
    }catch(e){alert('Failed: '+e.message);}finally{btn.disabled=false;btn.textContent='⚡ Trigger All Now';}
  }
  ${eqData.length >= 2 ? `
  (function() {
    var labels = ${JSON.stringify(eqLabels)};
    var data   = ${JSON.stringify(eqData)};
    var color  = data[data.length-1] >= 0 ? '#10b981' : '#ef4444';
    new Chart(document.getElementById('mptEqChart').getContext('2d'), {
      type: 'line',
      data: { labels, datasets: [{ data, borderColor: color,
        backgroundColor: data[data.length-1] >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
        fill: true, tension: 0.35, pointRadius: data.length > 50 ? 0 : 4, borderWidth: 2 }] },
      options: { responsive:true, plugins:{legend:{display:false},tooltip:{mode:'index',intersect:false,callbacks:{label:ctx=>'₹'+ctx.raw}}},
        scales:{x:{display:data.length<=60,ticks:{maxTicksLimit:10}},y:{ticks:{callback:v=>'₹'+v}}} }
    });
  })();` : ""}
  ${monthValues.length >= 1 ? `
  (function() {
    var mlabels = ${JSON.stringify(monthLabels)};
    var mdata   = ${JSON.stringify(monthValues)};
    var mcolors = mdata.map(v => v >= 0 ? 'rgba(16,185,129,0.80)' : 'rgba(239,68,68,0.75)');
    var mBorders = mdata.map(v => v >= 0 ? '#10b981' : '#ef4444');
    var el = document.getElementById('mptMonthChart');
    if (el) new Chart(el.getContext('2d'), {
      type: 'bar',
      data: { labels: mlabels, datasets: [{ data: mdata, backgroundColor: mcolors, borderColor: mBorders, borderWidth: 1.5, borderRadius: 5, borderSkipped: false }] },
      options: { responsive:true, plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>(ctx.raw>=0?'+':'')+'₹'+ctx.raw.toLocaleString('en-IN')}}},
        scales:{x:{grid:{display:false}},y:{ticks:{callback:v=>'₹'+v.toLocaleString('en-IN')},grid:{color:'rgba(128,128,128,0.1)'}}} }
    });
  })();` : ""}
  // Mark onboarding step: first paper trade done
  (function(){
    var p = new URLSearchParams(window.location.search);
    if(p.get('msg')) { if(typeof zsMarkTradeDone==='function') zsMarkTradeDone(); }
  })();
  </script>
</body>
</html>`);
});

// ── POST /my-paper-trade/buy ──────────────────────────────────────────────────
app.post("/my-paper-trade/buy", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  if (!isMarketHours()) {
    res.redirect("/paper-trade?err=" + encodeURIComponent("Paper trading only available during market hours (Mon–Fri 9:15 AM – 3:30 PM IST)")); return;
  }
  const otpReq = (await getSetting("otp_required")) !== "false";
  if (otpReq) {
    const uInfo = await dbAll<{ mobile_verified: number }>("SELECT mobile_verified FROM users WHERE id=?", [userId]);
    if (!uInfo[0]?.mobile_verified) { res.redirect("/verify-mobile?next=/my-paper-trade"); return; }
  }
  const [tradeCount, activeSub] = await Promise.all([countPaperTrades(userId), getActiveSubscription(userId)]);
  const freeLimit = parseInt(await getSetting("paper_free_limit") || "10", 10);
  const isPremium = !!activeSub || req.session.userRole === "premium" || req.session.userRole === "admin";
  if (!isPremium && tradeCount >= freeLimit) {
    res.redirect("/my-paper-trade/upgrade?err=" + encodeURIComponent(`Free limit reached (${freeLimit} trades). Upgrade to Premium for unlimited trades.`)); return;
  }
  const symbol    = ((req.body.symbol as string) || "").toUpperCase().trim();
  const qty       = parseInt(req.body.qty, 10);
  const price     = parseFloat(req.body.price);
  const tradeType = req.body.trade_type === "HOLDING" ? "HOLDING" : "INTRADAY";
  const orderType = req.body.order_type === "LIMIT" ? "LIMIT" : "MARKET";
  const slPct     = parseFloat(req.body.sl_pct);
  const tgtPct    = parseFloat(req.body.target_pct);
  if (!symbol || !Number.isInteger(qty) || qty < 1 || qty > 10000 || isNaN(price) || price <= 0) {
    res.redirect("/my-paper-trade?err=Invalid+buy+parameters"); return;
  }
  const slPrice     = (!isNaN(slPct)  && slPct  > 0) ? parseFloat((price * (1 - slPct  / 100)).toFixed(2)) : null;
  const targetPrice = (!isNaN(tgtPct) && tgtPct > 0) ? parseFloat((price * (1 + tgtPct / 100)).toFixed(2)) : null;
  const stock = await dbAll<{ company_name: string | null }>("SELECT company_name FROM stocks WHERE symbol=?", [symbol]);
  const companyName = stock[0]?.company_name ?? null;
  const result = await paperBuy(userId, symbol, companyName, qty, price, tradeType, slPrice, targetPrice, orderType);
  res.redirect(`/my-paper-trade?${result.ok ? "msg" : "err"}=${encodeURIComponent(result.msg)}`);
});

// ── POST /my-paper-trade/sell ─────────────────────────────────────────────────
app.post("/my-paper-trade/sell", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  if (!isMarketHours()) {
    res.redirect("/my-paper-trade?err=" + encodeURIComponent("Paper trading only available during market hours (Mon–Fri 9:15 AM – 3:30 PM IST)")); return;
  }
  const symbol  = ((req.body.symbol as string) || "").toUpperCase().trim();
  const qty     = parseInt(req.body.qty, 10);
  const price   = parseFloat(req.body.price);
  if (!symbol || !Number.isInteger(qty) || qty < 1 || isNaN(price) || price <= 0) {
    res.redirect("/my-paper-trade?err=Invalid+sell+parameters"); return;
  }
  const result = await paperSell(userId, symbol, qty, price);
  res.redirect(`/my-paper-trade?${result.ok ? "msg" : "err"}=${encodeURIComponent(result.msg)}`);
});

// ── POST /my-paper-trade/reset ────────────────────────────────────────────────
app.post("/my-paper-trade/reset", requireAuth, async (req: Request, res: Response) => {
  await paperReset(req.session.userId!);
  res.redirect("/my-paper-trade?msg=Portfolio+reset+successfully.+Starting+fresh+with+%E2%82%B91%2C00%2C000");
});

// ── GET /my-paper-trade/config ────────────────────────────────────────────────
app.get("/my-paper-trade/config", requireAuth, async (req: Request, res: Response) => {
  const cfg   = await getPaperTradeConfig(req.session.userId!);
  const autoPicks = await getAutoPaperPicks(req.session.userId!);
  const saved = req.query.saved === "1";
  const activeSub = await getActiveSubscription(req.session.userId!);
  const isPremium = !!activeSub || req.session.userRole === "premium" || req.session.userRole === "admin";
  res.send(`<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Paper Trade Settings — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .cfg-card{max-width:480px;margin:40px auto;background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:28px 32px}
    .cfg-title{font-size:1.25rem;font-weight:800;margin-bottom:4px}
    .cfg-sub{color:var(--text-muted);font-size:0.85rem;margin-bottom:24px}
    .cfg-row{display:flex;flex-direction:column;gap:5px;margin-bottom:16px}
    .cfg-label{font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em}
    .cfg-input,.cfg-select{background:var(--input-bg);border:1px solid var(--border);border-radius:7px;padding:8px 12px;color:var(--text);font-size:0.9rem;width:100%;box-sizing:border-box}
    .cfg-btn{background:var(--accent);color:#fff;border:none;border-radius:8px;padding:10px 24px;font-weight:700;cursor:pointer;font-size:0.9rem;margin-top:8px}
    .cfg-ok{background:#10b98122;color:#10b981;border:1px solid #10b98155;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:0.88rem}
    .cfg-toggle-row{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-top:1px solid var(--border);margin-top:8px}
    .cfg-toggle-label{font-size:0.9rem;font-weight:600}
    .cfg-toggle-desc{font-size:0.78rem;color:var(--text-muted);margin-top:2px}
    .cfg-switch{position:relative;display:inline-block;width:44px;height:24px}
    .cfg-switch input{opacity:0;width:0;height:0}
    .cfg-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#374151;border-radius:24px;transition:.3s}
    .cfg-slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.3s}
    input:checked+.cfg-slider{background:#10b981}
    input:checked+.cfg-slider:before{transform:translateX(20px)}
  </style>
</head><body>${nav("my-paper-trade", req)}
<div class="container">
  <div class="cfg-card">
    <div class="cfg-title">⚙️ Paper Trade Settings</div>
    <div class="cfg-sub">Your default settings for new trades. You can override per-trade on the main page.</div>
    ${saved ? `<div class="cfg-ok">✅ Settings saved!</div>` : ""}
    <form method="POST" action="/my-paper-trade/config">
      <div class="cfg-row">
        <label class="cfg-label">Default Trade Type</label>
        <select class="cfg-select" name="trade_type">
          <option value="INTRADAY" ${cfg.trade_type === "INTRADAY" ? "selected" : ""}>Intraday (square off same day)</option>
          <option value="HOLDING"  ${cfg.trade_type === "HOLDING"  ? "selected" : ""}>Holding (positional / multi-day)</option>
        </select>
      </div>
      <div class="cfg-row">
        <label class="cfg-label">Default Quantity</label>
        <input class="cfg-input" type="number" name="default_qty" min="1" max="10000" value="${cfg.default_qty}">
      </div>
      <div class="cfg-row">
        <label class="cfg-label">Default Stop Loss %</label>
        <input class="cfg-input" type="number" name="default_sl_pct" min="0.1" max="50" step="0.1" value="${cfg.default_sl_pct}">
      </div>
      <div class="cfg-row">
        <label class="cfg-label">Default Target %</label>
        <input class="cfg-input" type="number" name="default_tgt_pct" min="0.1" max="200" step="0.1" value="${cfg.default_tgt_pct}">
      </div>
      <div class="cfg-row">
        <label class="cfg-label">Max Open Positions</label>
        <input class="cfg-input" type="number" name="max_positions" min="1" max="50" value="${cfg.max_positions}">
      </div>

      <!-- ── Auto paper trade from Today's Picks ── -->
      <div class="cfg-toggle-row">
        <div>
          <div class="cfg-toggle-label">🔥 Auto-trade Today's Picks ${!isPremium ? '<span style="font-size:0.72rem;background:#f59e0b22;color:#f59e0b;border:1px solid #f59e0b44;border-radius:8px;padding:2px 8px;margin-left:6px">💎 Premium</span>' : ''}</div>
          <div class="cfg-toggle-desc">${isPremium ? 'At 9:15 AM after market opens, automatically buy today\'s picks in your paper portfolio at live price with SL &amp; target set.' : 'Upgrade to Premium to enable automatic trading of Today\'s Picks.'}</div>
        </div>
        ${isPremium
          ? `<label class="cfg-switch" style="margin-left:16px;flex-shrink:0">
          <input type="checkbox" name="auto_paper_picks" value="1" ${autoPicks ? "checked" : ""}>
          <span class="cfg-slider"></span>
        </label>`
          : `<a href="/my-paper-trade/upgrade" style="margin-left:16px;flex-shrink:0;font-size:0.8rem;background:var(--accent);color:#fff;border-radius:8px;padding:6px 14px;text-decoration:none;font-weight:700">🔓 Upgrade</a>`
        }
      </div>

      <button type="submit" class="cfg-btn">Save Settings</button>
    </form>
    <p style="margin-top:16px"><a href="/my-paper-trade" style="color:var(--text-muted);font-size:0.85rem">← Back to Portfolio</a></p>
  </div>
</div>
<script src="/public/js/app.js"></script></body></html>`);
});

app.post("/my-paper-trade/config", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const trade_type      = req.body.trade_type === "HOLDING" ? "HOLDING" : "INTRADAY";
  const default_qty     = Math.max(1, Math.min(10000, parseInt(req.body.default_qty, 10) || 1));
  const default_sl_pct  = Math.max(0.1, Math.min(50,  parseFloat(req.body.default_sl_pct)  || 2));
  const default_tgt_pct = Math.max(0.1, Math.min(200, parseFloat(req.body.default_tgt_pct) || 4));
  const max_positions   = Math.max(1, Math.min(50, parseInt(req.body.max_positions, 10) || 10));
  await savePaperTradeConfig(userId, { trade_type, default_qty, default_sl_pct, default_tgt_pct, max_positions });
  // Only premium/admin can enable auto-trade picks
  const activeSub = await getActiveSubscription(userId);
  const isPremium = !!activeSub || req.session.userRole === "premium" || req.session.userRole === "admin";
  if (isPremium) {
    const auto_paper_picks = req.body.auto_paper_picks === "1";
    await setAutoPaperPicks(userId, auto_paper_picks);
  }
  res.redirect("/my-paper-trade/config?saved=1");
});

// ── POST /api/auto-paper-picks/toggle  (AJAX, requires login) ─────────────────
app.post("/api/auto-paper-picks/toggle", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const activeSub = await getActiveSubscription(userId);
  const isPremium = !!activeSub || req.session.userRole === "premium" || req.session.userRole === "admin";
  if (!isPremium) { res.json({ ok: false, msg: "Premium required" }); return; }
  const enabled = req.body.enabled === true || req.body.enabled === "true" || req.body.enabled === 1;
  await setAutoPaperPicks(userId, enabled);
  res.json({ ok: true, enabled });
});

// ── GET /my-paper-trade/upgrade ───────────────────────────────────────────────
app.get("/my-paper-trade/upgrade", requireAuth, async (req: Request, res: Response) => {
  // If paper trade is no longer premium-only, redirect straight to portfolio
  const premiumOnly = (await getSetting("paper_trade_premium_only")) === "true";
  if (!premiumOnly) { res.redirect("/my-paper-trade"); return; }

  const err       = esc(req.query.err as string || "");
  const activeSub = await getActiveSubscription(req.session.userId!);
  const isPremium = !!activeSub || req.session.userRole === "premium" || req.session.userRole === "admin";
  const freeLimit = await getSetting("paper_free_limit") || "10";
  res.send(`<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Upgrade — Paper Trade Premium</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .upg-card{max-width:520px;margin:40px auto;background:var(--card-bg);border:1px solid var(--border);border-radius:16px;padding:32px 36px;text-align:center}
    .upg-icon{font-size:2.5rem;margin-bottom:12px}
    .upg-title{font-size:1.5rem;font-weight:800;margin-bottom:6px}
    .upg-sub{color:var(--text-muted);font-size:0.9rem;margin-bottom:24px}
    .upg-err{background:#ef444422;color:#ef4444;border:1px solid #ef444455;border-radius:8px;padding:10px 14px;margin-bottom:18px;font-size:0.88rem}
    .upg-feats{text-align:left;background:var(--bg2);border-radius:10px;padding:16px 20px;margin-bottom:24px}
    .upg-feat{padding:6px 0;font-size:0.9rem;border-bottom:1px solid var(--border)}
    .upg-feat:last-child{border-bottom:none}
    .upg-price{font-size:1.8rem;font-weight:800;color:var(--accent);margin-bottom:4px}
    .upg-period{font-size:0.82rem;color:var(--text-muted);margin-bottom:20px}
    .upg-btn{display:inline-block;background:var(--accent);color:#fff;border:none;border-radius:10px;padding:12px 32px;font-weight:700;font-size:1rem;cursor:pointer;text-decoration:none}
    .upg-ok{background:#10b98122;color:#10b981;border:1px solid #10b98155;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-weight:700}
  </style>
</head><body>${nav("my-paper-trade", req)}
<div class="container">
  <div class="upg-card">
    <div class="upg-icon">👑</div>
    <div class="upg-title">Paper Trade Premium</div>
    <div class="upg-sub">Unlock unlimited paper trades every month and advanced features.</div>
    ${err ? `<div class="upg-err">⚠️ ${err}</div>` : ""}
    ${isPremium ? `<div class="upg-ok">✅ You are already on Premium! Enjoy unlimited paper trades.</div>` : ""}
    <div class="upg-feats">
      <div class="upg-feat">✅ <strong>Free plan:</strong> ${esc(freeLimit)} paper trades total</div>
      <div class="upg-feat">👑 <strong>Premium:</strong> Unlimited trades per month</div>
      <div class="upg-feat">📈 All trade types — Intraday &amp; Holding</div>
      <div class="upg-feat">📊 Full trade history &amp; P&amp;L analytics</div>
      <div class="upg-feat">🔔 Market hours enforcement (9:15 AM – 3:30 PM IST)</div>
      <div class="upg-feat">⚙️ Custom strategy configurations (SL%, Target%, Max positions)</div>
    </div>
    <div class="upg-price">₹499<span style="font-size:1rem;font-weight:400">/month</span></div>
    <div class="upg-period">Monthly subscription — cancel anytime</div>
    ${!isPremium ? `<a href="/premium" class="upg-btn">👑 Subscribe Now →</a>` : `<a href="/my-paper-trade" class="upg-btn">← Back to Portfolio</a>`}
    <p style="font-size:0.82rem;color:var(--text-muted);margin-top:16px">Have questions? <a href="/contact">Contact us</a></p>
  </div>
</div>
<script src="/public/js/app.js"></script></body></html>`);
});

// ── GET /api/top-gainers — public top movers ─────────────────────────────────
app.get("/api/top-gainers", async (_req: Request, res: Response) => {
  res.set("Access-Control-Allow-Origin", "*");
  const gainers = await dbAll<{ symbol: string; company_name: string | null; price: number | null; change_pct: number | null }>(
    `SELECT s.symbol, s.company_name, p.price, p.change_pct
     FROM stocks s JOIN prices p ON p.symbol=s.symbol
     WHERE p.change_pct IS NOT NULL AND p.price IS NOT NULL
     ORDER BY p.change_pct DESC LIMIT 10`
  );
  const losers = await dbAll<{ symbol: string; company_name: string | null; price: number | null; change_pct: number | null }>(
    `SELECT s.symbol, s.company_name, p.price, p.change_pct
     FROM stocks s JOIN prices p ON p.symbol=s.symbol
     WHERE p.change_pct IS NOT NULL AND p.price IS NOT NULL
     ORDER BY p.change_pct ASC LIMIT 10`
  );
  res.json({ gainers, losers, updatedAt: new Date().toISOString() });
});

// ── GET /widget/top-gainers — embeddable iframe widget ────────────────────────
app.get("/widget/top-gainers", async (_req: Request, res: Response) => {
  const gainers = await dbAll<{ symbol: string; company_name: string | null; price: number | null; change_pct: number | null }>(
    `SELECT s.symbol, s.company_name, p.price, p.change_pct
     FROM stocks s JOIN prices p ON p.symbol=s.symbol
     WHERE p.change_pct IS NOT NULL AND p.price IS NOT NULL
     ORDER BY p.change_pct DESC LIMIT 8`
  );
  const buildRow = (r: { symbol: string; company_name: string | null; price: number | null; change_pct: number | null }) => {
    const clr = (r.change_pct ?? 0) >= 0 ? "#10b981" : "#ef4444";
    return `<tr>
      <td><strong>${esc(r.symbol)}</strong>${r.company_name ? `<br><span style="font-size:.62rem;color:#888">${esc(r.company_name.slice(0,24))}</span>` : ""}</td>
      <td style="text-align:right">₹${r.price != null ? r.price.toFixed(2) : "—"}</td>
      <td style="text-align:right;color:${clr};font-weight:700">${r.change_pct != null ? (r.change_pct >= 0 ? "+" : "") + r.change_pct.toFixed(2) + "%" : "—"}</td>
    </tr>`;
  };
  res.set("X-Frame-Options", "ALLOWALL");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Top Gainers — ZeroScreen</title>
  <meta http-equiv="refresh" content="300">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;background:#0f172a;color:#e2e8f0;padding:10px}
    h2{font-size:.82rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #1e293b}
    table{width:100%;border-collapse:collapse}
    td{padding:6px 4px;border-bottom:1px solid #1e293b;font-size:.8rem}
    tr:last-child td{border-bottom:none}
    .footer{margin-top:10px;text-align:center;font-size:.65rem;color:#475569}
    .footer a{color:#3b82f6;text-decoration:none}
  </style>
</head>
<body>
  <h2>🚀 Top Gainers Today</h2>
  <table>${gainers.map(buildRow).join("") || '<tr><td colspan="3" style="padding:12px;text-align:center;color:#64748b">No data available</td></tr>'}</table>
  <div class="footer">Live NSE data · <a href="${BASE_URL}" target="_blank">ZeroScreen</a></div>
</body></html>`);
});

// ── GET /api/price/:symbol ─ live price for paper trade buy form ──────────────
app.get("/api/price/:symbol", async (req: Request, res: Response) => {
  const symbol = req.params.symbol.toUpperCase().trim();
  const row = await dbAll<{ price: number | null }>("SELECT price FROM prices WHERE symbol=?", [symbol]);
  res.json({ price: row[0]?.price ?? null });
});

// ── POST /my-paper-trade/share — get or create shareable report link ─────────
app.post("/my-paper-trade/share", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const reportId = await getOrCreateReport(userId);
  res.json({ ok: true, url: `${BASE_URL}/share/${reportId}` });
});

// ── GET /share/:reportId — public shareable paper trade report ────────────────
app.get("/share/:reportId([a-f0-9]{24})", async (req: Request, res: Response) => {
  const row = await getReportOwner(req.params.reportId);
  if (!row) { res.status(404).send("Report not found."); return; }
  const userId = row.user_id;
  const [userRows, port, sellTrades, allTrades] = await Promise.all([
    dbAll<{ name: string; created_at: string }>("SELECT name, created_at FROM users WHERE id=?", [userId]),
    getPaperPortfolio(userId),
    getPaperTrades(userId),
    getPaperTrades(userId),
  ]);
  const user = userRows[0];
  if (!user) { res.status(404).send("User not found."); return; }
  const closed = sellTrades.filter((t: any) => t.action === "SELL" || t.pnl !== null);
  const totalPnl = closed.reduce((s: number, t: any) => s + (t.pnl || 0), 0);
  const wins = closed.filter((t: any) => (t.pnl || 0) > 0).length;
  const losses = closed.filter((t: any) => (t.pnl || 0) < 0).length;
  const winRate = closed.length ? Math.round(wins / closed.length * 100) : 0;
  const balance = port?.balance ?? 100000;
  const netReturnPct = ((totalPnl / 100000) * 100).toFixed(2);
  const pnlColor = totalPnl >= 0 ? "#10b981" : "#ef4444";
  const shareUrl = `${BASE_URL}/share/${req.params.reportId}`;
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(user.name)}'s Paper Trade Report — ZeroScreen</title>
  ${seoMeta({
    title: `${esc(user.name)}'s Paper Trade Report`,
    description: `Paper trade stats: ₹${balance.toLocaleString("en-IN")} balance · ${closed.length} trades · ${winRate}% win rate · Net return ${netReturnPct}%`,
    url: shareUrl,
    type: "profile",
  })}
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .sr-wrap{max-width:600px;margin:40px auto;padding:0 16px 60px}
    .sr-card{background:var(--card-bg);border:1px solid var(--border);border-radius:16px;padding:28px 28px 24px;margin-bottom:16px}
    .sr-name{font-size:1.3rem;font-weight:800;margin-bottom:4px}
    .sr-sub{font-size:.82rem;color:var(--text-muted)}
    .sr-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:20px}
    .sr-kpi{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px}
    .sr-kpi-label{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:4px}
    .sr-kpi-val{font-size:1.3rem;font-weight:800}
    .sr-cta{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}
    .sr-cta a{flex:1;text-align:center;padding:10px;border-radius:10px;font-weight:700;font-size:.9rem;text-decoration:none}
    .sr-cta-primary{background:var(--accent);color:#fff}
    .sr-cta-sec{background:var(--bg2);color:var(--text);border:1px solid var(--border)}
    .sr-powered{text-align:center;font-size:.74rem;color:var(--text-muted);margin-top:28px}
  </style>
</head>
<body>
  ${nav("", req)}
  <div class="sr-wrap">
    <div class="sr-card">
      <div class="sr-name">📊 ${esc(user.name)}'s Paper Trade Report</div>
      <div class="sr-sub">Member since ${new Date(user.created_at).toLocaleDateString("en-IN",{month:"short",year:"numeric"})} · Paper trading on ZeroScreen</div>
      <div class="sr-kpis">
        <div class="sr-kpi">
          <div class="sr-kpi-label">Portfolio Balance</div>
          <div class="sr-kpi-val" style="color:var(--accent)">₹${balance.toLocaleString("en-IN",{maximumFractionDigits:0})}</div>
        </div>
        <div class="sr-kpi">
          <div class="sr-kpi-label">Net Return</div>
          <div class="sr-kpi-val" style="color:${pnlColor}">${totalPnl >= 0 ? "+" : ""}${netReturnPct}%</div>
        </div>
        <div class="sr-kpi">
          <div class="sr-kpi-label">Trades Completed</div>
          <div class="sr-kpi-val">${closed.length}</div>
        </div>
        <div class="sr-kpi">
          <div class="sr-kpi-label">Win Rate</div>
          <div class="sr-kpi-val" style="color:${winRate >= 50 ? '#10b981' : '#ef4444'}">${winRate}%</div>
        </div>
        <div class="sr-kpi">
          <div class="sr-kpi-label">Wins / Losses</div>
          <div class="sr-kpi-val"><span style="color:#10b981">${wins}</span> / <span style="color:#ef4444">${losses}</span></div>
        </div>
        <div class="sr-kpi">
          <div class="sr-kpi-label">Total P&L</div>
          <div class="sr-kpi-val" style="color:${pnlColor}">${totalPnl >= 0 ? "+" : ""}₹${Math.abs(totalPnl).toLocaleString("en-IN",{maximumFractionDigits:0})}</div>
        </div>
      </div>
      <div class="sr-cta">
        <a href="/" class="sr-cta-primary">Try Paper Trading Free →</a>
        <button onclick="navigator.clipboard.writeText('${shareUrl}').then(()=>{this.textContent='✅ Copied!';setTimeout(()=>this.textContent='🔗 Copy Link',2000)})" class="sr-cta-sec" style="border-radius:10px;cursor:pointer;font-size:.9rem;font-weight:700">🔗 Copy Link</button>
      </div>
    </div>
    <div class="sr-powered">Powered by <a href="/" style="color:var(--accent);font-weight:700">ZeroScreen</a> — Free NSE Paper Trading &amp; Stock Screener</div>
  </div>
<script src="/public/js/app.js"></script></body></html>`);
});

// ── GET /my-paper-trade/export — CSV download of trade history ────────────────
app.get("/my-paper-trade/export", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const trades = await getPaperTrades(userId);
  const header = ["Date","Symbol","Company","Action","Qty","Price (₹)","Total (₹)","P&L (₹)","P&L (%)","Balance After (₹)","Trade Type"];
  const rows = trades.map((t: PaperTrade) => [
    t.traded_at || "",
    t.symbol,
    (t.company_name || "").replace(/,/g, " "),
    t.action,
    t.qty,
    t.price.toFixed(2),
    t.total.toFixed(2),
    t.pnl != null ? t.pnl.toFixed(2) : "",
    t.pnl_pct != null ? t.pnl_pct.toFixed(2) : "",
    t.balance_after.toFixed(2),
    (t as any).trade_type || "INTRADAY",
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const filename = `paper-trade-history-${new Date().toISOString().slice(0,10)}.csv`;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

// ── GET /my-paper-trade/print — print-friendly trade history ─────────────────
app.get("/my-paper-trade/print", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const [port, trades] = await Promise.all([
    getPaperPortfolio(userId),
    getPaperTrades(userId, 500),
  ]);
  const user = await getUserById(userId);
  const startBal = userIsPremium(req) ? 1000000 : 100000;
  const netPnl = port.balance - startBal;
  const netPct = ((netPnl / startBal) * 100).toFixed(2);
  const wins   = trades.filter((t: PaperTrade) => (t.pnl ?? 0) > 0).length;
  const losses = trades.filter((t: PaperTrade) => (t.pnl ?? 0) < 0).length;
  const totalPnl = trades.reduce((s: number, t: PaperTrade) => s + (t.pnl ?? 0), 0);
  const today  = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  const rows = trades.map((t: PaperTrade) => `
  <tr>
    <td>${(t.traded_at || "").slice(0, 10)}</td>
    <td><strong>${esc(t.symbol)}</strong><br><small>${esc(t.company_name || "")}</small></td>
    <td>${t.action}</td>
    <td>${t.qty}</td>
    <td style="text-align:right">₹${Number(t.price).toFixed(2)}</td>
    <td style="text-align:right">₹${Number(t.total).toFixed(2)}</td>
    <td style="text-align:right;color:${(t.pnl ?? 0) >= 0 ? "#059669" : "#dc2626"}">${t.pnl != null ? (t.pnl >= 0 ? "+" : "") + "₹" + t.pnl.toFixed(2) : "—"}</td>
    <td style="text-align:right;color:${(t.pnl_pct ?? 0) >= 0 ? "#059669" : "#dc2626"}">${t.pnl_pct != null ? (t.pnl_pct >= 0 ? "+" : "") + t.pnl_pct.toFixed(2) + "%" : "—"}</td>
  </tr>`).join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Paper Trade Report — ${esc(user?.name ?? "ZeroScreen")}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #0a0e27; margin: 0; padding: 24px; }
    h1  { font-size: 1.4rem; margin: 0 0 4px; }
    .meta { color: #5b6490; font-size: .82rem; margin-bottom: 20px; }
    .kpis { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
    .kpi  { background: #f0f4ff; border: 1px solid #dde3f5; border-radius: 10px; padding: 12px 18px; min-width: 120px; }
    .kpi-lbl { font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; color: #5b6490; margin-bottom: 4px; }
    .kpi-val { font-size: 1.2rem; font-weight: 800; color: #0a0e27; font-variant-numeric: tabular-nums; }
    .kpi-val.pos { color: #059669; }
    .kpi-val.neg { color: #dc2626; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead th { background: #0a0e27; color: #fff; padding: 8px 10px; text-align: left; font-size: .7rem; text-transform: uppercase; letter-spacing: .04em; }
    tbody tr:nth-child(even) { background: #f8faff; }
    tbody td { padding: 7px 10px; border-bottom: 1px solid #eee; vertical-align: middle; }
    .footer { margin-top: 24px; font-size: .75rem; color: #8e97c0; text-align: center; }
    @media print { @page { margin: 15mm; } }
  </style>
</head>
<body>
  <h1>📊 Paper Trade Report</h1>
  <div class="meta">Generated for <strong>${esc(user?.name ?? "—")}</strong> · ${today} · ZeroScreen (zeroscreen.in)</div>
  <div class="kpis">
    <div class="kpi"><div class="kpi-lbl">Balance</div><div class="kpi-val">₹${Number(port.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div></div>
    <div class="kpi"><div class="kpi-lbl">Net P&L</div><div class="kpi-val ${netPnl >= 0 ? "pos" : "neg"}">${netPnl >= 0 ? "+" : ""}₹${Math.abs(netPnl).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div></div>
    <div class="kpi"><div class="kpi-lbl">Return</div><div class="kpi-val ${netPnl >= 0 ? "pos" : "neg"}">${netPnl >= 0 ? "+" : ""}${netPct}%</div></div>
    <div class="kpi"><div class="kpi-lbl">Trades</div><div class="kpi-val">${trades.length}</div></div>
    <div class="kpi"><div class="kpi-lbl">Wins</div><div class="kpi-val pos">${wins}</div></div>
    <div class="kpi"><div class="kpi-lbl">Losses</div><div class="kpi-val neg">${losses}</div></div>
    <div class="kpi"><div class="kpi-lbl">Total P&L</div><div class="kpi-val ${totalPnl >= 0 ? "pos" : "neg"}">${totalPnl >= 0 ? "+" : ""}₹${totalPnl.toFixed(2)}</div></div>
  </div>
  <table>
    <thead><tr>
      <th>Date</th><th>Stock</th><th>Action</th><th>Qty</th>
      <th style="text-align:right">Price</th><th style="text-align:right">Total</th>
      <th style="text-align:right">P&amp;L</th><th style="text-align:right">P&amp;L %</th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="8" style="text-align:center;padding:20px;color:#8e97c0">No trades yet</td></tr>`}</tbody>
  </table>
  <div class="footer">ZeroScreen · Free NSE Paper Trading Platform · <em>Not investment advice</em></div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`);
});

// ── GET /strategies ────────────────────────────────────────────────────────────
app.get("/strategies", featureGate("feature_strategies", "Strategies"), premiumGate("strategies_premium_only", "Strategies"), (req: Request, res: Response) => {
  const backtest: any = readBotJSON("5year-backtest-result.json", {});
  const monthly: Record<string, any> = backtest.monthly || {};
  const mKeys = Object.keys(monthly).sort();

  // Derive key stats
  const allBbTrades = mKeys.reduce((s, k) => s + (monthly[k].bbTrades ?? 0), 0);
  const allBbWins   = mKeys.reduce((s, k) => s + (monthly[k].bbWins   ?? 0), 0);
  const allRcTrades = mKeys.reduce((s, k) => s + (monthly[k].rcTrades ?? 0), 0);
  const allRcWins   = mKeys.reduce((s, k) => s + (monthly[k].rcWins   ?? 0), 0);
  const bbWR = allBbTrades > 0 ? ((allBbWins / allBbTrades) * 100).toFixed(1) : "—";
  const rcWR = allRcTrades > 0 ? ((allRcWins / allRcTrades) * 100).toFixed(1) : "—";
  const bbPnl = backtest.totals?.bodyBreakout ?? 0;
  const rcPnl = backtest.totals?.rcConfirm    ?? 0;
  const totalPnl = bbPnl + rcPnl;

  const profitMonths = mKeys.filter(k => (monthly[k].bbTotal + monthly[k].rcTotal) > 0).length;
  const monthPct = mKeys.length > 0 ? ((profitMonths / mKeys.length) * 100).toFixed(0) : "—";

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Strategies — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
</head>
<body class="page-theme-strategies">
  ${nav("strategies", req)}

  <div class="container" style="max-width:980px">

    <!-- HEADER -->
    <div class="strat-header">
      <h1 class="strat-title">⚙️ Trading Strategies</h1>
      <p class="strat-sub">BANKNIFTY Options · Automated intraday trading · Strategy logic is proprietary and not disclosed</p>
    </div>

    <!-- ACTIVE STRATEGY HERO -->
    <div class="strat-hero">
      <div class="strat-hero-badge">ACTIVE</div>
      <div class="strat-hero-name">Proprietary Intraday Strategy</div>
      <div class="strat-hero-desc">
        A fully automated intraday options trading system on BANKNIFTY.
        Built on years of backtesting and live market refinement — strategy logic and signal conditions are not disclosed.
      </div>
      <div class="strat-hero-stats">
        <div class="strat-hero-stat"><span class="strat-hs-val">+${parseFloat(totalPnl.toFixed(0)).toLocaleString("en-IN")}</span><span class="strat-hs-label">5-Year PnL (pts)</span></div>
        <div class="strat-hero-stat"><span class="strat-hs-val">${mKeys.length}</span><span class="strat-hs-label">Months Backtested</span></div>
        <div class="strat-hero-stat"><span class="strat-hs-val">${monthPct}%</span><span class="strat-hs-label">Profitable Months</span></div>
        <div class="strat-hero-stat"><span class="strat-hs-val">${backtest.tradingDays ?? "—"}</span><span class="strat-hs-label">Trading Days</span></div>
      </div>
    </div>

    <!-- BENEFITS -->
    <div class="strat-section-label">Why It Works</div>
    <div class="strat-modes-grid">

      <div class="strat-mode-card">
        <div class="strat-mode-header">
          <span class="strat-mode-icon">📈</span>
          <div>
            <div class="strat-mode-name">Consistent Edge</div>
            <div class="strat-mode-type">Backed by 5 years of data</div>
          </div>
        </div>
        <p class="strat-mode-desc">
          Backtested across 1,241 trading days (2021–2026) covering multiple bull and bear market cycles.
          Demonstrates consistent profitability with ${monthPct}% of months ending in positive territory.
        </p>
        <div class="strat-mode-stats">
          <div class="strat-ms"><span class="strat-ms-val strat-green">+${parseFloat(totalPnl.toFixed(0)).toLocaleString("en-IN")} pts</span><span class="strat-ms-label">5-Year PnL</span></div>
          <div class="strat-ms"><span class="strat-ms-val">${profitMonths} / ${mKeys.length}</span><span class="strat-ms-label">Profitable Months</span></div>
          <div class="strat-ms"><span class="strat-ms-val">${backtest.tradingDays ?? "—"}</span><span class="strat-ms-label">Days Tested</span></div>
        </div>
      </div>

      <div class="strat-mode-card">
        <div class="strat-mode-header">
          <span class="strat-mode-icon">🤖</span>
          <div>
            <div class="strat-mode-name">Fully Automated</div>
            <div class="strat-mode-type">Zero manual intervention</div>
          </div>
        </div>
        <p class="strat-mode-desc">
          Runs end-to-end without human involvement — from signal generation to order placement and exit management.
          Eliminates emotional bias and execution delay, trading with mechanical precision every session.
        </p>
        <div class="strat-mode-stats">
          <div class="strat-ms"><span class="strat-ms-val">9:15 AM</span><span class="strat-ms-label">Market Open</span></div>
          <div class="strat-ms"><span class="strat-ms-val">3:30 PM</span><span class="strat-ms-label">Auto Square-off</span></div>
          <div class="strat-ms"><span class="strat-ms-val">BANKNIFTY</span><span class="strat-ms-label">Instrument</span></div>
        </div>
      </div>

      <div class="strat-mode-card">
        <div class="strat-mode-header">
          <span class="strat-mode-icon">🛡️</span>
          <div>
            <div class="strat-mode-name">Built-in Risk Control</div>
            <div class="strat-mode-type">Capital protection first</div>
          </div>
        </div>
        <p class="strat-mode-desc">
          Hard limits on daily loss, trade count, and position size prevent runaway drawdowns.
          Every trade has a predefined stop-loss. The system stops trading automatically if daily limits are hit.
        </p>
        <div class="strat-mode-stats">
          <div class="strat-ms"><span class="strat-ms-val">100 pts</span><span class="strat-ms-label">Per-Trade SL</span></div>
          <div class="strat-ms"><span class="strat-ms-val">5</span><span class="strat-ms-label">Max Trades/Day</span></div>
          <div class="strat-ms"><span class="strat-ms-val">1%</span><span class="strat-ms-label">Risk/Trade</span></div>
        </div>
      </div>

      <div class="strat-mode-card">
        <div class="strat-mode-header">
          <span class="strat-mode-icon">🎯</span>
          <div>
            <div class="strat-mode-name">Dual Signal Confirmation</div>
            <div class="strat-mode-type">Two independent models</div>
          </div>
        </div>
        <p class="strat-mode-desc">
          Uses two independent proprietary signal generators that cross-validate before placing trades.
          Each model targets different market conditions, giving the strategy broad adaptability across trending and ranging sessions.
        </p>
        <div class="strat-mode-stats">
          <div class="strat-ms"><span class="strat-ms-val">2</span><span class="strat-ms-label">Signal Models</span></div>
          <div class="strat-ms"><span class="strat-ms-val">CE + PE</span><span class="strat-ms-label">Both Directions</span></div>
          <div class="strat-ms"><span class="strat-ms-val">Options</span><span class="strat-ms-label">Instrument Type</span></div>
        </div>
      </div>

    </div>

    <!-- SCREENER STRATEGIES -->
    <div class="strat-section-label">📋 Screener Presets</div>
    <p class="strat-preset-intro">Pre-built stock screening filters for different investment styles.</p>
    <div class="strat-preset-grid">
      ${STRATEGIES.map(s => `
      <a href="/?${strategyParams(s)}" class="strat-preset-card">
        <span class="strat-preset-icon">${s.icon}</span>
        <div>
          <div class="strat-preset-name">${s.label}</div>
          <div class="strat-preset-desc">${s.desc}</div>
        </div>
      </a>`).join("")}
    </div>

    <footer class="site-footer"><span>© 2026 ZeroScreen · Strategy logic is proprietary · Past backtest performance does not guarantee future results</span></footer>
  </div>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
});

// ── GET /dashboard ─────────────────────────────────────────────────────────────
app.get("/dashboard", featureGate("feature_dashboard", "Dashboard"), premiumGate("dashboard_premium_only", "Dashboard"), async (req: Request, res: Response) => {
  const trades: any[] = readBotJSON("trades.json", []);
  const backtest: any = readBotJSON("5year-backtest-result.json", {});
  const analytics = computeAnalytics(trades);

  // Build equity curve labels (trade numbers)
  const eqLabels = analytics.equityCurve.map((_: any, i: number) => `#${i + 1}`);

  // Build monthly backtest data
  const monthly: Record<string, any> = backtest.monthly || {};
  const mKeys = Object.keys(monthly).sort();
  const mLabels = mKeys.map(k => {
    const [y, m] = k.split("-");
    const d = new Date(parseInt(y), parseInt(m) - 1, 1);
    return d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
  });
  const bbData  = mKeys.map(k => parseFloat((monthly[k].bbTotal ?? 0).toFixed(1)));
  const rcData  = mKeys.map(k => parseFloat((monthly[k].rcTotal ?? 0).toFixed(1)));
  const combData = mKeys.map(k => parseFloat(((monthly[k].bbTotal ?? 0) + (monthly[k].rcTotal ?? 0)).toFixed(1)));
  const combColors = combData.map((v: number) => v >= 0 ? "rgba(16,185,129,0.7)" : "rgba(239,68,68,0.7)");

  // Backtest totals
  const btTotal = (backtest.totals?.bodyBreakout ?? 0) + (backtest.totals?.rcConfirm ?? 0);
  const btDays = backtest.tradingDays ?? 0;
  const btFrom = backtest.period?.from ?? "";
  const btTo   = backtest.period?.to ?? "";

  // All monthly win rates
  const allBbTrades = mKeys.reduce((s, k) => s + (monthly[k].bbTrades ?? 0), 0);
  const allBbWins   = mKeys.reduce((s, k) => s + (monthly[k].bbWins ?? 0), 0);
  const allRcTrades = mKeys.reduce((s, k) => s + (monthly[k].rcTrades ?? 0), 0);
  const allRcWins   = mKeys.reduce((s, k) => s + (monthly[k].rcWins ?? 0), 0);
  const bbWinRate = allBbTrades > 0 ? ((allBbWins / allBbTrades) * 100).toFixed(1) : "—";
  const rcWinRate = allRcTrades > 0 ? ((allRcWins / allRcTrades) * 100).toFixed(1) : "—";

  // ── DASHBOARD (full view for everyone) ─────────────────────────────────────
  if (false) {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Dashboard — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>
</head>
<body class="page-theme-dashboard">
  ${nav("dashboard", req)}
  <div class="container" style="max-width:1100px">
    <div class="dash-header">
      <div>
        <h1 class="dash-title">📊 Trading Dashboard</h1>
        <p class="dash-sub">BANKNIFTY Options Bot · Live performance analytics</p>
      </div>
    </div>
    <div class="dash-kpi-row">
      <div class="dash-kpi"><span class="dash-kpi-label">All-Time PnL</span><span class="dash-kpi-val ${analytics.allTime.pnl>=0?'sig-green':'sig-red'}">${analytics.allTime.pnl>=0?'+':''}${analytics.allTime.pnl.toFixed(1)} pts</span></div>
      <div class="dash-kpi"><span class="dash-kpi-label">Total Trades</span><span class="dash-kpi-val">${analytics.allTime.trades}</span></div>
      <div class="dash-kpi"><span class="dash-kpi-label">Win Rate</span><span class="dash-kpi-val">${analytics.allTime.winRate}%</span></div>
      <div class="dash-kpi"><span class="dash-kpi-label">Today PnL</span><span class="dash-kpi-val ${analytics.today.pnl>=0?'sig-green':'sig-red'}">${analytics.today.pnl>=0?'+':''}${analytics.today.pnl} pts</span></div>
      <div class="dash-kpi"><span class="dash-kpi-label">Max Drawdown</span><span class="dash-kpi-val sig-yellow">${analytics.allTime.maxDD} pts</span></div>
    </div>
    <div class="dash-section-title">📈 Live Equity Curve</div>
    ${analytics.equityCurve.length === 0 ? `
    <div class="dash-empty-chart"><span>📉</span><p>No trades recorded yet. The equity curve will appear here once the bot starts trading.</p></div>` : `
    <div class="dash-chart-wrap"><canvas id="eqChart"></canvas></div>`}

    <!-- Upgrade CTA -->
    <div class="upgrade-banner upgrade-banner-dashboard">
      <div class="upgrade-banner-icon">📊</div>
      <div class="upgrade-banner-content">
        <strong>Unlock 5-Year Backtest Analytics</strong>
        <p>See full monthly breakdown, Model A vs Model B performance, all 60 months of data — exclusively for Premium members.</p>
      </div>
      <a href="/premium" class="btn-upgrade">Upgrade — ₹499/mo</a>
    </div>

    <!-- Preview (blurred) -->
    <div class="dash-section-title">📅 Monthly Backtest <span class="sig-locked-label">🔒 Premium</span></div>
    <div class="dash-locked-preview">
      <div class="dash-locked-overlay">
        <div class="dash-locked-msg">
          <span style="font-size:32px">🔒</span>
          <h3>5-Year Backtest Breakdown</h3>
          <p>Monthly PnL, Model A vs Model B charts, detailed trade stats — available with Premium.</p>
          <a href="/premium" class="btn-upgrade">Get Premium Access</a>
        </div>
      </div>
      <div class="dash-locked-blur">
        <div class="dash-kpi-row" style="margin-bottom:16px">
          <div class="dash-kpi"><span class="dash-kpi-label">5Y Combined PnL</span><span class="dash-kpi-val">••••</span></div>
          <div class="dash-kpi"><span class="dash-kpi-label">Model A Win Rate</span><span class="dash-kpi-val">••••</span></div>
          <div class="dash-kpi"><span class="dash-kpi-label">Model B Win Rate</span><span class="dash-kpi-val">••••</span></div>
          <div class="dash-kpi"><span class="dash-kpi-label">Trading Days</span><span class="dash-kpi-val">••••</span></div>
        </div>
        <div style="height:200px;background:var(--card-bg);border-radius:12px;margin-bottom:16px"></div>
        <div style="height:160px;background:var(--card-bg);border-radius:12px"></div>
      </div>
    </div>
  </div>
  <script src="/public/js/app.js"></script>
  ${analytics.equityCurve.length > 0 ? `<script>
  (function(){
    const ctx = document.getElementById('eqChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ${JSON.stringify(eqLabels)},
        datasets: [{ label: 'Equity (pts)', data: ${JSON.stringify(analytics.equityCurve)}, borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.1)', fill: true, tension: 0.3, pointRadius: 0 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => v + ' pts' } } } }
    });
  })();
  </script>` : ""}
</body>
</html>`);
    return;
  }

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Dashboard — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>
</head>
<body class="page-theme-dashboard">
  ${nav("dashboard", req)}
  <div class="container" style="max-width:1100px">
    <div class="dash-hero">
      <div class="dash-hero-inner">
        <div class="dash-hero-left">
          <div class="dash-hero-eyebrow"><span class="dash-live-dot"></span> LIVE · BANKNIFTY OPTIONS</div>
          <h1 class="dash-hero-title">Trading Dashboard</h1>
          <p class="dash-hero-sub">Proprietary dual-model intraday strategy · Fully automated 9:15–3:30 IST</p>
        </div>
        <div class="dash-hero-right">
          <div class="dash-hero-stat-box">
            <div class="dash-hero-stat-label">Backtest Period</div>
            <div class="dash-hero-stat-val">${btFrom} → ${btTo}</div>
          </div>
          <div class="dash-hero-stat-box">
            <div class="dash-hero-stat-label">Trading Days</div>
            <div class="dash-hero-stat-val">${btDays}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- LIVE STATS -->
    <div class="dash-section-label"><span class="dash-sl-dot dash-sl-red"></span>Live Bot Performance</div>
    <div class="dash-kpi-grid">
      <div class="dash-kpi">
        <div class="dash-kpi-label">All-Time PnL</div>
        <div class="dash-kpi-val ${analytics.allTime.pnl >= 0 ? "dash-green" : "dash-red"}">${analytics.allTime.pnl >= 0 ? "+" : ""}${analytics.allTime.pnl} pts</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Total Trades</div>
        <div class="dash-kpi-val">${analytics.allTime.trades}</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Win Rate</div>
        <div class="dash-kpi-val dash-green">${analytics.allTime.winRate}%</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Wins / Losses</div>
        <div class="dash-kpi-val"><span class="dash-green">${analytics.allTime.wins}</span> / <span class="dash-red">${analytics.allTime.losses}</span></div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Max Drawdown</div>
        <div class="dash-kpi-val dash-red">${analytics.allTime.maxDD} pts</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Today PnL</div>
        <div class="dash-kpi-val ${analytics.today.pnl >= 0 ? "dash-green" : "dash-red"}">${analytics.today.pnl >= 0 ? "+" : ""}${analytics.today.pnl} pts</div>
      </div>
    </div>

    <!-- EQUITY CURVE -->
    <div class="dash-section-label"><span class="dash-sl-dot dash-sl-green"></span>Live Equity Curve</div>
    <div class="dash-chart-card">
      ${analytics.equityCurve.length < 2
        ? `<div class="dash-empty">No trades yet — equity curve will appear once the bot executes trades.</div>`
        : `<canvas id="eqChart" height="90"></canvas>`
      }
    </div>

    <!-- BACKTEST SECTION -->
    <div class="dash-section-label"><span class="dash-sl-dot dash-sl-purple"></span>5-Year Backtest (2021–2026)</div>
    <div class="dash-kpi-grid">
      <div class="dash-kpi">
        <div class="dash-kpi-label">Total Backtest PnL</div>
        <div class="dash-kpi-val dash-green">+${parseFloat(btTotal.toFixed(0)).toLocaleString("en-IN")} pts</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Model A PnL</div>
        <div class="dash-kpi-val dash-green">+${parseFloat((backtest.totals?.bodyBreakout ?? 0).toFixed(0)).toLocaleString("en-IN")} pts</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Model B PnL</div>
        <div class="dash-kpi-val dash-green">+${parseFloat((backtest.totals?.rcConfirm ?? 0).toFixed(0)).toLocaleString("en-IN")} pts</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Model A Win Rate</div>
        <div class="dash-kpi-val">${bbWinRate}%</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Model B Win Rate</div>
        <div class="dash-kpi-val">${rcWinRate}%</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Trading Days</div>
        <div class="dash-kpi-val">${btDays}</div>
      </div>
    </div>

    <!-- MONTHLY BACKTEST CHART -->
    <div class="dash-chart-card">
      <div class="dash-chart-title">📊 Monthly Combined PnL (points)</div>
      <canvas id="monthlyChart" height="90"></canvas>
    </div>

    <!-- BB vs RC CHART -->
    <div class="dash-chart-card">
      <div class="dash-chart-title">⚔️ Model A vs Model B — Monthly PnL</div>
      <canvas id="stratChart" height="90"></canvas>
    </div>

    <!-- MONTHLY TABLE -->
    <div class="dash-section-label"><span class="dash-sl-dot dash-sl-amber"></span>Monthly Breakdown</div>
    <div class="dash-table-wrap">
      <table class="dash-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>Days</th>
            <th>Model A PnL</th>
            <th>Model A Trades</th>
            <th>Model A W/L</th>
            <th>Model B PnL</th>
            <th>Model B Trades</th>
            <th>Model B W/L</th>
            <th>Combined</th>
          </tr>
        </thead>
        <tbody>
          ${mKeys.slice().reverse().map(k => {
            const m = monthly[k];
            const comb = (m.bbTotal ?? 0) + (m.rcTotal ?? 0);
            const isPos = comb >= 0;
            return `<tr class="${isPos ? "dash-row-win" : "dash-row-loss"}">
              <td class="dash-td-month">${k}</td>
              <td>${m.days ?? "—"}</td>
              <td class="${(m.bbTotal ?? 0) >= 0 ? "dash-green" : "dash-red"}">${(m.bbTotal ?? 0) >= 0 ? "+" : ""}${(m.bbTotal ?? 0).toFixed(1)}</td>
              <td>${m.bbTrades ?? "—"}</td>
              <td>${m.bbWins ?? 0}/${(m.bbTrades ?? 0) - (m.bbWins ?? 0)}</td>
              <td class="${(m.rcTotal ?? 0) >= 0 ? "dash-green" : "dash-red"}">${(m.rcTotal ?? 0) >= 0 ? "+" : ""}${(m.rcTotal ?? 0).toFixed(1)}</td>
              <td>${m.rcTrades ?? "—"}</td>
              <td>${m.rcWins ?? 0}/${(m.rcTrades ?? 0) - (m.rcWins ?? 0)}</td>
              <td class="${isPos ? "dash-green dash-td-bold" : "dash-red dash-td-bold"}">${isPos ? "+" : ""}${comb.toFixed(1)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>

    <footer class="site-footer"><span>© 2026 ZeroScreen &mdash; Backtest results are hypothetical &amp; for informational purposes only. Not SEBI registered. Not investment advice. Past performance is not indicative of future results.</span></footer>
  </div>

  <script src="/public/js/app.js"></script>
  <script>
  // Chart defaults
  Chart.defaults.color = document.documentElement.classList.contains('dark') ? '#a1a1aa' : '#6b7280';
  Chart.defaults.borderColor = document.documentElement.classList.contains('dark') ? '#27272a' : '#e5e7eb';

  ${analytics.equityCurve.length >= 2 ? `
  // Equity curve
  (function() {
    const labels = ${JSON.stringify(eqLabels)};
    const data   = ${JSON.stringify(analytics.equityCurve)};
    const ctx = document.getElementById('eqChart').getContext('2d');
    const finalVal = data[data.length - 1];
    const color = finalVal >= 0 ? '#10b981' : '#ef4444';
    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Equity (pts)',
          data,
          borderColor: color,
          backgroundColor: finalVal >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: data.length > 50 ? 0 : 3,
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          x: { display: data.length <= 100, ticks: { maxTicksLimit: 12 } },
          y: { ticks: { callback: v => v + ' pts' } }
        }
      }
    });
  })();
  ` : ""}

  // Monthly combined chart
  (function() {
    const labels = ${JSON.stringify(mLabels)};
    const data   = ${JSON.stringify(combData)};
    const colors = ${JSON.stringify(combColors)};
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Combined PnL (pts)',
          data,
          backgroundColor: colors,
          borderRadius: 3,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => (ctx.raw >= 0 ? '+' : '') + ctx.raw + ' pts' } } },
        scales: { y: { ticks: { callback: v => v + ' pts' } } }
      }
    });
  })();

  // BB vs RC stacked chart
  (function() {
    const labels = ${JSON.stringify(mLabels)};
    const bbData = ${JSON.stringify(bbData)};
    const rcData = ${JSON.stringify(rcData)};
    const ctx = document.getElementById('stratChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Model A', data: bbData, backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 2 },
          { label: 'Model B', data: rcData, backgroundColor: 'rgba(245,158,11,0.7)',  borderRadius: 2 },
        ]
      },
      options: {
        responsive: true,
        plugins: { tooltip: { mode: 'index', intersect: false } },
        scales: {
          x: { stacked: false },
          y: { stacked: false, ticks: { callback: v => v + ' pts' } }
        }
      }
    });
  })();
  </script>
</body>
</html>`);
});

// ── GET /signals ────────────────────────────────────────────────────────────────
app.get("/signals", featureGate("feature_signals", "Signals"), (req, res) => {
    const state = readBotJSON("trade-state.json", {});
    const trades = readBotJSON("trades.json", []);
    const hbGuest = readBotJSON("bot-heartbeat.json", null);
    const analytics = computeAnalytics(trades);
    const hasPosition = !!(state && (state.activeTrade || state.mainEntryDone));
    const isAliveGuest = hbGuest?.at ? (Date.now() - new Date(hbGuest.at).getTime()) < 3 * 60 * 1000 : false;
    const hbStatusGuest = (hbGuest?.status || "").toUpperCase();
    function isBotMarketHours() {
      const now = new Date();
      const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const h = ist.getHours(), m = ist.getMinutes();
      return (h > 9 || (h === 9 && m >= 15)) && (h < 15 || (h === 15 && m <= 30));
    }
    function guestBotLabel() {
      if (!isAliveGuest) return isBotMarketHours() ? "Bot offline \u2014 not responding" : "Bot sleeping \u2014 wakes at 9:00 AM IST";
      if (hasPosition) return "Bot is running a trade";
      if (hbStatusGuest.includes("WAIT") || hbStatusGuest.includes("9:25")) return "Bot alive \u2014 waiting for market hours (opens 9:25 IST)";
      return "Bot alive \u2014 scanning BANKNIFTY for signal";
    }
    function guestBotVal() {
      if (!isAliveGuest) return isBotMarketHours() ? "Offline" : "Sleeping";
      if (hasPosition) return "\u25CF\u00A0ACTIVE";
      if (hbStatusGuest.includes("WAIT") || hbStatusGuest.includes("9:25")) return "Waiting";
      return "Scanning";
    }
    function guestDotCls() {
      if (!isAliveGuest) return "offline";
      if (hasPosition) return "active";
      if (hbStatusGuest.includes("WAIT") || hbStatusGuest.includes("9:25")) return "waiting";
      return "scanning";
    }
    function guestValCls() {
      if (!isAliveGuest) return "offline-col";
      if (hasPosition) return "active-col";
      if (hbStatusGuest.includes("WAIT") || hbStatusGuest.includes("9:25")) return "waiting-col";
      return "scanning-col";
    }
    const premium = userIsPremium(req);
    const loggedIn = !!req.session?.userId;
    const backtest = readBotJSON("5year-backtest-result.json", {});
    const monthly = backtest.monthly || {};
    // Build last 4 months summary (no strategy names exposed)
    function monthLabel(key) {
        const [y, m] = key.split("-");
        return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleString("en-IN", { month: "short", year: "2-digit" });
    }
    const recentMonthKeys = Object.keys(monthly).sort().slice(-4);
    const recentMonthData = recentMonthKeys.map(k => {
        const d = monthly[k];
        const combined = (d.bbTotal ?? 0) + (d.rcTotal ?? 0);
        const totalTrades = (d.bbTrades ?? 0) + (d.rcTrades ?? 0);
        const totalWins = (d.bbWins ?? 0) + (d.rcWins ?? 0);
        const winRate = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(0) : "—";
        return { label: monthLabel(k), combined: combined.toFixed(0), winRate, days: d.days ?? 0, profit: combined > 0 };
    });
    // ── PREMIUM VIEW (full details) ────────────────────────────────────────────
    const isAdmin = req.session?.userRole === 'admin';
    if (premium) {
        const an2 = computeAnalytics(trades);
        const hb2 = readBotJSON("bot-heartbeat.json", {});
        const isAlive2 = hb2?.at ? (Date.now() - new Date(hb2.at).getTime()) < 3 * 60 * 1000 : false;
        const ep2 = state.entryPrice ?? hb2.entryPrice ?? 0;
        const dir2 = state.tradeDirection ?? hb2.direction ?? null;
        const live2 = hb2.livePrice ?? 0;
        const unreal2 = hb2.unrealisedPnL ?? 0;
        const sl2 = ep2 > 0 && dir2 ? (dir2 === "CE" ? ep2 - 100 : ep2 + 100) : 0;
        const entryPremium2 = hb2.entryPremium ?? 0;
        const livePremium2  = hb2.livePremium  ?? 0;
        const sym2 = state.tradeSymbol ?? "";
        const qty2 = state.mainQty ?? state.earlyQty ?? 0;
        const entryMs2 = state.entryTime ?? 0;
        const inTrade2 = !!(hb2.inTrade || state.activeTrade || state.mainEntryDone);
        const durMin2 = entryMs2 > 0 ? Math.floor((Date.now() - entryMs2) / 60000) : 0;
        const durStr2 = durMin2 >= 60 ? `${Math.floor(durMin2 / 60)}h ${durMin2 % 60}m` : durMin2 > 0 ? `${durMin2}m` : "";
        const entryIST2 = entryMs2 > 0 ? new Date(entryMs2).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : "";
        const mode2 = hb2.mode ?? state.mode ?? "PAPER";
        const todayStr2 = getTodayIST();
        const todayTradesAll2 = readBotJSON("trades.json", []);
        const closedToday2 = todayTradesAll2.filter((t) => (t.date || "").startsWith(todayStr2) && t.exitPrice && t.exitPrice > 0);
        function fmtTime2(iso) {
            return new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
        }
        function fmtDate2(iso) {
            const d = new Date(iso);
            return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" })
                + " " + d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
        }
        const QTY_MULT2 = 15; // 30 qty × 0.5 delta — option premium ₹ per index pt
        function pnlCls2(v) { return v >= 0 ? "sig-green" : "sig-red"; }
        function fmtPts2(v) { return `${v >= 0 ? "+" : ""}${v.toFixed(0)} pts`; }
        function fmtRs2(v) { const r = Math.round(v * QTY_MULT2); return `${r >= 0 ? "+" : "−"}₹${Math.abs(r).toLocaleString("en-IN")}`; }
        function fmtBoth2(v) { return `${fmtPts2(v)} <span class="rs-sub">${fmtRs2(v)}</span>`; }
        function rcCls(r) {
            if (!r)
                return "";
            const rl = r.toLowerCase();
            if (rl.includes("sl") || rl.includes("stop"))
                return "rc-sl";
            if (rl.includes("early") || rl.includes("c1"))
                return "rc-early";
            return "rc-eod";
        }
        const todayRows2 = [...closedToday2].reverse().map((t) => `
      <tr>
        <td class="td-t">${fmtTime2(t.date)}</td>
        <td><span class="d-b d-${(t.direction || "").toLowerCase()}">${t.direction || "—"}</span></td>
        <td class="td-m">${(t.entryPrice ?? 0).toFixed(1)} → ${(t.exitPrice ?? 0).toFixed(1)}</td>
        <td class="td-m ${pnlCls2(t.pnl ?? 0)}" style="font-weight:700">${fmtBoth2(t.pnl ?? 0)}</td>
        <td>${t.reasonExit ? `<span class="rc-b ${rcCls(t.reasonExit)}">${t.reasonExit}</span>` : "—"}</td>
        <td class="td-t">${t.duration ? (t.duration < 60 ? t.duration + "s" : Math.round(t.duration / 60) + "m") : "—"}</td>
      </tr>`).join("");
        const todayEmpty2 = !todayRows2 && !inTrade2 ? `<tr><td colspan="6" class="td-e">No closed trades today</td></tr>` : "";
        const recentRows2 = an2.recentTrades.map((t) => `
      <tr>
        <td class="td-t">${t.date ? fmtDate2(t.date) : "—"}</td>
        <td><span class="d-b d-${(t.direction || "").toLowerCase()}">${t.direction || "—"}</span></td>
        <td class="td-m">${(t.entryPrice ?? 0).toFixed(0)} → ${(t.exitPrice ?? 0).toFixed(0)}</td>
        <td class="td-m ${pnlCls2(t.pnl ?? 0)}" style="font-weight:700">${fmtBoth2(t.pnl ?? 0)}</td>
        <td>${t.reasonExit ? `<span class="rc-b ${rcCls(t.reasonExit)}">${t.reasonExit}</span>` : "—"}</td>
      </tr>`).join("");
        const monthRows2 = an2.monthly.map((m) => {
            const [y, mo] = m.month.split("-");
            const mLabel = new Date(parseInt(y), parseInt(mo) - 1, 1).toLocaleString("en-IN", { month: "short", year: "2-digit" });
            return `<tr>
        <td class="td-t">${mLabel}</td>
        <td class="td-m ${pnlCls2(m.pnl)}" style="font-weight:700">${fmtBoth2(m.pnl)}</td>
        <td class="td-m">${m.trades}</td>
        <td class="td-m">${m.wins}W / ${m.losses}L</td>
        <td class="td-m">${m.trades > 0 ? m.winRate + "%" : "—"}</td>
      </tr>`;
        }).join("");
        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Live Bot Dashboard — ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    /* ── Layout ───────────────────────────────────────────────── */
    .sig3{max-width:980px;margin:0 auto;padding:0 .75rem 3rem}
    .sig3-hdr{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;margin:1rem 0 .85rem}
    .sig3-title{font-size:1.1rem;font-weight:800;color:var(--text)}
    .sig3-sub{font-size:.72rem;color:var(--text-muted);margin-top:2px}
    .sig3-live{display:flex;align-items:center;gap:.4rem;font-size:.72rem;color:var(--text-muted)}
    .sig3-dot{width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 6px #10b98188;animation:sig3p 1.4s infinite}
    @keyframes sig3p{0%,100%{opacity:1;box-shadow:0 0 6px #10b98188}50%{opacity:.3;box-shadow:none}}
    /* ── Bot status dot ───────────────────────────────────────── */
    .gv-status-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
    .gv-status-dot.active{background:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.3);animation:gvpulse-green 1.6s ease-in-out infinite}
    .gv-status-dot.scanning{background:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.25);animation:gvpulse-blue 2.2s ease-in-out infinite}
    .gv-status-dot.waiting{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.2);animation:gvpulse-amber 2.8s ease-in-out infinite}
    .gv-status-dot.offline{background:#ef4444;box-shadow:none}
    @keyframes gvpulse-green{0%,100%{box-shadow:0 0 0 3px rgba(16,185,129,.3)}50%{box-shadow:0 0 0 7px rgba(16,185,129,.07)}}
    @keyframes gvpulse-blue{0%,100%{box-shadow:0 0 0 3px rgba(59,130,246,.25)}50%{box-shadow:0 0 0 6px rgba(59,130,246,.06)}}
    @keyframes gvpulse-amber{0%,100%{box-shadow:0 0 0 3px rgba(245,158,11,.2)}50%{box-shadow:0 0 0 5px rgba(245,158,11,.05)}}
    .gv-status-val.active-col{color:#10b981}
    .gv-status-val.scanning-col{color:#3b82f6}
    .gv-status-val.waiting-col{color:#f59e0b}
    .gv-status-val.offline-col{color:#ef4444}
    /* ── KPI Cards (matching paper trade style) ───────────────── */
    .sig3-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:10px;margin-bottom:1rem}
    .sig3-kpi{background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:13px 16px}
    .sig3-kl{font-size:.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px}
    .sig3-kv{font-size:1.35rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.15}
    .sig3-ks{font-size:.72rem;font-weight:600;margin-top:3px;opacity:.85}
    .sig3-g{color:#10b981}.sig3-r{color:#ef4444}.sig3-d{color:var(--text-muted)}

    /* ── Active Position Hero Card ────────────────────────────── */
    .sig3-pos{border-radius:12px;padding:18px 22px;margin-bottom:1rem;border:1.5px solid}
    .sig3-pos-ce{background:rgba(31,58,95,.2);border-color:rgba(59,130,246,.5)}
    .sig3-pos-pe{background:rgba(80,18,18,.22);border-color:rgba(239,68,68,.5)}
    .sig3-pos-flat{background:var(--card-bg);border-color:var(--border)}
    .sig3-ph{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:14px}
    .sig3-dir-b{font-size:.8rem;font-weight:800;padding:.2rem .55rem;border-radius:5px}
    .sig3-dir-ce{background:#1f3a5f;color:#60a5fa}
    .sig3-dir-pe{background:#3b1010;color:#f87171}
    .sig3-mode-b{font-size:.62rem;background:rgba(255,255,255,.07);color:var(--text-muted);padding:.12rem .42rem;border-radius:4px}
    .sig3-dur{margin-left:auto;font-size:.68rem;color:var(--text-muted)}
    /* Big P&L */
    .sig3-pnl-big{font-size:2.4rem;font-weight:800;letter-spacing:-.5px;line-height:1.1;margin-bottom:3px;font-variant-numeric:tabular-nums}
    .sig3-pnl-pts{font-size:.88rem;font-weight:600;margin-bottom:16px}
    /* 6-cell detail grid */
    .sig3-pg{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 16px}
    @media(min-width:520px){.sig3-pg{grid-template-columns:repeat(6,1fr)}}
    .sig3-pl{font-size:.58rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em}
    .sig3-pv{font-size:.9rem;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums}

    /* ── Section headers ──────────────────────────────────────── */
    .sig3-sec{font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;
      color:var(--text-muted);border-bottom:1px solid var(--border);
      padding-bottom:7px;margin:1.4rem 0 .75rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
    .sig3-sec-count{font-size:.8rem;font-weight:700;text-transform:none;letter-spacing:0;color:var(--text)}

    /* ── Tables ───────────────────────────────────────────────── */
    .sig3-tw{overflow-x:auto;border:1px solid var(--border);border-radius:10px;margin-bottom:4px}
    table.sig3-t{width:100%;border-collapse:collapse;font-size:.85rem}
    .sig3-t th{text-align:left;padding:9px 11px;font-size:.63rem;text-transform:uppercase;
      letter-spacing:.06em;color:var(--text-muted);border-bottom:1px solid var(--border);
      font-weight:600;white-space:nowrap;background:var(--bg2)}
    .sig3-t td{padding:10px 11px;border-bottom:1px solid var(--border);vertical-align:middle}
    .sig3-t tr:last-child td{border-bottom:none}
    .sig3-t tr:hover td{background:var(--hover-bg)}
    .sig3-te{text-align:center;padding:24px 16px;color:var(--text-muted);font-size:.85rem}

    /* ── Cell styles ──────────────────────────────────────────── */
    .sig3-ct{font-size:.72rem;color:var(--text-muted);white-space:nowrap}
    .sig3-db{font-size:.7rem;font-weight:800;padding:.12rem .36rem;border-radius:3px}
    .sig3-db.ce{background:#1f3a5f;color:#60a5fa}
    .sig3-db.pe{background:#3b1010;color:#f87171}
    /* P&L cell: big ₹ on line 1, small pts on line 2 */
    .sig3-pnl-rs{font-size:1rem;font-weight:800;display:block;font-variant-numeric:tabular-nums;line-height:1.2}
    .sig3-pnl-spt{font-size:.68rem;display:block;color:var(--text-muted);margin-top:1px}
    .sig3-rc{font-size:.65rem;padding:.1rem .32rem;border-radius:3px;font-weight:600;white-space:nowrap}
    .sig3-rc-sl{background:rgba(239,68,68,.12);color:#f87171}
    .sig3-rc-early{background:rgba(245,158,11,.12);color:#f59e0b}
    .sig3-rc-eod{background:rgba(99,102,241,.12);color:#818cf8}
    .sig3-mono{font-family:monospace;font-size:.82rem}

    /* ── Picks Results ────────────────────────────────────────── */
    .picks-res-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin-bottom:.75rem}
    .pr-card{background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:12px 14px;transition:border-color .15s}
    .pr-card.pr-target{border-left:3px solid #10b981}
    .pr-card.pr-sl{border-left:3px solid #ef4444}
    .pr-card.pr-triggered{border-left:3px solid #3b82f6}
    .pr-card.pr-watching{border-left:3px solid var(--border)}
    .pr-sym{font-weight:800;font-size:.9rem;margin-bottom:4px}
    .pr-dir{font-size:.65rem;font-weight:800;padding:.12rem .36rem;border-radius:3px;display:inline-block;margin-right:4px}
    .pr-dir-long{background:#052e16;color:#4ade80}
    .pr-dir-short{background:#3b1010;color:#f87171}
    .pr-badge{font-size:.65rem;font-weight:700;padding:.12rem .42rem;border-radius:3px;display:inline-block;vertical-align:middle}
    .pr-badge-target{background:rgba(16,185,129,.15);color:#10b981}
    .pr-badge-sl{background:rgba(239,68,68,.12);color:#f87171}
    .pr-badge-triggered{background:rgba(59,130,246,.12);color:#60a5fa}
    .pr-badge-watching{background:rgba(255,255,255,.06);color:var(--text-muted)}
    .pr-zone{font-size:.72rem;color:var(--text-muted);margin-top:5px}
    .pr-meta{font-size:.68rem;color:var(--text-muted);margin-top:3px}
    .pr-type-hdr{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);margin:.75rem 0 .4rem}
  </style>
</head>
<body class="page-theme-signals">
  ${nav("signals", req)}
  <div class="sig3">

    <!-- Header -->
    <div class="sig3-hdr">
      <div>
        <div class="sig3-title">📡 Live Bot Dashboard</div>
        <div class="sig3-sub">BANKNIFTY &middot; HYBRID_REVERSE &middot; ${mode2.toUpperCase()} &middot; 30 qty &middot; ₹ P&amp;L = index pts &times; 30 qty &times; 0.5 delta = pts &times; 15</div>
      </div>
      <div class="sig3-live"><span class="sig3-dot"></span><span id="sig3-upd">Connecting&hellip;</span><button onclick="_sig3Refresh()" title="Refresh now" style="margin-left:8px;background:none;border:1px solid var(--border);color:var(--text-muted);border-radius:6px;padding:2px 8px;font-size:.72rem;cursor:pointer">&#8635; Refresh</button></div>
    </div>
    <!-- Bot Status Bar (same as guest view) -->
    <div class="gv-status" id="sig3-bot-status" style="margin-bottom:1rem;padding:10px 16px;border-radius:10px;background:var(--card-bg,#1e293b);border:1px solid var(--border);display:flex;align-items:center;gap:10px">
      <span class="gv-status-dot ${!isAlive2 ? 'offline' : inTrade2 ? 'active' : (hb2?.status?.toUpperCase().includes('WAIT') || hb2?.status?.toUpperCase().includes('9:25') ? 'waiting' : 'scanning')}" id="sig3-status-dot"></span>
      <span style="font-size:.82rem;color:var(--text-muted)" id="sig3-status-lbl">${inTrade2 ? 'Bot is running a trade' : hb2?.status?.toUpperCase().includes('WAIT') ? 'Bot alive \u2014 waiting for market hours (opens 9:25 IST)' : 'Bot alive \u2014 scanning BANKNIFTY for signal'}</span>
      <span style="font-size:.82rem;font-weight:700;margin-left:auto" class="${inTrade2 ? 'sig3-g' : 'sig3-d'}" id="sig3-status-val">${inTrade2 ? '&#x25CF;&nbsp;ACTIVE' : hb2?.status?.toUpperCase().includes('WAIT') ? 'Waiting' : 'Scanning'}</span>
    </div>

    <!-- KPI Stats (paper-trade card style) -->
    <div class="sig3-kpis">
      <div class="sig3-kpi">
        <div class="sig3-kl">Today P&amp;L</div>
        <div class="sig3-kv ${pnlCls2(an2.today.pnl)}" id="k3-today-rs">${fmtRs2(an2.today.pnl)}</div>
        <div class="sig3-ks ${pnlCls2(an2.today.pnl)}" id="k3-today-pts">${fmtPts2(an2.today.pnl)}</div>
      </div>
      <div class="sig3-kpi">
        <div class="sig3-kl">Today Trades</div>
        <div class="sig3-kv" id="k3-trades">${an2.today.trades}${inTrade2 ? '<span style="font-size:.65rem;color:#10b981"> +live</span>' : ""}</div>
        <div class="sig3-ks sig3-d" id="k3-wl"><span class="sig3-g">${an2.today.wins}W</span> / <span class="sig3-r">${an2.today.losses}L</span></div>
      </div>
      <div class="sig3-kpi">
        <div class="sig3-kl">This Week</div>
        <div class="sig3-kv ${pnlCls2(an2.weekly.pnl)}" id="k3-wk-rs">${fmtRs2(an2.weekly.pnl)}</div>
        <div class="sig3-ks ${pnlCls2(an2.weekly.pnl)}" id="k3-wk-pts">${fmtPts2(an2.weekly.pnl)}</div>
      </div>
      <div class="sig3-kpi">
        <div class="sig3-kl">All-Time P&amp;L</div>
        <div class="sig3-kv ${pnlCls2(an2.allTime.pnl)}">${fmtRs2(an2.allTime.pnl)}</div>
        <div class="sig3-ks ${pnlCls2(an2.allTime.pnl)}">${fmtPts2(an2.allTime.pnl)}</div>
      </div>
      <div class="sig3-kpi">
        <div class="sig3-kl">Win Rate</div>
        <div class="sig3-kv" id="k3-wr">${an2.allTime.winRate}%</div>
        <div class="sig3-ks sig3-d">${an2.allTime.wins}W / ${an2.allTime.losses}L all-time</div>
      </div>
      <div class="sig3-kpi">
        <div class="sig3-kl">Max Risk / Trade</div>
        <div class="sig3-kv sig3-r">&#8722;&#8377;1,500</div>
        <div class="sig3-ks sig3-d">100 pts SL &times; 30 qty</div>
      </div>
    </div>

    <!-- Active Position Card -->
    <div id="sig3-pos-wrap">
      ${inTrade2 && ep2 > 0 ? `
      <div class="sig3-pos sig3-pos-${(dir2 || "flat").toLowerCase()}">
        <div class="sig3-ph">
          <span class="sig3-dot"></span>
          <span class="sig3-dir-b sig3-dir-${(dir2 || "").toLowerCase()}">${dir2} OPTION</span>
          <span class="sig3-mono" style="color:var(--text-muted)">${sym2 || "BANKNIFTY"}</span>
          <span class="sig3-mode-b">${mode2.toUpperCase()}</span>
          ${durStr2 ? `<span class="sig3-dur">${durStr2} in trade</span>` : ""}
        </div>
        <div class="sig3-pnl-big ${pnlCls2(unreal2)}" id="sig3-pnl-rs">${fmtRs2(unreal2)}</div>
        <div class="sig3-pnl-pts ${pnlCls2(unreal2)}" id="sig3-pnl-pts">${unreal2 >= 0 ? "+" : ""}${unreal2.toFixed(0)} index pts unrealised</div>
        <div class="sig3-pg">
          <div>
            <div class="sig3-pl">Entry Index</div>
            <div class="sig3-pv sig3-mono">${ep2.toFixed(1)}</div>
          </div>
          <div>
            <div class="sig3-pl">Live Index</div>
            <div class="sig3-pv sig3-g sig3-mono" id="sig3-live">${live2 > 0 ? live2.toFixed(1) : "&hellip;"}</div>
          </div>
          <div>
            <div class="sig3-pl">Entry Premium</div>
            <div class="sig3-pv sig3-mono">${entryPremium2 > 0 ? "\u20b9" + entryPremium2.toFixed(1) : "&mdash;"}</div>
          </div>
          <div>
            <div class="sig3-pl">Live Premium</div>
            <div class="sig3-pv sig3-mono" id="sig3-live-premium">${livePremium2 > 0 ? "\u20b9" + livePremium2.toFixed(1) : "&hellip;"}</div>
          </div>
          <div>
            <div class="sig3-pl">Stop Loss</div>
            <div class="sig3-pv sig3-r sig3-mono">${sl2 > 0 ? sl2.toFixed(1) : "&mdash;"}</div>
          </div>
          <div>
            <div class="sig3-pl">SL Loss (&#8377;)</div>
            <div class="sig3-pv sig3-r">&#8722;&#8377;1,500</div>
          </div>
          <div>
            <div class="sig3-pl">Qty / Lot</div>
            <div class="sig3-pv">${qty2 > 0 ? qty2 : 30} / 1</div>
          </div>
          <div>
            <div class="sig3-pl">Entry Time</div>
            <div class="sig3-pv">${entryIST2 || "&mdash;"}</div>
          </div>
        </div>
      </div>` : `
      <div class="sig3-pos sig3-pos-flat">
        <div style="display:flex;align-items:center;gap:.75rem">
          <span style="font-size:1.6rem">&#9203;</span>
          <div>
            <div style="font-weight:700;font-size:.95rem">No Active Position</div>
            <div style="font-size:.74rem;color:var(--text-muted);margin-top:3px">Bot scanning BANKNIFTY for breakout signal&hellip;</div>
          </div>
        </div>
      </div>`}
    </div>

    <!-- TODAY'S TRADES -->
    <div class="sig3-sec">
      Today &mdash; ${todayStr2}
      <span class="sig3-sec-count">(${closedToday2.length} closed${inTrade2 ? " + 1 live" : ""})</span>
    </div>
    <div class="sig3-tw">
      <table class="sig3-t">
        <thead><tr>
          <th>Time</th><th>Dir</th><th>Symbol</th><th>Premium In&#8594;Out</th><th>Entry &#8594; Exit (Index)</th>
          <th>P&amp;L (&#8377;)</th><th>Reason</th><th>Duration</th>
        </tr></thead>
        <tbody id="sig3-today-body">
          ${[...closedToday2].reverse().map((t) => `<tr>
            <td class="sig3-ct">${fmtTime2(t.date)}</td>
            <td><span class="sig3-db ${(t.direction || "").toLowerCase()}">${t.direction || "&mdash;"}</span></td>
            <td class="sig3-mono" style="font-size:.72rem;color:var(--text-muted)">${(t as any).symbol || "&mdash;"}</td>
            <td class="sig3-mono">${(t as any).premiumEntry > 0 ? (t as any).premiumEntry.toFixed(1) : "&mdash;"} &#8594; ${(t as any).premiumExit > 0 ? (t as any).premiumExit.toFixed(1) : "&mdash;"}</td>
            <td class="sig3-mono">${(t.entryPrice ?? 0).toFixed(1)} &#8594; ${(t.exitPrice ?? 0).toFixed(1)}</td>
            <td>
              <span class="sig3-pnl-rs ${pnlCls2(t.pnl ?? 0)}">${fmtRs2(t.pnl ?? 0)}</span>
              <span class="sig3-pnl-spt">${fmtPts2(t.pnl ?? 0)}</span>
            </td>
            <td>${t.reasonExit ? `<span class="sig3-rc ${rcCls(t.reasonExit).replace("rc-", "sig3-rc-")}">${t.reasonExit}</span>` : "&mdash;"}</td>
            <td class="sig3-ct">${t.duration ? (t.duration < 60 ? t.duration + "s" : Math.round(t.duration / 60) + "m") : "&mdash;"}</td>
          </tr>`).join("") || `<tr><td colspan="8" class="sig3-te">No closed trades today${inTrade2 ? " &mdash; 1 live position active" : ""}</td></tr>`}
        </tbody>
      </table>
    </div>

    <!-- THIS WEEK (last 7 days) -->
    <div class="sig3-sec">
      This Week &mdash; Last 7 Days
      <span class="sig3-sec-count">(${an2.weekly.trades} trades &nbsp;<span class="${pnlCls2(an2.weekly.pnl)}">${fmtRs2(an2.weekly.pnl)}</span>)</span>
    </div>
    <div class="sig3-tw">
      <table class="sig3-t">
        <thead><tr>
          <th>Date / Time</th><th>Dir</th><th>Symbol</th><th>Premium In&#8594;Out</th><th>Entry &#8594; Exit (Index)</th>
          <th>P&amp;L (&#8377;)</th><th>Reason</th>
        </tr></thead>
        <tbody>
          ${(() => {
            const _now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
            const _wAgo = new Date(_now);
            _wAgo.setDate(_now.getDate() - 7);
            const _wk = an2.recentTrades.filter((t) => t.date && new Date(t.date) >= _wAgo);
            if (!_wk.length)
                return `<tr><td colspan="7" class="sig3-te">No trades in the past 7 days</td></tr>`;
            return _wk.map((t) => `<tr>
              <td class="sig3-ct">${fmtDate2(t.date)}</td>
              <td><span class="sig3-db ${(t.direction || "").toLowerCase()}">${t.direction || "&mdash;"}</span></td>
              <td class="sig3-mono" style="font-size:.72rem;color:var(--text-muted)">${(t as any).symbol || "&mdash;"}</td>
              <td class="sig3-mono">${(t as any).premiumEntry > 0 ? (t as any).premiumEntry.toFixed(1) : "&mdash;"} &#8594; ${(t as any).premiumExit > 0 ? (t as any).premiumExit.toFixed(1) : "&mdash;"}</td>
              <td class="sig3-mono">${(t.entryPrice ?? 0).toFixed(0)} &#8594; ${(t.exitPrice ?? 0).toFixed(0)}</td>
              <td>
                <span class="sig3-pnl-rs ${pnlCls2(t.pnl ?? 0)}">${fmtRs2(t.pnl ?? 0)}</span>
                <span class="sig3-pnl-spt">${fmtPts2(t.pnl ?? 0)}</span>
              </td>
              <td>${t.reasonExit ? `<span class="sig3-rc ${rcCls(t.reasonExit).replace("rc-", "sig3-rc-")}">${t.reasonExit}</span>` : "&mdash;"}</td>
            </tr>`).join("");
        })()}
        </tbody>
      </table>
    </div>

    <!-- MONTH-WISE P&L -->
    ${an2.monthly.length > 0 ? `
    <div class="sig3-sec">
      Month-wise P&amp;L
      <span class="sig3-sec-count">(${an2.monthly.length} month${an2.monthly.length !== 1 ? "s" : ""})</span>
    </div>
    <div class="sig3-tw">
      <table class="sig3-t">
        <thead><tr>
          <th>Month</th><th>P&amp;L (&#8377;)</th><th>P&amp;L (pts)</th><th>Trades</th><th>W / L</th><th>Win %</th>
        </tr></thead>
        <tbody>
          ${an2.monthly.map((m) => {
            const [_my, _mm] = m.month.split("-");
            const _ml = new Date(parseInt(_my), parseInt(_mm) - 1, 1)
                .toLocaleString("en-IN", { month: "long", year: "numeric" });
            return `<tr>
              <td style="font-weight:600;white-space:nowrap">${_ml}</td>
              <td>
                <span class="sig3-pnl-rs ${pnlCls2(m.pnl)}" style="font-size:.95rem">${fmtRs2(m.pnl)}</span>
              </td>
              <td class="sig3-mono" style="font-size:.76rem;color:var(--text-muted)">${fmtPts2(m.pnl)}</td>
              <td>${m.trades}</td>
              <td><span class="sig3-g">${m.wins}W</span>&nbsp;/&nbsp;<span class="sig3-r">${m.losses}L</span></td>
              <td class="${m.winRate >= 55 ? "sig3-g" : m.winRate >= 40 ? "" : "sig3-r"}">${m.trades > 0 ? m.winRate + "%" : "&mdash;"}</td>
            </tr>`;
        }).join("")}
        </tbody>
      </table>
    </div>` : ""}

    <footer class="site-footer" style="margin-top:1.5rem">
      <span>&copy; 2026 ZeroScreen &mdash; Admin View &middot; ${mode2.toUpperCase()} mode &middot; Not SEBI registered.</span>
    </footer>
  </div>

  <script>
  const _QM = 15;
  function _fR(v){const r=Math.round(v*_QM);return(r>=0?"+":"\u2212")+"\u20B9"+Math.abs(r).toLocaleString("en-IN");}
  function _fP(v){return(v>=0?"+":"")+v.toFixed(0)+" pts";}
  function _gc(v){return v>=0?"#10b981":"#ef4444";}
  function _ge(id){return document.getElementById(id);}
  async function _sig3Refresh(){
    try{
      const r=await fetch("/api/bot/status");const d=await r.json();
      _ge("sig3-upd").textContent="Updated "+new Date().toLocaleTimeString("en-IN");
      // inTrade: check both heartbeat (live) and activeState (file fallback)
      const hb=d.heartbeat||{};
      const inT=!!(hb.inTrade||d.activeState?.inTrade||d.activeState?.activeTrade||d.activeState?.mainEntryDone);
      // unrealisedPnL from heartbeat (live) first, then activeState fallback
      const u=parseFloat((hb.unrealisedPnL??d.activeState?.unrealisedPnL??0).toString());
      const tot=parseFloat(((d.today?.pnl||0)+(inT?u:0)).toFixed(0));
      if(_ge("k3-today-rs")){_ge("k3-today-rs").textContent=_fR(tot);_ge("k3-today-rs").style.color=_gc(tot);}
      if(_ge("k3-today-pts")){_ge("k3-today-pts").textContent=_fP(tot);_ge("k3-today-pts").style.color=_gc(tot);}
      const tc=d.today?.trades||0;
      if(_ge("k3-trades"))_ge("k3-trades").innerHTML=tc+(tc!==1?" trades":" trade")+(inT?' <span style="font-size:.65rem;color:#10b981">+live</span>':"");
      if(_ge("k3-wl")&&d.today)_ge("k3-wl").innerHTML='<span class="sig3-g">'+d.today.wins+'W</span> / <span class="sig3-r">'+d.today.losses+'L</span>';
      if(_ge("k3-wk-rs")&&d.weekly){_ge("k3-wk-rs").textContent=_fR(d.weekly.pnl);_ge("k3-wk-rs").style.color=_gc(d.weekly.pnl);}
      if(_ge("k3-wk-pts")&&d.weekly){_ge("k3-wk-pts").textContent=_fP(d.weekly.pnl);_ge("k3-wk-pts").style.color=_gc(d.weekly.pnl);}
      if(_ge("k3-wr")&&d.allTime)_ge("k3-wr").textContent=d.allTime.winRate+"%";
      if(inT){
        if(_ge("sig3-pnl-rs")){_ge("sig3-pnl-rs").textContent=_fR(u);_ge("sig3-pnl-rs").style.color=_gc(u);}
        if(_ge("sig3-pnl-pts")){_ge("sig3-pnl-pts").textContent=(u>=0?"+":"")+u.toFixed(0)+" index pts unrealised";_ge("sig3-pnl-pts").style.color=_gc(u);}
        if(_ge("sig3-live")&&(hb.livePrice||d.activeState?.livePrice))_ge("sig3-live").textContent=parseFloat(hb.livePrice||d.activeState.livePrice).toFixed(1);
        if(_ge("sig3-live-premium")&&hb.livePremium>0)_ge("sig3-live-premium").textContent="\u20b9"+parseFloat(hb.livePremium).toFixed(1);
      }
      // update bot status bar
      const alive2=d.isAlive!==false;
      const hbSt2=(d.botStatus||"").toUpperCase();
      const isWait2=!inT&&alive2&&(hbSt2.includes("WAIT")||hbSt2.includes("9:25")||hbSt2.includes("MARKET"));
      const dotCls2=!alive2?"offline":inT?"active":isWait2?"waiting":"scanning";
      const _istNow2=new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
      const _mktOpen2=(_istNow2.getHours()>9||(_istNow2.getHours()===9&&_istNow2.getMinutes()>=15))&&(_istNow2.getHours()<15||(_istNow2.getHours()===15&&_istNow2.getMinutes()<=30));
      const lbl2=!alive2?(_mktOpen2?"Bot offline \u2014 not responding":"Bot sleeping \u2014 wakes at 9:00 AM IST"):inT?"Bot is running a trade \u2014 "+((hb.direction||"")+" OPTION").trim():(isWait2?"Bot alive \u2014 waiting for market hours (opens 9:25 IST)":"Bot alive \u2014 scanning BANKNIFTY for signal");
      const val2=!alive2?"Offline":inT?"\u25CF\u00A0ACTIVE":(isWait2?"Waiting":"Scanning");
      const valCol2=!alive2?"offline-col":inT?"active-col":isWait2?"waiting-col":"scanning-col";
      const dot2=_ge("sig3-status-dot");if(dot2)dot2.className="gv-status-dot "+dotCls2;
      if(_ge("sig3-status-lbl"))_ge("sig3-status-lbl").textContent=lbl2;
      if(_ge("sig3-status-val")){_ge("sig3-status-val").textContent=val2;_ge("sig3-status-val").className="gv-status-val "+valCol2;}
    }catch(e){console.error(e);}
  }
  _sig3Refresh();setInterval(_sig3Refresh,8000);
  </script>
  <script src="/public/js/app.js"></script>
</body>
</html>`);
        return;
    }
    // -- GUEST / FREE USER VIEW (matches admin sig3 design) --
    const yesterdayIST = (() => {
        const d2 = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        d2.setDate(d2.getDate() - 1);
        return d2.toISOString().split("T")[0];
    })();
    const todayStrG = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const yTrades = trades.filter((t) => (t.date || "").startsWith(yesterdayIST) && t.exitPrice && t.exitPrice > 0);
    const yPnl = parseFloat(yTrades.reduce((s, t) => s + (t.pnl ?? 0), 0).toFixed(1));
    const yWins = yTrades.filter((t) => t.pnl > 0).length;
    const closedTodayG = trades.filter((t) => (t.date || "").startsWith(todayStrG) && t.exitPrice && t.exitPrice > 0);
    const QTY_MULT_G = 15;
    function fmtRsG(v) { const r = Math.round(v * QTY_MULT_G); return (r >= 0 ? "+" : "\u2212") + "\u20B9" + Math.abs(r).toLocaleString("en-IN"); }
    function fmtPtsG(v) { return (v >= 0 ? "+" : "") + v.toFixed(0) + " pts"; }
    const tierLabel = loggedIn ? "\uD83D\uDD14 Member" : "\uD83D\uDC64 Guest";
    const tierClass = loggedIn ? "sig-tier-free" : "sig-tier-guest";
    const dirG = (hbGuest?.direction || "").toUpperCase();
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Live BANKNIFTY Signals — ZeroScreen</title>
  ${seoMeta({ title: "Live BANKNIFTY Bot Signals — ZeroScreen", description: "Real-time BANKNIFTY algo trading signals with entry, stop-loss and target. Track bot performance live on ZeroScreen.", url: "/signals" })}
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    .sig3{max-width:980px;margin:0 auto;padding:0 .75rem 3rem}
    .sig3-hdr{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;margin:1rem 0 .85rem}
    .sig3-title{font-size:1.1rem;font-weight:800;color:var(--text)}
    .sig3-sub{font-size:.72rem;color:var(--text-muted);margin-top:2px}
    .sig3-live{display:flex;align-items:center;gap:.4rem;font-size:.72rem;color:var(--text-muted)}
    .sig3-dot{width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 6px #10b98188;animation:sig3p 1.4s infinite}
    @keyframes sig3p{0%,100%{opacity:1;box-shadow:0 0 6px #10b98188}50%{opacity:.3;box-shadow:none}}
    .gv-status-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
    .gv-status-dot.active{background:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.3);animation:gvpulse-green 1.6s ease-in-out infinite}
    .gv-status-dot.scanning{background:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.25);animation:gvpulse-blue 2.2s ease-in-out infinite}
    .gv-status-dot.waiting{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.2);animation:gvpulse-amber 2.8s ease-in-out infinite}
    .gv-status-dot.offline{background:#ef4444;box-shadow:none}
    @keyframes gvpulse-green{0%,100%{box-shadow:0 0 0 3px rgba(16,185,129,.3)}50%{box-shadow:0 0 0 7px rgba(16,185,129,.07)}}
    @keyframes gvpulse-blue{0%,100%{box-shadow:0 0 0 3px rgba(59,130,246,.25)}50%{box-shadow:0 0 0 6px rgba(59,130,246,.06)}}
    @keyframes gvpulse-amber{0%,100%{box-shadow:0 0 0 3px rgba(245,158,11,.2)}50%{box-shadow:0 0 0 5px rgba(245,158,11,.05)}}
    .gv-status-val.active-col{color:#10b981}.gv-status-val.scanning-col{color:#3b82f6}
    .gv-status-val.waiting-col{color:#f59e0b}.gv-status-val.offline-col{color:#ef4444}
    .sig3-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:10px;margin-bottom:1rem}
    .sig3-kpi{background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:13px 16px}
    .sig3-kl{font-size:.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px}
    .sig3-kv{font-size:1.35rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.15}
    .sig3-ks{font-size:.72rem;font-weight:600;margin-top:3px;opacity:.85}
    .sig3-g{color:#10b981}.sig3-r{color:#ef4444}.sig3-d{color:var(--text-muted)}
    .sig3-pos{border-radius:12px;padding:18px 22px;margin-bottom:1rem;border:1.5px solid}
    .sig3-pos-ce{background:rgba(31,58,95,.2);border-color:rgba(59,130,246,.5)}
    .sig3-pos-pe{background:rgba(80,18,18,.22);border-color:rgba(239,68,68,.5)}
    .sig3-pos-flat{background:var(--card-bg);border-color:var(--border)}
    .sig3-ph{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:14px}
    .sig3-dir-b{font-size:.8rem;font-weight:800;padding:.2rem .55rem;border-radius:5px}
    .sig3-dir-ce{background:#1f3a5f;color:#60a5fa}.sig3-dir-pe{background:#3b1010;color:#f87171}
    .sig3-pnl-big{font-size:2.4rem;font-weight:800;letter-spacing:-.5px;line-height:1.1;margin-bottom:3px;font-variant-numeric:tabular-nums}
    .sig3-pnl-pts{font-size:.88rem;font-weight:600;margin-bottom:12px}
    .sig3-sec{font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);border-bottom:1px solid var(--border);padding-bottom:7px;margin:1.4rem 0 .75rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
    .sig3-sec-count{font-size:.8rem;font-weight:700;text-transform:none;letter-spacing:0;color:var(--text)}
    .sig3-tw{overflow-x:auto;border:1px solid var(--border);border-radius:10px;margin-bottom:4px}
    table.sig3-t{width:100%;border-collapse:collapse;font-size:.85rem}
    .sig3-t th{text-align:left;padding:9px 11px;font-size:.63rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);border-bottom:1px solid var(--border);font-weight:600;white-space:nowrap;background:var(--bg2)}
    .sig3-t td{padding:10px 11px;border-bottom:1px solid var(--border);vertical-align:middle}
    .sig3-t tr:last-child td{border-bottom:none}
    .sig3-t tr:hover td{background:var(--hover-bg)}
    .sig3-te{text-align:center;padding:24px 16px;color:var(--text-muted);font-size:.85rem}
    .sig3-ct{font-size:.72rem;color:var(--text-muted);white-space:nowrap}
    .sig3-db{font-size:.7rem;font-weight:800;padding:.12rem .36rem;border-radius:3px}
    .sig3-db.ce{background:#1f3a5f;color:#60a5fa}.sig3-db.pe{background:#3b1010;color:#f87171}
    .sig3-pnl-rs{font-size:1rem;font-weight:800;display:block;font-variant-numeric:tabular-nums;line-height:1.2}
    .sig3-pnl-spt{font-size:.68rem;display:block;color:var(--text-muted);margin-top:1px}
    .sig3-rc{font-size:.65rem;padding:.1rem .32rem;border-radius:3px;font-weight:600;white-space:nowrap}
    .sig3-rc-sl{background:rgba(239,68,68,.12);color:#f87171}
    .sig3-rc-early{background:rgba(245,158,11,.12);color:#f59e0b}
    .sig3-rc-eod{background:rgba(99,102,241,.12);color:#818cf8}
    .sig3-mono{font-family:monospace;font-size:.82rem}
    .gv-cta{display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,rgba(124,58,237,.18),rgba(99,102,241,.12));border:1px solid rgba(124,58,237,.35);border-radius:14px;padding:16px 18px;margin:20px 0}
    .gv-cta-icon{font-size:1.5rem}.gv-cta-body{flex:1}
    .gv-cta-body strong{font-size:.92rem;color:#f1f5f9}
    .gv-cta-body p{font-size:.75rem;color:#94a3b8;margin:3px 0 0}
    .gv-btn{background:linear-gradient(135deg,#7c3aed,#6366f1);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:.78rem;font-weight:700;white-space:nowrap;text-decoration:none;cursor:pointer}
    .sig-tier-free{background:rgba(16,185,129,.15);color:#34d399;border:1px solid rgba(16,185,129,.3)}
    .sig-tier-guest{background:rgba(100,116,139,.15);color:#94a3b8;border:1px solid rgba(100,116,139,.3)}
    .gv-badge{font-size:.68rem;font-weight:700;padding:3px 9px;border-radius:20px;letter-spacing:.3px;border:1px solid transparent}
    .gv-upd{font-size:.65rem;color:var(--text-muted)}
  </style>
</head>
<body class="page-theme-signals">
  ${nav("signals", req)}
  <div class="sig3">

    <!-- Header -->
    <div class="sig3-hdr">
      <div>
        <div class="sig3-title">&#x1F4E1; Live Signals</div>
        <div class="sig3-sub">BANKNIFTY Options &middot; Automated intraday bot &middot; &#x20B9; P&amp;L = index pts &times; 15</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span class="gv-badge ${tierClass}">${tierLabel}</span>
        <div class="sig3-live"><span class="sig3-dot"></span><span class="gv-upd" id="gv-upd">Connecting&hellip;</span></div>
      </div>
    </div>

    <!-- Bot Status Bar -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:1rem;padding:10px 16px;border-radius:10px;background:var(--card-bg,#1e293b);border:1px solid var(--border)">
      <span class="gv-status-dot ${guestDotCls()}" id="gv-dot"></span>
      <span style="font-size:.82rem;color:var(--text-muted);flex:1" id="gv-status-lbl">${guestBotLabel()}</span>
      <span style="font-size:.82rem;font-weight:700" class="gv-status-val ${guestValCls()}" id="gv-status-val">${guestBotVal()}</span>
    </div>

    <!-- 6 KPI Cards -->
    <div class="sig3-kpis">
      <div class="sig3-kpi">
        <div class="sig3-kl">Today P&amp;L</div>
        <div class="sig3-kv ${analytics.today.pnl >= 0 ? 'sig3-g' : 'sig3-r'}" id="gv-today-rs">${fmtRsG(analytics.today.pnl)}</div>
        <div class="sig3-ks sig3-d" id="gv-today-pts">${fmtPtsG(analytics.today.pnl)}</div>
      </div>
      <div class="sig3-kpi">
        <div class="sig3-kl">Today Trades</div>
        <div class="sig3-kv" id="gv-trades">${analytics.today.trades}${hasPosition ? '<span style="font-size:.65rem;color:#10b981"> +live</span>' : ""}</div>
        <div class="sig3-ks sig3-d" id="gv-wl"><span class="sig3-g">${analytics.today.wins}W</span> / <span class="sig3-r">${analytics.today.losses}L</span></div>
      </div>
      <div class="sig3-kpi">
        <div class="sig3-kl">This Week</div>
        <div class="sig3-kv ${analytics.weekly.pnl >= 0 ? 'sig3-g' : 'sig3-r'}" id="gv-wk-rs">${fmtRsG(analytics.weekly.pnl)}</div>
        <div class="sig3-ks sig3-d" id="gv-wk-pts">${fmtPtsG(analytics.weekly.pnl)}</div>
      </div>
      <div class="sig3-kpi">
        <div class="sig3-kl">All-Time P&amp;L</div>
        <div class="sig3-kv ${analytics.allTime.pnl >= 0 ? 'sig3-g' : 'sig3-r'}">${fmtRsG(analytics.allTime.pnl)}</div>
        <div class="sig3-ks sig3-d">${fmtPtsG(analytics.allTime.pnl)}</div>
      </div>
      <div class="sig3-kpi">
        <div class="sig3-kl">Win Rate</div>
        <div class="sig3-kv">${analytics.allTime.winRate}%</div>
        <div class="sig3-ks sig3-d">${analytics.allTime.wins}W / ${analytics.allTime.losses}L all-time</div>
      </div>
      <div class="sig3-kpi">
        <div class="sig3-kl">Yesterday</div>
        <div class="sig3-kv ${yPnl >= 0 ? 'sig3-g' : 'sig3-r'}">${fmtRsG(yPnl)}</div>
        <div class="sig3-ks sig3-d">${fmtPtsG(yPnl)}${yTrades.length > 0 ? " &middot; " + yWins + "W/" + (yTrades.length - yWins) + "L" : ""}</div>
      </div>
    </div>

    <!-- Position Card -->
    <div id="gv-pos-wrap">
      ${hasPosition ? `
      <div class="sig3-pos sig3-pos-${dirG ? dirG.toLowerCase() : 'ce'}" id="gv-pos-card">
        <div class="sig3-ph">
          <span class="sig3-dot"></span>
          <span class="sig3-dir-b sig3-dir-${dirG ? dirG.toLowerCase() : 'ce'}" id="gv-pos-dir">${dirG ? dirG + ' OPTION' : 'IN TRADE'}</span>
          <span class="sig3-mono" style="color:var(--text-muted)">BANKNIFTY</span>
        </div>
        <div class="sig3-pnl-big sig3-d" id="gv-live-pnl">&mdash;</div>
        <div class="sig3-pnl-pts sig3-d" id="gv-live-pts">live P&amp;L updating&hellip;</div>
        <div style="padding:10px 14px;background:rgba(15,23,42,.5);border-radius:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-size:.95rem">&#x1F512;</span>
          <div style="flex:1">
            <div style="font-size:.8rem;font-weight:700;color:var(--text)">Entry price &middot; Stop Loss &middot; Index level</div>
            <div style="font-size:.72rem;color:var(--text-muted);margin-top:2px">Unlock live trade details in Premium</div>
          </div>
          <a href="/premium" style="background:linear-gradient(135deg,#7c3aed,#6366f1);color:#fff;border-radius:7px;padding:6px 12px;font-size:.75rem;font-weight:700;text-decoration:none;white-space:nowrap">Upgrade &#x2192;</a>
        </div>
      </div>` : `
      <div class="sig3-pos sig3-pos-flat">
        <div style="display:flex;align-items:center;gap:.75rem">
          <span style="font-size:1.6rem">&#9203;</span>
          <div>
            <div style="font-weight:700;font-size:.95rem">No Active Position</div>
            <div style="font-size:.74rem;color:var(--text-muted);margin-top:3px">Bot scanning BANKNIFTY for breakout signal&hellip;</div>
          </div>
        </div>
      </div>`}
    </div>

    <!-- TODAY'S TRADES -->
    <div class="sig3-sec">
      Today &mdash; ${todayStrG}
      <span class="sig3-sec-count">(${closedTodayG.length} closed${hasPosition ? " + 1 live" : ""})</span>
    </div>
    <div class="sig3-tw">
      <table class="sig3-t">
        <thead><tr>
          <th>Time</th><th>Dir</th><th>P&amp;L (&#8377;)</th><th>P&amp;L (pts)</th><th>Reason</th><th>Duration</th>
        </tr></thead>
        <tbody>
          ${[...closedTodayG].reverse().map((t) => {
            const d3 = (t.direction || "").toLowerCase();
            const rcRaw = (t.reasonExit || "").toLowerCase();
            const rcCls = rcRaw.includes("sl") || rcRaw.includes("stop") ? "sig3-rc-sl" : rcRaw.includes("target") ? "" : rcRaw.includes("eod") ? "sig3-rc-eod" : "sig3-rc-early";
            const dur = t.duration ? (t.duration < 60 ? t.duration + "s" : Math.round(t.duration / 60) + "m") : "\u2014";
            const tStr = t.date ? new Date(t.date).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : "\u2014";
            return `<tr>
              <td class="sig3-ct">${tStr}</td>
              <td>${d3 ? `<span class="sig3-db ${d3}">${(t.direction || "").toUpperCase()}</span>` : "\u2014"}</td>
              <td><span class="sig3-pnl-rs ${(t.pnl ?? 0) >= 0 ? "sig3-g" : "sig3-r"}">${fmtRsG(t.pnl ?? 0)}</span></td>
              <td class="sig3-mono" style="font-size:.76rem;color:var(--text-muted)">${fmtPtsG(t.pnl ?? 0)}</td>
              <td>${t.reasonExit ? `<span class="sig3-rc ${rcCls}">${t.reasonExit}</span>` : "\u2014"}</td>
              <td class="sig3-ct">${dur}</td>
            </tr>`;
          }).join("") || `<tr><td colspan="6" class="sig3-te">No closed trades today${hasPosition ? " \u2014 1 live position active" : ""}</td></tr>`}
        </tbody>
      </table>
    </div>

    <!-- MONTHLY P&L -->
    <div class="sig3-sec">Month-wise P&amp;L</div>
    <div class="sig3-tw">
      <table class="sig3-t">
        <thead><tr><th>Month</th><th>P&amp;L (&#8377;)</th><th>P&amp;L (pts)</th><th>Trades</th><th>Win%</th></tr></thead>
        <tbody>
          ${analytics.monthly.slice(0, 6).map((m) => {
            const ml = new Date(m.month + "-01").toLocaleString("en-IN", { month: "short", year: "2-digit" });
            return `<tr>
              <td style="font-weight:600">${ml}</td>
              <td><span class="sig3-pnl-rs ${m.pnl >= 0 ? "sig3-g" : "sig3-r"}" style="font-size:.95rem">${fmtRsG(m.pnl)}</span></td>
              <td class="sig3-mono" style="font-size:.76rem;color:var(--text-muted)">${fmtPtsG(m.pnl)}</td>
              <td>${m.trades}</td>
              <td class="${m.winRate >= 55 ? "sig3-g" : m.winRate >= 40 ? "" : "sig3-r"}">${m.trades > 0 ? m.winRate + "%" : "\u2014"}</td>
            </tr>`;
          }).join("") || '<tr><td colspan="5" class="sig3-te">No historical data yet</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="gv-cta">
      <div class="gv-cta-icon">&#x26A1;</div>
      <div class="gv-cta-body">
        <strong>See every trade in real time</strong>
        <p>Premium unlocks live entry price, stop loss level, exact P&amp;L per trade &amp; instant Telegram alerts.</p>
      </div>
      <a href="/premium" class="gv-btn">Upgrade &#x2192;</a>
    </div>

    <footer class="site-footer"><span>&#xA9; 2026 ZeroScreen &mdash; For informational purposes only. Not SEBI registered. Not investment advice.</span></footer>
  </div>
  <script src="/public/js/app.js"></script>
  <script>
  const _GQM = 15;
  function _gfR(v){const r=Math.round(v*_GQM);return(r>=0?"+":"\u2212")+"\u20B9"+Math.abs(r).toLocaleString("en-IN");}
  function _gfP(v){return(v>=0?"+":"")+v.toFixed(0)+" pts";}
  function _gc2(v){return v>=0?"#10b981":"#ef4444";}
  function _ge2(id){return document.getElementById(id);}
  async function gvRefresh(){
    try{
      const d=(await (await fetch("/api/bot/status")).json());
      if(_ge2("gv-upd"))_ge2("gv-upd").textContent="Updated "+new Date().toLocaleTimeString("en-IN");
      const inT=!!(d.activeState&&(d.activeState.inTrade||d.activeState.activeTrade||d.activeState.mainEntryDone));
      const alive=d.isAlive!==false;
      const hbStatus=(d.botStatus||"").toUpperCase();
      const isWaiting=!inT&&alive&&(hbStatus.includes("WAIT")||hbStatus.includes("9:25")||hbStatus.includes("MARKET"));
      const dotCls=!alive?"offline":inT?"active":isWaiting?"waiting":"scanning";
      const _istNow=new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
      const _mktOpen=(_istNow.getHours()>9||(_istNow.getHours()===9&&_istNow.getMinutes()>=15))&&(_istNow.getHours()<15||(_istNow.getHours()===15&&_istNow.getMinutes()<=30));
      const lblTxt=!alive?(_mktOpen?"Bot offline \u2014 not responding":"Bot sleeping \u2014 wakes at 9:00 AM IST"):inT?"Bot is running a trade \u2014 "+((d.heartbeat?.direction||"")+" OPTION").trim():(isWaiting?"Bot alive \u2014 waiting for market hours (opens 9:25 IST)":"Bot alive \u2014 scanning BANKNIFTY for signal");
      const valTxt=!alive?"Offline":inT?"\u25CF\u00A0ACTIVE":(isWaiting?"Waiting":"Scanning");
      const valCls=!alive?"offline-col":inT?"active-col":isWaiting?"waiting-col":"scanning-col";
      const dot=_ge2("gv-dot");if(dot)dot.className="gv-status-dot "+dotCls;
      if(_ge2("gv-status-lbl"))_ge2("gv-status-lbl").textContent=lblTxt;
      if(_ge2("gv-status-val")){_ge2("gv-status-val").textContent=valTxt;_ge2("gv-status-val").className="gv-status-val "+valCls;}
      const tot=(d.today?.pnl??0)+(inT?(d.activeState?.unrealisedPnL??0):0);
      if(_ge2("gv-today-rs")){_ge2("gv-today-rs").textContent=_gfR(tot);_ge2("gv-today-rs").style.color=_gc2(tot);}
      if(_ge2("gv-today-pts"))_ge2("gv-today-pts").textContent=_gfP(tot)+(inT?" (incl. live)":"");
      const tc=d.today?.trades||0;
      if(_ge2("gv-trades"))_ge2("gv-trades").innerHTML=tc+(tc!==1?" trades":" trade")+(inT?' <span style="font-size:.65rem;color:#10b981">+live</span>':"");
      if(_ge2("gv-wl")&&d.today)_ge2("gv-wl").innerHTML='<span class="sig3-g">'+d.today.wins+'W</span> / <span class="sig3-r">'+d.today.losses+'L</span>';
      if(_ge2("gv-wk-rs")&&d.weekly){_ge2("gv-wk-rs").textContent=_gfR(d.weekly.pnl);_ge2("gv-wk-rs").style.color=_gc2(d.weekly.pnl);}
      if(_ge2("gv-wk-pts")&&d.weekly)_ge2("gv-wk-pts").textContent=_gfP(d.weekly.pnl);
      if(inT&&d.activeState?.entryPrice>0){
        const u=d.activeState?.unrealisedPnL??0;
        const dirLive=(d.heartbeat?.direction||"").toUpperCase();
        if(_ge2("gv-live-pnl")){_ge2("gv-live-pnl").textContent=_gfR(u);_ge2("gv-live-pnl").style.color=_gc2(u);}
        if(_ge2("gv-live-pts")){_ge2("gv-live-pts").textContent=_gfP(u)+" unrealised";_ge2("gv-live-pts").style.color=_gc2(u);}
        if(_ge2("gv-pos-dir")&&dirLive)_ge2("gv-pos-dir").textContent=dirLive+" OPTION";
      }
    }catch(e){}
  }
  gvRefresh();setInterval(gvRefresh,12000);
  </script>
</body>
</html>`);
});
async function ensureAdminEmail() {
  if (!ADMIN_EMAIL) return;
  await dbRun(
    "UPDATE users SET role = 'admin' WHERE email = ? AND role != 'admin'",
    [ADMIN_EMAIL]
  );
}

// ── Picks Result Auto-Checker ─────────────────────────────────────────────────
async function fetchNseStockPrice(symbol: string): Promise<number | null> {
  try {
    const url = `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`;
    const res = await fetch(url, { headers: NSE_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const price = data?.priceInfo?.lastPrice ?? data?.priceInfo?.closePrice ?? null;
    return price ? parseFloat(price) : null;
  } catch (_) { return null; }
}

async function checkPicksResults(): Promise<void> {
  const nowIST = new Date(Date.now() + 5.5 * 3600 * 1000);
  const hIST = nowIST.getUTCHours();
  const mIST = nowIST.getUTCMinutes();
  // Only run during market hours 9:15–15:35 IST
  if (hIST < 9 || (hIST === 9 && mIST < 15) || hIST > 15 || (hIST === 15 && mIST > 35)) return;

  try {
    const picks = await getActivePicks();
    // Build set of symbols that already have an open entry_triggered pick (de-duplication)
    const triggeredSymbols = new Set(
      picks.filter(p => p.result === 'entry_triggered').map(p => p.stock_symbol)
    );

    for (const p of picks) {
      // Already fully resolved → skip
      if (p.result === 'target_hit' || p.result === 'sl_hit') continue;

      const livePrice = await fetchNseStockPrice(p.stock_symbol);
      if (!livePrice) continue;

      if (p.direction === 'LONG') {
        if (p.result === 'entry_triggered') {
          // Already in — check for target/SL
          if (p.target && livePrice >= p.target) {
            await updatePickResult(p.id, 'target_hit', livePrice);
            triggeredSymbols.delete(p.stock_symbol);
          } else if (p.stop_loss && livePrice <= p.stop_loss) {
            await updatePickResult(p.id, 'sl_hit', livePrice);
            triggeredSymbols.delete(p.stock_symbol);
          }
        } else {
          // Not yet triggered — check entry zone (only if no other open pick for this symbol)
          const inEntry = livePrice >= p.entry_low && livePrice <= p.entry_high;
          if (inEntry && !triggeredSymbols.has(p.stock_symbol)) {
            await updatePickEntry(p.id, livePrice);
            triggeredSymbols.add(p.stock_symbol);
          }
        }
      } else if (p.direction === 'SHORT') {
        if (p.result === 'entry_triggered') {
          if (p.target && livePrice <= p.target) {
            await updatePickResult(p.id, 'target_hit', livePrice);
            triggeredSymbols.delete(p.stock_symbol);
          } else if (p.stop_loss && livePrice >= p.stop_loss) {
            await updatePickResult(p.id, 'sl_hit', livePrice);
            triggeredSymbols.delete(p.stock_symbol);
          }
        } else {
          const inEntry = livePrice >= p.entry_low && livePrice <= p.entry_high;
          if (inEntry && !triggeredSymbols.has(p.stock_symbol)) {
            await updatePickEntry(p.id, livePrice);
            triggeredSymbols.add(p.stock_symbol);
          }
        }
      }
    }
  } catch (e: any) {
    console.warn("[PicksChecker]", e?.message);
  }
}

function startPicksResultChecker(): void {
  checkPicksResults(); // run once on startup
  setInterval(checkPicksResults, 5 * 60 * 1000); // every 5 minutes
}
// ── END Picks Result Auto-Checker ─────────────────────────────────────────────

initDb().then(async () => {
  await ensureAdminEmail();
  // Run subscription expiry check on startup
  expireOldSubscriptions().catch(() => {});
  // Auto-migrate picks table for result tracking columns
  try {
    await dbRun("ALTER TABLE picks ADD COLUMN result TEXT DEFAULT NULL");
    await dbRun("ALTER TABLE picks ADD COLUMN result_price REAL DEFAULT NULL");
    await dbRun("ALTER TABLE picks ADD COLUMN result_at TEXT DEFAULT NULL");
    await dbRun("ALTER TABLE picks ADD COLUMN entry_price REAL DEFAULT NULL");
    await dbRun("ALTER TABLE picks ADD COLUMN entry_at TEXT DEFAULT NULL");
  } catch (_) { /* columns already exist */ }
  app.listen(PORT, () => {
    console.log(`\n🔍 ZeroScreen running at http://localhost:${PORT}`);
    console.log(`   Screener  : http://localhost:${PORT}/`);
    console.log(`   Watchlists: http://localhost:${PORT}/watchlists`);
    console.log(`   API stats : http://localhost:${PORT}/api/stats\n`);
    startScheduler();
    startPicksResultChecker();
  });
}).catch(err => { console.error("DB init failed:", err); process.exit(1); });
