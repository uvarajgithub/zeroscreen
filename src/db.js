"use strict";
/**
 * db.ts — SQLite database layer for ZeroScreen
 * Uses sqlite3 with promise wrappers
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
exports.getDb = getDb;
exports.dbRun = dbRun;
exports.dbAll = dbAll;
exports.dbGet = dbGet;
exports.initDb = initDb;
exports.upsertStock = upsertStock;
exports.upsertPrice = upsertPrice;
exports.screenStocks = screenStocks;
exports.getStock = getStock;
exports.getAllSymbols = getAllSymbols;
exports.getStaleSymbols = getStaleSymbols;
exports.getSectors = getSectors;
exports.getDbStats = getDbStats;
exports.getWatchlists = getWatchlists;
exports.getWatchlist = getWatchlist;
exports.createWatchlist = createWatchlist;
exports.addToWatchlist = addToWatchlist;
exports.removeFromWatchlist = removeFromWatchlist;
exports.deleteWatchlist = deleteWatchlist;
exports.createUser = createUser;
exports.getUserByEmail = getUserByEmail;
exports.getUserById = getUserById;
exports.countUsers = countUsers;
exports.getAllUsers = getAllUsers;
exports.getAlerts = getAlerts;
exports.createAlert = createAlert;
exports.deleteAlert = deleteAlert;
exports.updateAlertLastSent = updateAlertLastSent;
exports.getAllActiveAlerts = getAllActiveAlerts;
exports.createResetToken = createResetToken;
exports.getResetToken = getResetToken;
exports.markResetTokenUsed = markResetTokenUsed;
exports.updateUserPassword = updateUserPassword;
exports.updateUserName = updateUserName;
exports.searchStocks = searchStocks;
exports.getActivePicks = getActivePicks;
exports.getAllPicks = getAllPicks;
exports.createPick = createPick;
exports.updatePickStatus = updatePickStatus;
exports.deletePick = deletePick;
exports.getSetting = getSetting;
exports.setSetting = setSetting;
exports.getAllSettings = getAllSettings;
exports.createOrder = createOrder;
exports.activateSubscription = activateSubscription;
exports.getActiveSubscription = getActiveSubscription;
exports.expireOldSubscriptions = expireOldSubscriptions;
exports.getAllSubscriptions = getAllSubscriptions;
exports.getPaperPortfolio = getPaperPortfolio;
exports.getPaperPositions = getPaperPositions;
exports.getPaperTrades = getPaperTrades;
exports.paperBuy = paperBuy;
exports.paperSell = paperSell;
exports.paperReset = paperReset;
exports.storePhoneOtp = storePhoneOtp;
exports.verifyPhoneOtp = verifyPhoneOtp;
exports.setUserMobile = setUserMobile;
exports.getUserByMobile = getUserByMobile;
exports.countPaperTrades = countPaperTrades;
exports.getPaperTradeConfig = getPaperTradeConfig;
exports.savePaperTradeConfig = savePaperTradeConfig;
var sqlite3_1 = require("sqlite3");
var path_1 = require("path");
var DB_PATH = path_1.default.join(__dirname, "..", "zeroscreen.db");
var _db = null;
function getDb() {
    if (_db)
        return _db;
    _db = new sqlite3_1.default.Database(DB_PATH);
    return _db;
}
function dbRun(sql, params) {
    if (params === void 0) { params = []; }
    return new Promise(function (resolve, reject) {
        getDb().run(sql, params, function (err) { if (err)
            reject(err);
        else
            resolve(); });
    });
}
function dbAll(sql, params) {
    if (params === void 0) { params = []; }
    return new Promise(function (resolve, reject) {
        getDb().all(sql, params, function (err, rows) { if (err)
            reject(err);
        else
            resolve(rows); });
    });
}
function dbGet(sql, params) {
    if (params === void 0) { params = []; }
    return new Promise(function (resolve, reject) {
        getDb().get(sql, params, function (err, row) { if (err)
            reject(err);
        else
            resolve(row || null); });
    });
}
function initDb() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = getDb();
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            db.serialize(function () {
                                db.run("PRAGMA journal_mode = WAL");
                                db.run("PRAGMA foreign_keys = ON");
                                db.run("CREATE TABLE IF NOT EXISTS stocks (\n        symbol          TEXT PRIMARY KEY,\n        company_name    TEXT,\n        sector          TEXT,\n        market_cap      REAL,\n        pe_ratio        REAL,\n        roce            REAL,\n        roe             REAL,\n        de_ratio        REAL,\n        promoter_pct    REAL,\n        net_profit_1    REAL,\n        net_profit_2    REAL,\n        net_profit_3    REAL,\n        revenue_1       REAL,\n        revenue_2       REAL,\n        revenue_3       REAL,\n        eps             REAL,\n        book_value      REAL,\n        dividend_yield  REAL,\n        current_ratio   REAL,\n        all_profitable  INTEGER DEFAULT 0,\n        profit_uptrend  INTEGER DEFAULT 0,\n        screener_data   TEXT,\n        fetched_at      TEXT,\n        fetch_error     TEXT\n      )");
                                db.run("CREATE TABLE IF NOT EXISTS prices (\n        symbol     TEXT PRIMARY KEY,\n        price      REAL,\n        volume     INTEGER,\n        day_high   REAL,\n        day_low    REAL,\n        prev_close REAL,\n        change_pct REAL,\n        updated_at TEXT\n      )");
                                db.run("CREATE TABLE IF NOT EXISTS watchlists (\n        id          INTEGER PRIMARY KEY AUTOINCREMENT,\n        name        TEXT NOT NULL,\n        description TEXT,\n        created_at  TEXT DEFAULT (datetime('now')),\n        updated_at  TEXT DEFAULT (datetime('now'))\n      )");
                                db.run("CREATE TABLE IF NOT EXISTS watchlist_stocks (\n        watchlist_id INTEGER REFERENCES watchlists(id) ON DELETE CASCADE,\n        symbol       TEXT NOT NULL,\n        added_at     TEXT DEFAULT (datetime('now')),\n        notes        TEXT,\n        PRIMARY KEY (watchlist_id, symbol)\n      )");
                                db.run("CREATE TABLE IF NOT EXISTS users (\n        id         INTEGER PRIMARY KEY AUTOINCREMENT,\n        name       TEXT NOT NULL,\n        email      TEXT NOT NULL UNIQUE,\n        password   TEXT NOT NULL,\n        role       TEXT NOT NULL DEFAULT 'user',\n        created_at TEXT DEFAULT (datetime('now'))\n      )");
                                db.run("CREATE INDEX IF NOT EXISTS idx_stocks_roce ON stocks(roce)");
                                db.run("CREATE INDEX IF NOT EXISTS idx_stocks_de ON stocks(de_ratio)");
                                db.run("CREATE INDEX IF NOT EXISTS idx_prices_volume ON prices(volume)");
                                db.run("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");
                                // Migrations (safe — errors ignored if column already exists)
                                db.run("ALTER TABLE watchlists ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL", function () { });
                                db.run("CREATE TABLE IF NOT EXISTS alerts (\n        id           INTEGER PRIMARY KEY AUTOINCREMENT,\n        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n        name         TEXT NOT NULL,\n        filters_json TEXT NOT NULL,\n        last_sent    TEXT,\n        active       INTEGER NOT NULL DEFAULT 1,\n        created_at   TEXT DEFAULT (datetime('now'))\n      )");
                                db.run("CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id)");
                                db.run("CREATE TABLE IF NOT EXISTS password_reset_tokens (\n        token      TEXT PRIMARY KEY,\n        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n        expires_at TEXT NOT NULL,\n        used       INTEGER NOT NULL DEFAULT 0\n      )");
                                db.run("CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists(user_id)");
                                // 52-week range columns (migration — safe if already exist)
                                db.run("ALTER TABLE stocks ADD COLUMN week52_high REAL", function () { });
                                db.run("ALTER TABLE stocks ADD COLUMN week52_low  REAL", function () { });
                                // Company about / incorporation year (migration)
                                db.run("ALTER TABLE stocks ADD COLUMN about TEXT", function () { });
                                db.run("ALTER TABLE stocks ADD COLUMN incorporated INTEGER", function () { });
                                db.run("CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id)");
                                // ── Analytics ───────────────────────────────────────────────────────────
                                db.run("CREATE TABLE IF NOT EXISTS page_views (\n        id          INTEGER PRIMARY KEY AUTOINCREMENT,\n        path        TEXT NOT NULL,\n        ip_hash     TEXT,\n        user_agent  TEXT,\n        referrer    TEXT,\n        is_logged_in INTEGER DEFAULT 0,\n        created_at  TEXT DEFAULT (datetime('now','localtime'))\n      )");
                                db.run("CREATE INDEX IF NOT EXISTS idx_pv_path ON page_views(path)");
                                db.run("CREATE INDEX IF NOT EXISTS idx_pv_created ON page_views(created_at)");
                                // ── Custom strategies ────────────────────────────────────────────────────
                                db.run("CREATE TABLE IF NOT EXISTS custom_strategies (\n        id          INTEGER PRIMARY KEY AUTOINCREMENT,\n        user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,\n        name        TEXT NOT NULL,\n        description TEXT,\n        text_input  TEXT,\n        filters_json TEXT NOT NULL,\n        created_at  TEXT DEFAULT (datetime('now','localtime'))\n      )");
                                // ── Google OAuth ─────────────────────────────────────────────────────────
                                db.run("ALTER TABLE users ADD COLUMN google_id TEXT", function () { });
                                db.run("ALTER TABLE users ADD COLUMN avatar_url TEXT", function () { });
                                // ── Picks ────────────────────────────────────────────────────────────────
                                db.run("CREATE TABLE IF NOT EXISTS picks (\n        id           INTEGER PRIMARY KEY AUTOINCREMENT,\n        stock_symbol TEXT NOT NULL,\n        company_name TEXT,\n        direction    TEXT NOT NULL DEFAULT 'LONG',\n        pick_type    TEXT NOT NULL DEFAULT 'intraday',\n        entry_low    REAL NOT NULL,\n        entry_high   REAL NOT NULL,\n        target       REAL,\n        stop_loss    REAL,\n        reason       TEXT NOT NULL,\n        risk_level   TEXT NOT NULL DEFAULT 'Medium',\n        status       TEXT NOT NULL DEFAULT 'active',\n        published_at TEXT DEFAULT (datetime('now','localtime')),\n        expires_at   TEXT,\n        created_by   INTEGER REFERENCES users(id)\n      )");
                                db.run("CREATE INDEX IF NOT EXISTS idx_picks_status ON picks(status)");
                                db.run("ALTER TABLE picks ADD COLUMN pick_type TEXT NOT NULL DEFAULT 'intraday'", function () { });
                                // ── App settings ─────────────────────────────────────────────────────────
                                db.run("CREATE TABLE IF NOT EXISTS app_settings (\n        key   TEXT PRIMARY KEY,\n        value TEXT NOT NULL DEFAULT ''\n      )");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('telegram_link','')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('home_headline','India''s sharpest NSE screener')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('signals_mode','live')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('banner_text','')");
                                // ── Subscriptions ─────────────────────────────────────────────────────────
                                db.run("CREATE TABLE IF NOT EXISTS subscriptions (\n        id              INTEGER PRIMARY KEY AUTOINCREMENT,\n        user_id         INTEGER NOT NULL REFERENCES users(id),\n        razorpay_order_id    TEXT,\n        razorpay_payment_id  TEXT,\n        razorpay_sub_id      TEXT,\n        plan            TEXT NOT NULL DEFAULT 'monthly',\n        amount          INTEGER NOT NULL DEFAULT 49900,\n        currency        TEXT NOT NULL DEFAULT 'INR',\n        status          TEXT NOT NULL DEFAULT 'pending',\n        starts_at       TEXT,\n        expires_at      TEXT,\n        coupon_code     TEXT,\n        created_at      TEXT DEFAULT (datetime('now','localtime'))\n      )");
                                db.run("CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id)");
                                db.run("CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions(status)");
                                // ── Referrals ──────────────────────────────────────────────────────────────
                                db.run("ALTER TABLE users ADD COLUMN referral_code TEXT", function () { });
                                db.run("ALTER TABLE users ADD COLUMN referred_by   TEXT", function () { });
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('razorpay_enabled','false')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('premium_price_paise','49900')");
                                // ── User Paper Trading ────────────────────────────────────────────────────
                                db.run("CREATE TABLE IF NOT EXISTS paper_portfolio (\n        user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,\n        balance    REAL    NOT NULL DEFAULT 100000,\n        created_at TEXT    DEFAULT (datetime('now','localtime'))\n      )");
                                db.run("CREATE TABLE IF NOT EXISTS paper_positions (\n        id           INTEGER PRIMARY KEY AUTOINCREMENT,\n        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n        symbol       TEXT    NOT NULL,\n        company_name TEXT,\n        qty          INTEGER NOT NULL,\n        avg_price    REAL    NOT NULL,\n        invested     REAL    NOT NULL,\n        entry_date   TEXT    DEFAULT (datetime('now','localtime')),\n        UNIQUE(user_id, symbol)\n      )");
                                db.run("CREATE TABLE IF NOT EXISTS paper_trades (\n        id           INTEGER PRIMARY KEY AUTOINCREMENT,\n        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n        symbol       TEXT    NOT NULL,\n        company_name TEXT,\n        action       TEXT    NOT NULL,\n        qty          INTEGER NOT NULL,\n        price        REAL    NOT NULL,\n        total        REAL    NOT NULL,\n        pnl          REAL,\n        pnl_pct      REAL,\n        balance_after REAL   NOT NULL,\n        traded_at    TEXT    DEFAULT (datetime('now','localtime'))\n      )");
                                db.run("CREATE INDEX IF NOT EXISTS idx_pt_user ON paper_trades(user_id)");
                                db.run("CREATE INDEX IF NOT EXISTS idx_pp_user ON paper_positions(user_id)");
                                // ── Mobile OTP ───────────────────────────────────────────────────────────
                                db.run("CREATE TABLE IF NOT EXISTS phone_otps (\n        id         INTEGER PRIMARY KEY AUTOINCREMENT,\n        mobile     TEXT NOT NULL,\n        otp        TEXT NOT NULL,\n        purpose    TEXT NOT NULL DEFAULT 'verify',\n        expires_at INTEGER NOT NULL,\n        used       INTEGER NOT NULL DEFAULT 0,\n        created_at TEXT DEFAULT (datetime('now','localtime'))\n      )");
                                db.run("CREATE INDEX IF NOT EXISTS idx_otps_mobile ON phone_otps(mobile)");
                                // ── Paper Trade Config ────────────────────────────────────────────────────
                                db.run("CREATE TABLE IF NOT EXISTS paper_trade_config (\n        user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,\n        trade_type      TEXT    NOT NULL DEFAULT 'INTRADAY',\n        default_qty     INTEGER NOT NULL DEFAULT 1,\n        default_sl_pct  REAL    NOT NULL DEFAULT 2.0,\n        default_tgt_pct REAL    NOT NULL DEFAULT 4.0,\n        max_positions   INTEGER NOT NULL DEFAULT 10,\n        updated_at      TEXT    DEFAULT (datetime('now','localtime'))\n      )");
                                // Mobile verification & trade_type migrations (safe — errors ignored)
                                db.run("ALTER TABLE users ADD COLUMN mobile TEXT", function () { });
                                db.run("ALTER TABLE users ADD COLUMN mobile_verified INTEGER NOT NULL DEFAULT 0", function () { });
                                db.run("ALTER TABLE paper_positions ADD COLUMN trade_type TEXT NOT NULL DEFAULT 'INTRADAY'", function () { });
                                db.run("ALTER TABLE paper_trades ADD COLUMN trade_type TEXT NOT NULL DEFAULT 'INTRADAY'", function () { });
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('paper_free_limit','10')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('otp_required','true')");
                                // SL / Target / OrderType on positions (safe migrations)
                                db.run("ALTER TABLE paper_positions ADD COLUMN sl_price REAL", function () { });
                                db.run("ALTER TABLE paper_positions ADD COLUMN target_price REAL", function () { });
                                db.run("ALTER TABLE paper_positions ADD COLUMN order_type TEXT", function () { });
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('registration_open','true')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('feature_signals','true')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('feature_dashboard','true')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('feature_strategies','true')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('feature_paper_trade_bot','true')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('feature_my_paper_trade','true')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('feature_watchlists','true')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('feature_alerts','true')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('feature_compare','true')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('feature_strategy_builder','true')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('feature_contact','true')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('watchlists_premium_only','false')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('alerts_premium_only','false')");
                                db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('paper_trade_premium_only','false')");
                                db.run("CREATE INDEX IF NOT EXISTS idx_reset_tokens_user3 ON password_reset_tokens(user_id)", function (err) {
                                    if (err)
                                        resolve();
                                    else
                                        resolve();
                                });
                            });
                        })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ── Upserts ───────────────────────────────────────────────────────────────────
function upsertStock(s) {
    return __awaiter(this, void 0, void 0, function () {
        var d;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    d = __assign({ company_name: null, sector: null, market_cap: null, pe_ratio: null, roce: null, roe: null, de_ratio: null, promoter_pct: null, net_profit_1: null, net_profit_2: null, net_profit_3: null, revenue_1: null, revenue_2: null, revenue_3: null, eps: null, book_value: null, dividend_yield: null, current_ratio: null, all_profitable: 0, profit_uptrend: 0, week52_high: null, week52_low: null, about: null, incorporated: null, screener_data: null, fetched_at: null, fetch_error: null }, s);
                    return [4 /*yield*/, dbRun("\n    INSERT INTO stocks (symbol,company_name,sector,market_cap,pe_ratio,roce,roe,de_ratio,\n      promoter_pct,net_profit_1,net_profit_2,net_profit_3,revenue_1,revenue_2,revenue_3,\n      eps,book_value,dividend_yield,current_ratio,all_profitable,profit_uptrend,\n      week52_high,week52_low,about,incorporated,screener_data,fetched_at,fetch_error)\n    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)\n    ON CONFLICT(symbol) DO UPDATE SET\n      company_name=excluded.company_name,sector=excluded.sector,market_cap=excluded.market_cap,\n      pe_ratio=excluded.pe_ratio,roce=excluded.roce,roe=excluded.roe,de_ratio=excluded.de_ratio,\n      promoter_pct=excluded.promoter_pct,net_profit_1=excluded.net_profit_1,\n      net_profit_2=excluded.net_profit_2,net_profit_3=excluded.net_profit_3,\n      revenue_1=excluded.revenue_1,revenue_2=excluded.revenue_2,revenue_3=excluded.revenue_3,\n      eps=excluded.eps,book_value=excluded.book_value,dividend_yield=excluded.dividend_yield,\n      current_ratio=excluded.current_ratio,all_profitable=excluded.all_profitable,\n      profit_uptrend=excluded.profit_uptrend,week52_high=excluded.week52_high,\n      week52_low=excluded.week52_low,about=excluded.about,incorporated=excluded.incorporated,\n      screener_data=excluded.screener_data,\n      fetched_at=excluded.fetched_at,fetch_error=excluded.fetch_error\n  ", [d.symbol, d.company_name, d.sector, d.market_cap, d.pe_ratio, d.roce, d.roe, d.de_ratio,
                            d.promoter_pct, d.net_profit_1, d.net_profit_2, d.net_profit_3,
                            d.revenue_1, d.revenue_2, d.revenue_3,
                            d.eps, d.book_value, d.dividend_yield, d.current_ratio,
                            d.all_profitable, d.profit_uptrend, d.week52_high, d.week52_low,
                            d.about, d.incorporated,
                            d.screener_data, d.fetched_at, d.fetch_error])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function upsertPrice(p) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbRun("\n    INSERT INTO prices (symbol,price,volume,day_high,day_low,prev_close,change_pct,updated_at)\n    VALUES (?,?,?,?,?,?,?,?)\n    ON CONFLICT(symbol) DO UPDATE SET\n      price=excluded.price,volume=excluded.volume,day_high=excluded.day_high,\n      day_low=excluded.day_low,prev_close=excluded.prev_close,change_pct=excluded.change_pct,\n      updated_at=excluded.updated_at\n  ", [p.symbol, p.price, p.volume, p.day_high, p.day_low, p.prev_close, p.change_pct, p.updated_at])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function screenStocks(f) {
    return __awaiter(this, void 0, void 0, function () {
        var wheres, params, add, allowedSort, sortCol, sortDir, limit, offset;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            wheres = ["s.fetched_at IS NOT NULL", "(s.fetch_error IS NULL OR s.fetch_error = '')"];
            params = [];
            add = function (w, v) { wheres.push(w); params.push(v); };
            if (f.minRoce != null)
                add("s.roce >= ?", f.minRoce);
            if (f.maxRoce != null)
                add("s.roce <= ?", f.maxRoce);
            if (f.maxDe != null)
                add("(s.de_ratio <= ? OR s.de_ratio IS NULL)", f.maxDe);
            if (f.minPromoter != null)
                add("s.promoter_pct >= ?", f.minPromoter);
            if (f.maxPromoter != null)
                add("s.promoter_pct <= ?", f.maxPromoter);
            if (f.minPe != null)
                add("s.pe_ratio >= ?", f.minPe);
            if (f.maxPe != null)
                add("s.pe_ratio <= ?", f.maxPe);
            if (f.minPrice != null)
                add("p.price >= ?", f.minPrice);
            if (f.maxPrice != null)
                add("p.price <= ?", f.maxPrice);
            if (f.minVolume != null)
                add("p.volume >= ?", f.minVolume);
            if (f.minMarketCap != null)
                add("s.market_cap >= ?", f.minMarketCap);
            if (f.maxMarketCap != null)
                add("s.market_cap <= ?", f.maxMarketCap);
            if (f.minDividendYield != null)
                add("s.dividend_yield >= ?", f.minDividendYield);
            if (f.minRoe != null)
                add("s.roe >= ?", f.minRoe);
            if (f.minEps != null)
                add("s.eps >= ?", f.minEps);
            if (f.minCurrentRatio != null)
                add("s.current_ratio >= ?", f.minCurrentRatio);
            // Price/Book: computed as p.price / s.book_value <= maxPbRatio
            if (f.maxPbRatio != null)
                add("(s.book_value > 0 AND (p.price / s.book_value) <= ?)", f.maxPbRatio);
            if (f.minChangePct != null)
                add("p.change_pct >= ?", f.minChangePct);
            if (f.maxChangePct != null)
                add("p.change_pct <= ?", f.maxChangePct);
            // near52High: price within X% below 52W high  =>  price >= 52W_high * (1 - X/100)
            if (f.near52High != null)
                add("(s.week52_high IS NOT NULL AND p.price IS NOT NULL AND p.price >= s.week52_high * (1.0 - ? / 100.0))", f.near52High);
            // near52Low: price within X% above 52W low  =>  price <= 52W_low * (1 + X/100)
            if (f.near52Low != null)
                add("(s.week52_low IS NOT NULL AND p.price IS NOT NULL AND p.price <= s.week52_low * (1.0 + ? / 100.0))", f.near52Low);
            if (f.allProfitable)
                wheres.push("s.all_profitable = 1");
            if (f.profitUptrend)
                wheres.push("s.profit_uptrend = 1");
            if (f.sector)
                add("s.sector = ?", f.sector);
            if (f.symbolsIn && f.symbolsIn.length > 0) {
                wheres.push("s.symbol IN (".concat(f.symbolsIn.map(function () { return '?'; }).join(','), ")"));
                params.push.apply(params, f.symbolsIn);
            }
            allowedSort = {
                roce: "s.roce", roe: "s.roe", de: "s.de_ratio", promoter: "s.promoter_pct",
                pe: "s.pe_ratio", price: "p.price", volume: "p.volume",
                market_cap: "s.market_cap", change_pct: "p.change_pct", dividend: "s.dividend_yield",
                eps: "s.eps", book_value: "s.book_value", current_ratio: "s.current_ratio",
            };
            sortCol = (_a = allowedSort[f.sortBy || "roce"]) !== null && _a !== void 0 ? _a : "s.roce";
            sortDir = f.sortDir === "asc" ? "ASC" : "DESC";
            limit = Math.min((_b = f.limit) !== null && _b !== void 0 ? _b : 100, 500);
            offset = (_c = f.offset) !== null && _c !== void 0 ? _c : 0;
            return [2 /*return*/, dbAll("\n    SELECT s.*, p.price, p.volume, p.day_high, p.day_low, p.prev_close, p.change_pct, p.updated_at\n    FROM stocks s LEFT JOIN prices p ON p.symbol = s.symbol\n    WHERE ".concat(wheres.join(" AND "), "\n    ORDER BY ").concat(sortCol, " ").concat(sortDir, "\n    LIMIT ? OFFSET ?\n  "), __spreadArray(__spreadArray([], params, true), [limit, offset], false))];
        });
    });
}
function getStock(symbol) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, dbGet("\n    SELECT s.*, p.price, p.volume, p.day_high, p.day_low, p.prev_close, p.change_pct, p.updated_at\n    FROM stocks s LEFT JOIN prices p ON p.symbol = s.symbol\n    WHERE s.symbol = ?\n  ", [symbol.toUpperCase()])];
        });
    });
}
function getAllSymbols() {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbAll("SELECT symbol FROM stocks ORDER BY symbol")];
                case 1:
                    rows = _a.sent();
                    return [2 /*return*/, rows.map(function (r) { return r.symbol; })];
            }
        });
    });
}
function getStaleSymbols() {
    return __awaiter(this, arguments, void 0, function (olderThanHours) {
        var cutoff, rows;
        if (olderThanHours === void 0) { olderThanHours = 168; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cutoff = new Date(Date.now() - olderThanHours * 3600 * 1000).toISOString();
                    return [4 /*yield*/, dbAll("SELECT symbol FROM stocks WHERE fetched_at IS NULL OR fetched_at < ? ORDER BY fetched_at ASC LIMIT 500", [cutoff])];
                case 1:
                    rows = _a.sent();
                    return [2 /*return*/, rows.map(function (r) { return r.symbol; })];
            }
        });
    });
}
// Known NSE sectors — used as fallback when DB is sparse
var NSE_SECTORS = [
    "Automobiles", "Aviation", "Banks", "Capital Goods", "Cement",
    "Chemicals", "Construction", "Consumer Goods", "Defence",
    "Diversified", "Electrical Equipment", "Finance", "FMCG",
    "Healthcare", "Information Technology", "Infrastructure",
    "Insurance", "Logistics", "Media & Entertainment", "Metals & Mining",
    "Oil & Gas", "Paints", "Pharmaceuticals", "Power", "Real Estate",
    "Retail", "Sugar", "Telecom", "Textiles", "Trading",
];
function getSectors() {
    return __awaiter(this, void 0, void 0, function () {
        var rows, dbSectors, merged;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbAll("SELECT DISTINCT sector FROM stocks WHERE sector IS NOT NULL AND sector != '' ORDER BY sector")];
                case 1:
                    rows = _a.sent();
                    dbSectors = rows.map(function (r) { return r.sector; });
                    merged = Array.from(new Set(__spreadArray(__spreadArray([], dbSectors, true), NSE_SECTORS, true))).sort();
                    return [2 /*return*/, merged];
            }
        });
    });
}
function getDbStats() {
    return __awaiter(this, void 0, void 0, function () {
        var _a, total, fetched, priced, priceRow;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, Promise.all([
                        dbGet("SELECT COUNT(*) as c FROM stocks"),
                        dbGet("SELECT COUNT(*) as c FROM stocks WHERE fetched_at IS NOT NULL"),
                        dbGet("SELECT COUNT(*) as c FROM prices"),
                        dbGet("SELECT MAX(updated_at) as d FROM prices"),
                    ])];
                case 1:
                    _a = _b.sent(), total = _a[0], fetched = _a[1], priced = _a[2], priceRow = _a[3];
                    return [2 /*return*/, {
                            total: (total === null || total === void 0 ? void 0 : total.c) || 0, fetched: (fetched === null || fetched === void 0 ? void 0 : fetched.c) || 0,
                            priced: (priced === null || priced === void 0 ? void 0 : priced.c) || 0, lastPriceUpdate: (priceRow === null || priceRow === void 0 ? void 0 : priceRow.d) || null,
                        }];
            }
        });
    });
}
// ── Watchlists ────────────────────────────────────────────────────────────────
function getWatchlists(userId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            if (userId != null) {
                return [2 /*return*/, dbAll("\n      SELECT w.*, COUNT(ws.symbol) as stock_count\n      FROM watchlists w LEFT JOIN watchlist_stocks ws ON ws.watchlist_id = w.id\n      WHERE w.user_id = ?\n      GROUP BY w.id ORDER BY w.created_at DESC\n    ", [userId])];
            }
            return [2 /*return*/, dbAll("\n    SELECT w.*, COUNT(ws.symbol) as stock_count\n    FROM watchlists w LEFT JOIN watchlist_stocks ws ON ws.watchlist_id = w.id\n    GROUP BY w.id ORDER BY w.created_at DESC\n  ")];
        });
    });
}
function getWatchlist(id, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var wl, _a, stocks;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!(userId != null)) return [3 /*break*/, 2];
                    return [4 /*yield*/, dbGet("SELECT * FROM watchlists WHERE id = ? AND user_id = ?", [id, userId])];
                case 1:
                    _a = _b.sent();
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, dbGet("SELECT * FROM watchlists WHERE id = ?", [id])];
                case 3:
                    _a = _b.sent();
                    _b.label = 4;
                case 4:
                    wl = _a;
                    if (!wl)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, dbAll("\n    SELECT ws.symbol, ws.notes, ws.added_at, s.roce, s.de_ratio, s.promoter_pct, s.pe_ratio,\n           p.price, p.volume, p.change_pct\n    FROM watchlist_stocks ws\n    LEFT JOIN stocks s ON s.symbol = ws.symbol\n    LEFT JOIN prices p ON p.symbol = ws.symbol\n    WHERE ws.watchlist_id = ?\n    ORDER BY ws.added_at DESC\n  ", [id])];
                case 5:
                    stocks = _b.sent();
                    return [2 /*return*/, __assign(__assign({}, wl), { stocks: stocks })];
            }
        });
    });
}
function createWatchlist(name_1) {
    return __awaiter(this, arguments, void 0, function (name, description, userId) {
        if (description === void 0) { description = ""; }
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    getDb().run("INSERT INTO watchlists (name, description, user_id) VALUES (?, ?, ?)", [name, description, userId !== null && userId !== void 0 ? userId : null], function (err) { if (err)
                        reject(err);
                    else
                        resolve(this.lastID); });
                })];
        });
    });
}
function addToWatchlist(watchlistId_1, symbol_1) {
    return __awaiter(this, arguments, void 0, function (watchlistId, symbol, notes) {
        if (notes === void 0) { notes = ""; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbRun("INSERT OR REPLACE INTO watchlist_stocks (watchlist_id, symbol, notes) VALUES (?, ?, ?)", [watchlistId, symbol.toUpperCase(), notes])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function removeFromWatchlist(watchlistId, symbol) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbRun("DELETE FROM watchlist_stocks WHERE watchlist_id = ? AND symbol = ?", [watchlistId, symbol.toUpperCase()])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function deleteWatchlist(id) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbRun("DELETE FROM watchlists WHERE id = ?", [id])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function createUser(name, email, hashedPassword) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    getDb().run("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", [name, email.toLowerCase(), hashedPassword], function (err) { if (err)
                        reject(err);
                    else
                        resolve(this.lastID); });
                })];
        });
    });
}
function getUserByEmail(email) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, dbGet("SELECT * FROM users WHERE email = ?", [email.toLowerCase()])];
        });
    });
}
function getUserById(id) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, dbGet("SELECT * FROM users WHERE id = ?", [id])];
        });
    });
}
function countUsers() {
    return __awaiter(this, void 0, void 0, function () {
        var row;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, dbGet("SELECT COUNT(*) as c FROM users")];
                case 1:
                    row = _b.sent();
                    return [2 /*return*/, (_a = row === null || row === void 0 ? void 0 : row.c) !== null && _a !== void 0 ? _a : 0];
            }
        });
    });
}
function getAllUsers() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, dbAll("SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC")];
        });
    });
}
function getAlerts(userId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, dbAll("SELECT * FROM alerts WHERE user_id = ? AND active = 1 ORDER BY created_at DESC", [userId])];
        });
    });
}
function createAlert(userId, name, filtersJson) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    getDb().run("INSERT INTO alerts (user_id, name, filters_json) VALUES (?, ?, ?)", [userId, name, filtersJson], function (err) { if (err)
                        reject(err);
                    else
                        resolve(this.lastID); });
                })];
        });
    });
}
function deleteAlert(id, userId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbRun("DELETE FROM alerts WHERE id = ? AND user_id = ?", [id, userId])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function updateAlertLastSent(id) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbRun("UPDATE alerts SET last_sent = datetime('now') WHERE id = ?", [id])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function getAllActiveAlerts() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, dbAll("\n    SELECT a.*, u.email as user_email, u.name as user_name\n    FROM alerts a JOIN users u ON u.id = a.user_id\n    WHERE a.active = 1\n  ")];
        });
    });
}
// ── Password Reset ────────────────────────────────────────────────────────────
function createResetToken(userId, token) {
    return __awaiter(this, void 0, void 0, function () {
        var expiresAt;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: 
                // Expire existing tokens for this user first
                return [4 /*yield*/, dbRun("DELETE FROM password_reset_tokens WHERE user_id = ?", [userId])];
                case 1:
                    // Expire existing tokens for this user first
                    _a.sent();
                    expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
                    return [4 /*yield*/, dbRun("INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)", [token, userId, expiresAt])];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function getResetToken(token) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, dbGet("SELECT user_id, expires_at, used FROM password_reset_tokens WHERE token = ?", [token])];
        });
    });
}
function markResetTokenUsed(token) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbRun("UPDATE password_reset_tokens SET used = 1 WHERE token = ?", [token])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function updateUserPassword(userId, hashedPassword) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbRun("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, userId])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function updateUserName(userId, name) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbRun("UPDATE users SET name = ? WHERE id = ?", [name, userId])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ── Search ────────────────────────────────────────────────────────────────────
function searchStocks(q_1) {
    return __awaiter(this, arguments, void 0, function (q, limit) {
        var esc, like, query, results, prefix, fuzzy, seen, _i, fuzzy_1, r;
        if (limit === void 0) { limit = 10; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    esc = q.replace(/[%_]/g, "\\$&");
                    like = "%" + esc + "%";
                    query = "SELECT symbol, company_name, sector FROM stocks\n     WHERE (symbol LIKE ? ESCAPE '\\' OR company_name LIKE ? ESCAPE '\\')\n     ORDER BY\n       CASE WHEN symbol LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END,\n       CASE WHEN fetched_at IS NOT NULL THEN 0 ELSE 1 END,\n       market_cap DESC NULLS LAST\n     LIMIT ?";
                    return [4 /*yield*/, dbAll(query, [like, like, like, limit])];
                case 1:
                    results = _a.sent();
                    if (!(results.length < 2 && q.length >= 3)) return [3 /*break*/, 3];
                    prefix = esc.slice(0, 4) + "%";
                    return [4 /*yield*/, dbAll(query, [prefix, prefix, prefix, limit])];
                case 2:
                    fuzzy = _a.sent();
                    seen = new Set(results.map(function (r) { return r.symbol; }));
                    for (_i = 0, fuzzy_1 = fuzzy; _i < fuzzy_1.length; _i++) {
                        r = fuzzy_1[_i];
                        if (!seen.has(r.symbol))
                            results.push(r);
                    }
                    _a.label = 3;
                case 3: return [2 /*return*/, results.slice(0, limit)];
            }
        });
    });
}
function getActivePicks() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, dbAll("SELECT * FROM picks WHERE status='active' ORDER BY published_at DESC")];
        });
    });
}
function getAllPicks() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, dbAll("SELECT * FROM picks ORDER BY published_at DESC LIMIT 100")];
        });
    });
}
function createPick(p) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0: return [4 /*yield*/, dbRun("INSERT INTO picks (stock_symbol,company_name,direction,pick_type,entry_low,entry_high,target,stop_loss,reason,risk_level,status,created_by)\n     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [p.stock_symbol, (_a = p.company_name) !== null && _a !== void 0 ? _a : null, p.direction, (_b = p.pick_type) !== null && _b !== void 0 ? _b : 'intraday', p.entry_low, p.entry_high, (_c = p.target) !== null && _c !== void 0 ? _c : null, (_d = p.stop_loss) !== null && _d !== void 0 ? _d : null, p.reason, p.risk_level, p.status, (_e = p.created_by) !== null && _e !== void 0 ? _e : null])];
                case 1:
                    _f.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function updatePickStatus(id, status) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbRun("UPDATE picks SET status=? WHERE id=?", [status, id])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function deletePick(id) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbRun("DELETE FROM picks WHERE id=?", [id])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ── App Settings ──────────────────────────────────────────────────────────────
function getSetting(key) {
    return __awaiter(this, void 0, void 0, function () {
        var r;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, dbGet("SELECT value FROM app_settings WHERE key=?", [key])];
                case 1:
                    r = _b.sent();
                    return [2 /*return*/, (_a = r === null || r === void 0 ? void 0 : r.value) !== null && _a !== void 0 ? _a : ""];
            }
        });
    });
}
function setSetting(key, value) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbRun("INSERT OR REPLACE INTO app_settings (key,value) VALUES (?,?)", [key, value])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function getAllSettings() {
    return __awaiter(this, void 0, void 0, function () {
        var rows, out, _i, rows_1, r;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbAll("SELECT key, value FROM app_settings")];
                case 1:
                    rows = _a.sent();
                    out = {};
                    for (_i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
                        r = rows_1[_i];
                        out[r.key] = r.value;
                    }
                    return [2 /*return*/, out];
            }
        });
    });
}
function createOrder(userId, orderId, amountPaise) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbRun("INSERT INTO subscriptions (user_id,razorpay_order_id,amount,status) VALUES (?,?,?,'pending')", [userId, orderId, amountPaise])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function activateSubscription(orderId, paymentId) {
    return __awaiter(this, void 0, void 0, function () {
        var sub, now, starts, expiry;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbGet("SELECT id, user_id FROM subscriptions WHERE razorpay_order_id=? AND status='pending'", [orderId])];
                case 1:
                    sub = _a.sent();
                    if (!sub)
                        return [2 /*return*/, null];
                    now = new Date();
                    starts = now.toISOString();
                    expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
                    return [4 /*yield*/, dbRun("UPDATE subscriptions SET razorpay_payment_id=?,status='active',starts_at=?,expires_at=? WHERE id=?", [paymentId, starts, expiry, sub.id])];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, dbRun("UPDATE users SET role='premium' WHERE id=?", [sub.user_id])];
                case 3:
                    _a.sent();
                    return [2 /*return*/, sub.user_id];
            }
        });
    });
}
function getActiveSubscription(userId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, dbGet("SELECT * FROM subscriptions WHERE user_id=? AND status='active' AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY id DESC LIMIT 1", [userId])];
        });
    });
}
function expireOldSubscriptions() {
    return __awaiter(this, void 0, void 0, function () {
        var expired, _i, expired_1, r, still;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbAll("SELECT user_id FROM subscriptions WHERE status='active' AND expires_at < datetime('now')")];
                case 1:
                    expired = _a.sent();
                    if (!expired.length)
                        return [2 /*return*/];
                    return [4 /*yield*/, dbRun("UPDATE subscriptions SET status='expired' WHERE status='active' AND expires_at < datetime('now')")];
                case 2:
                    _a.sent();
                    _i = 0, expired_1 = expired;
                    _a.label = 3;
                case 3:
                    if (!(_i < expired_1.length)) return [3 /*break*/, 7];
                    r = expired_1[_i];
                    return [4 /*yield*/, getActiveSubscription(r.user_id)];
                case 4:
                    still = _a.sent();
                    if (!!still) return [3 /*break*/, 6];
                    return [4 /*yield*/, dbRun("UPDATE users SET role='user' WHERE id=? AND role='premium'", [r.user_id])];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 3];
                case 7: return [2 /*return*/];
            }
        });
    });
}
function getAllSubscriptions() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, dbAll("\n    SELECT s.*, u.name as user_name, u.email as user_email\n    FROM subscriptions s JOIN users u ON u.id=s.user_id\n    ORDER BY s.created_at DESC LIMIT 200\n  ")];
        });
    });
}
function getPaperPortfolio(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbGet("SELECT balance FROM paper_portfolio WHERE user_id=?", [userId])];
                case 1:
                    row = _a.sent();
                    if (!!row) return [3 /*break*/, 3];
                    return [4 /*yield*/, dbRun("INSERT OR IGNORE INTO paper_portfolio (user_id,balance) VALUES (?,100000)", [userId])];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { balance: 100000 }];
                case 3: return [2 /*return*/, row];
            }
        });
    });
}
function getPaperPositions(userId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, dbAll("SELECT * FROM paper_positions WHERE user_id=? ORDER BY entry_date DESC", [userId])];
        });
    });
}
function getPaperTrades(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, limit) {
        if (limit === void 0) { limit = 50; }
        return __generator(this, function (_a) {
            return [2 /*return*/, dbAll("SELECT * FROM paper_trades WHERE user_id=? ORDER BY traded_at DESC LIMIT ?", [userId, limit])];
        });
    });
}
function paperBuy(userId_1, symbol_1, companyName_1, qty_1, price_1) {
    return __awaiter(this, arguments, void 0, function (userId, symbol, companyName, qty, price, tradeType, slPrice, targetPrice, orderType) {
        var total, port, newBal, existing, newQty, newAvg, newInv;
        if (tradeType === void 0) { tradeType = 'INTRADAY'; }
        if (orderType === void 0) { orderType = 'MARKET'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    total = parseFloat((qty * price).toFixed(2));
                    return [4 /*yield*/, getPaperPortfolio(userId)];
                case 1:
                    port = _a.sent();
                    if (port.balance < total)
                        return [2 /*return*/, { ok: false, msg: "Insufficient balance. Need \u20B9".concat(total.toFixed(0), ", have \u20B9").concat(port.balance.toFixed(0)), balance: port.balance }];
                    newBal = parseFloat((port.balance - total).toFixed(2));
                    return [4 /*yield*/, dbGet("SELECT * FROM paper_positions WHERE user_id=? AND symbol=?", [userId, symbol])];
                case 2:
                    existing = _a.sent();
                    if (!existing) return [3 /*break*/, 4];
                    newQty = existing.qty + qty;
                    newAvg = parseFloat(((existing.avg_price * existing.qty + price * qty) / newQty).toFixed(4));
                    newInv = parseFloat((existing.invested + total).toFixed(2));
                    return [4 /*yield*/, dbRun("UPDATE paper_positions SET qty=?,avg_price=?,invested=?,sl_price=?,target_price=?,order_type=? WHERE user_id=? AND symbol=?", [newQty, newAvg, newInv, slPrice !== null && slPrice !== void 0 ? slPrice : null, targetPrice !== null && targetPrice !== void 0 ? targetPrice : null, orderType, userId, symbol])];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4: return [4 /*yield*/, dbRun("INSERT INTO paper_positions (user_id,symbol,company_name,qty,avg_price,invested,trade_type,sl_price,target_price,order_type) VALUES (?,?,?,?,?,?,?,?,?,?)", [userId, symbol, companyName, qty, price, total, tradeType, slPrice !== null && slPrice !== void 0 ? slPrice : null, targetPrice !== null && targetPrice !== void 0 ? targetPrice : null, orderType])];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6: return [4 /*yield*/, dbRun("UPDATE paper_portfolio SET balance=? WHERE user_id=?", [newBal, userId])];
                case 7:
                    _a.sent();
                    return [4 /*yield*/, dbRun("INSERT INTO paper_trades (user_id,symbol,company_name,action,qty,price,total,balance_after,trade_type) VALUES (?,?,?,?,?,?,?,?,?)", [userId, symbol, companyName, "BUY", qty, price, total, newBal, tradeType])];
                case 8:
                    _a.sent();
                    return [2 /*return*/, { ok: true, msg: "Bought ".concat(qty, " \u00D7 ").concat(symbol, " @ \u20B9").concat(price), balance: newBal }];
            }
        });
    });
}
function paperSell(userId, symbol, qty, price) {
    return __awaiter(this, void 0, void 0, function () {
        var pos, total, costBasis, pnl, pnlPct, port, newBal, remainQty, remainInv;
        var _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, dbGet("SELECT * FROM paper_positions WHERE user_id=? AND symbol=?", [userId, symbol])];
                case 1:
                    pos = _c.sent();
                    if (!(!pos || pos.qty < qty)) return [3 /*break*/, 3];
                    _a = { ok: false, msg: "Not enough shares. You hold ".concat((_b = pos === null || pos === void 0 ? void 0 : pos.qty) !== null && _b !== void 0 ? _b : 0, " of ").concat(symbol) };
                    return [4 /*yield*/, getPaperPortfolio(userId)];
                case 2: return [2 /*return*/, (_a.balance = (_c.sent()).balance, _a)];
                case 3:
                    total = parseFloat((qty * price).toFixed(2));
                    costBasis = parseFloat((pos.avg_price * qty).toFixed(2));
                    pnl = parseFloat((total - costBasis).toFixed(2));
                    pnlPct = parseFloat((((total - costBasis) / costBasis) * 100).toFixed(2));
                    return [4 /*yield*/, getPaperPortfolio(userId)];
                case 4:
                    port = _c.sent();
                    newBal = parseFloat((port.balance + total).toFixed(2));
                    remainQty = pos.qty - qty;
                    if (!(remainQty === 0)) return [3 /*break*/, 6];
                    return [4 /*yield*/, dbRun("DELETE FROM paper_positions WHERE user_id=? AND symbol=?", [userId, symbol])];
                case 5:
                    _c.sent();
                    return [3 /*break*/, 8];
                case 6:
                    remainInv = parseFloat((pos.invested - costBasis).toFixed(2));
                    return [4 /*yield*/, dbRun("UPDATE paper_positions SET qty=?,invested=? WHERE user_id=? AND symbol=?", [remainQty, remainInv, userId, symbol])];
                case 7:
                    _c.sent();
                    _c.label = 8;
                case 8: return [4 /*yield*/, dbRun("UPDATE paper_portfolio SET balance=? WHERE user_id=?", [newBal, userId])];
                case 9:
                    _c.sent();
                    return [4 /*yield*/, dbRun("INSERT INTO paper_trades (user_id,symbol,company_name,action,qty,price,total,pnl,pnl_pct,balance_after,trade_type) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [userId, symbol, pos.company_name, "SELL", qty, price, total, pnl, pnlPct, newBal, pos.trade_type || 'INTRADAY'])];
                case 10:
                    _c.sent();
                    return [2 /*return*/, { ok: true, msg: "Sold ".concat(qty, " \u00D7 ").concat(symbol, " @ \u20B9").concat(price, " \u00B7 PnL ").concat(pnl >= 0 ? "+" : "", "\u20B9").concat(pnl), balance: newBal }];
            }
        });
    });
}
function paperReset(userId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbRun("DELETE FROM paper_positions WHERE user_id=?", [userId])];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, dbRun("DELETE FROM paper_trades WHERE user_id=?", [userId])];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, dbRun("INSERT OR REPLACE INTO paper_portfolio (user_id,balance) VALUES (?,100000)", [userId])];
                case 3:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ── Mobile OTP ─────────────────────────────────────────────────────────────────
function storePhoneOtp(mobile, otp) {
    return __awaiter(this, void 0, void 0, function () {
        var expiresAt;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbRun("DELETE FROM phone_otps WHERE mobile=? AND used=0", [mobile])];
                case 1:
                    _a.sent();
                    expiresAt = Date.now() + 10 * 60 * 1000;
                    return [4 /*yield*/, dbRun("INSERT INTO phone_otps (mobile,otp,expires_at) VALUES (?,?,?)", [mobile, otp, expiresAt])];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function verifyPhoneOtp(mobile, otp) {
    return __awaiter(this, void 0, void 0, function () {
        var row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbGet("SELECT id, expires_at, used FROM phone_otps WHERE mobile=? AND otp=? ORDER BY id DESC LIMIT 1", [mobile, otp])];
                case 1:
                    row = _a.sent();
                    if (!row || row.used || row.expires_at < Date.now())
                        return [2 /*return*/, false];
                    return [4 /*yield*/, dbRun("UPDATE phone_otps SET used=1 WHERE id=?", [row.id])];
                case 2:
                    _a.sent();
                    return [2 /*return*/, true];
            }
        });
    });
}
function setUserMobile(userId, mobile) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbRun("UPDATE users SET mobile=?, mobile_verified=1 WHERE id=?", [mobile, userId])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function getUserByMobile(mobile) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, dbGet("SELECT * FROM users WHERE mobile=?", [mobile])];
        });
    });
}
function countPaperTrades(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var r;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, dbGet("SELECT COUNT(*) as c FROM paper_trades WHERE user_id=?", [userId])];
                case 1:
                    r = _b.sent();
                    return [2 /*return*/, (_a = r === null || r === void 0 ? void 0 : r.c) !== null && _a !== void 0 ? _a : 0];
            }
        });
    });
}
// ── Paper Trade Config ─────────────────────────────────────────────────────────
function getPaperTradeConfig(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var row, def;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dbGet("SELECT * FROM paper_trade_config WHERE user_id=?", [userId])];
                case 1:
                    row = _a.sent();
                    if (!!row) return [3 /*break*/, 3];
                    def = { user_id: userId, trade_type: 'INTRADAY', default_qty: 1, default_sl_pct: 2.0, default_tgt_pct: 4.0, max_positions: 10 };
                    return [4 /*yield*/, dbRun("INSERT OR IGNORE INTO paper_trade_config (user_id,trade_type,default_qty,default_sl_pct,default_tgt_pct,max_positions) VALUES (?,?,?,?,?,?)", [userId, def.trade_type, def.default_qty, def.default_sl_pct, def.default_tgt_pct, def.max_positions])];
                case 2:
                    _a.sent();
                    return [2 /*return*/, def];
                case 3: return [2 /*return*/, row];
            }
        });
    });
}
function savePaperTradeConfig(userId, config) {
    return __awaiter(this, void 0, void 0, function () {
        var cur, m;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getPaperTradeConfig(userId)];
                case 1:
                    cur = _a.sent();
                    m = __assign(__assign({}, cur), config);
                    return [4 /*yield*/, dbRun("INSERT OR REPLACE INTO paper_trade_config (user_id,trade_type,default_qty,default_sl_pct,default_tgt_pct,max_positions,updated_at)\n     VALUES (?,?,?,?,?,?,datetime('now','localtime'))", [userId, m.trade_type, m.default_qty, m.default_sl_pct, m.default_tgt_pct, m.max_positions])];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
