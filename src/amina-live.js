"use strict";
/**
 * amina-live.ts — AMINA 100 BankNifty Options Strategy (Live Engine)
 *
 * Strategy Rules:
 *   Entry  : Rolling C1+C2 scan. C2 breaks C1 level → enter at C2 close.
 *            Else wait C3+ to break max(C1,C2) level. First signal only.
 *   T1 SL  : 60 pts fixed. Once peak ≥ 60 → trail SL = entry + max(0, peak − 100)
 *            SL ratchets in profit direction only, never reverses.
 *   T1 Tgt : NONE — hold to 3:14 PM EOD exit
 *   Re-entry: Always taken opposite direction when T1 SL hit. Same trail rules.
 *
 * 5.5yr backtest: Rs 19,25,692 | 1,325 days | Win rate 56.6% | MaxDD Rs 17,290
 * Max loss/day: Rs -1,800 (T1 -60 + RE -60 = -120 pts × Rs 15)
 *
 * Deployed: 2026-05-17 — AMINA 100 (C2 early entry + trail 100pts behind peak)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAmina = startAmina;
const fs_1 = __importDefault(require("fs"));
const market_1 = require("./market");
const order_1 = require("./order");
const notifier_1 = require("./notifier");
const config_1 = require("./config");
const kiteconnect_1 = require("kiteconnect");
// ── Kite (for 15-min candle fetch) ───────────────────────────────────────────
const kite = new kiteconnect_1.KiteConnect({ api_key: config_1.config.apiKey });
kite.setAccessToken(config_1.config.accessToken);
const INSTRUMENT_TOKEN = config_1.config.instrument.token; // 260105
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const SL_INITIAL = 60; // fixed SL for both T1 and RE
const TRAIL_GAP = 100; // trail SL = entry + max(0, peak − TRAIL_GAP)
const RS_PER_PT = 15; // 30 qty × 0.5 delta × Rs 1/pt
// ── State ────────────────────────────────────────────────────────────────────
const STATE_FILE = "amina-state.json";
let state = makeState();
let _lastKey = "";
function makeState() {
    return {
        date: "", phase: "SCANNING", dayOpen: 0,
        t1Dir: null, t1Entry: 0, t1Symbol: "", t1EntryTime: "", t1Pts: 0, t1BreakLevel: 0, t1Rule: "", t1Peak: 0,
        t1EntryLTP: 0, t1Rs: 0,
        slClose: 0, slTime: "",
        reDir: null, reEntry: 0, reSymbol: "", reEntryTime: "", rePts: 0, rePeak: 0,
        reEntryLTP: 0, reRs: 0,
        dayPts: 0, dayRs: 0, lastCandleKey: "",
    };
}
function saveState() {
    try {
        fs_1.default.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    }
    catch (_) { }
}
function loadState() {
    try {
        if (!fs_1.default.existsSync(STATE_FILE))
            return;
        const s = JSON.parse(fs_1.default.readFileSync(STATE_FILE, "utf-8"));
        if (s.date === todayIST()) {
            state = s;
            _lastKey = s.lastCandleKey;
        }
    }
    catch (_) { }
}
// ── Append completed trade record to trades.json (for dashboard) ──────────────
function appendTrade(tradeObj) {
    try {
        const TRADES_FILE = "trades.json";
        const existing = fs_1.default.existsSync(TRADES_FILE)
            ? JSON.parse(fs_1.default.readFileSync(TRADES_FILE, "utf-8"))
            : [];
        if (!Array.isArray(existing))
            return;
        existing.push(tradeObj);
        fs_1.default.writeFileSync(TRADES_FILE, JSON.stringify(existing, null, 2));
    }
    catch (e) {
        log("APPEND_TRADE_ERROR", { error: e instanceof Error ? e.message : String(e) });
    }
}
function entryToExitSecs(entryTimeIST) {
    if (!entryTimeIST)
        return 0;
    try {
        return Math.round((Date.now() - new Date(entryTimeIST.replace(" ", "T") + "+05:30").getTime()) / 1000);
    }
    catch (_) { return 0; }
}
// ── Candle scan log (amina-candle-log.json) ───────────────────────────────────
const CANDLE_LOG_FILE = "amina-candle-log.json";
function resetCandleLog() {
    try { fs_1.default.writeFileSync(CANDLE_LOG_FILE, "[]"); } catch (_) { }
}
function appendCandleLog(event) {
    try {
        const existing = fs_1.default.existsSync(CANDLE_LOG_FILE)
            ? JSON.parse(fs_1.default.readFileSync(CANDLE_LOG_FILE, "utf-8"))
            : [];
        if (!Array.isArray(existing))
            return;
        existing.push(event);
        fs_1.default.writeFileSync(CANDLE_LOG_FILE, JSON.stringify(existing));
    }
    catch (e) { log("CANDLE_LOG_ERROR", { e: String(e) }); }
}
// Returns scan status for the latest candle (what was being watched, did it break?)
function getCandleScanStatus(cs) {
    if (cs.length < 2)
        return null;
    const n = cs.length;
    const latest = cs[n - 1];
    for (let i = 0; i < n - 1; i++) {
        const ca = cs[i], cb = cs[i + 1];
        let sig, c2level, c3level, rule;
        if (ca.bull === cb.bull) {
            sig = ca.bull ? "CE" : "PE";
            c2level = sig === "CE" ? ca.high : ca.low;
            c3level = sig === "CE" ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
            rule = "A";
        }
        else if (cb.body_size > ca.body_size) {
            sig = cb.bull ? "CE" : "PE";
            c2level = sig === "CE" ? ca.body_high : ca.body_low;
            c3level = sig === "CE" ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
            rule = "B";
        }
        else
            continue;
        const isC2check = (i + 1 === n - 1);
        const watchLevel = isC2check ? c2level : c3level;
        const broke = sig === "CE" ? latest.close > watchLevel : latest.close < watchLevel;
        const dist = sig === "CE" ? latest.close - watchLevel : watchLevel - latest.close;
        return {
            sig, rule, isC2check,
            watchLevel: parseFloat(watchLevel.toFixed(1)),
            c2level: parseFloat(c2level.toFixed(1)),
            c3level: parseFloat(c3level.toFixed(1)),
            broke,
            dist: parseFloat(Math.abs(dist).toFixed(1)),
            candleNum: n,
            open: parseFloat(latest.open.toFixed(1)),
            high: parseFloat(latest.high.toFixed(1)),
            low: parseFloat(latest.low.toFixed(1)),
            close: parseFloat(latest.close.toFixed(1)),
        };
    }
    return null;
}
// ── IST helpers ───────────────────────────────────────────────────────────────
function nowIST() {
    return new Date(Date.now() + IST_OFFSET_MS)
        .toISOString().replace("T", " ").slice(0, 19);
}
function todayIST() {
    return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
function istHM() {
    const d = new Date(Date.now() + IST_OFFSET_MS);
    return { h: d.getUTCHours(), m: d.getUTCMinutes() };
}
function isMarketOpen() {
    const { h, m } = istHM();
    return (h > 9 || (h === 9 && m >= 15)) && (h < 15 || (h === 15 && m <= 30));
}

// ── Daily candle log & EOD report ────────────────────────────────────────────
let _dailyCandleLog = [];
let _eodReportSent = false;
let _expectedTrade = null; // { sig, px, bl, rule, entryIdx, entryCandle, exitPts, exitReason, reSig, rePx, reExitPts, reExitReason }

function logCandle(candle, candleNum, phase) {
  const d = candle.key ? new Date(candle.key) : new Date(candle.date);
  const ist = d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
  const entry = {
    num: candleNum,
    time: ist,
    open: +candle.open.toFixed(0),
    high: +candle.high.toFixed(0),
    low:  +candle.low.toFixed(0),
    close:+candle.close.toFixed(0),
    colour: candle.close >= candle.open ? 'bull' : 'bear',
    phase,
    t1Pts: +(state.t1Pts||0).toFixed(0),
    rePts: +(state.rePts||0).toFixed(0),
    dayPts:+(state.dayPts||0).toFixed(0),
  };
  _dailyCandleLog.push(entry);
  try {
    const fs2 = require('fs');
    if (!fs2.existsSync('logs')) fs2.mkdirSync('logs');
    fs2.writeFileSync('logs/candles-' + todayIST() + '.json', JSON.stringify(_dailyCandleLog, null, 2));
  } catch(_) {}
}

async function sendEODReport() {
  if (_eodReportSent) return;
  _eodReportSent = true;
  const today = todayIST();
  const rs = state.dayRs || Math.round((state.dayPts||0) * RS_PER_PT);
  const pSign = (state.dayPts||0) >= 0 ? '+' : '';
  const rSign = rs >= 0 ? '+' : '';

  // ─── ACTUAL trade lines ───────────────────────────────────────────────────
  const actualLines = [];
  if (state.t1Dir) {
    const s = (state.t1Pts||0) >= 0 ? '+' : '';
    actualLines.push(`T1: ${state.t1Dir} entry @ ${(state.t1Entry||0).toFixed(0)}  [${state.t1EntryTime||'?'}]  →  ${s}${(state.t1Pts||0).toFixed(0)} pts`);
  }
  if (state.reDir) {
    const s = (state.rePts||0) >= 0 ? '+' : '';
    actualLines.push(`RE: ${state.reDir} entry @ ${(state.reEntry||0).toFixed(0)}  [${state.reEntryTime||'?'}]  →  ${s}${(state.rePts||0).toFixed(0)} pts`);
  }
  if (!state.t1Dir) actualLines.push('No trade — flat day');

  // ─── EXPECTED trade lines ─────────────────────────────────────────────────
  const expLines = [];
  if (_expectedTrade) {
    const _e = _expectedTrade;
    const s1 = (_e.exitPts||0) >= 0 ? '+' : '';
    expLines.push(`T1 (${_e.rule}): ${_e.sig} @ ${_e.entryPx.toFixed(0)}  [C${_e.entryIdx+1} ${_e.entryTime}]  →  ${s1}${(_e.exitPts||0).toFixed(0)} pts  (${_e.exitReason||'open'})`);
    if (_e.reSig) {
      const s2 = (_e.reExitPts||0) >= 0 ? '+' : '';
      const reTime = _e.entryTime; // RE starts from same candle exit
      expLines.push(`RE: ${_e.reSig} @ ${(_e.rePx||0).toFixed(0)}  →  ${s2}${(_e.reExitPts||0).toFixed(0)} pts  (${_e.reExitReason||'open'})`);
    }
  } else {
    expLines.push('No signal found today');
  }

  const expDayPts = (_expectedTrade)
    ? ((_expectedTrade.exitPts||0) + (_expectedTrade.reExitPts||0))
    : 0;
  const expRs = Math.round(expDayPts * RS_PER_PT);
  const eSign = expDayPts >= 0 ? '+' : '';
  const erSign = expRs >= 0 ? '+' : '';

  // ─── Candle table ─────────────────────────────────────────────────────────
  const rows = _dailyCandleLog.map(c => {
    const col = c.colour === 'bull' ? 'B' : 'b';
    let tag = '';
    if (state.t1EntryTime && c.time === (state.t1EntryTime||'').substring(0,5)) tag += ` ← ACTUAL T1 ${state.t1Dir}`;
    if (state.reEntryTime && c.time === (state.reEntryTime||'').substring(0,5)) tag += ` ← ACTUAL RE ${state.reDir}`;
    if (_expectedTrade && c.num === (_expectedTrade.entryIdx+1)) tag += ` ← EXP T1 ${_expectedTrade.sig}`;
    return `C${String(c.num).padStart(2,' ')} ${c.time} ${col} ${String(c.open).padStart(6)} ${String(c.close).padStart(6)}${tag}`;
  }).join('\n');

  // ─── Compose message ──────────────────────────────────────────────────────
  const SEP = '─────────────────────────';
  const msg =
    `📊 *AMINA 100 — EOD Report* | ${today}\n`
  + `${SEP}\n`
  + `*🎯 EXPECTED (Backtest Signal):*\n`
  + expLines.join('\n') + '\n'
  + `Expected Day: *${eSign}${expDayPts.toFixed(0)} pts*  (₹${erSign}${expRs.toLocaleString('en-IN')})\n`
  + `${SEP}\n`
  + `*✅ ACTUAL (Bot Traded):*\n`
  + actualLines.join('\n') + '\n'
  + `Actual Day: *${pSign}${(state.dayPts||0).toFixed(0)} pts*  (₹${rSign}${rs.toLocaleString('en-IN')})\n`
  + `${SEP}\n`
  + `\`\`\`\n`
  + `C#  Time  D   Open   Close\n`
  + `─────────────────────────\n`
  + rows + '\n'
  + `\`\`\``;

  await notifier_1.sendTelegram(msg).catch(() => {});
}

function isEOD() {
    const { h, m } = istHM();
    return h > 15 || (h === 15 && m >= 14);
}
// ── Logger ────────────────────────────────────────────────────────────────────
function log(event, d = {}) {
    const ts = nowIST();
    const msg = Object.entries(d).map(([k, v]) => `${k}:${v}`).join(" | ");
    console.log(`[AMINA 100][${ts}] ${event}${msg ? "  " + msg : ""}`);
    try {
        fs_1.default.appendFileSync("amina.log", JSON.stringify({ time: ts, event, ...d }) + "\n");
    }
    catch (_) { }
}
// ── Heartbeat ─────────────────────────────────────────────────────────────────
function writeHeartbeat(price) {
    const inTrade = state.phase === "IN_T1" || state.phase === "IN_RE";
    const dir = state.phase === "IN_T1" ? state.t1Dir : state.phase === "IN_RE" ? state.reDir : null;
    const entry = state.phase === "IN_T1" ? state.t1Entry : state.phase === "IN_RE" ? state.reEntry : 0;
    const sym = state.phase === "IN_T1" ? state.t1Symbol : state.phase === "IN_RE" ? state.reSymbol : "";
    const livePnl = inTrade && entry ? (dir === "CE" ? price - entry : entry - price) : state.dayPts;
    const t1TrailLocked = Math.max(0, state.t1Peak - TRAIL_GAP);
    const t1EffSLHb = state.t1Peak >= SL_INITIAL ? t1TrailLocked : -SL_INITIAL;
    const reTrailLocked = Math.max(0, state.rePeak - TRAIL_GAP);
    const reEffSLHb = state.rePeak >= SL_INITIAL ? reTrailLocked : -SL_INITIAL;
    const t1SlPx = state.t1Dir ? (state.t1Dir === "CE" ? state.t1Entry + t1EffSLHb : state.t1Entry - t1EffSLHb) : null;
    const reSlPx = state.reDir ? (state.reDir === "CE" ? state.reEntry + reEffSLHb : state.reEntry - reEffSLHb) : null;
    const slLevel = state.phase === "IN_T1" ? t1SlPx : state.phase === "IN_RE" ? reSlPx : null;
    try {
        fs_1.default.writeFileSync("bot-heartbeat.json", JSON.stringify({
            at: new Date().toISOString(),
            strategy: "AMINA 100",
            status: phaseLabel(),
            price,
            livePrice: price,
            // Position
            inTrade,
            direction: dir,
            entryPrice: entry || null,
            tradeSymbol: sym || null,
            sl: slLevel,
            // T1 info
            t1Dir: state.t1Dir,
            t1Entry: state.t1Entry || null,
            t1Symbol: state.t1Symbol || null,
            t1SL: t1SlPx,
            t1BreakLevel: state.t1BreakLevel || null,
            t1Rule: state.t1Rule || null,
            t1Pts: state.t1Pts,
            // Re-entry info
            reDir: state.reDir,
            reEntry: state.reEntry || null,
            reSymbol: state.reSymbol || null,
            reSL: reSlPx,
            rePts: state.rePts,
            // Day stats
            dayOpen: state.dayOpen || null,
            dayPts: state.dayPts,
            dayRs: state.dayRs,
            dailyPnL: parseFloat(livePnl.toFixed(0)),
            unrealisedPnL: inTrade ? parseFloat(livePnl.toFixed(0)) : 0,
            tradeCount: (state.t1Dir ? 1 : 0) + (state.reDir ? 1 : 0),
            qty: config_1.config.quantity,
            slPts: SL_INITIAL,
            mode: config_1.config.mode,
        }));
    }
    catch (_) { }
}
function phaseLabel() {
    switch (state.phase) {
        case "SCANNING": return "SCANNING — FLAT";
        case "IN_T1": return `IN T1 — ${state.t1Dir}`;
        case "IN_RE": return `IN RE-ENTRY — ${state.reDir}`;
        case "DONE": return "DONE FOR DAY";
        default: return "UNKNOWN";
    }
}
function enrich(c) {
    const bull = c.close >= c.open;
    const body_high = Math.max(c.open, c.close);
    const body_low = Math.min(c.open, c.close);
    return {
        open: c.open, high: c.high, low: c.low, close: c.close,
        body_high, body_low, body_size: body_high - body_low,
        bull,
        key: c.date ? String(c.date) : `${c.open}_${c.high}_${c.low}_${c.close}`,
    };
}
// ── Fetch all today's completed 15-min candles ────────────────────────────────
async function getToday15MinCandles() {
    const nowMs = Date.now() + IST_OFFSET_MS;
    const d = new Date(nowMs);
    const midnight = nowMs
        - (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) * 1000
        - d.getUTCMilliseconds();
    const dayStart = midnight + (9 * 60 + 15) * 60000; // 9:15 AM IST
    const fmt = (ms) => {
        const dd = new Date(ms);
        const p = (n) => String(n).padStart(2, "0");
        return `${dd.getUTCFullYear()}-${p(dd.getUTCMonth() + 1)}-${p(dd.getUTCDate())} `
            + `${p(dd.getUTCHours())}:${p(dd.getUTCMinutes())}:${p(dd.getUTCSeconds())}`;
    };
    try {
        const data = await kite.getHistoricalData(INSTRUMENT_TOKEN, "15minute", fmt(dayStart), fmt(nowMs - 60000), // exclude the candle currently forming
        false);
        const nowReal = Date.now();
        // Filter out any candle that hasn't completed yet (candle start + 15min > now)
        return (data ?? []).filter(c => {
            try { return new Date(c.date).getTime() + 15 * 60 * 1000 < nowReal; }
            catch (_) { return true; }
        }).map(enrich);
    }
    catch (e) {
        log("CANDLE_FETCH_ERR", { error: e instanceof Error ? e.message : String(e) });
        return [];
    }
}
// ── Rolling entry scan (C2 early entry + C3+ fallback) ───────────────────────
function rollingEntryScan(cs) {
    for (let i = 0; i < cs.length - 1; i++) {
        const ca = cs[i], cb = cs[i + 1];
        let sig = null;
        let c2level = 0, c3level = 0, rule = "";
        if (ca.bull === cb.bull) {
            // Rule A — same color pair
            sig = ca.bull ? "CE" : "PE";
            c2level = sig === "CE" ? ca.high : ca.low;
            c3level = sig === "CE" ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
            rule = "A";
        }
        else if (cb.body_size > ca.body_size) {
            // Rule B — opposite color, C2 body > C1 body
            sig = cb.bull ? "CE" : "PE";
            c2level = sig === "CE" ? ca.body_high : ca.body_low;
            c3level = sig === "CE"
                ? Math.max(ca.body_high, cb.body_high)
                : Math.min(ca.body_low, cb.body_low);
            rule = "B";
        }
        else {
            continue; // skip this pair
        }
        // C2 early entry: does C2 itself break the C1 level?
        if (sig === "CE" && cb.close > c2level)
            return { sig, px: cb.close, bl: c2level, rule: rule + "(C2)", pairIdx: i, entryIdx: i + 1 };
        if (sig === "PE" && cb.close < c2level)
            return { sig, px: cb.close, bl: c2level, rule: rule + "(C2)", pairIdx: i, entryIdx: i + 1 };
        // C3+ fallback: wait for breakout above max(C1, C2) level
        for (let j = i + 2; j < cs.length; j++) {
            const c = cs[j];
            if (sig === "CE" && c.close > c3level)
                return { sig, px: c.close, bl: c3level, rule, pairIdx: i, entryIdx: j };
            if (sig === "PE" && c.close < c3level)
                return { sig, px: c.close, bl: c3level, rule, pairIdx: i, entryIdx: j };
        }
    }
    return null;
}
// ── Exit helper ───────────────────────────────────────────────────────────────
async function doExit(label, symbol) {
    try {
        await (0, order_1.exitTrade)(symbol, config_1.config.quantity);
        log(`EXIT_${label}`, { symbol, qty: config_1.config.quantity });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`EXIT_${label}_FAIL`, { error: msg });
        await (0, notifier_1.sendTelegram)(`❌ *AMINA 100 — EXIT FAILED* (${label})\n\`${symbol}\`\nManual exit required!\n${msg}`).catch(() => { });
    }
}
// ── EOD square-off ────────────────────────────────────────────────────────────
async function eodSquareOff(price) {
    if (state.phase !== "IN_T1" && state.phase !== "IN_RE")
        return;
    const isT1 = state.phase === "IN_T1";
    const dir = isT1 ? state.t1Dir : state.reDir;
    const entry = isT1 ? state.t1Entry : state.reEntry;
    const sym = isT1 ? state.t1Symbol : state.reSymbol;
    const entryLTP = isT1 ? state.t1EntryLTP : state.reEntryLTP;
    const pts = dir === "CE" ? price - entry : entry - price;
    const eodExitLTP = entryLTP > 0 ? await (0, market_1.getOptionLTP)(sym).catch(() => 0) : 0;
    const tradeRs = eodExitLTP > 0
        ? Math.round((eodExitLTP - entryLTP) * config_1.config.quantity)
        : Math.round(pts * RS_PER_PT);
    await doExit("EOD", sym);
    if (isT1) {
        state.t1Pts = pts;
        state.t1Rs = tradeRs;
    }
    else {
        state.rePts = pts;
        state.reRs = tradeRs;
    }
    state.dayPts = state.t1Pts + state.rePts;
    state.dayRs = state.t1Rs + state.reRs;
    state.phase = "DONE";
    saveState();
    sendEODReport().catch(() => {});
    log("EOD_EXIT", { dir, entry: entry.toFixed(0), exit: price.toFixed(0), pts: pts.toFixed(0), tradeRs, dayPts: state.dayPts, dayRs: state.dayRs });
    appendTrade({
        date: isT1 ? state.t1EntryTime : state.reEntryTime,
        direction: dir,
        symbol: sym,
        entryPrice: entry,
        exitPrice: price,
        premiumEntry: entryLTP,
        premiumExit: eodExitLTP,
        pnl: pts,
        pnlRs: tradeRs,
        reasonExit: "EOD",
        duration: entryToExitSecs(isT1 ? state.t1EntryTime : state.reEntryTime),
    });
    await (0, notifier_1.sendTelegram)(`🔔 *AMINA 100 — EOD EXIT*\n`
        + `Dir: ${dir} | Entry: ${entry.toFixed(0)} | Exit: ${price.toFixed(0)}\n`
        + `Trade P&L: *${pts >= 0 ? "+" : ""}${pts.toFixed(0)} pts* (Rs ${tradeRs >= 0 ? "+" : ""}${tradeRs})\n`
        + `Day Total: *${state.dayPts >= 0 ? "+" : ""}${state.dayPts.toFixed(0)} pts`
        + ` (Rs ${state.dayRs >= 0 ? "+" : ""}${state.dayRs})*`).catch(() => { });
}
// ── Strategy tick (called every 30s) ──────────────────────────────────────────
async function tick() {
    try {
        if (!isMarketOpen()) {
            // Write pre-market heartbeat so dashboard shows Bot Online
            try {
                const fs = require('fs');
                const existing = fs.existsSync('bot-heartbeat.json') ? JSON.parse(fs.readFileSync('bot-heartbeat.json','utf-8')) : {};
                fs.writeFileSync('bot-heartbeat.json', JSON.stringify({
                    ...existing,
                    at: new Date().toISOString(),
                    strategy: 'AMINA 100',
                    status: 'Pre-Market — Waiting',
                    mode: process.env.MODE || 'PAPER',
                    qty: parseInt(process.env.QUANTITY || '30'),
                    slPts: 60,
                    inTrade: false,
                    tradeCount: state.tradeCount || 0,
                }));
            } catch(_) {}
            return;
        }
        const price = await (0, market_1.getCurrentPrice)();
        if (!price || price <= 0)
            return;
        // EOD square-off
        if (isEOD()) {
            await eodSquareOff(price);
            return;
        }
        const candles = await getToday15MinCandles();
        if (!candles.length)
            return;
        // Init day open
        if (!state.dayOpen) {
            try {
                state.dayOpen = await (0, market_1.getDayOpenPrice)();
            }
            catch (_) {
                state.dayOpen = candles[0].open;
            }
            state.date = todayIST();
            log("DAY_OPEN", { open: state.dayOpen });
            saveState();
        }
        writeHeartbeat(price);
        const latest = candles[candles.length - 1];
        const isNewCandle = latest.key !== _lastKey;
        if (!isNewCandle)
            return;
        _lastKey = latest.key;
        state.lastCandleKey = latest.key;
        log("NEW_CANDLE", { key: latest.key, o: latest.open, h: latest.high, l: latest.low, c: latest.close, phase: state.phase });
        logCandle(latest, candles.length, state.phase);
        // Simulate expected trade P&L each candle
        if (_expectedTrade) {
          const _ep = _expectedTrade;
          if (_ep.open && _ep.exitPts === null) {
            const _pts = _ep.sig === "CE" ? latest.close - _ep.entryPx : _ep.entryPx - latest.close;
            if (_pts > _ep.peak) _ep.peak = _pts;
            _ep.effSL = _ep.peak >= 60 ? Math.max(0, _ep.peak - 100) : -60;
            if (_pts <= _ep.effSL || isEOD()) {
              _ep.exitPts = isEOD() ? _pts : _ep.effSL;
              _ep.exitReason = isEOD() ? "EOD" : (_ep.effSL > 0 ? "TRAIL" : "SL");
              _ep.open = false;
              // Auto RE-entry expected
              if (!isEOD() && _ep.exitReason !== "EOD") {
                _ep.reOpen = true;
                _ep.reSig = _ep.sig === "CE" ? "PE" : "CE";
                _ep.rePx = latest.close;
              }
            }
          } else if (_ep.reOpen && _ep.reExitPts === null && _ep.rePx) {
            const _rpts = _ep.reSig === "CE" ? latest.close - _ep.rePx : _ep.rePx - latest.close;
            if (_rpts > _ep.rePeak) _ep.rePeak = _rpts;
            _ep.reEffSL = _ep.rePeak >= 60 ? Math.max(0, _ep.rePeak - 100) : -60;
            if (_rpts <= _ep.reEffSL || isEOD()) {
              _ep.reExitPts = isEOD() ? _rpts : _ep.reEffSL;
              _ep.reExitReason = isEOD() ? "EOD" : (_ep.reEffSL > 0 ? "TRAIL" : "SL");
              _ep.reOpen = false;
            }
          }
        }
                        // --- 15-min candle Telegram update (same format as TICK TRAIL strategy) ---
        try {
          const _colour = latest.close >= latest.open ? '🟢 Bullish' : '🔴 Bearish';
          const _ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
          const SEP = '──────────────────';
          // helper: format pts with sign and colour emoji
          const _fmt = (p) => (p >= 0 ? '🟢 +' : '🔴 ') + p.toFixed(0) + ' pts';
          let _stratCtx = '';
          if (state.phase === 'IN_T1' && state.t1Entry) {
            const _unr = state.t1Dir === 'CE' ? price - state.t1Entry : state.t1Entry - price;
            const _unrS = _unr >= 0 ? '+' : '';
            const _slLvl = state.t1Dir === 'CE' ? (state.t1Entry - 60).toFixed(0) : (state.t1Entry + 60).toFixed(0);
            _stratCtx = `\n${SEP}\n` +
              `🟡 *AMINA 100 · ${state.t1Dir} In Trade*\n` +
              `Entry: ${state.t1Entry.toFixed(0)}  ·  SL: ${_slLvl}  (−60 pts)\n` +
              `T1 Unrealised: ${_fmt(_unr)}\n` +
              `Day: ${_fmt(state.dayPts + _unr)}`;
          } else if (state.phase === 'IN_RE' && state.reEntry) {
            const _unr = state.reDir === 'CE' ? price - state.reEntry : state.reEntry - price;
            const _unrS = _unr >= 0 ? '+' : '';
            const _slLvl = state.reDir === 'CE' ? (state.reEntry - 60).toFixed(0) : (state.reEntry + 60).toFixed(0);
            _stratCtx = `\n${SEP}\n` +
              `🟡 *AMINA 100 · ${state.reDir} Re-Entry*\n` +
              `Entry: ${state.reEntry.toFixed(0)}  ·  SL: ${_slLvl}  (−60 pts)\n` +
              `T1 Closed: ${_fmt(state.t1Pts)}\n` +
              `RE Unrealised: ${_fmt(_unr)}\n` +
              `Day: ${_fmt(state.t1Pts + _unr)}`;
          } else if (state.phase === 'DONE') {
            const _rs = state.dayRs || Math.round(state.dayPts * RS_PER_PT);
            const _reeLine = state.rePts !== 0 ? `\nRE: ${_fmt(state.rePts)}` : '';
            _stratCtx = `\n${SEP}\n` +
              `✅ *AMINA 100 · Done for Day*\n` +
              `T1: ${_fmt(state.t1Pts)}` + _reeLine + `\n` +
              `📈 *Day Total: ${state.dayPts >= 0 ? '+' : ''}${state.dayPts.toFixed(0)} pts*  (₹${_rs >= 0 ? '+' : ''}${_rs.toLocaleString('en-IN')})`;
          } else {
            // SCANNING - show C1 levels + any already-closed T1 P&L
            const _c1 = candles[0];
            let _watchLine = '';
            if (_c1) {
              const _ceT = (_c1.high).toFixed(0);
              const _peT = (_c1.low).toFixed(0);
              const _ceDist = Math.abs(price - _c1.high).toFixed(0);
              const _peDist = Math.abs(price - _c1.low).toFixed(0);
              const _ceInfo = price >= _c1.high ? '↑ ' + _ceDist + ' pts ahead' : _ceDist + ' pts away';
              const _peInfo = price <= _c1.low  ? '↑ ' + _peDist + ' pts ahead' : _peDist + ' pts away';
              _watchLine = `📍 CE ≥ *${_ceT}*  —  ${_ceInfo}\n` +
                           `📍 PE ≤ *${_peT}*  —  ${_peInfo}\n` +
                           `Live: *${price.toFixed(0)}*`;
            }
            // show T1 closed result if a trade already happened today
            const _t1line = state.t1Pts !== 0 ? `\nT1 Closed: ${_fmt(state.t1Pts)}` : '';
            _stratCtx = `\n${SEP}\n` +
              `🚦 *AMINA 100 · Scanning* (${candles.length} candle${candles.length > 1 ? 's' : ''})\n` +
              _watchLine +
              _t1line +
              `\nDay: ${_fmt(state.dayPts)}`;
          }
          await (0, notifier_1.sendTelegram)(
            `🕯 *15-Min Candle*  ${_ist}  ${_colour}\n` +
            `O: ${latest.open.toFixed(0)}  H: ${latest.high.toFixed(0)}  L: ${latest.low.toFixed(0)}  C: ${latest.close.toFixed(0)}` +
            _stratCtx +
            `\n${SEP}\n` +
            `[🔑 Token](https://139-59-18-52.nip.io/login)  ·  [📈 Dashboard](https://139-59-18-52.nip.io/signals)`
          ).catch(() => {});
          // Write lastCandle to heartbeat for dashboard watching card
          try {
            const _hbRaw = fs_1.default.existsSync('bot-heartbeat.json') ? fs_1.default.readFileSync('bot-heartbeat.json', 'utf-8') : '{}';
            const _hb = JSON.parse(_hbRaw);
            _hb.lastCandle = { open: latest.open, high: latest.high, low: latest.low, close: latest.close, colour: latest.close >= latest.open ? 'bull' : 'bear' };
            fs_1.default.writeFileSync('bot-heartbeat.json', JSON.stringify(_hb));
          } catch(_) {}
        } catch(_) {}
        // ── SCANNING ───────────────────────────────────────────────────────────────
        if (state.phase === "SCANNING") {
            const res = rollingEntryScan(candles);
            if (!res) {
                log("NO_SIGNAL", { candles: candles.length });
                const _scanSt = getCandleScanStatus(candles);
                if (_scanSt)
                    appendCandleLog({ type: "SCAN_MISS", time: nowIST(), ..._scanSt });
                return;
            }
            // Always record first signal found as the "expected" trade (for EOD report)
            if (!_expectedTrade && res) {
              const _ec = candles[res.entryIdx];
              _expectedTrade = {
                sig: res.sig, px: res.px, bl: res.bl, rule: res.rule,
                entryIdx: res.entryIdx,
                entryTime: _ec ? (() => { const _d = _ec.key ? new Date(_ec.key) : new Date(_ec.date); return _d.toLocaleString("en-IN",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hour12:false}); })() : "?",
                entryPx: res.px,
                peak: 0, effSL: -60,
                open: true, exitPts: null, exitReason: null,
                reOpen: false, reSig: null, rePx: null, rePeak: 0, reEffSL: -60,
                reExitPts: null, reExitReason: null
              };
            }
            // Signal must be triggered on the LATEST completed candle (otherwise already missed)
            if (res.entryIdx !== candles.length - 1) {
                log("PAST_SIGNAL_SKIP", { entryIdx: res.entryIdx, total: candles.length });
                return;
            }
            const symbol = await (0, market_1.getBestOptionSymbol)(res.sig);
            state.t1Dir = res.sig;
            state.t1Entry = res.px;
            state.t1Symbol = symbol;
            state.t1EntryTime = nowIST();
            state.t1BreakLevel = res.bl;
            state.t1Rule = res.rule;
            state.t1Peak = 0;
            state.phase = "IN_T1";
            saveState();
            await (0, order_1.placeTrade)(symbol, res.px, config_1.config.quantity);
            state.t1EntryLTP = await (0, market_1.getOptionLTP)(symbol).catch(() => 0);
            const slLevel = res.sig === "CE" ? res.px - SL_INITIAL : res.px + SL_INITIAL;
            log("T1_ENTRY", { sig: res.sig, entry: res.px.toFixed(0), bl: res.bl.toFixed(0), sl: slLevel.toFixed(0), rule: res.rule, symbol });
            appendCandleLog({
                type: "T1_ENTRY",
                time: state.t1EntryTime,
                dir: res.sig,
                index: parseFloat(res.px.toFixed(1)),
                symbol,
                premium: state.t1EntryLTP,
                sl: parseFloat(slLevel.toFixed(1)),
                breakLevel: parseFloat(res.bl.toFixed(1)),
                rule: res.rule,
                candleNum: candles.length,
            });
            await (0, notifier_1.sendTelegram)(`🎯 *AMINA 100 — T1 ENTRY*\n`
                + `Dir: *${res.sig}* | Rule ${res.rule} | BL: ${res.bl.toFixed(0)}\n`
                + `Entry: *${res.px.toFixed(0)}* | SL: ${slLevel.toFixed(0)} (−60 pts, trail)\n`
                + `Symbol: \`${symbol}\`\n`
                + `Day Open: ${state.dayOpen.toFixed(0)}`).catch(() => { });
        }
        // ── IN T1 ──────────────────────────────────────────────────────────────────
        else if (state.phase === "IN_T1") {
            const t1Pts = state.t1Dir === "CE"
                ? latest.close - state.t1Entry
                : state.t1Entry - latest.close;
            state.t1Pts = t1Pts;
            // Trail SL: once peak ≥ 60 → SL = entry + max(0, peak − 100). Never reverses.
            if (t1Pts > state.t1Peak)
                state.t1Peak = t1Pts;
            const t1EffSL = state.t1Peak >= SL_INITIAL ? Math.max(0, state.t1Peak - TRAIL_GAP) : -SL_INITIAL;
            if (t1Pts <= t1EffSL) {
                // SL hit — use actual candle-close pts for P&L, not capped at SL
                state.t1Pts = t1Pts;
                const t1ExitLTP = state.t1EntryLTP > 0 ? await (0, market_1.getOptionLTP)(state.t1Symbol).catch(() => 0) : 0;
                state.t1Rs = t1ExitLTP > 0
                    ? Math.round((t1ExitLTP - state.t1EntryLTP) * config_1.config.quantity)
                    : Math.round(t1Pts * RS_PER_PT);
                await doExit("T1_SL", state.t1Symbol);
                state.slClose = latest.close;
                state.slTime = nowIST();
                log("T1_SL", { exit: latest.close.toFixed(0), pnl: t1Pts.toFixed(0), slLevel: t1EffSL.toFixed(0), peak: state.t1Peak.toFixed(0), t1Rs: state.t1Rs });
                appendCandleLog({
                    type: "T1_SL",
                    time: state.slTime,
                    exitIndex: parseFloat(latest.close.toFixed(1)),
                    entryIndex: state.t1Entry,
                    pts: parseFloat(t1Pts.toFixed(1)),
                    premiumEntry: state.t1EntryLTP,
                    premiumExit: t1ExitLTP,
                    pnlRs: state.t1Rs,
                    peak: parseFloat(state.t1Peak.toFixed(1)),
                    candleNum: candles.length,
                });
                appendTrade({
                    date: state.t1EntryTime,
                    direction: state.t1Dir,
                    symbol: state.t1Symbol,
                    entryPrice: state.t1Entry,
                    exitPrice: latest.close,
                    premiumEntry: state.t1EntryLTP,
                    premiumExit: t1ExitLTP,
                    pnl: t1Pts,
                    pnlRs: state.t1Rs,
                    reasonExit: "T1_SL",
                    duration: entryToExitSecs(state.t1EntryTime),
                });
                // Always take RE — no filter in AMINA 100
                const reDir = state.t1Dir === "CE" ? "PE" : "CE";
                const reSymbol = await (0, market_1.getBestOptionSymbol)(reDir);
                state.reDir = reDir;
                state.reEntry = state.slClose;
                state.reSymbol = reSymbol;
                state.reEntryTime = nowIST();
                state.rePeak = 0;
                state.phase = "IN_RE";
                saveState();
                await (0, order_1.placeTrade)(reSymbol, state.slClose, config_1.config.quantity);
                state.reEntryLTP = await (0, market_1.getOptionLTP)(reSymbol).catch(() => 0);
                const t1Label = t1EffSL > 0 ? `+${t1EffSL} pts (trail)` : t1EffSL === 0 ? "BE exit" : `${t1EffSL} pts SL`;
                const t1ActualLabel = t1Pts >= 0 ? `+${t1Pts.toFixed(0)}` : t1Pts.toFixed(0);
                const reSL = reDir === "CE" ? state.slClose - SL_INITIAL : state.slClose + SL_INITIAL;
                log("RE_ENTRY", { dir: reDir, entry: state.slClose.toFixed(0), sl: reSL.toFixed(0), symbol: reSymbol });
                appendCandleLog({
                    type: "RE_ENTRY",
                    time: state.reEntryTime,
                    dir: reDir,
                    index: parseFloat(state.reEntry.toFixed(1)),
                    symbol: reSymbol,
                    premium: state.reEntryLTP,
                    sl: parseFloat(reSL.toFixed(1)),
                    candleNum: candles.length,
                });
                await (0, notifier_1.sendTelegram)(`🛑 *AMINA 100 — T1 SL HIT* (${t1Label}, actual ${t1ActualLabel} pts)\n`
                    + `Dir: ${state.t1Dir} | Entry: ${state.t1Entry.toFixed(0)} | Exit: ${state.slClose.toFixed(0)}\n`
                    + `T1 P&L: *${t1ActualLabel} pts* (Rs ${state.t1Rs >= 0 ? '+' : ''}${state.t1Rs})\n`
                    + `🔄 *RE-ENTRY TAKEN*\n`
                    + `Dir: *${reDir}* | Entry: *${state.slClose.toFixed(0)}*\n`
                    + `SL: ${reSL.toFixed(0)} (−60 pts, trail)\n`
                    + `Symbol: \`${reSymbol}\``).catch(() => { });
            }
            else {
                const t1SlPx = state.t1Dir === "CE" ? state.t1Entry + t1EffSL : state.t1Entry - t1EffSL;
                log("T1_MONITOR", { close: latest.close.toFixed(0), unrealised: t1Pts.toFixed(0), sl: t1SlPx.toFixed(0), peak: state.t1Peak.toFixed(0) });
            }
        }
        // ── IN RE-ENTRY ────────────────────────────────────────────────────────────
        else if (state.phase === "IN_RE") {
            const rePts = state.reDir === "CE"
                ? latest.close - state.reEntry
                : state.reEntry - latest.close;
            state.rePts = rePts;
            // Trail SL: once peak ≥ 60 → SL = entry + max(0, peak − 100). Never reverses.
            if (rePts > state.rePeak)
                state.rePeak = rePts;
            const reEffSL = state.rePeak >= SL_INITIAL ? Math.max(0, state.rePeak - TRAIL_GAP) : -SL_INITIAL;
            if (rePts <= reEffSL) {
                // Use actual candle-close pts for P&L, not capped at SL
                state.rePts = rePts;
                const reExitLTP = state.reEntryLTP > 0 ? await (0, market_1.getOptionLTP)(state.reSymbol).catch(() => 0) : 0;
                state.reRs = reExitLTP > 0
                    ? Math.round((reExitLTP - state.reEntryLTP) * config_1.config.quantity)
                    : Math.round(rePts * RS_PER_PT);
                await doExit("RE_SL", state.reSymbol);
                state.dayPts = state.t1Pts + state.rePts;
                state.dayRs = state.t1Rs + state.reRs;
                state.phase = "DONE";
                saveState();
                sendEODReport().catch(() => {});
                const reLabel = reEffSL > 0 ? `+${reEffSL} pts (trail)` : reEffSL === 0 ? "BE exit" : `${reEffSL} pts SL`;
                const reActualLabel = rePts >= 0 ? `+${rePts.toFixed(0)}` : rePts.toFixed(0);
                log("RE_SL", { exit: latest.close.toFixed(0), pnl: rePts.toFixed(0), slLevel: reEffSL.toFixed(0), peak: state.rePeak.toFixed(0), reRs: state.reRs, dayPts: state.dayPts, dayRs: state.dayRs });
                appendCandleLog({
                    type: "RE_SL",
                    time: nowIST(),
                    exitIndex: parseFloat(latest.close.toFixed(1)),
                    entryIndex: state.reEntry,
                    pts: parseFloat(rePts.toFixed(1)),
                    premiumEntry: state.reEntryLTP,
                    premiumExit: reExitLTP,
                    pnlRs: state.reRs,
                    peak: parseFloat(state.rePeak.toFixed(1)),
                    dayPts: parseFloat(state.dayPts.toFixed(1)),
                    dayRs: state.dayRs,
                    candleNum: candles.length,
                });
                appendTrade({
                    date: state.reEntryTime,
                    direction: state.reDir,
                    symbol: state.reSymbol,
                    entryPrice: state.reEntry,
                    exitPrice: latest.close,
                    premiumEntry: state.reEntryLTP,
                    premiumExit: reExitLTP,
                    pnl: rePts,
                    pnlRs: state.reRs,
                    reasonExit: "RE_SL",
                    duration: entryToExitSecs(state.reEntryTime),
                });
                await (0, notifier_1.sendTelegram)(`🛑 *AMINA 100 — RE-ENTRY SL HIT* (${reLabel}, actual ${reActualLabel} pts)\n`
                    + `Dir: ${state.reDir} | Entry: ${state.reEntry.toFixed(0)} | Exit: ${latest.close.toFixed(0)}\n`
                    + `RE P&L: *${reActualLabel} pts* (Rs ${state.reRs >= 0 ? '+' : ''}${state.reRs})\n`
                    + `Day P&L: *${state.dayPts >= 0 ? "+" : ""}${state.dayPts.toFixed(0)} pts`
                    + ` (Rs ${state.dayRs >= 0 ? "+" : ""}${state.dayRs})*\n`
                    + `Done for the day.`).catch(() => { });
            }
            else {
                const reSlPx = state.reDir === "CE" ? state.reEntry + reEffSL : state.reEntry - reEffSL;
                log("RE_MONITOR", { close: latest.close.toFixed(0), unrealised: rePts.toFixed(0), sl: reSlPx.toFixed(0), peak: state.rePeak.toFixed(0) });
            }
        }
    }
    catch (e) {
        log("TICK_ERROR", { error: e instanceof Error ? e.message : String(e) });
    }
}
// ── Daily reset ───────────────────────────────────────────────────────────────
function resetForNewDay() {
    const today = todayIST();
    if (state.date !== today) {
        state = makeState();
        state.date = today;
        _lastKey = "";
        _dailyCandleLog = [];
        _eodReportSent = false;
        _expectedTrade = null;
        resetCandleLog();
        saveState();
        log("NEW_DAY_RESET", { date: today });
    }
}
// ── Start ─────────────────────────────────────────────────────────────────────
async function startAmina() {
    loadState();
    resetForNewDay();
    log("BOT_START", { date: todayIST(), mode: config_1.config.mode, qty: config_1.config.quantity, strategy: "AMINA 100" });
    await (0, notifier_1.sendTelegram)(`🚀 *AMINA 100 Strategy Started*\n`
        + `Date: ${todayIST()} | Mode: *${config_1.config.mode}*\n`
        + `Qty: ${config_1.config.quantity} | SL: 60 pts | Trail: 100 pts behind peak\n`
        + `5.5yr backtest: Rs +19,25,692 ✅`).catch(() => { });
    // Daily reset at midnight
    setInterval(resetForNewDay, 60000);
    // Strategy tick every 30 seconds
    setInterval(tick, 30000);
    // EOD report safety-net: fires at 15:31 IST (10:01 UTC) on weekdays
    setInterval(() => {
      const _n = new Date();
      const _h = _n.getUTCHours(), _m = _n.getUTCMinutes();
      if (_h === 10 && _m === 1) sendEODReport().catch(() => {});
    }, 60000);
    // Run once immediately
    await tick();
}
