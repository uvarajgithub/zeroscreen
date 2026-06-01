﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import fs from "fs";
import { exec as _cpExec } from "child_process";
import { getPreviousCandle, getCurrentCandle, getTwoLastCandles, getStructureSeed, getSwingLevels, getLatest5MinCandle, getCurrentPrice, getBestOptionSymbol, getAvgCandleSize, getVWAP, getAvgVolume, getRecentCandles, getDayOpenPrice, getPrevDayHL, getPrevDayCandles, getTodayCandles, getOptionDayOHLC, getOptionLTP, getITMMonthlyOptionSymbol, getLatest1MinCandle } from "./market";
import { KiteConnect } from "kiteconnect";
import { getCandleBody, checkBreakout, isSideways, isStrongMomentum, isNearBreakout, isVwapAligned, isWeakMomentum, isStrongTrend, isBreakoutAccelerating, is15MinAligned, isBigMoveAlready, getTrailingSL, isWithinTime, isMomentumAligned, isHighWickCandle, isNearVwapChop, Candle, HybridReverseState, HybridSignal, createHybridState, processHybridCandle, trailLock50, trailDefault } from "./strategy";
import { DrishtiCandle, DrishtiState, DrishtiDir, DrishtiEntrySignal, createDrishtiState, findDrishtiEntry, findDrishtiReEntry, updateDrishtiTrail } from "./drishti_strategy";
import { placeTrade, exitTrade, stopTradingForDay, isTradingStopped, squareOffAll } from "./order";
import { config } from "./config";
import readline from "readline";
import { logTrade, logDecision } from "./logger";
import { sendTelegram as _sendTelegramRaw, notifyStrikeEOD } from "./notifier";
const sendTelegram = (msg: string) => _tgSilenced ? Promise.resolve() : _sendTelegramRaw(msg);
import { generateMonthlyReport } from "./report";

// ─── Structured logger ───────────────────────────────────
function log(event: string, details: Record<string, any> = {}) {
  const ist = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  // Human-readable console output
  const detailStr = Object.entries(details)
    .map(([k, v]) => `${k}:${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join(" | ");
  const ICONS: Record<string, string> = {
    HYBRID_CANDLE: "📊", HYBRID_SEEDED: "🌱", INTRABAR_SL_HIT: "⛔",
    ORDER_NOT_FILLED: "⚠️", ORDER_REJECTED: "❌", EXIT_FAIL: "❌",
    OPTION_SELECT_FAIL: "⚠️", BOT_START: "🟢", SKIP_CYCLE: "⏭",
    STATE_RESTORE: "💾", API_WARN: "⚠️", API_FAIL: "💥",
  };
  const icon = ICONS[event] ?? "▶";
  console.log(`${icon} [${ist}] ${event}${detailStr ? "  " + detailStr : ""}`);
  // Append JSON to crash.log for diagnostics
  const line = JSON.stringify({ time: ist, event, ...details });
  try { fs.appendFileSync("crash.log", line + "\n"); } catch (_) {}
}

// ─── State ───────────────────────────────────────────────
const kite = new KiteConnect({ api_key: config.apiKey });
kite.setAccessToken(config.accessToken);

let brokerPositions: any[] = [];
let brokerSyncInterval: NodeJS.Timeout | null = null;
let apiFailureCount = 0;
let tradeInProgress = false;
// ─── Broker-State Sync (CRITICAL) ────────────────────────
function isMarketHours(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const h = ist.getHours(), m = ist.getMinutes();
  return (h > 9 || (h === 9 && m >= 15)) && (h < 15 || (h === 15 && m <= 30));
}

async function getPositionsFromBroker(): Promise<any[]> {
  // Retry up to 3 times with 2s backoff before counting as a failure
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const positions = await kite.getPositions();
      brokerPositions = positions.net.filter((p: any) => p.quantity !== 0);
      apiFailureCount = 0; // Reset streak on success
      return brokerPositions;
    } catch (e) {
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
      try { await sendTelegram(`⚠️ *API Warning* — broker sync failed 3 times in a row. Bot continuing.`); } catch (_) {}
    }
    if (apiFailureCount >= 10 && activeTrade) {
      stopForDay = true;
      try { const _pnlS = dailyPnL >= 0 ? "+" : ""; await sendTelegram(`💥 *BOT STOPPED*\nReason: API failed ${apiFailureCount} times with an active trade\nDay P&L: ${_pnlS}${dailyPnL} pts | Trades: ${tradeCount}/${MAX_TRADES}\nRestart required`); } catch (_) {}
    }
  }
  return [];
}

async function syncBotWithBroker() {
  // Always wrap in try/catch — setInterval won't catch promise rejections
  try {
    if (!isMarketHours()) return;
    // In PAPER mode there are no real broker positions — skip sync entirely
    // to avoid incorrectly resetting paper trade state
    if ((config.mode ?? "LIVE").toUpperCase() === "PAPER") return;
    const brokerPos = await getPositionsFromBroker();
    // If broker has open positions but bot thinks flat, flatten all
    if (brokerPos.length > 0 && !activeTrade) {
      log("BROKER_SYNC", { action: "Flattening stray broker positions", brokerPos });
      try { await squareOffAll(); } catch (sqErr) {
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
  } catch (syncErr) {
    log("BROKER_SYNC_ERROR", { error: syncErr instanceof Error ? syncErr.message : String(syncErr) });
  }
}
let tradeCount        = 0;
let dailyPnL          = 0;
let stopForDay        = false;
let _tgSilenced       = false;  // once set, no more Telegram for rest of day
let _dailyPnlLogSaved = false;  // ensures daily-pnl-log.json written only once per day
let earlyEntryDone    = false;
let mainEntryDone     = false;
let pyramidDone       = false;     // Upgrade 1: pyramid scale-in
let lastTradeProfit   = false;
let consecutiveLosses = 0;
let drishtiWins    = 0;
let drishtiLosses  = 0;
let entryPrice        = 0;
let tradeSymbol       = "";
let tradeDirection: "CE" | "PE" | null = null;
let earlyQty          = 0;
let mainQty           = 0;
let pyramidQty        = 0;         // Upgrade 1: pyramid qty
let prevCandleVolume  = 0;
let avgVolume         = 0;
let avgCandleSize     = 0;
let lastExitTime: number | null = null;
let entryTime: number = 0;
let entrySlippage: number = 0;
let tradeAIScore: number = 0;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
let lastKnownPrice    = 0;  // updated each runBot cycle for live PnL display

const TOTAL_QTY        = config.quantity;
const DAILY_LOSS_CAP   = config.risk.dailyLossCap ?? 200;   // stop after 2 SL hits (-200 pts)
const MAX_TRADES       = config.risk.maxTradesPerDay ?? 3;  // allow re-entries for recovery trade
const MIN_BREAKOUT_MARGIN = config.optionSelection.minBreakoutMargin ?? 50; // min pts past body level
const TARGET_PTS       = config.tradeManagement.targetPoints ?? 0;  // legacy; kept for reference
const TRAIL_ACTIVATE_PTS = config.tradeManagement.trailActivatePts ?? 300;  // profit pts to activate reversal-candle trail
const REVERSAL_BODY_MIN  = config.tradeManagement.reversalBodyMin  ?? 75;   // min candle body pts for valid reversal candle
const SLIPPAGE_LIMIT   = 10;
const FAST_EXIT_POINTS = 40;   // Fast exit threshold for early entry probe
const TREND_TRIGGER    = 150;  // Profit at which trend mode activates

let capitalProtectionTriggered = false;
let activeTrade = false;
let trendMode   = false;       // Trend mode: hold long, trail only, allow re-entry
let trailActivated = false;    // true after profit hits TRAIL_ACTIVATE_PTS → switch to reversal-candle trailing SL
let justRestored = false;      // True for 1 cycle after state restore — blocks duplicate entry
let lastEntryCandleDate = "";  // Date key of the last completed candle seen by runBot
let prevCandleForEntry: { open: number; high: number; low: number; close: number } | null = null;  // The candle BEFORE the current one — used for breakout comparison
let candleSL = 0;              // Candle-based SL: low of breakout candle (CE) or high (PE); trails on continuation

// ─── RC Strategy state ────────────────────────────────────────────────────────
// BODY_BREAKOUT strategy:  enter directly on breakout candle
// RC_CONFIRM strategy:     Step1 — detect breakout → set rcWaiting=true
//                          Step2 — next candle = Reversal Candle → enter Trade1 at RC close
//                                  SL = RC low (CE) or RC high (PE)
//                          Step3 — if Trade1 SL hit → enter Trade2 in opposite direction
//                                  SL = that candle's low (CE) or high (PE)  Max 2 trades total
const ACTIVE_STRATEGY = config.activeStrategy ?? "BODY_BREAKOUT";
let rcWaiting         = false;  // true when breakout seen — waiting for RC to form
let rcBreakoutDir: "CE" | "PE" | null = null;  // direction of the detected breakout
let rcTrade2Active    = false;  // true when we are in Trade 2 (trend trade after T1 SL)
let rcIndexSL         = 0;      // index-price based SL for RC strategy (RC low/high)

// ─── HYBRID_REVERSE strategy state ───────────────────────────────────────────
// Signal: prevBodyHigh/Low + 25pt buffer | EarlyExit C1-3 | SL ±100 | HybridReverse
let hybridState:          HybridReverseState = createHybridState();
let pdhHigh    = 0;
let pdhLow     = 0;
let pdhContext = "NEUTRAL";  // "BULLISH" | "BEARISH" | "NEUTRAL"
let hybridPrevCandle:     Candle | null      = null;  // candle BEFORE the last completed candle
let hybridLastCandleKey:  string             = "";

// ─── SHADOW LOCK50 — runs in parallel, paper-only, no real orders ─────────────
// ── DRISHTI V1 state ─────────────────────────────────────────────────────────
let DrishtiState:          DrishtiState    = createDrishtiState();
let drishtiTodayCandles:   DrishtiCandle[] = [];
let drishtiPrevDayCandles: DrishtiCandle[] = [];
let drishtiLastCandleKey   = "";
let drishtiIntradayPeak:   number       = 0;   // updated every 60s by LTP monitor
let ltpMonitorInterval: NodeJS.Timeout | null = null;
interface DrishtiCandleLogEntry { idx: number; time: string; close: number; bodyPct: number; signal: string | null; reason: string; offline?: boolean; }
let DrishtiCandleLog: DrishtiCandleLogEntry[] = [];


let entryPremium  = 0;   // option LTP at trade entry
let lastOptionLTP = 0;   // option LTP updated every monitor cycle

// ─── ITM_HOLD strategy state ──────────────────────────────────────────────────
// Each position is an independent ITM monthly option held for up to holdDays calendar days.
// Max maxConcurrent positions at a time. SL = index-based (signal candle low/high ± slBuffer).
interface ItmlHoldPos {
  symbol: string;
  direction: "CE" | "PE";
  slIndexLevel: number;   // index price at which to exit (SL)
  exitAfter: number;      // ms timestamp — exit when Date.now() >= this
  qty: number;
}
let itmHoldPositions: ItmlHoldPos[] = [];
const ITM_HOLD_STATE_FILE = "itm-hold-state.json";

function saveITMHoldState() {
  try { fs.writeFileSync(ITM_HOLD_STATE_FILE, JSON.stringify(itmHoldPositions, null, 2)); } catch (_) {}
}

function restoreITMHoldState() {
  try {
    if (!fs.existsSync(ITM_HOLD_STATE_FILE)) return;
    const raw = fs.readFileSync(ITM_HOLD_STATE_FILE, "utf-8");
    const positions = JSON.parse(raw) as ItmlHoldPos[];
    // Drop positions whose hold period has already expired
    itmHoldPositions = positions.filter(p => Date.now() < p.exitAfter);
    log("ITM_HOLD_RESTORE", { count: itmHoldPositions.length, positions: itmHoldPositions.map(p => p.symbol) });
  } catch (e) {
    log("ITM_HOLD_RESTORE_FAIL", { error: e instanceof Error ? e.message : String(e) });
  }
}

// ─── Candle Breakout Monitor ────────────────────────────
// Fires a Telegram status once per 15-min candle at candle completion.
// Compares each completed candle vs the one before it.
let lastCandleKey = "";  // key of the last candle we already notified on
// In-memory record of the candle BEFORE the current reference (for comparison)
let anteCandle: { open: number; high: number; low: number; close: number } | null = null;

async function monitorCandleBreakouts() {
  try {
    if (!isWithinTime(9, 16, 15, 30)) return;

    // getPreviousCandle() always returns the most recently COMPLETED 15-min candle
    const prev  = await getPreviousCandle();
    const price = await getCurrentPrice();
    if (!price || price <= 0) return;
    // Guard: ensure candle has valid OHLC — bad API response returns empty/partial data
    if (!prev || !prev.high || !prev.low || !prev.open || !prev.close) {
      // Before 9:30 AM the first candle hasn't closed yet — API returning empty is expected, stay silent
      const _preIst = new Date(new Date().getTime() + 5.5 * 3600000);
      if (_preIst.getUTCHours() < 9 || (_preIst.getUTCHours() === 9 && _preIst.getUTCMinutes() < 30)) return;
      log("CANDLE_MONITOR_ERR", { reason: "Invalid candle data from API", prev });
      return;
    }

    const candleKey = (prev as any).date ?? `${prev.high}_${prev.low}`;

    // ── New 15-min candle just completed ─────────────────
    if (candleKey !== lastCandleKey) {
      // Wait 5s for Zerodha API to finalize the completed candle's close price
      await new Promise(r => setTimeout(r, 5000));
      const confirmedPrev = await getPreviousCandle();
      const confirmedKey  = (confirmedPrev as any).date ?? `${confirmedPrev.high}_${confirmedPrev.low}`;
      // Use confirmed data if it's the same candle (guards against edge-case where a new candle formed in 5s)
      const finalPrev = confirmedKey === candleKey ? confirmedPrev : prev;

      // prevCandle = what was previously in anteCandle (the candle BEFORE the just-completed one)
      const prevCandle = anteCandle;
      // Store the just-completed candle so next time it becomes the comparison base
      anteCandle    = { open: finalPrev.open, high: finalPrev.high, low: finalPrev.low, close: finalPrev.close };
      lastCandleKey = candleKey;

      const bodyHigh = Math.max(finalPrev.open, finalPrev.close);
      const bodyLow  = Math.min(finalPrev.open, finalPrev.close);
      const colour   = finalPrev.close >= finalPrev.open ? "🟢 Bullish" : "🔴 Bearish";
      const ist      = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

      let status = "🔲 First candle of session";
      let detail = "";
      if (prevCandle) {
        const aBH = Math.max(prevCandle.open, prevCandle.close);
        const aBL = Math.min(prevCandle.open, prevCandle.close);
        const brokeFullHigh = finalPrev.high > prevCandle.high;
        const brokeFullLow  = finalPrev.low  < prevCandle.low;
        const brokeBodyHigh = finalPrev.high > aBH;
        const brokeBodyLow  = finalPrev.low  < aBL;

        if (brokeFullHigh && brokeFullLow) {
          status = "↕️ Outside Bar — broke both High & Low";
        } else if (brokeFullHigh) {
          status = "📈 Broke Full High";
          detail = `Prev high: ${prevCandle.high}  →  This candle high: ${finalPrev.high}`;
        } else if (brokeFullLow) {
          status = "📉 Broke Full Low";
          detail = `Prev low: ${prevCandle.low}  →  This candle low: ${finalPrev.low}`;
        } else if (brokeBodyHigh) {
          status = "📈 Broke Body High";
          detail = `Prev body high: ${aBH}  →  This candle high: ${finalPrev.high}`;
        } else if (brokeBodyLow) {
          status = "📉 Broke Body Low";
          detail = `Prev body low: ${aBL}  →  This candle low: ${finalPrev.low}`;
        } else {
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
        const buildTriggerBlock = (
          trigCE: number, trigPE: number,
          showBoth: boolean, onlyDir?: "CE" | "PE"
        ) => {
                    const _ceDist = price - trigCE;
          const _peDist = trigPE - price;
          const ceArrow = "📈";
          const peArrow = "📉";
          const ceInfo = _ceDist >= 0 ? "\u2191 "+Math.abs(_ceDist).toFixed(0)+" pts ahead" : Math.abs(_ceDist).toFixed(0)+" pts away";
          const peInfo = _peDist >= 0 ? "\u2191 "+Math.abs(_peDist).toFixed(0)+" pts ahead" : Math.abs(_peDist).toFixed(0)+" pts away";
          let lines = "";
          if (showBoth || onlyDir === "CE") lines += `${ceArrow} CE ≥ *${trigCE}*  —  ${ceInfo}\n`;
          if (showBoth || onlyDir === "PE") lines += `${peArrow} PE ≤ *${trigPE}*  —  ${peInfo}\n`;
          lines += `Live: *${price}*`;
          return lines;
        };

        if (inTrade && tradeDirection) {
          // ── IN TRADE ────────────────────────────────────────────────────────
          const unrealised = tradeDirection === "CE" ? price - entryPrice : entryPrice - price;
          const slLevel    = hybridState.sl > 0 ? hybridState.sl : (tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100);
          const pnlSign    = unrealised >= 0 ? "+" : "";
          strategyCtx =
            `━━━━━━━━━━━━━━━━━━\n` +
            `🔵 *In Trade · ${tradeDirection}*\n` +
            `Entry: ${entryPrice}  ·  SL: ${slLevel}  (−100 pts)\n` +
            `🟢 *${pnlSign}${unrealised.toFixed(0)} pts gathered* \u00B7 SL: ${typeof slLevel === "number" ? slLevel.toFixed(0) : slLevel}\n` +
            `📊 *${dailyPnL >= 0 ? "+" : ""}${Math.round(dailyPnL)} pts*  ·  ${drishtiWins}W ${drishtiLosses}L  ·  T:${tradeCount}/5`;

        } else if (hybridState.waitReEntry && hybridState.dir) {
          // ── WATCHING FOR RE-ENTRY (after wick-only SL) ──────────────────────
          // Re-entry trigger (from strategy.ts):
          //   CE: current.close > state.refHigh  (refHigh = signal candle HIGH)
          //   PE: current.close < state.refHigh  (refHigh = signal candle LOW)
          // No extra buffer — just the candle extreme stored at entry time
          const dir      = hybridState.dir;
          const refLevel = hybridState.refHigh;
          if (refLevel > 0) {
            const arrow    = dir === "CE" ? "⬆️" : "⬇️";
            const symbol   = dir === "CE" ? ">" : "<";
            const distPts  = dir === "CE" ? (price - refLevel) : (refLevel - price);
            const distIcon = distPts >= 0 ? "✅" : "❌";
            const distStr  = `${distIcon} ${Math.abs(distPts).toFixed(0)} pts ${distPts >= 0 ? "past trigger" : "away"}`;
            strategyCtx =
              `━━━━━━━━━━━━━━━━━━\n` +
              `⏳ *Re-Entry · ${dir}*\n` +
              `Next: ${dir} close ${symbol} *${refLevel}*  ·  ${distStr}\n` +
              `Live: *${price}*\n` +
              `📊 *${dailyPnL >= 0 ? "+" : ""}${Math.round(dailyPnL)} pts*  ·  ${drishtiWins}W ${drishtiLosses}L  ·  T:${tradeCount}/5`;
          } else {
            strategyCtx =
              `━━━━━━━━━━━━━━━━━━\n` +
              `⏳ *WATCHING FOR RE-ENTRY · ${dir}*\n` +
              `⚠️ Re-entry level not available\n` +
              `📊 *${dailyPnL >= 0 ? "+" : ""}${Math.round(dailyPnL)} pts*  ·  ${drishtiWins}W ${drishtiLosses}L  ·  T:${tradeCount}/5`;
          }

        } else if (hybridState.firstDone && !hybridState.waitReEntry && !inTrade) {
          // ── DONE FOR DAY ────────────────────────────────────────────────────
          strategyCtx =
            `━━━━━━━━━━━━━━━━━━\n` +
            `✅ Done for Day\n` +
            `📊 *${dailyPnL >= 0 ? "+" : ""}${Math.round(dailyPnL)} pts*  ·  ${drishtiWins}W ${drishtiLosses}L  ·  T:${tradeCount}/5`;

        } else {
          // ── WATCHING FOR BREAKOUT (no trade yet today) ──────────────────────
          let sigStatus = "";
          if (prevCandle) {
            const refBH  = Math.max(prevCandle.open, prevCandle.close);
            const refBL  = Math.min(prevCandle.open, prevCandle.close);
            const ceLvl  = refBH + HR_BUF_MON;
            const peLvl  = refBL - HR_BUF_MON;
            if (finalPrev.close > ceLvl) {
              sigStatus = `🟢 *CE SIGNAL FIRED!*\nclose ${finalPrev.close} > ${ceLvl} (+${(finalPrev.close - ceLvl).toFixed(0)} margin)\n→ Entry order being placed\n`;
            } else if (finalPrev.close < peLvl) {
              sigStatus = `🔴 *PE SIGNAL FIRED!*\nclose ${finalPrev.close} < ${peLvl} (+${(peLvl - finalPrev.close).toFixed(0)} margin)\n→ Entry order being placed\n`;
            } else {
              const nextBH = Math.max(finalPrev.open, finalPrev.close);
              const nextBL = Math.min(finalPrev.open, finalPrev.close);
              sigStatus = buildTriggerBlock(nextBH + HR_BUF_MON, nextBL - HR_BUF_MON, true);
            }
          } else {
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
        const _bPH = drishtiPrevDayCandles.length > 0 ? Math.max(...drishtiPrevDayCandles.map((c: {high:number}) => c.high)).toFixed(0) : "?";
        const _bPL = drishtiPrevDayCandles.length > 0 ? Math.min(...drishtiPrevDayCandles.map((c: {low:number}) => c.low)).toFixed(0) : "?";
        const _bCtx = price > parseFloat(_bPH) ? "ABOVE PDH" : price < parseFloat(_bPL) ? "BELOW PDL" : "INSIDE";
        const _bSign = dailyPnL >= 0 ? "+" : "";
        if (DrishtiState.inTrade && tradeDirection) {
          const _bu = tradeDirection === "CE" ? price - entryPrice : entryPrice - price;
          const _bUS = _bu >= 0 ? "+" : "";
          const _bSL = DrishtiState.trailStop <= 0
            ? (tradeDirection === "CE" ? entryPrice - 150 : entryPrice + 150).toFixed(0)
            : (entryPrice + (tradeDirection === "CE" ? DrishtiState.trailStop : -DrishtiState.trailStop)).toFixed(0);
          const _bSLlabel = DrishtiState.trailStop <= 0 ? "Hard SL" : "Trail lock";
          strategyCtx = `In Trade (${tradeDirection}) | ${_bCtx}\n`
            + `Entry: ${entryPrice.toFixed(0)} | ${_bSLlabel}: ${_bSL}\n`
            + `P&L: ${_bUS}${_bu.toFixed(0)} pts | Peak: ${DrishtiState.peakPts.toFixed(0)} pts\n`
            + `Day: ${_bSign}${dailyPnL.toFixed(0)} | ${drishtiWins}W ${drishtiLosses}L | T:${tradeCount}/5`;
        } else if (DrishtiState.firstDone && !DrishtiState.inTrade) {
          const _re = DrishtiState.reCount < 5
            ? ` | RE #${DrishtiState.reCount + 1} watching` : "";
          strategyCtx = `Done${_re}\n`
            + `Day: ${_bSign}${dailyPnL.toFixed(0)} | ${drishtiWins}W ${drishtiLosses}L | T:${tradeCount}/5`;
        } else {
          strategyCtx = `Watching | Candle #${drishtiTodayCandles.length}\n`
            + `PDH: ${_bPH} | PDL: ${_bPL} | ${_bCtx}\n`
            + `Live: ${price} | SL: 150 pts\n`
            + `Day: ${_bSign}${dailyPnL.toFixed(0)} | T:${tradeCount}/5`;
        }
      }
      // TG_LABEL
      if (strategyCtx && ACTIVE_STRATEGY === "DRISHTI_V1") {
        strategyCtx = `━━━━━━━━━━━━━━━━━━\n📈 *DRISHTI V1*\n` + strategyCtx;
      } else if (strategyCtx) {
        strategyCtx = `━━━━━━━━━━━━━━━━━━\n🔷 *LOCK50*\n` + strategyCtx.replace(/^━━━━━━━━━━━━━━━━━━\n/, "");
      }

      // Clean candle summary line → visible in server log section
      const _bPct = finalPrev.high !== finalPrev.low
        ? Math.round(((finalPrev.close - finalPrev.open) / (finalPrev.high - finalPrev.low)) * 100)
        : 0;
      const _bSign = _bPct >= 0 ? '+' : '';
      const _cIdx = ACTIVE_STRATEGY === 'DRISHTI_V1' ? drishtiTodayCandles.length : '';
      console.log(`${new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} 🕯️ Candle${_cIdx ? ' C'+_cIdx : ''} | Close:${finalPrev.close} | Body:${_bSign}${_bPct}% | ${colour} | O:${finalPrev.open} H:${finalPrev.high} L:${finalPrev.low}`);

      // Skip candle notifications if done for the day OR no-trade day
      // Case 1: trade happened and exited (firstDone)
      // Case: DRISHTI_V1 watching all day with no trade, past C20 (~2:15 PM) — entry window effectively closed → skip TG
      const _noTradeAllDay = ACTIVE_STRATEGY === "DRISHTI_V1"
        && !DrishtiState.firstDone && !DrishtiState.inTrade && tradeCount === 0
        && drishtiTodayCandles.length > 20;
      const _doneForDay =
        _noTradeAllDay ||
        (ACTIVE_STRATEGY === "HYBRID_REVERSE" && hybridState.firstDone && !hybridState.waitReEntry && !(activeTrade || mainEntryDone || earlyEntryDone)) ||
        (ACTIVE_STRATEGY === "HYBRID_REVERSE" && stopForDay && !activeTrade);
      if (_doneForDay) {
        log("CANDLE_STATUS", { status, candle: finalPrev, price, skipped: _noTradeAllDay ? "no_trade_day_c20+" : "done_for_day" });
        return;
      }

      await sendTelegram(
        `🕯️ *15-Min Candle*  ${ist}  ${colour}\n` +
        `O: ${finalPrev.open}  H: ${finalPrev.high}  L: ${finalPrev.low}  C: ${finalPrev.close}\n` +
        (strategyCtx ? `${strategyCtx}` : "") +
        `\n━━━━━━━━━━━━━━━━━━\n` +
        `[🔑 Token](https://139-59-18-52.nip.io/login)  ·  [📊 Dashboard](http://139.59.18.52/dashboard)`
      );
      log("CANDLE_STATUS", { status, candle: finalPrev, price });
      // Write last candle to heartbeat for dashboard
      try {
        const _hbRaw = fs.existsSync("bot-heartbeat.json") ? fs.readFileSync("bot-heartbeat.json","utf-8") : "{}";
        const _hb = JSON.parse(_hbRaw);
        _hb.lastCandle = { time: ist, open: finalPrev.open, high: finalPrev.high, low: finalPrev.low, close: finalPrev.close, colour: colour.includes("Bullish") ? "bull" : "bear", status };
        fs.writeFileSync("bot-heartbeat.json", JSON.stringify(_hb));
      } catch (_) {}
    }
    // No live intra-candle alerts — notification fires once per candle at completion only
  } catch (e) {
    const _cm = (e instanceof Error ? e.message : String(e)).toLowerCase();
    if (_cm.includes("incorrect") && (_cm.includes("api_key") || _cm.includes("access_token"))) {
      if (Date.now() - tokenAlertLastSent > 30 * 60 * 1000) {
        tokenAlertLastSent = Date.now();
        const _cist = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
        sendTelegram(
          `🔴 *TOKEN EXPIRED — Action Required*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Zerodha access token is invalid or expired.\n` +
          `*Bot is not trading until you re-authenticate.*\n\n` +
          `➡ Open this link, log in & paste the redirect URL:\n` +
          `https://139-59-18-52.nip.io/login\n\n` +
          `⏰ Detected at: ${_cist} IST`
        ).catch(() => {});
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
      inTrade:     hybridState.inTrade,
      dir:         hybridState.dir,
      entry:       hybridState.entry,
      sl:          hybridState.sl,
      refHigh:     hybridState.refHigh,
      firstDone:   hybridState.firstDone,
      reUsed:      hybridState.reUsed,
      waitReEntry: hybridState.waitReEntry,
      isC1:        hybridState.isC1,
    },
    // DRISHTI_V1 live state — must survive restarts
    drishtiState: {
      inTrade:     DrishtiState.inTrade,
      dir:         DrishtiState.dir,
      entry:       DrishtiState.entry,
      entryIdx:    DrishtiState.entryIdx,
      trailStop:   DrishtiState.trailStop,
      peakPts:     DrishtiState.peakPts,
      firstDone:   DrishtiState.firstDone,
      reCount:     DrishtiState.reCount,
      lastExitPts: DrishtiState.lastExitPts,
      lastExitIdx: DrishtiState.lastExitIdx,
      lastExitDir: DrishtiState.lastExitDir,
    },
  };
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    log("STATE_SAVE_FAIL", { error: e instanceof Error ? e.message : String(e) });
  }
}

function clearTradeState() {
  try {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  } catch (e) {
    log("STATE_CLEAR_FAIL", { error: e instanceof Error ? e.message : String(e) });
  }
  entryPremium  = 0;
  lastOptionLTP = 0;
}

function restoreTradeState(): boolean {
  try {
    if (!fs.existsSync(STATE_FILE)) { log("STATE_RESTORE", { action: "No state file found" }); return false; }
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const s = JSON.parse(raw);
    // Only restore if state was saved today — compare ISO date strings (YYYY-MM-DD) in IST
    // Avoids locale-format inconsistencies on Windows with toLocaleDateString()
    const savedIST  = new Date(new Date(s.savedAt).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const todayIST  = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const savedDate = `${savedIST.getFullYear()}-${savedIST.getMonth()}-${savedIST.getDate()}`;
    const todayDate = `${todayIST.getFullYear()}-${todayIST.getMonth()}-${todayIST.getDate()}`;
    if (savedDate !== todayDate) {
      log("STATE_RESTORE", { action: "Stale state ignored (different day)", savedDate, todayDate });
      clearTradeState();
      return false;
    }
    earlyEntryDone   = s.earlyEntryDone   ?? false;
    mainEntryDone    = s.mainEntryDone    ?? false;
    activeTrade      = s.activeTrade      ?? (s.mainEntryDone || s.earlyEntryDone) ?? false;
    pyramidDone      = s.pyramidDone      ?? false;
    tradeDirection   = s.tradeDirection   ?? null;
    tradeSymbol      = s.tradeSymbol      ?? "";
    entryPrice       = s.entryPrice       ?? 0;
    earlyQty         = s.earlyQty         ?? 0;
    mainQty          = s.mainQty          ?? 0;
    pyramidQty       = s.pyramidQty       ?? 0;
    entryTime        = s.entryTime        ?? 0;
    entrySlippage    = s.entrySlippage    ?? 0;
    tradeAIScore     = s.tradeAIScore     ?? 0;
    tradeCount       = s.tradeCount       ?? 0;
    dailyPnL         = s.dailyPnL         ?? 0;
    consecutiveLosses = s.consecutiveLosses ?? 0;
    lastTradeProfit  = s.lastTradeProfit  ?? false;
    trendMode        = s.trendMode        ?? false;
    candleSL         = s.candleSL         ?? 0;
    trailActivated   = s.trailActivated   ?? false;
    rcWaiting        = s.rcWaiting        ?? false;
    rcBreakoutDir    = s.rcBreakoutDir    ?? null;
    rcTrade2Active   = s.rcTrade2Active   ?? false;
    rcIndexSL        = s.rcIndexSL        ?? 0;
    entryPremium     = s.entryPremium     ?? 0;
    // Restore LOCK50 live stats
    drishtiWins   = s.drishtiWins   ?? 0;
    drishtiLosses = s.drishtiLosses ?? 0;
    // Restore HYBRID_REVERSE state so waitReEntry / refHigh survive PM2 restarts
    if (s.hybridState) {
      hybridState.inTrade     = s.hybridState.inTrade     ?? false;
      hybridState.dir         = s.hybridState.dir         ?? null;
      hybridState.entry       = s.hybridState.entry       ?? 0;
      hybridState.sl          = s.hybridState.sl          ?? 0;
      hybridState.refHigh     = s.hybridState.refHigh     ?? 0;
      hybridState.firstDone   = s.hybridState.firstDone   ?? false;
      hybridState.reUsed      = s.hybridState.reUsed      ?? false;
      hybridState.waitReEntry = s.hybridState.waitReEntry ?? false;
      hybridState.isC1        = s.hybridState.isC1        ?? false;
    }
    // Restore DRISHTI_V1 state so active trades survive PM2 restarts
    if (s.drishtiState) {
      DrishtiState.inTrade     = s.drishtiState.inTrade     ?? false;
      DrishtiState.dir         = s.drishtiState.dir         ?? null;
      DrishtiState.entry       = s.drishtiState.entry       ?? 0;
      DrishtiState.entryIdx    = s.drishtiState.entryIdx    ?? -1;
      DrishtiState.trailStop   = s.drishtiState.trailStop   ?? -150;
      DrishtiState.peakPts     = s.drishtiState.peakPts     ?? 0;
      DrishtiState.firstDone   = s.drishtiState.firstDone   ?? false;
      DrishtiState.reCount     = s.drishtiState.reCount     ?? 0;
      DrishtiState.lastExitPts = s.drishtiState.lastExitPts ?? 0;
      DrishtiState.lastExitIdx = s.drishtiState.lastExitIdx ?? -1;
      DrishtiState.lastExitDir = s.drishtiState.lastExitDir ?? null;
    } else if ((s.tradeCount ?? 0) > 0) {
      // Fallback for old state files that didn't save drishtiState:
      // tradeCount > 0 means at least one trade happened today → firstDone must be true.
      // Set synchronously here so the trading interval never sees firstDone=false
      // (the async backfill reconstruction had a race condition on multi-restart days).
      DrishtiState.firstDone   = true;
      DrishtiState.lastExitPts = 0;   // unknown — gate OFF, any exit qualifies for re-entry
      log("STATE_RESTORE", { action: "DrishtiState.firstDone=true inferred from tradeCount (no drishtiState in file)" });
    }
    log("STATE_RESTORE", {
      action: "Trade state restored from file",
      symbol: tradeSymbol, direction: tradeDirection, entryPrice, mainEntryDone, activeTrade, candleSL,
    });
    return true;
  } catch (e) {
    log("STATE_RESTORE_FAIL", { error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

// ─── AI Score helper ─────────────────────────────────────
function computeAIScore(conditions: boolean[]): number {
  const passed = conditions.filter(Boolean).length;
  return Math.round((passed / conditions.length) * 100) / 100;
}

// ─── Real-time Status ────────────────────────────────────
function printStatus() {
  const ist = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const mode = (config.mode || "LIVE").toUpperCase();
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
    const _pdH = drishtiPrevDayCandles.length > 0 ? Math.max(...drishtiPrevDayCandles.map((c: {high:number}) => c.high)).toFixed(0) : "?";
    const _pdL = drishtiPrevDayCandles.length > 0 ? Math.min(...drishtiPrevDayCandles.map((c: {low:number}) => c.low)).toFixed(0) : "?";
    const _hhmm = ist.split(',')[1]?.trim().slice(0, 8) ?? ist;
    console.log(`[${_hhmm}] [${mode}] DRISHTI: ${pnlSign}${livePnL.toFixed(0)}pts  T:${tradeCount}/${MAX_TRADES}  ${tradeStatus}  PDH:${_pdH} PDL:${_pdL} C${drishtiTodayCandles.length}`);
  } else {
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
    log("STATE_RESET", { strategy: "ITM_HOLD", openPositions: itmHoldPositions.length });
  }

  // Stop new entries at 14:55 — existing positions continue to be monitored until SL/time-exit
  if (h >= 15 || (h === 14 && m >= 55)) stopForDay = true;

  if (!isWithinTime(9, 15, 15, 30)) return;

  const price = await getCurrentPrice();
  if (!price || price <= 0) { log("SKIP_CYCLE", { reason: "ITM_HOLD invalid price" }); return; }
  lastKnownPrice = price;

  // ── 1. Monitor open positions: check SL and time-exit ─────────────────────
  const toExit: ItmlHoldPos[] = [];
  for (const pos of itmHoldPositions) {
    const slHit      = pos.direction === "CE" ? price < pos.slIndexLevel : price > pos.slIndexLevel;
    const timeExpired = Date.now() >= pos.exitAfter;
    if (!slHit && !timeExpired) continue;

    const reason = slHit ? "SL_HIT" : "HOLD_EXPIRED";
    log("ITM_HOLD_EXIT", { symbol: pos.symbol, reason, price, sl: pos.slIndexLevel, direction: pos.direction });
    try {
      await exitTrade(pos.symbol, pos.qty);
      let exitLTP = 0;
      try { exitLTP = await getOptionLTP(pos.symbol); } catch (_) {}
      await sendTelegram(
        `🔴 *ITM Hold Exit* (${reason})\nSymbol: \`${pos.symbol}\`\nDir: ${pos.direction} | Index: ${price}\nSL was: ${pos.slIndexLevel} | Option LTP: ${exitLTP}`
      );
      logTrade({ date: new Date().toISOString(), type: "ITM_HOLD", direction: pos.direction, entryPrice: 0, exitPrice: exitLTP, pnl: 0, reasonEntry: "bb_breakout", reasonExit: reason.toLowerCase(), aiScore: 1, slippage: 0, duration: Math.round((Date.now() - (pos.exitAfter - (config.itmHold?.holdDays ?? 3) * 24 * 3600 * 1000)) / 1000) });
    } catch (e) {
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
  const maxConcurrent = config.itmHold?.maxConcurrent ?? 2;
  if (itmHoldPositions.length >= maxConcurrent) return;
  if (stopForDay) return;
  if (!isWithinTime(9, 30, 14, 50)) return; // entry only within trading window

  // Detect 15-min BB candle signal (reuses shared prevCandleForEntry / lastEntryCandleDate state)
  const candle = await getPreviousCandle();
  const candleDate = (candle as any).date ?? `${candle.high}_${candle.low}`;

  // Seed on first cycle
  if (lastEntryCandleDate === "") {
    try {
      const { refCandle } = await getStructureSeed();
      prevCandleForEntry  = refCandle;
    } catch (_) {}
    lastEntryCandleDate = candleDate;
    return; // wait for next candle
  }

  const newCandleCompleted = candleDate !== lastEntryCandleDate;
  if (!newCandleCompleted) return; // only enter at candle completion
  lastEntryCandleDate = candleDate;

  // BB signal: close > prev candle body high + MIN_BREAKOUT_MARGIN (CE)
  //            close < prev candle body low  - MIN_BREAKOUT_MARGIN (PE)
  let signal: "CE" | "PE" | null = null;
  if (prevCandleForEntry) {
    const prevBodyHigh = Math.max(prevCandleForEntry.open, prevCandleForEntry.close);
    const prevBodyLow  = Math.min(prevCandleForEntry.open, prevCandleForEntry.close);
    if (candle.close > prevBodyHigh + MIN_BREAKOUT_MARGIN)     signal = "CE";
    else if (candle.close < prevBodyLow - MIN_BREAKOUT_MARGIN) signal = "PE";
  }
  // Always advance reference candle (same as BODY_BREAKOUT behaviour)
  prevCandleForEntry = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };

  if (!signal) { log("ITM_HOLD_NO_SIGNAL", { close: candle.close }); return; }

  log("ITM_HOLD_SIGNAL", { signal, close: candle.close, candleDate });

  // ── Get ITM monthly option ─────────────────────────────────────────────────
  const strikeOffset = config.itmHold?.strikeOffset ?? 1000;
  const minDTE       = config.itmHold?.minDTE       ?? 15;
  const holdDays     = config.itmHold?.holdDays     ?? 3;
  const slBuffer     = config.itmHold?.slBuffer     ?? 50;
  const qty          = config.quantity;

  let symbol = "";
  try {
    symbol = await Promise.race([
      getITMMonthlyOptionSymbol(signal, strikeOffset, minDTE),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error("getITMMonthlyOptionSymbol timeout")), 15000))
    ]);
  } catch (e) {
    log("ITM_HOLD_OPTION_FAIL", { error: e instanceof Error ? e.message : String(e) });
    return;
  }

  // SL level: index must breach signal candle's low (CE) or high (PE) with small buffer
  const slLevel  = signal === "CE" ? candle.low - slBuffer : candle.high + slBuffer;
  const exitAfter = Date.now() + holdDays * 24 * 3600 * 1000;

  let optionLTP = 0;
  try { optionLTP = await getOptionLTP(symbol); } catch (_) {}

  log("ITM_HOLD_ENTRY", { symbol, signal, slLevel, holdDays, exitAfterIST: new Date(exitAfter).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), optionLTP });

  // ── Place order ────────────────────────────────────────────────────────────
  try {
    tradeInProgress = true;
    const orderResult = await placeTrade(symbol, price, qty);
    tradeInProgress = false;
    if (!orderResult || orderResult.status !== "COMPLETE" || orderResult.filled_quantity <= 0) {
      log("ORDER_NOT_FILLED", { orderResult });
      return;
    }
  } catch (e) {
    tradeInProgress = false;
    log("ORDER_REJECTED", { error: e instanceof Error ? e.message : String(e) });
    return;
  }

  itmHoldPositions.push({ symbol, direction: signal, slIndexLevel: slLevel, exitAfter, qty });
  saveITMHoldState();
  tradeCount++;

  await sendTelegram(
    `🟢 *ITM Hold Entry*\nSymbol: \`${symbol}\`\nDir: ${signal} | Spot: ${price}\nSL Index: ${slLevel} | Hold: ${holdDays} days\nExit by: ${new Date(exitAfter).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\nOption LTP: ${optionLTP} | Qty: ${qty}`
  ).catch(() => {});
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
    hybridState           = createHybridState();
    hybridPrevCandle      = null;
    hybridLastCandleKey   = "";
    stopForDay            = false;
    capitalProtectionTriggered = false;
    dailyPnL              = 0;
    tradeCount            = 0;
    consecutiveLosses     = 0;
    activeTrade           = false;
    mainEntryDone         = false;
    tradeDirection        = null;
    tradeSymbol           = "";
    entryPrice            = 0;
    entryTime             = 0;
    drishtiWins   = 0;
    drishtiLosses = 0;
    log("STATE_RESET", { strategy: "HYBRID_REVERSE" });
    // Fetch previous day high/low for PDH/PDL context (non-blocking)
    pdhHigh = 0; pdhLow = 0; pdhContext = "NEUTRAL";
    getPrevDayHL().then(({ high, low }) => {
      pdhHigh = high; pdhLow = low;
      log("PDH_FETCHED", { pdhHigh, pdhLow });
    }).catch(e => log("PDH_FETCH_FAIL", { error: String(e) }));
  }

  if (!isWithinTime(9, 15, 15, 30)) return;

  const price = await getCurrentPrice();
  if (!price || price <= 0) { log("SKIP_CYCLE", { reason: "invalid price" }); return; }
  lastKnownPrice = price;
  printStatus();

  // ── Capital protection ─────────────────────────────────────────────────────
  const maxDrawdown = config.capital * (config.capitalDrawdownPercent / 100);
  if (dailyPnL <= -DAILY_LOSS_CAP || Math.abs(dailyPnL) >= maxDrawdown) {
    if (activeTrade && tradeSymbol) {
      try { await exitTrade(tradeSymbol, config.quantity); } catch (_) {}
      activeTrade = false; mainEntryDone = false;
      hybridState = createHybridState();
    }
    if (!stopForDay) {
      stopForDay = true;
      await notifyDailyLoss(dailyPnL).catch(() => {});
    }
    return;
  }

  if (stopForDay && !activeTrade) return;

  // ── Intrabar SL monitoring — exit immediately when price touches SL ────────
  // (Hybrid reverse is decided at candle close; intrabar = plain exit only)
  if (activeTrade && hybridState.inTrade && hybridState.sl > 0 && tradeSymbol) {
    const slHit = hybridState.dir === "CE"
      ? false  // CANDLE_SL: disabled intrabar, handled at candle close  // CANDLE_SL_PENDING
      : false; // CANDLE_SL: disabled intrabar, handled at candle close
    if (slHit) {
      const capturedEntry  = entryPrice;
      const capturedDir    = tradeDirection;
      const capturedTime   = entryTime;
      const capturedSymbol = tradeSymbol;
      const pts = hybridState.dir === "CE"
        ? hybridState.sl - hybridState.entry
        : hybridState.entry - hybridState.sl;
      log("INTRABAR_SL_HIT", { dir: hybridState.dir, price, sl: hybridState.sl, pts });
      try { await exitTrade(tradeSymbol, config.quantity); } catch (e) {
        log("EXIT_FAIL", { error: e instanceof Error ? e.message : String(e) });
      }
      dailyPnL += pts;
      if (pts <= 0) consecutiveLosses++;
      if (pts > 0) drishtiWins++; else drishtiLosses++;
      activeTrade = false; mainEntryDone = false;
      tradeDirection = null; tradeSymbol = ""; entryPrice = 0; entryTime = 0;
      entryPremium = 0; lastOptionLTP = 0;
      // Update internal state: SL hit but candle not closed yet → allow re-entry next candle
      hybridState.inTrade = false;
      if (!hybridState.reUsed) hybridState.waitReEntry = true;
      saveTradeState();
      await notifyExit(price, pts, "SL hit (intrabar)", { dir: capturedDir, entry: capturedEntry, symbol: capturedSymbol, qty: config.quantity }).catch(() => {});
      const premiumAtIntrabarSl = capturedSymbol ? await getOptionLTP(capturedSymbol).catch(() => 0) : 0;
      logTrade({ date: new Date().toISOString(), type: "HYBRID_REVERSE", direction: capturedDir ?? "CE", symbol: capturedSymbol, premiumExit: premiumAtIntrabarSl, entryPrice: capturedEntry, exitPrice: price, pnl: pts, reasonEntry: "hybrid_breakout", reasonExit: "sl_intrabar", aiScore: 1, slippage: 0, duration: capturedTime > 0 ? Math.round((Date.now() - capturedTime) / 1000) : 0 });
      return;
    }
  }

  // ── Detect new 15-min candle completion ───────────────────────────────────
  const candle = await getPreviousCandle();
  if (!candle || !candle.open || !candle.close) { log("SKIP_CYCLE", { reason: "invalid candle" }); return; }
  const candleKey = (candle as any).date ?? `${candle.high}_${candle.low}`;

  // Seed on first cycle: store the completed candle as the reference prev-candle
  if (hybridLastCandleKey === "") {
    hybridPrevCandle    = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };
    hybridLastCandleKey = candleKey;
    log("HYBRID_SEEDED", { candle: hybridPrevCandle });
    return;
  }

  if (candleKey === hybridLastCandleKey) return;  // same candle, no new close
  hybridLastCandleKey = candleKey;

  if (!hybridPrevCandle) {
    hybridPrevCandle = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };
    // Set PDH/PDL context based on first candle close
    if (pdhHigh > 0 && pdhLow > 0) {
      if (candle.close > pdhHigh)      pdhContext = "BULLISH";
      else if (candle.close < pdhLow)  pdhContext = "BEARISH";
      else                             pdhContext = "NEUTRAL";
      log("PDH_CONTEXT_SET", { pdhHigh, pdhLow, firstClose: candle.close, pdhContext });
    }
    return;
  }

  const currentCandle: Candle = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };
  const isEOD = h > 15 || (h === 15 && m >= 15);

  // ── Process candle through strategy ───────────────────────────────────────
  const prevBodyHigh = Math.max(hybridPrevCandle.open, hybridPrevCandle.close);
  const prevBodyLow  = Math.min(hybridPrevCandle.open, hybridPrevCandle.close);
  const sig: HybridSignal = processHybridCandle(hybridState, hybridPrevCandle, currentCandle, isEOD, trailLock50);
  hybridPrevCandle = currentCandle;  // advance reference

  log("HYBRID_CANDLE", { action: sig.action, close: candle.close, prevBodyHigh, prevBodyLow, sl: hybridState.sl, dir: hybridState.dir });

  // ── Act on signal ──────────────────────────────────────────────────────────
  // DRISHTI_V1 has its own runner below — skip legacy hybrid signal processing for DRISHTI_V1
  if (ACTIVE_STRATEGY !== "DRISHTI_V1") switch (sig.action) {

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
        const capturedDir   = tradeDirection;
        const capturedTime  = entryTime;
        const slPts = hybridState.dir === "CE"
          ? (hybridState.entry > 0 ? (sig.price + HR_SL_PTS_LOCAL) - hybridState.entry : -100)
          : -100;
        try { await exitTrade(tradeSymbol, config.quantity); } catch (e) {
          log("EXIT_FAIL", { error: e instanceof Error ? e.message : String(e) }); return;
        }
        activeTrade = false; mainEntryDone = false;
        const exitPts = capturedDir === "CE"
          ? sig.price - capturedEntry   // entry of reverse = close of SL candle
          : capturedEntry - sig.price;
        // P&L of the exited leg is approximately −100 pts (SL level)
        const exitedPts = capturedDir === "CE"
          ? (sig.price - 100) - capturedEntry  // approximation: exited at SL (entry−100)
          : capturedEntry - (sig.price + 100);
        dailyPnL += -100; if (-100 < 0) consecutiveLosses++;
        drishtiLosses++;
        await sendTelegram(
          `🔄 *REVERSE — ${capturedDir} exited, ${sig.dir} entered*\n` +
          `Exited ${capturedDir} at index: ${sig.price} | P&L: *−100 pts ≈ −₹${(100 * config.quantity * 0.5).toLocaleString("en-IN")}* (est)\n` +
          `New direction: *${sig.dir}* | New SL: ${sig.sl}\n` +
          `Day P&L so far: ${dailyPnL >= 0 ? "+" : ""}${dailyPnL} pts`
        ).catch(() => {});
        logTrade({ date: new Date().toISOString(), type: "HYBRID_REVERSE", direction: capturedDir ?? "CE", symbol: capturedDir === "CE" ? tradeSymbol : tradeSymbol, premiumExit: 0, entryPrice: capturedEntry, exitPrice: sig.price, pnl: -100, reasonEntry: "hybrid_breakout", reasonExit: "sl_reverse", aiScore: 1, slippage: 0, duration: capturedTime > 0 ? Math.round((Date.now() - capturedTime) / 1000) : 0 });
        tradeDirection = null; tradeSymbol = ""; entryPrice = 0; entryTime = 0;
      }

      // Get option symbol and enter
      let sym = "";
      try {
        sym = await Promise.race([
          getBestOptionSymbol(sig.dir),
          new Promise<string>((_, rej) => setTimeout(() => rej(new Error("option select timeout")), 10000)),
        ]);
      } catch (e) {
        log("OPTION_SELECT_FAIL", { error: String(e) });
        hybridState = createHybridState();  // reset so we can re-try next signal
        return;
      }

      const freshPrice = await getCurrentPrice();
      tradeDirection = sig.dir;
      tradeSymbol    = sym;
      entryPrice     = sig.price;   // index entry level (for PnL tracking)
      mainQty        = config.quantity;
      mainEntryDone  = true;
      activeTrade    = true;
      entryTime      = Date.now();

      try {
        tradeInProgress = true;
        const order = await placeTrade(sym, freshPrice, config.quantity);
        tradeInProgress = false;
        if (!order || order.status !== "COMPLETE" || order.filled_quantity <= 0) {
          log("ORDER_NOT_FILLED", { order });
          mainEntryDone = false; activeTrade = false; tradeDirection = null;
          tradeSymbol = ""; entryPrice = 0; entryTime = 0;
          hybridState = createHybridState();
          return;
        }
      } catch (e) {
        tradeInProgress = false;
        log("ORDER_REJECTED", { error: e instanceof Error ? e.message : String(e) });
        mainEntryDone = false; activeTrade = false; tradeDirection = null;
        tradeSymbol = ""; entryPrice = 0; entryTime = 0;
        hybridState = createHybridState();
        stopTradingForDay(); stopForDay = true;
        return;
      }

      tradeCount++;
      saveTradeState();
      await sendTelegram(
        `📥 *${sig.action === "REVERSE_ENTER" ? "🔄 REVERSE" : "🚀 BREAKOUT"} ENTRY — ${sig.dir}*\n` +
        `Symbol: \`${sym}\`\n` +
        `Premium: *₹${freshPrice}* | Qty: ${config.quantity} lots\n` +
        `Index entry: *${sig.price}* | SL: ${sig.sl} (−100 pts)\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Capital deployed: *₹${(freshPrice * config.quantity).toLocaleString("en-IN")}*\n` +
        `C1 exit: −3 pts | Re-entry allowed: ${!hybridState.reUsed ? "Yes" : "No"}`
      ).catch(() => {});
      const premiumAtEntry = await getOptionLTP(sym).catch(() => 0);
      entryPremium  = premiumAtEntry;
      lastOptionLTP = premiumAtEntry;
      logTrade({ date: new Date().toISOString(), type: "HYBRID_REVERSE", direction: sig.dir, symbol: sym, premiumEntry: premiumAtEntry, premiumExit: 0, entryPrice: sig.price, exitPrice: 0, pnl: 0, reasonEntry: sig.action.toLowerCase(), reasonExit: "", aiScore: 1, slippage: Math.abs(freshPrice - sig.price), duration: 0 });
      break;
    }

    case "EXIT_EARLY": {
      if (!tradeSymbol) break;
      const capturedEntry  = entryPrice;
      const capturedDir    = tradeDirection;
      const capturedTime   = entryTime;
      const capturedSymbol = tradeSymbol;
      try { await exitTrade(tradeSymbol, config.quantity); } catch (e) {
        log("EXIT_FAIL", { error: e instanceof Error ? e.message : String(e) });
      }
      dailyPnL += sig.pts; consecutiveLosses++;
      if (sig.pts > 0) drishtiWins++; else drishtiLosses++;
      activeTrade = false; mainEntryDone = false;
      tradeDirection = null; tradeSymbol = ""; entryPrice = 0; entryTime = 0;
      entryPremium = 0; lastOptionLTP = 0;
      saveTradeState();
      await notifyExit(price, sig.pts, `Early exit C1-3 (−${Math.abs(sig.pts)} pts) | Mod-A reset`, { dir: capturedDir, entry: capturedEntry, symbol: capturedSymbol, qty: config.quantity }).catch(() => {});
      const premiumAtEarlyExit = capturedSymbol ? await getOptionLTP(capturedSymbol).catch(() => 0) : 0;
      logTrade({ date: new Date().toISOString(), type: "HYBRID_REVERSE", direction: capturedDir ?? "CE", symbol: capturedSymbol, premiumExit: premiumAtEarlyExit, entryPrice: capturedEntry, exitPrice: price, pnl: sig.pts, reasonEntry: "hybrid_breakout", reasonExit: "early_exit_c1", aiScore: 1, slippage: 0, duration: capturedTime > 0 ? Math.round((Date.now() - capturedTime) / 1000) : 0 });
      break;
    }

    case "EXIT_SL": {
      if (!tradeSymbol) break;
      const capturedEntry  = entryPrice;
      const capturedDir    = tradeDirection;
      const capturedTime   = entryTime;
      const capturedSymbol = tradeSymbol;
      try { await exitTrade(tradeSymbol, config.quantity); } catch (e) {
        log("EXIT_FAIL", { error: e instanceof Error ? e.message : String(e) });
      }
      dailyPnL += sig.pts; consecutiveLosses++;
      if (sig.pts > 0) drishtiWins++; else drishtiLosses++;
      activeTrade = false; mainEntryDone = false;
      tradeDirection = null; tradeSymbol = ""; entryPrice = 0; entryTime = 0;
      entryPremium = 0; lastOptionLTP = 0;
      saveTradeState();
      await notifyExit(price, sig.pts, "SL −100 pts (wick, no reverse)", { dir: capturedDir, entry: capturedEntry, symbol: capturedSymbol, qty: config.quantity }).catch(() => {});
      const premiumAtSlExit = capturedSymbol ? await getOptionLTP(capturedSymbol).catch(() => 0) : 0;
      logTrade({ date: new Date().toISOString(), type: "HYBRID_REVERSE", direction: capturedDir ?? "CE", symbol: capturedSymbol, premiumExit: premiumAtSlExit, entryPrice: capturedEntry, exitPrice: price, pnl: sig.pts, reasonEntry: "hybrid_breakout", reasonExit: "sl_wick", aiScore: 1, slippage: 0, duration: capturedTime > 0 ? Math.round((Date.now() - capturedTime) / 1000) : 0 });
      break;
    }

    case "EXIT_EOD": {
      if (!tradeSymbol) break;
      const capturedEntry  = entryPrice;
      const capturedDir    = tradeDirection;
      const capturedTime   = entryTime;
      const capturedSymbol = tradeSymbol;
      try { await exitTrade(tradeSymbol, config.quantity); } catch (e) {
        log("EXIT_FAIL", { error: e instanceof Error ? e.message : String(e) });
      }
      dailyPnL += sig.pts;
      if (sig.pts > 0) { lastTradeProfit = true; consecutiveLosses = 0; } else consecutiveLosses++;
      if (sig.pts > 0) drishtiWins++; else drishtiLosses++;
      activeTrade = false; mainEntryDone = false;
      tradeDirection = null; tradeSymbol = ""; entryPrice = 0; entryTime = 0;
      hybridState = createHybridState();
      stopForDay = true;
      saveTradeState();
      await notifyExit(price, sig.pts, "EOD exit 3:15 PM", { dir: capturedDir, entry: capturedEntry, symbol: capturedSymbol, qty: config.quantity }).catch(() => {});
      await sendEODSummary().catch(() => {});
      generateMonthlyReport().catch(e => log("REPORT_FAIL", { error: e?.message }));
      const premiumAtEod = capturedSymbol ? await getOptionLTP(capturedSymbol).catch(() => 0) : 0;
      logTrade({ date: new Date().toISOString(), type: "HYBRID_REVERSE", direction: capturedDir ?? "CE", symbol: capturedSymbol, premiumExit: premiumAtEod, entryPrice: capturedEntry, exitPrice: price, pnl: sig.pts, reasonEntry: "hybrid_breakout", reasonExit: "eod_3:15", aiScore: 1, slippage: 0, duration: capturedTime > 0 ? Math.round((Date.now() - capturedTime) / 1000) : 0 });
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
const DRISHTI_TRAIL_GAP = 10;  // LOCK10 — same as backtest_verify.js V15 config
const DRISHTI_SL_PTS    = 150; // Hard SL — same as backtest

function stopDrishtiLTPMonitor() {
  if (ltpMonitorInterval) { clearInterval(ltpMonitorInterval); ltpMonitorInterval = null; }
  drishtiIntradayPeak = 0;
  log("LTP_MONITOR_STOP", {});
}

async function executeDrishtiLTPExit(ltp: number, pts: number, reason: string) {
  if (!activeTrade || !DrishtiState.inTrade) return;
  const capturedEntry        = entryPrice;
  const capturedDir          = tradeDirection;
  const capturedTime         = entryTime;
  const capturedSymbol       = tradeSymbol;
  const capturedPeak         = drishtiIntradayPeak;
  const capturedPremiumEntry = entryPremium;
  const capturedPremiumExit  = lastOptionLTP;

  stopDrishtiLTPMonitor();
  const exitOptionLTP = await getOptionLTP(capturedSymbol).catch(() => 0);

  try { await exitTrade(tradeSymbol, config.quantity); } catch (e) {
    log("EXIT_FAIL", { error: e instanceof Error ? e.message : String(e) });
  }

  dailyPnL += pts;
  if (pts > 0) { consecutiveLosses = 0; drishtiWins++; } else { consecutiveLosses++; drishtiLosses++; }

  DrishtiState.inTrade      = false;
  DrishtiState.firstDone    = true;
  DrishtiState.lastExitPts  = capturedPeak;
  DrishtiState.lastExitIdx  = drishtiTodayCandles.length - 1;
  DrishtiState.lastExitDir  = capturedDir as DrishtiDir;

  activeTrade = false; mainEntryDone = false;
  tradeDirection = null; tradeSymbol = ""; entryPrice = 0; entryTime = 0;
  entryPremium = 0; lastOptionLTP = 0;

  saveTradeState();
  await notifyExit(ltp, pts, reason, { dir: capturedDir, entry: capturedEntry, symbol: capturedSymbol, qty: config.quantity }).catch(() => {});
  logTrade({ date: new Date().toISOString(), type: "DRISHTI_V1", direction: capturedDir ?? "CE", symbol: capturedSymbol, premiumEntry: capturedPremiumEntry, premiumExit: exitOptionLTP, qty: config.quantity, entryPrice: capturedEntry, exitPrice: ltp, pnl: pts, reasonEntry: "drishti_entry", reasonExit: reason, aiScore: 1, slippage: 0, duration: capturedTime > 0 ? Math.round((Date.now() - capturedTime) / 1000) : 0 });
}

function startDrishtiLTPMonitor() {
  if (ltpMonitorInterval) return;  // already running
  drishtiIntradayPeak = 0;

  ltpMonitorInterval = setInterval(async () => {
    if (!activeTrade || !DrishtiState.inTrade || !tradeDirection || entryPrice <= 0) {
      stopDrishtiLTPMonitor(); return;
    }
    if (!isWithinTime(9, 15, 15, 30)) { stopDrishtiLTPMonitor(); return; }
    try {
      const ltp = await getCurrentPrice();
      if (!ltp || ltp <= 0) return;
      lastKnownPrice = ltp;

      const sign = tradeDirection === "CE" ? 1 : -1;
      const pts  = sign * (ltp - entryPrice);

      // Update intraday peak and sync to DrishtiState
      if (pts > drishtiIntradayPeak) {
        drishtiIntradayPeak = pts;
        const newTrail = drishtiIntradayPeak >= DRISHTI_TRAIL_GAP ? drishtiIntradayPeak - DRISHTI_TRAIL_GAP : -DRISHTI_SL_PTS;
        if (drishtiIntradayPeak > DrishtiState.peakPts) {
          DrishtiState.peakPts   = drishtiIntradayPeak;
          DrishtiState.trailStop = newTrail;
        }
      }

      const currentTrail = drishtiIntradayPeak >= DRISHTI_TRAIL_GAP ? drishtiIntradayPeak - DRISHTI_TRAIL_GAP : -DRISHTI_SL_PTS;
      log("LTP_MONITOR", { ltp, pts: pts.toFixed(1), peak: drishtiIntradayPeak.toFixed(1), trail: currentTrail, dir: tradeDirection });

      // SL hit
      if (pts <= -DRISHTI_SL_PTS) {
        await executeDrishtiLTPExit(ltp, pts, "ltp_sl_hit");
        return;
      }
      // Trail hit
      if (currentTrail > 0 && pts <= currentTrail) {
        await executeDrishtiLTPExit(ltp, pts, `ltp_trail_${currentTrail.toFixed(0)}pts`);
        return;
      }
    } catch (e) {
      log("LTP_MONITOR_ERR", { error: e instanceof Error ? e.message : String(e) });
    }
  }, 15 * 1000);  // every 15 seconds (tighter trail detection — 60s caused 20+ pt slippage on fast reversals)

  log("LTP_MONITOR_START", { entry: entryPrice, dir: tradeDirection, trailGap: DRISHTI_TRAIL_GAP });
}

// ═══════════════════════════════════════════════════════════════════════════
// DRISHTI V1 — PDH/PDL Context + LOCK10 Trail (live bot)
// Entry: findDrishtiEntry() detects pattern on each 15-min candle close
// Trail: SL=150 pts; once peak>=10 pts, trail = peak-10 (LOCK10, candle-close only)
// Re-entries: up to 5, gate=OFF (lastExitPts>=0), reverse always allowed (REV_UNLOCK=0)
// ═══════════════════════════════════════════════════════════════════════════
async function runDrishtiBot() {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const h = ist.getHours(), m = ist.getMinutes();

  // ── Daily reset at 9:15 ───────────────────────────────────────────────
  if (h === 9 && m === 15) {
    DrishtiState           = createDrishtiState();
    drishtiTodayCandles    = [];
    drishtiPrevDayCandles  = [];
    drishtiLastCandleKey   = "";
    DrishtiCandleLog       = [];
    stopDrishtiLTPMonitor();   // clear any stale monitor from previous day
    stopForDay          = false;
    // Clear persisted candle log for the new day
    try { fs.writeFileSync('candle-log.json', JSON.stringify({ date: '', log: [] })); } catch(_e) {}
    capitalProtectionTriggered = false;
    dailyPnL            = 0;
    tradeCount          = 0;
    consecutiveLosses   = 0;
    activeTrade         = false;
    mainEntryDone       = false;
    tradeDirection      = null;
    tradeSymbol         = "";
    entryPrice          = 0;
    entryTime           = 0;
    drishtiWins          = 0;
    drishtiLosses        = 0;
    log("STATE_RESET", { strategy: "DRISHTI_V1" });

    // Load previous day candles (non-blocking)
    getPrevDayCandles().then(candles => {
      drishtiPrevDayCandles = candles;
      log("DRISHTI_PREV_DAY_LOADED", { count: candles.length, ph: Math.max(...candles.map((c: DrishtiCandle) => c.high)), pl: Math.min(...candles.map((c: DrishtiCandle) => c.low)) });
    }).catch(e => log("DRISHTI_PREV_DAY_FAIL", { error: String(e) }));
  }

  // ── 9:45 AM candle silence check — fires if C1 was never received ──────────
  if (h === 9 && m === 45 && ist.getSeconds() < 16 && !_candleHealthAlerted) {
    _candleHealthAlerted = true;
    if (drishtiTodayCandles.length === 0) {
      await sendTelegram(
        `⚠️ CANDLE ALERT — 9:45 AM health check\n` +
        `No 15-min candles received since market open.\n` +
        `C1 (9:15–9:30 AM) should have been processed by now.\n` +
        `Bot may be stuck or data feed is down.\n` +
        `Check: pm2 logs amina-100-variant-b --lines 20`
      ).catch(() => {});
    }
  }

  // ── 9:10 AM pre-market token health check (BEFORE isWithinTime guard) ────
  if (h === 9 && m === 10 && ist.getSeconds() < 16) {
    try {
      const _tokenAge = fs.existsSync('access_token.txt')
        ? Math.round((Date.now() - fs.statSync('access_token.txt').mtimeMs) / 60000)
        : 9999;
      const _tokenOk = _tokenAge < 180;
      if (!_tokenOk) {
        // Only alert on problem — no message on good days
        await sendTelegram(
          `🚨 TOKEN PROBLEM — Pre-market check @ 9:10 AM\n` +
          `🔑 Token: STALE or MISSING (last seen ${_tokenAge}m ago)\n` +
          `⚠️ Run auto_token NOW — only 20 mins before C1 closes!\n` +
          `SSH: node /home/ubuntu/trading-bot/auto_token.js`
        ).catch(() => {});
      }
    } catch(_e) {}
  }

  if (!isWithinTime(9, 15, 15, 30)) return;

  const price = await getCurrentPrice();
  if (!price || price <= 0) { log("SKIP_CYCLE", { reason: "invalid price" }); return; }
  lastKnownPrice = price;
  printStatus();

  // ── Capital protection ───────────────────────────────────────────────
  const maxDrawdown = config.capital * (config.capitalDrawdownPercent / 100);
  if (dailyPnL <= -DAILY_LOSS_CAP || Math.abs(dailyPnL) >= maxDrawdown) {
    if (activeTrade && tradeSymbol) {
      try { await exitTrade(tradeSymbol, config.quantity); } catch (_) {}
      activeTrade = false; mainEntryDone = false;
    }
    if (!stopForDay) {
      stopForDay = true;
      await notifyDailyLoss(dailyPnL).catch(() => {});
    }
    return;
  }

  if (stopForDay && !activeTrade) return;
  if (tradeCount >= 5) return;  // max 5 trades/day

  // ── Detect new 15-min candle ─────────────────────────────────────────
  const candle = await getPreviousCandle();
  if (!candle || !candle.open || !candle.close) { log("SKIP_CYCLE", { reason: "invalid candle" }); return; }
  const candleKey = (candle as any).date ?? `${candle.high}_${candle.low}`;

  // Seed on first cycle
  if (drishtiLastCandleKey === "") {
    drishtiLastCandleKey = candleKey;
    log("DRISHTI_SEEDED", { candle });
    return;
  }
  if (candleKey === drishtiLastCandleKey) return;  // same candle, no new close
  drishtiLastCandleKey = candleKey;

  // New candle closed — push to today stack
  const bc: DrishtiCandle = { open: candle.open, high: candle.high, low: candle.low, close: candle.close };
  drishtiTodayCandles.push(bc);

  // EOD at 3:30 PM close (3:15-3:30 candle) — matches backtest last candle exactly
  // Previously m>=15 caused early exit at 3:15 PM (3:00-3:15 candle), one candle too early
  const isEOD = h > 15 || (h === 15 && m >= 30);

  // ── Trail management when in trade ───────────────────────────────────
  if (activeTrade && DrishtiState.inTrade) {
    const trail = updateDrishtiTrail(DrishtiState, bc, isEOD);
    DrishtiState.peakPts   = trail.peakPts;
    DrishtiState.trailStop = trail.trailStop;

    if (trail.action !== "HOLD") {
      stopDrishtiLTPMonitor();  // stop 1-min monitor — candle-close exit taking over
      const capturedEntry        = entryPrice;
      const capturedDir          = tradeDirection;
      const capturedTime         = entryTime;
      const capturedSymbol       = tradeSymbol;
      const capturedPremiumEntry = entryPremium;
      const capturedPremiumExit  = await getOptionLTP(tradeSymbol).catch(() => 0);

      try { await exitTrade(tradeSymbol, config.quantity); } catch (e) {
        log("EXIT_FAIL", { error: e instanceof Error ? e.message : String(e) });
      }

      const pts = trail.pts;
      dailyPnL += pts;
      if (pts > 0) { consecutiveLosses = 0; drishtiWins++; } else { consecutiveLosses++; drishtiLosses++; }

      // Set up re-entry tracking
      DrishtiState.inTrade      = false;
      DrishtiState.firstDone    = true;
      DrishtiState.lastExitPts  = trail.peakPts;   // peak pts (threshold for RE)
      DrishtiState.lastExitIdx  = drishtiTodayCandles.length - 1;
      DrishtiState.lastExitDir  = capturedDir as DrishtiDir;

      activeTrade = false; mainEntryDone = false;
      tradeDirection = null; tradeSymbol = ""; entryPrice = 0; entryTime = 0;
      entryPremium = 0; lastOptionLTP = 0;

      const exitReason = trail.action === "EXIT_SL"
        ? "SL -150 pts"
        : trail.action === "EXIT_EOD"
          ? "EOD 3:15 PM"
          : `Trail locked ${pts.toFixed(0)} pts (peak ${trail.peakPts.toFixed(0)})`;

      saveTradeState();
      await notifyExit(price, pts, exitReason, { dir: capturedDir, entry: capturedEntry, symbol: capturedSymbol, qty: config.quantity }).catch(() => {});

      if (trail.action === "EXIT_EOD") {
        stopForDay = true;
        await sendEODSummary().catch(() => {});
        generateMonthlyReport().catch(e => log("REPORT_FAIL", { error: e?.message }));
      }
      logTrade({ date: new Date().toISOString(), type: "DRISHTI_V1", direction: capturedDir ?? "CE", symbol: capturedSymbol, premiumEntry: capturedPremiumEntry, premiumExit: capturedPremiumExit, qty: config.quantity, entryPrice: capturedEntry, exitPrice: trail.exitPrice, pnl: pts, reasonEntry: "drishti_entry", reasonExit: trail.action.toLowerCase(), aiScore: 1, slippage: 0, duration: capturedTime > 0 ? Math.round((Date.now() - capturedTime) / 1000) : 0 });
    }
    return;  // always return after trail check (don't look for new entries in same tick)
  }

  if (isEOD) return;  // no new entries after EOD
  if (tradeCount >= 5) return;

  // ── Prev day candles required ─────────────────────────────────────────
  if (!drishtiPrevDayCandles || drishtiPrevDayCandles.length === 0) {
    log("DRISHTI_NO_PREV_DAY", { candles: drishtiTodayCandles.length });
    return;
  }

  // ── Find entry signal ─────────────────────────────────────────────────
  let entrySig: DrishtiEntrySignal | null = null;

  if (DrishtiState.firstDone && DrishtiState.reCount < 5 && DrishtiState.lastExitPts >= 0 && DrishtiState.lastExitIdx >= 0 && DrishtiState.lastExitDir) {
    // Re-entry: look for strong candle after last exit — always allow reverse (REV_UNLOCK=0)
    const allowReverse = true;
    const re = findDrishtiReEntry(drishtiTodayCandles, DrishtiState.lastExitIdx, DrishtiState.lastExitDir, allowReverse);
    const lastIdx = drishtiTodayCandles.length - 1;
    if (re) {
      if (re.idx === lastIdx) {
        // Signal on current candle — normal entry
        entrySig = { idx: re.idx, side: re.side, ctx: "INSIDE", reason: re.reason };
      } else if (re.idx === lastIdx - 1) {
        // Signal was on previous candle (missed) — enter on current candle
        // unless current candle is strongly opposing (body < -40% for CE, > +40% for PE)
        const curBody = (bc.high - bc.low) > 0 ? Math.round((bc.close - bc.open) / (bc.high - bc.low) * 100) : 0;
        const curNotOpposing = re.side === 'CE' ? curBody > -40 : curBody < 40;
        if (curNotOpposing) {
          entrySig = { idx: re.idx, side: re.side, ctx: "INSIDE", reason: re.reason + '_next_candle' };
        }
      }
    }
  } else if (!DrishtiState.firstDone) {
    // First entry: V4 PDR filter — skip low-volatility days (prev day range < 150 pts)
    const _pdrH = Math.max(...drishtiPrevDayCandles.map((c: DrishtiCandle) => c.high));
    const _pdrL = Math.min(...drishtiPrevDayCandles.map((c: DrishtiCandle) => c.low));
    if (_pdrH - _pdrL >= 150) {
      entrySig = findDrishtiEntry(drishtiTodayCandles, drishtiPrevDayCandles);
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
    const _pdh = drishtiPrevDayCandles.length > 0 ? Math.max(...drishtiPrevDayCandles.map((c: DrishtiCandle) => c.high)) : 0;
    const _pdl = drishtiPrevDayCandles.length > 0 ? Math.min(...drishtiPrevDayCandles.map((c: DrishtiCandle) => c.low)) : 0;
    const _c0 = drishtiTodayCandles[0];
    const _c0bp = _c0 && (_c0.high - _c0.low) > 0 ? Math.round((_c0.close - _c0.open) / (_c0.high - _c0.low) * 100) : 0;
    if (DrishtiState.firstDone) {
      // Already had first trade today — re-entry path
      if (DrishtiState.reCount >= 5) return 'Re-entry limit reached (5 of 5 used today)';
      if (DrishtiState.lastExitIdx < 0) return 'Re-entry: no completed exit yet';
      if (DrishtiState.lastExitPts < 10) return `Re-entry: watching for strong candle after C${DrishtiState.lastExitIdx + 1} exit (peak was +${DrishtiState.lastExitPts.toFixed(0)} pts — gate OFF, any exit allowed)`;
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
        if (_lastIdx >= 4) return `C${_cN} body ${_bpStr} — INSIDE · no PDH/PDL test signal on C${_cN} (waiting for strong breakout candle)`;
        return `C${_cN} body ${_bpStr} — INSIDE context (C1 was ${_c1bp}), waiting for strong confirming candle`;
      }
      if (_ctx === 'ABOVE_PDH') return `C${_cN} body ${_bpStr} — ABOVE_PDH context (C1 was ${_c1bp}), no CE/PE entry pattern matched`;
      return `C${_cN} body ${_bpStr} — BELOW_PDL context (C1 was ${_c1bp}), no entry pattern matched`;
    }
    // At C0 (first candle of day)
    if (_pdh > 0 && bc.close > _pdh) {
      if (_drishtiBodyPct > 55) return `C1 body too strong (+${_drishtiBodyPct}%) — inside_c0 pattern requires body ≤55% (not a runaway gap candle)`;
      if (_drishtiBodyPct < -29) return `C1 closed above PDH but bearish body (${_drishtiBodyPct}%) — direction mismatch for CE entry`;
      const _gapPts = _c0 ? Math.round(_c0.open - _pdh) : 0;
      if (_gapPts > 50) return `Gap-up open +${_gapPts} pts above PDH — entry filtered (too large a gap)`;
      return `C1 above PDH by ${Math.round(bc.close - _pdh)} pts but body/range filter blocked`;
    }
    if (_pdl > 0 && bc.close < _pdl) {
      if (_drishtiBodyPct < -55) return `C1 body too strong (${_drishtiBodyPct}%) — inside_c0 pattern requires body ≥-55%`;
      const _gapPts = _c0 ? Math.round(_pdl - _c0.open) : 0;
      if (_gapPts > 50) return `Gap-down open ${_gapPts} pts below PDL — entry filtered (too large a gap)`;
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
  try { fs.writeFileSync('candle-log.json', JSON.stringify({ date: _drishtiIst.toISOString().slice(0,10), log: DrishtiCandleLog })); } catch(_e) {}

  if (!entrySig) {
    log("DRISHTI_CANDLE", { idx: drishtiTodayCandles.length - 1, close: bc.close, no_signal: true });
    return;
  }

  // ── Place trade ───────────────────────────────────────────────────────
  let sym = "";
  try {
    sym = await Promise.race([
      getBestOptionSymbol(entrySig.side),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error("option select timeout")), 10000)),
    ]);
  } catch (e) {
    log("OPTION_SELECT_FAIL", { error: String(e) });
    return;
  }

  const freshPrice = await getCurrentPrice();
  tradeDirection  = entrySig.side;
  tradeSymbol     = sym;
  entryPrice      = bc.close;     // index-level entry
  mainQty         = config.quantity;
  mainEntryDone   = true;
  activeTrade     = true;
  entryTime       = Date.now();

  DrishtiState.inTrade   = true;
  DrishtiState.dir       = entrySig.side;
  DrishtiState.entry     = bc.close;
  DrishtiState.entryIdx  = drishtiTodayCandles.length - 1;
  DrishtiState.trailStop = -150;
  DrishtiState.peakPts   = 0;
  startDrishtiLTPMonitor();  // start 1-min LTP polling to catch intraday trail/SL hits

  try {
    tradeInProgress = true;
    const order = await placeTrade(sym, freshPrice, config.quantity);
    tradeInProgress = false;
    if (!order || order.status !== "COMPLETE" || order.filled_quantity <= 0) {
      stopDrishtiLTPMonitor();  // trade failed — stop LTP monitor
      log("ORDER_NOT_FILLED", { order });
      mainEntryDone = false; activeTrade = false; tradeDirection = null;
      tradeSymbol = ""; entryPrice = 0; entryTime = 0;
      DrishtiState.inTrade = false;
      return;
    }
  } catch (e) {
    tradeInProgress = false;
    stopDrishtiLTPMonitor();  // trade rejected — stop LTP monitor
    log("ORDER_REJECTED", { error: e instanceof Error ? e.message : String(e) });
    mainEntryDone = false; activeTrade = false; tradeDirection = null;
    tradeSymbol = ""; entryPrice = 0; entryTime = 0;
    DrishtiState.inTrade = false;
    stopTradingForDay(); stopForDay = true;
    return;
  }

  if (DrishtiState.firstDone) DrishtiState.reCount++;

  tradeCount++;
  saveTradeState();

  const slLevel = entrySig.side === "CE" ? bc.close - 150 : bc.close + 150;
  await sendTelegram(
    `📈 *DRISHTI V1 — ${entrySig.side === "CE" ? "CE (Bullish)" : "PE (Bearish)"}*
` +
    `Symbol: \`${sym}\`
` +
    `Premium: *₹${freshPrice}* | Qty: ${config.quantity}
` +
    `Index entry: *${bc.close.toFixed(0)}* | SL: ${slLevel.toFixed(0)} (−150 pts)
` +
    `Context: ${entrySig.ctx} | Signal: ${entrySig.reason}
` +
    `────────────────────
` +
    `Trade #${tradeCount}/5 | Day P&L: ${dailyPnL >= 0 ? "+" : ""}${dailyPnL.toFixed(0)} pts`
  ).catch(() => {});

  const premiumAtEntry = await getOptionLTP(sym).catch(() => 0);
  entryPremium  = premiumAtEntry;
  lastOptionLTP = premiumAtEntry;
  logTrade({ date: new Date().toISOString(), type: "DRISHTI_V1", direction: entrySig.side, symbol: sym, premiumEntry: premiumAtEntry, premiumExit: 0, entryPrice: bc.close, exitPrice: 0, pnl: 0, reasonEntry: `drishti_${entrySig.ctx}_${entrySig.reason}`, reasonExit: "", aiScore: 1, slippage: Math.abs(freshPrice - bc.close), duration: 0 });
}

async function runBot() {
    if (!isMarketHours()) return; // Weekend + off-hours guard
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
  if (stopForDay && !activeTrade)  { log("SKIP_CYCLE", { reason: "stopForDay" });                  return; }
  if (isTradingStopped())          { log("SKIP_CYCLE", { reason: "tradingStopped" });              return; }
  if (capitalProtectionTriggered && !activeTrade) { log("SKIP_CYCLE", { reason: "capitalProtection" }); return; }
  if (activeTrade)                 { /* active trade — fall through to monitor */ }
  if (tradeInProgress)             { log("SKIP_CYCLE", { reason: "orderInProgress" });             return; }
  // Note: printStatus() is called inside the try block AFTER price is fetched, so PnL is always live

  // Hard kill switch (account safety layer)
  const maxDrawdown = config.capital * (config.capitalDrawdownPercent / 100);
  if (dailyPnL <= -DAILY_LOSS_CAP || Math.abs(dailyPnL) >= maxDrawdown) {
    log("HARD_KILL_SWITCH", { dailyPnL, maxDrawdown, message: "Hard kill switch triggered. Stopping trading." });
    await squareOffAll();
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
      const _hbAge = fs.existsSync('bot-heartbeat.json')
        ? Math.round((Date.now() - new Date(JSON.parse(fs.readFileSync('bot-heartbeat.json','utf-8')).at).getTime()) / 1000)
        : 9999;
      const _tokenAge = fs.existsSync('access_token.txt')
        ? Math.round((Date.now() - fs.statSync('access_token.txt').mtimeMs) / 60000)
        : 9999;
      const _tokenOk = _tokenAge < 180; // written within last 3 hours = today's token
      const _botOk = _hbAge < 120; // heartbeat within 2 min
      const _status = _tokenOk && _botOk ? '✅ ALL SYSTEMS GO' : '🚨 PROBLEM DETECTED';
      await sendTelegram(
        `${_status} — Pre-market check @ 9:10 AM\n` +
        `🔑 Token: ${_tokenOk ? `✅ valid (refreshed ${_tokenAge}m ago)` : `❌ MISSING or stale (${_tokenAge}m ago)`}\n` +
        `🤖 Bot: ${_botOk ? `✅ online (heartbeat ${_hbAge}s ago)` : `❌ OFFLINE (last seen ${_hbAge}s ago)`}\n` +
        `📊 Strategy: ${ACTIVE_STRATEGY} | Mode: ${config.mode}\n` +
        (_tokenOk && _botOk ? `C1 closes at 9:30 AM — entry window open ✔` : `⚠️ Fix now — 20 mins before C1 closes`)
      );
    } catch(_e) {}
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
    lastTradeProfit = false;
    consecutiveLosses = 0;
    entryTime = 0;
    entrySlippage = 0;
    tradeAIScore = 0;
    log("STATE_RESET", { time: ist });
    rcWaiting = false; rcBreakoutDir = null; rcTrade2Active = false; rcIndexSL = 0;
    hybridState = createHybridState(); hybridPrevCandle = null; hybridLastCandleKey = "";
    _dailyPnlLogSaved = false;  // reset for the new day
    _tokenAutoRefreshing = false; // allow fresh auto-refresh next day if needed
    _candleHealthAlerted = false;  // allow fresh candle health check next day
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
        const sqOffPrice = await getOptionLTP(tradeSymbol);
        const ohlc = await getOptionDayOHLC(tradeSymbol);
        await notifyStrikeEOD(tradeSymbol, entryPrice, ohlc.high, ohlc.low, sqOffPrice);
      } catch (e) {
        log("EOD_STRIKE_ALERT_FAIL", { error: e instanceof Error ? e.message : String(e) });
      }
    }
    await squareOffAll();
    await sendEODSummary();
    generateMonthlyReport().catch(e => log("REPORT_FAIL", { error: e?.message }));
    if (!_dailyPnlLogSaved) { _dailyPnlLogSaved = true; saveDailyPnlLog().catch(() => {}); }
    stopForDay = true;
    await notifyBotStop("15:20 exit all positions");
    log("TIME_BUFFER", { message: "Exited all positions at 15:20" });
    return;
  }
  // End-of-day forced exit
  if (ist.getHours() > 15 || (ist.getHours() === 15 && ist.getMinutes() >= 30)) {
    if (!_dailyPnlLogSaved) { _dailyPnlLogSaved = true; saveDailyPnlLog().catch(() => {}); }
    await squareOffAll();
    stopForDay = true;
    await notifyBotStop("EOD exit");
    return;
  }
  //── Time guards ──────────────────────────────────────
  if (!isWithinTime(9, 25, 15, 30)) {
    console.log("Outside market hours. Waiting...");
    return;
  }

  if (!earlyEntryDone && !mainEntryDone && !isWithinTime(9, 25, 15, 0)) {
    console.log("15:00 cutoff reached with no trade. Stopping for day.");
    stopForDay = true;
    return;
  }

  // ── Daily loss limit ─────────────────────────────────
  if (dailyPnL <= -DAILY_LOSS_CAP) {
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
    if (!_tgSilenced) { await notifyBotStop("Max trades reached"); _tgSilenced = true; }
    return;
  }

  try {

    const candle  = await getPreviousCandle();
    const price   = await getCurrentPrice();
    if (!price || price <= 0) {
      log("SKIP_CYCLE", { reason: "Invalid price data", price });
      return;
    }
    lastKnownPrice = price;  // cache for live PnL display in printStatus
    printStatus();           // print after price fetched so PnL is live
    const { bodyHigh, bodyLow } = getCandleBody(candle);

    // ── Wait for 9:30 candle to complete ─────────────
    if (!isWithinTime(9, 30, 23, 59)) {
      log("WAITING", { reason: "9:30 candle not yet complete" });
      return;
    }

    // ── Detect new candle completion ─────────────────────────────────────────
    const candleDate = (candle as any).date ?? `${candle.high}_${candle.low}`;

    // On very first cycle: find the last STRUCTURE candle (last one that broke the prior candle's
    // high or low). Inside bars between then and now do NOT replace the reference.
    let justSeeded = false;
    if (lastEntryCandleDate === "") {
      try {
        const { refCandle, currentCandle } = await getStructureSeed();
        prevCandleForEntry  = refCandle;
        lastEntryCandleDate = candleDate;
        const refBodyHigh = Math.max(refCandle.open, refCandle.close);
        const refBodyLow  = Math.min(refCandle.open, refCandle.close);
        log("SEEDED", { refBodyHigh, refBodyLow, currentClose: currentCandle.close });
        justSeeded = true; // allow entry on this cycle even though newCandleCompleted=false
      } catch (e) {
        log("SEED_ERR", { error: e instanceof Error ? e.message : String(e) });
        lastEntryCandleDate = candleDate;
      }
    }

    // True only when a NEW candle just completed (date changed from last cycle)
    const newCandleCompleted = candleDate !== lastEntryCandleDate;

    // ── Signal: BODY breakout — close must break above prev candle's body high or below body low
    // bodyHigh = max(open, close)  bodyLow = min(open, close)
    // MIN_BREAKOUT_MARGIN: close must be 50+ pts past the level (filters hairline 2-3 pt crossings)
    let signal: "CE" | "PE" | null = null;
    if (prevCandleForEntry) {
      const prevBodyHigh = Math.max(prevCandleForEntry.open, prevCandleForEntry.close);
      const prevBodyLow  = Math.min(prevCandleForEntry.open, prevCandleForEntry.close);
      if (candle.close > prevBodyHigh + MIN_BREAKOUT_MARGIN)     signal = "CE";
      else if (candle.close < prevBodyLow - MIN_BREAKOUT_MARGIN) signal = "PE";
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
      fs.writeFileSync("bot-heartbeat.json", JSON.stringify({
        at: new Date().toISOString(),
        status: _inTrade ? `IN TRADE · ${tradeDirection}` : "RUNNING · FLAT",
        price,
        dailyPnL: parseFloat(livePnL.toFixed(0)),
        unrealisedPnL: _inTrade ? parseFloat(livePnL.toFixed(0)) : 0,
        tradeCount,        qty: config.quantity,
        slPts: ACTIVE_STRATEGY === "DRISHTI_V1" ? 150 : (config.tradeManagement?.stopLossPoints ?? 100),
        dailyCapPts: config.risk?.dailyLossCap ?? 350,        mode: config.mode,
        inTrade: _inTrade,
        direction: tradeDirection ?? null,
        entryPrice: entryPrice || null,
        livePrice: price || null,
        symbol: tradeSymbol || null,
        entryPremium: _inTrade ? entryPremium || null : null,
        livePremium:  _inTrade ? lastOptionLTP || null : null,
        sl: _inTrade ? (tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100) : null,
      }));
    } catch (_) {}
    const prevBodyHigh = prevCandleForEntry ? Math.max(prevCandleForEntry.open, prevCandleForEntry.close) : null;
    const prevBodyLow  = prevCandleForEntry ? Math.min(prevCandleForEntry.open, prevCandleForEntry.close) : null;
    const breakoutMargin = prevBodyHigh && prevBodyLow
      ? (signal === "CE" ? Math.round(candle.close - prevBodyHigh) : signal === "PE" ? Math.round(prevBodyLow - candle.close) : 0)
      : 0;
    log("CYCLE", { price, pnl: livePnL.toFixed(0), signal: signal ?? "none", newCandle: newCandleCompleted, prevBodyHigh, prevBodyLow, candleClose: candle.close, breakoutMargin });

    // ── Monitor open trade ────────────────────────────
    if ((earlyEntryDone || mainEntryDone) && tradeDirection && tradeSymbol) {
      const profit = tradeDirection === "CE" ? price - entryPrice : entryPrice - price;
      let currentOptionLTP = 0;
      try { currentOptionLTP = await getOptionLTP(tradeSymbol); } catch (_) {}
      if (currentOptionLTP > 0) {
        lastOptionLTP = currentOptionLTP;
        if (entryPremium === 0) { entryPremium = currentOptionLTP; saveTradeState(); } // backfill after restore
      }
      log("MONITOR", { price, optionLTP: currentOptionLTP, pnl: profit.toFixed(0), optionSL: candleSL, indexSL: rcIndexSL, strategy: ACTIVE_STRATEGY, dailyPnL: dailyPnL.toFixed(0) });
      printStatus();

      // ── RC_CONFIRM: SL = index price crossing RC high/low (checked at each new candle) ──
      if (ACTIVE_STRATEGY === "RC_CONFIRM" && rcIndexSL > 0 && newCandleCompleted) {
        const rcSlHit = tradeDirection === "CE" ? candle.low < rcIndexSL : candle.high > rcIndexSL;
        if (rcSlHit) {
          const totalQty = earlyQty + mainQty + pyramidQty;
          log("EXIT", { reason: "RC index SL hit", strategy: "RC_CONFIRM", tradeNum: rcTrade2Active ? 2 : 1, indexSL: rcIndexSL, pnl: profit.toFixed(0) });
          try { await exitTrade(tradeSymbol, totalQty); } catch (e) {
            log("ORDER_REJECTED", { error: (e instanceof Error) ? e.message : ((e as any)?.message ?? JSON.stringify(e)) }); stopTradingForDay(); stopForDay = true; return;
          }
          dailyPnL += profit; consecutiveLosses++;
          await notifyExit(price, profit, `RC SL hit @ ${rcIndexSL.toFixed(0)}`);
          logTrade({ date: new Date().toISOString(), type: "RC_CONFIRM", direction: tradeDirection, entryPrice, exitPrice: price, pnl: profit, reasonEntry: "rc_confirm", reasonExit: "rc_sl", aiScore: 1, slippage: 0, duration: entryTime > 0 ? Math.round((Date.now() - entryTime) / 1000) : 0 });

          if (!rcTrade2Active) {
            // Trade 1 SL hit → trending → set up Trade 2 in opposite direction
            const t2Dir: "CE" | "PE" = tradeDirection === "CE" ? "PE" : "CE";
            mainEntryDone = false; activeTrade = false; tradeDirection = null;
            tradeSymbol = ""; entryPrice = 0; candleSL = 0; rcIndexSL = 0;
            rcTrade2Active = true;
            log("RC_TRADE2_SETUP", { direction: t2Dir, entryAt: price, newIndexSL: t2Dir === "CE" ? candle.low : candle.high });
            let t2Symbol = "";
            try {
              t2Symbol = await Promise.race([
                getBestOptionSymbol(t2Dir),
                new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000))
              ]);
            } catch (_) { log("RC_TRADE2_FAIL", { reason: "option select failed" }); stopForDay = true; return; }
            const t2Price = await getCurrentPrice();
            tradeDirection = t2Dir; tradeSymbol = t2Symbol; entryPrice = t2Price;
            mainQty = TOTAL_QTY; mainEntryDone = true; entryTime = Date.now();
            rcIndexSL = t2Dir === "CE" ? candle.low : candle.high;
            let t2Ltp = 0;
            try { t2Ltp = await getOptionLTP(t2Symbol); } catch (_) {}
            candleSL = t2Ltp > 0 ? t2Ltp - 100 : 0;
            log("ENTRY", { type: "RC_TRADE2", symbol: t2Symbol, price: t2Price, indexSL: rcIndexSL, optionSL: candleSL });
            try {
              tradeInProgress = true;
              const r = await placeTrade(t2Symbol, t2Price, TOTAL_QTY);
              tradeInProgress = false;
              if (!r || r.status !== "COMPLETE" || r.filled_quantity <= 0) { mainEntryDone = false; log("ORDER_NOT_FILLED", { r }); return; }
            } catch (e) { tradeInProgress = false; mainEntryDone = false; stopForDay = true; return; }
            tradeCount++; activeTrade = true; saveTradeState();
            notifyEntry("RC_TRADE2", t2Symbol, t2Price, TOTAL_QTY, t2Dir, candle, candle.high, candle.low, price).catch(() => {});
          } else {
            // Trade 2 also hit SL → done for day
            clearTradeState(); activeTrade = false; mainEntryDone = false;
            tradeDirection = null; rcTrade2Active = false; rcIndexSL = 0; candleSL = 0;
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
          await sendTelegram(
            `🎯 *Trail Activated* (+${profit.toFixed(0)} pts)\nSL locked at: *${rcIndexSL}* (candle low)\nHolding for reversal candle ≥ ${REVERSAL_BODY_MIN} pts body...`
          ).catch(() => {});
        }

        // On each new completed candle, check for reversal candle → ratchet SL
        if (trailActivated && newCandleCompleted) {
          const body = Math.abs(candle.close - candle.open);
          const isReversalCandle =
            tradeDirection === "CE"
              ? (candle.close < candle.open && body >= REVERSAL_BODY_MIN)   // bearish candle for CE
              : (candle.close > candle.open && body >= REVERSAL_BODY_MIN);  // bullish candle for PE
          if (isReversalCandle) {
            const newSL = tradeDirection === "CE" ? candle.low : candle.high;
            const improved = tradeDirection === "CE" ? newSL > rcIndexSL : newSL < rcIndexSL;
            if (improved) {
              const oldSL = rcIndexSL;
              rcIndexSL = newSL;
              saveTradeState();
              log("TRAIL_SL_UPDATE", { direction: tradeDirection, body: body.toFixed(0), oldSL, newSL: rcIndexSL, profit: profit.toFixed(0) });
              await sendTelegram(
                `🔼 *Trail SL Updated*\nDir: ${tradeDirection} | Body: ${body.toFixed(0)} pts\nSL: ${oldSL} → *${rcIndexSL}*\nProfit so far: +${profit.toFixed(0)} pts`
              ).catch(() => {});
            } else {
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
          try { await exitTrade(tradeSymbol, totalQty); } catch (e) {
            log("ORDER_REJECTED", { error: (e instanceof Error) ? e.message : ((e as any)?.message ?? JSON.stringify(e)) }); stopTradingForDay(); stopForDay = true;
            await notifyCrash("Order rejected on SL exit"); return;
          }
          dailyPnL += profit * totalQty; lastTradeProfit = profit > 0;
          if (profit <= 0) consecutiveLosses++; else consecutiveLosses = 0;
          await notifyExit(price, profit, `Option SL hit @ ${candleSL}`);
          logTrade({ date: new Date().toISOString(), type: "BREAKOUT", direction: tradeDirection, entryPrice, exitPrice: price, pnl: profit, reasonEntry: "breakout", reasonExit: "option SL", aiScore: tradeAIScore, slippage: entrySlippage, duration: entryTime > 0 ? Math.round((Date.now() - entryTime) / 1000) : 0 });
          entryTime = 0; entrySlippage = 0; tradeAIScore = 0; candleSL = 0; rcIndexSL = 0;
          clearTradeState(); activeTrade = false; trendMode = false; trailActivated = false;
          mainEntryDone = false; earlyEntryDone = false;
          pyramidDone = false; pyramidQty = 0; tradeDirection = null;
          return;
        }
      }

      // ── Hard SL backstop ──
      if (profit <= -DAILY_LOSS_CAP) {
        log("EXIT", { reason: "Hard SL hit", pnl: profit.toFixed(0), symbol: tradeSymbol });
        const totalQty = earlyQty + mainQty + pyramidQty;
        try { await exitTrade(tradeSymbol, totalQty); } catch (e) {
          log("ORDER_REJECTED", { error: (e instanceof Error) ? e.message : ((e as any)?.message ?? JSON.stringify(e)) }); stopTradingForDay(); stopForDay = true;
          await notifyCrash("Order rejected on SL exit"); return;
        }
        dailyPnL += profit * totalQty; lastTradeProfit = false; consecutiveLosses++;
        await notifyExit(price, profit, "Hard SL hit");
        logTrade({ date: new Date().toISOString(), type: "BREAKOUT", direction: tradeDirection, entryPrice, exitPrice: price, pnl: profit, reasonEntry: "breakout", reasonExit: "hard SL", aiScore: tradeAIScore, slippage: entrySlippage, duration: entryTime > 0 ? Math.round((Date.now() - entryTime) / 1000) : 0 });
        entryTime = 0; entrySlippage = 0; tradeAIScore = 0; candleSL = 0;
        clearTradeState(); activeTrade = false; trendMode = false; trailActivated = false;
        mainEntryDone = false; earlyEntryDone = false;
        pyramidDone = false; pyramidQty = 0; tradeDirection = null;
        rcTrade2Active = false; rcIndexSL = 0;
        stopForDay = true; return;
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
        rcWaiting = true; rcBreakoutDir = signal;
        log("RC_BREAKOUT_SEEN", { direction: signal, margin: breakoutMargin, note: "Waiting for reversal candle" });
        return;
      }
      if (rcWaiting && rcBreakoutDir) {
        // Reversal candle just closed — ENTER in OPPOSITE direction (the reversal)
        const dir: "CE" | "PE" = rcBreakoutDir === "CE" ? "PE" : "CE";
        rcWaiting = false; rcBreakoutDir = null; rcTrade2Active = false;
        // SL: for PE trade = RC candle HIGH (if price goes back above = reversal failed)
        //     for CE trade = RC candle LOW  (if price drops back below = reversal failed)
        const rcSL = dir === "CE" ? candle.low : candle.high;
        const freshPrice = await getCurrentPrice();
        try {
          tradeSymbol = await Promise.race([
            getBestOptionSymbol(dir),
            new Promise<string>((_, rej) => setTimeout(() => rej(new Error("getBestOptionSymbol timeout")), 10000))
          ]);
        } catch (e) { log("OPTION_SELECT_FAIL", { error: String(e) }); return; }
        mainQty = TOTAL_QTY; tradeDirection = dir; entryPrice = freshPrice;
        mainEntryDone = true; entryTime = Date.now(); rcIndexSL = rcSL;
        let optionLTP = 0;
        try { optionLTP = await getOptionLTP(tradeSymbol); } catch (_) {}
        candleSL = optionLTP > 0 ? optionLTP - 100 : 0;
        log("ENTRY", { type: "RC_TRADE1", symbol: tradeSymbol, price: freshPrice, indexSL: rcIndexSL, optionSL: candleSL, rcHigh: candle.high, rcLow: candle.low });
        try {
          tradeInProgress = true;
          const orderResult = await placeTrade(tradeSymbol, freshPrice, mainQty);
          tradeInProgress = false;
          if (!orderResult || orderResult.status !== "COMPLETE" || orderResult.filled_quantity <= 0) {
            mainEntryDone = false; log("ORDER_NOT_FILLED", { orderResult }); return;
          }
        } catch (e) { tradeInProgress = false; mainEntryDone = false; stopTradingForDay(); stopForDay = true; return; }
        tradeCount++; activeTrade = true; saveTradeState();
        notifyEntry("RC_TRADE1", tradeSymbol, freshPrice, mainQty, dir, candle, candle.high, candle.low, price).catch(() => {});
        return;
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  BODY_BREAKOUT STRATEGY — original entry logic
    // ══════════════════════════════════════════════════════════════════════════
    if (ACTIVE_STRATEGY === "BODY_BREAKOUT" && !mainEntryDone && signal && (newCandleCompleted || justSeeded)) {

      const freshPrice = await getCurrentPrice();
      const slip = Math.abs(freshPrice - price);
      mainQty        = TOTAL_QTY;
      tradeDirection = signal;
      // getBestOptionSymbol can hang on getInstruments("NFO") — wrap with 10s timeout
      try {
        tradeSymbol = await Promise.race([
          getBestOptionSymbol(signal),
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error("getBestOptionSymbol timeout")), 10000))
        ]);
      } catch (e) {
        log("OPTION_SELECT_FAIL", { error: e instanceof Error ? e.message : String(e) });
        return; // skip this cycle, retry next
      }
      entryPrice     = freshPrice;
      mainEntryDone  = true;
      entryTime      = Date.now();
      entrySlippage  = slip;
      tradeAIScore   = 1.0;
      // Candle-low SL: SL = breakout candle's low (CE) or high (PE) on the index
      rcIndexSL = signal === "CE" ? candle.low : candle.high;
      candleSL = 0;
      log("ENTRY", { type: "BODY_BREAKOUT", symbol: tradeSymbol, price: freshPrice, slippage: slip.toFixed(0), prevBodyHigh, prevBodyLow, indexSL: rcIndexSL });
      try {
        tradeInProgress = true;
        const orderResult = await placeTrade(tradeSymbol, freshPrice, mainQty);
        if (!orderResult || orderResult.status !== "COMPLETE" || orderResult.filled_quantity <= 0) {
          tradeInProgress = false; mainEntryDone = false;
          log("ORDER_NOT_FILLED", { orderResult }); return;
        }
        tradeInProgress = false;
      } catch (e) {
        tradeInProgress = false; mainEntryDone = false;
        log("ORDER_REJECTED", { error: (e instanceof Error) ? e.message : ((e as any)?.message ?? JSON.stringify(e)) });
        stopTradingForDay(); stopForDay = true; return;
      }
      // ── Save state BEFORE Telegram so restart doesn't re-enter if notify hangs ──
      tradeCount++;
      activeTrade = true;
      saveTradeState();
      // Telegram notify — fire-and-forget with catch so it never blocks the loop
      notifyEntry("BREAKOUT", tradeSymbol, freshPrice, mainQty, signal, candle, bodyHigh, bodyLow, price).catch(e =>
        log("NOTIFY_FAIL", { error: e instanceof Error ? e.message : String(e) })
      );
    }

  } catch (err: any) {
    log("ERROR", { message: err?.message ?? String(err) });
    // Swallow Telegram errors to avoid double-crash when notifier itself is down
    try { await notifyCrash(err?.message ?? String(err)); } catch (_) {}
  }
}



// --- Pre-Start Config Screen ---
function printConfigSummary(cfg: any) {
  const stratName = ACTIVE_STRATEGY === "RC_CONFIRM"
    ? "RC Confirm (wait for reversal candle, max 2 trades)"
    : ACTIVE_STRATEGY === "ITM_HOLD"
    ? "ITM Hold (BB signal → ITM monthly option → hold multi-day)"
    : ACTIVE_STRATEGY === "HYBRID_REVERSE"
    ? "Hybrid Reverse (body breakout + C1-3 early exit + hybrid SL reverse)"
    : "Body Breakout (direct entry on candle close)";
  console.log("===== BOT CONFIG =====");
  console.log(`Mode: ${cfg.mode}`);
  console.log(`Strategy: ${stratName}`);
  if (ACTIVE_STRATEGY === "RC_CONFIRM") {
    console.log(`  Trade 1: Enter at reversal candle close | SL = RC low/high`);
    console.log(`  Trade 2: If T1 SL hit → trend trade opposite | SL = that candle's low/high`);
  } else if (ACTIVE_STRATEGY === "ITM_HOLD") {
    const itm = cfg.itmHold ?? {};
    console.log(`  Strike:  ITM${itm.strikeOffset ?? 1000} monthly (delta ~0.8)`);
    console.log(`  Hold:    ${itm.holdDays ?? 3} calendar days | SL buffer: ${itm.slBuffer ?? 50} pts beyond candle wick`);
    console.log(`  Min DTE: ${itm.minDTE ?? 15} days to monthly expiry required at entry`);
    console.log(`  Max concurrent positions: ${itm.maxConcurrent ?? 2} (~Rs ${((itm.strikeOffset ?? 1000) > 500 ? 42 : 35)}k capital each)`);
    console.log(`  Backtest: +Rs 2.86L/yr (single leg) | Win: 29% | R:R: 4.21 | 38/23 +/- months`);
  } else if (ACTIVE_STRATEGY === "HYBRID_REVERSE") {
    console.log(`  Signal : close > prevBodyHigh + 25 (CE) | close < prevBodyLow − 25 (PE)`);
    console.log(`  Entry  : signal candle close | SL: ±100 pts`);
    console.log(`  C1-3   : if next candle closes 3+ pts against → early exit −3 pts`);
    console.log(`  Re-entry: same-dir if refHigh broken (after EarlyExit or wick SL)`);
    console.log(`  Reverse: SL candle body closes PAST SL → enter opposite direction`);
    console.log(`  Backtest (5yr): +₹7,04,406 | MaxDD −₹11,451 | Win 55%`);
  } else {
    console.log(`  Min breakout margin: ${MIN_BREAKOUT_MARGIN} pts`);
  }
  console.log(`SL: index-price based (RC strategy) | option-premium based (breakout)`);
  console.log(`Premium range: ${cfg.optionSelection.minPremium}–${cfg.optionSelection.maxPremium}`);
  console.log(`Max trades: ${MAX_TRADES} per day | Daily loss cap: ${DAILY_LOSS_CAP} pts`);
  console.log("");
}

async function preStartPrompt() {
  printConfigSummary(config);
  // Skip prompt when running non-interactively (PM2, CI, piped stdin)
  if (!process.stdin.isTTY || process.env.PM2_HOME || process.env.NODE_ENV === 'production') {
    console.log("Non-interactive mode — auto-starting bot...");
    return true;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("Start bot? (Y/N): ", (answer) => {
      rl.close();
      if (answer.trim().toUpperCase() === "Y") resolve(true);
      else resolve(false);
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
      console.log(`\n⚠️  Recovered open trade from previous session: ${tradeSymbol} (${tradeDirection}) entry @ ${entryPrice}`);
      // ── CRITICAL: seed hybridState so intrabar SL monitoring works immediately ──
      if (activeTrade && tradeDirection && entryPrice > 0) {
        const restoredSL = tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100;
        hybridState.inTrade = true;
        hybridState.dir     = tradeDirection as "CE" | "PE";
        hybridState.entry   = entryPrice;
        hybridState.sl      = restoredSL;
        console.log(`✅  hybridState seeded: dir=${tradeDirection} entry=${entryPrice} sl=${restoredSL}`);
      }
      // ── CRITICAL: resume Drishti LTP monitor if trade was active ──
      if (ACTIVE_STRATEGY === "DRISHTI_V1" && DrishtiState.inTrade && activeTrade && entryPrice > 0) {
        log("STATE_RESTORE", { action: "Resuming Drishti LTP monitor after restart", entry: entryPrice, dir: DrishtiState.dir });
        startDrishtiLTPMonitor();
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
      Promise.all([getPrevDayCandles(), getTodayCandles()]).then(([prevCandles, candles]) => {
        drishtiPrevDayCandles = prevCandles;
        log("DRISHTI_PREV_DAY_LOADED", { at: "startup", count: prevCandles.length });
        if (candles.length > 0) {
          // Filter out the currently-forming candle: only include candles whose 15-min window has fully closed
          const nowMs = Date.now();
          const closedCandles = candles.filter((c, i) => {
            if (i < candles.length - 1) return true;  // all except last are definitely closed
            const candleStart = new Date(c.date).getTime();
            return nowMs >= candleStart + 15 * 60_000;  // last candle: check its window has passed
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
          } else if (closedCandles.length > 0) {
            // Only the seed candle closed so far — seed on it (no push)
            const seed = closedCandles[0];
            drishtiLastCandleKey = seed.date ? String(seed.date) : `${seed.high}_${seed.low}`;
          }
          // Load persisted candle log from today (if any) — preserves live evaluations across restarts
          const _istNow = new Date(new Date().getTime() + 5.5 * 3600000);
          const _todayDate = _istNow.toISOString().slice(0, 10);
          let _savedLog: DrishtiCandleLogEntry[] = [];
          try {
            const _saved = JSON.parse(fs.readFileSync('candle-log.json', 'utf-8'));
            if (_saved.date === _todayDate && Array.isArray(_saved.log)) _savedLog = _saved.log;
          } catch(_e) {}
          // Re-evaluate strategy on each historical candle to accurately show missed entry opportunities
          DrishtiCandleLog = [];
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
            } else {
              // Re-run strategy on partial candle array (same as if bot had been live up to this point)
              const _partial = backfillCandles.slice(0, _i + 1).map(x => ({ open: x.open, high: x.high, low: x.low, close: x.close }));
              const _evalSig = findDrishtiEntry(_partial, drishtiPrevDayCandles);
              // EOD candles (15:15+) are never traded — don't flag them as "bot offline"
              const _isEodCandle = _t >= '15:15';
              DrishtiCandleLog.push({
                idx: _i,
                time: _t,
                close: _c.close,
                bodyPct: _bp,
                signal: _evalSig ? _evalSig.side : null,
                reason: _evalSig ? _evalSig.reason : 'no_signal',
                offline: _isEodCandle ? undefined : true,  // undefined = not offline (EOD), true = truly missed
              });
            }
          }
          const _missedEntries = DrishtiCandleLog.filter(e => e.offline && e.signal);
          if (_missedEntries.length > 0) {
            _missedEntries.forEach(e => {
              log("🚨 MISSED_ENTRY", { candle: `C${e.idx}`, time: e.time, direction: e.signal, reason: e.reason, note: "Bot was offline when this signal occurred" });
            });
          }

          // Reconstruct DrishtiState.firstDone from tradeCount if drishtiState was not in save file
          // (handles restarts on old state files that didn't save drishtiState)
          if (!DrishtiState.firstDone && tradeCount > 0) {
            DrishtiState.firstDone = true;
            // Reconstruct lastExitDir/Idx from candle log — use last candle that had a signal
            const _lastSignal = [...DrishtiCandleLog].reverse().find(e => e.signal);
            if (_lastSignal) {
              DrishtiState.lastExitDir  = _lastSignal.signal as DrishtiDir;
              DrishtiState.lastExitIdx  = _lastSignal.idx;  // conservative: exit was on or after this
              DrishtiState.lastExitPts  = 0;  // unknown — gate OFF so any exit qualifies
              log("STATE_RESTORE", { action: "DrishtiState reconstructed from candle log", firstDone: true, lastExitDir: DrishtiState.lastExitDir, lastExitIdx: DrishtiState.lastExitIdx });
            }
          }

          // Only silence TG and mark "done" if this is a FRESH LATE START (no trade happened today)
          // For mid-day RESTARTS (tradeCount > 0), bot was already running — continue normally
          if (backfillCandles.length > 0 && tradeCount === 0) {
            const _missedSig = _missedEntries.find(e => e.idx === 0);
            sendTelegram(
              `⛔ *Done for today* — Bot came online after 9:30 AM\n` +
              (_missedSig
                ? `🚨 MISSED signal: ${_missedSig.signal} at C1 (${_missedSig.reason.replace(/_/g,' ')})\n`
                : `📭 No signal at C1 — entry window already passed\n`) +
              `No new trades will be placed today.\nNext opportunity: tomorrow 9:30 AM`
            ).catch(() => {});
            _tgSilenced = true;  // silence all further Telegram for today
          } else if (backfillCandles.length > 0 && tradeCount > 0) {
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
        } else {
          log("DRISHTI_TODAY_BACKFILL_FAIL", { at: "startup", error: e instanceof Error ? e.message : JSON.stringify(e) });
        }
      });
    }
    log("BOT_START", { message: "Waiting for market hours (9:25 IST)..." });
    // Register trading intervals FIRST — Telegram must never block the bot from starting
    setInterval(() => {
      // Write heartbeat immediately so dashboards know the bot is alive even when flat/idle
      try {
        const _inTrade = !!(mainEntryDone || earlyEntryDone);
        const _unrealised = _inTrade && entryPrice > 0 && lastKnownPrice > 0
          ? parseFloat((tradeDirection === "CE" ? lastKnownPrice - entryPrice : entryPrice - lastKnownPrice).toFixed(0))
          : 0;
        fs.writeFileSync("bot-heartbeat.json", JSON.stringify({
          at: new Date().toISOString(),
          status: _inTrade ? `IN TRADE · ${tradeDirection}` : "RUNNING · FLAT",
          dailyPnL,
          unrealisedPnL: _unrealised,
          tradeCount,        qty: config.quantity,
        slPts: ACTIVE_STRATEGY === "DRISHTI_V1" ? 150 : (config.tradeManagement?.stopLossPoints ?? 100),
        dailyCapPts: config.risk?.dailyLossCap ?? 350,          strategy: ACTIVE_STRATEGY,
          mode: config.mode,
          inTrade: _inTrade,
          direction: tradeDirection ?? null,
          entryPrice: entryPrice || null,
          livePrice: lastKnownPrice || null,
          symbol: tradeSymbol || null,
          entryPremium: _inTrade ? entryPremium || null : null,
          livePremium:  _inTrade ? lastOptionLTP || null : null,
          sl: _inTrade ? (ACTIVE_STRATEGY === "DRISHTI_V1"
            ? (tradeDirection === "CE" ? entryPrice - 150 : entryPrice + 150)
            : (tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100)) : null,
          drishtiPrevDayHigh: ACTIVE_STRATEGY === "DRISHTI_V1" && drishtiPrevDayCandles.length > 0 ? Math.max(...drishtiPrevDayCandles.map((c: {high:number}) => c.high)) : undefined,
          drishtiPrevDayLow: ACTIVE_STRATEGY === "DRISHTI_V1" && drishtiPrevDayCandles.length > 0 ? Math.min(...drishtiPrevDayCandles.map((c: {low:number}) => c.low)) : undefined,
          DrishtiCandles: ACTIVE_STRATEGY === "DRISHTI_V1" ? drishtiTodayCandles.length : undefined,
          DrishtiCandleLog: ACTIVE_STRATEGY === "DRISHTI_V1" ? DrishtiCandleLog : undefined,
        }));
      } catch (_) {}
      if (runBotActive) { log("SKIP_CYCLE", { reason: "prevCycleStillRunning" }); return; }
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
            sendTelegram(`🔄 Token expired detected at ${_ist} IST — auto-refreshing now...`).catch(() => {});
            // Spawn auto_token.js independently — it will update .env and restart the bot via PM2
            _cpExec('node /home/ubuntu/trading-bot/auto_token.js >> /home/ubuntu/trading-bot/logs/auto_token.log 2>&1', (_execErr) => {
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
            fs.writeFileSync("bot-heartbeat.json", JSON.stringify({
              at: new Date().toISOString(),
              status: _inTrade2 ? `IN TRADE · ${tradeDirection}` : "RUNNING · FLAT",
              dailyPnL,
              unrealisedPnL: _unrealised2,
              tradeCount,        qty: config.quantity,
        slPts: ACTIVE_STRATEGY === "DRISHTI_V1" ? 150 : (config.tradeManagement?.stopLossPoints ?? 100),
        dailyCapPts: config.risk?.dailyLossCap ?? 350,              mode: config.mode,
              inTrade: _inTrade2,
              direction: tradeDirection ?? null,
              entryPrice: entryPrice || null,
              livePrice: lastKnownPrice || null,
              symbol: tradeSymbol || null,
              entryPremium: _inTrade2 ? entryPremium || null : null,
              livePremium:  _inTrade2 ? lastOptionLTP || null : null,
              sl: _inTrade2 ? (tradeDirection === "CE" ? entryPrice - 100 : entryPrice + 100) : null,
            }));
          } catch (_) {}
        })
        .finally(() => { clearTimeout(timeout); runBotActive = false; });
    }, 15000);
    // Candle breakout monitor — runs every 15s, independent of trading logic
    setInterval(() => { monitorCandleBreakouts().catch(() => {}); }, 15000);
    // Fire-and-forget startup Telegram — failure must not prevent trading
    if (restored && activeTrade && tradeDirection && entryPrice > 0) {
      // ── Restart with ACTIVE trade — show position details
      const slLevel = tradeDirection === "CE" ? entryPrice - 150 : entryPrice + 150;
      const entryIST = entryTime > 0
        ? new Date(entryTime).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })
        : "–";
      const waitReEntryInfo = hybridState.waitReEntry && hybridState.dir && hybridState.refHigh > 0
        ? `\n⏳ Waiting RE-ENTRY · ${hybridState.dir} | Trigger: close ${hybridState.dir === "CE" ? ">" : "<"} ${hybridState.refHigh}`
        : ``;
      sendTelegram(
        `♻️ *Bot Restarted* — trade restored\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `📌 Position: *${tradeDirection}* | ${tradeSymbol}\n` +
        `Entry: *${entryPrice}* (@ ${entryIST})\n` +
        `SL: *${slLevel}* (−150 pts)${waitReEntryInfo}\n` +
        `Strategy: DRISHTI V1 · LOCK10 | Mode: ${config.mode.toUpperCase()} | Qty: ${config.quantity}\n` +
        `⏰ ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}\n` +
        `🔑 [Refresh Token](https://139-59-18-52.nip.io/login)`
      ).catch(e => console.error("[Telegram restart notify failed]", e?.message ?? e));
    } else if (restored) {
      // ── Restart with no active trade — show flat state with day's P&L so far
      const waitReEntryInfo = hybridState.waitReEntry && hybridState.dir && hybridState.refHigh > 0
        ? `\n⏳ Waiting RE-ENTRY · ${hybridState.dir} | Trigger: close ${hybridState.dir === "CE" ? ">" : "<"} ${hybridState.refHigh}`
        : ``;
      sendTelegram(
        `♻️ *Bot Restarted* — No Trade\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Position: FLAT${waitReEntryInfo}\n` +
        `Day P&L: ${dailyPnL >= 0 ? "+" : ""}${dailyPnL.toFixed(2)} pts | Trades: ${tradeCount}/5\n` +
        `Mode: ${config.mode.toUpperCase()} | Qty: ${config.quantity}\n` +
        `[Token Refresh](https://139-59-18-52.nip.io/login)`
      ).catch(e => console.error("[Telegram restart notify failed]", e?.message ?? e));
    } else {
      // ── Fresh start — send full Bot Started message
      sendTelegram(
        `🟢 *BANKNIFTY Bot Started*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Strategy: *DRISHTI V1 · LOCK10*\n` +
        `Mode: *${config.mode.toUpperCase()}* | Qty: ${config.quantity}\n` +
        `SL: 150 pts | Trail: LOCK10 (peak−10)\n` +
        `⏰ ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}\n` +
        `🔑 [Refresh Token if needed](https://139-59-18-52.nip.io/login)`
      ).catch(e => console.error("[Telegram startup notify failed]", e?.message ?? e));
      // ── Startup token validation ───────────────────────────────────
      setTimeout(() => {
        const _d = new Date(); const _dIst = new Date(_d.toLocaleString('en-US',{timeZone:'Asia/Kolkata'})); if (_dIst.getDay()===0||_dIst.getDay()===6) return;
        kite.getProfile().then(() => {
          console.log("[startup] ✅ Token OK");
        }).catch((startupErr: any) => {
          const _sm = (startupErr?.message ?? String(startupErr)).toLowerCase();
          if (_sm.includes("incorrect") || _sm.includes("access_token") || _sm.includes("api_key")) {
            console.error("[startup] ❌ TOKEN INVALID at startup!");
            const _sist = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
            tokenAlertLastSent = Date.now();
            sendTelegram(
              `🔴 *TOKEN EXPIRED — Action Required*\n` +
              `━━━━━━━━━━━━━━━━━━━━━\n` +
              `Zerodha access token is invalid or expired.\n` +
              `*Bot is not trading until you re-authenticate.*\n\n` +
              `➡ Open this link, log in & paste the redirect URL:\n` +
              `https://139-59-18-52.nip.io/login\n\n` +
              `⏰ Detected at: ${_sist} IST`
            ).catch(() => {});
          }
        });
      }, 8000);
    }
  } catch (e) {
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

process.on("unhandledRejection", async (reason: any) => {
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
    try { await sendTelegram(`⚠️ *Non-fatal error*\n${msg.slice(0, 200)}`); } catch (_) {}
  }
});

// ─── Graceful shutdown helper ─────────────────────────
async function gracefulShutdown(reason: string, isError: boolean = false) {
  const pnlSign = dailyPnL >= 0 ? "+" : "";
  const emoji = isError ? "💥" : "🔴";
  try {
    // Do NOT clearTradeState() here — preserve state so the bot can resume on restart
    // without re-entering an already-open trade. State is only cleared after a real exit.
    await sendTelegram(
      `${emoji} *Bot Stopped*\nReason: ${reason}\nPnL: ${pnlSign}${dailyPnL.toFixed(0)} pts\nTrades: ${tradeCount}/${MAX_TRADES}`
    );
  } catch (_) {}
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
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, "utf-8"));
      for (const t of data) {
        trades++;
        if (t.pnl > 0) wins++;
        else losses++;
        netPnL += t.pnl;
        drawdown += t.pnl;
        if (drawdown < maxDrawdown) maxDrawdown = drawdown;
        if (!t.exitPrice) openTrades++;
      }
      if (openTrades > 0) {
        console.warn(`${openTrades} open trades found in logs!`);
      }
    }
  } catch (e) {
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

    // 1. Read candle-log.json
    type CL = { idx: number; time: string; close: number; signal: string | null; reason: string; offline?: boolean };
    let candleLog: CL[] = [];
    try {
      const saved = JSON.parse(fs.readFileSync('candle-log.json', 'utf-8'));
      if (saved.date === todayDate && Array.isArray(saved.log)) candleLog = saved.log;
    } catch (_) {}

    // 2. Simulate DRISHTI V1 LOCK50 candle-close SL on today's candles
    let signal = 'FLAT', btPnl = 0, btNote = 'No signal today';
    const c0 = candleLog.find(e => e.idx === 0 && e.signal);
    if (c0 && c0.signal) {
      const dir = c0.signal as 'CE' | 'PE';
      signal = dir;
      const entryPx = c0.close;
      let sl = dir === 'CE' ? entryPx - 100 : entryPx + 100;
      let exited = false;
      const rest = candleLog.filter(e => e.idx > 0).sort((a, b) => a.idx - b.idx);
      for (const c of rest) {
        const gain = dir === 'CE' ? c.close - entryPx : entryPx - c.close;
        if (gain >= 50) {  // LOCK50: lock SL to breakeven once +50 pts achieved
          if (dir === 'CE' && sl < entryPx) sl = entryPx;
          if (dir === 'PE' && sl > entryPx) sl = entryPx;
        }
        const slHit = dir === 'CE' ? c.close <= sl : c.close >= sl;
        if (slHit) {
          btPnl = Math.round(dir === 'CE' ? sl - entryPx : entryPx - sl);
          btNote = `SL hit C${c.idx} (${c.time})`;
          exited = true; break;
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
      const allTrades = JSON.parse(fs.readFileSync('trades.json', 'utf-8'));
      const todayTrades = allTrades.filter((t: any) => (t.date || '').startsWith(todayDate) && t.exitPrice > 0);
      actualTrades = todayTrades.length;
      actualPnl = Math.round(todayTrades.reduce((s: number, t: any) => s + (t.pnl || 0), 0));
    } catch (_) {}

    // 4. Build record and upsert into daily-pnl-log.json
    const note = c0?.offline ? 'Bot offline' : signal === 'FLAT' ? 'No signal' : '';
    const record = { date: todayDate, signal, reason: c0?.reason ?? 'no_signal', btPnl, btNote, actualPnl, actualTrades, note };
    const logFile = 'daily-pnl-log.json';
    let logData: any[] = [];
    try { logData = JSON.parse(fs.readFileSync(logFile, 'utf-8')); } catch (_) {}
    const existing = logData.findIndex((e: any) => e.date === todayDate);
    if (existing >= 0) logData[existing] = record; else logData.push(record);
    logData.sort((a: any, b: any) => a.date < b.date ? -1 : 1);
    fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
    log('DAILY_PNL_SAVED', { date: todayDate, signal, btPnl, actualPnl, note });
  } catch (e: any) {
    log('DAILY_PNL_SAVE_FAIL', { error: e?.message ?? String(e) });
  }
}

// Helper for direction alignment
function isDirectionAligned(fiveMin: {open: number, close: number}, fifteenMin: {open: number, close: number}) {
  return (fiveMin.close > fiveMin.open && fifteenMin.close > fifteenMin.open) ||
         (fiveMin.close < fiveMin.open && fifteenMin.close < fifteenMin.open);
}


// --- MANDATORY TELEGRAM NOTIFICATIONS ---
// 2. BOT STOP (EOD or crash)
async function notifyBotStop(reason: string) {
  const _pnlSign = dailyPnL >= 0 ? "+" : "";
  await sendTelegram(`🔴 *BANKNIFTY Bot Stopped*\nReason: ${reason}\nDay P&L: *${_pnlSign}${dailyPnL} pts* | Trades: ${tradeCount}/${MAX_TRADES}\nTime: ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}`);
}

// 3. ENTRY ALERT
async function notifyEntry(
  type: string,
  symbol: string,
  entry: number,
  qty: number,
  direction: "CE" | "PE",
  candle: { open: number; high: number; low: number; close: number },
  bodyHigh: number,
  bodyLow: number,
  livePrice: number
) {
  const broke = direction === "CE"
    ? (livePrice > candle.high ? `Full High broken (prev high: ${candle.high})` : `Body High broken (prev body high: ${bodyHigh})`)
    : (livePrice < candle.low  ? `Full Low broken (prev low: ${candle.low})`   : `Body Low broken (prev body low: ${bodyLow})`);
  const colour = candle.close >= candle.open ? "🟢 Bullish" : "🔴 Bearish";
  const slippage = Math.abs(livePrice - entry).toFixed(1);
  await sendTelegram(
    `📥 *ENTRY EXECUTED — ${direction}*\n` +
    `Symbol: \`${symbol}\`\n` +
    `Entry price: *${entry}*  |  Qty: ${qty}\n` +
    `Slippage: ${slippage} pts\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📊 *Trigger: ${broke}*\n` +
    `Prev candle: O:${candle.open} H:${candle.high} L:${candle.low} C:${candle.close} ${colour}\n` +
    `Body: ${bodyLow} – ${bodyHigh}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `Type: ${type}  |  Live: ${livePrice}`
  );
}

// 4. EXIT ALERT
async function notifyExit(exit: number, pnl: number, reason: string, ctx?: { dir?: string | null; entry?: number; symbol?: string; qty?: number }) {
  const qty   = ctx?.qty ?? config.quantity;
  const rupeesEst = Math.round(Math.abs(pnl) * qty * 0.5);
  const pnlSign   = pnl >= 0 ? "+" : "−";
  const rsSign    = pnl >= 0 ? "+" : "−";
  const emoji     = pnl >= 0 ? "✅" : pnl > -10 ? "⚠️" : "❌";
  const dirLine   = ctx?.dir    ? `Direction: *${ctx.dir}*\n`       : "";
  const entryLine = ctx?.entry  ? `Index entry: ${ctx.entry}\n`     : "";
  const symLine   = ctx?.symbol ? `Symbol: \`${ctx.symbol}\`\n`    : "";
  const dailySign = dailyPnL >= 0 ? "+" : "";
  await sendTelegram(
    `${emoji} *◆ DRISHTI V1 · LOCK10 — EXIT → ${reason}*\n` +
    symLine + dirLine + entryLine +
    `Index exit: ${exit}\n` +
    `Index P&L: *${pnlSign}${Math.abs(pnl)} pts*\n` +
    `₹ est: *${rsSign}₹${rupeesEst.toLocaleString("en-IN")}* (${qty}qty×0.5δ)\n` +
    `━━━━━━━━━━━━━━\n` +
    `Day P&L so far: ${dailySign}${dailyPnL} pts`
  );
}

// 5. SL HIT ALERT
async function notifySLHit(loss: number) {
  await sendTelegram(`⛔ *STOP LOSS HIT*\nLoss: ${loss} pts\nTrade closed`);
}

// 6. DAILY LOSS LIMIT HIT
async function notifyDailyLoss(loss: number) {
  await sendTelegram(`🚨 *DAILY LOSS LIMIT HIT*\nLoss: *${loss} pts* | Trades: ${tradeCount}/${MAX_TRADES}\nTrading stopped for today`);
}

// 7. CRASH/ERROR ALERT
async function notifyCrash(reason: string) {
  const _pnlSign = dailyPnL >= 0 ? "+" : "";
  await sendTelegram(`💥 *BOT CRASHED*\nReason: ${reason}\nDay P&L: ${_pnlSign}${dailyPnL} pts | Trades: ${tradeCount}/${MAX_TRADES}\nRestart required`);
}

// 8. DAILY SUMMARY (EOD)
async function notifySummary(trades: number, wins: number, losses: number, netPnL: number, maxDrawdown: number) {
  const winPct    = trades > 0 ? Math.round((wins / trades) * 100) : 0;
  const qty       = config.quantity;
  const rupeesEst = Math.round(Math.abs(netPnL) * qty * 0.5);
  const pnlSign   = netPnL >= 0 ? "+" : "−";
  const rsSign    = netPnL >= 0 ? "+" : "−";
  const ddRupees  = Math.round(Math.abs(maxDrawdown) * qty * 0.5);
  const emoji     = netPnL > 0 ? "🟢" : netPnL < 0 ? "🔴" : "⚪";
  const today     = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
  await sendTelegram(
    `📊 *DAILY SUMMARY — DRISHTI V1 · LOCK10*\n` +
    `${today}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${emoji} Index P&L: *${pnlSign}${Math.abs(netPnL)} pts*\n` +
    `₹ est: *${rsSign}₹${rupeesEst.toLocaleString("en-IN")}* (${qty}qty×0.5δ)\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Trades: ${trades} | W: ${wins} L: ${losses} | Win: *${winPct}%*\n` +
    `Max DD: −${Math.abs(maxDrawdown)} pts ≈ −₹${ddRupees.toLocaleString("en-IN")}\n` +
    `Mode: ${config.mode.toUpperCase()} | Qty: ${qty}`
  );
}



