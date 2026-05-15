/**
 * amina-live.ts — Amina BankNifty Options Strategy (Live Engine)
 *
 * Strategy Rules:
 *   Entry  : Rolling C1+C2 scan (Rule A: same-color pair | Rule B: C2 body > C1 opposite)
 *            Enter on first candle CLOSE that crosses breakout level. First signal only.
 *   T1 SL  : 50 pts fixed (checked on each completed candle close)
 *   T1 Tgt : NONE — hold to 3:15 PM EOD exit
 *   Re-entry: Opposite direction, only if price-vs-dayOpen filter passes (moveAgainstRe < 0)
 *             Re-entry SL: 100 pts fixed | No target — hold to EOD
 *
 * 5yr backtest: Rs 10,66,085 | 1,233 days | Win rate 45%
 * Max loss/day: Rs -2,250 (T1 -50 + Re -100 = -150 pts × Rs 15)
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
const SL_T1            = 50;
const SL_RE            = 100;
const RS_PER_PT        = 15; // 30 qty × 0.5 delta × Rs 1/pt

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
    t1Dir: null, t1Entry: 0, t1Symbol: "", t1EntryTime: "", t1Pts: 0, t1BreakLevel: 0, t1Rule: "",
    slClose: 0, slTime: "",
    reDir: null, reEntry: 0, reSymbol: "", reEntryTime: "", rePts: 0,
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
  console.log(`[AMINA][${ts}] ${event}${msg ? "  " + msg : ""}`);
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
  const slLevel = inTrade && dir && entry
    ? (state.phase === "IN_T1"
        ? (dir === "CE" ? entry - SL_T1 : entry + SL_T1)
        : (dir === "CE" ? entry - SL_RE : entry + SL_RE))
    : null;

  try {
    fs.writeFileSync("bot-heartbeat.json", JSON.stringify({
      at           : new Date().toISOString(),
      strategy     : "AMINA",
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
      t1SL         : state.t1Dir ? (state.t1Dir === "CE" ? state.t1Entry - SL_T1 : state.t1Entry + SL_T1) : null,
      t1BreakLevel : state.t1BreakLevel || null,
      t1Rule       : state.t1Rule || null,
      t1Pts        : state.t1Pts,
      // Re-entry info
      reDir        : state.reDir,
      reEntry      : state.reEntry || null,
      reSymbol     : state.reSymbol || null,
      reSL         : state.reDir ? (state.reDir === "CE" ? state.reEntry - SL_RE : state.reEntry + SL_RE) : null,
      rePts        : state.rePts,
      // Day stats
      dayOpen      : state.dayOpen || null,
      dayPts       : state.dayPts,
      dayRs        : state.dayRs,
      dailyPnL     : parseFloat(livePnl.toFixed(0)),
      unrealisedPnL: inTrade ? parseFloat(livePnl.toFixed(0)) : 0,
      tradeCount   : (state.t1Dir ? 1 : 0) + (state.reDir ? 1 : 0),
      qty          : config.quantity,
      slPts        : state.phase === "IN_T1" ? SL_T1 : SL_RE,
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
    return (data ?? []).map(enrich);
  } catch (e) {
    log("CANDLE_FETCH_ERR", { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

// ── Rolling entry scan ────────────────────────────────────────────────────────
function rollingEntryScan(cs: C15[]): {
  sig: "CE" | "PE"; px: number; bl: number; rule: string;
  pairIdx: number; entryIdx: number;
} | null {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    let sig: "CE" | "PE" | null = null;
    let bl = 0, rule = "";

    if (ca.bull === cb.bull) {
      // Rule A — same color pair
      sig  = ca.bull ? "CE" : "PE";
      bl   = sig === "CE" ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
      rule = "A";
    } else if (cb.body_size > ca.body_size) {
      // Rule B — opposite color, C2 body > C1 body
      sig  = cb.bull ? "CE" : "PE";
      bl   = sig === "CE"
        ? Math.max(ca.body_high, cb.body_high)
        : Math.min(ca.body_low,  cb.body_low);
      rule = "B";
    } else {
      continue; // Rule C — skip this pair
    }

    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === "CE" && c.close > bl) return { sig, px: c.close, bl, rule, pairIdx: i, entryIdx: j };
      if (sig === "PE" && c.close < bl) return { sig, px: c.close, bl, rule, pairIdx: i, entryIdx: j };
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
      `❌ *AMINA — EXIT FAILED* (${label})\n\`${symbol}\`\nManual exit required!\n${msg}`
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
  await sendTelegram(
    `🔔 *AMINA — EOD EXIT*\n`
    + `Dir: ${dir} | Entry: ${entry.toFixed(0)} | Exit: ${price.toFixed(0)}\n`
    + `Trade P&L: *${pts >= 0 ? "+" : ""}${pts.toFixed(0)} pts*\n`
    + `Day Total: *${state.dayPts >= 0 ? "+" : ""}${state.dayPts.toFixed(0)} pts`
    + ` (Rs ${state.dayRs >= 0 ? "+" : ""}${state.dayRs.toFixed(0)})*`
  ).catch(() => {});
}

// ── Strategy tick (called every 30s) ──────────────────────────────────────────
async function tick() {
  try {
    if (!isMarketOpen()) return;

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
      state.phase        = "IN_T1";
      saveState();

      await placeTrade(symbol, res.px, config.quantity);

      const slLevel = res.sig === "CE" ? res.px - SL_T1 : res.px + SL_T1;
      log("T1_ENTRY", { sig: res.sig, entry: res.px.toFixed(0), bl: res.bl.toFixed(0), sl: slLevel.toFixed(0), rule: res.rule, symbol });

      await sendTelegram(
        `🎯 *AMINA — T1 ENTRY*\n`
        + `Dir: *${res.sig}* | Rule ${res.rule} | BL: ${res.bl.toFixed(0)}\n`
        + `Entry: *${res.px.toFixed(0)}* | SL: ${slLevel.toFixed(0)} (−50 pts)\n`
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

      if (t1Pts <= -SL_T1) {
        // SL hit
        state.t1Pts = -SL_T1;
        await doExit("T1_SL", state.t1Symbol);

        state.slClose = latest.close;
        state.slTime  = nowIST();
        log("T1_SL", { exit: latest.close.toFixed(0), pnl: -SL_T1 });

        // Re-entry filter
        const reDir: "CE" | "PE" = state.t1Dir === "CE" ? "PE" : "CE";
        const moveFromOpen  = state.slClose - state.dayOpen;
        const moveAgainstRe = reDir === "CE" ? moveFromOpen : -moveFromOpen;

        if (moveAgainstRe >= 0) {
          // Filter failed — skip re-entry
          state.dayPts = -SL_T1;
          state.dayRs  = state.dayPts * RS_PER_PT;
          state.phase  = "DONE";
          saveState();

          log("REENTRY_SKIP", { moveAgainstRe: moveAgainstRe.toFixed(0), slClose: state.slClose.toFixed(0), dayOpen: state.dayOpen.toFixed(0) });
          await sendTelegram(
            `🛑 *AMINA — T1 SL HIT* (−50 pts)\n`
            + `Dir: ${state.t1Dir} | Entry: ${state.t1Entry.toFixed(0)} | Exit: ${state.slClose.toFixed(0)}\n`
            + `⏭ *Re-entry SKIPPED* — price not favourable\n`
            + `(${state.slClose.toFixed(0)} vs open ${state.dayOpen.toFixed(0)}: ${moveAgainstRe >= 0 ? "+" : ""}${moveAgainstRe.toFixed(0)} pts)\n`
            + `Day P&L: *−50 pts (Rs −750)*`
          ).catch(() => {});
        } else {
          // Take re-entry
          const reSymbol = await getBestOptionSymbol(reDir);
          state.reDir       = reDir;
          state.reEntry     = state.slClose;
          state.reSymbol    = reSymbol;
          state.reEntryTime = nowIST();
          state.phase       = "IN_RE";
          saveState();

          await placeTrade(reSymbol, state.slClose, config.quantity);

          const reSL = reDir === "CE" ? state.slClose - SL_RE : state.slClose + SL_RE;
          log("RE_ENTRY", { dir: reDir, entry: state.slClose.toFixed(0), sl: reSL.toFixed(0), symbol: reSymbol });

          await sendTelegram(
            `🛑 *AMINA — T1 SL HIT* (−50 pts)\n`
            + `Dir: ${state.t1Dir} | Entry: ${state.t1Entry.toFixed(0)} | Exit: ${state.slClose.toFixed(0)}\n`
            + `🔄 *RE-ENTRY TAKEN*\n`
            + `Dir: *${reDir}* | Entry: *${state.slClose.toFixed(0)}*\n`
            + `SL: ${reSL.toFixed(0)} (−100 pts) | Filter: ✅ (${moveAgainstRe.toFixed(0)} pts)\n`
            + `Symbol: \`${reSymbol}\``
          ).catch(() => {});
        }
      } else {
        log("T1_MONITOR", { close: latest.close.toFixed(0), unrealised: t1Pts.toFixed(0), sl: (state.t1Dir === "CE" ? state.t1Entry - SL_T1 : state.t1Entry + SL_T1).toFixed(0) });
      }
    }

    // ── IN RE-ENTRY ────────────────────────────────────────────────────────────
    else if (state.phase === "IN_RE") {
      const rePts = state.reDir === "CE"
        ? latest.close - state.reEntry
        : state.reEntry - latest.close;
      state.rePts = rePts;

      if (rePts <= -SL_RE) {
        state.rePts  = -SL_RE;
        await doExit("RE_SL", state.reSymbol);

        state.dayPts = state.t1Pts + (-SL_RE);
        state.dayRs  = state.dayPts * RS_PER_PT;
        state.phase  = "DONE";
        saveState();

        log("RE_SL", { exit: latest.close.toFixed(0), pnl: -SL_RE, dayPts: state.dayPts });
        await sendTelegram(
          `🛑 *AMINA — RE-ENTRY SL HIT* (−100 pts)\n`
          + `Dir: ${state.reDir} | Entry: ${state.reEntry.toFixed(0)} | Exit: ${latest.close.toFixed(0)}\n`
          + `Day P&L: *${state.dayPts >= 0 ? "+" : ""}${state.dayPts} pts`
          + ` (Rs ${state.dayRs >= 0 ? "+" : ""}${state.dayRs.toFixed(0)})*\n`
          + `Done for the day.`
        ).catch(() => {});
      } else {
        log("RE_MONITOR", { close: latest.close.toFixed(0), unrealised: rePts.toFixed(0), sl: (state.reDir === "CE" ? state.reEntry - SL_RE : state.reEntry + SL_RE).toFixed(0) });
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

  log("BOT_START", { date: todayIST(), mode: config.mode, qty: config.quantity, strategy: "AMINA" });

  await sendTelegram(
    `🚀 *AMINA Strategy Started*\n`
    + `Date: ${todayIST()} | Mode: *${config.mode}*\n`
    + `Qty: ${config.quantity} | SL T1: 50 pts | SL Re: 100 pts\n`
    + `5yr backtest: Rs +10,66,085 ✅`
  ).catch(() => {});

  // Daily reset at midnight
  setInterval(resetForNewDay, 60_000);

  // Strategy tick every 30 seconds
  setInterval(tick, 30_000);

  // Run once immediately
  await tick();
}
