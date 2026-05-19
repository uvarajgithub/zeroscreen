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

import fs from "fs";
import { getBestOptionSymbol, getCurrentPrice, getDayOpenPrice } from "./market";
import { placeTrade, exitTrade } from "./order";
import { sendTelegram } from "./notifier";
import { config } from "./config";
import { KiteConnect } from "kiteconnect";

// ── Kite (for 15-min candle fetch) ───────────────────────────────────────────
const kite = new KiteConnect({ api_key: config.apiKey });
kite.setAccessToken(config.accessToken);

const INSTRUMENT_TOKEN = config.instrument.token; // 260105
const IST_OFFSET_MS    = (5 * 60 + 30) * 60 * 1000;
const SL_INITIAL       = 60;  // fixed SL for both T1 and RE
const TRAIL_GAP        = 100; // trail SL = entry + max(0, peak − TRAIL_GAP)
const RS_PER_PT        = 15;  // 30 qty × 0.5 delta × Rs 1/pt

// ── Types ────────────────────────────────────────────────────────────────────
type Phase = "SCANNING" | "IN_T1" | "IN_RE" | "DONE";

interface AminaState {
  date         : string;
  phase        : Phase;
  dayOpen      : number;
  // T1
  t1Dir        : "CE" | "PE" | null;
  t1Entry      : number;
  t1Symbol     : string;
  t1EntryTime  : string;
  t1Pts        : number;
  t1BreakLevel : number;
  t1Rule       : string;
  // Peak tracking (LockBE trail)
  t1Peak       : number;
  rePeak       : number;
  // SL candle snapshot
  slClose      : number;
  slTime       : string;
  // Re-entry
  reDir        : "CE" | "PE" | null;
  reEntry      : number;
  reSymbol     : string;
  reEntryTime  : string;
  rePts        : number;
  // Day totals
  dayPts       : number;
  dayRs        : number;
  // Candle tracking
  lastCandleKey: string;
}

// ── State ────────────────────────────────────────────────────────────────────
const STATE_FILE = "amina-state.json";
let state: AminaState = makeState();
let _lastKey = "";

function makeState(): AminaState {
  return {
    date: "", phase: "SCANNING", dayOpen: 0,
    t1Dir: null, t1Entry: 0, t1Symbol: "", t1EntryTime: "", t1Pts: 0, t1BreakLevel: 0, t1Rule: "", t1Peak: 0,
    slClose: 0, slTime: "",
    reDir: null, reEntry: 0, reSymbol: "", reEntryTime: "", rePts: 0, rePeak: 0,
    dayPts: 0, dayRs: 0, lastCandleKey: "",
  };
}

function saveState() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch (_) {}
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as AminaState;
    if (s.date === todayIST()) { state = s; _lastKey = s.lastCandleKey; }
  } catch (_) {}
}

// ── Append completed trade record to trades.json (for dashboard) ─────────────
function appendTrade(tradeObj: Record<string, unknown>) {
  try {
    const TRADES_FILE = "trades.json";
    const existing: unknown[] = fs.existsSync(TRADES_FILE)
      ? JSON.parse(fs.readFileSync(TRADES_FILE, "utf-8"))
      : [];
    if (!Array.isArray(existing)) return;
    existing.push(tradeObj);
    fs.writeFileSync(TRADES_FILE, JSON.stringify(existing, null, 2));
  } catch (e) {
    log("APPEND_TRADE_ERROR", { error: e instanceof Error ? e.message : String(e) });
  }
}
function entryToExitSecs(entryTimeIST?: string): number {
  if (!entryTimeIST) return 0;
  try {
    return Math.round((Date.now() - new Date(entryTimeIST.replace(" ", "T") + "+05:30").getTime()) / 1000);
  } catch (_) { return 0; }
}

// ── IST helpers ───────────────────────────────────────────────────────────────
function nowIST(): string {
  return new Date(Date.now() + IST_OFFSET_MS)
    .toISOString().replace("T", " ").slice(0, 19);
}
function todayIST(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
function istHM(): { h: number; m: number } {
  const d = new Date(Date.now() + IST_OFFSET_MS);
  return { h: d.getUTCHours(), m: d.getUTCMinutes() };
}
function isMarketOpen(): boolean {
  const { h, m } = istHM();
  return (h > 9 || (h === 9 && m >= 15)) && (h < 15 || (h === 15 && m <= 30));
}
function isEOD(): boolean {
  const { h, m } = istHM();
  return h > 15 || (h === 15 && m >= 14);
}

// ── Logger ────────────────────────────────────────────────────────────────────
function log(event: string, d: Record<string, any> = {}) {
  const ts = nowIST();
  const msg = Object.entries(d).map(([k, v]) => `${k}:${v}`).join(" | ");
  console.log(`[AMINA 100][${ts}] ${event}${msg ? "  " + msg : ""}`);
  try {
    fs.appendFileSync("amina.log", JSON.stringify({ time: ts, event, ...d }) + "\n");
  } catch (_) {}
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────
function writeHeartbeat(price: number) {
  const inTrade = state.phase === "IN_T1" || state.phase === "IN_RE";
  const dir     = state.phase === "IN_T1" ? state.t1Dir : state.phase === "IN_RE" ? state.reDir : null;
  const entry   = state.phase === "IN_T1" ? state.t1Entry : state.phase === "IN_RE" ? state.reEntry : 0;
  const sym     = state.phase === "IN_T1" ? state.t1Symbol : state.phase === "IN_RE" ? state.reSymbol : "";
  const livePnl = inTrade && entry ? (dir === "CE" ? price - entry : entry - price) : state.dayPts;
  const t1TrailLocked = Math.max(0, state.t1Peak - TRAIL_GAP);
  const t1EffSLHb     = state.t1Peak >= SL_INITIAL ? t1TrailLocked : -SL_INITIAL;
  const reTrailLocked = Math.max(0, state.rePeak - TRAIL_GAP);
  const reEffSLHb     = state.rePeak >= SL_INITIAL ? reTrailLocked : -SL_INITIAL;
  const t1SlPx    = state.t1Dir ? (state.t1Dir === "CE" ? state.t1Entry + t1EffSLHb : state.t1Entry - t1EffSLHb) : null;
  const reSlPx    = state.reDir ? (state.reDir === "CE" ? state.reEntry + reEffSLHb : state.reEntry - reEffSLHb) : null;
  const slLevel   = state.phase === "IN_T1" ? t1SlPx : state.phase === "IN_RE" ? reSlPx : null;

  try {
    fs.writeFileSync("bot-heartbeat.json", JSON.stringify({
      at           : new Date().toISOString(),
      strategy     : "AMINA 100",
      status       : phaseLabel(),
      price,
      livePrice    : price,
      // Position
      inTrade,
      direction    : dir,
      entryPrice   : entry || null,
      tradeSymbol  : sym || null,
      sl           : slLevel,
      // T1 info
      t1Dir        : state.t1Dir,
      t1Entry      : state.t1Entry || null,
      t1Symbol     : state.t1Symbol || null,
      t1SL         : t1SlPx,
      t1BreakLevel : state.t1BreakLevel || null,
      t1Rule       : state.t1Rule || null,
      t1Pts        : state.t1Pts,
      // Re-entry info
      reDir        : state.reDir,
      reEntry      : state.reEntry || null,
      reSymbol     : state.reSymbol || null,
      reSL         : reSlPx,
      rePts        : state.rePts,
      // Day stats
      dayOpen      : state.dayOpen || null,
      dayPts       : state.dayPts,
      dayRs        : state.dayRs,
      dailyPnL     : parseFloat(livePnl.toFixed(0)),
      unrealisedPnL: inTrade ? parseFloat(livePnl.toFixed(0)) : 0,
      tradeCount   : (state.t1Dir ? 1 : 0) + (state.reDir ? 1 : 0),
      qty          : config.quantity,
      slPts        : SL_INITIAL,
      mode         : config.mode,
    }));
  } catch (_) {}
}

function phaseLabel(): string {
  switch (state.phase) {
    case "SCANNING": return "SCANNING — FLAT";
    case "IN_T1":    return `IN T1 — ${state.t1Dir}`;
    case "IN_RE":    return `IN RE-ENTRY — ${state.reDir}`;
    case "DONE":     return "DONE FOR DAY";
    default:         return "UNKNOWN";
  }
}

// ── Candle helpers ────────────────────────────────────────────────────────────
interface C15 {
  open: number; high: number; low: number; close: number;
  body_high: number; body_low: number; body_size: number;
  bull: boolean; key: string;
}

function enrich(c: any): C15 {
  const bull      = c.close >= c.open;
  const body_high = Math.max(c.open, c.close);
  const body_low  = Math.min(c.open, c.close);
  return {
    open: c.open, high: c.high, low: c.low, close: c.close,
    body_high, body_low, body_size: body_high - body_low,
    bull,
    key: c.date ? String(c.date) : `${c.open}_${c.high}_${c.low}_${c.close}`,
  };
}

// ── Fetch all today's completed 15-min candles ────────────────────────────────
async function getToday15MinCandles(): Promise<C15[]> {
  const nowMs    = Date.now() + IST_OFFSET_MS;
  const d        = new Date(nowMs);
  const midnight = nowMs
    - (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) * 1000
    - d.getUTCMilliseconds();
  const dayStart = midnight + (9 * 60 + 15) * 60_000; // 9:15 AM IST

  const fmt = (ms: number) => {
    const dd = new Date(ms);
    const p  = (n: number) => String(n).padStart(2, "0");
    return `${dd.getUTCFullYear()}-${p(dd.getUTCMonth() + 1)}-${p(dd.getUTCDate())} `
      + `${p(dd.getUTCHours())}:${p(dd.getUTCMinutes())}:${p(dd.getUTCSeconds())}`;
  };

  try {
    const data = await kite.getHistoricalData(
      INSTRUMENT_TOKEN, "15minute",
      fmt(dayStart),
      fmt(nowMs - 60_000), // exclude the candle currently forming
      false
    ) as any[];
    const nowReal = Date.now();
    // Filter out any candle that hasn't completed yet (candle start + 15min > now)
    return (data ?? []).filter((c: any) => {
      try { return new Date(c.date).getTime() + 15 * 60 * 1000 < nowReal; }
      catch (_) { return true; }
    }).map(enrich);
  } catch (e) {
    log("CANDLE_FETCH_ERR", { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

// ── Rolling entry scan (C2 early entry + C3+ fallback) ───────────────────────
function rollingEntryScan(cs: C15[]): {
  sig: "CE" | "PE"; px: number; bl: number; rule: string;
  pairIdx: number; entryIdx: number;
} | null {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    let sig: "CE" | "PE" | null = null;
    let c2level = 0, c3level = 0, rule = "";

    if (ca.bull === cb.bull) {
      // Rule A — same color pair
      sig     = ca.bull ? "CE" : "PE";
      c2level = sig === "CE" ? ca.high      : ca.low;
      c3level = sig === "CE" ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
      rule    = "A";
    } else if (cb.body_size > ca.body_size) {
      // Rule B — opposite color, C2 body > C1 body
      sig     = cb.bull ? "CE" : "PE";
      c2level = sig === "CE" ? ca.body_high : ca.body_low;
      c3level = sig === "CE"
        ? Math.max(ca.body_high, cb.body_high)
        : Math.min(ca.body_low,  cb.body_low);
      rule    = "B";
    } else {
      continue; // skip this pair
    }

    // C2 early entry: does C2 itself break the C1 level?
    if (sig === "CE" && cb.close > c2level) return { sig, px: cb.close, bl: c2level, rule: rule + "(C2)", pairIdx: i, entryIdx: i + 1 };
    if (sig === "PE" && cb.close < c2level) return { sig, px: cb.close, bl: c2level, rule: rule + "(C2)", pairIdx: i, entryIdx: i + 1 };

    // C3+ fallback: wait for breakout above max(C1, C2) level
    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === "CE" && c.close > c3level) return { sig, px: c.close, bl: c3level, rule, pairIdx: i, entryIdx: j };
      if (sig === "PE" && c.close < c3level) return { sig, px: c.close, bl: c3level, rule, pairIdx: i, entryIdx: j };
    }
  }
  return null;
}

// ── Exit helper ───────────────────────────────────────────────────────────────
async function doExit(label: string, symbol: string) {
  try {
    await exitTrade(symbol, config.quantity);
    log(`EXIT_${label}`, { symbol, qty: config.quantity });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`EXIT_${label}_FAIL`, { error: msg });
    await sendTelegram(
      `❌ *AMINA 100 — EXIT FAILED* (${label})\n\`${symbol}\`\nManual exit required!\n${msg}`
    ).catch(() => {});
  }
}

// ── EOD square-off ────────────────────────────────────────────────────────────
async function eodSquareOff(price: number) {
  if (state.phase !== "IN_T1" && state.phase !== "IN_RE") return;

  const isT1  = state.phase === "IN_T1";
  const dir   = isT1 ? state.t1Dir! : state.reDir!;
  const entry = isT1 ? state.t1Entry : state.reEntry;
  const sym   = isT1 ? state.t1Symbol : state.reSymbol;
  const pts   = dir === "CE" ? price - entry : entry - price;

  await doExit("EOD", sym);

  if (isT1) { state.t1Pts = pts; } else { state.rePts = pts; }
  state.dayPts = state.t1Pts + state.rePts;
  state.dayRs  = state.dayPts * RS_PER_PT;
  state.phase  = "DONE";
  saveState();

  log("EOD_EXIT", { dir, entry: entry.toFixed(0), exit: price.toFixed(0), pts: pts.toFixed(0), dayPts: state.dayPts });
  appendTrade({
    date: isT1 ? state.t1EntryTime : state.reEntryTime,
    direction: dir,
    symbol: sym,
    entryPrice: entry,
    exitPrice: price,
    premiumEntry: (isT1 ? state.t1EntryLTP : state.reEntryLTP) ?? 0,
    premiumExit: 0,
    pnl: pts,
    pnlRs: (isT1 ? state.t1Rs : state.reRs) ?? Math.round(pts * RS_PER_PT),
    reasonExit: "EOD",
    duration: entryToExitSecs(isT1 ? state.t1EntryTime : state.reEntryTime),
  });
  await sendTelegram(
    `🔔 *AMINA 100 — EOD EXIT*\n`
    + `Dir: ${dir} | Entry: ${entry.toFixed(0)} | Exit: ${price.toFixed(0)}\n`
    + `Trade P&L: *${pts >= 0 ? "+" : ""}${pts.toFixed(0)} pts*\n`
    + `Day Total: *${state.dayPts >= 0 ? "+" : ""}${state.dayPts.toFixed(0)} pts`
    + ` (Rs ${state.dayRs >= 0 ? "+" : ""}${state.dayRs.toFixed(0)})*`
  ).catch(() => {});
}

// ── Strategy tick (called every 30s) ──────────────────────────────────────────
async function tick() {
  try {
    if (!isMarketOpen()) {
      // Write pre-market heartbeat so dashboard shows Bot Online
      try {
        const existing = fs.existsSync(STATE_FILE) ? state : {};
        fs.writeFileSync('bot-heartbeat.json', JSON.stringify({
          at: new Date().toISOString(),
          strategy: 'AMINA 100',
          status: 'Pre-Market — Waiting',
          mode: process.env.MODE || 'PAPER',
          qty: parseInt(process.env.QUANTITY || '30'),
          slPts: SL_INITIAL,
          inTrade: false,
          tradeCount: state.tradeCount || 0,
        }));
      } catch(_) {}
      return;
    }

    const price = await getCurrentPrice();
    if (!price || price <= 0) return;

    // EOD square-off
    if (isEOD()) {
      await eodSquareOff(price);
      return;
    }

    const candles = await getToday15MinCandles();
    if (!candles.length) return;

    // Init day open
    if (!state.dayOpen) {
      try { state.dayOpen = await getDayOpenPrice(); }
      catch (_) { state.dayOpen = candles[0].open; }
      state.date = todayIST();
      log("DAY_OPEN", { open: state.dayOpen });
      saveState();
    }

    writeHeartbeat(price);

    const latest    = candles[candles.length - 1];
    const isNewCandle = latest.key !== _lastKey;
    if (!isNewCandle) return;

    _lastKey = latest.key;
    state.lastCandleKey = latest.key;
    log("NEW_CANDLE", { key: latest.key, o: latest.open, h: latest.high, l: latest.low, c: latest.close, phase: state.phase });

        // --- 15-min candle Telegram update (same format as TICK TRAIL strategy) ---
    try {
      const _colour = latest.close >= latest.open ? '🟢 Bullish' : '🔴 Bearish';
      const _ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const SEP = '──────────────────';
      const _fmt = (p: number) => (p >= 0 ? '🟢 +' : '🔴 ') + p.toFixed(0) + ' pts';
      let _stratCtx = '';
      if (state.phase === 'IN_T1' && state.t1Entry) {
        const _unr = state.t1Dir === 'CE' ? price - state.t1Entry : state.t1Entry - price;
        const _slLvl = state.t1Dir === 'CE' ? (state.t1Entry - 60).toFixed(0) : (state.t1Entry + 60).toFixed(0);
        _stratCtx = `\n${SEP}\n` +
          `🟡 *AMINA 100 · ${state.t1Dir} In Trade*\n` +
          `Entry: ${state.t1Entry.toFixed(0)}  ·  SL: ${_slLvl}  (−60 pts)\n` +
          `T1 Unrealised: ${_fmt(_unr)}\n` +
          `Day: ${_fmt(state.dayPts + _unr)}`;
      } else if (state.phase === 'IN_RE' && state.reEntry) {
        const _unr = state.reDir === 'CE' ? price - state.reEntry : state.reEntry - price;
        const _slLvl = state.reDir === 'CE' ? (state.reEntry - 60).toFixed(0) : (state.reEntry + 60).toFixed(0);
        _stratCtx = `\n${SEP}\n` +
          `🟡 *AMINA 100 · ${state.reDir} Re-Entry*\n` +
          `Entry: ${state.reEntry.toFixed(0)}  ·  SL: ${_slLvl}  (−60 pts)\n` +
          `T1 Closed: ${_fmt(state.t1Pts)}\n` +
          `RE Unrealised: ${_fmt(_unr)}\n` +
          `Day: ${_fmt(state.t1Pts + _unr)}`;
      } else if (state.phase === 'DONE') {
        const _rs = Math.round(state.dayPts * 30 * 0.5);
        const _reeLine = state.rePts !== 0 ? `\nRE: ${_fmt(state.rePts)}` : '';
        _stratCtx = `\n${SEP}\n` +
          `✅ *AMINA 100 · Done for Day*\n` +
          `T1: ${_fmt(state.t1Pts)}` + _reeLine + `\n` +
          `📈 *Day Total: ${state.dayPts >= 0 ? '+' : ''}${state.dayPts.toFixed(0)} pts*  (₹${_rs >= 0 ? '+' : ''}${_rs.toLocaleString('en-IN')})`;
      } else {
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
        const _t1line = state.t1Pts !== 0 ? `\nT1 Closed: ${_fmt(state.t1Pts)}` : '';
        _stratCtx = `\n${SEP}\n` +
          `🚦 *AMINA 100 · Scanning* (${candles.length} candle${candles.length > 1 ? 's' : ''})\n` +
          _watchLine +
          _t1line +
          `\nDay: ${_fmt(state.dayPts)}`;
      }
      await sendTelegram(
        `🕯 *15-Min Candle*  ${_ist}  ${_colour}\n` +
        `O: ${latest.open.toFixed(0)}  H: ${latest.high.toFixed(0)}  L: ${latest.low.toFixed(0)}  C: ${latest.close.toFixed(0)}` +
        _stratCtx +
        `\n${SEP}\n` +
        `[🔑 Token](https://139-59-18-52.nip.io/login)  ·  [📈 Dashboard](https://139-59-18-52.nip.io/signals)`
      ).catch(() => {});
      try {
        const _hbRaw = fs.existsSync('bot-heartbeat.json') ? fs.readFileSync('bot-heartbeat.json', 'utf-8') : '{}';
        const _hb = JSON.parse(_hbRaw);
        _hb.lastCandle = { open: latest.open, high: latest.high, low: latest.low, close: latest.close, colour: latest.close >= latest.open ? 'bull' : 'bear' };
        fs.writeFileSync('bot-heartbeat.json', JSON.stringify(_hb));
      } catch(_) {}
    } catch(_) {}

    // ── SCANNING ───────────────────────────────────────────────────────────────
    if (state.phase === "SCANNING") {
      const res = rollingEntryScan(candles);
      if (!res) {
        log("NO_SIGNAL", { candles: candles.length });
        return;
      }
      // Signal must be triggered on the LATEST completed candle (otherwise already missed)
      if (res.entryIdx !== candles.length - 1) {
        log("PAST_SIGNAL_SKIP", { entryIdx: res.entryIdx, total: candles.length });
        return;
      }

      const symbol = await getBestOptionSymbol(res.sig);
      state.t1Dir        = res.sig;
      state.t1Entry      = res.px;
      state.t1Symbol     = symbol;
      state.t1EntryTime  = nowIST();
      state.t1BreakLevel = res.bl;
      state.t1Rule       = res.rule;
      state.t1Peak       = 0;
      state.phase        = "IN_T1";
      saveState();

      await placeTrade(symbol, res.px, config.quantity);

      const slLevel = res.sig === "CE" ? res.px - SL_INITIAL : res.px + SL_INITIAL;
      log("T1_ENTRY", { sig: res.sig, entry: res.px.toFixed(0), bl: res.bl.toFixed(0), sl: slLevel.toFixed(0), rule: res.rule, symbol });

      await sendTelegram(
        `🎯 *AMINA 100 — T1 ENTRY*\n`
        + `Dir: *${res.sig}* | Rule ${res.rule} | BL: ${res.bl.toFixed(0)}\n`
        + `Entry: *${res.px.toFixed(0)}* | SL: ${slLevel.toFixed(0)} (−60 pts, trail)\n`
        + `Symbol: \`${symbol}\`\n`
        + `Day Open: ${state.dayOpen.toFixed(0)}`
      ).catch(() => {});
    }

    // ── IN T1 ──────────────────────────────────────────────────────────────────
    else if (state.phase === "IN_T1") {
      const t1Pts = state.t1Dir === "CE"
        ? latest.close - state.t1Entry
        : state.t1Entry - latest.close;
      state.t1Pts = t1Pts;

      // Trail SL: once peak ≥ 60 → SL = entry + max(0, peak − 100). Never reverses.
      if (t1Pts > state.t1Peak) state.t1Peak = t1Pts;
      const t1EffSL = state.t1Peak >= SL_INITIAL ? Math.max(0, state.t1Peak - TRAIL_GAP) : -SL_INITIAL;

      if (t1Pts <= t1EffSL) {
        // SL hit — fixed −60 or trail locked profit
        state.t1Pts = t1EffSL;
        await doExit("T1_SL", state.t1Symbol);

        state.slClose = latest.close;
        state.slTime  = nowIST();
        log("T1_SL", { exit: latest.close.toFixed(0), pnl: t1EffSL, peak: state.t1Peak.toFixed(0) });
        appendTrade({
          date: state.t1EntryTime,
          direction: state.t1Dir,
          symbol: state.t1Symbol,
          entryPrice: state.t1Entry,
          exitPrice: latest.close,
          premiumEntry: state.t1EntryLTP ?? 0,
          premiumExit: 0,
          pnl: t1Pts,
          pnlRs: state.t1Rs ?? 0,
          reasonExit: "T1_SL",
          duration: entryToExitSecs(state.t1EntryTime),
        });

        // Always take RE — no filter in AMINA 100
        const reDir: "CE" | "PE" = state.t1Dir === "CE" ? "PE" : "CE";
        const reSymbol = await getBestOptionSymbol(reDir);
        state.reDir       = reDir;
        state.reEntry     = state.slClose;
        state.reSymbol    = reSymbol;
        state.reEntryTime = nowIST();
        state.rePeak      = 0;
        state.phase       = "IN_RE";
        saveState();

        await placeTrade(reSymbol, state.slClose, config.quantity);

        const t1Label = t1EffSL > 0 ? `+${t1EffSL} pts (trail)` : t1EffSL === 0 ? "BE exit" : `${t1EffSL} pts`;
        const reSL    = reDir === "CE" ? state.slClose - SL_INITIAL : state.slClose + SL_INITIAL;
        log("RE_ENTRY", { dir: reDir, entry: state.slClose.toFixed(0), sl: reSL.toFixed(0), symbol: reSymbol });

        await sendTelegram(
          `🛑 *AMINA 100 — T1 SL HIT* (${t1Label})\n`
          + `Dir: ${state.t1Dir} | Entry: ${state.t1Entry.toFixed(0)} | Exit: ${state.slClose.toFixed(0)}\n`
          + `🔄 *RE-ENTRY TAKEN*\n`
          + `Dir: *${reDir}* | Entry: *${state.slClose.toFixed(0)}*\n`
          + `SL: ${reSL.toFixed(0)} (−60 pts, trail)\n`
          + `Symbol: \`${reSymbol}\``
        ).catch(() => {});
      } else {
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
      if (rePts > state.rePeak) state.rePeak = rePts;
      const reEffSL = state.rePeak >= SL_INITIAL ? Math.max(0, state.rePeak - TRAIL_GAP) : -SL_INITIAL;

      if (rePts <= reEffSL) {
        state.rePts  = reEffSL;
        await doExit("RE_SL", state.reSymbol);

        state.dayPts = state.t1Pts + reEffSL;
        state.dayRs  = state.dayPts * RS_PER_PT;
        state.phase  = "DONE";
        saveState();

        const reLabel = reEffSL > 0 ? `+${reEffSL} pts (trail)` : reEffSL === 0 ? "BE exit" : `${reEffSL} pts`;
        log("RE_SL", { exit: latest.close.toFixed(0), pnl: reEffSL, peak: state.rePeak.toFixed(0), dayPts: state.dayPts });
        appendTrade({
          date: state.reEntryTime,
          direction: state.reDir,
          symbol: state.reSymbol,
          entryPrice: state.reEntry,
          exitPrice: latest.close,
          premiumEntry: state.reEntryLTP ?? 0,
          premiumExit: 0,
          pnl: rePts,
          pnlRs: state.reRs ?? 0,
          reasonExit: "RE_SL",
          duration: entryToExitSecs(state.reEntryTime),
        });
        await sendTelegram(
          `🛑 *AMINA 100 — RE-ENTRY SL HIT* (${reLabel})\n`
          + `Dir: ${state.reDir} | Entry: ${state.reEntry.toFixed(0)} | Exit: ${latest.close.toFixed(0)}\n`
          + `Day P&L: *${state.dayPts >= 0 ? "+" : ""}${state.dayPts} pts`
          + ` (Rs ${state.dayRs >= 0 ? "+" : ""}${state.dayRs.toFixed(0)})*\n`
          + `Done for the day.`
        ).catch(() => {});
      } else {
        const reSlPx = state.reDir === "CE" ? state.reEntry + reEffSL : state.reEntry - reEffSL;
        log("RE_MONITOR", { close: latest.close.toFixed(0), unrealised: rePts.toFixed(0), sl: reSlPx.toFixed(0), peak: state.rePeak.toFixed(0) });
      }
    }

  } catch (e) {
    log("TICK_ERROR", { error: e instanceof Error ? e.message : String(e) });
  }
}

// ── Daily reset ───────────────────────────────────────────────────────────────
function resetForNewDay() {
  const today = todayIST();
  if (state.date !== today) {
    state  = makeState();
    state.date = today;
    _lastKey   = "";
    saveState();
    log("NEW_DAY_RESET", { date: today });
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
export async function startAmina(): Promise<void> {
  loadState();
  resetForNewDay();

  log("BOT_START", { date: todayIST(), mode: config.mode, qty: config.quantity, strategy: "AMINA 100" });

  await sendTelegram(
    `🚀 *AMINA 100 Strategy Started*\n`
    + `Date: ${todayIST()} | Mode: *${config.mode}*\n`
    + `Qty: ${config.quantity} | SL: 60 pts | Trail: 100 pts behind peak\n`
    + `5.5yr backtest: Rs +19,25,692 ✅`
  ).catch(() => {});

  // Daily reset at midnight
  setInterval(resetForNewDay, 60_000);

  // Strategy tick every 30 seconds
  setInterval(tick, 30_000);

  // Run once immediately
  await tick();
}
