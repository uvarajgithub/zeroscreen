"use strict";
/**
 * scheduler.ts — background jobs for ZeroScreen
 *
 * Jobs:
 *   1. refreshPrices()       — daily: fetch NSE bhavcopy → update prices table
 *   2. refreshFundamentals() — weekly: fetch screener.in for all/stale stocks
 *   3. seedSymbols()         — one-time: populate stocks table from bhavcopy
 *
 * CLI:
 *   npx ts-node src/scheduler.ts --seed
 *   npx ts-node src/scheduler.ts --prices
 *   npx ts-node src/scheduler.ts --fundamentals
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshPrices = refreshPrices;
exports.refreshFundamentals = refreshFundamentals;
exports.checkAlerts = checkAlerts;
exports.seedSymbols = seedSymbols;
exports.generateDailyPicks = generateDailyPicks;
exports.startScheduler = startScheduler;
var node_cron_1 = require("node-cron");
var nse_1 = require("./nse");
var scraper_1 = require("./scraper");
var db_1 = require("./db");
var mailer_1 = require("./mailer");
var FETCH_DELAY_MS = 800;
function sleep(ms) { return new Promise(function (r) { return setTimeout(r, ms); }); }
// ── Prices refresh ────────────────────────────────────────────────────────────
function refreshPrices() {
    return __awaiter(this, void 0, void 0, function () {
        var rows, now, _i, rows_1, r, existingSet, _a, newSymbols, _b, newSymbols_1, r;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    console.log("[Scheduler] Refreshing prices from NSE bhavcopy...");
                    return [4 /*yield*/, (0, nse_1.fetchLatestBhavcopy)()];
                case 1:
                    rows = _c.sent();
                    if (rows.length === 0) {
                        console.warn("[Scheduler] No bhavcopy data");
                        return [2 /*return*/, 0];
                    }
                    now = new Date().toISOString();
                    _i = 0, rows_1 = rows;
                    _c.label = 2;
                case 2:
                    if (!(_i < rows_1.length)) return [3 /*break*/, 5];
                    r = rows_1[_i];
                    return [4 /*yield*/, (0, db_1.upsertPrice)({
                            symbol: r.symbol, price: r.price, volume: r.volume,
                            day_high: r.dayHigh, day_low: r.dayLow, prev_close: r.prevClose,
                            change_pct: r.changePct, updated_at: now,
                        })];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5:
                    _a = Set.bind;
                    return [4 /*yield*/, (0, db_1.getAllSymbols)()];
                case 6:
                    existingSet = new (_a.apply(Set, [void 0, _c.sent()]))();
                    newSymbols = rows.filter(function (r) { return !existingSet.has(r.symbol); });
                    _b = 0, newSymbols_1 = newSymbols;
                    _c.label = 7;
                case 7:
                    if (!(_b < newSymbols_1.length)) return [3 /*break*/, 10];
                    r = newSymbols_1[_b];
                    return [4 /*yield*/, (0, db_1.dbRun)("INSERT OR IGNORE INTO stocks (symbol) VALUES (?)", [r.symbol])];
                case 8:
                    _c.sent();
                    _c.label = 9;
                case 9:
                    _b++;
                    return [3 /*break*/, 7];
                case 10:
                    console.log("[Scheduler] Prices updated: ".concat(rows.length, " stocks, ").concat(newSymbols.length, " new symbols"));
                    return [2 /*return*/, rows.length];
            }
        });
    });
}
// ── Fundamentals refresh ──────────────────────────────────────────────────────
function refreshFundamentals(symbols) {
    return __awaiter(this, void 0, void 0, function () {
        var targets, _a, done, errors, _i, targets_1, symbol, f, e_1;
        var _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    if (!(symbols !== null && symbols !== void 0)) return [3 /*break*/, 1];
                    _a = symbols;
                    return [3 /*break*/, 3];
                case 1: return [4 /*yield*/, (0, db_1.getStaleSymbols)(168)];
                case 2:
                    _a = (_h.sent());
                    _h.label = 3;
                case 3:
                    targets = _a;
                    if (targets.length === 0) {
                        console.log("[Scheduler] All fundamentals fresh");
                        return [2 /*return*/];
                    }
                    console.log("[Scheduler] Fetching fundamentals for ".concat(targets.length, " stocks..."));
                    done = 0, errors = 0;
                    _i = 0, targets_1 = targets;
                    _h.label = 4;
                case 4:
                    if (!(_i < targets_1.length)) return [3 /*break*/, 15];
                    symbol = targets_1[_i];
                    _h.label = 5;
                case 5:
                    _h.trys.push([5, 11, , 12]);
                    return [4 /*yield*/, (0, scraper_1.fetchFundamentals)(symbol)];
                case 6:
                    f = _h.sent();
                    if (!(f.error && f.error.includes("Not found"))) return [3 /*break*/, 8];
                    return [4 /*yield*/, (0, db_1.upsertStock)({ symbol: symbol, fetch_error: f.error, fetched_at: new Date().toISOString() })];
                case 7:
                    _h.sent();
                    errors++;
                    return [3 /*break*/, 10];
                case 8:
                    if (!!f.error) return [3 /*break*/, 10];
                    return [4 /*yield*/, (0, db_1.upsertStock)({
                            symbol: symbol,
                            company_name: f.companyName,
                            sector: f.sector,
                            market_cap: f.marketCap,
                            pe_ratio: f.peRatio,
                            roce: f.roce,
                            roe: f.roe,
                            de_ratio: f.deRatio,
                            promoter_pct: f.promoterPct,
                            eps: f.eps,
                            book_value: f.bookValue,
                            dividend_yield: f.dividendYield,
                            current_ratio: f.currentRatio,
                            net_profit_1: (_b = f.netProfits[f.netProfits.length - 3]) !== null && _b !== void 0 ? _b : null,
                            net_profit_2: (_c = f.netProfits[f.netProfits.length - 2]) !== null && _c !== void 0 ? _c : null,
                            net_profit_3: (_d = f.netProfits[f.netProfits.length - 1]) !== null && _d !== void 0 ? _d : null,
                            revenue_1: (_e = f.revenues[f.revenues.length - 3]) !== null && _e !== void 0 ? _e : null,
                            revenue_2: (_f = f.revenues[f.revenues.length - 2]) !== null && _f !== void 0 ? _f : null,
                            revenue_3: (_g = f.revenues[f.revenues.length - 1]) !== null && _g !== void 0 ? _g : null,
                            all_profitable: f.allProfitable ? 1 : 0,
                            profit_uptrend: f.profitUptrend ? 1 : 0,
                            week52_high: f.week52High,
                            week52_low: f.week52Low,
                            about: f.about,
                            incorporated: f.incorporated,
                            screener_data: JSON.stringify({ netProfits: f.netProfits, revenues: f.revenues }),
                            fetch_error: null,
                            fetched_at: new Date().toISOString(),
                        })];
                case 9:
                    _h.sent();
                    done++;
                    if (done % 20 === 0)
                        console.log("[Scheduler] ".concat(done, "/").concat(targets.length, " done, ").concat(errors, " errors"));
                    _h.label = 10;
                case 10: return [3 /*break*/, 12];
                case 11:
                    e_1 = _h.sent();
                    console.error("[Scheduler] Error ".concat(symbol, ": ").concat(e_1.message));
                    errors++;
                    return [3 /*break*/, 12];
                case 12: return [4 /*yield*/, sleep(FETCH_DELAY_MS)];
                case 13:
                    _h.sent();
                    _h.label = 14;
                case 14:
                    _i++;
                    return [3 /*break*/, 4];
                case 15:
                    console.log("[Scheduler] Done: ".concat(done, " updated, ").concat(errors, " errors"));
                    return [2 /*return*/];
            }
        });
    });
}
// ── Alert digest ────────────────────────────────────────────────────────────────────
function checkAlerts() {
    return __awaiter(this, void 0, void 0, function () {
        var alerts, today, sent, _i, alerts_1, alert_1, filters, f, stocks, e_2;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getAllActiveAlerts)()];
                case 1:
                    alerts = _b.sent();
                    today = new Date().toISOString().slice(0, 10);
                    sent = 0;
                    _i = 0, alerts_1 = alerts;
                    _b.label = 2;
                case 2:
                    if (!(_i < alerts_1.length)) return [3 /*break*/, 10];
                    alert_1 = alerts_1[_i];
                    if (((_a = alert_1.last_sent) === null || _a === void 0 ? void 0 : _a.slice(0, 10)) === today)
                        return [3 /*break*/, 9]; // already sent today
                    _b.label = 3;
                case 3:
                    _b.trys.push([3, 8, , 9]);
                    filters = JSON.parse(alert_1.filters_json);
                    f = {
                        minRoce: filters.minRoce ? parseFloat(filters.minRoce) : undefined,
                        maxDe: filters.maxDe ? parseFloat(filters.maxDe) : undefined,
                        minPromoter: filters.minPromoter ? parseFloat(filters.minPromoter) : undefined,
                        maxPe: filters.maxPe ? parseFloat(filters.maxPe) : undefined,
                        minPe: filters.minPe ? parseFloat(filters.minPe) : undefined,
                        minPrice: filters.minPrice ? parseFloat(filters.minPrice) : undefined,
                        maxPrice: filters.maxPrice ? parseFloat(filters.maxPrice) : undefined,
                        minMarketCap: filters.minMc ? parseFloat(filters.minMc) : undefined,
                        maxMarketCap: filters.maxMc ? parseFloat(filters.maxMc) : undefined,
                        minDividendYield: filters.minDivYield ? parseFloat(filters.minDivYield) : undefined,
                        allProfitable: filters.allProfit === "1",
                        profitUptrend: filters.uptrend === "1",
                        sector: filters.sector || undefined,
                        sortBy: filters.sortBy || "roce",
                        sortDir: "desc",
                        limit: 20,
                    };
                    return [4 /*yield*/, (0, db_1.screenStocks)(f)];
                case 4:
                    stocks = _b.sent();
                    if (!(stocks.length > 0)) return [3 /*break*/, 7];
                    return [4 /*yield*/, (0, mailer_1.sendAlertEmail)(alert_1.user_email, alert_1.user_name, alert_1.name, stocks)];
                case 5:
                    _b.sent();
                    return [4 /*yield*/, (0, db_1.updateAlertLastSent)(alert_1.id)];
                case 6:
                    _b.sent();
                    sent++;
                    _b.label = 7;
                case 7: return [3 /*break*/, 9];
                case 8:
                    e_2 = _b.sent();
                    console.error("[Alerts] Error processing alert ".concat(alert_1.id, ":"), e_2.message);
                    return [3 /*break*/, 9];
                case 9:
                    _i++;
                    return [3 /*break*/, 2];
                case 10:
                    console.log("[Alerts] Checked ".concat(alerts.length, " alerts, sent ").concat(sent, " emails"));
                    return [2 /*return*/];
            }
        });
    });
}
// ── Seed ──────────────────────────────────────────────────────────────────────
function seedSymbols() {
    return __awaiter(this, void 0, void 0, function () {
        var rows, now, i, _i, rows_2, r;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("[Scheduler] Seeding symbols from NSE bhavcopy...");
                    return [4 /*yield*/, (0, nse_1.fetchLatestBhavcopy)()];
                case 1:
                    rows = _a.sent();
                    if (rows.length === 0) {
                        console.error("[Scheduler] Cannot seed — no bhavcopy data");
                        return [2 /*return*/];
                    }
                    now = new Date().toISOString();
                    i = 0;
                    _i = 0, rows_2 = rows;
                    _a.label = 2;
                case 2:
                    if (!(_i < rows_2.length)) return [3 /*break*/, 6];
                    r = rows_2[_i];
                    return [4 /*yield*/, (0, db_1.upsertPrice)({
                            symbol: r.symbol, price: r.price, volume: r.volume,
                            day_high: r.dayHigh, day_low: r.dayLow, prev_close: r.prevClose,
                            change_pct: r.changePct, updated_at: now,
                        })];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, (0, db_1.dbRun)("INSERT OR IGNORE INTO stocks (symbol) VALUES (?)", [r.symbol])];
                case 4:
                    _a.sent();
                    i++;
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 2];
                case 6:
                    console.log("[Scheduler] Seeded ".concat(i, " symbols. Run --fundamentals to fetch data."));
                    return [2 /*return*/];
            }
        });
    });
}
// ── Auto-pick generation ───────────────────────────────────────────────────────
function generateDailyPicks() {
    return __awaiter(this, void 0, void 0, function () {
        var today, existing, stocks, intradayCount, swingCount, longtermCount, intradayPool, _i, intradayPool_1, s, price, dir, entryLow, entryHigh, target, stopLoss, parts, reason, swingPool, _a, swingPool_1, s, price, entryLow, entryHigh, target, stopLoss, parts, reason, longtermPool, _b, longtermPool_1, s, price, entryLow, entryHigh, target, stopLoss, parts, reason;
        var _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        return __generator(this, function (_q) {
            switch (_q.label) {
                case 0:
                    console.log("[Picks] Generating daily auto-picks from last market close...");
                    today = new Date().toISOString().slice(0, 10);
                    // Expire all previous auto-picks (created_by IS NULL = auto-generated)
                    return [4 /*yield*/, (0, db_1.dbRun)("UPDATE picks SET status='expired' WHERE status='active' AND created_by IS NULL AND date(published_at) < ?", [today])];
                case 1:
                    // Expire all previous auto-picks (created_by IS NULL = auto-generated)
                    _q.sent();
                    return [4 /*yield*/, (0, db_1.dbAll)("SELECT id FROM picks WHERE status='active' AND created_by IS NULL AND date(published_at) = ?", [today])];
                case 2:
                    existing = _q.sent();
                    if (existing.length > 0) {
                        console.log("[Picks] Already have ".concat(existing.length, " auto-picks for today, skipping"));
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, (0, db_1.dbAll)("\n    SELECT s.symbol, s.company_name, s.sector,\n           s.roce, s.roe, s.de_ratio, s.promoter_pct, s.pe_ratio,\n           s.all_profitable, s.profit_uptrend, s.market_cap,\n           s.week52_high, s.week52_low,\n           p.price, p.volume, p.change_pct, p.day_high, p.day_low, p.prev_close\n    FROM stocks s\n    JOIN prices p ON s.symbol = p.symbol\n    WHERE p.price > 0 AND p.price IS NOT NULL\n      AND p.updated_at >= date('now', '-7 days')\n  ")];
                case 3:
                    stocks = _q.sent();
                    if (stocks.length === 0) {
                        console.log("[Picks] No price data available, skipping pick generation");
                        return [2 /*return*/];
                    }
                    console.log("[Picks] Pool: ".concat(stocks.length, " stocks with price data"));
                    intradayCount = 0, swingCount = 0, longtermCount = 0;
                    intradayPool = stocks
                        .filter(function (s) { var _a, _b; return s.price > 50 && s.price < 8000 && ((_a = s.volume) !== null && _a !== void 0 ? _a : 0) > 300000 && Math.abs((_b = s.change_pct) !== null && _b !== void 0 ? _b : 0) > 0.5; })
                        .map(function (s) {
                        var _a, _b;
                        return (__assign(__assign({}, s), { score: (((_a = s.volume) !== null && _a !== void 0 ? _a : 0) / 1000000) * Math.abs((_b = s.change_pct) !== null && _b !== void 0 ? _b : 0) * (s.roce != null && s.roce > 0 ? Math.min(s.roce / 10, 2) : 1) }));
                    })
                        .sort(function (a, b) { return b.score - a.score; })
                        .slice(0, 5);
                    _i = 0, intradayPool_1 = intradayPool;
                    _q.label = 4;
                case 4:
                    if (!(_i < intradayPool_1.length)) return [3 /*break*/, 7];
                    s = intradayPool_1[_i];
                    price = s.price;
                    dir = ((_c = s.change_pct) !== null && _c !== void 0 ? _c : 0) >= 0 ? "LONG" : "SHORT";
                    entryLow = parseFloat((price * (dir === "LONG" ? 0.997 : 1.003)).toFixed(2));
                    entryHigh = parseFloat((price * (dir === "LONG" ? 1.003 : 0.997)).toFixed(2));
                    target = parseFloat((price * (dir === "LONG" ? 1.018 : 0.982)).toFixed(2));
                    stopLoss = parseFloat((price * (dir === "LONG" ? 0.990 : 1.010)).toFixed(2));
                    parts = [];
                    if (((_d = s.change_pct) !== null && _d !== void 0 ? _d : 0) > 0)
                        parts.push("Up ".concat(s.change_pct.toFixed(1), "% today"));
                    else
                        parts.push("Down ".concat(Math.abs(s.change_pct).toFixed(1), "% today"));
                    if (((_e = s.volume) !== null && _e !== void 0 ? _e : 0) > 1000000)
                        parts.push("Volume ".concat((s.volume / 1e6).toFixed(1), "M"));
                    if (((_f = s.roce) !== null && _f !== void 0 ? _f : 0) > 15)
                        parts.push("ROCE ".concat(s.roce.toFixed(0), "%"));
                    reason = parts.slice(0, 3).join(" · ");
                    return [4 /*yield*/, (0, db_1.createPick)({
                            stock_symbol: s.symbol, company_name: s.company_name,
                            direction: dir, pick_type: "intraday",
                            entry_low: entryLow, entry_high: entryHigh,
                            target: target,
                            stop_loss: stopLoss,
                            reason: reason,
                            risk_level: "medium", status: "active",
                        })];
                case 5:
                    _q.sent();
                    intradayCount++;
                    _q.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 4];
                case 7:
                    swingPool = stocks
                        .filter(function (s) {
                        var _a, _b, _c;
                        return s.price > 100 && s.price < 15000 &&
                            ((_a = s.roce) !== null && _a !== void 0 ? _a : 0) > 8 &&
                            (s.de_ratio == null || s.de_ratio < 2.5) &&
                            ((_b = s.change_pct) !== null && _b !== void 0 ? _b : 0) > 0 && ((_c = s.change_pct) !== null && _c !== void 0 ? _c : 0) < 8;
                    })
                        .map(function (s) {
                        var _a, _b, _c, _d;
                        return (__assign(__assign({}, s), { score: ((_a = s.roce) !== null && _a !== void 0 ? _a : 0) * 0.4 +
                                ((_b = s.roe) !== null && _b !== void 0 ? _b : 0) * 0.3 +
                                ((_c = s.promoter_pct) !== null && _c !== void 0 ? _c : 0) * 0.1 +
                                ((_d = s.change_pct) !== null && _d !== void 0 ? _d : 0) * 2 +
                                (s.all_profitable ? 10 : 0) +
                                (s.profit_uptrend ? 5 : 0) }));
                    })
                        .sort(function (a, b) { return b.score - a.score; })
                        .slice(0, 5);
                    _a = 0, swingPool_1 = swingPool;
                    _q.label = 8;
                case 8:
                    if (!(_a < swingPool_1.length)) return [3 /*break*/, 11];
                    s = swingPool_1[_a];
                    price = s.price;
                    entryLow = parseFloat((price * 0.995).toFixed(2));
                    entryHigh = parseFloat((price * 1.005).toFixed(2));
                    target = parseFloat((price * 1.09).toFixed(2));
                    stopLoss = parseFloat((price * 0.945).toFixed(2));
                    parts = [];
                    if (((_g = s.roce) !== null && _g !== void 0 ? _g : 0) > 0)
                        parts.push("ROCE ".concat(s.roce.toFixed(0), "%"));
                    if (((_h = s.roe) !== null && _h !== void 0 ? _h : 0) > 0)
                        parts.push("ROE ".concat(s.roe.toFixed(0), "%"));
                    if (s.all_profitable)
                        parts.push("Consistently profitable");
                    if (s.profit_uptrend)
                        parts.push("Profit uptrend");
                    if (((_j = s.change_pct) !== null && _j !== void 0 ? _j : 0) > 0)
                        parts.push("Momentum +".concat(s.change_pct.toFixed(1), "%"));
                    reason = parts.slice(0, 4).join(" · ") || "Swing setup \u2014 ROCE ".concat(((_k = s.roce) !== null && _k !== void 0 ? _k : 0).toFixed(0), "%");
                    return [4 /*yield*/, (0, db_1.createPick)({
                            stock_symbol: s.symbol, company_name: s.company_name,
                            direction: "LONG", pick_type: "swing",
                            entry_low: entryLow, entry_high: entryHigh,
                            target: target,
                            stop_loss: stopLoss,
                            reason: reason,
                            risk_level: "medium", status: "active",
                        })];
                case 9:
                    _q.sent();
                    swingCount++;
                    _q.label = 10;
                case 10:
                    _a++;
                    return [3 /*break*/, 8];
                case 11:
                    longtermPool = stocks
                        .filter(function (s) {
                        var _a, _b, _c, _d;
                        return s.price > 100 &&
                            ((_a = s.roce) !== null && _a !== void 0 ? _a : 0) > 15 && ((_b = s.roe) !== null && _b !== void 0 ? _b : 0) > 12 &&
                            (s.de_ratio == null || s.de_ratio < 1) &&
                            ((_c = s.pe_ratio) !== null && _c !== void 0 ? _c : 0) > 5 && ((_d = s.pe_ratio) !== null && _d !== void 0 ? _d : 0) < 50 &&
                            s.all_profitable === 1;
                    })
                        .map(function (s) {
                        var _a, _b, _c;
                        return (__assign(__assign({}, s), { score: ((_a = s.roce) !== null && _a !== void 0 ? _a : 0) * 0.35 +
                                ((_b = s.roe) !== null && _b !== void 0 ? _b : 0) * 0.35 +
                                (s.all_profitable ? 15 : 0) +
                                (s.profit_uptrend ? 10 : 0) +
                                (((_c = s.promoter_pct) !== null && _c !== void 0 ? _c : 0) > 50 ? 5 : 0) }));
                    })
                        .sort(function (a, b) { return b.score - a.score; })
                        .slice(0, 3);
                    _b = 0, longtermPool_1 = longtermPool;
                    _q.label = 12;
                case 12:
                    if (!(_b < longtermPool_1.length)) return [3 /*break*/, 15];
                    s = longtermPool_1[_b];
                    price = s.price;
                    entryLow = parseFloat((price * 0.99).toFixed(2));
                    entryHigh = parseFloat((price * 1.01).toFixed(2));
                    target = parseFloat((price * 1.25).toFixed(2));
                    stopLoss = parseFloat((price * 0.90).toFixed(2));
                    parts = [];
                    if (((_l = s.roce) !== null && _l !== void 0 ? _l : 0) > 0)
                        parts.push("ROCE ".concat(s.roce.toFixed(0), "%"));
                    if (((_m = s.roe) !== null && _m !== void 0 ? _m : 0) > 0)
                        parts.push("ROE ".concat(s.roe.toFixed(0), "%"));
                    if (s.de_ratio != null && s.de_ratio < 0.5)
                        parts.push("Near debt-free");
                    else if (s.de_ratio != null && s.de_ratio < 1)
                        parts.push("Low D/E ".concat(s.de_ratio.toFixed(2)));
                    if (s.all_profitable)
                        parts.push("All years profitable");
                    if (s.profit_uptrend)
                        parts.push("Profit uptrend");
                    reason = parts.slice(0, 4).join(" · ") || "Strong fundamentals \u2014 ROCE ".concat(((_o = s.roce) !== null && _o !== void 0 ? _o : 0).toFixed(0), "%, ROE ").concat(((_p = s.roe) !== null && _p !== void 0 ? _p : 0).toFixed(0), "%");
                    return [4 /*yield*/, (0, db_1.createPick)({
                            stock_symbol: s.symbol, company_name: s.company_name,
                            direction: "LONG", pick_type: "longterm",
                            entry_low: entryLow, entry_high: entryHigh,
                            target: target,
                            stop_loss: stopLoss,
                            reason: reason,
                            risk_level: "low", status: "active",
                        })];
                case 13:
                    _q.sent();
                    longtermCount++;
                    _q.label = 14;
                case 14:
                    _b++;
                    return [3 /*break*/, 12];
                case 15:
                    console.log("[Picks] Done \u2014 ".concat(intradayCount, " intraday, ").concat(swingCount, " swing, ").concat(longtermCount, " longterm (total ").concat(intradayCount + swingCount + longtermCount, ")"));
                    return [2 /*return*/];
            }
        });
    });
}
// ── Cron ──────────────────────────────────────────────────────────────────────
function startScheduler() {
    var _this = this;
    // Daily prices: weekdays at 6:30 PM IST (13:00 UTC)
    node_cron_1.default.schedule("0 13 * * 1-5", function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("[Cron] Daily price refresh");
                    return [4 /*yield*/, refreshPrices()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); }, { timezone: "UTC" });
    // Daily alerts: weekdays at 7:30 AM IST (02:00 UTC)
    node_cron_1.default.schedule("0 2 * * 1-5", function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("[Cron] Daily alert digest");
                    return [4 /*yield*/, checkAlerts()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); }, { timezone: "UTC" });
    // Weekly fundamentals: Sunday 2:00 AM IST (Saturday 20:30 UTC)
    node_cron_1.default.schedule("30 20 * * 6", function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("[Cron] Weekly fundamentals refresh");
                    return [4 /*yield*/, refreshFundamentals()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); }, { timezone: "UTC" });
    // Daily picks: weekdays at 6:45 PM IST (13:15 UTC) — runs after price refresh at 13:00 UTC
    node_cron_1.default.schedule("15 13 * * 1-5", function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("[Cron] Daily auto-picks generation");
                    return [4 /*yield*/, generateDailyPicks()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); }, { timezone: "UTC" });
    console.log("[Scheduler] Cron jobs registered");
}
// ── CLI ───────────────────────────────────────────────────────────────────────
if (require.main === module) {
    var args_1 = process.argv.slice(2);
    (0, db_1.initDb)().then(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!args_1.includes("--seed")) return [3 /*break*/, 2];
                    return [4 /*yield*/, seedSymbols()];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 9];
                case 2:
                    if (!args_1.includes("--prices")) return [3 /*break*/, 4];
                    return [4 /*yield*/, refreshPrices()];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 9];
                case 4:
                    if (!args_1.includes("--fundamentals")) return [3 /*break*/, 6];
                    return [4 /*yield*/, refreshFundamentals()];
                case 5:
                    _a.sent();
                    return [3 /*break*/, 9];
                case 6:
                    if (!args_1.includes("--picks")) return [3 /*break*/, 8];
                    return [4 /*yield*/, generateDailyPicks()];
                case 7:
                    _a.sent();
                    return [3 /*break*/, 9];
                case 8:
                    console.log("Usage: ts-node src/scheduler.ts [--seed | --prices | --fundamentals | --picks]");
                    _a.label = 9;
                case 9:
                    process.exit(0);
                    return [2 /*return*/];
            }
        });
    }); }).catch(function (e) { console.error(e); process.exit(1); });
}
