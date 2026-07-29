"use strict";
/**
 * db.ts — SQLite database layer for ZeroScreen
 * Uses sqlite3 with promise wrappers
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
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
exports.initPaperPortfolio = initPaperPortfolio;
exports.getUserByEmail = getUserByEmail;
exports.getUserById = getUserById;
exports.countUsers = countUsers;
exports.getAllUsers = getAllUsers;
exports.updateUserNotifyPicks = updateUserNotifyPicks;
exports.setPaperBalance = setPaperBalance;
exports.setTelegramChatId = setTelegramChatId;
exports.getTelegramSubscribers = getTelegramSubscribers;
exports.getOrCreateReferralCode = getOrCreateReferralCode;
exports.getUserByReferralCode = getUserByReferralCode;
exports.applyReferral = applyReferral;
exports.getReferralStats = getReferralStats;
exports.getPicksEmailSubscribers = getPicksEmailSubscribers;
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
exports.updatePickResult = updatePickResult;
exports.updatePickEntry = updatePickEntry;
exports.triggerPickNow = triggerPickNow;
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
exports.countTodayPaperBuys = countTodayPaperBuys;
exports.getPaperTradeStats = getPaperTradeStats;
exports.getPaperTradeConfig = getPaperTradeConfig;
exports.savePaperTradeConfig = savePaperTradeConfig;
exports.saveBotState = saveBotState;
exports.getBotState = getBotState;
exports.saveBotTrade = saveBotTrade;
exports.getBotTrades = getBotTrades;
exports.getUsersWithAutoPicks = getUsersWithAutoPicks;
exports.setAutoPaperPicks = setAutoPaperPicks;
exports.getAutoPaperPicks = getAutoPaperPicks;
exports.getPublishedPosts = getPublishedPosts;
exports.getAllBlogPosts = getAllBlogPosts;
exports.getBlogPost = getBlogPost;
exports.createBlogPost = createBlogPost;
exports.updateBlogPost = updateBlogPost;
exports.publishBlogPost = publishBlogPost;
exports.unpublishBlogPost = unpublishBlogPost;
exports.deleteBlogPost = deleteBlogPost;
exports.getOrCreateReport = getOrCreateReport;
exports.getReportOwner = getReportOwner;
exports.getPublishedPremiumPicks = getPublishedPremiumPicks;
exports.getAllPremiumPicks = getAllPremiumPicks;
exports.createPremiumPick = createPremiumPick;
exports.updatePremiumPick = updatePremiumPick;
exports.publishPremiumPick = publishPremiumPick;
exports.unpublishPremiumPick = unpublishPremiumPick;
exports.deletePremiumPick = deletePremiumPick;
exports.getPaperLeaderboard = getPaperLeaderboard;
exports.getUserPriceAlerts = getUserPriceAlerts;
exports.createPriceAlert = createPriceAlert;
exports.deletePriceAlert = deletePriceAlert;
exports.triggerPriceAlert = triggerPriceAlert;
exports.getAllActivePriceAlerts = getAllActivePriceAlerts;
exports.getStockNote = getStockNote;
exports.saveStockNote = saveStockNote;
exports.getAllStockNotes = getAllStockNotes;
const sqlite3_1 = __importDefault(require("sqlite3"));
const path_1 = __importDefault(require("path"));
const schema_1 = require("./command-center/schema");
const DB_PATH = path_1.default.join(__dirname, "..", "zeroscreen.db");
let _db = null;
function getDb() {
    if (_db)
        return _db;
    _db = new sqlite3_1.default.Database(DB_PATH);
    return _db;
}
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDb().run(sql, params, (err) => { if (err)
            reject(err);
        else
            resolve(); });
    });
}
function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDb().all(sql, params, (err, rows) => { if (err)
            reject(err);
        else
            resolve(rows); });
    });
}
function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDb().get(sql, params, (err, row) => { if (err)
            reject(err);
        else
            resolve(row || null); });
    });
}
async function initDb() {
    const db = getDb();
    await new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run("PRAGMA journal_mode = WAL");
            db.run("PRAGMA foreign_keys = ON");
            db.run(`CREATE TABLE IF NOT EXISTS stocks (
        symbol          TEXT PRIMARY KEY,
        company_name    TEXT,
        sector          TEXT,
        market_cap      REAL,
        pe_ratio        REAL,
        roce            REAL,
        roe             REAL,
        de_ratio        REAL,
        promoter_pct    REAL,
        net_profit_1    REAL,
        net_profit_2    REAL,
        net_profit_3    REAL,
        revenue_1       REAL,
        revenue_2       REAL,
        revenue_3       REAL,
        eps             REAL,
        book_value      REAL,
        dividend_yield  REAL,
        current_ratio   REAL,
        all_profitable  INTEGER DEFAULT 0,
        profit_uptrend  INTEGER DEFAULT 0,
        screener_data   TEXT,
        fetched_at      TEXT,
        fetch_error     TEXT
      )`);
            db.run(`CREATE TABLE IF NOT EXISTS prices (
        symbol     TEXT PRIMARY KEY,
        price      REAL,
        volume     INTEGER,
        day_high   REAL,
        day_low    REAL,
        prev_close REAL,
        change_pct REAL,
        updated_at TEXT
      )`);
            db.run(`CREATE TABLE IF NOT EXISTS watchlists (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        description TEXT,
        created_at  TEXT DEFAULT (datetime('now')),
        updated_at  TEXT DEFAULT (datetime('now'))
      )`);
            db.run(`CREATE TABLE IF NOT EXISTS watchlist_stocks (
        watchlist_id INTEGER REFERENCES watchlists(id) ON DELETE CASCADE,
        symbol       TEXT NOT NULL,
        added_at     TEXT DEFAULT (datetime('now')),
        notes        TEXT,
        PRIMARY KEY (watchlist_id, symbol)
      )`);
            db.run(`CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        email      TEXT NOT NULL UNIQUE,
        password   TEXT NOT NULL,
        role       TEXT NOT NULL DEFAULT 'user',
        created_at TEXT DEFAULT (datetime('now'))
      )`);
            db.run("CREATE INDEX IF NOT EXISTS idx_stocks_roce ON stocks(roce)");
            db.run("CREATE INDEX IF NOT EXISTS idx_stocks_de ON stocks(de_ratio)");
            db.run("CREATE INDEX IF NOT EXISTS idx_prices_volume ON prices(volume)");
            db.run("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");
            // Migrations (safe — errors ignored if column already exists)
            db.run("ALTER TABLE watchlists ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL", () => { });
            db.run(`CREATE TABLE IF NOT EXISTS alerts (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        filters_json TEXT NOT NULL,
        last_sent    TEXT,
        active       INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT DEFAULT (datetime('now'))
      )`);
            db.run("CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id)");
            // ── Price Alerts ──────────────────────────────────────────────────────────
            db.run(`CREATE TABLE IF NOT EXISTS price_alerts (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol       TEXT NOT NULL,
        target_price REAL NOT NULL,
        direction    TEXT NOT NULL DEFAULT 'above',
        note         TEXT,
        active       INTEGER NOT NULL DEFAULT 1,
        triggered_at TEXT,
        created_at   TEXT DEFAULT (datetime('now','localtime'))
      )`);
            db.run("CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts(user_id, active)");
            // ── Stock Notes ───────────────────────────────────────────────────────────
            db.run(`CREATE TABLE IF NOT EXISTS stock_notes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol     TEXT NOT NULL,
        content    TEXT NOT NULL DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now','localtime')),
        UNIQUE(user_id, symbol)
      )`);
            db.run("CREATE INDEX IF NOT EXISTS idx_stock_notes_user ON stock_notes(user_id)");
            db.run(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token      TEXT PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        used       INTEGER NOT NULL DEFAULT 0
      )`);
            db.run("CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists(user_id)");
            // 52-week range columns (migration — safe if already exist)
            db.run("ALTER TABLE stocks ADD COLUMN week52_high REAL", () => { });
            db.run("ALTER TABLE stocks ADD COLUMN week52_low  REAL", () => { });
            // Company about / incorporation year (migration)
            db.run("ALTER TABLE stocks ADD COLUMN about TEXT", () => { });
            db.run("ALTER TABLE stocks ADD COLUMN incorporated INTEGER", () => { });
            db.run("CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id)");
            // ── Analytics ───────────────────────────────────────────────────────────
            db.run(`CREATE TABLE IF NOT EXISTS page_views (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        path        TEXT NOT NULL,
        ip_hash     TEXT,
        user_agent  TEXT,
        referrer    TEXT,
        is_logged_in INTEGER DEFAULT 0,
        created_at  TEXT DEFAULT (datetime('now','localtime'))
      )`);
            db.run("CREATE INDEX IF NOT EXISTS idx_pv_path ON page_views(path)");
            db.run("CREATE INDEX IF NOT EXISTS idx_pv_created ON page_views(created_at)");
            // ── Custom strategies ────────────────────────────────────────────────────
            db.run(`CREATE TABLE IF NOT EXISTS custom_strategies (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        description TEXT,
        text_input  TEXT,
        filters_json TEXT NOT NULL,
        created_at  TEXT DEFAULT (datetime('now','localtime'))
      )`);
            // ── Google OAuth ─────────────────────────────────────────────────────────
            db.run("ALTER TABLE users ADD COLUMN google_id TEXT", () => { });
            db.run("ALTER TABLE users ADD COLUMN avatar_url TEXT", () => { });
            // ── Picks ────────────────────────────────────────────────────────────────
            db.run(`CREATE TABLE IF NOT EXISTS picks (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        stock_symbol TEXT NOT NULL,
        company_name TEXT,
        direction    TEXT NOT NULL DEFAULT 'LONG',
        pick_type    TEXT NOT NULL DEFAULT 'intraday',
        entry_low    REAL NOT NULL,
        entry_high   REAL NOT NULL,
        target       REAL,
        stop_loss    REAL,
        reason       TEXT NOT NULL,
        risk_level   TEXT NOT NULL DEFAULT 'Medium',
        status       TEXT NOT NULL DEFAULT 'active',
        published_at TEXT DEFAULT (datetime('now','localtime')),
        expires_at   TEXT,
        created_by   INTEGER REFERENCES users(id)
      )`);
            db.run("CREATE INDEX IF NOT EXISTS idx_picks_status ON picks(status)");
            db.run(`ALTER TABLE picks ADD COLUMN pick_type TEXT NOT NULL DEFAULT 'intraday'`, () => { });
            db.run(`ALTER TABLE picks ADD COLUMN entry_price REAL`, () => { });
            db.run(`ALTER TABLE picks ADD COLUMN result TEXT`, () => { });
            db.run(`ALTER TABLE picks ADD COLUMN result_price REAL`, () => { });
            db.run(`ALTER TABLE picks ADD COLUMN result_at TEXT`, () => { });
            // ── App settings ─────────────────────────────────────────────────────────
            db.run(`CREATE TABLE IF NOT EXISTS app_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
      )`);
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('telegram_link','')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('home_headline','India''s sharpest NSE screener')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('signals_mode','live')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('banner_text','')");
            // ── Subscriptions ─────────────────────────────────────────────────────────
            db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         INTEGER NOT NULL REFERENCES users(id),
        razorpay_order_id    TEXT,
        razorpay_payment_id  TEXT,
        razorpay_sub_id      TEXT,
        plan            TEXT NOT NULL DEFAULT 'monthly',
        amount          INTEGER NOT NULL DEFAULT 49900,
        currency        TEXT NOT NULL DEFAULT 'INR',
        status          TEXT NOT NULL DEFAULT 'pending',
        starts_at       TEXT,
        expires_at      TEXT,
        coupon_code     TEXT,
        created_at      TEXT DEFAULT (datetime('now','localtime'))
      )`);
            db.run("CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id)");
            db.run("CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions(status)");
            // ── Referrals ──────────────────────────────────────────────────────────────
            db.run(`ALTER TABLE users ADD COLUMN referral_code TEXT`, () => { });
            db.run(`ALTER TABLE users ADD COLUMN referred_by   TEXT`, () => { });
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('razorpay_enabled','false')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('premium_price_paise','49900')");
            // ── User Paper Trading ────────────────────────────────────────────────────
            db.run(`CREATE TABLE IF NOT EXISTS paper_portfolio (
        user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        balance    REAL    NOT NULL DEFAULT 100000,
        created_at TEXT    DEFAULT (datetime('now','localtime'))
      )`);
            db.run(`CREATE TABLE IF NOT EXISTS paper_positions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol       TEXT    NOT NULL,
        company_name TEXT,
        qty          INTEGER NOT NULL,
        avg_price    REAL    NOT NULL,
        invested     REAL    NOT NULL,
        entry_date   TEXT    DEFAULT (datetime('now','localtime')),
        UNIQUE(user_id, symbol)
      )`);
            db.run(`CREATE TABLE IF NOT EXISTS paper_trades (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol       TEXT    NOT NULL,
        company_name TEXT,
        action       TEXT    NOT NULL,
        qty          INTEGER NOT NULL,
        price        REAL    NOT NULL,
        total        REAL    NOT NULL,
        pnl          REAL,
        pnl_pct      REAL,
        balance_after REAL   NOT NULL,
        traded_at    TEXT    DEFAULT (datetime('now','localtime'))
      )`);
            db.run("CREATE INDEX IF NOT EXISTS idx_pt_user ON paper_trades(user_id)");
            db.run("CREATE INDEX IF NOT EXISTS idx_pp_user ON paper_positions(user_id)");
            // ── Mobile OTP ───────────────────────────────────────────────────────────
            db.run(`CREATE TABLE IF NOT EXISTS phone_otps (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        mobile     TEXT NOT NULL,
        otp        TEXT NOT NULL,
        purpose    TEXT NOT NULL DEFAULT 'verify',
        expires_at INTEGER NOT NULL,
        used       INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )`);
            db.run("CREATE INDEX IF NOT EXISTS idx_otps_mobile ON phone_otps(mobile)");
            // ── Paper Trade Config ────────────────────────────────────────────────────
            db.run(`CREATE TABLE IF NOT EXISTS paper_trade_config (
        user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        trade_type      TEXT    NOT NULL DEFAULT 'INTRADAY',
        default_qty     INTEGER NOT NULL DEFAULT 1,
        default_sl_pct  REAL    NOT NULL DEFAULT 2.0,
        default_tgt_pct REAL    NOT NULL DEFAULT 4.0,
        max_positions   INTEGER NOT NULL DEFAULT 10,
        updated_at      TEXT    DEFAULT (datetime('now','localtime'))
      )`);
            // Mobile verification & trade_type migrations (safe — errors ignored)
            db.run("ALTER TABLE users ADD COLUMN mobile TEXT", () => { });
            db.run("ALTER TABLE users ADD COLUMN mobile_verified INTEGER NOT NULL DEFAULT 0", () => { });
            db.run("ALTER TABLE paper_positions ADD COLUMN trade_type TEXT NOT NULL DEFAULT 'INTRADAY'", () => { });
            db.run("ALTER TABLE paper_trades ADD COLUMN trade_type TEXT NOT NULL DEFAULT 'INTRADAY'", () => { });
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('paper_free_limit','10')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('otp_required','true')");
            // Auto paper picks opt-in (safe migration)
            db.run("ALTER TABLE users ADD COLUMN auto_paper_picks INTEGER NOT NULL DEFAULT 0", () => { });
            // Daily picks email notification opt-in (safe migration)
            db.run("ALTER TABLE users ADD COLUMN notify_picks INTEGER NOT NULL DEFAULT 1", () => { });
            // Auto paper mode & custom stocks (safe migration)
            db.run("ALTER TABLE paper_trade_config ADD COLUMN auto_paper_mode TEXT NOT NULL DEFAULT 'picks'", () => { });
            db.run("ALTER TABLE paper_trade_config ADD COLUMN auto_paper_stocks TEXT NOT NULL DEFAULT '[]'", () => { });
            // Telegram chat ID for premium signal alerts (safe migration)
            db.run("ALTER TABLE users ADD COLUMN telegram_chat_id TEXT", () => { });
            // SL / Target / OrderType on positions (safe migrations)
            db.run("ALTER TABLE paper_positions ADD COLUMN sl_price REAL", () => { });
            db.run("ALTER TABLE paper_positions ADD COLUMN target_price REAL", () => { });
            db.run("ALTER TABLE paper_positions ADD COLUMN order_type TEXT", () => { });
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
            // ── Bot state / trades (webhook push from trading bot) ───────────────────
            db.run(`CREATE TABLE IF NOT EXISTS bot_state (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        data_json   TEXT NOT NULL DEFAULT '{}',
        updated_at  TEXT DEFAULT (datetime('now','localtime'))
      )`);
            db.run("INSERT OR IGNORE INTO bot_state (id, data_json) VALUES (1, '{}')");
            db.run(`CREATE TABLE IF NOT EXISTS bot_trades (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol      TEXT,
        direction   TEXT,
        entry_price REAL,
        exit_price  REAL,
        qty         INTEGER,
        pnl         REAL,
        exit_reason TEXT,
        trade_date  TEXT,
        duration    TEXT,
        raw_json    TEXT,
        created_at  TEXT DEFAULT (datetime('now','localtime'))
      )`);
            db.run("CREATE INDEX IF NOT EXISTS idx_bot_trades_date ON bot_trades(trade_date)");
            // ── Blog posts ────────────────────────────────────────────────────────────
            db.run(`CREATE TABLE IF NOT EXISTS blog_posts (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        slug         TEXT UNIQUE NOT NULL,
        title        TEXT NOT NULL,
        excerpt      TEXT,
        content      TEXT NOT NULL DEFAULT '',
        published    INTEGER NOT NULL DEFAULT 0,
        published_at TEXT,
        author_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at   TEXT DEFAULT (datetime('now','localtime'))
      )`);
            db.run("CREATE INDEX IF NOT EXISTS idx_blog_slug ON blog_posts(slug)");
            db.run("CREATE INDEX IF NOT EXISTS idx_blog_pub ON blog_posts(published, published_at)");
            // ── Shareable paper trade reports ─────────────────────────────────────────
            db.run(`CREATE TABLE IF NOT EXISTS paper_reports (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id  TEXT UNIQUE NOT NULL,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )`);
            db.run("CREATE INDEX IF NOT EXISTS idx_paper_report_id ON paper_reports(report_id)");
            // ── Premium Strategy Picks ────────────────────────────────────────────────
            db.run(`CREATE TABLE IF NOT EXISTS premium_picks (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol       TEXT NOT NULL,
        company_name TEXT,
        strategy     TEXT NOT NULL DEFAULT 'Swing',
        entry_low    REAL NOT NULL,
        entry_high   REAL NOT NULL,
        target       REAL,
        stop_loss    REAL,
        timeframe    TEXT NOT NULL DEFAULT 'Short-term',
        thesis       TEXT NOT NULL DEFAULT '',
        published    INTEGER NOT NULL DEFAULT 0,
        published_at TEXT,
        created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at   TEXT DEFAULT (datetime('now','localtime'))
      )`);
            db.run("CREATE INDEX IF NOT EXISTS idx_pp_published ON premium_picks(published, published_at)");
            db.run("CREATE INDEX IF NOT EXISTS idx_reset_tokens_user3 ON password_reset_tokens(user_id)");
            // ── Command Center (CC-002) — additive session/trading schema ─────────
            (0, schema_1.initCommandCenterSchema)(db);
            // ── Command Center (CC-010) — rollout feature flags, safe defaults ────
            // Same app_settings/featureGate convention as every other ZeroScreen
            // feature flag above. All higher-risk flags default OFF; only the
            // page itself (read-only) defaults on, per CC-010's Stage 1 plan.
            // No route currently reads these — see docs/command-center/feature-flags.md.
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('commandCenterEnabled','true')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('commandCenterReadOnly','true')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('commandCenterControlsEnabled','false')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('simulationSessionsEnabled','false')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('paperSessionsEnabled','false')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('shadowSessionsEnabled','false')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('backtestSessionsEnabled','false')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('additionalLiveSessionsEnabled','false')");
            db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('emergencyControlsEnabled','false')");
            db.run("PRAGMA foreign_key_check", (err) => {
                if (err)
                    resolve();
                else
                    resolve();
            });
        });
    });
}
// ── Upserts ───────────────────────────────────────────────────────────────────
async function upsertStock(s) {
    const d = {
        company_name: null, sector: null, market_cap: null, pe_ratio: null, roce: null,
        roe: null, de_ratio: null, promoter_pct: null,
        net_profit_1: null, net_profit_2: null, net_profit_3: null,
        revenue_1: null, revenue_2: null, revenue_3: null,
        eps: null, book_value: null, dividend_yield: null, current_ratio: null,
        all_profitable: 0, profit_uptrend: 0,
        week52_high: null, week52_low: null,
        about: null, incorporated: null,
        screener_data: null, fetched_at: null, fetch_error: null,
        ...s,
    };
    await dbRun(`
    INSERT INTO stocks (symbol,company_name,sector,market_cap,pe_ratio,roce,roe,de_ratio,
      promoter_pct,net_profit_1,net_profit_2,net_profit_3,revenue_1,revenue_2,revenue_3,
      eps,book_value,dividend_yield,current_ratio,all_profitable,profit_uptrend,
      week52_high,week52_low,about,incorporated,screener_data,fetched_at,fetch_error)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(symbol) DO UPDATE SET
      company_name=excluded.company_name,sector=excluded.sector,market_cap=excluded.market_cap,
      pe_ratio=excluded.pe_ratio,roce=excluded.roce,roe=excluded.roe,de_ratio=excluded.de_ratio,
      promoter_pct=excluded.promoter_pct,net_profit_1=excluded.net_profit_1,
      net_profit_2=excluded.net_profit_2,net_profit_3=excluded.net_profit_3,
      revenue_1=excluded.revenue_1,revenue_2=excluded.revenue_2,revenue_3=excluded.revenue_3,
      eps=excluded.eps,book_value=excluded.book_value,dividend_yield=excluded.dividend_yield,
      current_ratio=excluded.current_ratio,all_profitable=excluded.all_profitable,
      profit_uptrend=excluded.profit_uptrend,week52_high=excluded.week52_high,
      week52_low=excluded.week52_low,about=excluded.about,incorporated=excluded.incorporated,
      screener_data=excluded.screener_data,
      fetched_at=excluded.fetched_at,fetch_error=excluded.fetch_error
  `, [d.symbol, d.company_name, d.sector, d.market_cap, d.pe_ratio, d.roce, d.roe, d.de_ratio,
        d.promoter_pct, d.net_profit_1, d.net_profit_2, d.net_profit_3,
        d.revenue_1, d.revenue_2, d.revenue_3,
        d.eps, d.book_value, d.dividend_yield, d.current_ratio,
        d.all_profitable, d.profit_uptrend, d.week52_high, d.week52_low,
        d.about, d.incorporated,
        d.screener_data, d.fetched_at, d.fetch_error]);
}
async function upsertPrice(p) {
    await dbRun(`
    INSERT INTO prices (symbol,price,volume,day_high,day_low,prev_close,change_pct,updated_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(symbol) DO UPDATE SET
      price=excluded.price,volume=excluded.volume,day_high=excluded.day_high,
      day_low=excluded.day_low,prev_close=excluded.prev_close,change_pct=excluded.change_pct,
      updated_at=excluded.updated_at
  `, [p.symbol, p.price, p.volume, p.day_high, p.day_low, p.prev_close, p.change_pct, p.updated_at]);
}
async function screenStocks(f) {
    const wheres = ["s.fetched_at IS NOT NULL", "(s.fetch_error IS NULL OR s.fetch_error = '')"];
    const params = [];
    const add = (w, v) => { wheres.push(w); params.push(v); };
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
        wheres.push(`s.symbol IN (${f.symbolsIn.map(() => '?').join(',')})`);
        params.push(...f.symbolsIn);
    }
    const allowedSort = {
        roce: "s.roce", roe: "s.roe", de: "s.de_ratio", promoter: "s.promoter_pct",
        pe: "s.pe_ratio", price: "p.price", volume: "p.volume",
        market_cap: "s.market_cap", change_pct: "p.change_pct", dividend: "s.dividend_yield",
        eps: "s.eps", book_value: "s.book_value", current_ratio: "s.current_ratio",
    };
    const sortCol = allowedSort[f.sortBy || "roce"] ?? "s.roce";
    const sortDir = f.sortDir === "asc" ? "ASC" : "DESC";
    const limit = Math.min(f.limit ?? 100, 500);
    const offset = f.offset ?? 0;
    return dbAll(`
    SELECT s.*, p.price, p.volume, p.day_high, p.day_low, p.prev_close, p.change_pct, p.updated_at
    FROM stocks s LEFT JOIN prices p ON p.symbol = s.symbol
    WHERE ${wheres.join(" AND ")}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);
}
async function getStock(symbol) {
    return dbGet(`
    SELECT s.*, p.price, p.volume, p.day_high, p.day_low, p.prev_close, p.change_pct, p.updated_at
    FROM stocks s LEFT JOIN prices p ON p.symbol = s.symbol
    WHERE s.symbol = ?
  `, [symbol.toUpperCase()]);
}
async function getAllSymbols() {
    const rows = await dbAll("SELECT symbol FROM stocks ORDER BY symbol");
    return rows.map(r => r.symbol);
}
async function getStaleSymbols(olderThanHours = 168) {
    const cutoff = new Date(Date.now() - olderThanHours * 3600 * 1000).toISOString();
    const rows = await dbAll("SELECT symbol FROM stocks WHERE fetched_at IS NULL OR fetched_at < ? ORDER BY fetched_at ASC LIMIT 500", [cutoff]);
    return rows.map(r => r.symbol);
}
// Known NSE sectors — used as fallback when DB is sparse
const NSE_SECTORS = [
    "Automobiles", "Aviation", "Banks", "Capital Goods", "Cement",
    "Chemicals", "Construction", "Consumer Goods", "Defence",
    "Diversified", "Electrical Equipment", "Finance", "FMCG",
    "Healthcare", "Information Technology", "Infrastructure",
    "Insurance", "Logistics", "Media & Entertainment", "Metals & Mining",
    "Oil & Gas", "Paints", "Pharmaceuticals", "Power", "Real Estate",
    "Retail", "Sugar", "Telecom", "Textiles", "Trading",
];
async function getSectors() {
    const rows = await dbAll("SELECT DISTINCT sector FROM stocks WHERE sector IS NOT NULL AND sector != '' ORDER BY sector");
    const dbSectors = rows.map(r => r.sector);
    // Merge DB sectors with known NSE sectors, deduplicate, sort
    const merged = Array.from(new Set([...dbSectors, ...NSE_SECTORS])).sort();
    return merged;
}
async function getDbStats() {
    const [total, fetched, priced, priceRow] = await Promise.all([
        dbGet("SELECT COUNT(*) as c FROM stocks"),
        dbGet("SELECT COUNT(*) as c FROM stocks WHERE fetched_at IS NOT NULL"),
        dbGet("SELECT COUNT(*) as c FROM prices"),
        dbGet("SELECT MAX(updated_at) as d FROM prices"),
    ]);
    return {
        total: total?.c || 0, fetched: fetched?.c || 0,
        priced: priced?.c || 0, lastPriceUpdate: priceRow?.d || null,
    };
}
// ── Watchlists ────────────────────────────────────────────────────────────────
async function getWatchlists(userId) {
    if (userId != null) {
        return dbAll(`
      SELECT w.*, COUNT(ws.symbol) as stock_count
      FROM watchlists w LEFT JOIN watchlist_stocks ws ON ws.watchlist_id = w.id
      WHERE w.user_id = ?
      GROUP BY w.id ORDER BY w.created_at DESC
    `, [userId]);
    }
    return dbAll(`
    SELECT w.*, COUNT(ws.symbol) as stock_count
    FROM watchlists w LEFT JOIN watchlist_stocks ws ON ws.watchlist_id = w.id
    GROUP BY w.id ORDER BY w.created_at DESC
  `);
}
async function getWatchlist(id, userId) {
    const wl = userId != null
        ? await dbGet("SELECT * FROM watchlists WHERE id = ? AND user_id = ?", [id, userId])
        : await dbGet("SELECT * FROM watchlists WHERE id = ?", [id]);
    if (!wl)
        return null;
    const stocks = await dbAll(`
    SELECT ws.symbol, ws.notes, ws.added_at, s.roce, s.de_ratio, s.promoter_pct, s.pe_ratio,
           p.price, p.volume, p.change_pct
    FROM watchlist_stocks ws
    LEFT JOIN stocks s ON s.symbol = ws.symbol
    LEFT JOIN prices p ON p.symbol = ws.symbol
    WHERE ws.watchlist_id = ?
    ORDER BY ws.added_at DESC
  `, [id]);
    return { ...wl, stocks };
}
async function createWatchlist(name, description = "", userId) {
    return new Promise((resolve, reject) => {
        getDb().run("INSERT INTO watchlists (name, description, user_id) VALUES (?, ?, ?)", [name, description, userId ?? null], function (err) { if (err)
            reject(err);
        else
            resolve(this.lastID); });
    });
}
async function addToWatchlist(watchlistId, symbol, notes = "") {
    await dbRun("INSERT OR REPLACE INTO watchlist_stocks (watchlist_id, symbol, notes) VALUES (?, ?, ?)", [watchlistId, symbol.toUpperCase(), notes]);
}
async function removeFromWatchlist(watchlistId, symbol) {
    await dbRun("DELETE FROM watchlist_stocks WHERE watchlist_id = ? AND symbol = ?", [watchlistId, symbol.toUpperCase()]);
}
async function deleteWatchlist(id) {
    await dbRun("DELETE FROM watchlists WHERE id = ?", [id]);
}
async function createUser(name, email, hashedPassword) {
    return new Promise((resolve, reject) => {
        getDb().run("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", [name, email.toLowerCase(), hashedPassword], function (err) { if (err)
            reject(err);
        else
            resolve(this.lastID); });
    });
}
// Creates paper_portfolio row for new user (idempotent — safe to call multiple times)
async function initPaperPortfolio(userId) {
    await dbRun("INSERT OR IGNORE INTO paper_portfolio (user_id, balance) VALUES (?, 100000)", [userId]);
}
async function getUserByEmail(email) {
    return dbGet("SELECT * FROM users WHERE email = ?", [email.toLowerCase()]);
}
async function getUserById(id) {
    return dbGet("SELECT * FROM users WHERE id = ?", [id]);
}
async function countUsers() {
    const row = await dbGet("SELECT COUNT(*) as c FROM users");
    return row?.c ?? 0;
}
async function getAllUsers() {
    return dbAll("SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC");
}
async function updateUserNotifyPicks(userId, value) {
    await dbRun("UPDATE users SET notify_picks = ? WHERE id = ?", [value, userId]);
}
async function setPaperBalance(userId, amount) {
    await dbRun("INSERT INTO paper_portfolio (user_id, balance) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance", [userId, amount]);
}
async function setTelegramChatId(userId, chatId) {
    await dbRun("UPDATE users SET telegram_chat_id = ? WHERE id = ?", [chatId || null, userId]);
}
async function getTelegramSubscribers() {
    return dbAll("SELECT id, name, telegram_chat_id FROM users WHERE role IN ('premium','admin') AND telegram_chat_id IS NOT NULL AND telegram_chat_id != ''");
}
// ── Referral helpers ──────────────────────────────────────────────────────────
async function getOrCreateReferralCode(userId) {
    const row = await dbGet("SELECT referral_code FROM users WHERE id=?", [userId]);
    if (row?.referral_code)
        return row.referral_code;
    const code = require("crypto").randomBytes(4).toString("hex").toUpperCase(); // 8-char
    await dbRun("UPDATE users SET referral_code=? WHERE id=?", [code, userId]);
    return code;
}
async function getUserByReferralCode(code) {
    return dbGet("SELECT id, name FROM users WHERE referral_code=?", [code]);
}
async function applyReferral(newUserId, referrerCode) {
    // Set referred_by on new user
    await dbRun("UPDATE users SET referred_by=? WHERE id=?", [referrerCode, newUserId]);
    // Give referrer a ₹10,000 bonus in paper portfolio
    const referrer = await getUserByReferralCode(referrerCode);
    if (referrer) {
        await dbRun("UPDATE paper_portfolio SET balance = balance + 10000 WHERE user_id=?", [referrer.id]);
    }
}
async function getReferralStats(userId) {
    const code = await getOrCreateReferralCode(userId);
    const rows = await dbAll("SELECT id FROM users WHERE referred_by=?", [code]);
    return { code, count: rows.length, bonusEarned: rows.length * 10000 };
}
// Returns users who opted in to daily picks emails
async function getPicksEmailSubscribers() {
    return dbAll("SELECT name, email FROM users WHERE notify_picks = 1");
}
async function getAlerts(userId) {
    return dbAll("SELECT * FROM alerts WHERE user_id = ? AND active = 1 ORDER BY created_at DESC", [userId]);
}
async function createAlert(userId, name, filtersJson) {
    return new Promise((resolve, reject) => {
        getDb().run("INSERT INTO alerts (user_id, name, filters_json) VALUES (?, ?, ?)", [userId, name, filtersJson], function (err) { if (err)
            reject(err);
        else
            resolve(this.lastID); });
    });
}
async function deleteAlert(id, userId) {
    await dbRun("DELETE FROM alerts WHERE id = ? AND user_id = ?", [id, userId]);
}
async function updateAlertLastSent(id) {
    await dbRun("UPDATE alerts SET last_sent = datetime('now') WHERE id = ?", [id]);
}
async function getAllActiveAlerts() {
    return dbAll(`
    SELECT a.*, u.email as user_email, u.name as user_name
    FROM alerts a JOIN users u ON u.id = a.user_id
    WHERE a.active = 1
  `);
}
// ── Password Reset ────────────────────────────────────────────────────────────
async function createResetToken(userId, token) {
    // Expire existing tokens for this user first
    await dbRun("DELETE FROM password_reset_tokens WHERE user_id = ?", [userId]);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
    await dbRun("INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)", [token, userId, expiresAt]);
}
async function getResetToken(token) {
    return dbGet("SELECT user_id, expires_at, used FROM password_reset_tokens WHERE token = ?", [token]);
}
async function markResetTokenUsed(token) {
    await dbRun("UPDATE password_reset_tokens SET used = 1 WHERE token = ?", [token]);
}
async function updateUserPassword(userId, hashedPassword) {
    await dbRun("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, userId]);
}
async function updateUserName(userId, name) {
    await dbRun("UPDATE users SET name = ? WHERE id = ?", [name, userId]);
}
// ── Search ────────────────────────────────────────────────────────────────────
async function searchStocks(q, limit = 10) {
    const esc = q.replace(/[%_]/g, "\\$&");
    const like = "%" + esc + "%";
    const query = `SELECT symbol, company_name, sector FROM stocks
     WHERE (symbol LIKE ? ESCAPE '\\' OR company_name LIKE ? ESCAPE '\\')
     ORDER BY
       CASE WHEN symbol LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END,
       CASE WHEN fetched_at IS NOT NULL THEN 0 ELSE 1 END,
       market_cap DESC NULLS LAST
     LIMIT ?`;
    const results = await dbAll(query, [like, like, like, limit]);
    // Fuzzy prefix fallback: if few results and query >= 3 chars, also try first-4-chars prefix
    if (results.length < 2 && q.length >= 3) {
        const prefix = esc.slice(0, 4) + "%";
        const fuzzy = await dbAll(query, [prefix, prefix, prefix, limit]);
        const seen = new Set(results.map(r => r.symbol));
        for (const r of fuzzy)
            if (!seen.has(r.symbol))
                results.push(r);
    }
    return results.slice(0, limit);
}
async function getActivePicks() {
    return dbAll("SELECT * FROM picks WHERE status='active' ORDER BY published_at DESC");
}
async function getAllPicks() {
    return dbAll("SELECT * FROM picks WHERE pick_type != 'longterm' ORDER BY published_at DESC LIMIT 100");
}
async function createPick(p) {
    await dbRun(`INSERT INTO picks (stock_symbol,company_name,direction,pick_type,entry_low,entry_high,target,stop_loss,reason,risk_level,status,created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [p.stock_symbol, p.company_name ?? null, p.direction, p.pick_type ?? 'intraday', p.entry_low, p.entry_high,
        p.target ?? null, p.stop_loss ?? null, p.reason, p.risk_level, p.status, p.created_by ?? null]);
}
async function updatePickStatus(id, status) {
    await dbRun("UPDATE picks SET status=? WHERE id=?", [status, id]);
}
async function updatePickResult(id, result, resultPrice) {
    const now = new Date().toISOString();
    await dbRun("UPDATE picks SET result=?, result_price=?, result_at=? WHERE id=?", [result, resultPrice, now, id]);
}
async function updatePickEntry(id, entryPrice) {
    const now = new Date().toISOString();
    await dbRun("UPDATE picks SET result='entry_triggered', entry_price=?, entry_at=? WHERE id=?", [entryPrice, now, id]);
}
async function triggerPickNow(id, entryPrice, newTarget, newSl) {
    const now = new Date().toISOString();
    await dbRun("UPDATE picks SET result='entry_triggered', entry_price=?, entry_at=?, target=?, stop_loss=? WHERE id=?", [entryPrice, now, parseFloat(newTarget.toFixed(2)), parseFloat(newSl.toFixed(2)), id]);
}
async function deletePick(id) {
    await dbRun("DELETE FROM picks WHERE id=?", [id]);
}
// ── App Settings ──────────────────────────────────────────────────────────────
async function getSetting(key) {
    const r = await dbGet("SELECT value FROM app_settings WHERE key=?", [key]);
    return r?.value ?? "";
}
async function setSetting(key, value) {
    await dbRun("INSERT OR REPLACE INTO app_settings (key,value) VALUES (?,?)", [key, value]);
}
async function getAllSettings() {
    const rows = await dbAll("SELECT key, value FROM app_settings");
    const out = {};
    for (const r of rows)
        out[r.key] = r.value;
    return out;
}
async function createOrder(userId, orderId, amountPaise) {
    await dbRun("INSERT INTO subscriptions (user_id,razorpay_order_id,amount,status) VALUES (?,?,?,'pending')", [userId, orderId, amountPaise]);
}
async function activateSubscription(orderId, paymentId) {
    const sub = await dbGet("SELECT id, user_id FROM subscriptions WHERE razorpay_order_id=? AND status='pending'", [orderId]);
    if (!sub)
        return null;
    const now = new Date();
    const starts = now.toISOString();
    const expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await dbRun("UPDATE subscriptions SET razorpay_payment_id=?,status='active',starts_at=?,expires_at=? WHERE id=?", [paymentId, starts, expiry, sub.id]);
    await dbRun("UPDATE users SET role='premium' WHERE id=?", [sub.user_id]);
    return sub.user_id;
}
async function getActiveSubscription(userId) {
    return dbGet("SELECT * FROM subscriptions WHERE user_id=? AND status='active' AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY id DESC LIMIT 1", [userId]);
}
async function expireOldSubscriptions() {
    const expired = await dbAll("SELECT user_id FROM subscriptions WHERE status='active' AND expires_at < datetime('now')");
    if (!expired.length)
        return;
    await dbRun("UPDATE subscriptions SET status='expired' WHERE status='active' AND expires_at < datetime('now')");
    for (const r of expired) {
        const still = await getActiveSubscription(r.user_id);
        if (!still)
            await dbRun("UPDATE users SET role='user' WHERE id=? AND role='premium'", [r.user_id]);
    }
}
async function getAllSubscriptions() {
    return dbAll(`
    SELECT s.*, u.name as user_name, u.email as user_email
    FROM subscriptions s JOIN users u ON u.id=s.user_id
    ORDER BY s.created_at DESC LIMIT 200
  `);
}
async function getPaperPortfolio(userId) {
    const row = await dbGet("SELECT balance FROM paper_portfolio WHERE user_id=?", [userId]);
    if (!row) {
        await dbRun("INSERT OR IGNORE INTO paper_portfolio (user_id,balance) VALUES (?,100000)", [userId]);
        return { balance: 100000 };
    }
    return row;
}
async function getPaperPositions(userId) {
    return dbAll("SELECT * FROM paper_positions WHERE user_id=? ORDER BY entry_date DESC", [userId]);
}
async function getPaperTrades(userId, limit = 50) {
    return dbAll("SELECT * FROM paper_trades WHERE user_id=? ORDER BY traded_at DESC LIMIT ?", [userId, limit]);
}
async function paperBuy(userId, symbol, companyName, qty, price, tradeType = 'INTRADAY', slPrice, targetPrice, orderType = 'MARKET') {
    const total = parseFloat((qty * price).toFixed(2));
    const port = await getPaperPortfolio(userId);
    if (port.balance < total)
        return { ok: false, msg: `Insufficient balance. Need ₹${total.toFixed(0)}, have ₹${port.balance.toFixed(0)}`, balance: port.balance };
    const newBal = parseFloat((port.balance - total).toFixed(2));
    // Upsert position (avg price if already held)
    const existing = await dbGet("SELECT * FROM paper_positions WHERE user_id=? AND symbol=?", [userId, symbol]);
    if (existing) {
        const newQty = existing.qty + qty;
        const newAvg = parseFloat(((existing.avg_price * existing.qty + price * qty) / newQty).toFixed(4));
        const newInv = parseFloat((existing.invested + total).toFixed(2));
        await dbRun("UPDATE paper_positions SET qty=?,avg_price=?,invested=?,sl_price=?,target_price=?,order_type=? WHERE user_id=? AND symbol=?", [newQty, newAvg, newInv, slPrice ?? null, targetPrice ?? null, orderType, userId, symbol]);
    }
    else {
        await dbRun("INSERT INTO paper_positions (user_id,symbol,company_name,qty,avg_price,invested,trade_type,sl_price,target_price,order_type) VALUES (?,?,?,?,?,?,?,?,?,?)", [userId, symbol, companyName, qty, price, total, tradeType, slPrice ?? null, targetPrice ?? null, orderType]);
    }
    await dbRun("UPDATE paper_portfolio SET balance=? WHERE user_id=?", [newBal, userId]);
    await dbRun("INSERT INTO paper_trades (user_id,symbol,company_name,action,qty,price,total,balance_after,trade_type) VALUES (?,?,?,?,?,?,?,?,?)", [userId, symbol, companyName, "BUY", qty, price, total, newBal, tradeType]);
    return { ok: true, msg: `Bought ${qty} × ${symbol} @ ₹${price}`, balance: newBal };
}
async function paperSell(userId, symbol, qty, price) {
    const pos = await dbGet("SELECT * FROM paper_positions WHERE user_id=? AND symbol=?", [userId, symbol]);
    if (!pos || pos.qty < qty)
        return { ok: false, msg: `Not enough shares. You hold ${pos?.qty ?? 0} of ${symbol}`, balance: (await getPaperPortfolio(userId)).balance };
    const total = parseFloat((qty * price).toFixed(2));
    const costBasis = parseFloat((pos.avg_price * qty).toFixed(2));
    const pnl = parseFloat((total - costBasis).toFixed(2));
    const pnlPct = parseFloat((((total - costBasis) / costBasis) * 100).toFixed(2));
    const port = await getPaperPortfolio(userId);
    const newBal = parseFloat((port.balance + total).toFixed(2));
    const remainQty = pos.qty - qty;
    if (remainQty === 0) {
        await dbRun("DELETE FROM paper_positions WHERE user_id=? AND symbol=?", [userId, symbol]);
    }
    else {
        const remainInv = parseFloat((pos.invested - costBasis).toFixed(2));
        await dbRun("UPDATE paper_positions SET qty=?,invested=? WHERE user_id=? AND symbol=?", [remainQty, remainInv, userId, symbol]);
    }
    await dbRun("UPDATE paper_portfolio SET balance=? WHERE user_id=?", [newBal, userId]);
    await dbRun("INSERT INTO paper_trades (user_id,symbol,company_name,action,qty,price,total,pnl,pnl_pct,balance_after,trade_type) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [userId, symbol, pos.company_name, "SELL", qty, price, total, pnl, pnlPct, newBal, pos.trade_type || 'INTRADAY']);
    return { ok: true, msg: `Sold ${qty} × ${symbol} @ ₹${price} · PnL ${pnl >= 0 ? "+" : ""}₹${pnl}`, balance: newBal };
}
async function paperReset(userId) {
    await dbRun("DELETE FROM paper_positions WHERE user_id=?", [userId]);
    await dbRun("DELETE FROM paper_trades WHERE user_id=?", [userId]);
    await dbRun("INSERT OR REPLACE INTO paper_portfolio (user_id,balance) VALUES (?,100000)", [userId]);
}
// ── Mobile OTP ─────────────────────────────────────────────────────────────────
async function storePhoneOtp(mobile, otp) {
    await dbRun("DELETE FROM phone_otps WHERE mobile=? AND used=0", [mobile]);
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await dbRun("INSERT INTO phone_otps (mobile,otp,expires_at) VALUES (?,?,?)", [mobile, otp, expiresAt]);
}
async function verifyPhoneOtp(mobile, otp) {
    const row = await dbGet("SELECT id, expires_at, used FROM phone_otps WHERE mobile=? AND otp=? ORDER BY id DESC LIMIT 1", [mobile, otp]);
    if (!row || row.used || row.expires_at < Date.now())
        return false;
    await dbRun("UPDATE phone_otps SET used=1 WHERE id=?", [row.id]);
    return true;
}
async function setUserMobile(userId, mobile) {
    await dbRun("UPDATE users SET mobile=?, mobile_verified=1 WHERE id=?", [mobile, userId]);
}
async function getUserByMobile(mobile) {
    return dbGet("SELECT * FROM users WHERE mobile=?", [mobile]);
}
async function countPaperTrades(userId) {
    const r = await dbGet("SELECT COUNT(*) as c FROM paper_trades WHERE user_id=?", [userId]);
    return r?.c ?? 0;
}
async function countTodayPaperBuys(userId) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD in IST
    const r = await dbGet("SELECT COUNT(*) as c FROM paper_trades WHERE user_id=? AND action='BUY' AND DATE(traded_at)=?", [userId, today]);
    return r?.c ?? 0;
}
async function getPaperTradeStats(userId) {
    const r = await dbGet(`SELECT COUNT(*) as total,
            SUM(CASE WHEN action='SELL' AND pnl > 0 THEN 1 ELSE 0 END) as wins
     FROM paper_trades WHERE user_id=?`, [userId]);
    const total = r?.total ?? 0;
    const sells = await dbGet("SELECT COUNT(*) as c FROM paper_trades WHERE user_id=? AND action='SELL'", [userId]);
    const sellCount = sells?.c ?? 0;
    const wins = r?.wins ?? 0;
    const losses = sellCount - wins;
    const winRate = sellCount > 0 ? parseFloat(((wins / sellCount) * 100).toFixed(1)) : 0;
    return { total, wins, losses, winRate };
}
// ── Paper Trade Config ─────────────────────────────────────────────────────────
async function getPaperTradeConfig(userId) {
    const row = await dbGet("SELECT * FROM paper_trade_config WHERE user_id=?", [userId]);
    if (!row) {
        const def = { user_id: userId, trade_type: 'INTRADAY', default_qty: 1, default_sl_pct: 2.0, default_tgt_pct: 4.0, max_positions: 10, auto_paper_mode: 'picks', auto_paper_stocks: '[]' };
        await dbRun("INSERT OR IGNORE INTO paper_trade_config (user_id,trade_type,default_qty,default_sl_pct,default_tgt_pct,max_positions,auto_paper_mode,auto_paper_stocks) VALUES (?,?,?,?,?,?,?,?)", [userId, def.trade_type, def.default_qty, def.default_sl_pct, def.default_tgt_pct, def.max_positions, def.auto_paper_mode, def.auto_paper_stocks]);
        return def;
    }
    row.auto_paper_mode = row.auto_paper_mode || 'picks';
    row.auto_paper_stocks = row.auto_paper_stocks || '[]';
    return row;
}
async function savePaperTradeConfig(userId, config) {
    const cur = await getPaperTradeConfig(userId);
    const m = { ...cur, ...config };
    await dbRun(`INSERT OR REPLACE INTO paper_trade_config (user_id,trade_type,default_qty,default_sl_pct,default_tgt_pct,max_positions,auto_paper_mode,auto_paper_stocks,updated_at)
     VALUES (?,?,?,?,?,?,?,?,datetime('now','localtime'))`, [userId, m.trade_type, m.default_qty, m.default_sl_pct, m.default_tgt_pct, m.max_positions, m.auto_paper_mode ?? 'picks', m.auto_paper_stocks ?? '[]']);
}
async function saveBotState(data) {
    await dbRun(`UPDATE bot_state SET data_json=?, updated_at=datetime('now','localtime') WHERE id=1`, [JSON.stringify(data)]);
}
async function getBotState() {
    const row = await dbGet("SELECT data_json, updated_at FROM bot_state WHERE id=1");
    if (!row)
        return null;
    try {
        return { ...JSON.parse(row.data_json), _db_updated_at: row.updated_at };
    }
    catch {
        return null;
    }
}
async function saveBotTrade(t) {
    await dbRun(`INSERT INTO bot_trades (symbol,direction,entry_price,exit_price,qty,pnl,exit_reason,trade_date,duration,raw_json)
     VALUES (?,?,?,?,?,?,?,?,?,?)`, [t.symbol, t.direction, t.entry_price, t.exit_price, t.qty, t.pnl, t.exit_reason, t.trade_date, t.duration, t.raw_json]);
}
async function getBotTrades(limit = 50) {
    return dbAll("SELECT * FROM bot_trades ORDER BY id DESC LIMIT ?", [limit]);
}
// ── Auto paper picks helpers ───────────────────────────────────────────────────
async function getUsersWithAutoPicks() {
    return dbAll("SELECT id, name, email FROM users WHERE auto_paper_picks = 1");
}
async function setAutoPaperPicks(userId, enabled) {
    await dbRun("UPDATE users SET auto_paper_picks = ? WHERE id = ?", [enabled ? 1 : 0, userId]);
}
async function getAutoPaperPicks(userId) {
    const row = await dbGet("SELECT auto_paper_picks FROM users WHERE id = ?", [userId]);
    return row?.auto_paper_picks === 1;
}
async function getPublishedPosts(limit = 20) {
    return dbAll("SELECT * FROM blog_posts WHERE published=1 ORDER BY published_at DESC LIMIT ?", [limit]);
}
async function getAllBlogPosts() {
    return dbAll("SELECT * FROM blog_posts ORDER BY created_at DESC LIMIT 100");
}
async function getBlogPost(slug) {
    return dbGet("SELECT * FROM blog_posts WHERE slug=?", [slug]);
}
async function createBlogPost(p) {
    await dbRun("INSERT INTO blog_posts (slug,title,excerpt,content,author_id) VALUES (?,?,?,?,?)", [p.slug, p.title, p.excerpt ?? null, p.content, p.author_id ?? null]);
}
async function updateBlogPost(id, p) {
    const fields = [];
    const vals = [];
    if (p.title !== undefined) {
        fields.push("title=?");
        vals.push(p.title);
    }
    if (p.excerpt !== undefined) {
        fields.push("excerpt=?");
        vals.push(p.excerpt);
    }
    if (p.content !== undefined) {
        fields.push("content=?");
        vals.push(p.content);
    }
    if (!fields.length)
        return;
    vals.push(id);
    await dbRun(`UPDATE blog_posts SET ${fields.join(",")} WHERE id=?`, vals);
}
async function publishBlogPost(id) {
    await dbRun("UPDATE blog_posts SET published=1, published_at=datetime('now','localtime') WHERE id=?", [id]);
}
async function unpublishBlogPost(id) {
    await dbRun("UPDATE blog_posts SET published=0 WHERE id=?", [id]);
}
async function deleteBlogPost(id) {
    await dbRun("DELETE FROM blog_posts WHERE id=?", [id]);
}
// ── Shareable paper trade reports ─────────────────────────────────────────────
async function getOrCreateReport(userId) {
    const existing = await dbGet("SELECT report_id FROM paper_reports WHERE user_id=?", [userId]);
    if (existing)
        return existing.report_id;
    const reportId = require("crypto").randomBytes(12).toString("hex");
    await dbRun("INSERT INTO paper_reports (report_id, user_id) VALUES (?,?)", [reportId, userId]);
    return reportId;
}
async function getReportOwner(reportId) {
    return dbGet("SELECT user_id, created_at FROM paper_reports WHERE report_id=?", [reportId]);
}
async function getPublishedPremiumPicks() {
    return dbAll("SELECT * FROM premium_picks WHERE published=1 ORDER BY published_at DESC LIMIT 20");
}
async function getAllPremiumPicks() {
    return dbAll("SELECT * FROM premium_picks ORDER BY created_at DESC LIMIT 100");
}
async function createPremiumPick(p) {
    await dbRun(`INSERT INTO premium_picks (symbol,company_name,strategy,entry_low,entry_high,target,stop_loss,timeframe,thesis,created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`, [p.symbol, p.company_name ?? null, p.strategy ?? "Swing",
        p.entry_low, p.entry_high, p.target ?? null, p.stop_loss ?? null,
        p.timeframe ?? "Short-term", p.thesis, p.created_by ?? null]);
}
async function updatePremiumPick(id, p) {
    const fields = [];
    const vals = [];
    const set = (col, v) => { fields.push(`${col}=?`); vals.push(v); };
    if (p.symbol !== undefined)
        set("symbol", p.symbol);
    if (p.company_name !== undefined)
        set("company_name", p.company_name);
    if (p.strategy !== undefined)
        set("strategy", p.strategy);
    if (p.entry_low !== undefined)
        set("entry_low", p.entry_low);
    if (p.entry_high !== undefined)
        set("entry_high", p.entry_high);
    if (p.target !== undefined)
        set("target", p.target);
    if (p.stop_loss !== undefined)
        set("stop_loss", p.stop_loss);
    if (p.timeframe !== undefined)
        set("timeframe", p.timeframe);
    if (p.thesis !== undefined)
        set("thesis", p.thesis);
    if (!fields.length)
        return;
    vals.push(id);
    await dbRun(`UPDATE premium_picks SET ${fields.join(",")} WHERE id=?`, vals);
}
async function publishPremiumPick(id) {
    await dbRun("UPDATE premium_picks SET published=1, published_at=datetime('now','localtime') WHERE id=?", [id]);
}
async function unpublishPremiumPick(id) {
    await dbRun("UPDATE premium_picks SET published=0 WHERE id=?", [id]);
}
async function deletePremiumPick(id) {
    await dbRun("DELETE FROM premium_picks WHERE id=?", [id]);
}
async function getPaperLeaderboard(limit = 20) {
    // Compute leaderboard from paper_portfolio joined with paper_trades
    const rows = await dbAll(`
    SELECT pp.user_id, u.name, u.role,
           pp.balance,
           COUNT(pt.id) AS trade_count,
           SUM(CASE WHEN pt.pnl > 0 THEN 1 ELSE 0 END) AS win_count
    FROM paper_portfolio pp
    JOIN users u ON u.id = pp.user_id
    LEFT JOIN paper_trades pt ON pt.user_id = pp.user_id AND pt.action = 'SELL'
    WHERE u.role IN ('user','premium','admin')
    GROUP BY pp.user_id
    HAVING trade_count >= 3
    ORDER BY pp.balance DESC
    LIMIT ?
  `, [limit]);
    return rows.map((r, i) => {
        // Anonymise: show first name + last initial
        const parts = (r.name || "Member").trim().split(/\s+/);
        const first = parts[0] || "Member";
        const lastInit = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() + "." : "";
        const displayName = first + (lastInit ? " " + lastInit : "");
        const startBal = r.role === "premium" || r.role === "admin" ? 1000000 : 100000;
        const netPnl = r.balance - startBal;
        const netPct = (netPnl / startBal) * 100;
        return {
            rank: i + 1,
            display_name: displayName,
            balance: r.balance,
            net_pnl: netPnl,
            net_pct: netPct,
            trade_count: r.trade_count,
            win_count: r.win_count ?? 0,
        };
    });
}
async function getUserPriceAlerts(userId) {
    return dbAll("SELECT * FROM price_alerts WHERE user_id = ? ORDER BY active DESC, created_at DESC LIMIT 50", [userId]);
}
async function createPriceAlert(userId, symbol, targetPrice, direction, note) {
    await dbRun("INSERT INTO price_alerts (user_id, symbol, target_price, direction, note) VALUES (?,?,?,?,?)", [userId, symbol.toUpperCase(), targetPrice, direction, note ?? null]);
}
async function deletePriceAlert(id, userId) {
    await dbRun("DELETE FROM price_alerts WHERE id = ? AND user_id = ?", [id, userId]);
}
async function triggerPriceAlert(id) {
    await dbRun("UPDATE price_alerts SET active = 0, triggered_at = datetime('now','localtime') WHERE id = ?", [id]);
}
async function getAllActivePriceAlerts() {
    return dbAll(`
    SELECT pa.*, u.email as user_email, u.name as user_name, p.price as current_price
    FROM price_alerts pa
    JOIN users u ON u.id = pa.user_id
    LEFT JOIN prices p ON p.symbol = pa.symbol
    WHERE pa.active = 1
  `);
}
async function getStockNote(userId, symbol) {
    const rows = await dbAll("SELECT * FROM stock_notes WHERE user_id = ? AND symbol = ?", [userId, symbol.toUpperCase()]);
    return rows[0] ?? null;
}
async function saveStockNote(userId, symbol, content) {
    await dbRun(`
    INSERT INTO stock_notes (user_id, symbol, content, updated_at)
    VALUES (?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(user_id, symbol) DO UPDATE SET
      content    = excluded.content,
      updated_at = excluded.updated_at
  `, [userId, symbol.toUpperCase(), content.substring(0, 2000)]);
}
async function getAllStockNotes(userId) {
    return dbAll("SELECT * FROM stock_notes WHERE user_id = ? AND content != '' ORDER BY updated_at DESC", [userId]);
}
