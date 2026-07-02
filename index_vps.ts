// @ts-nocheck
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const market_1 = require("./market");
const kiteconnect_1 = require("kiteconnect");
const strategy_1 = require("./strategy");
const drishti_strategy_1 = require("./drishti_strategy");
const order_1 = require("./order");
const config_1 = require("./config");
const readline_1 = __importDefault(require("readline"));
const logger_1 = require("./logger");
const notifier_1 = require("./notifier");
const sendTelegram = (msg) => _tgSilenced ? Promise.resolve() : (0, notifier_1.sendTelegram)(msg);
const report_1 = require("./report");
// ─── Structured logger ───────────────────────────────────
function log(event, details = {}) {
    const ist = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    // Human-readable console output
    const detailStr = Object.entries(details)
        .map(([k, v]) => `${k}:${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(" | ");
    const ICONS = {
        HYBRID_CANDLE: "📊", HYBRID_SEEDED: "🌱", INTRABAR_SL_HIT: "⛔",
        ORDER_NOT_FILLED: "⚠️", ORDER_REJECTED: "❌", EXIT_FAIL: "❌",
        OPTION_SELECT_FAIL: "⚠️", BOT_START: "🟢", SKIP_CYCLE: "⏭",
        STATE_RESTORE: "💾", API_WARN: "⚠️", API_FAIL: "💥",
    };
    const icon = ICONS[event] ?? "▶";
    console.log(`${icon} [${ist}] ${event}${detailStr ? "  " + detailStr : ""}`);
    // Append JSON to crash.log for diagnostics
    const line = JSON.stringify({ time: ist, event, ...details });
    try {
        fs_1.default.appendFileSync("crash.log", line + "\n");
    }
    catch (_) { }
}
// ─── State ───────────────────────────────────────────────
const kite = new kiteconnect_1.KiteConnect({ api_key: config_1.config.apiKey });
kite.setAccessToken(config_1.config.accessToken);
let brokerPositions = [];
let brokerSyncInterval = null;
let apiFailureCount = 0;
let tradeInProgress = false;
// ─── Broker-State Sync (CRITICAL) ────────────────────────
function isMarketHours() {
    const now = new Date();
    const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const h = ist.getHours(), m = ist.getMinutes();
    return (h > 9 || (h === 9 && m >= 15)) && (h < 15 || (h === 15 && m <= 30));
}
async function getPositionsFromBroker() {
    // Retry up to 3 times with 2s backoff before counting as a failure
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const positions = await kite.getPositions();
            brokerPositions = positions.net.filter((p) => p.quantity !== 0);
            apiFailureCount = 0; // Reset streak on success
            return brokerPositions;
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            log("BROKER_API_FAIL", { attempt, error: msg });
            if (attempt < 3) {
                await new Promise(r => setTimeout(r, 2000 * attempt));
            }
        }
    }
    // All 3 attempts failed — only escalate during market hours
    if (isMarketHours()) {
        apiFailureCount++;
        log("BROKER_SYNC_FAIL", { apiFailureCount, activeTrade });
        // Warn exactly at 3 failures (not every subsequent failure — avoids spam)
        if (apiFailureCount === 3) {
            try {
                await sendTelegram(`⚠️ *API Warning* — broker sync failed 3 times in a row. Bot continuing.`);
            }
            catch (_) { }
        }
        if (apiFailureCount >= 10 && activeTrade) {
            stopForDay = true;
            try {
                const _pnlS = dailyPnL >= 0 ? "+" : "";
                await sendTelegram(`💥 *BOT STOPPED*\nReason: API failed ${apiFailureCount} times with an active trade\nDay P&L: ${_pnlS}${dailyPnL} pts | Trades: ${tradeCount}/${MAX_TRADES}\nRestart required`);
            }
            catch (_) { }
        }
    }
    return [];
}
async function syncBotWithBroker() {
    // Always wrap in try/catch — setInterval won't catch promise rejections
    try {
        if (!isMarketHours())
            return;
        // In PAPER/LIVE_SHADOW mode there are no real bot positions — skip broker sync entirely.
        // Otherwise shadow mode could square off unrelated real broker positions.
        const syncMode = (config_1.config.mode ?? "LIVE").toUpperCase();
        if (syncMode === "PAPER" || syncMode === "LIVE_SHADOW")
            return;
        const brokerPos = await getPositionsFromBroker();
        // If broker has open positions but bot thinks flat, flatten all
        if (brokerPos.length > 0 && !activeTrade) {
            log("BROKER_SYNC", { action: "Flattening stray broker positions", brokerPos });
            try {
                await (0, order_1.squareOffAll)();
            }
            catch (sqErr) {
                log("SQUARE_OFF_FAIL", { error: sqErr instanceof Error ? sqErr.message : String(sqErr) });
            }
            await sendTelegram("⚠️ *Broker Sync* — flattened stray open positions");
        }
        // If bot thinks active but broker is flat, reset bot state
        if (brokerPos.length === 0 && activeTrade) {
            log("BROKER_SYNC", { action: "Resetting bot state (broker flat)" });
            activeTrade = false;
            earlyEntryDone = false;
            mainEntryDone = false;
            pyramidDone = false;
            pyramidQty = 0;
            trendMode = false;
            trailActivated = false;
            tradeDirection = null;
            tradeSymbol = "";
            entryPrice = 0;
            earlyQty = 0;
            mainQty = 0;
        }
    }
    catch (syncErr) {
        log("BROKER_SYNC_ERROR", { error: syncErr instanceof Error ? syncErr.message : String(syncErr) });
    }
}
let tradeCount = 0;
let dailyPnL = 0;
let stopForDay = false;
let _tgSilenced = false; // once set, no more Telegram for rest of day
let _dailyPnlLogSaved = false; // ensures daily-pnl-log.json written only once per day
let earlyEntryDone = false;
let mainEntryDone = false;
let pyramidDone = false; // Upgrade 1: pyramid scale-in
let lastTradeProfit = false;
let consecutiveLosses = 0;
let drishtiWins = 0;
let drishtiLosses = 0;
let drishtiDTE = 23; // days-to-expiry at last entry, for real Rs calc
let dailyRealRs = 0; // cumulative day P&L in real futures Rs (fair premium)
let drishtiFuturesEntry = 0; // actual futures entry price (freshPrice, fair value)
// ── Options shadow bot (mirrors futures signals, different instrument) ────────
let optInTrade = false;
let optDir = null;
let optSymbol = "";
let optEntryPrem = 0;
let optEntryTime = 0;
let optDailyPts = 0; // option premium pts (exitPrem - entryPrem)
let optDailyRs = 0; // option ₹ (pts × qty)
let optWins = 0;
let optLosses = 0;
let optATMCache = null; // last-picked strike pair, kept for OPT_ATM_CACHE logging only — not used to short-circuit
let optInstrumentsCache = null; // NFO BANKNIFTY option instrument list, cached for the day
let drishtiFutSymbolCache = "";
let drishtiFutSymbolCacheAt = 0;
let optRecentTrades = [];
let entryPrice = 0;
// ── BODY_HOLD Shadow (S1=Fixed200SL, S2=CandleSL) ────────────────────────────
interface BHState { inTrade: boolean; dir: 'CE'|'PE'|null; entryIdx: number; entryPrem: number; optSym: string; sl: number; slPrem: number; waitDir: 'CE'|'PE'|null; dayFutPts: number; dayOptPts: number; dayFutRs: number; dayOptRs: number; winsFut: number; lossFut: number; winsOpt: number; lossOpt: number; }
const BH_EMPTY = (): BHState => ({ inTrade: false, dir: null, entryIdx: 0, entryPrem: 0, optSym: '', sl: 0, slPrem: 0, waitDir: null, dayFutPts: 0, dayOptPts: 0, dayFutRs: 0, dayOptRs: 0, winsFut: 0, lossFut: 0, winsOpt: 0, lossOpt: 0 });
let bhs1: BHState = BH_EMPTY();
let bhs2: BHState = BH_EMPTY();
let bhPrevCandle: { open: number; high: number; low: number; close: number } | null = null;
let bhCandleNum = 0;
// 10:30 index breakout shadow. Paper-only; never calls broker order functions.
interface TT1030TradeLog { time: string; dir: 'CE'|'PE'; entry: number; exit?: number; pts?: number; pnlRs?: number; reason?: string; premIn?: number; premOut?: number; symbol?: string; }
interface TT1030State {
    day: string; inTrade: boolean; dir: 'CE'|'PE'|null; entry: number; entryTime: string; sl: number;
    optSym: string; optEntryPrem: number; optLivePrem: number; refHigh: number; refLow: number;
    tenHigh: number; tenLow: number; tenTime: string; trades: number; wins: number; losses: number;
    dayPts: number; dayRs: number; log: TT1030TradeLog[]; candleLog: any[]; seen: Set<string>;
}
const TT1030_INDEX_TOKEN = 260105;
const TT1030_BOTH_SIDE_CLOSE_BUFFER = 25;
const TT1030_LIVE_AUDIT_FILE = 'tt1030-live-audit.jsonl';
const TT1030_LIVE_AUDIT_STATE_FILE = 'tt1030-live-audit-state.json';
const TT1030_MAX_SIGNAL_DELAY_MS = 2 * 60 * 1000;
const TT1030_MAX_ENTRY_SLIPPAGE_PTS = Number(config_1.config.risk?.maxAllowedSlippagePts ?? 50);
const TT1030_WARN_RISK_PTS = Number(config_1.config.risk?.maxFuturesLossPts ?? 150);
const TT1030_EMPTY = (): TT1030State => ({ day: '', inTrade: false, dir: null, entry: 0, entryTime: '', sl: 0, optSym: '', optEntryPrem: 0, optLivePrem: 0, refHigh: 0, refLow: 0, tenHigh: 0, tenLow: 0, tenTime: '', trades: 0, wins: 0, losses: 0, dayPts: 0, dayRs: 0, log: [], candleLog: [], seen: new Set<string>() });
let tt1030: TT1030State = TT1030_EMPTY();
let tt1030AuditIssues: any[] = [];
let tt1030LastSignalKey = "";
let tradeSymbol = "";
let tradeDirection = null;
let earlyQty = 0;
let mainQty = 0;
let pyramidQty = 0; // Upgrade 1: pyramid qty
let prevCandleVolume = 0;
let avgVolume = 0;
let avgCandleSize = 0;
let lastExitTime = null;
let entryTime = 0;
let entrySlippage = 0;
let tradeAIScore = 0;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
let lastKnownPrice = 0; // updated each runBot cycle for live PnL display
const TOTAL_QTY = config_1.config.quantity;
const DAILY_LOSS_CAP = Number.POSITIVE_INFINITY; // disabled: do not stop the day based on theoretical strategy/index points
const MAX_TRADES = config_1.config.risk.maxTradesPerDay ?? 3; // allow re-entries for recovery trade
const MIN_BREAKOUT_MARGIN = config_1.config.optionSelection.minBreakoutMargin ?? 50; // min pts past body level
const TARGET_PTS = config_1.config.tradeManagement.targetPoints ?? 0; // legacy; kept for reference
const TRAIL_ACTIVATE_PTS = config_1.config.tradeManagement.trailActivatePts ?? 300; // profit pts to activate reversal-candle trail
const REVERSAL_BODY_MIN = config_1.config.tradeManagement.reversalBodyMin ?? 75; // min candle body pts for valid reversal candle
const SLIPPAGE_LIMIT = 10;
const FAST_EXIT_POINTS = 40; // Fast exit threshold for early entry probe
const TREND_TRIGGER = 150; // Profit at which trend mode activates
let capitalProtectionTriggered = false;
let activeTrade = false;
let trendMode = false; // Trend mode: hold long, trail only, allow re-entry
let trailActivated = false; // true after profit hits TRAIL_ACTIVATE_PTS → switch to reversal-candle trailing SL
let justRestored = false; // True for 1 cycle after state restore — blocks duplicate entry
let lastEntryCandleDate = ""; // Date key of the last completed candle seen by runBot
let prevCandleForEntry = null; // The candle BEFORE the current one — used for breakout comparison
let candleSL = 0; // Candle-based SL: low of breakout candle (CE) or high (PE); trails on continuation
// ─── RC Strategy state ────────────────────────────────────────────────────────
// BODY_BREAKOUT strategy:  enter directly on breakout candle
// RC_CONFIRM strategy:     Step1 — detect breakout → set rcWaiting=true
//                          Step2 — next candle = Reversal Candle → enter Trade1 at RC close
//                                  SL = RC low (CE) or RC high (PE)
//                          Step3 — if Trade1 SL hit → enter Trade2 in opposite direction
//                                  SL = that candle's low (CE) or high (PE)  Max 2 trades total
const ACTIVE_STRATEGY = config_1.config.activeStrategy ?? "BODY_BREAKOUT";
let rcWaiting = false; // true when breakout seen — waiting for RC to form
let rcBreakoutDir = null; // direction of the detected breakout
let rcTrade2Active = false; // true when we are in Trade 2 (trend trade after T1 SL)
let rcIndexSL = 0; // index-price based SL for RC strategy (RC low/high)
// ─── HYBRID_REVERSE strategy state ───────────────────────────────────────────
// Signal: prevBodyHigh/Low + 25pt buffer | EarlyExit C1-3 | SL ±100 | HybridReverse
let hybridState = (0, strategy_1.createHybridState)();
let pdhHigh = 0;
let pdhLow = 0;
let pdhContext = "NEUTRAL"; // "BULLISH" | "BEARISH" | "NEUTRAL"
let hybridPrevCandle = null; // candle BEFORE the last completed candle
let hybridLastCandleKey = "";
// ─── SHADOW LOCK50 — runs in parallel, paper-only, no real orders ─────────────
// ── DRISHTI V1 state ─────────────────────────────────────────────────────────
let DrishtiState = (0, drishti_strategy_1.createDrishtiState)();
let drishtiTodayCandles = [];
let drishtiPrevDayCandles = [];
let drishtiLastCandleKey = "";
let drishtiIntradayPeak = 0; // updated every 60s by LTP monitor
let ltpMonitorInterval = null;
let DrishtiCandleLog = [];
let entryPremium = 0; // option LTP at trade entry
let lastOptionLTP = 0; // option LTP updated every monitor cycle
let itmHoldPositions = [];
const ITM_HOLD_STATE_FILE = "itm-hold-state.json";
function saveITMHoldState() {
    try {
        fs_1.default.writeFileSync(ITM_HOLD_STATE_FILE, JSON.stringify(itmHoldPositions, null, 2));
    }
    catch (_) { }
}
function restoreITMHoldState() {
    try {
        if (!fs_1.default.existsSync(ITM_HOLD_STATE_FILE))
            return;
        const raw = fs_1.default.readFileSync(ITM_HOLD_STATE_FILE, "utf-8");
        const positions = JSON.parse(raw);
        // Drop positions whose hold period has already expired
        itmHoldPositions = positions.filter(p => Date.now() < p.exitAfter);
        log("ITM_HOLD_RESTORE", { count: itmHoldPositions.length, positions: itmHoldPositions.map(p => p.symbol) });
    }
    catch (e) {
        log("ITM_HOLD_RESTORE_FAIL", { error: e instanceof Error ? e.message : String(e) });
    }
}
// ─── Candle Breakout Monitor ────────────────────────────
// Fires a Telegram status once per 15-min candle at candle completion.
// Compares each completed candle vs the one before it.
let lastCandleKey = ""; // key of the last candle we already notified on
// In-memory record of the candle BEFORE the current reference (for comparison)
let anteCandle = null;
async function monitorCandleBreakouts() {
    try {
        if (!(0, strategy_1.isWithinTime)(9, 16, 15, 30))
            return;
        // getPreviousCandle() always returns the most recently COMPLETED 15-min candle
        const prev = await (0, market_1.getPreviousCandle)();
        const price = await (0, market_1.getCurrentPrice)();
        if (!price || price <= 0)
            return;
        // Guard: ensure candle has valid OHLC — bad API response returns empty/partial data
        if (!prev || !prev.high || !prev.low || !prev.open || !prev.close) {
            // Before 9:30 AM the first candle hasn't closed yet — API returning empty is expected, stay silent
            const _preIst = new Date(new Date().getTime() + 5.5 * 3600000);
            if (_preIst.getUTCHours() < 9 || (_preIst.getUTCHours() === 9 && _preIst.getUTCMinutes() < 30))
                return;
            log("CANDLE_MONITOR_ERR", { reason: "Invalid candle data from API", prev });
            return;
        }
        const candleKey = prev.date ?? `${prev.high}_${prev.low}`;
        // ── New 15-min candle just completed ─────────────────
        if (candleKey !== lastCandleKey) {
            // Wait 5s for Zerodha API to finalize the completed candle's close price
            await new Promise(r => setTimeout(r, 5000));
            const confirmedPrev = await (0, market_1.getPreviousCandle)();
            const confirmedKey = confirmedPrev.date ?? `${confirmedPrev.high}_${confirmedPrev.low}`;
            // Use confirmed data if it's the same candle (guards against edge-case where a new candle formed in 5s)
            const finalPrev = confirmedKey === candleKey ? confirmedPrev : prev;
            // prevCandle = what was previously in anteCandle (the candle BEFORE the just-completed one)
            const prevCandle = anteCandle;
            // Store the just-completed candle so next time it becomes the comparison base
            anteCandle = { open: finalPrev.open, high: finalPrev.high, low: finalPrev.low, close: finalPrev.close };
            lastCandleKey = candleKey;
            const bodyHigh = Math.max(finalPrev.open, finalPrev.close);
            const bodyLow = Math.min(finalPrev.open, finalPrev.close);
            const colour = finalPrev.close >= finalPrev.open ? "🟢 Bullish" : "🔴 Bearish";
            const ist = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
            let status = "🔲 First candle of session";
            let detail = "";
            if (prevCandle) {
                const aBH = Math.max(prevCandle.open, prevCandle.close);
                const aBL = Math.min(prevCandle.open, prevCandle.close);
                const brokeFullHigh = finalPrev.high > prevCandle.high;
                const brokeFullLow = finalPrev.low < prevCandle.low;
                const brokeBodyHigh = finalPrev.high > aBH;
                const brokeBodyLow = finalPrev.low < aBL;
                if (brokeFullHigh && brokeFullLow) {
                    status = "↕️ Outside Bar — broke both High & Low";
                }
                else if (brokeFullHigh) {
                    status = "📈 Broke Full High";
                    detail = `Prev high: ${prevCandle.high}  →  This candle high: ${finalPrev.high}`;
                }
                else if (brokeFullLow) {
                    status = "📉 Broke Full Low";
                    detail = `Prev low: ${prevCandle.low}  →  This candle low: ${finalPrev.low}`;
                }
                else if (brokeBodyHigh) {
                    status = "📈 Broke Body High";
                    detail = `Prev body high: ${aBH}  →  This candle high: ${finalPrev.high}`;
                }
                else if (brokeBodyLow) {
                    status = "📉 Broke Body Low";
                    detail = `Prev body low: ${aBL}  →  This candle low: ${finalPrev.low}`;
                }
                else {
                    status = "🔲 Inside — no breakout";
                    detail = `Stayed inside prev body ${aBL}–${aBH}`;
                }
            }
            // ── Strategy context block ───────────────────────────────────────────
            const HR_BUF_MON = 25;
            let strategyCtx = "";
            if (ACTIVE_STRATEGY === "HYBRID_REVERSE") {
                const inTrade = activeTrade || mainEntryDone || earlyEntryDone;
                // ── Helper: "Next candle needs to close at:" trigger block ───────────
                // showBoth=true → show CE + PE (breakout watching)
                // showBoth=false, dir set → show only that direction (re-entry)
                const buildTriggerBlock = (trigCE, trigPE, showBoth, onlyDir) => {
                    const _ceDist = price - trigCE;
                    const _peDist = trigPE - price;
                    const ceArrow = "📈";
                    const peArrow = "📉";
                    const ceInfo = _ceDist >= 0 ? "\u2191 " + Math.abs(_ceDist).toFixed(0) + " pts ahead" : Math.abs(_ceDist).toFixed(0) + " pts away";
                    const peInfo = _peDist >= 0 ? "\u2191 " + Math.abs(_peDist).toFixed(0) + " pts ahead" : Math.abs(_peDist).toFixed(0) + " pts away";
                    let lines = "";
                    if (showBoth || onlyDir === "CE")
                        lines += `${ceArrow} CE ≥ *${trigCE}*  —  ${ceInfo}\n`;
                    if (showBoth || onlyDir === "PE")
                        lines += `${peArrow} PE ≤ *${trigPE}*  —  ${peInfo}\n`;
                    lines += `Live: *${price}*`;
                    return lines;
                };
                if (inTrade && tradeDirection) {
                    // ── IN TRADE ────────────────────────────────────────────────────────
                    const unrealised = tradeDirection === "CE" ? price - entryPrice : entryPrice - price;
                    const slLevel = hybridState.sl > 0 ? hybridState.sl : (tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100);
                    const pnlSign = unrealised >= 0 ? "+" : "";
                    strategyCtx =
                        `━━━━━━━━━━━━━━━━━━\n` +
                            `🔵 *In Trade · ${tradeDirection}*\n` +
                            `Entry: ${entryPrice}  ·  SL: ${slLevel}  (−100 pts)\n` +
                            `🟢 *${pnlSign}${unrealised.toFixed(0)} pts gathered* \u00B7 SL: ${typeof slLevel === "number" ? slLevel.toFixed(0) : slLevel}\n` +
                            `📊 *${dailyPnL >= 0 ? "+" : ""}${Math.round(dailyPnL)} pts*  ·  ${drishtiWins}W ${drishtiLosses}L  ·  T:${tradeCount}/5`;
                }
                else if (hybridState.waitReEntry && hybridState.dir) {
                    // ── WATCHING FOR RE-ENTRY (after wick-only SL) ──────────────────────
                    // Re-entry trigger (from strategy.ts):
                    //   CE: current.close > state.refHigh  (refHigh = signal candle HIGH)
                    //   PE: current.close < state.refHigh  (refHigh = signal candle LOW)
                    // No extra buffer — just the candle extreme stored at entry time
                    const dir = hybridState.dir;
                    const refLevel = hybridState.refHigh;
                    if (refLevel > 0) {
                        const arrow = dir === "CE" ? "⬆️" : "⬇️";
                        const symbol = dir === "CE" ? ">" : "<";
                        const distPts = dir === "CE" ? (price - refLevel) : (refLevel - price);
                        const distIcon = distPts >= 0 ? "✅" : "❌";
                        const distStr = `${distIcon} ${Math.abs(distPts).toFixed(0)} pts ${distPts >= 0 ? "past trigger" : "away"}`;
                        strategyCtx =
                            `━━━━━━━━━━━━━━━━━━\n` +
                                `⏳ *Re-Entry · ${dir}*\n` +
                                `Next: ${dir} close ${symbol} *${refLevel}*  ·  ${distStr}\n` +
                                `Live: *${price}*\n` +
                                `📊 *${dailyPnL >= 0 ? "+" : ""}${Math.round(dailyPnL)} pts*  ·  ${drishtiWins}W ${drishtiLosses}L  ·  T:${tradeCount}/5`;
                    }
                    else {
                        strategyCtx =
                            `━━━━━━━━━━━━━━━━━━\n` +
                                `⏳ *WATCHING FOR RE-ENTRY · ${dir}*\n` +
                                `⚠️ Re-entry level not available\n` +
                                `📊 *${dailyPnL >= 0 ? "+" : ""}${Math.round(dailyPnL)} pts*  ·  ${drishtiWins}W ${drishtiLosses}L  ·  T:${tradeCount}/5`;
                    }
                }
                else if (hybridState.firstDone && !hybridState.waitReEntry && !inTrade) {
                    // ── DONE FOR DAY ────────────────────────────────────────────────────
                    strategyCtx =
                        `━━━━━━━━━━━━━━━━━━\n` +
                            `✅ Done for Day\n` +
                            `📊 *${dailyPnL >= 0 ? "+" : ""}${Math.round(dailyPnL)} pts*  ·  ${drishtiWins}W ${drishtiLosses}L  ·  T:${tradeCount}/5`;
                }
                else {
                    // ── WATCHING FOR BREAKOUT (no trade yet today) ──────────────────────
                    let sigStatus = "";
                    if (prevCandle) {
                        const refBH = Math.max(prevCandle.open, prevCandle.close);
                        const refBL = Math.min(prevCandle.open, prevCandle.close);
                        const ceLvl = refBH + HR_BUF_MON;
                        const peLvl = refBL - HR_BUF_MON;
                        if (finalPrev.close > ceLvl) {
                            sigStatus = `🟢 *CE SIGNAL FIRED!*\nclose ${finalPrev.close} > ${ceLvl} (+${(finalPrev.close - ceLvl).toFixed(0)} margin)\n→ Entry order being placed\n`;
                        }
                        else if (finalPrev.close < peLvl) {
                            sigStatus = `🔴 *PE SIGNAL FIRED!*\nclose ${finalPrev.close} < ${peLvl} (+${(peLvl - finalPrev.close).toFixed(0)} margin)\n→ Entry order being placed\n`;
                        }
                        else {
                            const nextBH = Math.max(finalPrev.open, finalPrev.close);
                            const nextBL = Math.min(finalPrev.open, finalPrev.close);
                            sigStatus = buildTriggerBlock(nextBH + HR_BUF_MON, nextBL - HR_BUF_MON, true);
                        }
                    }
                    else {
                        const nextBH = Math.max(finalPrev.open, finalPrev.close);
                        const nextBL = Math.min(finalPrev.open, finalPrev.close);
                        sigStatus = buildTriggerBlock(nextBH + HR_BUF_MON, nextBL - HR_BUF_MON, true);
                    }
                    strategyCtx =
                        `━━━━━━━━━━━━━━━━━━\n` +
                            `👁 👁 Watching\n` +
                            `${sigStatus}\n` +
                            `📊 *${dailyPnL >= 0 ? "+" : ""}${Math.round(dailyPnL)} pts*  ·  ${drishtiWins}W ${drishtiLosses}L  ·  T:${tradeCount}/5`;
                }
            }
            // DRISHTI_V1 context
            if (ACTIVE_STRATEGY === "DRISHTI_V1") {
                const _bPH = drishtiPrevDayCandles.length > 0 ? Math.max(...drishtiPrevDayCandles.map((c) => c.high)).toFixed(0) : "?";
                const _bPL = drishtiPrevDayCandles.length > 0 ? Math.min(...drishtiPrevDayCandles.map((c) => c.low)).toFixed(0) : "?";
                const _bCtx = price > parseFloat(_bPH) ? "ABOVE PDH" : price < parseFloat(_bPL) ? "BELOW PDL" : "INSIDE";
                const _bSign = dailyPnL >= 0 ? "+" : "";
                if (DrishtiState.inTrade && tradeDirection) {
                    const _bu = tradeDirection === "CE" ? price - entryPrice : entryPrice - price;
                    const _bUS = _bu >= 0 ? "+" : "";
                    const _bSL = DrishtiState.trailStop <= 0
                        ? (tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100).toFixed(0)
                        : (entryPrice + (tradeDirection === "CE" ? DrishtiState.trailStop : -DrishtiState.trailStop)).toFixed(0);
                    const _bSLlabel = DrishtiState.trailStop <= 0 ? "Hard SL" : "Trail lock";
                    strategyCtx = `In Trade (${tradeDirection}) | ${_bCtx}\n`
                        + `Entry: ${entryPrice.toFixed(0)} | ${_bSLlabel}: ${_bSL}\n`
                        + `P&L: ${_bUS}${_bu.toFixed(0)} pts | Peak: ${DrishtiState.peakPts.toFixed(0)} pts\n`
                        + `Day: ${_bSign}${dailyPnL.toFixed(0)} | ${drishtiWins}W ${drishtiLosses}L | T:${tradeCount}/8`;
                }
                else if (DrishtiState.firstDone && !DrishtiState.inTrade) {
                    const _reNum = DrishtiState.reCount + 1;
                    const _re = DrishtiState.reCount < 8
                        ? `⏳ Watching RE #${_reNum}` : `✅ All trades done`;
                    strategyCtx = `${_re}\n`
                        + `Day: ${_bSign}${dailyPnL.toFixed(0)} pts | Rs${dailyRealRs >= 0 ? '+' : ''}${dailyRealRs.toLocaleString('en-IN')} | ${drishtiWins}W ${drishtiLosses}L | T:${tradeCount}/8`;
                }
                else {
                    strategyCtx = `Watching | Candle #${drishtiTodayCandles.length}\n`
                        + `PDH: ${_bPH} | PDL: ${_bPL} | ${_bCtx}\n`
                        + `Live: ${price} | SL: 100 pts\n`
                        + `Day: ${_bSign}${dailyPnL.toFixed(0)} | T:${tradeCount}/8`;
                }
            }
            // TG_LABEL
            if (strategyCtx && ACTIVE_STRATEGY === "DRISHTI_V1") {
                strategyCtx = `━━━━━━━━━━━━━━━━━━\n📈 *DRISHTI V1*\n` + strategyCtx;
            }
            else if (strategyCtx) {
                strategyCtx = `━━━━━━━━━━━━━━━━━━\n🔷 *LOCK50*\n` + strategyCtx.replace(/^━━━━━━━━━━━━━━━━━━\n/, "");
            }
            // Clean candle summary line → visible in server log section
            const _bPct = finalPrev.high !== finalPrev.low
                ? Math.round(((finalPrev.close - finalPrev.open) / (finalPrev.high - finalPrev.low)) * 100)
                : 0;
            const _bSign = _bPct >= 0 ? '+' : '';
            const _cIdx = ACTIVE_STRATEGY === 'DRISHTI_V1' ? drishtiTodayCandles.length : '';
            console.log(`${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} 🕯️ Candle${_cIdx ? ' C' + _cIdx : ''} | Close:${finalPrev.close} | Body:${_bSign}${_bPct}% | ${colour} | O:${finalPrev.open} H:${finalPrev.high} L:${finalPrev.low}`);
            // Skip candle notifications if done for the day OR no-trade day
            // Case 1: trade happened and exited (firstDone)
            // Case: DRISHTI_V1 watching all day with no trade, past C20 (~2:15 PM) — entry window effectively closed → skip TG
            const _noTradeAllDay = ACTIVE_STRATEGY === "DRISHTI_V1"
                && !DrishtiState.firstDone && !DrishtiState.inTrade && tradeCount === 0
                && drishtiTodayCandles.length > 20;
            const _doneForDay = _noTradeAllDay ||
                (ACTIVE_STRATEGY === "DRISHTI_V1" && stopForDay && !DrishtiState.inTrade) ||
                (ACTIVE_STRATEGY === "HYBRID_REVERSE" && hybridState.firstDone && !hybridState.waitReEntry && !(activeTrade || mainEntryDone || earlyEntryDone)) ||
                (ACTIVE_STRATEGY === "HYBRID_REVERSE" && stopForDay && !activeTrade);
            if (_doneForDay) {
                log("CANDLE_STATUS", { status, candle: finalPrev, price, skipped: _noTradeAllDay ? "no_trade_day_c20+" : "done_for_day" });
                return;
            }
            await sendTelegram(`🕯️ *15-Min Candle*  ${ist}  ${colour}\n` +
                `O: ${finalPrev.open}  H: ${finalPrev.high}  L: ${finalPrev.low}  C: ${finalPrev.close}\n` +
                (strategyCtx ? `${strategyCtx}` : "") +
                `\n━━━━━━━━━━━━━━━━━━\n` +
                `[🔑 Token](https://139-59-18-52.nip.io/login)  ·  [📊 Dashboard](http://139.59.18.52/dashboard)`);
            log("CANDLE_STATUS", { status, candle: finalPrev, price });
            // Write last candle to heartbeat for dashboard
            try {
                const _hbRaw = fs_1.default.existsSync("bot-heartbeat.json") ? fs_1.default.readFileSync("bot-heartbeat.json", "utf-8") : "{}";
                const _hb = JSON.parse(_hbRaw);
                _hb.lastCandle = { time: ist, open: finalPrev.open, high: finalPrev.high, low: finalPrev.low, close: finalPrev.close, colour: colour.includes("Bullish") ? "bull" : "bear", status };
                fs_1.default.writeFileSync("bot-heartbeat.json", JSON.stringify(_hb));
            }
            catch (_) { }
        }
        // No live intra-candle alerts — notification fires once per candle at completion only
    }
    catch (e) {
        const _cm = (e instanceof Error ? e.message : String(e)).toLowerCase();
        if (_cm.includes("incorrect") && (_cm.includes("api_key") || _cm.includes("access_token"))) {
            if (Date.now() - tokenAlertLastSent > 30 * 60 * 1000) {
                tokenAlertLastSent = Date.now();
                const _cist = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
                sendTelegram(`🔴 *TOKEN EXPIRED — Action Required*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Zerodha access token is invalid or expired.\n` +
                    `*Bot is not trading until you re-authenticate.*\n\n` +
                    `➡ Open this link, log in & paste the redirect URL:\n` +
                    `https://139-59-18-52.nip.io/login\n\n` +
                    `⏰ Detected at: ${_cist} IST`).catch(() => { });
            }
        }
        log("CANDLE_MONITOR_ERR", { error: e instanceof Error ? e.message : String(e) });
    }
}
// ─── Trade State Persistence ──────────────────────────────
const STATE_FILE = "trade-state.json";
function saveTradeState() {
    const state = {
        savedAt: new Date().toISOString(),
        earlyEntryDone,
        mainEntryDone,
        activeTrade,
        pyramidDone,
        tradeDirection,
        tradeSymbol,
        entryPrice,
        earlyQty,
        mainQty,
        pyramidQty,
        entryTime,
        entrySlippage,
        tradeAIScore,
        tradeCount,
        dailyPnL,
        dailyRealRs,
        drishtiDTE,
        drishtiFuturesEntry,
        // Options shadow state — must persist across restarts or open position is lost
        optInTrade, optDir, optSymbol, optEntryPrem, optEntryTime,
        optDailyPts, optDailyRs, optWins, optLosses,
        consecutiveLosses,
        lastTradeProfit,
        trendMode,
        candleSL,
        trailActivated,
        // RC strategy state
        rcWaiting,
        rcBreakoutDir,
        rcTrade2Active,
        rcIndexSL,
        entryPremium,
        drishtiWins,
        drishtiLosses,
        // HYBRID_REVERSE live state — must survive restarts (PM2 auto-restart)
        hybridState: {
            inTrade: hybridState.inTrade,
            dir: hybridState.dir,
            entry: hybridState.entry,
            sl: hybridState.sl,
            refHigh: hybridState.refHigh,
            firstDone: hybridState.firstDone,
            reUsed: hybridState.reUsed,
            waitReEntry: hybridState.waitReEntry,
            isC1: hybridState.isC1,
        },
        // DRISHTI_V1 live state — must survive restarts
        drishtiState: {
            inTrade: DrishtiState.inTrade,
            dir: DrishtiState.dir,
            entry: DrishtiState.entry,
            entryIdx: DrishtiState.entryIdx,
            trailStop: DrishtiState.trailStop,
            peakPts: DrishtiState.peakPts,
            firstDone: DrishtiState.firstDone,
            reCount: DrishtiState.reCount,
            lastExitPts: DrishtiState.lastExitPts,
            lastExitIdx: DrishtiState.lastExitIdx,
            lastExitDir: DrishtiState.lastExitDir,
        },
    };
    try {
        fs_1.default.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    }
    catch (e) {
        log("STATE_SAVE_FAIL", { error: e instanceof Error ? e.message : String(e) });
    }
}
function clearTradeState() {
    try {
        if (fs_1.default.existsSync(STATE_FILE))
            fs_1.default.unlinkSync(STATE_FILE);
    }
    catch (e) {
        log("STATE_CLEAR_FAIL", { error: e instanceof Error ? e.message : String(e) });
    }
    entryPremium = 0;
    lastOptionLTP = 0;
}
function restoreTradeState() {
    try {
        if (!fs_1.default.existsSync(STATE_FILE)) {
            log("STATE_RESTORE", { action: "No state file found" });
            return false;
        }
        const raw = fs_1.default.readFileSync(STATE_FILE, "utf-8");
        const s = JSON.parse(raw);
        // Only restore if state was saved today — compare ISO date strings (YYYY-MM-DD) in IST
        // Avoids locale-format inconsistencies on Windows with toLocaleDateString()
        const savedIST = new Date(new Date(s.savedAt).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const todayIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const savedDate = `${savedIST.getFullYear()}-${savedIST.getMonth()}-${savedIST.getDate()}`;
        const todayDate = `${todayIST.getFullYear()}-${todayIST.getMonth()}-${todayIST.getDate()}`;
        if (savedDate !== todayDate) {
            log("STATE_RESTORE", { action: "Stale state ignored (different day)", savedDate, todayDate });
            clearTradeState();
            return false;
        }
        earlyEntryDone = s.earlyEntryDone ?? false;
        mainEntryDone = s.mainEntryDone ?? false;
        activeTrade = s.activeTrade ?? (s.mainEntryDone || s.earlyEntryDone) ?? false;
        pyramidDone = s.pyramidDone ?? false;
        tradeDirection = s.tradeDirection ?? null;
        tradeSymbol = s.tradeSymbol ?? "";
        entryPrice = s.entryPrice ?? 0;
        earlyQty = s.earlyQty ?? 0;
        mainQty = s.mainQty ?? 0;
        pyramidQty = s.pyramidQty ?? 0;
        entryTime = s.entryTime ?? 0;
        entrySlippage = s.entrySlippage ?? 0;
        tradeAIScore = s.tradeAIScore ?? 0;
        tradeCount = s.tradeCount ?? 0;
        dailyPnL = s.dailyPnL ?? 0;
        dailyRealRs = s.dailyRealRs ?? 0;
        drishtiDTE = s.drishtiDTE ?? 26;
        drishtiFuturesEntry = s.drishtiFuturesEntry ?? 0;
        // Restore options shadow state
        if (s.optInTrade && s.optSymbol && (s.optEntryPrem ?? 0) > 0) {
            optInTrade = true;
            optDir = s.optDir ?? null;
            optSymbol = s.optSymbol ?? "";
            optEntryPrem = s.optEntryPrem ?? 0;
            optEntryTime = s.optEntryTime ?? 0;
            log("OPT_STATE_RESTORE", { symbol: optSymbol, dir: optDir, entryPrem: optEntryPrem });
        }
        optDailyPts = s.optDailyPts ?? 0;
        optDailyRs = s.optDailyRs ?? 0;
        optWins = s.optWins ?? 0;
        optLosses = s.optLosses ?? 0;
        consecutiveLosses = s.consecutiveLosses ?? 0;
        lastTradeProfit = s.lastTradeProfit ?? false;
        trendMode = s.trendMode ?? false;
        candleSL = s.candleSL ?? 0;
        trailActivated = s.trailActivated ?? false;
        rcWaiting = s.rcWaiting ?? false;
        rcBreakoutDir = s.rcBreakoutDir ?? null;
        rcTrade2Active = s.rcTrade2Active ?? false;
        rcIndexSL = s.rcIndexSL ?? 0;
        entryPremium = s.entryPremium ?? 0;
        // Restore LOCK50 live stats
        drishtiWins = s.drishtiWins ?? 0;
        drishtiLosses = s.drishtiLosses ?? 0;
        // Restore HYBRID_REVERSE state so waitReEntry / refHigh survive PM2 restarts
        if (s.hybridState) {
            hybridState.inTrade = s.hybridState.inTrade ?? false;
            hybridState.dir = s.hybridState.dir ?? null;
            hybridState.entry = s.hybridState.entry ?? 0;
            hybridState.sl = s.hybridState.sl ?? 0;
            hybridState.refHigh = s.hybridState.refHigh ?? 0;
            hybridState.firstDone = s.hybridState.firstDone ?? false;
            hybridState.reUsed = s.hybridState.reUsed ?? false;
            hybridState.waitReEntry = s.hybridState.waitReEntry ?? false;
            hybridState.isC1 = s.hybridState.isC1 ?? false;
        }
        // Restore DRISHTI_V1 state so active trades survive PM2 restarts
        if (s.drishtiState) {
            DrishtiState.inTrade = s.drishtiState.inTrade ?? false;
            DrishtiState.dir = s.drishtiState.dir ?? null;
            DrishtiState.entry = s.drishtiState.entry ?? 0;
            DrishtiState.entryIdx = s.drishtiState.entryIdx ?? -1;
            DrishtiState.trailStop = s.drishtiState.trailStop ?? -100;
            DrishtiState.peakPts = s.drishtiState.peakPts ?? 0;
            DrishtiState.firstDone = s.drishtiState.firstDone ?? false;
            DrishtiState.reCount = s.drishtiState.reCount ?? 0;
            DrishtiState.lastExitPts = s.drishtiState.lastExitPts ?? 0;
            DrishtiState.lastExitIdx = s.drishtiState.lastExitIdx ?? -1;
            DrishtiState.lastExitDir = s.drishtiState.lastExitDir ?? null;
        }
        else if ((s.tradeCount ?? 0) > 0) {
            // Fallback for old state files that didn't save drishtiState:
            // tradeCount > 0 means at least one trade happened today → firstDone must be true.
            // Set synchronously here so the trading interval never sees firstDone=false
            // (the async backfill reconstruction had a race condition on multi-restart days).
            DrishtiState.firstDone = true;
            DrishtiState.lastExitPts = 0; // unknown — gate OFF, any exit qualifies for re-entry
            log("STATE_RESTORE", { action: "DrishtiState.firstDone=true inferred from tradeCount (no drishtiState in file)" });
        }
        log("STATE_RESTORE", {
            action: "Trade state restored from file",
            symbol: tradeSymbol, direction: tradeDirection, entryPrice, mainEntryDone, activeTrade, candleSL,
        });
        return true;
    }
    catch (e) {
        log("STATE_RESTORE_FAIL", { error: e instanceof Error ? e.message : String(e) });
        return false;
    }
}
// ─── AI Score helper ─────────────────────────────────────
function computeAIScore(conditions) {
    const passed = conditions.filter(Boolean).length;
    return Math.round((passed / conditions.length) * 100) / 100;
}
// ─── Real-time Status ────────────────────────────────────
function printStatus() {
    const ist = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const mode = (config_1.config.mode || "LIVE").toUpperCase();
    const inTrade = earlyEntryDone || mainEntryDone;
    let livePnL = dailyPnL;
    if (inTrade && entryPrice > 0 && lastKnownPrice > 0 && tradeDirection) {
        const unrealized = tradeDirection === "CE" ? lastKnownPrice - entryPrice : entryPrice - lastKnownPrice;
        livePnL = dailyPnL + unrealized;
    }
    const pnlSign = livePnL >= 0 ? "+" : "";
    const tradeStatus = inTrade
        ? `IN TRADE (${tradeDirection ?? "?"}) | Entry: ${entryPrice} | Live: ${lastKnownPrice}`
        : "FLAT";
    if (ACTIVE_STRATEGY === "DRISHTI_V1") {
        const _pdH = drishtiPrevDayCandles.length > 0 ? Math.max(...drishtiPrevDayCandles.map((c) => c.high)).toFixed(0) : "?";
        const _pdL = drishtiPrevDayCandles.length > 0 ? Math.min(...drishtiPrevDayCandles.map((c) => c.low)).toFixed(0) : "?";
        const _hhmm = ist.split(',')[1]?.trim().slice(0, 8) ?? ist;
        console.log(String.fromCharCode(68,82,73,83,72,84,73,32,82,69,65,76,58,32,70,117,116,32,82,115,32) + dailyRealRs + String.fromCharCode(32,124,32,79,112,116,32,82,115,32) + optDailyRs + String.fromCharCode(32,124,32,67,111,109,98,105,110,101,100,32,82,115,32) + combinedRealRs() + String.fromCharCode(32,124,32,83,116,114,97,116,101,103,121,80,116,115,32) + livePnL.toFixed(0) + String.fromCharCode(32,124,32,84,58) + tradeCount + String.fromCharCode(47) + MAX_TRADES + String.fromCharCode(32,124,32) + tradeStatus);
    }
    else {
    }
}
// ─── Main Loop ───────────────────────────────────────────
let runBotActive = false; // prevents concurrent runBot calls stacking up when API hangs
let tokenAlertLastSent = 0; // ms timestamp, re-alerts every 30min (0=never sent)
let _tokenAutoRefreshing = false; // prevents multiple concurrent auto-refresh attempts
let _candleHealthAlerted = false; // prevents duplicate 9:45 AM candle-silence alerts
// ══════════════════════════════════════════════════════════════════════════════
//  ITM_HOLD STRATEGY — runs when activeStrategy = "ITM_HOLD"
//  Signal: BB+CandleLow 15-min breakout (same as BODY_BREAKOUT)
//  Option: ITM monthly (strike = spot - strikeOffset for CE, spot + strikeOffset for PE)
//  Hold:   holdDays calendar days OR index SL hit, whichever comes first
//  Max:    maxConcurrent simultaneous positions (~Rs 42-44k capital each)
// ══════════════════════════════════════════════════════════════════════════════
async function runITMHoldBot() {
    const now = new Date();
    const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const h = ist.getHours(), m = ist.getMinutes();
    // Daily reset at 9:15 — ITM_HOLD does NOT close positions at reset (they span multiple days)
    if (h === 9 && m === 15) {
        stopForDay = false;
        capitalProtectionTriggered = false;
        dailyPnL = 0;
        dailyRealRs = 0;
        log("STATE_RESET", { strategy: "ITM_HOLD", openPositions: itmHoldPositions.length });
    }
    // Stop new entries at 14:55 — existing positions continue to be monitored until SL/time-exit
    if (h >= 15 || (h === 14 && m >= 55))
        stopForDay = true;
    if (!(0, strategy_1.isWithinTime)(9, 15, 15, 30))
        return;
    const price = await (0, market_1.getCurrentPrice)();
    if (!price || price <= 0) {
        log("SKIP_CYCLE", { reason: "ITM_HOLD invalid price" });
        return;
    }
    lastKnownPrice = price;
    // ── 1. Monitor open positions: check SL and time-exit ─────────────────────
    const toExit = [];
    for (const pos of itmHoldPositions) {
        const slHit = pos.direction === "CE" ? price < pos.slIndexLevel : price > pos.slIndexLevel;
        const timeExpired = Date.now() >= pos.exitAfter;
        if (!slHit && !timeExpired)
            continue;
        const reason = slHit ? "SL_HIT" : "HOLD_EXPIRED";
        log("ITM_HOLD_EXIT", { symbol: pos.symbol, reason, price, sl: pos.slIndexLevel, direction: pos.direction });
        try {
            await (0, order_1.exitTrade)(pos.symbol, pos.qty);
            let exitLTP = 0;
            try {
                exitLTP = await (0, market_1.getOptionLTP)(pos.symbol);
            }
            catch (_) { }
            await sendTelegram(`🔴 *ITM Hold Exit* (${reason})\nSymbol: \`${pos.symbol}\`\nDir: ${pos.direction} | Index: ${price}\nSL was: ${pos.slIndexLevel} | Option LTP: ${exitLTP}`);
            (0, logger_1.logTrade)({ date: new Date().toISOString(), type: "ITM_HOLD", direction: pos.direction, entryPrice: 0, exitPrice: exitLTP, pnl: 0, reasonEntry: "bb_breakout", reasonExit: reason.toLowerCase(), aiScore: 1, slippage: 0, duration: Math.round((Date.now() - (pos.exitAfter - (config_1.config.itmHold?.holdDays ?? 3) * 24 * 3600 * 1000)) / 1000) });
        }
        catch (e) {
            log("ITM_HOLD_EXIT_FAIL", { symbol: pos.symbol, error: e instanceof Error ? e.message : String(e) });
        }
        toExit.push(pos);
    }
    if (toExit.length) {
        itmHoldPositions = itmHoldPositions.filter(p => !toExit.includes(p));
        saveITMHoldState();
    }
    // Log current status
    log("ITM_HOLD_STATUS", { price, openPositions: itmHoldPositions.length, stopForDay });
    // ── 2. Check for new entry signal ─────────────────────────────────────────
    const maxConcurrent = config_1.config.itmHold?.maxConcurrent ?? 2;
    if (itmHoldPositions.length >= maxConcurrent)
        return;
    if (stopForDay)
        return;
    if (!(0, strategy_1.isWithinTime)(9, 30, 14, 50))
        return; // entry only within trading window
    // Detect 15-min BB candle signal (reuses shared prevCandleForEntry / lastEntryCandleDate state)
    const candle = await (0, market_1.getPreviousCandle)();
    const candleDate = candle.date ?? `${candle.high}_${candle.low}`;
    // Seed on first cycle
    if (lastEntryCandleDate === "") {
        try {
            const { refCandle } = await (0, market_1.getStructureSeed)();
            prevCandleForEntry = refCandle;
        }
        catch (_) { }
        lastEntryCandleDate = candleDate;
        return; // wait for next candle
    }
    const newCandleCompleted = candleDate !== lastEntryCandleDate;
    if (!newCandleCompleted)
        return; // only enter at candle completion
    lastEntryCandleDate = candleDate;
    // BB signal: close > prev candle body high + MIN_BREAKOUT_MARGIN (CE)
    //            close < prev candle body low  - MIN_BREAKOUT_MARGIN (PE)
    let signal = null;
    if (prevCandleForEntry) {
        const prevBodyHigh = Math.max(prevCandleForEntry.open, prevCandleForEntry.close);
        const prevBodyLow = Math.min(prevCandleForEntry.open, prevCandleForEntry.close);
        if (candle.close > prevBodyHigh + MIN_BREAKOUT_MARGIN)
            signal = "CE";
        else if (candle.close < prevBodyLow - MIN_BREAKOUT_MARGIN)
            signal = "PE";
    }
    // Always advance reference candle (same as BODY_BREAKOUT behaviour)
    prevCandleForEntry = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };
    if (!signal) {
        log("ITM_HOLD_NO_SIGNAL", { close: candle.close });
        return;
    }
    log("ITM_HOLD_SIGNAL", { signal, close: candle.close, candleDate });
    // ── Get ITM monthly option ─────────────────────────────────────────────────
    const strikeOffset = config_1.config.itmHold?.strikeOffset ?? 1000;
    const minDTE = config_1.config.itmHold?.minDTE ?? 15;
    const holdDays = config_1.config.itmHold?.holdDays ?? 3;
    const slBuffer = config_1.config.itmHold?.slBuffer ?? 50;
    const qty = config_1.config.quantity;
    let symbol = "";
    try {
        symbol = await Promise.race([
            (0, market_1.getITMMonthlyOptionSymbol)(signal, strikeOffset, minDTE),
            new Promise((_, rej) => setTimeout(() => rej(new Error("getITMMonthlyOptionSymbol timeout")), 15000))
        ]);
    }
    catch (e) {
        log("ITM_HOLD_OPTION_FAIL", { error: e instanceof Error ? e.message : String(e) });
        return;
    }
    // SL level: index must breach signal candle's low (CE) or high (PE) with small buffer
    const slLevel = signal === "CE" ? candle.low - slBuffer : candle.high + slBuffer;
    const exitAfter = Date.now() + holdDays * 24 * 3600 * 1000;
    let optionLTP = 0;
    try {
        optionLTP = await (0, market_1.getOptionLTP)(symbol);
    }
    catch (_) { }
    log("ITM_HOLD_ENTRY", { symbol, signal, slLevel, holdDays, exitAfterIST: new Date(exitAfter).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), optionLTP });
    // ── Place order ────────────────────────────────────────────────────────────
    try {
        tradeInProgress = true;
        const orderResult = await (0, order_1.placeTrade)(symbol, price, qty);
        tradeInProgress = false;
        if (!orderResult || orderResult.status !== "COMPLETE" || orderResult.filled_quantity <= 0) {
            log("ORDER_NOT_FILLED", { orderResult });
            return;
        }
    }
    catch (e) {
        tradeInProgress = false;
        log("ORDER_REJECTED", { error: e instanceof Error ? e.message : String(e) });
        return;
    }
    itmHoldPositions.push({ symbol, direction: signal, slIndexLevel: slLevel, exitAfter, qty });
    saveITMHoldState();
    tradeCount++;
    await sendTelegram(`🟢 *ITM Hold Entry*\nSymbol: \`${symbol}\`\nDir: ${signal} | Spot: ${price}\nSL Index: ${slLevel} | Hold: ${holdDays} days\nExit by: ${new Date(exitAfter).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\nOption LTP: ${optionLTP} | Qty: ${qty}`).catch(() => { });
}
// ══════════════════════════════════════════════════════════════════════════════
//  HYBRID_REVERSE STRATEGY
//  Signal  : close > prevBodyHigh + 25 (CE) | close < prevBodyLow − 25 (PE)
//  Entry   : signal candle close price
//  SL      : ±100 pts (intrabar wick touch triggers exit)
//  C1-3    : if candle-1-after-entry closes 3+ pts against → early exit −3
//  Re-entry: same-dir if refHigh broken (after EarlyExit or wick-only SL)
//  Hybrid  : SL candle body closes PAST SL → enter opposite direction
//  EOD     : 3:15 PM exit
// ══════════════════════════════════════════════════════════════════════════════
async function runHybridReverseBot() {
    const now = new Date();
    const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const h = ist.getHours(), m = ist.getMinutes();
    // ── Daily reset at 9:15 ────────────────────────────────────────────────────
    if (h === 9 && m === 15) {
        hybridState = (0, strategy_1.createHybridState)();
        hybridPrevCandle = null;
        hybridLastCandleKey = "";
        stopForDay = false;
        capitalProtectionTriggered = false;
        dailyPnL = 0;
        tradeCount = 0;
        consecutiveLosses = 0;
        activeTrade = false;
        mainEntryDone = false;
        tradeDirection = null;
        tradeSymbol = "";
        entryPrice = 0;
        entryTime = 0;
        drishtiWins = 0;
        drishtiLosses = 0;
        log("STATE_RESET", { strategy: "HYBRID_REVERSE" });
        // Fetch previous day high/low for PDH/PDL context (non-blocking)
        pdhHigh = 0;
        pdhLow = 0;
        pdhContext = "NEUTRAL";
        (0, market_1.getPrevDayHL)().then(({ high, low }) => {
            pdhHigh = high;
            pdhLow = low;
            log("PDH_FETCHED", { pdhHigh, pdhLow });
        }).catch(e => log("PDH_FETCH_FAIL", { error: String(e) }));
    }
    if (!(0, strategy_1.isWithinTime)(9, 15, 15, 30))
        return;
    const price = await (0, market_1.getCurrentPrice)();
    if (!price || price <= 0) {
        log("SKIP_CYCLE", { reason: "invalid price" });
        return;
    }
    lastKnownPrice = price;
    printStatus();
    // ── Capital protection ─────────────────────────────────────────────────────
    const maxDrawdown = config_1.config.capital * (config_1.config.capitalDrawdownPercent / 100);
    if (false) {
        if (activeTrade && tradeSymbol) {
            try {
                await (0, order_1.exitTrade)(tradeSymbol, config_1.config.quantity);
            }
            catch (_) { }
            activeTrade = false;
            mainEntryDone = false;
            hybridState = (0, strategy_1.createHybridState)();
        }
        if (!stopForDay) {
            stopForDay = true;
            await notifyDailyLoss(dailyPnL).catch(() => { });
        }
        return;
    }
    if (stopForDay && !activeTrade)
        return;
    // ── Intrabar SL monitoring — exit immediately when price touches SL ────────
    // (Hybrid reverse is decided at candle close; intrabar = plain exit only)
    if (activeTrade && hybridState.inTrade && hybridState.sl > 0 && tradeSymbol) {
        const slHit = hybridState.dir === "CE"
            ? false // CANDLE_SL: disabled intrabar, handled at candle close  // CANDLE_SL_PENDING
            : false; // CANDLE_SL: disabled intrabar, handled at candle close
        if (slHit) {
            const capturedEntry = entryPrice;
            const capturedDir = tradeDirection;
            const capturedTime = entryTime;
            const capturedSymbol = tradeSymbol;
            const pts = hybridState.dir === "CE"
                ? hybridState.sl - hybridState.entry
                : hybridState.entry - hybridState.sl;
            log("INTRABAR_SL_HIT", { dir: hybridState.dir, price, sl: hybridState.sl, pts });
            try {
                await (0, order_1.exitTrade)(tradeSymbol, config_1.config.quantity);
            }
            catch (e) {
                log("EXIT_FAIL", { error: e instanceof Error ? e.message : String(e) });
            }
            dailyPnL += pts;
            if (pts <= 0)
                consecutiveLosses++;
            if (pts > 0)
                drishtiWins++;
            else
                drishtiLosses++;
            activeTrade = false;
            mainEntryDone = false;
            tradeDirection = null;
            tradeSymbol = "";
            entryPrice = 0;
            entryTime = 0;
            entryPremium = 0;
            lastOptionLTP = 0;
            // Update internal state: SL hit but candle not closed yet → allow re-entry next candle
            hybridState.inTrade = false;
            if (!hybridState.reUsed)
                hybridState.waitReEntry = true;
            saveTradeState();
            await notifyExit(price, pts, "SL hit (intrabar)", { dir: capturedDir, entry: capturedEntry, symbol: capturedSymbol, qty: config_1.config.quantity }).catch(() => { });
            const premiumAtIntrabarSl = capturedSymbol ? await (0, market_1.getOptionLTP)(capturedSymbol).catch(() => 0) : 0;
            (0, logger_1.logTrade)({ date: new Date().toISOString(), type: "HYBRID_REVERSE", direction: capturedDir ?? "CE", symbol: capturedSymbol, premiumExit: premiumAtIntrabarSl, entryPrice: capturedEntry, exitPrice: price, pnl: pts, reasonEntry: "hybrid_breakout", reasonExit: "sl_intrabar", aiScore: 1, slippage: 0, duration: capturedTime > 0 ? Math.round((Date.now() - capturedTime) / 1000) : 0 });
            return;
        }
    }
    // ── Detect new 15-min candle completion ───────────────────────────────────
    const candle = await (0, market_1.getPreviousCandle)();
    if (!candle || !candle.open || !candle.close) {
        log("SKIP_CYCLE", { reason: "invalid candle" });
        return;
    }
    const candleKey = candle.date ?? `${candle.high}_${candle.low}`;
    // Seed on first cycle: store the completed candle as the reference prev-candle
    if (hybridLastCandleKey === "") {
        hybridPrevCandle = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };
        hybridLastCandleKey = candleKey;
        log("HYBRID_SEEDED", { candle: hybridPrevCandle });
        return;
    }
    if (candleKey === hybridLastCandleKey)
        return; // same candle, no new close
    hybridLastCandleKey = candleKey;
    if (!hybridPrevCandle) {
        hybridPrevCandle = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };
        // Set PDH/PDL context based on first candle close
        if (pdhHigh > 0 && pdhLow > 0) {
            if (candle.close > pdhHigh)
                pdhContext = "BULLISH";
            else if (candle.close < pdhLow)
                pdhContext = "BEARISH";
            else
                pdhContext = "NEUTRAL";
            log("PDH_CONTEXT_SET", { pdhHigh, pdhLow, firstClose: candle.close, pdhContext });
        }
        return;
    }
    const currentCandle = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };
    const isEOD = h > 15 || (h === 15 && m >= 15);
    // ── Process candle through strategy ───────────────────────────────────────
    const prevBodyHigh = Math.max(hybridPrevCandle.open, hybridPrevCandle.close);
    const prevBodyLow = Math.min(hybridPrevCandle.open, hybridPrevCandle.close);
    const sig = (0, strategy_1.processHybridCandle)(hybridState, hybridPrevCandle, currentCandle, isEOD, strategy_1.trailLock50);
    hybridPrevCandle = currentCandle; // advance reference
    log("HYBRID_CANDLE", { action: sig.action, close: candle.close, prevBodyHigh, prevBodyLow, sl: hybridState.sl, dir: hybridState.dir });
    // ── Act on signal ──────────────────────────────────────────────────────────
    // DRISHTI_V1 has its own runner below — skip legacy hybrid signal processing for DRISHTI_V1
    if (ACTIVE_STRATEGY !== "DRISHTI_V1")
        switch (sig.action) {
            case "REVERSE_ENTER":
            case "ENTER": {
                // PDH/PDL context filter – only trade in direction of day bias
                if (pdhContext === "BULLISH" && sig.dir === "PE") {
                    log("PDH_BLOCKED", { dir: sig.dir, pdhContext, price: sig.price });
                    break;
                }
                if (pdhContext === "BEARISH" && sig.dir === "CE") {
                    log("PDH_BLOCKED", { dir: sig.dir, pdhContext, price: sig.price });
                    break;
                }
                // REVERSE_ENTER: exit existing position first, then enter opposite
                if (sig.action === "REVERSE_ENTER" && activeTrade && tradeSymbol) {
                    const capturedEntry = entryPrice;
                    const capturedDir = tradeDirection;
                    const capturedTime = entryTime;
                    const slPts = hybridState.dir === "CE"
                        ? (hybridState.entry > 0 ? (sig.price + HR_SL_PTS_LOCAL) - hybridState.entry : -100)
                        : -100;
                    try {
                        await (0, order_1.exitTrade)(tradeSymbol, config_1.config.quantity);
                    }
                    catch (e) {
                        log("EXIT_FAIL", { error: e instanceof Error ? e.message : String(e) });
                        return;
                    }
                    activeTrade = false;
                    mainEntryDone = false;
                    const exitPts = capturedDir === "CE"
                        ? sig.price - capturedEntry // entry of reverse = close of SL candle
                        : capturedEntry - sig.price;
                    // P&L of the exited leg is approximately −100 pts (SL level)
                    const exitedPts = capturedDir === "CE"
                        ? (sig.price - 100) - capturedEntry // approximation: exited at SL (entry−100)
                        : capturedEntry - (sig.price + 100);
                    dailyPnL += -100;
                    if (-100 < 0)
                        consecutiveLosses++;
                    drishtiLosses++;
                    await sendTelegram(`🔄 *REVERSE — ${capturedDir} exited, ${sig.dir} entered*\n` +
                        `Exited ${capturedDir} at index: ${sig.price} | P&L: *−100 pts ≈ −₹${(100 * config_1.config.quantity * 0.5).toLocaleString("en-IN")}* (est)\n` +
                        `New direction: *${sig.dir}* | New SL: ${sig.sl}\n` +
                        `Day P&L so far: ${dailyPnL >= 0 ? "+" : ""}${dailyPnL} pts`).catch(() => { });
                    (0, logger_1.logTrade)({ date: new Date().toISOString(), type: "HYBRID_REVERSE", direction: capturedDir ?? "CE", symbol: capturedDir === "CE" ? tradeSymbol : tradeSymbol, premiumExit: 0, entryPrice: capturedEntry, exitPrice: sig.price, pnl: -100, reasonEntry: "hybrid_breakout", reasonExit: "sl_reverse", aiScore: 1, slippage: 0, duration: capturedTime > 0 ? Math.round((Date.now() - capturedTime) / 1000) : 0 });
                    tradeDirection = null;
                    tradeSymbol = "";
                    entryPrice = 0;
                    entryTime = 0;
                }
                // Get option symbol and enter
                let sym = "";
                try {
                    sym = await Promise.race([
                        (0, market_1.getBestOptionSymbol)(sig.dir),
                        new Promise((_, rej) => setTimeout(() => rej(new Error("option select timeout")), 10000)),
                    ]);
                }
                catch (e) {
                    log("OPTION_SELECT_FAIL", { error: String(e) });
                    hybridState = (0, strategy_1.createHybridState)(); // reset so we can re-try next signal
                    return;
                }
                const freshPrice = await (0, market_1.getCurrentPrice)();
                tradeDirection = sig.dir;
                tradeSymbol = sym;
                entryPrice = sig.price; // index entry level (for PnL tracking)
                mainQty = config_1.config.quantity;
                mainEntryDone = true;
                activeTrade = true;
                entryTime = Date.now();
                try {
                    tradeInProgress = true;
                    const order = await (0, order_1.placeTrade)(sym, freshPrice, config_1.config.quantity);
                    tradeInProgress = false;
                    if (!order || order.status !== "COMPLETE" || order.filled_quantity <= 0) {
                        log("ORDER_NOT_FILLED", { order });
                        mainEntryDone = false;
                        activeTrade = false;
                        tradeDirection = null;
                        tradeSymbol = "";
                        entryPrice = 0;
                        entryTime = 0;
                        hybridState = (0, strategy_1.createHybridState)();
                        return;
                    }
                }
                catch (e) {
                    tradeInProgress = false;
                    log("ORDER_REJECTED", { error: e instanceof Error ? e.message : String(e) });
                    mainEntryDone = false;
                    activeTrade = false;
                    tradeDirection = null;
                    tradeSymbol = "";
                    entryPrice = 0;
                    entryTime = 0;
                    hybridState = (0, strategy_1.createHybridState)();
                    (0, order_1.stopTradingForDay)();
                    stopForDay = true;
                    return;
                }
                tradeCount++;
                saveTradeState();
                await sendTelegram(`📥 *${sig.action === "REVERSE_ENTER" ? "🔄 REVERSE" : "🚀 BREAKOUT"} ENTRY — ${sig.dir}*\n` +
                    `Symbol: \`${sym}\`\n` +
                    `Premium: *₹${freshPrice}* | Qty: ${config_1.config.quantity} lots\n` +
                    `Index entry: *${sig.price}* | SL: ${sig.sl} (−100 pts)\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Capital deployed: *₹${(freshPrice * config_1.config.quantity).toLocaleString("en-IN")}*\n` +
                    `C1 exit: −3 pts | Re-entry allowed: ${!hybridState.reUsed ? "Yes" : "No"}`).catch(() => { });
                const premiumAtEntry = await (0, market_1.getOptionLTP)(sym).catch(() => 0);
                entryPremium = premiumAtEntry;
                lastOptionLTP = premiumAtEntry;
                (0, logger_1.logTrade)({ date: new Date().toISOString(), type: "HYBRID_REVERSE", direction: sig.dir, symbol: sym, premiumEntry: premiumAtEntry, premiumExit: 0, entryPrice: sig.price, exitPrice: 0, pnl: 0, reasonEntry: sig.action.toLowerCase(), reasonExit: "", aiScore: 1, slippage: Math.abs(freshPrice - sig.price), duration: 0 });
                break;
            }
            case "EXIT_EARLY": {
                if (!tradeSymbol)
                    break;
                const capturedEntry = entryPrice;
                const capturedDir = tradeDirection;
                const capturedTime = entryTime;
                const capturedSymbol = tradeSymbol;
                try {
                    await (0, order_1.exitTrade)(tradeSymbol, config_1.config.quantity);
                }
                catch (e) {
                    log("EXIT_FAIL", { error: e instanceof Error ? e.message : String(e) });
                }
                dailyPnL += sig.pts;
                consecutiveLosses++;
                if (sig.pts > 0)
                    drishtiWins++;
                else
                    drishtiLosses++;
                activeTrade = false;
                mainEntryDone = false;
                tradeDirection = null;
                tradeSymbol = "";
                entryPrice = 0;
                entryTime = 0;
                entryPremium = 0;
                lastOptionLTP = 0;
                saveTradeState();
                await notifyExit(price, sig.pts, `Early exit C1-3 (−${Math.abs(sig.pts)} pts) | Mod-A reset`, { dir: capturedDir, entry: capturedEntry, symbol: capturedSymbol, qty: config_1.config.quantity }).catch(() => { });
                const premiumAtEarlyExit = capturedSymbol ? await (0, market_1.getOptionLTP)(capturedSymbol).catch(() => 0) : 0;
                (0, logger_1.logTrade)({ date: new Date().toISOString(), type: "HYBRID_REVERSE", direction: capturedDir ?? "CE", symbol: capturedSymbol, premiumExit: premiumAtEarlyExit, entryPrice: capturedEntry, exitPrice: price, pnl: sig.pts, reasonEntry: "hybrid_breakout", reasonExit: "early_exit_c1", aiScore: 1, slippage: 0, duration: capturedTime > 0 ? Math.round((Date.now() - capturedTime) / 1000) : 0 });
                break;
            }
            case "EXIT_SL": {
                if (!tradeSymbol)
                    break;
                const capturedEntry = entryPrice;
                const capturedDir = tradeDirection;
                const capturedTime = entryTime;
                const capturedSymbol = tradeSymbol;
                try {
                    await (0, order_1.exitTrade)(tradeSymbol, config_1.config.quantity);
                }
                catch (e) {
                    log("EXIT_FAIL", { error: e instanceof Error ? e.message : String(e) });
                }
                dailyPnL += sig.pts;
                consecutiveLosses++;
                if (sig.pts > 0)
                    drishtiWins++;
                else
                    drishtiLosses++;
                activeTrade = false;
                mainEntryDone = false;
                tradeDirection = null;
                tradeSymbol = "";
                entryPrice = 0;
                entryTime = 0;
                entryPremium = 0;
                lastOptionLTP = 0;
                saveTradeState();
                await notifyExit(price, sig.pts, "SL −100 pts (wick, no reverse)", { dir: capturedDir, entry: capturedEntry, symbol: capturedSymbol, qty: config_1.config.quantity }).catch(() => { });
                const premiumAtSlExit = capturedSymbol ? await (0, market_1.getOptionLTP)(capturedSymbol).catch(() => 0) : 0;
                (0, logger_1.logTrade)({ date: new Date().toISOString(), type: "HYBRID_REVERSE", direction: capturedDir ?? "CE", symbol: capturedSymbol, premiumExit: premiumAtSlExit, entryPrice: capturedEntry, exitPrice: price, pnl: sig.pts, reasonEntry: "hybrid_breakout", reasonExit: "sl_wick", aiScore: 1, slippage: 0, duration: capturedTime > 0 ? Math.round((Date.now() - capturedTime) / 1000) : 0 });
                break;
            }
            case "EXIT_EOD": {
                if (!tradeSymbol)
                    break;
                const capturedEntry = entryPrice;
                const capturedDir = tradeDirection;
                const capturedTime = entryTime;
                const capturedSymbol = tradeSymbol;
                try {
                    await (0, order_1.exitTrade)(tradeSymbol, config_1.config.quantity);
                }
                catch (e) {
                    log("EXIT_FAIL", { error: e instanceof Error ? e.message : String(e) });
                }
                dailyPnL += sig.pts;
                if (sig.pts > 0) {
                    lastTradeProfit = true;
                    consecutiveLosses = 0;
                }
                else
                    consecutiveLosses++;
                if (sig.pts > 0)
                    drishtiWins++;
                else
                    drishtiLosses++;
                activeTrade = false;
                mainEntryDone = false;
                tradeDirection = null;
                tradeSymbol = "";
                entryPrice = 0;
                entryTime = 0;
                hybridState = (0, strategy_1.createHybridState)();
                stopForDay = true;
                saveTradeState();
                await notifyExit(price, sig.pts, "EOD exit 3:15 PM", { dir: capturedDir, entry: capturedEntry, symbol: capturedSymbol, qty: config_1.config.quantity }).catch(() => { });
                await sendEODSummary().catch(() => { });
                (0, report_1.generateMonthlyReport)().catch(e => log("REPORT_FAIL", { error: e?.message }));
                const premiumAtEod = capturedSymbol ? await (0, market_1.getOptionLTP)(capturedSymbol).catch(() => 0) : 0;
                (0, logger_1.logTrade)({ date: new Date().toISOString(), type: "HYBRID_REVERSE", direction: capturedDir ?? "CE", symbol: capturedSymbol, premiumExit: premiumAtEod, entryPrice: capturedEntry, exitPrice: price, pnl: sig.pts, reasonEntry: "hybrid_breakout", reasonExit: "eod_3:15", aiScore: 1, slippage: 0, duration: capturedTime > 0 ? Math.round((Date.now() - capturedTime) / 1000) : 0 });
                break;
            }
            case "NONE":
                break;
        }
}
// helper used in REVERSE_ENTER P&L calculation
const HR_SL_PTS_LOCAL = 100;
// ─── 1-Minute LTP Monitor for DRISHTI intraday trail/SL ───────────────────────
// Polls current price every 60s while in a DRISHTI trade.
// Updates intraday peak and fires exit if trail or SL is hit between candle closes.
// This eliminates the candle-close exit discrepancy and matches backtest V15 logic.
const DRISHTI_TRAIL_GAP = 10; // LOCK10 — same as backtest_verify.js V15 config
const DRISHTI_SL_PTS = 100; // Hard SL — matches SL_PTS in drishti_strategy.ts
const REAL_DAILY_LOSS_CAP_RS = Number.POSITIVE_INFINITY; // disabled: no real daily loss stop
const REAL_FUTURES_SL_PTS = Number(config_1.config.risk?.maxFuturesLossPts ?? 150);
const REAL_OPTIONS_SL_PTS = Number(config_1.config.risk?.maxOptionsLossPts ?? 150);
const REAL_EXIT_TOLERANCE_PTS = Number(config_1.config.risk?.maxAllowedSlippagePts ?? 50);
// Stop new entries before the hard daily cap so slippage/fast moves do not push the day far past maxDailyLossRs.
const REAL_ENTRY_BLOCK_RS = Number(config_1.config.risk?.realEntryBlockRs ?? Math.round(REAL_DAILY_LOSS_CAP_RS * 0.75));
const REAL_INTRADAY_EXIT_RS = Number.POSITIVE_INFINITY; // disabled: no real intraday daily-loss exit
function combinedRealRs() { return Math.round((dailyRealRs || 0) + (optDailyRs || 0)); }
function realLossLimitHit() { return false; } // disabled: no daily real-loss stop; per-trade SL/trail remains active
function realEntryBlocked() { return false; } // disabled: do not block entries from daily real P&L
function appendRealPremiumAudit(row) {
    try {
        const rec = { at: new Date().toISOString(), strategy: "DRISHTI_V1", qty: config_1.config.quantity, ...row };
        fs_1.default.appendFileSync("real-premium-audit.jsonl", JSON.stringify(rec) + "\n");
    }
    catch (e) {
        log("REAL_PREMIUM_AUDIT_FAIL", { error: e instanceof Error ? e.message : String(e) });
    }
}
async function stopForRealLoss(reason) {
    if (stopForDay)
        return;
    stopForDay = true;
    log("REAL_LOSS_LIMIT_HIT", { reason, dailyRealRs, optDailyRs, combinedRealRs: combinedRealRs(), capRs: REAL_DAILY_LOSS_CAP_RS });
    await sendTelegram(`🚨 *REAL LOSS LIMIT HIT*\nReason: ${reason}\nFutures: ₹${dailyRealRs.toLocaleString("en-IN")} | Options: ₹${optDailyRs.toLocaleString("en-IN")}\nCombined: ₹${combinedRealRs().toLocaleString("en-IN")} / Cap: -₹${REAL_DAILY_LOSS_CAP_RS.toLocaleString("en-IN")}\nTrading stopped for today`).catch(() => { });
}
function stopDrishtiLTPMonitor() {
    if (ltpMonitorInterval) {
        clearInterval(ltpMonitorInterval);
        ltpMonitorInterval = null;
    }
    drishtiIntradayPeak = 0;
    log("LTP_MONITOR_STOP", {});
}
async function executeDrishtiLTPExit(ltp, pts, reason) {
    if (!activeTrade || !DrishtiState.inTrade)
        return;
    const capturedEntry = entryPrice;
    const capturedDir = tradeDirection;
    const capturedTime = entryTime;
    const capturedSymbol = tradeSymbol;
    const capturedPeak = drishtiIntradayPeak;
    const capturedPremiumEntry = entryPremium;
    const capturedPremiumExit = lastOptionLTP;
    const capturedOptInTrade = optInTrade;
    const capturedOptDir = optDir;
    const capturedOptSymbol = optSymbol;
    const capturedOptEntryPrem = optEntryPrem;
    const capturedOptEntryTime = optEntryTime;
    stopDrishtiLTPMonitor();
    const exitOptionLTP = await (0, market_1.getOptionLTP)(capturedSymbol).catch(() => 0);
    const capturedQty = mainQty || config_1.config.quantity;
    try {
        await (0, order_1.exitTrade)(tradeSymbol, capturedQty, capturedDir === "PE" ? "BUY" : "SELL");
    }
    catch (e) {
        log("EXIT_FAIL", { error: e instanceof Error ? e.message : String(e) });
    }
    dailyPnL += pts;
    if (pts > 0) {
        consecutiveLosses = 0;
        drishtiWins++;
    }
    else {
        consecutiveLosses++;
        drishtiLosses++;
    }
    const _futEntryPrice = drishtiFuturesEntry > 0 ? drishtiFuturesEntry : capturedEntry;
    const _futExitRaw = exitOptionLTP > 0 ? exitOptionLTP : 0;
    const _futExitFair = _futEntryPrice + (capturedDir === "PE" ? -pts : pts);
    const _futExitPrice = _futExitRaw > 0
        ? _futExitRaw
        : _futExitFair;
    const _futExitSource = _futExitRaw > 0 ? "ACTUAL_FUTURES_LTP" : "FALLBACK_FAIR_MISSING_LTP";
    const _futRealPts = capturedDir === "PE" ? (_futEntryPrice - _futExitPrice) : (_futExitPrice - _futEntryPrice);
    const _futRealRs = Math.round(_futRealPts * capturedQty);
    dailyRealRs += _futRealRs;
    appendRealPremiumAudit({ event: "futures_exit", reason, symbol: capturedSymbol, direction: capturedDir, entry: _futEntryPrice, exit: _futExitPrice, rawExit: _futExitRaw, fairExit: _futExitFair, exitSource: _futExitSource, indexPts: pts, realPts: _futRealPts, realRs: _futRealRs });
    log("REAL_LTP_EXIT_FUTURES", { reason, entryFut: _futEntryPrice.toFixed(1), exitFut: _futExitPrice.toFixed(1), exitRaw: _futExitRaw.toFixed(1), exitFair: _futExitFair.toFixed(1), exitSource: _futExitSource, realPts: _futRealPts.toFixed(1), realRs: _futRealRs, strategyPts: pts.toFixed(1) });
    if (capturedOptInTrade && capturedOptSymbol && capturedOptEntryPrem > 0) {
        const optExitLTP = await (0, market_1.getOptionLTP)(capturedOptSymbol).catch(() => 0);
        if (optExitLTP > 0) {
            const optPts = optExitLTP - capturedOptEntryPrem;
            const optRs = Math.round(optPts * capturedQty);
            optDailyPts += optPts;
            optDailyRs += optRs;
            if (optPts > 0)
                optWins++;
            else
                optLosses++;
            const _optDur = capturedOptEntryTime > 0 ? Math.round((Date.now() - capturedOptEntryTime) / 1000) : 0;
            (0, logger_1.logTrade)({ date: new Date().toISOString(), type: "DRISHTI_V1_OPT",
                direction: capturedOptDir ?? "CE", symbol: capturedOptSymbol,
                entryPrice: capturedOptEntryPrem, exitPrice: optExitLTP,
                premiumEntry: capturedOptEntryPrem, premiumExit: optExitLTP,
                pnl: parseFloat(optPts.toFixed(1)), pnlRs: optRs,
                qty: capturedQty, aiScore: 1, slippage: 0,
                reasonEntry: "drishti_opt_shadow", reasonExit: reason,
                duration: _optDur });
            appendRealPremiumAudit({ event: "options_exit", reason, symbol: capturedOptSymbol, direction: capturedOptDir, entry: capturedOptEntryPrem, exit: optExitLTP, realPts: optPts, realRs: optRs });
            log("REAL_LTP_EXIT_OPTIONS", { reason, symbol: capturedOptSymbol, entryPrem: capturedOptEntryPrem.toFixed(1), exitPrem: optExitLTP.toFixed(1), optPts: optPts.toFixed(1), optRs });
        }
        optInTrade = false;
        optDir = null;
        optSymbol = "";
        optEntryPrem = 0;
        optEntryTime = 0;
    }
    if (realLossLimitHit()) {
        await stopForRealLoss(reason);
    }
    DrishtiState.inTrade = false;
    DrishtiState.firstDone = true;
    DrishtiState.lastExitPts = capturedPeak;
    DrishtiState.lastExitIdx = drishtiTodayCandles.length - 1;
    DrishtiState.lastExitDir = capturedDir;
    activeTrade = false;
    mainEntryDone = false;
    tradeDirection = null;
    tradeSymbol = "";
    entryPrice = 0;
    entryTime = 0;
    entryPremium = 0;
    lastOptionLTP = 0;
    saveTradeState();
    await notifyExit(ltp, pts, reason, { dir: capturedDir, entry: capturedEntry, symbol: capturedSymbol, qty: capturedQty }).catch(() => { });
    (0, logger_1.logTrade)({ date: new Date().toISOString(), type: "DRISHTI_V1", direction: capturedDir ?? "CE", symbol: capturedSymbol,
        premiumEntry: _futEntryPrice, premiumExit: _futExitPrice, qty: capturedQty,
        entryPrice: _futEntryPrice, exitPrice: _futExitPrice,
        pnl: parseFloat(_futRealPts.toFixed(1)), pnlRs: _futRealRs,
        reasonEntry: "drishti_entry", reasonExit: reason, aiScore: 1, slippage: Math.abs(_futRealPts - pts),
        duration: capturedTime > 0 ? Math.round((Date.now() - capturedTime) / 1000) : 0 });
}
function startDrishtiLTPMonitor() {
    if (ltpMonitorInterval)
        return; // already running
    drishtiIntradayPeak = 0;
    ltpMonitorInterval = setInterval(async () => {
        if (!activeTrade || !DrishtiState.inTrade || !tradeDirection || entryPrice <= 0) {
            stopDrishtiLTPMonitor();
            return;
        }
        if (!(0, strategy_1.isWithinTime)(9, 15, 15, 30)) {
            stopDrishtiLTPMonitor();
            return;
        }
        try {
            const ltp = await (0, market_1.getCurrentPrice)();
            if (!ltp || ltp <= 0)
                return;
            lastKnownPrice = ltp;
            const sign = tradeDirection === "CE" ? 1 : -1;
            const pts = sign * (ltp - entryPrice);
            const futLTP = tradeSymbol ? await (0, market_1.getOptionLTP)(tradeSymbol).catch(() => 0) : 0;
            const realFutPts = drishtiFuturesEntry > 0 && futLTP > 0 ? sign * (futLTP - drishtiFuturesEntry) : pts;
            if (optInTrade && optSymbol) {
                const optLive = await (0, market_1.getOptionLTP)(optSymbol).catch(() => 0);
                if (optLive > 0)
                    lastOptionLTP = optLive;
            }
            const realOptPts = optInTrade && optEntryPrem > 0 && lastOptionLTP > 0 ? lastOptionLTP - optEntryPrem : 0;
            const liveFutRs = Math.round(realFutPts * config_1.config.quantity);
            const liveOptRs = optInTrade && optEntryPrem > 0 && lastOptionLTP > 0 ? Math.round(realOptPts * config_1.config.quantity) : 0;
            const projectedCombinedRs = combinedRealRs() + liveFutRs + liveOptRs;
            if (projectedCombinedRs <= -REAL_INTRADAY_EXIT_RS) {
                await executeDrishtiLTPExit(ltp, pts, `real_daily_intraday_stop_${REAL_INTRADAY_EXIT_RS}rs`);
                return;
            }
            // LTP monitor is now a hard real-risk guard only.
            // Strategy SL/trail exits must remain candle-close based via updateDrishtiTrail(),
            // otherwise live exits no longer match the backtest.
            const currentTrail = DrishtiState.trailStop;
            log("LTP_RISK_MONITOR", { ltp, indexPts: pts.toFixed(1), candlePeak: Number(DrishtiState.peakPts || 0).toFixed(1), candleTrail: currentTrail, dir: tradeDirection, futLTP, realFutPts: realFutPts.toFixed(1), optLTP: lastOptionLTP, realOptPts: realOptPts.toFixed(1), projectedCombinedRs });
            if (realFutPts <= -REAL_FUTURES_SL_PTS) {
                await executeDrishtiLTPExit(ltp, pts, `real_futures_sl_${REAL_FUTURES_SL_PTS}pts`);
                return;
            }
            if (optInTrade && optEntryPrem > 0 && lastOptionLTP > 0 && realOptPts <= -REAL_OPTIONS_SL_PTS) {
                await executeDrishtiLTPExit(ltp, pts, `real_options_sl_${REAL_OPTIONS_SL_PTS}pts`);
                return;
            }
        }
        catch (e) {
            log("LTP_MONITOR_ERR", { error: e instanceof Error ? e.message : String(e) });
        }
    }, 5 * 1000); // hard real-risk guard only; strategy trail exits on 15-min candle close
    log("LTP_RISK_MONITOR_START", { entry: entryPrice, dir: tradeDirection, futuresEntry: drishtiFuturesEntry, hardFuturesSL: REAL_FUTURES_SL_PTS, hardOptionsSL: REAL_OPTIONS_SL_PTS });
}
// ═══════════════════════════════════════════════════════════════════════════
// DRISHTI V1 — PDH/PDL Context + LOCK10 Trail (live bot)
// Entry: findDrishtiEntry() detects pattern on each 15-min candle close
// Trail: SL=100 pts; once peak>=10 pts, trail = peak-10 (LOCK10, candle-close only)
// Re-entries: up to 5, gate=OFF (lastExitPts>=0), reverse always allowed (REV_UNLOCK=0)
// Instrument: BankNifty FUTURES (not options) — P&L = index pts × 30 exact
// ═══════════════════════════════════════════════════════════════════════════
// Returns the nearest-expiry BankNifty futures symbol (e.g. BANKNIFTY26JUNFUT)
// Rolls automatically: picks the front-month until last-Thursday expiry, then next month
function getDrishtiFuturesSymbol() {
    if (drishtiFutSymbolCache && Date.now() - drishtiFutSymbolCacheAt < 15 * 60 * 1000) {
        return Promise.resolve(drishtiFutSymbolCache);
    }
    const { KiteConnect } = require('kiteconnect');
    const kite = new KiteConnect({ api_key: process.env.API_KEY || '' });
    kite.setAccessToken(process.env.ACCESS_TOKEN || '');
    return kite.getInstruments('NFO').then((ins) => {
        const fut = ins
            .filter((i) => i.name === 'BANKNIFTY' && i.instrument_type === 'FUT')
            .sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
        if (!fut.length)
            throw new Error('No BankNifty futures found');
        // Use front month unless within 1 day of expiry — then use next month
        const today = new Date();
        const front = fut[0];
        const expiry = new Date(front.expiry);
        const daysToExpiry = (expiry.getTime() - today.getTime()) / 86400000;
        const chosen = daysToExpiry <= 1 && fut.length > 1 ? fut[1] : front;
        drishtiFutSymbolCache = chosen.tradingsymbol;
        drishtiFutSymbolCacheAt = Date.now();
        log("DRISHTI_FUT_SYMBOL_CACHE", { symbol: drishtiFutSymbolCache, expiry: chosen.expiry });
        return drishtiFutSymbolCache;
    });
}
// Returns ATM BankNifty option symbol for the nearest weekly expiry
// BankNifty has ONLY monthly expiry (SEBI removed weekly in 2024)
// Monthly ATM premium is ~Rs 1000-1500. No range filter — just pick ATM.
const OPT_PREM_MIN = 0; // no lower limit
const OPT_PREM_MAX = 99999; // no upper limit — accept any ATM premium
async function getDrishtiATMOptionSymbol(dir, indexClose) {
    // BUG-2026-017 fix: re-derive ATM strike from the CURRENT futures/index price on every call.
    // Only the NFO instrument list is cached for the day (it doesn't change intraday);
    // the strike itself is recomputed each time so it tracks price moves through the day.
    const { KiteConnect: KC2 } = require("kiteconnect");
    const kite2 = new KC2({ api_key: process.env.API_KEY || "" });
    kite2.setAccessToken(process.env.ACCESS_TOKEN || "");
    if (!optInstrumentsCache) {
        const ins = await kite2.getInstruments("NFO");
        optInstrumentsCache = ins
            .filter((i) => i.name === "BANKNIFTY" && (i.instrument_type === "CE" || i.instrument_type === "PE"))
            .sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
    }
    const atm = Math.round(indexClose / 100) * 100;
    const opts = optInstrumentsCache;
    if (!opts.length)
        throw new Error("No BankNifty options found");
    // Fix: use timestamp (number) for deduplication — Date objects compare by reference in Set, not value
    const expiryTimes = [...new Set(opts.map((o) => new Date(o.expiry).getTime()))].sort((a, b) => a - b).slice(0, 4);
    log("OPT_EXPIRIES_FOUND", { count: expiryTimes.length, expiries: expiryTimes.map(t => new Date(t).toISOString().slice(0, 10)) });
    const findBestStrike = async (expiryTime) => {
        // Match options by expiry timestamp
        const exOpts = opts.filter((o) => new Date(o.expiry).getTime() === expiryTime);
        const expiryStr = new Date(expiryTime).toISOString().slice(0, 10);
        const offsets = [0, 100, -100, 200, -200, 300, -300, 400, -400, 500, -500];
        for (const offset of offsets) {
            const strike = atm + offset;
            const ceOpt = exOpts.find((o) => o.instrument_type === "CE" && Math.round(o.strike) === strike);
            const peOpt = exOpts.find((o) => o.instrument_type === "PE" && Math.round(o.strike) === strike);
            if (!ceOpt || !peOpt)
                continue;
            const [ceLTP, peLTP] = await Promise.all([
                (0, market_1.getOptionLTP)(ceOpt.tradingsymbol).catch(() => 0),
                (0, market_1.getOptionLTP)(peOpt.tradingsymbol).catch(() => 0),
            ]);
            const avgPrem = (ceLTP + peLTP) / 2;
            // Accept any option with valid LTP — BankNifty monthly ATM, no range filter
            if (ceLTP > 0 && peLTP > 0) {
                log("OPT_STRIKE_FOUND", { expiry: expiryStr, strike, ceLTP: ceLTP.toFixed(0), peLTP: peLTP.toFixed(0), avgPrem: avgPrem.toFixed(0), offset, monthly: true });
                return { CE: ceOpt.tradingsymbol, PE: peOpt.tradingsymbol, ceLTP, peLTP, expiry: expiryStr };
            }
        }
        log("OPT_EXPIRY_SKIP", { expiry: expiryStr, atmStrike: atm, reason: "no strike with avg premium in 400-600 range" });
        return null;
    };
    for (const expiryTime of expiryTimes) {
        const result = await findBestStrike(expiryTime);
        if (result) {
            optATMCache = { CE: result.CE, PE: result.PE, expiry: result.expiry };
            log("OPT_ATM_CACHE", { CE: result.CE, PE: result.PE, expiry: result.expiry, atm, ceLTP: result.ceLTP.toFixed(0), peLTP: result.peLTP.toFixed(0) });
            return dir === "CE" ? result.CE : result.PE;
        }
    }
    throw new Error("No BankNifty option found with premium in 400-600 range across all expiries");
}
function tt1030ISTParts(d = new Date()) {
    const ist = new Date(d.getTime() + 5.5 * 3600000);
    const ymd = ist.toISOString().slice(0, 10);
    const hh = String(ist.getUTCHours()).padStart(2, '0');
    const mm = String(ist.getUTCMinutes()).padStart(2, '0');
    return { ymd, hhmm: `${hh}:${mm}`, ist };
}
function tt1030FmtIST(epochMs) {
    const p = tt1030ISTParts(new Date(epochMs));
    const ss = String(p.ist.getUTCSeconds()).padStart(2, '0');
    return `${p.ymd} ${p.hhmm}:${ss}`;
}
function tt1030CandleTime(c) {
    const d = c.date ? new Date(c.date) : new Date();
    return tt1030ISTParts(d).hhmm;
}
function appendTT1030Audit(event: string, details: any = {}, severity: 'info'|'warn'|'error' = 'info') {
    try {
        const rec = {
            ts: new Date().toISOString(),
            day: tt1030.day || tt1030ISTParts().ymd,
            severity,
            event,
            mode: (config_1.config.mode || "LIVE").toUpperCase(),
            ...details,
        };
        fs_1.default.appendFileSync(TT1030_LIVE_AUDIT_FILE, JSON.stringify(rec) + "\n");
        fs_1.default.writeFileSync(TT1030_LIVE_AUDIT_STATE_FILE, JSON.stringify({
            date: rec.day,
            updatedAt: rec.ts,
            lastEvent: rec,
            issues: tt1030AuditIssues.slice(-20),
            readiness: tt1030AuditIssues.some(x => x.severity === "error") ? "BLOCKED" : (tt1030AuditIssues.length ? "WARN" : "OK"),
        }, null, 2));
    }
    catch (_e) { }
}
function tt1030AuditIssue(code: string, message: string, details: any = {}, severity: 'warn'|'error' = 'warn') {
    const issue = {
        ts: new Date().toISOString(),
        day: tt1030.day || tt1030ISTParts().ymd,
        severity,
        code,
        message,
        ...details,
    };
    tt1030AuditIssues.push(issue);
    tt1030AuditIssues = tt1030AuditIssues.slice(-20);
    appendTT1030Audit("issue", issue, severity);
    log("TT1030_AUDIT_ISSUE", { severity, code, message });
}
function tt1030AuditSignal(dir: 'CE'|'PE', entry: number, sl: number, ref: any, reason: string, optSym: string, optPrem: number) {
    const signalTime = tt1030CandleTime(ref);
    const signalKey = `${tt1030.day}|${signalTime}|${dir}|${entry.toFixed(1)}|${reason}`;
    const riskPts = dir === "CE" ? entry - sl : sl - entry;
    const refStartMs = ref?.date ? new Date(ref.date).getTime() : NaN;
    const delayMs = Number.isFinite(refStartMs) ? Date.now() - (refStartMs + 15 * 60 * 1000) : 0;
    const issuesBefore = tt1030AuditIssues.length;
    if (signalKey === tt1030LastSignalKey) {
        tt1030AuditIssue("DUPLICATE_SIGNAL_KEY", "same TT1030 signal key fired again", { signalKey, dir, entry, reason }, "error");
    }
    if (!(tt1030.tenHigh > tt1030.tenLow)) {
        tt1030AuditIssue("INVALID_1030_RANGE", "10:30 range is missing or invalid", { tenHigh: tt1030.tenHigh, tenLow: tt1030.tenLow }, "error");
    }
    if (!(entry > 0) || !(sl > 0) || !(riskPts > 0)) {
        tt1030AuditIssue("INVALID_ENTRY_SL", "entry/SL is invalid for TT1030 signal", { dir, entry, sl, riskPts }, "error");
    }
    if (riskPts > TT1030_WARN_RISK_PTS) {
        tt1030AuditIssue("WIDE_SIGNAL_RISK", "signal candle SL risk is wider than configured futures risk", { dir, entry, sl, riskPts, warnRiskPts: TT1030_WARN_RISK_PTS }, "warn");
    }
    if (!optSym) {
        tt1030AuditIssue("OPTION_SYMBOL_MISSING", "option symbol lookup failed for TT1030 signal", { dir, refClose: ref?.close, reason }, "warn");
    }
    if (optSym && !(optPrem > 0)) {
        tt1030AuditIssue("OPTION_PREMIUM_MISSING", "option LTP was not available at TT1030 entry", { dir, optSym, optPrem }, "warn");
    }
    if (delayMs > TT1030_MAX_SIGNAL_DELAY_MS) {
        tt1030AuditIssue("SIGNAL_PROCESS_DELAY", "TT1030 signal processed late after candle close", { signalTime, delayMs, maxDelayMs: TT1030_MAX_SIGNAL_DELAY_MS }, "warn");
    }
    tt1030LastSignalKey = signalKey;
    const newIssueCount = tt1030AuditIssues.length - issuesBefore;
    appendTT1030Audit("signal_preflight", {
        signalKey,
        signalTime,
        dir,
        entry,
        sl,
        riskPts: parseFloat(riskPts.toFixed(1)),
        reason,
        optSym: optSym || null,
        optPrem: optPrem || null,
        delayMs,
        maxEntrySlippagePts: TT1030_MAX_ENTRY_SLIPPAGE_PTS,
        status: newIssueCount ? "WARN" : "OK",
    }, newIssueCount ? "warn" : "info");
}
function tt1030ResetIfNewDay() {
    const today = tt1030ISTParts().ymd;
    if (tt1030.day !== today) {
        tt1030 = TT1030_EMPTY();
        tt1030.day = today;
        tt1030AuditIssues = [];
        tt1030LastSignalKey = "";
        appendTT1030Audit("day_reset");
    }
}
async function getTodayIndex15mCandles() {
    const nowMs = Date.now();
    const todayStart = new Date(tt1030ISTParts().ymd + "T00:00:00.000Z").getTime() - 5.5 * 3600000;
    const from = tt1030FmtIST(todayStart + (9 * 60 + 15) * 60000);
    const to = tt1030FmtIST(nowMs - 60000);
    const data = await kite.getHistoricalData(TT1030_INDEX_TOKEN, "15minute", from, to, false);
    return (data || []).map((c) => ({
        open: +c.open, high: +c.high, low: +c.low, close: +c.close,
        date: typeof c.date === "string" ? c.date : new Date(c.date).toISOString(),
    }));
}
function tt1030CloseTrade(c, exit, reason, premOut) {
    if (!tt1030.inTrade || !tt1030.dir)
        return 0;
    const qty = Number(config_1.config.quantity || 30);
    const pts = tt1030.dir === "CE" ? exit - tt1030.entry : tt1030.entry - exit;
    const pnlRs = Math.round(pts * qty);
    tt1030.dayPts += pts;
    tt1030.dayRs += pnlRs;
    tt1030.trades++;
    if (pts > 0)
        tt1030.wins++;
    else
        tt1030.losses++;
    const row = {
        time: tt1030CandleTime(c), dir: tt1030.dir, entry: tt1030.entry, exit,
        pts: parseFloat(pts.toFixed(1)), pnlRs, reason,
        premIn: tt1030.optEntryPrem || undefined, premOut: premOut || undefined, symbol: tt1030.optSym || undefined,
    };
    tt1030.log.push(row);
    tt1030.log = tt1030.log.slice(-20);
    (0, logger_1.logTrade)({ date: new Date().toISOString(), type: "TEN_THIRTY_INDEX", direction: row.dir, symbol: "BANKNIFTY_INDEX_SHADOW", entryPrice: row.entry, exitPrice: row.exit, pnl: row.pts, pnlRs: row.pnlRs, reasonEntry: "ten_thirty_breakout", reasonExit: reason, aiScore: 1, slippage: 0, duration: 0, qty });
    if (row.premIn && row.premOut)
        (0, logger_1.logTrade)({ date: new Date().toISOString(), type: "TEN_THIRTY_OPT", direction: row.dir, symbol: row.symbol, entryPrice: row.premIn, exitPrice: row.premOut, premiumEntry: row.premIn, premiumExit: row.premOut, pnl: parseFloat((row.premOut - row.premIn).toFixed(1)), pnlRs: Math.round((row.premOut - row.premIn) * qty), reasonEntry: "ten_thirty_opt_shadow", reasonExit: reason, aiScore: 1, slippage: 0, duration: 0, qty });
    appendTT1030Audit("exit", {
        dir: row.dir,
        entry: row.entry,
        exit: row.exit,
        pts: row.pts,
        pnlRs: row.pnlRs,
        reason,
        symbol: row.symbol || null,
        premIn: row.premIn || null,
        premOut: row.premOut || null,
        premiumPts: row.premIn && row.premOut ? parseFloat((row.premOut - row.premIn).toFixed(1)) : null,
    });
    if (row.premIn && !row.premOut) {
        tt1030AuditIssue("EXIT_PREMIUM_MISSING", "option LTP was not available at TT1030 exit", { symbol: row.symbol, reason }, "warn");
    }
    tt1030.inTrade = false;
    tt1030.dir = null;
    tt1030.entry = 0;
    tt1030.sl = 0;
    tt1030.optSym = "";
    tt1030.optEntryPrem = 0;
    tt1030.optLivePrem = 0;
    return pts;
}
async function tt1030Enter(dir, entry, sl, ref, reason) {
    const optSym = await getDrishtiATMOptionSymbol(dir, ref.close).catch(() => "");
    const optPrem = optSym ? await (0, market_1.getOptionLTP)(optSym).catch(() => 0) : 0;
    tt1030AuditSignal(dir, entry, sl, ref, reason, optSym, optPrem);
    tt1030.inTrade = true;
    tt1030.dir = dir;
    tt1030.entry = entry;
    tt1030.entryTime = tt1030CandleTime(ref);
    tt1030.sl = sl;
    tt1030.refHigh = ref.high;
    tt1030.refLow = ref.low;
    tt1030.optSym = optSym;
    tt1030.optEntryPrem = optPrem;
    tt1030.optLivePrem = optPrem;
    tt1030.log.push({ time: tt1030.entryTime, dir, entry, reason, premIn: optPrem || undefined, symbol: optSym || undefined });
    tt1030.log = tt1030.log.slice(-20);
    appendTT1030Audit("entry", {
        dir,
        entry,
        sl,
        reason,
        signalTime: tt1030.entryTime,
        symbol: optSym || null,
        premium: optPrem || null,
        mode: (config_1.config.mode || "LIVE").toUpperCase(),
    });
    log("TT1030_ENTRY", { dir, entry: entry.toFixed(1), sl: sl.toFixed(1), optSym, optPrem });
}
async function runTenThirtyShadow(isEOD) {
    tt1030ResetIfNewDay();
    const candles = await getTodayIndex15mCandles();
    if (!candles.length)
        return;
    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const candleStartMs = new Date(c.date).getTime();
        const candleIsClosed = Number.isFinite(candleStartMs)
            ? Date.now() >= candleStartMs + (15 * 60 * 1000)
            : true;
        // Do not lock a 15-minute candle until its full window has closed.
        if (!candleIsClosed)
            continue;
        const key = c.date || `${c.high}_${c.low}`;
        if (tt1030.seen.has(key))
            continue;
        tt1030.seen.add(key);
        const num = i + 1;
        const t = tt1030CandleTime(c);
        const clog = { idx: num, time: t, open: c.open, high: c.high, low: c.low, close: c.close, status: "watching", dir: tt1030.dir, sl: tt1030.sl || null, note: "" };
        if (num === 6 && !tt1030.tenHigh) {
            tt1030.tenHigh = c.high;
            tt1030.tenLow = c.low;
            tt1030.tenTime = t;
            clog.status = "marked_1030";
            clog.note = `range ${c.high.toFixed(1)} / ${c.low.toFixed(1)}`;
            tt1030.candleLog.push(clog);
            tt1030.candleLog = tt1030.candleLog.slice(-30);
            log("TT1030_MARKED", { high: c.high, low: c.low, time: t });
            continue;
        }
        if (!tt1030.tenHigh) {
            clog.status = "pre_1030";
            clog.note = "waiting for 10:30 candle";
            tt1030.candleLog.push(clog);
            tt1030.candleLog = tt1030.candleLog.slice(-30);
            continue;
        }
        const eodCandle = t >= "15:15" || isEOD;
        if (tt1030.inTrade && tt1030.dir) {
            const premOut = tt1030.optSym ? await (0, market_1.getOptionLTP)(tt1030.optSym).catch(() => 0) : 0;
            tt1030.optLivePrem = premOut || tt1030.optLivePrem;
            const slHit = tt1030.dir === "CE" ? c.close <= tt1030.sl : c.close >= tt1030.sl;
            if (slHit) {
                const oldDir = tt1030.dir;
                const exit = tt1030.sl;
                tt1030CloseTrade(c, exit, "sl_hit", premOut);
                clog.status = "sl_hit";
                clog.dir = oldDir;
                clog.sl = exit;
                clog.note = `SL hit at ${exit.toFixed(1)}`;
                if (tt1030.trades < 2 && !eodCandle) {
                    const revDir = oldDir === "CE" ? "PE" : "CE";
                    await tt1030Enter(revDir, exit, revDir === "CE" ? c.low : c.high, c, "reverse_after_sl");
                    clog.note += `; reversed ${revDir}`;
                }
                tt1030.candleLog.push(clog);
                tt1030.candleLog = tt1030.candleLog.slice(-30);
                continue;
            }
            if (eodCandle) {
                tt1030CloseTrade(c, c.close, "exit_eod", premOut);
                clog.status = "exit_eod";
                clog.note = `EOD exit ${c.close.toFixed(1)}`;
                tt1030.candleLog.push(clog);
                tt1030.candleLog = tt1030.candleLog.slice(-30);
                continue;
            }
            if (tt1030.dir === "CE" && c.close > tt1030.refHigh) {
                tt1030.sl = c.low;
                tt1030.refHigh = c.high;
                tt1030.refLow = c.low;
                clog.status = "trail";
                clog.dir = "CE";
                clog.sl = tt1030.sl;
                clog.note = `close broke ref high; SL -> ${tt1030.sl.toFixed(1)}`;
                log("TT1030_TRAIL", { dir: "CE", sl: c.low, refHigh: c.high, close: c.close });
            }
            else if (tt1030.dir === "PE" && c.close < tt1030.refLow) {
                tt1030.sl = c.high;
                tt1030.refHigh = c.high;
                tt1030.refLow = c.low;
                clog.status = "trail";
                clog.dir = "PE";
                clog.sl = tt1030.sl;
                clog.note = `close broke ref low; SL -> ${tt1030.sl.toFixed(1)}`;
                log("TT1030_TRAIL", { dir: "PE", sl: c.high, refLow: c.low, close: c.close });
            }
            else {
                clog.status = "hold";
                clog.dir = tt1030.dir;
                clog.sl = tt1030.sl || null;
                clog.note = "in trade; no SL/trail";
            }
            tt1030.candleLog.push(clog);
            tt1030.candleLog = tt1030.candleLog.slice(-30);
            continue;
        }
        if (!tt1030.inTrade && tt1030.trades < 2 && !eodCandle && num > 6) {
            const brokeHigh = c.close > tt1030.tenHigh;
            const brokeLow = c.close < tt1030.tenLow;
            let breakoutDir = null;
            let breakoutReason = "";
            if (brokeHigh) {
                breakoutDir = "CE";
                breakoutReason = "close_break_1030_high";
            }
            else if (brokeLow) {
                breakoutDir = "PE";
                breakoutReason = "close_break_1030_low";
            }
            if (breakoutDir === "CE") {
                await tt1030Enter("CE", tt1030.tenHigh, c.low, c, breakoutReason);
                clog.status = "entry";
                clog.dir = "CE";
                clog.sl = c.low;
                clog.note = `close broke 10:30 high ${tt1030.tenHigh.toFixed(1)}`;
            }
            else if (breakoutDir === "PE") {
                await tt1030Enter("PE", tt1030.tenLow, c.high, c, breakoutReason);
                clog.status = "entry";
                clog.dir = "PE";
                clog.sl = c.high;
                clog.note = `close broke 10:30 low ${tt1030.tenLow.toFixed(1)}`;
            }
            else {
                clog.status = "watching";
                clog.note = c.high > tt1030.tenHigh || c.low < tt1030.tenLow
                    ? "wick crossed 10:30 range; waiting for close confirmation"
                    : "inside 10:30 range";
            }
        }
        else if (!tt1030.inTrade) {
            clog.status = eodCandle ? "eod_no_trade" : "done";
            clog.note = eodCandle ? "EOD/no new entry" : "max trades reached";
        }
        tt1030.candleLog.push(clog);
        tt1030.candleLog = tt1030.candleLog.slice(-30);
    }
}
function tt1030HeartbeatFields() {
    const liveIdx = lastKnownPrice || null;
    const unrealPts = tt1030.inTrade && tt1030.dir && liveIdx
        ? (tt1030.dir === "CE" ? liveIdx - tt1030.entry : tt1030.entry - liveIdx)
        : 0;
    return {
        tt1030Strategy: "TEN_THIRTY_INDEX_SHADOW",
        tt1030PnL: Math.round(tt1030.dayRs + (unrealPts * Number(config_1.config.quantity || 30))),
        tt1030ClosedPnL: tt1030.dayRs,
        tt1030Pts: parseFloat((tt1030.dayPts + unrealPts).toFixed(1)),
        tt1030Trades: tt1030.trades,
        tt1030Wins: tt1030.wins,
        tt1030Losses: tt1030.losses,
        tt1030InTrade: tt1030.inTrade,
        tt1030Dir: tt1030.dir,
        tt1030Entry: tt1030.entry || null,
        tt1030SL: tt1030.sl || null,
        tt1030Live: liveIdx,
        tt1030OptionSymbol: tt1030.optSym || null,
        tt1030OptionEntry: tt1030.optEntryPrem || null,
        tt1030OptionLive: tt1030.optLivePrem || null,
        tt1030High: tt1030.tenHigh || null,
        tt1030Low: tt1030.tenLow || null,
        tt1030AuditStatus: tt1030AuditIssues.some(x => x.severity === "error") ? "BLOCKED" : (tt1030AuditIssues.length ? "WARN" : "OK"),
        tt1030AuditIssues: tt1030AuditIssues.slice(-10),
        tt1030TradeLog: tt1030.log.slice(-20),
        tt1030CandleLog: tt1030.candleLog.slice(-30),
    };
}
// ── BODY_HOLD Shadow runner ───────────────────────────────────────────────────
// Runs each 15-min candle close. Tracks two independent shadow strategies:
// S1: same-color body breakout, SL = ±200 pts (index for FUT, premium for OPT), hold EOD
// S2: same entry, SL = prev candle low (CE) or high (PE) on index, hold EOD
// Re-entry: after SL hit, only same-direction breakout allowed until EOD
async function runBodyHoldShadow(bc: { open: number; high: number; low: number; close: number }, isEOD: boolean) {
    const qty = (config_1.config.quantity as number) || 30;
    const S1_IDX_SL = 200;   // index pts SL for S1 futures
    const S1_PREM_SL = 200;  // premium pts SL for S1 options

    const logBHTrade = (name: string, state: BHState, exitIdx: number, exitPrem: number, reason: string) => {
        const futPts = state.dir === 'CE' ? exitIdx - state.entryIdx : state.entryIdx - exitIdx;
        const optPts = (state.entryPrem > 0 && exitPrem > 0)
            ? (state.dir === 'CE' ? exitPrem - state.entryPrem : state.entryPrem - exitPrem)
            : 0;
        if (state.entryIdx > 0)
            (0, logger_1.logTrade)({ date: new Date().toISOString(), type: `${name}_FUT`, direction: state.dir!, symbol: 'BANKNIFTY_FUT_SHADOW',
                entryPrice: state.entryIdx, exitPrice: exitIdx, pnl: parseFloat(futPts.toFixed(1)), pnlRs: Math.round(futPts * qty),
                reasonEntry: `${name.toLowerCase()}_entry`, reasonExit: reason, aiScore: 1, slippage: 0, duration: 0, qty });
        if (state.entryPrem > 0 && exitPrem > 0)
            (0, logger_1.logTrade)({ date: new Date().toISOString(), type: `${name}_OPT`, direction: state.dir!, symbol: state.optSym,
                entryPrice: state.entryPrem, exitPrice: exitPrem, premiumEntry: state.entryPrem, premiumExit: exitPrem,
                pnl: parseFloat(optPts.toFixed(1)), pnlRs: Math.round(optPts * qty),
                reasonEntry: `${name.toLowerCase()}_opt_entry`, reasonExit: reason, aiScore: 1, slippage: 0, duration: 0, qty });
        return { futPts, optPts };
    };

    // ── S1 exit check ─────────────────────────────────────────────────────────
    if (bhs1.inTrade && bhs1.dir) {
        const exitPrem = bhs1.optSym ? await (0, market_1.getOptionLTP)(bhs1.optSym).catch(() => 0) : 0;
        const idxSLHit = bhs1.dir === 'CE' ? bc.close <= bhs1.sl : bc.close >= bhs1.sl;
        const premSLHit = bhs1.slPrem > 0 && exitPrem > 0 && exitPrem <= bhs1.slPrem;
        if (idxSLHit || premSLHit || isEOD) {
            const reason = isEOD ? 'exit_eod' : 'exit_sl';
            const { futPts, optPts } = logBHTrade('BH_S1', bhs1, bc.close, exitPrem, reason);
            bhs1.dayFutPts += futPts; bhs1.dayFutRs += Math.round(futPts * qty);
            bhs1.dayOptPts += optPts; bhs1.dayOptRs += Math.round(optPts * qty);
            if (futPts > 0) bhs1.winsFut++; else bhs1.lossFut++;
            if (optPts > 0) bhs1.winsOpt++; else bhs1.lossOpt++;
            if (!isEOD && futPts <= 0) bhs1.waitDir = bhs1.dir; // re-entry same dir only
            log('BH_S1_EXIT', { reason, futPts: futPts.toFixed(1), optPts: optPts.toFixed(1), dayFutPts: bhs1.dayFutPts.toFixed(1), dayFutRs: bhs1.dayFutRs });
            bhs1.inTrade = false; bhs1.dir = null;
        }
    }

    // ── S2 exit check ─────────────────────────────────────────────────────────
    if (bhs2.inTrade && bhs2.dir) {
        const exitPrem = bhs2.optSym ? await (0, market_1.getOptionLTP)(bhs2.optSym).catch(() => 0) : 0;
        const slHit = bhs2.dir === 'CE' ? bc.close <= bhs2.sl : bc.close >= bhs2.sl;
        if (slHit || isEOD) {
            const reason = isEOD ? 'exit_eod' : 'exit_sl';
            const { futPts, optPts } = logBHTrade('BH_S2', bhs2, bc.close, exitPrem, reason);
            bhs2.dayFutPts += futPts; bhs2.dayFutRs += Math.round(futPts * qty);
            bhs2.dayOptPts += optPts; bhs2.dayOptRs += Math.round(optPts * qty);
            if (futPts > 0) bhs2.winsFut++; else bhs2.lossFut++;
            if (optPts > 0) bhs2.winsOpt++; else bhs2.lossOpt++;
            if (!isEOD && futPts <= 0) bhs2.waitDir = bhs2.dir;
            log('BH_S2_EXIT', { reason, futPts: futPts.toFixed(1), optPts: optPts.toFixed(1), dayFutPts: bhs2.dayFutPts.toFixed(1), dayFutRs: bhs2.dayFutRs });
            bhs2.inTrade = false; bhs2.dir = null;
        }
    }

    if (isEOD) { bhPrevCandle = bc; return; }

    // ── Entry signal: same-color body breakout from candle 2 onward ──────────
    bhCandleNum++;
    if (bhCandleNum >= 2 && bhPrevCandle) {
        const p = bhPrevCandle;
        const prevGreen = p.close > p.open, prevRed = p.close < p.open;
        const curGreen  = bc.close > bc.open, curRed  = bc.close < bc.open;
        const prevBodyH = Math.max(p.open, p.close);
        const prevBodyL = Math.min(p.open, p.close);

        let bhSig: 'CE'|'PE'|null = null;
        if (curGreen && prevGreen && bc.close > prevBodyH) bhSig = 'CE';
        else if (curRed && prevRed && bc.close < prevBodyL)  bhSig = 'PE';

        if (bhSig) {
            // S1 entry
            if (!bhs1.inTrade && (bhs1.waitDir === null || bhs1.waitDir === bhSig)) {
                const optSym = await getDrishtiATMOptionSymbol(bhSig, bc.close).catch(() => '');
                const optPrem = optSym ? await (0, market_1.getOptionLTP)(optSym).catch(() => 0) : 0;
                bhs1.inTrade = true; bhs1.dir = bhSig; bhs1.entryIdx = bc.close;
                bhs1.entryPrem = optPrem; bhs1.optSym = optSym;
                bhs1.sl = bhSig === 'CE' ? bc.close - S1_IDX_SL : bc.close + S1_IDX_SL;
                bhs1.slPrem = optPrem > 0 ? optPrem - S1_PREM_SL : 0;
                bhs1.waitDir = null;
                log('BH_S1_ENTRY', { dir: bhSig, idx: bc.close, prem: optPrem, sl: bhs1.sl, slPrem: bhs1.slPrem, optSym });
            }
            // S2 entry
            if (!bhs2.inTrade && (bhs2.waitDir === null || bhs2.waitDir === bhSig)) {
                const optSym = await getDrishtiATMOptionSymbol(bhSig, bc.close).catch(() => '');
                const optPrem = optSym ? await (0, market_1.getOptionLTP)(optSym).catch(() => 0) : 0;
                bhs2.inTrade = true; bhs2.dir = bhSig; bhs2.entryIdx = bc.close;
                bhs2.entryPrem = optPrem; bhs2.optSym = optSym;
                bhs2.sl = bhSig === 'CE' ? p.low : p.high; // prev candle low/high
                bhs2.slPrem = 0;
                bhs2.waitDir = null;
                log('BH_S2_ENTRY', { dir: bhSig, idx: bc.close, prem: optPrem, sl: bhs2.sl, optSym });
            }
        }
    }
    bhPrevCandle = bc;
}
async function runDrishtiBot() {
    const now = new Date();
    const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const h = ist.getHours(), m = ist.getMinutes();
    // ── Daily reset at 9:15 ───────────────────────────────────────────────
    if (h === 9 && m === 15) {
        DrishtiState = (0, drishti_strategy_1.createDrishtiState)();
        drishtiTodayCandles = [];
        drishtiPrevDayCandles = [];
        drishtiLastCandleKey = "";
        DrishtiCandleLog = [];
        stopDrishtiLTPMonitor(); // clear any stale monitor from previous day
        stopForDay = false;
        // Clear persisted candle log for the new day
        try {
            fs_1.default.writeFileSync('candle-log.json', JSON.stringify({ date: '', log: [] }));
        }
        catch (_e) { }
        capitalProtectionTriggered = false;
        dailyPnL = 0;
        tradeCount = 0;
        consecutiveLosses = 0;
        activeTrade = false;
        mainEntryDone = false;
        tradeDirection = null;
        tradeSymbol = "";
        entryPrice = 0;
        entryTime = 0;
        drishtiWins = 0;
        drishtiLosses = 0;
        dailyRealRs = 0;
        drishtiFuturesEntry = 0;
        optDailyPts = 0;
        optDailyRs = 0;
        optWins = 0;
        optLosses = 0;
        optATMCache = null;
        optInstrumentsCache = null;
        optRecentTrades = [];
        optInTrade = false;
        optDir = null;
        optSymbol = "";
        optEntryPrem = 0;
        bhs1 = BH_EMPTY(); bhs2 = BH_EMPTY(); bhPrevCandle = null; bhCandleNum = 0;
        tt1030 = TT1030_EMPTY();
        tt1030.day = tt1030ISTParts().ymd;
        log("STATE_RESET", { strategy: "DRISHTI_V1" });
        // Load previous day candles (non-blocking)
        (0, market_1.getPrevDayCandles)().then(candles => {
            drishtiPrevDayCandles = candles;
            log("DRISHTI_PREV_DAY_LOADED", { count: candles.length, ph: Math.max(...candles.map((c) => c.high)), pl: Math.min(...candles.map((c) => c.low)) });
        }).catch(e => log("DRISHTI_PREV_DAY_FAIL", { error: String(e) }));
    }
    // ── 9:45 AM candle silence check — fires if C1 was never received ──────────
    if (h === 9 && m === 45 && ist.getSeconds() < 16 && !_candleHealthAlerted) {
        _candleHealthAlerted = true;
        if (drishtiTodayCandles.length === 0) {
            await sendTelegram(`⚠️ CANDLE ALERT — 9:45 AM health check\n` +
                `No 15-min candles received since market open.\n` +
                `C1 (9:15–9:30 AM) should have been processed by now.\n` +
                `Bot may be stuck or data feed is down.\n` +
                `Check: pm2 logs amina-100-variant-b --lines 20`).catch(() => { });
        }
    }
    // ── 9:10 AM pre-market token health check (BEFORE isWithinTime guard) ────
    if (h === 9 && m === 10 && ist.getSeconds() < 16) {
        try {
            const _tokenAge = fs_1.default.existsSync('access_token.txt')
                ? Math.round((Date.now() - fs_1.default.statSync('access_token.txt').mtimeMs) / 60000)
                : 9999;
            const _tokenOk = _tokenAge < 180;
            if (!_tokenOk) {
                // Only alert on problem — no message on good days
                await sendTelegram(`🚨 TOKEN PROBLEM — Pre-market check @ 9:10 AM\n` +
                    `🔑 Token: STALE or MISSING (last seen ${_tokenAge}m ago)\n` +
                    `⚠️ Run auto_token NOW — only 20 mins before C1 closes!\n` +
                    `SSH: node /home/ubuntu/trading-bot/auto_token.js`).catch(() => { });
            }
        }
        catch (_e) { }
    }
    if (!(0, strategy_1.isWithinTime)(9, 15, 15, 30))
        return;
    const price = await (0, market_1.getCurrentPrice)();
    if (!price || price <= 0) {
        log("SKIP_CYCLE", { reason: "invalid price" });
        return;
    }
    lastKnownPrice = price;
    printStatus();
    // ── Capital protection ───────────────────────────────────────────────
    const maxDrawdown = config_1.config.capital * (config_1.config.capitalDrawdownPercent / 100);
    if (false) {
        if (activeTrade && tradeSymbol) {
            try {
                await (0, order_1.exitTrade)(tradeSymbol, config_1.config.quantity);
            }
            catch (_) { }
            activeTrade = false;
            mainEntryDone = false;
        }
        if (!stopForDay) {
            stopForDay = true;
            await notifyDailyLoss(dailyPnL).catch(() => { });
        }
        return;
    }
    if (stopForDay && !activeTrade)
        return;
    if (tradeCount >= 8 && !activeTrade)
        return; // max 8 trades — but still trail/exit if in trade
    // ── Detect new 15-min candle ─────────────────────────────────────────
    const candle = await (0, market_1.getPreviousCandle)();
    if (!candle || !candle.open || !candle.close) {
        log("SKIP_CYCLE", { reason: "invalid candle" });
        return;
    }
    const candleKey = candle.date ?? `${candle.high}_${candle.low}`;
    // Seed on first cycle
    if (drishtiLastCandleKey === "") {
        drishtiLastCandleKey = candleKey;
        log("DRISHTI_SEEDED", { candle });
        return;
    }
    if (candleKey === drishtiLastCandleKey)
        return; // same candle, no new close
    drishtiLastCandleKey = candleKey;
    // New candle closed — push to today stack
    const bc = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };
    drishtiTodayCandles.push(bc);
    runTenThirtyShadow(h > 15 || (h === 15 && m >= 30)).catch(e => log('TT1030_SHADOW_ERR', { error: String(e) }));
    // Run BODY_HOLD shadow strategies on every candle (fire-and-forget)
    runBodyHoldShadow(bc, h > 15 || (h === 15 && m >= 30)).catch(e => log('BH_SHADOW_ERR', { error: String(e) }));
    // EOD at 3:30 PM close (3:15-3:30 candle) — matches backtest last candle exactly
    // Previously m>=15 caused early exit at 3:15 PM (3:00-3:15 candle), one candle too early
    const isEOD = h > 15 || (h === 15 && m >= 30);
    // ── Trail management when in trade ───────────────────────────────────
    if (activeTrade && DrishtiState.inTrade) {
        const trail = (0, drishti_strategy_1.updateDrishtiTrail)(DrishtiState, bc, isEOD);
        DrishtiState.peakPts = trail.peakPts;
        DrishtiState.trailStop = trail.trailStop;
        if (trail.action !== "HOLD") {
            stopDrishtiLTPMonitor(); // stop 1-min monitor — candle-close exit taking over
            const capturedEntry = entryPrice;
            const capturedDir = tradeDirection;
            const capturedTime = entryTime;
            const capturedSymbol = tradeSymbol;
            const capturedPremiumEntry = entryPremium;
            const capturedPremiumExit = await (0, market_1.getOptionLTP)(tradeSymbol).catch(() => 0);
            const capturedQty = mainQty || config_1.config.quantity;
            try {
                await (0, order_1.exitTrade)(tradeSymbol, capturedQty, capturedDir === "PE" ? "BUY" : "SELL");
            }
            catch (e) {
                log("EXIT_FAIL", { error: e instanceof Error ? e.message : String(e) });
            }
            const pts = trail.pts; // candle-close index pts — used only as fallback for fair exit price
            // Real futures P&L — use ACTUAL market LTPs
            // Entry: drishtiFuturesEntry = rawLTP at entry time (actual futures price from market)
            // Exit:  capturedPremiumExit = getOptionLTP(tradeSymbol) at exit time (actual futures price)
            const _futEntryPrice = drishtiFuturesEntry > 0 ? drishtiFuturesEntry : bc.close;
            // Use actual futures LTP at exit if available and reasonable; else use entry + index movement
            const _futExitRaw = capturedPremiumExit > 0 ? capturedPremiumExit : 0;
            const _futExitFair = _futEntryPrice + (capturedDir === "CE" ? pts : -pts); // entry ± index pts
            const _futExitPrice = _futExitRaw > 0
                ? _futExitRaw // use actual futures market LTP at exit
                : _futExitFair; // fallback only when futures LTP is missing
            const _futExitSource = _futExitRaw > 0 ? "ACTUAL_FUTURES_LTP" : "FALLBACK_FAIR_MISSING_LTP";
            // For CE: P&L = exit - entry. For PE: P&L = entry - exit
            const _tradeRealRs = capturedDir === "CE"
                ? Math.round((_futExitPrice - _futEntryPrice) * capturedQty)
                : Math.round((_futEntryPrice - _futExitPrice) * capturedQty);
            dailyRealRs += _tradeRealRs;
            // dailyPnL / win-loss now derived from real futures fill basis, not candle-close index pts (BUG-2026-010 fix)
            const realPts = _tradeRealRs / capturedQty;
            dailyPnL += realPts;
            if (realPts > 0) {
                consecutiveLosses = 0;
                drishtiWins++;
            }
            else {
                consecutiveLosses++;
                drishtiLosses++;
            }
            appendRealPremiumAudit({ event: "futures_exit", reason: trail.action.toLowerCase(), symbol: capturedSymbol, direction: capturedDir, entry: _futEntryPrice, exit: _futExitPrice, rawExit: _futExitRaw, fairExit: _futExitFair, exitSource: _futExitSource, indexPts: pts, realRs: _tradeRealRs });
            log("FUTURES_PNL", { entryFut: _futEntryPrice.toFixed(0), exitFut: _futExitPrice.toFixed(0), exitActual: _futExitRaw.toFixed(0), exitSource: _futExitSource, indexPts: pts.toFixed(1), realRs: _tradeRealRs, tolerancePts: REAL_EXIT_TOLERANCE_PTS });
            // ── Close shadow options trade ────────────────────────────────────────
            if (optInTrade && optSymbol && optEntryPrem > 0) {
                try {
                    const optRawLTP = await (0, market_1.getOptionLTP)(optSymbol).catch(() => 0);
                    if (optRawLTP > 0) {
                        const _delta = 0.5;
                        // Use actual market LTP directly — same principle as futures fix
                        // optRawLTP IS the real premium the market offers at exit.
                        // Theoretical fair (delta×pts - theta) only used as fallback if LTP=0.
                        const _fairFallback = Math.max(1, optEntryPrem + _delta * pts); // simple delta estimate
                        const optExitLTP = optRawLTP > 0 ? optRawLTP : _fairFallback;
                        const optPts = optExitLTP - optEntryPrem;
                        const optRs = Math.round(optPts * capturedQty);
                        log("OPT_EXIT_PRICE", { rawLTP: optRawLTP.toFixed(1), optExitLTP: optExitLTP.toFixed(1),
                            entryPrem: optEntryPrem.toFixed(0), optPts: optPts.toFixed(1), optRs,
                            indexPts: pts.toFixed(1), usingActual: optRawLTP > 0 });
                        optDailyPts += optPts;
                        optDailyRs += optRs;
                        if (optPts > 0)
                            optWins++;
                        else
                            optLosses++;
                        const _optDur = optEntryTime > 0 ? Math.round((Date.now() - optEntryTime) / 1000) : 0;
                        const _optTradeRec = {
                            date: new Date().toISOString(),
                            direction: optDir,
                            symbol: optSymbol,
                            entryPrice: optEntryPrem,
                            exitPrice: optExitLTP,
                            pnl: parseFloat(optPts.toFixed(1)),
                            pnlRs: optRs,
                            qty: capturedQty,
                            reasonExit: trail.action.toLowerCase(),
                            duration: _optDur,
                        };
                        optRecentTrades.push(_optTradeRec);
                        if (optRecentTrades.length > 20)
                            optRecentTrades = optRecentTrades.slice(-20);
                        // Persist to trades.json so Trade History can show options data
                        (0, logger_1.logTrade)({ date: _optTradeRec.date, type: "DRISHTI_V1_OPT",
                            direction: optDir ?? "CE", symbol: optSymbol,
                            entryPrice: optEntryPrem, exitPrice: optExitLTP,
                            premiumEntry: optEntryPrem, premiumExit: optExitLTP,
                            pnl: parseFloat(optPts.toFixed(1)), pnlRs: optRs,
                            qty: capturedQty, aiScore: 1, slippage: 0,
                            reasonEntry: "drishti_opt_shadow", reasonExit: trail.action.toLowerCase(),
                            duration: _optDur });
                        appendRealPremiumAudit({ event: "options_exit", reason: trail.action.toLowerCase(), symbol: optSymbol, direction: optDir, entry: optEntryPrem, exit: optExitLTP, indexPts: pts, realPts: optPts, realRs: optRs });
                        log("OPT_EXIT", { symbol: optSymbol, entryPrem: optEntryPrem, exitPrem: optExitLTP, pts: optPts.toFixed(1), Rs: optRs });
                    }
                }
                catch (e) {
                    log("OPT_EXIT_FAIL", { error: String(e) });
                }
                optInTrade = false;
                optDir = null;
                optSymbol = "";
                optEntryPrem = 0;
            }
            if (realLossLimitHit()) {
                await stopForRealLoss("closed_trade_real_loss");
            }
            // Set up re-entry tracking
            DrishtiState.inTrade = false;
            DrishtiState.firstDone = true;
            DrishtiState.lastExitPts = trail.pts; // actual P&L pts (matches backtest)
            DrishtiState.lastExitIdx = drishtiTodayCandles.length - 1;
            DrishtiState.lastExitDir = capturedDir;
            activeTrade = false;
            mainEntryDone = false;
            tradeDirection = null;
            tradeSymbol = "";
            entryPrice = 0;
            entryTime = 0;
            entryPremium = 0;
            lastOptionLTP = 0;
            const exitReason = trail.action === "EXIT_SL"
                ? "SL -100 pts"
                : trail.action === "EXIT_EOD"
                    ? "EOD 3:15 PM"
                    : `Trail locked ${pts.toFixed(0)} pts (peak ${trail.peakPts.toFixed(0)})`;
            saveTradeState();
            await notifyExit(price, pts, exitReason, { dir: capturedDir, entry: capturedEntry, symbol: capturedSymbol, qty: capturedQty }).catch(() => { });
            if (trail.action === "EXIT_EOD") {
                stopForDay = true;
                await sendEODSummary().catch(() => { });
                (0, report_1.generateMonthlyReport)().catch(e => log("REPORT_FAIL", { error: e?.message }));
            }
            // entryPrice / exitPrice stored as FUTURES prices so Trade History shows consistent scale
            (0, logger_1.logTrade)({ date: new Date().toISOString(), type: "DRISHTI_V1", direction: capturedDir ?? "CE", symbol: capturedSymbol,
                premiumEntry: _futEntryPrice, // futures entry price (fair, not stale LTP)
                premiumExit: _futExitPrice, // futures exit price (fair, trail level + premium)
                qty: capturedQty,
                entryPrice: _futEntryPrice, // same — displayed in Trade History BUY row
                exitPrice: _futExitPrice, // same — displayed in Trade History SELL row
                pnl: parseFloat((_tradeRealRs / capturedQty).toFixed(1)), // real futures points
                pnlRs: _tradeRealRs, // real futures Rs = (exitFut - entryFut) × qty
                reasonEntry: "drishti_entry", reasonExit: trail.action.toLowerCase(),
                aiScore: 1, slippage: Math.abs(_futEntryPrice - (capturedPremiumEntry || _futEntryPrice)),
                duration: capturedTime > 0 ? Math.round((Date.now() - capturedTime) / 1000) : 0 });
        }
        return; // always return after trail check (don't look for new entries in same tick)
    }
    if (isEOD)
        return; // no new entries after EOD
    if (tradeCount >= 8)
        return;
    if (realEntryBlocked()) {
        if (!stopForDay) {
            await stopForRealLoss(`entry_block_real_loss_${REAL_ENTRY_BLOCK_RS}rs`);
        }
        return;
    }
    // ── Find entry signal ─────────────────────────────────────────────────
    let entrySig = null;
    const maxDrishtiReEntries = Math.max(0, MAX_TRADES - 1);
    if (DrishtiState.firstDone && DrishtiState.reCount < maxDrishtiReEntries && DrishtiState.lastExitIdx >= 0 && DrishtiState.lastExitDir) {
        // Re-entry: look for strong candle after last exit — always allow reverse (REV_UNLOCK=0)
        // NOTE: prevDayCandles NOT required for re-entry (findDrishtiReEntry uses only today candles)
        const allowReverse = true;
        const re = (0, drishti_strategy_1.findDrishtiReEntry)(drishtiTodayCandles, DrishtiState.lastExitIdx, DrishtiState.lastExitDir, allowReverse);
        const lastIdx = drishtiTodayCandles.length - 1;
        if (re) {
            if (re.idx === lastIdx) {
                // Signal on current candle — normal entry
                entrySig = { idx: re.idx, side: re.side, ctx: "INSIDE", reason: re.reason };
            }
            // NOTE: _next_candle path removed — backtest only enters on exact candle (sig.idx === i)
        }
    }
    else if (!DrishtiState.firstDone) {
        // First entry: needs prevDayCandles for PDH/PDL context — guard here, not before re-entry block
        if (!drishtiPrevDayCandles || drishtiPrevDayCandles.length === 0) {
            log("DRISHTI_NO_PREV_DAY", { candles: drishtiTodayCandles.length });
            return;
        }
        // V4 PDR filter — skip low-volatility days (prev day range < 150 pts)
        const _pdrH = Math.max(...drishtiPrevDayCandles.map((c) => c.high));
        const _pdrL = Math.min(...drishtiPrevDayCandles.map((c) => c.low));
        if (_pdrH - _pdrL >= 150) {
            entrySig = (0, drishti_strategy_1.findDrishtiEntry)(drishtiTodayCandles, drishtiPrevDayCandles);
        }
    }
    // ── Log candle evaluation ─────────────────────────────────────────────
    const _drishtiNow = new Date();
    const _drishtiIst = new Date(_drishtiNow.getTime() + 5.5 * 3600000);
    const _drishtiTime = _drishtiIst.getUTCHours().toString().padStart(2, '0') + ':' + _drishtiIst.getUTCMinutes().toString().padStart(2, '0');
    const _drishtiBodyPct = (bc.high - bc.low) > 0 ? Math.round((bc.close - bc.open) / (bc.high - bc.low) * 100) : 0;
    // ── Compute specific no-signal reason for the log ────────────────────
    const _drishtiNoSigReason = (() => {
        const _lastIdx = drishtiTodayCandles.length - 1;
        const _pdh = drishtiPrevDayCandles.length > 0 ? Math.max(...drishtiPrevDayCandles.map((c) => c.high)) : 0;
        const _pdl = drishtiPrevDayCandles.length > 0 ? Math.min(...drishtiPrevDayCandles.map((c) => c.low)) : 0;
        const _c0 = drishtiTodayCandles[0];
        const _c0bp = _c0 && (_c0.high - _c0.low) > 0 ? Math.round((_c0.close - _c0.open) / (_c0.high - _c0.low) * 100) : 0;
        if (DrishtiState.firstDone) {
            // Already had first trade today — re-entry path
            if (DrishtiState.reCount >= maxDrishtiReEntries)
                return `Re-entry limit reached (${maxDrishtiReEntries} of ${maxDrishtiReEntries} used today)`;
            if (DrishtiState.lastExitIdx < 0)
                return 'Re-entry: no completed exit yet';
            if (DrishtiState.lastExitPts < 10)
                return `Re-entry: watching for strong candle after C${DrishtiState.lastExitIdx + 1} exit (peak was +${DrishtiState.lastExitPts.toFixed(0)} pts — gate OFF, any exit allowed)`;
            return `Re-entry: no strong confirming candle yet after C${DrishtiState.lastExitIdx + 1} exit`;
        }
        // First entry path — still watching (DRISHTI V1 can enter C1 through C20 depending on context)
        if (_lastIdx > 0) {
            const _cN = _lastIdx + 1;
            const _bpStr = _drishtiBodyPct >= 0 ? `+${_drishtiBodyPct}%` : `${_drishtiBodyPct}%`;
            const _ctx = _pdh > 0 && _c0 && _c0.close > _pdh ? 'ABOVE_PDH'
                : _pdl > 0 && _c0 && _c0.close < _pdl ? 'BELOW_PDL'
                    : 'INSIDE';
            const _c1bp = _c0bp >= 0 ? `+${_c0bp}%` : `${_c0bp}%`;
            if (_ctx === 'INSIDE') {
                if (_lastIdx >= 4)
                    return `C${_cN} body ${_bpStr} — INSIDE · no PDH/PDL test signal on C${_cN} (waiting for strong breakout candle)`;
                return `C${_cN} body ${_bpStr} — INSIDE context (C1 was ${_c1bp}), waiting for strong confirming candle`;
            }
            if (_ctx === 'ABOVE_PDH')
                return `C${_cN} body ${_bpStr} — ABOVE_PDH context (C1 was ${_c1bp}), no CE/PE entry pattern matched`;
            return `C${_cN} body ${_bpStr} — BELOW_PDL context (C1 was ${_c1bp}), no entry pattern matched`;
        }
        // At C0 (first candle of day)
        if (_pdh > 0 && bc.close > _pdh) {
            if (_drishtiBodyPct > 55)
                return `C1 body too strong (+${_drishtiBodyPct}%) — inside_c0 pattern requires body ≤55% (not a runaway gap candle)`;
            if (_drishtiBodyPct < -29)
                return `C1 closed above PDH but bearish body (${_drishtiBodyPct}%) — direction mismatch for CE entry`;
            const _gapPts = _c0 ? Math.round(_c0.open - _pdh) : 0;
            if (_gapPts > 50)
                return `Gap-up open +${_gapPts} pts above PDH — entry filtered (too large a gap)`;
            return `C1 above PDH by ${Math.round(bc.close - _pdh)} pts but body/range filter blocked`;
        }
        if (_pdl > 0 && bc.close < _pdl) {
            if (_drishtiBodyPct < -55)
                return `C1 body too strong (${_drishtiBodyPct}%) — inside_c0 pattern requires body ≥-55%`;
            const _gapPts = _c0 ? Math.round(_pdl - _c0.open) : 0;
            if (_gapPts > 50)
                return `Gap-down open ${_gapPts} pts below PDL — entry filtered (too large a gap)`;
            return `C1 below PDL by ${Math.round(_pdl - bc.close)} pts but body/range filter blocked`;
        }
        if (_pdh > 0 && _pdl > 0) {
            return `C1 closed inside range — no breakout (close ${bc.close.toFixed(0)} between PDL ${_pdl} and PDH ${_pdh})`;
        }
        return 'No signal — prev day levels not loaded yet';
    })();
    DrishtiCandleLog.push({
        idx: drishtiTodayCandles.length - 1,
        time: _drishtiTime,
        close: bc.close,
        bodyPct: _drishtiBodyPct,
        signal: entrySig ? entrySig.side : null,
        reason: entrySig ? entrySig.reason : _drishtiNoSigReason,
        // offline omitted (undefined) = bot was live for this candle
    });
    // Persist log to disk so restarts don't lose live evaluations
    try {
        fs_1.default.writeFileSync('candle-log.json', JSON.stringify({ date: _drishtiIst.toISOString().slice(0, 10), log: DrishtiCandleLog }));
    }
    catch (_e) { }
    if (!entrySig) {
        log("DRISHTI_CANDLE", { idx: drishtiTodayCandles.length - 1, close: bc.close, no_signal: true });
        return;
    }
    const signalDetectedAt = Date.now();
    const signalCandleIdx = drishtiTodayCandles.length - 1;
    log("DRISHTI_SIGNAL_DETECTED", { idx: signalCandleIdx, side: entrySig.side, reason: entrySig.reason, candleClose: bc.close, candleDate: bc.date ?? null });
    // ── Place trade (BankNifty FUTURES) ────────────────────────────────────
    let sym = "";
    let symbolLookupMs = 0;
    let futuresLtpMs = 0;
    let orderPlacementMs = 0;
    try {
        const symbolLookupStart = Date.now();
        sym = await Promise.race([
            getDrishtiFuturesSymbol(),
            new Promise((_, rej) => setTimeout(() => rej(new Error("futures symbol timeout")), 10000)),
        ]);
        symbolLookupMs = Date.now() - symbolLookupStart;
        log("DRISHTI_SYMBOL_READY", { symbol: sym, symbolLookupMs });
    }
    catch (e) {
        log("FUTURES_SYMBOL_FAIL", { error: String(e) });
        return;
    }
    // ── Get ACTUAL futures price AFTER symbol lookup ────────────────────────
    // Critical: getCurrentPrice() returns INDEX, not FUTURES.
    // Fetching price BEFORE getDrishtiFuturesSymbol() means the 5-10s API wait
    // causes market to move → price is completely wrong by execution time.
    // Fix: use getOptionLTP(sym) AFTER symbol lookup = actual live FUTURES price.
    const _dte = (() => {
        try {
            const m = sym.match(/(\d{2})([A-Z]{3})(\d{4})/);
            if (!m)
                return 26;
            const months = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
            const d = new Date(`${m[3]}-${months[m[2]]}-${m[1]}`);
            return Math.max(1, Math.ceil((d.getTime() - Date.now()) / 86400000));
        }
        catch {
            return 26;
        }
    })();
    // Get FUTURES LTP (not index) right before placing order — most accurate price
    const futuresLtpStart = Date.now();
    const futuresLTP = await (0, market_1.getOptionLTP)(sym).catch(() => 0);
    futuresLtpMs = Date.now() - futuresLtpStart;
    const freshPrice = futuresLTP > 0 ? futuresLTP : bc.close;
    const _actualPrem = freshPrice - bc.close;
    appendRealPremiumAudit({ event: "futures_entry", symbol: sym, direction: entrySig.side, futuresLTP: freshPrice, indexClose: bc.close, premiumToIndex: _actualPrem, dte: _dte });
    log("FUTURES_ENTRY_PRICE", { futuresLTP, freshPrice: freshPrice.toFixed(0), indexClose: bc.close.toFixed(0), actualPremium: _actualPrem.toFixed(0), dte: _dte });
    drishtiDTE = _dte;
    drishtiFuturesEntry = freshPrice; // real futures fill price for P&L tracking
    tradeDirection = entrySig.side;
    tradeSymbol = sym;
    entryPrice = bc.close; // index-level entry (trail uses this)
    mainQty = config_1.config.quantity;
    mainEntryDone = true;
    activeTrade = true;
    let actualFillPrice = freshPrice;
    DrishtiState.inTrade = true;
    DrishtiState.dir = entrySig.side;
    DrishtiState.entry = bc.close;
    DrishtiState.entryIdx = drishtiTodayCandles.length - 1;
    DrishtiState.trailStop = -100; // SL_PTS=100 (changed from 150)
    DrishtiState.peakPts = 0;
    startDrishtiLTPMonitor(); // real-risk guard enabled; exits if futures/options real loss breaches cap
    try {
        tradeInProgress = true;
        const orderStartAt = Date.now();
        const order = await (0, order_1.placeTrade)(sym, freshPrice, config_1.config.quantity, entrySig.side === "PE" ? "SELL" : "BUY");
        orderPlacementMs = Date.now() - orderStartAt;
        tradeInProgress = false;
        log("DRISHTI_ENTRY_TIMING", { idx: signalCandleIdx, side: entrySig.side, reason: entrySig.reason, symbol: sym, signalToOrderStartMs: orderStartAt - signalDetectedAt, symbolLookupMs, futuresLtpMs, orderPlacementMs, totalSignalToOrderDoneMs: Date.now() - signalDetectedAt });
        if (!order || order.status !== "COMPLETE" || order.filled_quantity <= 0) {
            stopDrishtiLTPMonitor(); // trade failed Γö stop LTP monitor
            log("ORDER_NOT_FILLED", { order });
            mainEntryDone = false;
            activeTrade = false;
            tradeDirection = null;
            tradeSymbol = "";
            entryPrice = 0;
            entryTime = 0;
            DrishtiState.inTrade = false;
            return;
        }
        mainQty = Number(order.filled_quantity || config_1.config.quantity);
        actualFillPrice = Number(order.average_price || freshPrice);
        entryPrice = bc.close; // always index close — trail uses index candles
        DrishtiState.entry = bc.close; // NEVER futures fill — would break trail (index vs futures scale)
        drishtiFuturesEntry = actualFillPrice;
        log("ENTRY_PRICE_UPDATE", { indexCandle: bc.close.toFixed(1), futuresFill: actualFillPrice.toFixed(1), diff: (actualFillPrice - bc.close).toFixed(1), source: (order.average_price ? "order_average" : "fresh_futures_ltp") });
    }
    catch (e) {
        tradeInProgress = false;
        stopDrishtiLTPMonitor(); // trade rejected — stop LTP monitor
        log("ORDER_REJECTED", { error: e instanceof Error ? e.message : String(e) });
        mainEntryDone = false;
        activeTrade = false;
        tradeDirection = null;
        tradeSymbol = "";
        entryPrice = 0;
        entryTime = 0;
        DrishtiState.inTrade = false;
        (0, order_1.stopTradingForDay)();
        stopForDay = true;
        return;
    }
    if (DrishtiState.firstDone)
        DrishtiState.reCount++;
    // ── Options shadow — MONITORING ONLY (disabled for live: 5yr backtest shows net LOSS)
    // Options P&L = -₹1.4L over 5yr due to delta=0.5 + theta + spread eroding small wins.
    // Keep tracking for comparison data but DO NOT execute trades.
    try {
        const optSym = await getDrishtiATMOptionSymbol(entrySig.side, actualFillPrice || freshPrice);
        const optLTP = await (0, market_1.getOptionLTP)(optSym).catch(() => 0);
        if (optLTP > 0) {
            // Record for monitoring dashboard — not a real trade
            optInTrade = true;
            optDir = entrySig.side;
            optSymbol = optSym;
            optEntryPrem = optLTP;
            optEntryTime = Date.now();
            appendRealPremiumAudit({ event: "options_entry", symbol: optSym, direction: entrySig.side, premium: optLTP, indexEntry: bc.close, futuresEntry: actualFillPrice || freshPrice, note: "monitoring_only_not_live" });
            log("OPT_MONITOR", { symbol: optSym, ltp: optLTP, dir: entrySig.side, indexEntry: bc.close.toFixed(0), futuresEntry: (actualFillPrice || freshPrice).toFixed(0), note: "monitoring_only_not_live" });
        }
    }
    catch (_e) { /* options monitoring failure — ignore */ }
    tradeCount++;
    saveTradeState();
    const slLevel = entrySig.side === "CE" ? bc.close - 150 : bc.close + 150;
    await sendTelegram(`📈 *DRISHTI V1 — ${entrySig.side === "CE" ? "LONG BNF Futures" : "SHORT BNF Futures"}*
` +
        `Symbol: \`${sym}\`
` +
        `Futures price: *₹${freshPrice}* | Qty: ${mainQty}
` +
        `Index entry: *${bc.close.toFixed(0)}* | SL: ${slLevel.toFixed(0)} (−150 pts)
` +
        `Context: ${entrySig.ctx} | Signal: ${entrySig.reason}
` +
        `────────────────────
` +
        `Trade #${tradeCount}/8 | Day P&L: ${dailyPnL >= 0 ? "+" : ""}${dailyPnL.toFixed(0)} pts`).catch(() => { });
    const premiumAtEntry = await (0, market_1.getOptionLTP)(sym).catch(() => 0);
    entryPremium = premiumAtEntry;
    lastOptionLTP = premiumAtEntry;
    (0, logger_1.logTrade)({ date: new Date().toISOString(), type: "DRISHTI_V1", direction: entrySig.side, symbol: sym, premiumEntry: premiumAtEntry, premiumExit: 0, entryPrice: actualFillPrice, exitPrice: 0, pnl: 0, reasonEntry: `drishti_${entrySig.ctx}_${entrySig.reason}`, reasonExit: "", aiScore: 1, slippage: Math.abs(freshPrice - actualFillPrice), duration: 0, qty: mainQty });
}
async function runBot() {
    if (!isMarketHours())
        return; // Weekend + off-hours guard
    // ── ITM_HOLD: completely separate strategy — route and return ──────────────
    if (ACTIVE_STRATEGY === "ITM_HOLD") {
        await runITMHoldBot();
        return;
    }
    // ── HYBRID_REVERSE: completely separate strategy — route and return ────────
    if (ACTIVE_STRATEGY === "HYBRID_REVERSE") {
        await runHybridReverseBot();
        return;
    }
    // ── DRISHTI_V1: PDH/PDL context + LOCK20 trail strategy ────────────────────
    if (ACTIVE_STRATEGY === "DRISHTI_V1") {
        await runDrishtiBot();
        return;
    }
    // Log exactly WHY we are skipping — this is the most important diagnostic line
    // stopForDay blocks NEW entries only — active trade monitoring must continue
    if (stopForDay && !activeTrade) {
        log("SKIP_CYCLE", { reason: "stopForDay" });
        return;
    }
    if ((0, order_1.isTradingStopped)()) {
        log("SKIP_CYCLE", { reason: "tradingStopped" });
        return;
    }
    if (capitalProtectionTriggered && !activeTrade) {
        log("SKIP_CYCLE", { reason: "capitalProtection" });
        return;
    }
    if (activeTrade) { /* active trade — fall through to monitor */ }
    if (tradeInProgress) {
        log("SKIP_CYCLE", { reason: "orderInProgress" });
        return;
    }
    // Note: printStatus() is called inside the try block AFTER price is fetched, so PnL is always live
    // Hard kill switch (account safety layer)
    const maxDrawdown = config_1.config.capital * (config_1.config.capitalDrawdownPercent / 100);
    if (false) {
        log("HARD_KILL_SWITCH", { dailyPnL, maxDrawdown, message: "Hard kill switch triggered. Stopping trading." });
        await (0, order_1.squareOffAll)();
        capitalProtectionTriggered = true;
        stopForDay = true;
        await notifyDailyLoss(dailyPnL);
        return;
    }
    // Time-based safety buffer
    const now = new Date();
    const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    // ── 9:10 AM pre-market health check ───────────────────────────────────────
    if (ist.getHours() === 9 && ist.getMinutes() === 10 && ist.getSeconds() < 16) {
        try {
            const _hbAge = fs_1.default.existsSync('bot-heartbeat.json')
                ? Math.round((Date.now() - new Date(JSON.parse(fs_1.default.readFileSync('bot-heartbeat.json', 'utf-8')).at).getTime()) / 1000)
                : 9999;
            const _tokenAge = fs_1.default.existsSync('access_token.txt')
                ? Math.round((Date.now() - fs_1.default.statSync('access_token.txt').mtimeMs) / 60000)
                : 9999;
            const _tokenOk = _tokenAge < 180; // written within last 3 hours = today's token
            const _botOk = _hbAge < 120; // heartbeat within 2 min
            const _status = _tokenOk && _botOk ? '✅ ALL SYSTEMS GO' : '🚨 PROBLEM DETECTED';
            await sendTelegram(`${_status} — Pre-market check @ 9:10 AM\n` +
                `🔑 Token: ${_tokenOk ? `✅ valid (refreshed ${_tokenAge}m ago)` : `❌ MISSING or stale (${_tokenAge}m ago)`}\n` +
                `🤖 Bot: ${_botOk ? `✅ online (heartbeat ${_hbAge}s ago)` : `❌ OFFLINE (last seen ${_hbAge}s ago)`}\n` +
                `📊 Strategy: ${ACTIVE_STRATEGY} | Mode: ${config_1.config.mode}\n` +
                (_tokenOk && _botOk ? `C1 closes at 9:30 AM — entry window open ✔` : `⚠️ Fix now — 20 mins before C1 closes`));
        }
        catch (_e) { }
    }
    // State reset at 9:15
    if (ist.getHours() === 9 && ist.getMinutes() === 15) {
        activeTrade = false;
        earlyEntryDone = false;
        mainEntryDone = false;
        pyramidDone = false;
        pyramidQty = 0;
        trendMode = false;
        trailActivated = false;
        tradeDirection = null;
        tradeSymbol = "";
        entryPrice = 0;
        earlyQty = 0;
        mainQty = 0;
        lastExitTime = null;
        stopForDay = false;
        capitalProtectionTriggered = false;
        dailyPnL = 0;
        dailyRealRs = 0;
        lastTradeProfit = false;
        consecutiveLosses = 0;
        entryTime = 0;
        entrySlippage = 0;
        tradeAIScore = 0;
        log("STATE_RESET", { time: ist });
        rcWaiting = false;
        rcBreakoutDir = null;
        rcTrade2Active = false;
        rcIndexSL = 0;
        hybridState = (0, strategy_1.createHybridState)();
        hybridPrevCandle = null;
        hybridLastCandleKey = "";
        tt1030 = TT1030_EMPTY();
        tt1030.day = tt1030ISTParts().ymd;
        _dailyPnlLogSaved = false; // reset for the new day
        _tokenAutoRefreshing = false; // allow fresh auto-refresh next day if needed
        _candleHealthAlerted = false; // allow fresh candle health check next day
    }
    // 15:15:00 - stop new trades
    if (ist.getHours() === 15 && ist.getMinutes() >= 15 && ist.getMinutes() < 20) {
        stopForDay = true;
        log("TIME_BUFFER", { message: "Stopped new trades at 15:15" });
    }
    // 15:20:00 - exit all positions
    if (ist.getHours() === 15 && ist.getMinutes() >= 20 && !capitalProtectionTriggered) {
        // Capture square-off price and day OHLC before exiting
        if (tradeSymbol) {
            try {
                const sqOffPrice = await (0, market_1.getOptionLTP)(tradeSymbol);
                const ohlc = await (0, market_1.getOptionDayOHLC)(tradeSymbol);
                await (0, notifier_1.notifyStrikeEOD)(tradeSymbol, entryPrice, ohlc.high, ohlc.low, sqOffPrice);
            }
            catch (e) {
                log("EOD_STRIKE_ALERT_FAIL", { error: e instanceof Error ? e.message : String(e) });
            }
        }
        await (0, order_1.squareOffAll)();
        await sendEODSummary();
        (0, report_1.generateMonthlyReport)().catch(e => log("REPORT_FAIL", { error: e?.message }));
        if (!_dailyPnlLogSaved) {
            _dailyPnlLogSaved = true;
            saveDailyPnlLog().catch(() => { });
        }
        stopForDay = true;
        await notifyBotStop("15:20 exit all positions");
        log("TIME_BUFFER", { message: "Exited all positions at 15:20" });
        return;
    }
    // End-of-day forced exit
    if (ist.getHours() > 15 || (ist.getHours() === 15 && ist.getMinutes() >= 30)) {
        if (!_dailyPnlLogSaved) {
            _dailyPnlLogSaved = true;
            saveDailyPnlLog().catch(() => { });
        }
        await (0, order_1.squareOffAll)();
        stopForDay = true;
        await notifyBotStop("EOD exit");
        return;
    }
    //── Time guards ──────────────────────────────────────
    if (!(0, strategy_1.isWithinTime)(9, 25, 15, 30)) {
        console.log("Outside market hours. Waiting...");
        return;
    }
    if (!earlyEntryDone && !mainEntryDone && !(0, strategy_1.isWithinTime)(9, 25, 15, 0)) {
        console.log("15:00 cutoff reached with no trade. Stopping for day.");
        stopForDay = true;
        return;
    }
    // ── Daily loss limit ─────────────────────────────────
    if (false) {
        console.log(`Daily loss limit hit (${dailyPnL.toFixed(0)} pts). Stopping for day.`);
        stopForDay = true;
        await notifyDailyLoss(dailyPnL);
        return;
    }
    // ── 2 consecutive losses → stop (disabled during testing) ───
    // if (consecutiveLosses >= 2) { stopForDay = true; return; }
    // ── Max trades reached — only block NEW entries, not active trade monitoring ──
    if (tradeCount >= MAX_TRADES && !activeTrade) {
        console.log("Max trades reached. Stopping for day.");
        stopForDay = true;
        if (!_tgSilenced) {
            await notifyBotStop("Max trades reached");
            _tgSilenced = true;
        }
        return;
    }
    try {
        const candle = await (0, market_1.getPreviousCandle)();
        const price = await (0, market_1.getCurrentPrice)();
        if (!price || price <= 0) {
            log("SKIP_CYCLE", { reason: "Invalid price data", price });
            return;
        }
        lastKnownPrice = price; // cache for live PnL display in printStatus
        printStatus(); // print after price fetched so PnL is live
        const { bodyHigh, bodyLow } = (0, strategy_1.getCandleBody)(candle);
        // ── Wait for 9:30 candle to complete ─────────────
        if (!(0, strategy_1.isWithinTime)(9, 30, 23, 59)) {
            log("WAITING", { reason: "9:30 candle not yet complete" });
            return;
        }
        // ── Detect new candle completion ─────────────────────────────────────────
        const candleDate = candle.date ?? `${candle.high}_${candle.low}`;
        // On very first cycle: find the last STRUCTURE candle (last one that broke the prior candle's
        // high or low). Inside bars between then and now do NOT replace the reference.
        let justSeeded = false;
        if (lastEntryCandleDate === "") {
            try {
                const { refCandle, currentCandle } = await (0, market_1.getStructureSeed)();
                prevCandleForEntry = refCandle;
                lastEntryCandleDate = candleDate;
                const refBodyHigh = Math.max(refCandle.open, refCandle.close);
                const refBodyLow = Math.min(refCandle.open, refCandle.close);
                log("SEEDED", { refBodyHigh, refBodyLow, currentClose: currentCandle.close });
                justSeeded = true; // allow entry on this cycle even though newCandleCompleted=false
            }
            catch (e) {
                log("SEED_ERR", { error: e instanceof Error ? e.message : String(e) });
                lastEntryCandleDate = candleDate;
            }
        }
        // True only when a NEW candle just completed (date changed from last cycle)
        const newCandleCompleted = candleDate !== lastEntryCandleDate;
        // ── Signal: BODY breakout — close must break above prev candle's body high or below body low
        // bodyHigh = max(open, close)  bodyLow = min(open, close)
        // MIN_BREAKOUT_MARGIN: close must be 50+ pts past the level (filters hairline 2-3 pt crossings)
        let signal = null;
        if (prevCandleForEntry) {
            const prevBodyHigh = Math.max(prevCandleForEntry.open, prevCandleForEntry.close);
            const prevBodyLow = Math.min(prevCandleForEntry.open, prevCandleForEntry.close);
            if (candle.close > prevBodyHigh + MIN_BREAKOUT_MARGIN)
                signal = "CE";
            else if (candle.close < prevBodyLow - MIN_BREAKOUT_MARGIN)
                signal = "PE";
        }
        // ── Update trackers AFTER signal check ───────────────────────────────────
        // Snapshot refCandle BEFORE overwriting — needed by monitor trail + entry SL below
        const refCandle = prevCandleForEntry ? { ...prevCandleForEntry } : null;
        if (newCandleCompleted) {
            lastEntryCandleDate = candleDate; // always advance date so next candle is detected
            if (signal !== null) {
                // This candle BROKE structure → it becomes the new reference for the next comparison
                prevCandleForEntry = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };
            }
            // Inside bar (signal === null) → prevCandleForEntry unchanged (10:30 stays as reference)
        }
        // ── Heartbeat every cycle ─────────────────────────
        const _inTrade = !!(mainEntryDone || earlyEntryDone);
        const livePnL = _inTrade && entryPrice > 0 && tradeDirection
            ? (tradeDirection === "CE" ? price - entryPrice : entryPrice - price)
            : dailyPnL;
        try {
            fs_1.default.writeFileSync("bot-heartbeat.json", JSON.stringify({
                at: new Date().toISOString(),
                status: _inTrade ? `IN TRADE · ${tradeDirection}` : "RUNNING · FLAT",
                price,
                dailyPnL: parseFloat(livePnL.toFixed(0)),
                unrealisedPnL: _inTrade ? parseFloat(livePnL.toFixed(0)) : 0,
                tradeCount, qty: config_1.config.quantity,
                slPts: ACTIVE_STRATEGY === "DRISHTI_V1" ? 150 : (config_1.config.tradeManagement?.stopLossPoints ?? 100),
                dailyCapPts: null, mode: config_1.config.mode,
                inTrade: _inTrade,
                direction: tradeDirection ?? null,
                entryPrice: entryPrice || null,
                livePrice: price || null,
                symbol: tradeSymbol || null,
                entryPremium: _inTrade ? entryPremium || null : null,
                livePremium: _inTrade ? lastOptionLTP || null : null,
                sl: _inTrade ? (tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100) : null,
                ...tt1030HeartbeatFields(),
            }));
        }
        catch (_) { }
        const prevBodyHigh = prevCandleForEntry ? Math.max(prevCandleForEntry.open, prevCandleForEntry.close) : null;
        const prevBodyLow = prevCandleForEntry ? Math.min(prevCandleForEntry.open, prevCandleForEntry.close) : null;
        const breakoutMargin = prevBodyHigh && prevBodyLow
            ? (signal === "CE" ? Math.round(candle.close - prevBodyHigh) : signal === "PE" ? Math.round(prevBodyLow - candle.close) : 0)
            : 0;
        log("CYCLE", { price, pnl: livePnL.toFixed(0), signal: signal ?? "none", newCandle: newCandleCompleted, prevBodyHigh, prevBodyLow, candleClose: candle.close, breakoutMargin });
        // ── Monitor open trade ────────────────────────────
        if ((earlyEntryDone || mainEntryDone) && tradeDirection && tradeSymbol) {
            const profit = tradeDirection === "CE" ? price - entryPrice : entryPrice - price;
            let currentOptionLTP = 0;
            try {
                currentOptionLTP = await (0, market_1.getOptionLTP)(tradeSymbol);
            }
            catch (_) { }
            if (currentOptionLTP > 0) {
                lastOptionLTP = currentOptionLTP;
                if (entryPremium === 0) {
                    entryPremium = currentOptionLTP;
                    saveTradeState();
                } // backfill after restore
            }
            log("MONITOR", { price, optionLTP: currentOptionLTP, pnl: profit.toFixed(0), optionSL: candleSL, indexSL: rcIndexSL, strategy: ACTIVE_STRATEGY, dailyPnL: dailyPnL.toFixed(0) });
            printStatus();
            // ── RC_CONFIRM: SL = index price crossing RC high/low (checked at each new candle) ──
            if (ACTIVE_STRATEGY === "RC_CONFIRM" && rcIndexSL > 0 && newCandleCompleted) {
                const rcSlHit = tradeDirection === "CE" ? candle.low < rcIndexSL : candle.high > rcIndexSL;
                if (rcSlHit) {
                    const totalQty = earlyQty + mainQty + pyramidQty;
                    log("EXIT", { reason: "RC index SL hit", strategy: "RC_CONFIRM", tradeNum: rcTrade2Active ? 2 : 1, indexSL: rcIndexSL, pnl: profit.toFixed(0) });
                    try {
                        await (0, order_1.exitTrade)(tradeSymbol, totalQty);
                    }
                    catch (e) {
                        log("ORDER_REJECTED", { error: (e instanceof Error) ? e.message : (e?.message ?? JSON.stringify(e)) });
                        (0, order_1.stopTradingForDay)();
                        stopForDay = true;
                        return;
                    }
                    dailyPnL += profit;
                    consecutiveLosses++;
                    await notifyExit(price, profit, `RC SL hit @ ${rcIndexSL.toFixed(0)}`);
                    (0, logger_1.logTrade)({ date: new Date().toISOString(), type: "RC_CONFIRM", direction: tradeDirection, entryPrice, exitPrice: price, pnl: profit, reasonEntry: "rc_confirm", reasonExit: "rc_sl", aiScore: 1, slippage: 0, duration: entryTime > 0 ? Math.round((Date.now() - entryTime) / 1000) : 0 });
                    if (!rcTrade2Active) {
                        // Trade 1 SL hit → trending → set up Trade 2 in opposite direction
                        const t2Dir = tradeDirection === "CE" ? "PE" : "CE";
                        mainEntryDone = false;
                        activeTrade = false;
                        tradeDirection = null;
                        tradeSymbol = "";
                        entryPrice = 0;
                        candleSL = 0;
                        rcIndexSL = 0;
                        rcTrade2Active = true;
                        log("RC_TRADE2_SETUP", { direction: t2Dir, entryAt: price, newIndexSL: t2Dir === "CE" ? candle.low : candle.high });
                        let t2Symbol = "";
                        try {
                            t2Symbol = await Promise.race([
                                (0, market_1.getBestOptionSymbol)(t2Dir),
                                new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000))
                            ]);
                        }
                        catch (_) {
                            log("RC_TRADE2_FAIL", { reason: "option select failed" });
                            stopForDay = true;
                            return;
                        }
                        const t2Price = await (0, market_1.getCurrentPrice)();
                        tradeDirection = t2Dir;
                        tradeSymbol = t2Symbol;
                        entryPrice = t2Price;
                        mainQty = TOTAL_QTY;
                        mainEntryDone = true;
                        entryTime = Date.now();
                        rcIndexSL = t2Dir === "CE" ? candle.low : candle.high;
                        let t2Ltp = 0;
                        try {
                            t2Ltp = await (0, market_1.getOptionLTP)(t2Symbol);
                        }
                        catch (_) { }
                        candleSL = t2Ltp > 0 ? t2Ltp - 100 : 0;
                        log("ENTRY", { type: "RC_TRADE2", symbol: t2Symbol, price: t2Price, indexSL: rcIndexSL, optionSL: candleSL });
                        try {
                            tradeInProgress = true;
                            const r = await (0, order_1.placeTrade)(t2Symbol, t2Price, TOTAL_QTY);
                            tradeInProgress = false;
                            if (!r || r.status !== "COMPLETE" || r.filled_quantity <= 0) {
                                mainEntryDone = false;
                                log("ORDER_NOT_FILLED", { r });
                                return;
                            }
                        }
                        catch (e) {
                            tradeInProgress = false;
                            mainEntryDone = false;
                            stopForDay = true;
                            return;
                        }
                        tradeCount++;
                        activeTrade = true;
                        saveTradeState();
                        notifyEntry("RC_TRADE2", t2Symbol, t2Price, TOTAL_QTY, t2Dir, candle, candle.high, candle.low, price).catch(() => { });
                    }
                    else {
                        // Trade 2 also hit SL → done for day
                        clearTradeState();
                        activeTrade = false;
                        mainEntryDone = false;
                        tradeDirection = null;
                        rcTrade2Active = false;
                        rcIndexSL = 0;
                        candleSL = 0;
                        stopForDay = true;
                        log("RC_DAY_DONE", { reason: "Both trades hit SL", dailyPnL });
                        await notifyBotStop("Both RC trades hit SL — stopping for day");
                    }
                    return;
                }
            }
            // ── BODY_BREAKOUT: Reversal-candle trailing SL ──────────────────────────────────────────────
            // Phase 1 (profit < TRAIL_ACTIVATE_PTS): hold with original candle-low SL
            // Phase 2 (profit >= TRAIL_ACTIVATE_PTS): activate trail; on each new 15-min candle check for
            //   reversal candle (bearish body ≥ REVERSAL_BODY_MIN for CE, bullish for PE) → move SL to that
            //   candle's low (CE) or high (PE), only ratcheting in our favour. Exit when price breaks SL.
            if (ACTIVE_STRATEGY === "BODY_BREAKOUT") {
                // Activate trail once profit crosses the threshold
                if (!trailActivated && profit >= TRAIL_ACTIVATE_PTS) {
                    trailActivated = true;
                    saveTradeState();
                    log("TRAIL_ACTIVATED", { profit: profit.toFixed(0), activateAt: TRAIL_ACTIVATE_PTS, currentSL: rcIndexSL });
                    await sendTelegram(`🎯 *Trail Activated* (+${profit.toFixed(0)} pts)\nSL locked at: *${rcIndexSL}* (candle low)\nHolding for reversal candle ≥ ${REVERSAL_BODY_MIN} pts body...`).catch(() => { });
                }
                // On each new completed candle, check for reversal candle → ratchet SL
                if (trailActivated && newCandleCompleted) {
                    const body = Math.abs(candle.close - candle.open);
                    const isReversalCandle = tradeDirection === "CE"
                        ? (candle.close < candle.open && body >= REVERSAL_BODY_MIN) // bearish candle for CE
                        : (candle.close > candle.open && body >= REVERSAL_BODY_MIN); // bullish candle for PE
                    if (isReversalCandle) {
                        const newSL = tradeDirection === "CE" ? candle.low : candle.high;
                        const improved = tradeDirection === "CE" ? newSL > rcIndexSL : newSL < rcIndexSL;
                        if (improved) {
                            const oldSL = rcIndexSL;
                            rcIndexSL = newSL;
                            saveTradeState();
                            log("TRAIL_SL_UPDATE", { direction: tradeDirection, body: body.toFixed(0), oldSL, newSL: rcIndexSL, profit: profit.toFixed(0) });
                            await sendTelegram(`🔼 *Trail SL Updated*\nDir: ${tradeDirection} | Body: ${body.toFixed(0)} pts\nSL: ${oldSL} → *${rcIndexSL}*\nProfit so far: +${profit.toFixed(0)} pts`).catch(() => { });
                        }
                        else {
                            log("TRAIL_SL_SKIP", { reason: "not improved", direction: tradeDirection, newSL, currentSL: rcIndexSL, body: body.toFixed(0) });
                        }
                    }
                }
            }
            // ── BODY_BREAKOUT: SL = index price crosses breakout candle's low (CE) or high (PE) ──
            if (ACTIVE_STRATEGY === "BODY_BREAKOUT" && rcIndexSL > 0) {
                const bbSlHit = tradeDirection === "CE" ? price < rcIndexSL : price > rcIndexSL;
                if (bbSlHit) {
                    log("EXIT", { reason: "Candle-low SL hit", price, indexSL: rcIndexSL, pnl: profit.toFixed(0), symbol: tradeSymbol });
                    const totalQty = earlyQty + mainQty + pyramidQty;
                    try {
                        await (0, order_1.exitTrade)(tradeSymbol, totalQty);
                    }
                    catch (e) {
                        log("ORDER_REJECTED", { error: (e instanceof Error) ? e.message : (e?.message ?? JSON.stringify(e)) });
                        (0, order_1.stopTradingForDay)();
                        stopForDay = true;
                        await notifyCrash("Order rejected on SL exit");
                        return;
                    }
                    dailyPnL += profit * totalQty;
                    lastTradeProfit = profit > 0;
                    if (profit <= 0)
                        consecutiveLosses++;
                    else
                        consecutiveLosses = 0;
                    await notifyExit(price, profit, `Option SL hit @ ${candleSL}`);
                    (0, logger_1.logTrade)({ date: new Date().toISOString(), type: "BREAKOUT", direction: tradeDirection, entryPrice, exitPrice: price, pnl: profit, reasonEntry: "breakout", reasonExit: "option SL", aiScore: tradeAIScore, slippage: entrySlippage, duration: entryTime > 0 ? Math.round((Date.now() - entryTime) / 1000) : 0 });
                    entryTime = 0;
                    entrySlippage = 0;
                    tradeAIScore = 0;
                    candleSL = 0;
                    rcIndexSL = 0;
                    clearTradeState();
                    activeTrade = false;
                    trendMode = false;
                    trailActivated = false;
                    mainEntryDone = false;
                    earlyEntryDone = false;
                    pyramidDone = false;
                    pyramidQty = 0;
                    tradeDirection = null;
                    return;
                }
            }
            // ── Hard SL backstop ──
            if (profit <= -DAILY_LOSS_CAP) {
                log("EXIT", { reason: "Hard SL hit", pnl: profit.toFixed(0), symbol: tradeSymbol });
                const totalQty = earlyQty + mainQty + pyramidQty;
                try {
                    await (0, order_1.exitTrade)(tradeSymbol, totalQty);
                }
                catch (e) {
                    log("ORDER_REJECTED", { error: (e instanceof Error) ? e.message : (e?.message ?? JSON.stringify(e)) });
                    (0, order_1.stopTradingForDay)();
                    stopForDay = true;
                    await notifyCrash("Order rejected on SL exit");
                    return;
                }
                dailyPnL += profit * totalQty;
                lastTradeProfit = false;
                consecutiveLosses++;
                await notifyExit(price, profit, "Hard SL hit");
                (0, logger_1.logTrade)({ date: new Date().toISOString(), type: "BREAKOUT", direction: tradeDirection, entryPrice, exitPrice: price, pnl: profit, reasonEntry: "breakout", reasonExit: "hard SL", aiScore: tradeAIScore, slippage: entrySlippage, duration: entryTime > 0 ? Math.round((Date.now() - entryTime) / 1000) : 0 });
                entryTime = 0;
                entrySlippage = 0;
                tradeAIScore = 0;
                candleSL = 0;
                clearTradeState();
                activeTrade = false;
                trendMode = false;
                trailActivated = false;
                mainEntryDone = false;
                earlyEntryDone = false;
                pyramidDone = false;
                pyramidQty = 0;
                tradeDirection = null;
                rcTrade2Active = false;
                rcIndexSL = 0;
                stopForDay = true;
                return;
            }
            return;
        }
        // ── Guard: skip entry on first cycle after state restore ──
        if (justRestored) {
            justRestored = false;
            log("SKIP_CYCLE", { reason: "justRestored" });
            return;
        }
        // ══════════════════════════════════════════════════════════════════════════
        //  RC_CONFIRM STRATEGY — entry logic
        //  Step 1: breakout seen → wait for reversal candle
        //  Step 2: RC formed → enter Trade 1 at RC close, SL = RC low/high
        // ══════════════════════════════════════════════════════════════════════════
        if (ACTIVE_STRATEGY === "RC_CONFIRM" && !mainEntryDone && newCandleCompleted) {
            if (!rcWaiting && signal) {
                // Breakout candle just completed — DON'T enter yet
                rcWaiting = true;
                rcBreakoutDir = signal;
                log("RC_BREAKOUT_SEEN", { direction: signal, margin: breakoutMargin, note: "Waiting for reversal candle" });
                return;
            }
            if (rcWaiting && rcBreakoutDir) {
                // Reversal candle just closed — ENTER in OPPOSITE direction (the reversal)
                const dir = rcBreakoutDir === "CE" ? "PE" : "CE";
                rcWaiting = false;
                rcBreakoutDir = null;
                rcTrade2Active = false;
                // SL: for PE trade = RC candle HIGH (if price goes back above = reversal failed)
                //     for CE trade = RC candle LOW  (if price drops back below = reversal failed)
                const rcSL = dir === "CE" ? candle.low : candle.high;
                const freshPrice = await (0, market_1.getCurrentPrice)();
                try {
                    tradeSymbol = await Promise.race([
                        (0, market_1.getBestOptionSymbol)(dir),
                        new Promise((_, rej) => setTimeout(() => rej(new Error("getBestOptionSymbol timeout")), 10000))
                    ]);
                }
                catch (e) {
                    log("OPTION_SELECT_FAIL", { error: String(e) });
                    return;
                }
                mainQty = TOTAL_QTY;
                tradeDirection = dir;
                entryPrice = freshPrice;
                mainEntryDone = true;
                entryTime = Date.now();
                rcIndexSL = rcSL;
                let optionLTP = 0;
                try {
                    optionLTP = await (0, market_1.getOptionLTP)(tradeSymbol);
                }
                catch (_) { }
                candleSL = optionLTP > 0 ? optionLTP - 100 : 0;
                log("ENTRY", { type: "RC_TRADE1", symbol: tradeSymbol, price: freshPrice, indexSL: rcIndexSL, optionSL: candleSL, rcHigh: candle.high, rcLow: candle.low });
                try {
                    tradeInProgress = true;
                    const orderResult = await (0, order_1.placeTrade)(tradeSymbol, freshPrice, mainQty);
                    tradeInProgress = false;
                    if (!orderResult || orderResult.status !== "COMPLETE" || orderResult.filled_quantity <= 0) {
                        mainEntryDone = false;
                        log("ORDER_NOT_FILLED", { orderResult });
                        return;
                    }
                }
                catch (e) {
                    tradeInProgress = false;
                    mainEntryDone = false;
                    (0, order_1.stopTradingForDay)();
                    stopForDay = true;
                    return;
                }
                tradeCount++;
                activeTrade = true;
                saveTradeState();
                notifyEntry("RC_TRADE1", tradeSymbol, freshPrice, mainQty, dir, candle, candle.high, candle.low, price).catch(() => { });
                return;
            }
        }
        // ══════════════════════════════════════════════════════════════════════════
        //  BODY_BREAKOUT STRATEGY — original entry logic
        // ══════════════════════════════════════════════════════════════════════════
        if (ACTIVE_STRATEGY === "BODY_BREAKOUT" && !mainEntryDone && signal && (newCandleCompleted || justSeeded)) {
            const freshPrice = await (0, market_1.getCurrentPrice)();
            const slip = Math.abs(freshPrice - price);
            mainQty = TOTAL_QTY;
            tradeDirection = signal;
            // getBestOptionSymbol can hang on getInstruments("NFO") — wrap with 10s timeout
            try {
                tradeSymbol = await Promise.race([
                    (0, market_1.getBestOptionSymbol)(signal),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("getBestOptionSymbol timeout")), 10000))
                ]);
            }
            catch (e) {
                log("OPTION_SELECT_FAIL", { error: e instanceof Error ? e.message : String(e) });
                return; // skip this cycle, retry next
            }
            entryPrice = freshPrice;
            mainEntryDone = true;
            entryTime = Date.now();
            entrySlippage = slip;
            tradeAIScore = 1.0;
            // Candle-low SL: SL = breakout candle's low (CE) or high (PE) on the index
            rcIndexSL = signal === "CE" ? candle.low : candle.high;
            candleSL = 0;
            log("ENTRY", { type: "BODY_BREAKOUT", symbol: tradeSymbol, price: freshPrice, slippage: slip.toFixed(0), prevBodyHigh, prevBodyLow, indexSL: rcIndexSL });
            try {
                tradeInProgress = true;
                const orderResult = await (0, order_1.placeTrade)(tradeSymbol, freshPrice, mainQty);
                if (!orderResult || orderResult.status !== "COMPLETE" || orderResult.filled_quantity <= 0) {
                    tradeInProgress = false;
                    mainEntryDone = false;
                    log("ORDER_NOT_FILLED", { orderResult });
                    return;
                }
                tradeInProgress = false;
            }
            catch (e) {
                tradeInProgress = false;
                mainEntryDone = false;
                log("ORDER_REJECTED", { error: (e instanceof Error) ? e.message : (e?.message ?? JSON.stringify(e)) });
                (0, order_1.stopTradingForDay)();
                stopForDay = true;
                return;
            }
            // ── Save state BEFORE Telegram so restart doesn't re-enter if notify hangs ──
            tradeCount++;
            activeTrade = true;
            saveTradeState();
            // Telegram notify — fire-and-forget with catch so it never blocks the loop
            notifyEntry("BREAKOUT", tradeSymbol, freshPrice, mainQty, signal, candle, bodyHigh, bodyLow, price).catch(e => log("NOTIFY_FAIL", { error: e instanceof Error ? e.message : String(e) }));
        }
    }
    catch (err) {
        log("ERROR", { message: err?.message ?? String(err) });
        // Swallow Telegram errors to avoid double-crash when notifier itself is down
        try {
            await notifyCrash(err?.message ?? String(err));
        }
        catch (_) { }
    }
}
// --- Pre-Start Config Screen ---
function printConfigSummary(cfg) {
    const stratName = ACTIVE_STRATEGY === "RC_CONFIRM"
        ? "RC Confirm (wait for reversal candle, max 2 trades)"
        : ACTIVE_STRATEGY === "ITM_HOLD"
            ? "ITM Hold (BB signal → ITM monthly option → hold multi-day)"
            : ACTIVE_STRATEGY === "HYBRID_REVERSE"
                ? "Hybrid Reverse (body breakout + C1-3 early exit + hybrid SL reverse)"
                : ACTIVE_STRATEGY === "DRISHTI_V1"
                    ? "DRISHTI V1 · LOCK10 (BankNifty Futures, candle-close SL=100, TRAIL_GAP=10)"
                    : "Body Breakout (direct entry on candle close)";
    console.log("===== BOT CONFIG =====");
    console.log(`Mode: ${cfg.mode}`);
    console.log(`Strategy: ${stratName}`);
    if (ACTIVE_STRATEGY === "RC_CONFIRM") {
        console.log(`  Trade 1: Enter at reversal candle close | SL = RC low/high`);
        console.log(`  Trade 2: If T1 SL hit → trend trade opposite | SL = that candle's low/high`);
    }
    else if (ACTIVE_STRATEGY === "ITM_HOLD") {
        const itm = cfg.itmHold ?? {};
        console.log(`  Strike:  ITM${itm.strikeOffset ?? 1000} monthly (delta ~0.8)`);
        console.log(`  Hold:    ${itm.holdDays ?? 3} calendar days | SL buffer: ${itm.slBuffer ?? 50} pts beyond candle wick`);
        console.log(`  Min DTE: ${itm.minDTE ?? 15} days to monthly expiry required at entry`);
        console.log(`  Max concurrent positions: ${itm.maxConcurrent ?? 2} (~Rs ${((itm.strikeOffset ?? 1000) > 500 ? 42 : 35)}k capital each)`);
        console.log(`  Backtest: +Rs 2.86L/yr (single leg) | Win: 29% | R:R: 4.21 | 38/23 +/- months`);
    }
    else if (ACTIVE_STRATEGY === "HYBRID_REVERSE") {
        console.log(`  Signal : close > prevBodyHigh + 25 (CE) | close < prevBodyLow − 25 (PE)`);
        console.log(`  Entry  : signal candle close | SL: ±100 pts`);
        console.log(`  C1-3   : if next candle closes 3+ pts against → early exit −3 pts`);
        console.log(`  Re-entry: same-dir if refHigh broken (after EarlyExit or wick SL)`);
        console.log(`  Reverse: SL candle body closes PAST SL → enter opposite direction`);
        console.log(`  Backtest (5yr): +₹7,04,406 | MaxDD −₹11,451 | Win 55%`);
    }
    else {
        console.log(`  Min breakout margin: ${MIN_BREAKOUT_MARGIN} pts`);
    }
    console.log(`SL: index-price based (RC strategy) | option-premium based (breakout)`);
    console.log(`Premium range: ${cfg.optionSelection.minPremium}–${cfg.optionSelection.maxPremium}`);
    console.log(String.fromCharCode(68,97,105,108,121,32,108,111,115,115,32,99,97,112,58,32,68,73,83,65,66,76,69,68));
    console.log("");
}
async function preStartPrompt() {
    printConfigSummary(config_1.config);
    // Skip prompt when running non-interactively (PM2, CI, piped stdin)
    if (!process.stdin.isTTY || process.env.PM2_HOME || process.env.NODE_ENV === 'production') {
        console.log("Non-interactive mode — auto-starting bot...");
        return true;
    }
    const rl = readline_1.default.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question("Start bot? (Y/N): ", (answer) => {
            rl.close();
            if (answer.trim().toUpperCase() === "Y")
                resolve(true);
            else
                resolve(false);
        });
    });
}
(async () => {
    const ok = await preStartPrompt();
    if (!ok) {
        console.log("Bot start cancelled by user.");
        process.exit(0);
    }
    console.log("[DEBUG] User confirmed start. Initializing bot...");
    try {
        // Restore any saved trade state from a previous run (same day only)
        const restored = restoreTradeState();
        if (restored) {
            justRestored = true;
            if (activeTrade && tradeSymbol && entryPrice > 0)
                console.log(`\n⚠️  Recovered open trade from previous session: ${tradeSymbol} (${tradeDirection}) entry @ ${entryPrice}`);
            else
                console.log(`\n✅ Restored today's closed-trade stats; no open trade recovered.`);
            // ── CRITICAL: seed hybridState so intrabar SL monitoring works immediately ──
            if (activeTrade && tradeDirection && entryPrice > 0) {
                const restoredSL = tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100;
                hybridState.inTrade = true;
                hybridState.dir = tradeDirection;
                hybridState.entry = entryPrice;
                hybridState.sl = restoredSL;
                console.log(`✅  hybridState seeded: dir=${tradeDirection} entry=${entryPrice} sl=${restoredSL}`);
            }
            // ── CRITICAL: resume Drishti LTP monitor if trade was active ──
            if (ACTIVE_STRATEGY === "DRISHTI_V1" && DrishtiState.inTrade && activeTrade && entryPrice > 0) {
                log("STATE_RESTORE", { action: "Resuming Drishti LTP monitor after restart", entry: entryPrice, dir: DrishtiState.dir });
                startDrishtiLTPMonitor(); // resume real-risk guard after restart
            }
        }
        // Restore ITM_HOLD positions (multi-day, survive across restarts)
        if (ACTIVE_STRATEGY === "ITM_HOLD") {
            restoreITMHoldState();
            if (itmHoldPositions.length) {
                console.log(`\n⚠️  Recovered ${itmHoldPositions.length} ITM Hold position(s): ${itmHoldPositions.map(p => p.symbol).join(", ")}`);
            }
        }
        // On startup, sync broker state
        await syncBotWithBroker();
        // Every 5 minutes, sync broker state
        brokerSyncInterval = setInterval(() => {
            syncBotWithBroker().catch(e => log("BROKER_SYNC_INTERVAL_ERR", { error: e?.message ?? String(e) }));
        }, 5 * 60 * 1000);
        // Load prev day + today candles at startup for DRISHTI_V1 (handles mid-day restarts) (handles mid-day restarts)
        if (ACTIVE_STRATEGY === "DRISHTI_V1") {
            // Load both prev-day AND today candles together so prev candles are available when evaluating backfill signals
            Promise.all([(0, market_1.getPrevDayCandles)(), (0, market_1.getTodayCandles)()]).then(([prevCandles, candles]) => {
                drishtiPrevDayCandles = prevCandles;
                log("DRISHTI_PREV_DAY_LOADED", { at: "startup", count: prevCandles.length });
                if (candles.length > 0) {
                    // Filter out the currently-forming candle: only include candles whose 15-min window has fully closed
                    const nowMs = Date.now();
                    const closedCandles = candles.filter((c, i) => {
                        if (i < candles.length - 1)
                            return true; // all except last are definitely closed
                        const candleStart = new Date(c.date).getTime();
                        return nowMs >= candleStart + 15 * 60000; // last candle: check its window has passed
                    });
                    // Skip first candle (the 9:15-9:30 "seed" candle).
                    // In normal operation: the first candle seen by runDrishtiBot is SEEDED (key stored, NOT pushed).
                    // The first actual push is the 9:30-9:45 candle → drishtiTodayCandles[0].
                    // getTodayCandles() returns ALL candles including 9:15, causing an off-by-one shift in indices.
                    // This breaks lastExitIdx (saved as 3 = entry candle pre-restart, but now points to wrong candle).
                    const backfillCandles = closedCandles.slice(1);
                    drishtiTodayCandles = backfillCandles.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close }));
                    // Set last candle key to the last FULLY CLOSED backfill candle to avoid re-processing
                    if (backfillCandles.length > 0) {
                        const last = backfillCandles[backfillCandles.length - 1];
                        // Use raw date string (same format as running code uses for candleKey) — avoids
                        // String(new Date(...)) which produces a different locale-based string and causes
                        // the last backfill candle to be re-processed as "new" on the first runDrishtiBot cycle
                        drishtiLastCandleKey = last.date ? String(last.date) : `${last.high}_${last.low}`;
                    }
                    else if (closedCandles.length > 0) {
                        // Only the seed candle closed so far — seed on it (no push)
                        const seed = closedCandles[0];
                        drishtiLastCandleKey = seed.date ? String(seed.date) : `${seed.high}_${seed.low}`;
                    }
                    // Load persisted candle log from today (if any) — preserves live evaluations across restarts
                    const _istNow = new Date(new Date().getTime() + 5.5 * 3600000);
                    const _todayDate = _istNow.toISOString().slice(0, 10);
                    let _savedLog = [];
                    try {
                        const _saved = JSON.parse(fs_1.default.readFileSync('candle-log.json', 'utf-8'));
                        if (_saved.date === _todayDate && Array.isArray(_saved.log))
                            _savedLog = _saved.log;
                    }
                    catch (_e) { }
                    // Re-evaluate strategy on each historical candle to accurately show missed entry opportunities
                    DrishtiCandleLog = [];
                    // Mini state to track first-entry vs re-entry across the backfill loop
                    let _bfFirstDone = DrishtiState.firstDone && DrishtiState.lastExitIdx >= 0;
                    let _bfLastExitIdx = _bfFirstDone ? Math.min(DrishtiState.lastExitIdx, 0) : -1;
                    let _bfLastExitDir = _bfFirstDone ? DrishtiState.lastExitDir : null;
                    for (let _i = 0; _i < backfillCandles.length; _i++) {
                        const _c = backfillCandles[_i];
                        const _bp = (_c.high - _c.low) > 0 ? Math.round((_c.close - _c.open) / (_c.high - _c.low) * 100) : 0;
                        const _d = new Date(_c.date);
                        const _ist = new Date(_d.getTime() + 5.5 * 3600000);
                        const _t = _ist.getUTCHours().toString().padStart(2, '0') + ':' + _ist.getUTCMinutes().toString().padStart(2, '0');
                        // Use saved live entry if available (preserves correct offline status from before restart)
                        const _saved = _savedLog.find(s => s.idx === _i);
                        if (_saved) {
                            DrishtiCandleLog.push(_saved);
                            // Update mini state from saved live entry so subsequent candles stay in sync
                            if (_saved.signal) {
                                _bfFirstDone = true;
                                _bfLastExitIdx = _saved.idx;
                                _bfLastExitDir = _saved.signal;
                            }
                        }
                        else {
                            // Re-run strategy on partial candle array (same as if bot had been live up to this point)
                            const _partial = backfillCandles.slice(0, _i + 1).map(x => ({ open: x.open, high: x.high, low: x.low, close: x.close }));
                            let _evalSig = null;
                            if (_bfFirstDone && _bfLastExitIdx >= 0 && _bfLastExitDir) {
                                // Re-entry mode: use findDrishtiReEntry so re-entry candles are correctly flagged
                                const _re = (0, drishti_strategy_1.findDrishtiReEntry)(_partial, _bfLastExitIdx, _bfLastExitDir, true);
                                if (_re && _re.idx === _i)
                                    _evalSig = { idx: _re.idx, side: _re.side, ctx: 'INSIDE', reason: _re.reason };
                            }
                            else if (!_bfFirstDone) {
                                _evalSig = (0, drishti_strategy_1.findDrishtiEntry)(_partial, drishtiPrevDayCandles);
                            }
                            if (_evalSig) {
                                _bfFirstDone = true;
                                _bfLastExitIdx = _i;
                                _bfLastExitDir = _evalSig.side;
                            }
                            // EOD candles (15:15+) are never traded — don't flag them as "bot offline"
                            const _isEodCandle = _t >= '15:15';
                            DrishtiCandleLog.push({
                                idx: _i,
                                time: _t,
                                close: _c.close,
                                bodyPct: _bp,
                                signal: _evalSig ? _evalSig.side : null,
                                reason: _evalSig ? _evalSig.reason : 'no_signal',
                                offline: _isEodCandle ? undefined : true, // undefined = not offline (EOD), true = truly missed
                            });
                        }
                    }
                    const _missedEntries = DrishtiCandleLog.filter(e => e.offline && e.signal);
                    if (_missedEntries.length > 0) {
                        _missedEntries.forEach(e => {
                            log("🚨 MISSED_ENTRY", { candle: `C${e.idx}`, time: e.time, direction: e.signal, reason: e.reason, note: "Bot was offline when this signal occurred" });
                        });
                    }
                    // Reconstruct lastExitIdx/Dir when missing — covers two cases:
                    //   (a) Old state files that didn't save drishtiState at all
                    //   (b) Sync fallback in restoreTradeState() set firstDone=true but left lastExitIdx=-1
                    // Must check lastExitIdx<0 (not !firstDone) because the sync fallback already set firstDone=true,
                    // causing the old !firstDone condition to always be false and skipping reconstruction entirely.
                    if (DrishtiState.lastExitIdx < 0 && tradeCount > 0) {
                        DrishtiState.firstDone = true;
                        // Reconstruct lastExitDir/Idx from candle log — use last candle that had a signal
                        const _lastSignal = [...DrishtiCandleLog].reverse().find(e => e.signal);
                        if (_lastSignal) {
                            DrishtiState.lastExitDir = _lastSignal.signal;
                            DrishtiState.lastExitIdx = _lastSignal.idx; // conservative: exit was on or after this
                            DrishtiState.lastExitPts = DrishtiState.lastExitPts > 0 ? DrishtiState.lastExitPts : 0;
                            log("STATE_RESTORE", { action: "DrishtiState reconstructed from candle log", firstDone: true, lastExitDir: DrishtiState.lastExitDir, lastExitIdx: DrishtiState.lastExitIdx });
                        }
                    }
                    // Only silence TG and mark "done" if this is a FRESH LATE START (no trade happened today)
                    // For mid-day RESTARTS (tradeCount > 0), bot was already running — continue normally
                    if (backfillCandles.length > 0 && tradeCount === 0) {
                        const _missedSig = _missedEntries.find(e => e.idx === 0);
                        sendTelegram(`⛔ *Done for today* — Bot came online after 9:30 AM\n` +
                            (_missedSig
                                ? `🚨 MISSED signal: ${_missedSig.signal} at C1 (${_missedSig.reason.replace(/_/g, ' ')})\n`
                                : `📭 No signal at C1 — entry window already passed\n`) +
                            `No new trades will be placed today.\nNext opportunity: tomorrow 9:30 AM`).catch(() => { });
                        _tgSilenced = true; // silence all further Telegram for today
                        stopForDay = true; // prevent silent trade entries on late start
                    }
                    else if (backfillCandles.length > 0 && tradeCount > 0) {
                        log("DRISHTI_RESTART_MID_DAY", { candles: backfillCandles.length, tradeCount, firstDone: DrishtiState.firstDone, lastExitDir: DrishtiState.lastExitDir });
                    }
                    log("DRISHTI_TODAY_BACKFILL", { at: "startup", count: backfillCandles.length, raw: candles.length, missedEntries: _missedEntries.length });
                }
            }).catch(e => {
                // Before 9:15 AM the market isn't open — API returning no data is expected, not an error
                const _preIst2 = new Date(new Date().getTime() + 5.5 * 3600000);
                const _h = _preIst2.getUTCHours(), _m = _preIst2.getUTCMinutes();
                if (_h < 9 || (_h === 9 && _m < 15)) {
                    log("DRISHTI_STARTUP_PRE_MARKET", { note: "Started before 9:15 AM — no today candles yet, normal" });
                }
                else {
                    log("DRISHTI_TODAY_BACKFILL_FAIL", { at: "startup", error: e instanceof Error ? e.message : JSON.stringify(e) });
                }
            });
        }
        log("BOT_START", { message: "Waiting for market hours (9:25 IST)..." });
        // Register trading intervals FIRST — Telegram must never block the bot from starting
        setInterval(() => {
            // Skip entirely on weekends (IST) — markets are closed, historical-candle API
            // returns empty data, and polling every cycle just spams CANDLE_MONITOR_ERR /
            // RUN_BOT_UNCAUGHT ("Not enough candle data") and burns restarts for nothing.
            const _istDay = new Date(Date.now() + 5.5 * 3600000).getUTCDay();
            if (_istDay === 0 || _istDay === 6)
                return;
            // Write heartbeat immediately so dashboards know the bot is alive even when flat/idle
            try {
                const _inTrade = !!(mainEntryDone || earlyEntryDone);
                const _unrealised = _inTrade && entryPrice > 0 && lastKnownPrice > 0
                    ? parseFloat((tradeDirection === "CE" ? lastKnownPrice - entryPrice : entryPrice - lastKnownPrice).toFixed(0))
                    : 0;
                fs_1.default.writeFileSync("bot-heartbeat.json", JSON.stringify({
                    at: new Date().toISOString(),
                    status: _inTrade ? `IN TRADE · ${tradeDirection}` : "RUNNING · FLAT",
                    dailyPnL,
                    dailyRealRs,
                    optInTrade, optDir, optSymbol,
                    optEntryPrem,
                    optDailyPts: parseFloat(optDailyPts.toFixed(1)),
                    optDailyRs,
                    optWins, optLosses,
                    optRecentTrades: optRecentTrades.slice(-10),
                    unrealisedPnL: _unrealised,
                    tradeCount, qty: config_1.config.quantity,
                    slPts: ACTIVE_STRATEGY === "DRISHTI_V1" ? 150 : (config_1.config.tradeManagement?.stopLossPoints ?? 100),
                    dailyCapPts: null, strategy: ACTIVE_STRATEGY,
                    mode: config_1.config.mode,
                    inTrade: _inTrade,
                    direction: tradeDirection ?? null,
                    entryPrice: entryPrice || null,
                    livePrice: lastKnownPrice || null,
                    symbol: tradeSymbol || null,
                    entryPremium: _inTrade ? entryPremium || null : null,
                    livePremium: _inTrade ? lastOptionLTP || null : null,
                    sl: _inTrade ? (ACTIVE_STRATEGY === "DRISHTI_V1"
                        ? (tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100)
                        : (tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100)) : null,
                    drishtiPrevDayHigh: ACTIVE_STRATEGY === "DRISHTI_V1" && drishtiPrevDayCandles.length > 0 ? Math.max(...drishtiPrevDayCandles.map((c) => c.high)) : undefined,
                    drishtiPrevDayLow: ACTIVE_STRATEGY === "DRISHTI_V1" && drishtiPrevDayCandles.length > 0 ? Math.min(...drishtiPrevDayCandles.map((c) => c.low)) : undefined,
                    DrishtiCandles: ACTIVE_STRATEGY === "DRISHTI_V1" ? drishtiTodayCandles.length : undefined,
                    DrishtiCandleLog: ACTIVE_STRATEGY === "DRISHTI_V1" ? DrishtiCandleLog : undefined,
                    ...tt1030HeartbeatFields(),
                }));
            }
            catch (_) { }
            if (runBotActive) {
                log("SKIP_CYCLE", { reason: "prevCycleStillRunning" });
                return;
            }
            runBotActive = true;
            const timeout = setTimeout(() => {
                runBotActive = false;
                log("RUN_BOT_TIMEOUT", { message: "runBot exceeded 12s — cycle skipped" });
            }, 12000);
            runBot()
                .then(() => { tokenAlertLastSent = 0; }) // reset on successful cycle so tomorrow's expiry re-alerts
                .catch(err => {
                log("RUN_BOT_UNCAUGHT", { error: err?.message ?? String(err) });
                console.error("[runBot error caught]", err?.message ?? err);
                // ── One-time token-expired alert (fires once, not every 15s) ──────
                const errMsg = (err?.message ?? String(err)).toLowerCase();
                const isTokenErr = errMsg.includes("incorrect") && (errMsg.includes("api_key") || errMsg.includes("access_token"));
                if (isTokenErr && !_tokenAutoRefreshing) {
                    _tokenAutoRefreshing = true;
                    tokenAlertLastSent = Date.now();
                    const _ist = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
                    sendTelegram(`🔄 Token expired detected at ${_ist} IST — auto-refreshing now...`).catch(() => { });
                    // Spawn auto_token.js independently — it will update .env and restart the bot via PM2
                    (0, child_process_1.exec)('node /home/ubuntu/trading-bot/auto_token.js >> /home/ubuntu/trading-bot/logs/auto_token.log 2>&1', (_execErr) => {
                        // On success: auto_token.js restarts the bot via PM2 — this process will be killed
                        // On failure: auto_token.js already sent its own 🚨 FAILED telegram with login URL
                        // Flag stays true — no infinite retry loop. User must act manually (restart bot after fixing).
                    });
                }
                // Still write heartbeat so dashboards know the bot is alive
                try {
                    const _inTrade2 = !!(mainEntryDone || earlyEntryDone);
                    const _unrealised2 = _inTrade2 && entryPrice > 0 && lastKnownPrice > 0
                        ? parseFloat((tradeDirection === "CE" ? lastKnownPrice - entryPrice : entryPrice - lastKnownPrice).toFixed(0))
                        : 0;
                    fs_1.default.writeFileSync("bot-heartbeat.json", JSON.stringify({
                        at: new Date().toISOString(),
                        status: _inTrade2 ? `IN TRADE · ${tradeDirection}` : "RUNNING · FLAT",
                        dailyPnL,
                        unrealisedPnL: _unrealised2,
                        tradeCount, qty: config_1.config.quantity,
                        slPts: ACTIVE_STRATEGY === "DRISHTI_V1" ? 150 : (config_1.config.tradeManagement?.stopLossPoints ?? 100),
                        dailyCapPts: null, mode: config_1.config.mode,
                        inTrade: _inTrade2,
                        direction: tradeDirection ?? null,
                        entryPrice: entryPrice || null,
                        livePrice: lastKnownPrice || null,
                        symbol: tradeSymbol || null,
                        entryPremium: _inTrade2 ? entryPremium || null : null,
                        livePremium: _inTrade2 ? lastOptionLTP || null : null,
                        sl: _inTrade2 ? (tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100) : null,
                        ...tt1030HeartbeatFields(),
                    }));
                }
                catch (_) { }
            })
                .finally(() => { clearTimeout(timeout); runBotActive = false; });
        }, 15000);
        // Candle breakout monitor — runs every 15s, independent of trading logic
        setInterval(() => { monitorCandleBreakouts().catch(() => { }); }, 15000);
        // Fire-and-forget startup Telegram — failure must not prevent trading
        if (restored && activeTrade && tradeDirection && entryPrice > 0) {
            // ── Restart with ACTIVE trade — show position details
            const slLevel = tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100;
            const entryIST = entryTime > 0
                ? new Date(entryTime).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })
                : "–";
            const waitReEntryInfo = hybridState.waitReEntry && hybridState.dir && hybridState.refHigh > 0
                ? `\n⏳ Waiting RE-ENTRY · ${hybridState.dir} | Trigger: close ${hybridState.dir === "CE" ? ">" : "<"} ${hybridState.refHigh}`
                : ``;
            sendTelegram(`♻️ *Bot Restarted* — trade restored\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `📌 Position: *${tradeDirection}* | ${tradeSymbol}\n` +
                `Entry: *${entryPrice}* (@ ${entryIST})\n` +
                `SL: *${slLevel}* (−150 pts)${waitReEntryInfo}\n` +
                `Strategy: DRISHTI V1 · LOCK10 | Mode: ${config_1.config.mode.toUpperCase()} | Qty: ${config_1.config.quantity}\n` +
                `⏰ ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}\n` +
                `🔑 [Refresh Token](https://139-59-18-52.nip.io/login)`).catch(e => console.error("[Telegram restart notify failed]", e?.message ?? e));
        }
        else if (restored) {
            // ── Restart with no active trade — show flat state with day's P&L so far
            const waitReEntryInfo = hybridState.waitReEntry && hybridState.dir && hybridState.refHigh > 0
                ? `\n⏳ Waiting RE-ENTRY · ${hybridState.dir} | Trigger: close ${hybridState.dir === "CE" ? ">" : "<"} ${hybridState.refHigh}`
                : ``;
            sendTelegram(`♻️ *Bot Restarted* — No Trade\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `Position: FLAT${waitReEntryInfo}\n` +
                `Day P&L: ${dailyPnL >= 0 ? "+" : ""}${dailyPnL.toFixed(2)} pts | Trades: ${tradeCount}/5\n` +
                `Mode: ${config_1.config.mode.toUpperCase()} | Qty: ${config_1.config.quantity}\n` +
                `[Token Refresh](https://139-59-18-52.nip.io/login)`).catch(e => console.error("[Telegram restart notify failed]", e?.message ?? e));
        }
        else {
            // ── Fresh start — send full Bot Started message
            sendTelegram(`🟢 *BANKNIFTY Bot Started*\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `Strategy: *DRISHTI V1 · LOCK10*\n` +
                `Mode: *${config_1.config.mode.toUpperCase()}* | Qty: ${config_1.config.quantity}\n` +
                `SL: 100 pts | Trail: LOCK10 (peak−10)\n` +
                `⏰ ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}\n` +
                `🔑 [Refresh Token if needed](https://139-59-18-52.nip.io/login)`).catch(e => console.error("[Telegram startup notify failed]", e?.message ?? e));
            // ── Startup token validation ───────────────────────────────────
            setTimeout(() => {
                const _d = new Date();
                const _dIst = new Date(_d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
                if (_dIst.getDay() === 0 || _dIst.getDay() === 6)
                    return;
                kite.getProfile().then(() => {
                    console.log("[startup] ✅ Token OK");
                }).catch((startupErr) => {
                    const _sm = (startupErr?.message ?? String(startupErr)).toLowerCase();
                    if (_sm.includes("incorrect") || _sm.includes("access_token") || _sm.includes("api_key")) {
                        console.error("[startup] ❌ TOKEN INVALID at startup!");
                        const _sist = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
                        tokenAlertLastSent = Date.now();
                        sendTelegram(`🔴 *TOKEN EXPIRED — Action Required*\n` +
                            `━━━━━━━━━━━━━━━━━━━━━\n` +
                            `Zerodha access token is invalid or expired.\n` +
                            `*Bot is not trading until you re-authenticate.*\n\n` +
                            `➡ Open this link, log in & paste the redirect URL:\n` +
                            `https://139-59-18-52.nip.io/login\n\n` +
                            `⏰ Detected at: ${_sist} IST`).catch(() => { });
                    }
                });
            }, 8000);
        }
    }
    catch (e) {
        console.error("[DEBUG] Error during bot startup:", e);
    }
})();
// ─── Crash Handlers ──────────────────────────────────────
process.on("uncaughtException", async (err) => {
    console.error("\n💥 UNCAUGHT EXCEPTION:", err.message);
    log("CRASH", { error: err.message });
    await gracefulShutdown(`Uncaught exception: ${err.message}`, true);
    process.exit(1);
});
process.on("unhandledRejection", async (reason) => {
    const msg = reason?.message ?? String(reason);
    console.error("\n⚠️  UNHANDLED REJECTION (non-fatal):", msg);
    log("UNHANDLED_REJECTION", { error: msg });
    // Do NOT exit — setInterval callbacks and Telegram failures must not kill the bot.
    // Suppress known noisy/expected errors — only alert for genuinely unexpected ones.
    const isSuppressed = msg.includes("telegram") || msg.includes("ETELEGRAM") || msg.includes("sendTelegram")
        || msg.includes("api_key") || msg.includes("access_token") || msg.includes("Incorrect")
        || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("ENOTFOUND")
        || msg.includes("timeout") || msg.includes("socket hang up");
    if (!isSuppressed) {
        try {
            await sendTelegram(`⚠️ *Non-fatal error*\n${msg.slice(0, 200)}`);
        }
        catch (_) { }
    }
});
// ─── Graceful shutdown helper ─────────────────────────
async function gracefulShutdown(reason, isError = false) {
    if (!isMarketHours()) { console.log(String.fromCharCode(83,72,85,84,68,79,87,78,95,78,79,95,84,71,95,65,70,84,69,82,95,72,79,85,82,83) + String.fromCharCode(58,32) + reason); return; }
    const pnlSign = dailyPnL >= 0 ? "+" : "";
    const emoji = isError ? "💥" : "🔴";
    try {
        // Do NOT clearTradeState() here — preserve state so the bot can resume on restart
        // without re-entering an already-open trade. State is only cleared after a real exit.
        await sendTelegram(`${emoji} *Bot Stopped*\nReason: ${reason}\nPnL: ${pnlSign}${dailyPnL.toFixed(0)} pts\nTrades: ${tradeCount}/${MAX_TRADES}`);
    }
    catch (_) { }
}
// Ctrl+C — manual stop
process.on("SIGINT", async () => {
    console.log("\n\n🛑 Manual stop (Ctrl+C)...");
    await gracefulShutdown("Manual stop (Ctrl+C)");
    process.exit(0);
});
// SIGTERM — killed by Task Manager / system / pm2 stop
// Only notify Telegram during market hours (SIGTERM = pm2 restart during deployment outside market = no alert needed)
process.on("SIGTERM", async () => {
    console.log("\n\n🛑 Process terminated (SIGTERM)...");
    if (isMarketHours()) {
        await gracefulShutdown("Process terminated (SIGTERM)", true);
    }
    process.exit(0);
});
// SIGHUP — terminal closed / SSH disconnect
process.on("SIGHUP", async () => {
    console.log("\n\n🛑 Terminal disconnected (SIGHUP)...");
    await gracefulShutdown("Terminal closed / disconnected (SIGHUP)", true);
    process.exit(0);
});
// EOD summary notification (example: call at 15:16 IST)
function validateTradeLogs() {
    let trades = 0, wins = 0, losses = 0, netPnL = 0, maxDrawdown = 0;
    let drawdown = 0;
    let openTrades = 0;
    try {
        const file = "trades.json";
        if (fs_1.default.existsSync(file)) {
            const data = JSON.parse(fs_1.default.readFileSync(file, "utf-8"));
            for (const t of data) {
                trades++;
                if (t.pnl > 0)
                    wins++;
                else
                    losses++;
                netPnL += t.pnl;
                drawdown += t.pnl;
                if (drawdown < maxDrawdown)
                    maxDrawdown = drawdown;
                if (!t.exitPrice)
                    openTrades++;
            }
            if (openTrades > 0) {
                console.warn(`${openTrades} open trades found in logs!`);
            }
        }
    }
    catch (e) {
        console.error("Error validating trade logs:", e);
    }
    return { trades, wins, losses, netPnL, maxDrawdown };
}
async function sendEODSummary() {
    const { trades, wins, losses, netPnL, maxDrawdown } = validateTradeLogs();
    await notifySummary(trades, wins, losses, netPnL, maxDrawdown);
}
// ── Daily P&L Log — saves backtest simulation + actual P&L to daily-pnl-log.json ──────────────
async function saveDailyPnlLog() {
    try {
        const istNow = new Date(new Date().getTime() + 5.5 * 3600000);
        const todayDate = istNow.toISOString().slice(0, 10);
        let candleLog = [];
        try {
            const saved = JSON.parse(fs_1.default.readFileSync('candle-log.json', 'utf-8'));
            if (saved.date === todayDate && Array.isArray(saved.log))
                candleLog = saved.log;
        }
        catch (_) { }
        // 2. Simulate DRISHTI V1 LOCK50 candle-close SL on today's candles
        let signal = 'FLAT', btPnl = 0, btNote = 'No signal today';
        const c0 = candleLog.find(e => e.idx === 0 && e.signal);
        if (c0 && c0.signal) {
            const dir = c0.signal;
            signal = dir;
            const entryPx = c0.close;
            let sl = dir === 'CE' ? entryPx - 100 : entryPx + 100;
            let exited = false;
            const rest = candleLog.filter(e => e.idx > 0).sort((a, b) => a.idx - b.idx);
            for (const c of rest) {
                const gain = dir === 'CE' ? c.close - entryPx : entryPx - c.close;
                if (gain >= 50) { // LOCK50: lock SL to breakeven once +50 pts achieved
                    if (dir === 'CE' && sl < entryPx)
                        sl = entryPx;
                    if (dir === 'PE' && sl > entryPx)
                        sl = entryPx;
                }
                const slHit = dir === 'CE' ? c.close <= sl : c.close >= sl;
                if (slHit) {
                    btPnl = Math.round(dir === 'CE' ? sl - entryPx : entryPx - sl);
                    btNote = `SL hit C${c.idx} (${c.time})`;
                    exited = true;
                    break;
                }
            }
            if (!exited && rest.length > 0) {
                const last = rest[rest.length - 1];
                btPnl = Math.round(dir === 'CE' ? last.close - entryPx : entryPx - last.close);
                btNote = `EOD exit C${last.idx} (${last.time})`;
            }
        }
        // 3. Actual trades P&L from trades.json
        let actualPnl = 0, actualTrades = 0;
        try {
            const allTrades = JSON.parse(fs_1.default.readFileSync('trades.json', 'utf-8'));
            const todayTrades = allTrades.filter((t) => (t.date || '').startsWith(todayDate) && t.exitPrice > 0);
            actualTrades = todayTrades.length;
            actualPnl = Math.round(todayTrades.reduce((s, t) => s + (t.pnl || 0), 0));
        }
        catch (_) { }
        // 4. Build record and upsert into daily-pnl-log.json
        const note = c0?.offline ? 'Bot offline' : signal === 'FLAT' ? 'No signal' : '';
        const record = { date: todayDate, signal, reason: c0?.reason ?? 'no_signal', btPnl, btNote, actualPnl, actualTrades, note };
        const logFile = 'daily-pnl-log.json';
        let logData = [];
        try {
            logData = JSON.parse(fs_1.default.readFileSync(logFile, 'utf-8'));
        }
        catch (_) { }
        const existing = logData.findIndex((e) => e.date === todayDate);
        if (existing >= 0)
            logData[existing] = record;
        else
            logData.push(record);
        logData.sort((a, b) => a.date < b.date ? -1 : 1);
        fs_1.default.writeFileSync(logFile, JSON.stringify(logData, null, 2));
        log('DAILY_PNL_SAVED', { date: todayDate, signal, btPnl, actualPnl, note });
    }
    catch (e) {
        log('DAILY_PNL_SAVE_FAIL', { error: e?.message ?? String(e) });
    }
}
// Helper for direction alignment
function isDirectionAligned(fiveMin, fifteenMin) {
    return (fiveMin.close > fiveMin.open && fifteenMin.close > fifteenMin.open) ||
        (fiveMin.close < fiveMin.open && fifteenMin.close < fifteenMin.open);
}
// --- MANDATORY TELEGRAM NOTIFICATIONS ---
// 2. BOT STOP (EOD or crash)
async function notifyBotStop(reason) {
    const _pnlSign = dailyPnL >= 0 ? "+" : "";
    await sendTelegram(`🔴 *BANKNIFTY Bot Stopped*\nReason: ${reason}\nDay P&L: *${_pnlSign}${dailyPnL} pts* | Trades: ${tradeCount}/${MAX_TRADES}\nTime: ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}`);
}
// 3. ENTRY ALERT
async function notifyEntry(type, symbol, entry, qty, direction, candle, bodyHigh, bodyLow, livePrice) {
    const broke = direction === "CE"
        ? (livePrice > candle.high ? `Full High broken (prev high: ${candle.high})` : `Body High broken (prev body high: ${bodyHigh})`)
        : (livePrice < candle.low ? `Full Low broken (prev low: ${candle.low})` : `Body Low broken (prev body low: ${bodyLow})`);
    const colour = candle.close >= candle.open ? "🟢 Bullish" : "🔴 Bearish";
    const slippage = Math.abs(livePrice - entry).toFixed(1);
    await sendTelegram(`📥 *ENTRY EXECUTED — ${direction}*\n` +
        `Symbol: \`${symbol}\`\n` +
        `Entry price: *${entry}*  |  Qty: ${qty}\n` +
        `Slippage: ${slippage} pts\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📊 *Trigger: ${broke}*\n` +
        `Prev candle: O:${candle.open} H:${candle.high} L:${candle.low} C:${candle.close} ${colour}\n` +
        `Body: ${bodyLow} – ${bodyHigh}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `Type: ${type}  |  Live: ${livePrice}`);
}
// 4. EXIT ALERT
async function notifyExit(exit, pnl, reason, ctx) {
    const qty = ctx?.qty ?? config_1.config.quantity;
    const rupeesEst = Math.round(Math.abs(pnl) * qty); // futures: delta=1.0, 1 pt = ₹1 per unit
    const pnlSign = pnl >= 0 ? "+" : "−";
    const rsSign = pnl >= 0 ? "+" : "−";
    const emoji = pnl >= 0 ? "✅" : pnl > -10 ? "⚠️" : "❌";
    const dirLine = ctx?.dir ? `Direction: *${ctx.dir}*\n` : "";
    const entryLine = ctx?.entry ? `Index entry: ${ctx.entry}\n` : "";
    const symLine = ctx?.symbol ? `Symbol: \`${ctx.symbol}\`\n` : "";
    const dailySign = dailyPnL >= 0 ? "+" : "";
    await sendTelegram(`${emoji} *◆ DRISHTI V1 · LOCK10 — EXIT → ${reason}*\n` +
        symLine + dirLine + entryLine +
        `Index exit: ${exit}\n` +
        `Index P&L: *${pnlSign}${Math.abs(pnl)} pts*\n` +
        `₹ est: *${rsSign}₹${rupeesEst.toLocaleString("en-IN")}* (futures ${qty}qty)\n` +
        `━━━━━━━━━━━━━━\n` +
        `Day P&L so far: ${dailySign}${dailyPnL} pts`);
}
// 5. SL HIT ALERT
async function notifySLHit(loss) {
    await sendTelegram(`⛔ *STOP LOSS HIT*\nLoss: ${loss} pts\nTrade closed`);
}
// 6. DAILY LOSS LIMIT HIT
async function notifyDailyLoss(loss) {
    await sendTelegram(`🚨 *DAILY LOSS LIMIT HIT*\nLoss: *${loss} pts* | Trades: ${tradeCount}/${MAX_TRADES}\nTrading stopped for today`);
}
// 7. CRASH/ERROR ALERT
async function notifyCrash(reason) {
    const _pnlSign = dailyPnL >= 0 ? "+" : "";
    await sendTelegram(`💥 *BOT CRASHED*\nReason: ${reason}\nDay P&L: ${_pnlSign}${dailyPnL} pts | Trades: ${tradeCount}/${MAX_TRADES}\nRestart required`);
}
// 8. DAILY SUMMARY (EOD)
async function notifySummary(trades, wins, losses, netPnL, maxDrawdown) {
    const winPct = trades > 0 ? Math.round((wins / trades) * 100) : 0;
    const qty = config_1.config.quantity;
    const rupeesEst = Math.round(Math.abs(netPnL) * qty); // futures: delta=1.0
    const pnlSign = netPnL >= 0 ? "+" : "−";
    const rsSign = netPnL >= 0 ? "+" : "−";
    const ddRupees = Math.round(Math.abs(maxDrawdown) * qty);
    const emoji = netPnL > 0 ? "🟢" : netPnL < 0 ? "🔴" : "⚪";
    const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
    await sendTelegram(`📊 *DAILY SUMMARY — DRISHTI V1 · LOCK10*\n` +
        `${today}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${emoji} Index P&L: *${pnlSign}${Math.abs(netPnL)} pts*\n` +
        `₹ est: *${rsSign}₹${rupeesEst.toLocaleString("en-IN")}* (futures ${qty}qty)\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Trades: ${trades} | W: ${wins} L: ${losses} | Win: *${winPct}%*\n` +
        `Max DD: −${Math.abs(maxDrawdown)} pts ≈ −₹${ddRupees.toLocaleString("en-IN")}\n` +
        `Mode: ${config_1.config.mode.toUpperCase()} | Qty: ${qty}`);
}
