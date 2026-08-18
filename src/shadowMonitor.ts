import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

type InstrumentType = "FUTURES" | "OPTIONS";
type UnderlyingId = "BANKNIFTY" | "NIFTY";

const UNDERLYINGS: Record<UnderlyingId, { id: UnderlyingId; label: string; quantity: number; heartbeatFile: string; stateFile: string; historyFile: string }> = {
  BANKNIFTY: { id: "BANKNIFTY", label: "BANKNIFTY", quantity: 30, heartbeatFile: "bot-heartbeat.json", stateFile: "trade-state.json", historyFile: "strategy-monthly-history.json" },
  NIFTY: { id: "NIFTY", label: "NIFTY", quantity: 65, heartbeatFile: "nifty-shadow-heartbeat.json", stateFile: "nifty-shadow-state.json", historyFile: "nifty-shadow-history.json" },
};

type StrategyDefinition = {
  id: string;
  name: string;
  version: string;
  prefix: string;
  backtestFile?: string;
  instruments?: InstrumentType[];
  processName?: string;
  heartbeatFile?: string;
  stateFile?: string;
};

const BOT_DIR = process.env.TRADING_BOT_DIR || "/home/ubuntu/trading-bot";
const FUTURES_MARGIN_RATE = 0.12;
const FUTURES_CAPITAL_FALLBACK = 200000;
const OPTIONS_CAPITAL_FALLBACK = 50000;
const HEARTBEAT_HEALTHY_SEC = 60;
const HEARTBEAT_CRITICAL_SEC = 120;
const NSE_MARKET_OPEN_MINUTES = 9 * 60 + 15;
const NSE_FO_MARKET_CLOSE_MINUTES = 15 * 60 + 40;

type HealthLevel = "PASS" | "WARN" | "FAIL" | "INFO";
type HealthCheck = {
  id: string;
  label: string;
  level: HealthLevel;
  value: string;
  detail: string;
  source: string;
  critical: boolean;
};

const runtimeHealthCache = new Map<string, { checkedAt: number; value: any }>();
const jsonFileCache = new Map<string, { mtimeMs: number; value: any }>();

const STRATEGIES: StrategyDefinition[] = [
  { id: "drishti", name: "DRISHTI (BANKNIFTY)", version: "Current", prefix: "drishti", backtestFile: "shadow-strategy-5yr-results.json", instruments: ["FUTURES", "OPTIONS"] },
  {
    id: "drishti-v2",
    name: "DRISHTI V2 Challenger (BANKNIFTY)",
    version: "V2 Shadow",
    prefix: "drishtiV2",
    backtestFile: "drishti-v2-backtest.json",
    instruments: ["FUTURES", "OPTIONS"],
    processName: "drishti-v2-shadow",
    heartbeatFile: "drishti-v2-heartbeat.json",
    stateFile: "drishti-v2-state.json",
  },
  { id: "tt1030", name: "10:30 Breakout (BANKNIFTY)", version: "Current", prefix: "tt1030Shadow", backtestFile: "shadow-strategy-5yr-results.json", stateFile: "tt1030-shadow-state.json" },
  { id: "tt1030-quality-reversal", name: "10:30 Quality Break 50 Lock (BANKNIFTY)", version: "Signal Close + Profit Lock", prefix: "tt1030Quality", instruments: ["FUTURES", "OPTIONS"], stateFile: "tt1030-quality-state.json" },
  { id: "tt1000", name: "10:00 Breakout (BANKNIFTY)", version: "V1", prefix: "tt1000", backtestFile: "shadow-strategy-5yr-results.json", stateFile: "tt1000-state.json" },
  { id: "tt1000-quality-breakout", name: "10:00 Quality Breakout (BANKNIFTY)", version: "Quality V2", prefix: "tt1000Quality", instruments: ["FUTURES", "OPTIONS"], stateFile: "tt1000-quality-state.json" },
  { id: "tt0945", name: "09:45 Breakout (BANKNIFTY)", version: "V2 Shadow", prefix: "tt0945", backtestFile: "shadow-strategy-5yr-results.json", stateFile: "tt0945-state.json" },
  { id: "normal-breakout", name: "Normal Breakout (BANKNIFTY)", version: "V1", prefix: "normalBreakoutShadow", backtestFile: "shadow-strategy-5yr-results.json", stateFile: "normal-breakout-v1-state.json" },
  { id: "hybrid-body", name: "Hybrid Body Breakout (BANKNIFTY)", version: "Current", prefix: "hybridShadow", backtestFile: "shadow-strategy-5yr-results.json", stateFile: "hybrid-state.json" },
  { id: "body-hold-s1", name: "Body Hold S1 (BANKNIFTY)", version: "S1 Shadow", prefix: "bodyHoldS1", instruments: ["FUTURES", "OPTIONS"], stateFile: "body-hold-shadow-state.json" },
  { id: "body-hold-s2", name: "Body Hold S2 (BANKNIFTY)", version: "S2 Shadow", prefix: "bodyHoldS2", instruments: ["FUTURES", "OPTIONS"], stateFile: "body-hold-shadow-state.json" },
  { id: "low-iv-gamma", name: "Low-IV Gamma Breakout (BANKNIFTY)", version: "V1 Shadow", prefix: "lowIvGamma", instruments: ["OPTIONS"], heartbeatFile: "low-iv-gamma-heartbeat.json", stateFile: "low-iv-gamma-shadow-state.json", backtestFile: "low-iv-gamma-backtest.json" },
  { id: "vwap-trend", name: "VWAP Trend (BANKNIFTY)", version: "Validated Shadow", prefix: "vwapTrend", backtestFile: "indicator-strategy-sweep-result.json", instruments: ["FUTURES", "OPTIONS"], processName: "indicator-shadow", heartbeatFile: "indicator-shadow-heartbeat.json", stateFile: "vwap-trend-state.json" },
  { id: "pivot-trend", name: "Pivot Trend (BANKNIFTY)", version: "Validated Shadow", prefix: "pivotTrend", backtestFile: "indicator-strategy-sweep-result.json", instruments: ["FUTURES", "OPTIONS"], processName: "indicator-shadow", heartbeatFile: "indicator-shadow-heartbeat.json", stateFile: "pivot-trend-state.json" },
  { id: "ema-trend", name: "EMA Trend (BANKNIFTY)", version: "Validated Shadow", prefix: "emaTrend", backtestFile: "indicator-strategy-sweep-result.json", instruments: ["FUTURES", "OPTIONS"], processName: "indicator-shadow", heartbeatFile: "indicator-shadow-heartbeat.json", stateFile: "ema-trend-state.json" },
  { id: "smma-trend", name: "SMMA Trend (BANKNIFTY)", version: "Validated Shadow", prefix: "smmaTrend", backtestFile: "indicator-strategy-sweep-result.json", instruments: ["FUTURES", "OPTIONS"], processName: "indicator-shadow", heartbeatFile: "indicator-shadow-heartbeat.json", stateFile: "smma-trend-state.json" },
];

function underlyingId(value: any): UnderlyingId {
  return String(value || "").toUpperCase() === "NIFTY" ? "NIFTY" : "BANKNIFTY";
}

function displayStrategyName(strategy: StrategyDefinition, underlying: UnderlyingId): string {
  return `${strategy.name.replace(/\s*\(BANKNIFTY\)\s*$/i, "")} (${underlying})`;
}

function runtimeFiles(strategy: StrategyDefinition, underlying: UnderlyingId): { heartbeat: any; state: any } {
  if (underlying === "BANKNIFTY") {
    return {
      heartbeat: readJson(strategy.heartbeatFile || "bot-heartbeat.json", {}),
      state: readJson(strategy.stateFile || "trade-state.json", {}),
    };
  }
  const heartbeat = readJson(UNDERLYINGS.NIFTY.heartbeatFile, {});
  const stateRoot = readJson(UNDERLYINGS.NIFTY.stateFile, {});
  return { heartbeat, state: stateRoot?.strategies?.[strategy.id] || heartbeat?.strategies?.[strategy.id] || {} };
}

function strategiesForUnderlying(underlying: UnderlyingId): StrategyDefinition[] {
  return STRATEGIES;
}

function strategyAvailableForUnderlying(strategy: StrategyDefinition, underlying: UnderlyingId): boolean {
  if (underlying === "BANKNIFTY") return true;
  const stateRoot = readJson(UNDERLYINGS.NIFTY.stateFile, {});
  const heartbeat = readJson(UNDERLYINGS.NIFTY.heartbeatFile, {});
  const history = readJson(UNDERLYINGS.NIFTY.historyFile, {});
  const ids = new Set<string>([
    ...Object.keys(stateRoot?.strategies || {}),
    ...Object.keys(heartbeat?.strategies || {}),
    ...Object.keys(history?.strategies || {}),
  ]);
  return ids.size ? ids.has(strategy.id) : true;
}

function parseFirstJsonValue(raw: string): any {
  const trimmed = raw.replace(/^\uFEFF/, "").trimStart();
  try {
    return JSON.parse(trimmed);
  } catch {}

  const objectAt = trimmed.indexOf("{");
  const arrayAt = trimmed.indexOf("[");
  const start = objectAt < 0 ? arrayAt : arrayAt < 0 ? objectAt : Math.min(objectAt, arrayAt);
  if (start < 0) throw new Error("No JSON value found");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth += 1;
    if (ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) return JSON.parse(trimmed.slice(start, i + 1));
    }
  }
  throw new Error("Incomplete JSON value");
}

function readJson(file: string, fallback: any): any {
  try {
    const filePath = path.join(BOT_DIR, file);
    if (!fs.existsSync(filePath)) return fallback;
    const mtimeMs = fs.statSync(filePath).mtimeMs;
    const cached = jsonFileCache.get(filePath);
    if (cached && cached.mtimeMs === mtimeMs) return cached.value;
    const value = parseFirstJsonValue(fs.readFileSync(filePath, "utf8"));
    jsonFileCache.set(filePath, { mtimeMs, value });
    return value;
  } catch {
    return fallback;
  }
}

function num(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: any): string | null {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function dateKey(value: any): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isFinite(parsed.getTime())) {
    return parsed.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }
  const match = String(value).match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function timeValue(value: any): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isFinite(parsed.getTime())) {
    return parsed.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  return text(value);
}

function sanitizeLog(value: any): string {
  return String(value ?? "")
    .replace(/access[_ -]?token\s*[:=]\s*\S+/gi, "access_token=[redacted]")
    .replace(/api[_ -]?key\s*[:=]\s*\S+/gi, "api_key=[redacted]")
    .replace(/authorization\s*[:=]\s*\S+/gi, "authorization=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 360);
}

function logDateKey(value: any): string | null {
  const raw = String(value ?? "");
  const iso = raw.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slash) {
    const dd = slash[1].padStart(2, "0");
    const mm = slash[2].padStart(2, "0");
    return `${slash[3]}-${mm}-${dd}`;
  }
  return null;
}

function recentServerLogs(strategy: StrategyDefinition): any[] {
  const candidates = strategy.processName
    ? [
      `/root/.pm2/logs/${strategy.processName}-out.log`,
      `/home/ubuntu/.pm2/logs/${strategy.processName}-out.log`,
    ]
    : [
      "/root/.pm2/logs/trading-bot-out.log",
      "/home/ubuntu/.pm2/logs/trading-bot-out.log",
      path.join(BOT_DIR, "logs/server.log"),
      path.join(BOT_DIR, "logs/bot-out.log"),
    ];
  const rows: any[] = [];
  const seen = new Set<string>();
  const strategyPattern = strategy.processName === "indicator-shadow"
    ? new RegExp(strategy.id.replace("-", "[_ -]?"), "i")
    : strategy.id === "drishti"
    ? /drishti/i
    : strategy.id === "drishti-v2"
      ? /drishti[_ -]?v2|challenger/i
    : strategy.id === "tt1030"
      ? /\b10[:.]?30\b|\btt1030\b/i
      : strategy.id === "tt1030-quality-reversal"
        ? /\b10[:.]?30\b|\bquality\b|\breversal\b|\btt1030Quality\b|\bTT1030_QUALITY\b/i
      : strategy.id === "tt1000-quality-breakout"
        ? /\b10[:.]?00\b|\bquality\b|\btt1000Quality\b|\bTT1000_QUALITY\b/i
      : strategy.id === "tt1000"
        ? /\b10[:.]?00\b|\btt1000\b/i
        : strategy.id === "normal-breakout"
          ? /\bnormal\b|\bbreakout\b/i
          : /\bhybrid\b|\bbody\b/i;
  const operationalPattern =
    /\bheartbeat\b|\btoken\b|\bfeed\b|\bcandle\b|\bmarket\b|\bserver\b|\bconnected\b|\bsleep(?:ing)?\b|\bwake\b|\bstarted\b|\bstopped\b/i;
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).slice(-120);
      for (const line of lines) {
        if (/access[_ -]?token|authorization:|api[_ -]?key/i.test(line)) continue;
        const lineDate = logDateKey(line);
        if (lineDate && lineDate !== todayIST()) continue;
        const message = sanitizeLog(line);
        if (!message || /^\s*at\s|node:internal|requireStack/i.test(message)) continue;
        if (!strategyPattern.test(message) && !operationalPattern.test(message)) continue;
        const dedupeKey = message
          .replace(/\b\d{2}:\d{2}:\d{2}\b/g, "")
          .replace(/\b\d+(?:\.\d+)?(?:ms|s)\b/gi, "")
          .trim();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const timeMatch = message.match(/\b(\d{2}:\d{2}:\d{2})\b/);
        const level = /error|failed|rejected|exception/i.test(message)
          ? "ERROR"
          : /warn|waiting|stale|skip/i.test(message)
            ? "WARN"
            : /debug/i.test(message) ? "DEBUG" : "INFO";
        rows.push({ time: timeMatch?.[1] || "", level, message });
      }
    } catch {}
  }
  return rows.slice(-40);
}

function genericShadowFields(state: any, hb: any, instrument: InstrumentType, defaultQuantity: number) {
  const isOptions = instrument === "OPTIONS";
  const inTrade = !!state?.inTrade;
  const realized = num(isOptions ? state?.optionRealizedPnl : state?.realizedPnl) ?? 0;
  const unrealized = inTrade
    ? num(isOptions ? state?.optionUnrealizedPnl : state?.unrealizedPnl) ?? 0
    : 0;
  return {
    inTrade,
    realized,
    unrealized,
    total: realized + unrealized,
    trades: num(isOptions ? state?.optionTrades : state?.trades) ?? 0,
    wins: num(isOptions ? state?.optionWins : state?.wins) ?? 0,
    losses: num(isOptions ? state?.optionLosses : state?.losses) ?? 0,
    direction: text(state?.direction),
    symbol: text(isOptions ? state?.optionSymbol : state?.futuresSymbol) || text(hb?.market?.symbol),
    entry: num(isOptions ? state?.optionEntry : state?.entry),
    live: num(isOptions ? state?.optionLtp : state?.ltp),
    sl: num(state?.stopLoss),
    target: num(state?.target),
    quantity: num(state?.quantity) ?? num(hb?.quantity) ?? defaultQuantity,
    entryTime: timeValue(state?.entryAt || state?.entryTime),
    entryAt: state?.entryAt || null,
    phase: text(state?.phase || hb?.status),
    dayHigh: num(hb?.market?.high),
    dayLow: num(hb?.market?.low),
    volume: null,
    openInterest: null,
    rawTrades: Array.isArray(state?.tradeLog) ? state.tradeLog : [],
    candleLog: Array.isArray(state?.candleLog) ? state.candleLog : [],
  };
}

function strategyFields(strategy: StrategyDefinition, hb: any, state: any, instrument: InstrumentType, underlying: UnderlyingId = "BANKNIFTY") {
  if (underlying === "NIFTY") return genericShadowFields(state, hb, instrument, UNDERLYINGS.NIFTY.quantity);
  const isOptions = instrument === "OPTIONS";
  if (strategy.prefix === "drishtiV2") {
    const candleFile = readJson("drishti-v2-candle-log.json", {});
    const candleRows = Array.isArray(candleFile)
      ? candleFile
      : Array.isArray(candleFile?.candles) ? candleFile.candles : [];
    const rawTrades = readJson("drishti-v2-trades.json", []);
    const inTrade = isOptions ? !!(state.optionInTrade ?? hb.optionInTrade) : !!state.inTrade;
    const realized = isOptions
      ? num(state.optionRealizedPnl ?? hb.optionRealizedPnl) ?? 0
      : num(state.realizedPnl ?? hb.realizedPnl) ?? 0;
    const unrealized = inTrade
      ? isOptions
        ? num(state.optionUnrealizedPnl ?? hb.optionUnrealizedPnl) ?? 0
        : num(state.unrealizedPnl ?? hb.unrealizedPnl) ?? 0
      : 0;
    return {
      inTrade,
      realized,
      unrealized,
      total: realized + unrealized,
      trades: isOptions ? num(state.optionTradeCount ?? hb.optionTrades) ?? 0 : num(state.tradeCount ?? hb.trades) ?? 0,
      wins: isOptions ? num(state.optionWins ?? hb.optionWins) ?? 0 : num(state.wins ?? hb.wins) ?? 0,
      losses: isOptions ? num(state.optionLosses ?? hb.optionLosses) ?? 0 : num(state.losses ?? hb.losses) ?? 0,
      direction: text(state.side ?? hb.side),
      symbol: text(isOptions ? state.optionSymbol ?? hb.optionSymbol : state.futuresSymbol ?? hb.symbol),
      entry: num(isOptions ? state.optionEntryPrice ?? hb.optionEntry : state.entryPrice ?? hb.futuresEntry),
      live: num(isOptions ? state.optionLastPrice ?? hb.optionLive : state.lastPrice ?? hb.futuresLive),
      sl: num(state.stopLoss ?? hb.stopLoss),
      target: num(state.target ?? hb.target),
      quantity: num(hb.quantity) ?? 30,
      entryTime: timeValue(state.entryTime),
      entryAt: state.entryTime || null,
      phase: text(state.phase ?? hb.status),
      dayHigh: null,
      dayLow: null,
      volume: null,
      openInterest: null,
      rawTrades: Array.isArray(rawTrades) ? rawTrades : [],
      candleLog: candleFile?.date && dateKey(candleFile.date) !== todayIST() ? [] : candleRows,
    };
  }
  if (strategy.prefix === "drishti") {
    const candleFile = readJson("candle-log.json", []);
    const fileCandleRows = Array.isArray(candleFile)
      ? candleFile
      : Array.isArray(candleFile?.log)
        ? candleFile.log
        : Array.isArray(candleFile?.candles) ? candleFile.candles : [];
    const heartbeatCandleRows = Array.isArray(hb.DrishtiCandleLog) ? hb.DrishtiCandleLog : [];
    const candleRows = heartbeatCandleRows.length
      ? heartbeatCandleRows
      : candleFile?.date && dateKey(candleFile.date) !== todayIST() ? [] : fileCandleRows;
    const inTrade = isOptions ? !!hb.optInTrade : !!hb.inTrade;
    const rawSymbol = text(isOptions ? hb.optSymbol : hb.symbol);
    const scopedSymbol = !isOptions && rawSymbol && /\d+(CE|PE)$/i.test(rawSymbol) ? null : rawSymbol;
    const quantity = num(hb.qty) ?? 30;
    const realized = (isOptions ? num(hb.optDailyRs) : num(hb.dailyRealRs)) ?? 0;
    const live = num(isOptions ? hb.livePremium : hb.livePrice);
    const entry = num(isOptions ? hb.optEntryPrem : (hb.drishtiFuturesEntry || hb.entryPrice));
    const direction = text(isOptions ? hb.optDir : hb.direction);
    const unrealized = inTrade && live !== null && entry !== null
      ? isOptions
        ? (live - entry) * quantity
        : (direction === "PE" ? entry - live : live - entry) * quantity
      : 0;
    const allDrishtiTrades = readJson("trades.json", []);
    const scopedDrishtiTrades = (Array.isArray(allDrishtiTrades) ? allDrishtiTrades : []).filter((row: any) => {
      const type = String(row?.type || "").toUpperCase();
      if (isOptions) return type === "DRISHTI_V1_OPT";
      return type === "DRISHTI_V1";
    });
    const completedDrishtiTrades = scopedDrishtiTrades.filter((row: any) =>
      (num(row?.exitPrice ?? row?.exit) ?? 0) > 0
      || !!text(row?.reasonExit)
    );
    const tradeCount = completedDrishtiTrades.filter((row: any) =>
      dateKey(row?.date || row?.exitTime || row?.entryTime) === todayIST()
    ).length;
    return {
      inTrade,
      realized,
      unrealized: inTrade ? unrealized : 0,
      total: (realized ?? 0) + (inTrade ? (unrealized ?? 0) : 0),
      trades: tradeCount,
      wins: num(isOptions ? hb.optWins : state.drishtiWins) ?? 0,
      losses: num(isOptions ? hb.optLosses : state.drishtiLosses) ?? 0,
      direction,
      symbol: scopedSymbol,
      entry,
      live,
      sl: num(hb.sl),
      target: null,
      quantity,
      entryTime: timeValue(isOptions ? hb.optEntryTime : hb.entryTime),
      entryAt: isOptions ? hb.optEntryTime : hb.entryTime,
      phase: text(hb.status),
      dayHigh: null,
      dayLow: null,
      volume: null,
      openInterest: null,
      rawTrades: completedDrishtiTrades,
      candleLog: candleRows,
    };
  }

  if (strategy.prefix === "bodyHoldS1" || strategy.prefix === "bodyHoldS2") {
    const isS1 = strategy.prefix === "bodyHoldS1";
    const stateIsCurrent = dateKey(state?.date) === todayIST();
    const leg = stateIsCurrent ? (isS1 ? state?.s1 : state?.s2) || {} : {};
    const hbPrefix = isS1 ? "bodyHoldS1" : "bodyHoldS2";
    const expectedType = isS1
      ? (isOptions ? "BH_S1_OPT" : "BH_S1_FUT")
      : (isOptions ? "BH_S2_OPT" : "BH_S2_FUT");
    const ledger = readJson("trades.json", []);
    const rawTrades = (Array.isArray(ledger) ? ledger : []).filter((row: any) =>
      String(row?.type || "").toUpperCase() === expectedType
    );
    const todayRows = rawTrades.filter((row: any) => dateKey(row?.date) === todayIST());
    const quantity = num(hb.qty) ?? 30;
    const realized = num(hb[isOptions ? `${hbPrefix}OptionsRealizedPnL` : `${hbPrefix}FuturesRealizedPnL`])
      ?? num(isOptions ? leg.dayOptRs : leg.dayFutRs)
      ?? todayRows.reduce((sum: number, row: any) => sum + (num(row?.pnlRs) ?? 0), 0);
    const live = num(isOptions
      ? hb[`${hbPrefix}OptionLive`] ?? leg.livePrem
      : hb[`${hbPrefix}Live`] ?? leg.liveIdx);
    const entry = num(isOptions ? leg.entryPrem : leg.entryIdx ?? hb[`${hbPrefix}Entry`]);
    const direction = text(leg.dir ?? hb[`${hbPrefix}Dir`]);
    const inTrade = !!(leg.inTrade ?? hb[`${hbPrefix}InTrade`]);
    const processedCandleKeys = stateIsCurrent && Array.isArray(state?.processedCandleKeys) ? state.processedCandleKeys : [];
    const candleLog = processedCandleKeys.map((key: any, idx: number) => {
      const time = String(key || "").split("|").pop() || "";
      const isLast = idx === processedCandleKeys.length - 1;
      return {
        idx: idx + 1,
        time,
        status: isLast && !inTrade ? "done" : "processed",
        note: isLast && !inTrade ? "processed through latest candle" : "processed",
      };
    });
    const phase = inTrade
      ? "IN TRADE"
      : todayRows.length || processedCandleKeys.some((key: any) => String(key).endsWith("|15:15"))
        ? "DONE"
        : hb.status;
    const publishedUnrealized = num(hb[isOptions ? `${hbPrefix}OptionsUnrealizedPnL` : `${hbPrefix}FuturesUnrealizedPnL`]);
    const unrealized = publishedUnrealized ?? (inTrade && live !== null && entry !== null
      ? isOptions
        ? (live - entry) * quantity
        : (direction === "PE" ? entry - live : live - entry) * quantity
      : 0);
    return {
      inTrade,
      realized,
      unrealized,
      total: realized + unrealized,
      trades: todayRows.length,
      wins: todayRows.filter((row: any) => (num(row?.pnlRs) ?? 0) > 0).length,
      losses: todayRows.filter((row: any) => (num(row?.pnlRs) ?? 0) < 0).length,
      direction,
      symbol: isOptions ? text(leg.optSym ?? hb[`${hbPrefix}OptionSymbol`]) : "BANKNIFTY FUTURES",
      entry,
      live,
      sl: num(isOptions ? leg.slPrem : leg.sl ?? hb[`${hbPrefix}SL`]),
      target: null,
      quantity,
      entryTime: null,
      entryAt: null,
      phase: text(phase),
      dayHigh: null,
      dayLow: null,
      volume: null,
      openInterest: null,
      rawTrades,
      candleLog,
    };
  }

  const prefix = strategy.prefix;
  const fieldPrefix = prefix === "tt1030Shadow" ? "tt1030" : prefix;
  const stateIsCurrent = dateKey(state?.date || state?.day) === todayIST();
  const persisted = stateIsCurrent ? state : {};
  const heartbeatTrades = Array.isArray(hb[`${fieldPrefix}TradeLog`]) ? hb[`${fieldPrefix}TradeLog`] : [];
  const persistedTrades = Array.isArray(persisted.log) ? persisted.log : [];
  const heartbeatCandles = Array.isArray(hb[`${fieldPrefix}CandleLog`]) ? hb[`${fieldPrefix}CandleLog`] : [];
  const persistedCandles = Array.isArray(persisted.candleLog) ? persisted.candleLog : [];
  const rawTrades = persistedTrades.length ? persistedTrades : heartbeatTrades;
  const candleLog = persistedCandles.length ? persistedCandles : heartbeatCandles;
  const inTrade = persisted.inTrade !== undefined ? !!persisted.inTrade : !!hb[`${fieldPrefix}InTrade`];
  const persistedTotal = num(isOptions ? persisted.optDayRs : persisted.dayRs);
  const heartbeatTotal = num(hb[isOptions ? `${fieldPrefix}OptPnL` : `${fieldPrefix}PnL`]);
  const total = inTrade
    ? heartbeatTotal ?? persistedTotal ?? 0
    : persistedTotal ?? heartbeatTotal ?? 0;
  const closed = num(hb[isOptions ? `${fieldPrefix}OptClosedPnL` : `${fieldPrefix}ClosedPnL`])
    ?? (!inTrade ? total : null);
  const realized = closed ?? (inTrade ? null : total);
  const unrealized = inTrade && realized !== null ? total - realized : (inTrade ? total : 0);
  const optionSymbol = text(hb[`${fieldPrefix}OptionSymbol`] ?? persisted.optSym);
  const futuresSymbol = text(hb[`${fieldPrefix}FuturesSymbol`] ?? persisted.futSym);
  const direction = text(hb[`${fieldPrefix}Dir`] ?? persisted.dir);
  const optionWins = num(persisted.optWins);
  const optionLosses = num(persisted.optLosses);
  const inferredOptionWins = persistedTrades.filter((row: any) => {
    const entry = num(row?.premIn ?? row?.premiumEntry);
    const exit = num(row?.premOut ?? row?.premiumExit);
    return entry !== null && exit !== null && exit > entry;
  }).length;
  const inferredOptionLosses = persistedTrades.filter((row: any) => {
    const entry = num(row?.premIn ?? row?.premiumEntry);
    const exit = num(row?.premOut ?? row?.premiumExit);
    return entry !== null && exit !== null && exit < entry;
  }).length;
  const storedQuantity = num(hb[`${fieldPrefix}LiveQty`] ?? persisted.liveQty ?? hb.qty);
  const quantity = storedQuantity !== null && storedQuantity > 0 ? storedQuantity : 30;
  return {
    inTrade,
    realized,
    unrealized,
    total,
    trades: isOptions
      ? num(persisted.optTrades) ?? num(hb[`${fieldPrefix}OptTrades`]) ?? num(persisted.trades) ?? num(hb[`${fieldPrefix}Trades`]) ?? 0
      : num(persisted.trades) ?? num(hb[`${fieldPrefix}Trades`]) ?? 0,
    wins: isOptions
      ? optionWins ?? inferredOptionWins
      : num(persisted.wins) ?? num(hb[`${prefix}Wins`]) ?? 0,
    losses: isOptions
      ? optionLosses ?? inferredOptionLosses
      : num(persisted.losses) ?? num(hb[`${prefix}Losses`]) ?? 0,
    direction,
    symbol: isOptions ? optionSymbol : futuresSymbol,
    entry: isOptions
      ? num(hb[`${fieldPrefix}OptionEntry`] ?? persisted.optEntryPrem)
      : num(hb[`${fieldPrefix}FuturesEntry`] ?? hb[`${fieldPrefix}Entry`] ?? persisted.entry),
    live: isOptions
      ? num(hb[`${fieldPrefix}OptionLive`] ?? persisted.optLivePrem)
      : num(hb[`${fieldPrefix}FuturesLive`] ?? hb[`${fieldPrefix}Live`] ?? persisted.live),
    sl: num(hb[`${fieldPrefix}SL`] ?? persisted.sl),
    target: null,
    quantity,
    entryTime: timeValue(hb[`${fieldPrefix}EntryTime`] ?? persisted.entryTime),
    entryAt: hb[`${fieldPrefix}EntryAt`] ?? (persisted.date && persisted.entryTime ? `${persisted.date}T${persisted.entryTime}:00+05:30` : null),
    phase: text(hb[`${fieldPrefix}Phase`] || persisted.phase || (candleLog.length ? "DONE" : hb.status)),
    dayHigh: num(hb[isOptions ? `${fieldPrefix}OptionHigh` : `${fieldPrefix}High`]),
    dayLow: num(hb[isOptions ? `${fieldPrefix}OptionLow` : `${fieldPrefix}Low`]),
    volume: num(hb[isOptions ? `${fieldPrefix}OptionVolume` : `${fieldPrefix}Volume`]),
    openInterest: num(hb[isOptions ? `${fieldPrefix}OptionOpenInterest` : `${fieldPrefix}OpenInterest`]),
    rawTrades,
    candleLog,
  };
}

function normalizedTrades(rawTrades: any[], strategy: StrategyDefinition, instrument: InstrumentType, tradeDate: string, defaultQuantity = 30) {
  const normalized = rawTrades
    .filter((row: any) => {
      const rowDate = dateKey(row.date || row.at || row.entryTime || row.exitTime);
      return !rowDate || rowDate === tradeDate;
    })
    .filter((row: any) => {
      const symbol = String(row.symbol || row.tradeSymbol || row.contract || "").toUpperCase();
      const hasPremium = num(row.premiumEntry ?? row.entryPremium ?? row.premIn) !== null;
      const hasIndexTrade = num(row.entry ?? row.entryPrice) !== null;
      const looksOption = /\d+(CE|PE)$/.test(symbol) || hasPremium;
      return instrument === "OPTIONS" ? looksOption : hasIndexTrade || !looksOption;
    })
    .filter((row: any) => {
      const underlyingExit = num(row.exit ?? row.exitPrice);
      const premiumExit = num(row.premiumExit ?? row.exitPremium ?? row.premOut);
      const storedPnl = num(row.pnlRs ?? row.pnl ?? row.optionPnlRs ?? row.optPnlRs ?? row.optionPnl);
      const explicitStatus = String(row.status || "").toUpperCase();
      return underlyingExit !== null || premiumExit !== null || storedPnl !== null
        || explicitStatus === "OPEN" || explicitStatus === "CLOSED" || explicitStatus === "REJECTED";
    })
    .map((row: any, index: number) => {
      const direction = (text(row.direction || row.dir || row.side) || "").toUpperCase();
      const isOptions = instrument === "OPTIONS";
      const rawSymbol = text(isOptions
        ? row.optionSymbol || row.symbol || row.tradeSymbol || row.contract
        : row.symbol || row.tradeSymbol || row.contract) || "";
      const quantity = num(row.qty ?? row.quantity ?? row.lots) ?? defaultQuantity;
      const entry = isOptions
        ? num(row.premiumEntry ?? row.entryPremium ?? row.premIn)
        : num(row.entryPrice ?? row.entry);
      const exit = isOptions
        ? num(row.premiumExit ?? row.exitPremium ?? row.premOut)
        : num(row.exitPrice ?? row.exit);
      const premiumPnl = isOptions && entry !== null && exit !== null
        ? (exit - entry) * quantity
        : null;
      const pnl = isOptions
        ? num(row.optionPnlRs ?? row.optPnlRs ?? row.optionPnl) ?? premiumPnl
        : num(row.pnlRs ?? row.pnl ?? row.points ?? row.pts);
      const contract = /\b(CE|PE)\b/i.test(direction)
        ? direction.match(/\b(CE|PE)\b/i)?.[1]?.toUpperCase()
        : rawSymbol.match(/(CE|PE)$/i)?.[1]?.toUpperCase() || null;
      const action = isOptions
        ? "BUY"
        : contract === "PE" || /\bSELL|SHORT\b/i.test(direction) ? "SELL" : "BUY";
      const exitAction = action === "BUY" ? "SELL" : "BUY";
      const symbol = isOptions
        ? rawSymbol || `BANKNIFTY ${contract || "OPTION"}`
        : text(row.futuresSymbol) || "BANKNIFTY FUTURES";
      const stableId = text(row.tradeId || row.signalId) || [
        strategy.id, instrument, tradeDate, symbol, direction, entry, row.entryTime || row.date || index,
      ].join("|");
      const capitalDeployed = entry !== null && quantity > 0
        ? (isOptions ? entry * quantity : entry * quantity * FUTURES_MARGIN_RATE)
        : null;
      return {
        id: stableId,
        tradeId: stableId,
        strategyId: strategy.id,
        strategyVersion: strategy.version,
        instrumentType: instrument,
        executionMode: "SHADOW",
        tradeDate,
        time: timeValue(row.entryTime || row.date || row.at || row.time),
        instrument: symbol,
        side: direction,
        contract,
        action,
        exitAction,
        quantity,
        entry,
        exit,
        stopLoss: num(row.sl ?? row.stopLoss),
        target: num(row.target),
        pnl,
        capitalDeployed,
        returnPct: pnl !== null && capitalDeployed ? pnl / capitalDeployed * 100 : null,
        result: pnl === null ? null : pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "FLAT",
        status: text(isOptions ? row.optionStatus ?? row.status : row.status)
          || (isOptions && num(row.exit ?? row.exitPrice) !== null && exit === null
            ? "DATA UNAVAILABLE"
            : exit !== null || pnl !== null ? "CLOSED" : "OPEN"),
        reason: text(row.reasonExit || row.reason || row.note),
      };
    });

  const consolidated = new Map<string, any>();
  for (const row of normalized) {
    const tradeKey = text(row.tradeId || row.id)
      ? `id:${text(row.tradeId || row.id)}`
      : [row.instrument, row.contract, row.side, row.entry, row.time, row.exit, row.reason].join("|");
    const existing = consolidated.get(tradeKey);
    if (!existing || (existing.exit == null && row.exit != null)) {
      consolidated.set(tradeKey, row);
    }
  }

  return [...consolidated.values()]
    .slice(-25)
    .reverse();
}

function normalizedCandles(raw: any[], hb: any, instrument: InstrumentType): any[] {
  const rows = Array.isArray(raw) ? raw : [];
  const deduped = new Map<string, any>();
  rows.forEach((row: any, index: number) => {
    const key = text(row.time) || String(row.idx ?? row.num ?? index);
    deduped.set(key, row);
  });
  return [...deduped.values()].reverse().map((row: any) => ({
    number: num(row.idx ?? row.num),
    time: text(row.time) || timeValue(row.at || row.date),
    timeframe: text(row.timeframe || row.tf) || "15m",
    open: num(row.open ?? row.o),
    high: num(row.high ?? row.h),
    low: num(row.low ?? row.l),
    close: num(row.close ?? row.c),
    volume: num(row.volume ?? row.v),
    status: text(row.status || row.state),
    side: text(row.dir || row.direction || row.side),
    entry: num(row.entry ?? row.entryPrice),
    stopLoss: num(row.sl ?? row.stopLoss),
    exit: num(row.exit ?? row.exitPrice),
    pnl: instrument === "OPTIONS"
      ? num(row.optionPnlRs ?? row.optPnlRs ?? row.optionPnl)
      : num(row.pnlRs ?? row.pnl ?? row.pnlPts),
    note: text(row.note || row.reason) || "No evaluation note recorded",
  })).map((row: any) => ({ ...row, receivedAt: hb?.at || null }));
}

function backtestSummary(strategy: StrategyDefinition, instrument: InstrumentType): any {
  if (!strategy.backtestFile) return null;
  const data = readJson(strategy.backtestFile, null);
  if (!data) return null;
  const normalized = data?.strategies?.[strategy.id]?.[instrument];
  if (normalized?.summary) {
    const summary = normalized.summary;
    return {
      source: strategy.backtestFile,
      coverage: data.coverage?.from && data.coverage?.to
        ? `${String(data.coverage.from).slice(0, 4)}-${String(data.coverage.to).slice(0, 4)}`
        : "5Y",
      coverageFrom: data.coverage?.from || null,
      coverageTo: data.coverage?.to || null,
      pnl: num(summary.total),
      pnlUnit: "rupees",
      winRate: num(summary.winRate),
      maxDrawdown: num(summary.maxDrawdown),
      avgMonthlyPnl: num(summary.avgMonthlyPnl),
      capitalUsed: num(summary.capitalUsed),
      returnPct: num(summary.returnPct),
      avgMonthlyReturnPct: num(summary.avgMonthlyReturnPct),
      totalTrades: num(summary.totalTrades),
      dailyRecords: Array.isArray(normalized.days) ? normalized.days.length : 0,
      monthlyRecords: Array.isArray(normalized.months) ? normalized.months.length : 0,
      modelled: !!normalized.modelled,
      methodology: text(normalized.methodology),
      days: strategy.id === "drishti-v2"
        ? []
        : Array.isArray(normalized.days) ? normalized.days : [],
      weeks: Array.isArray(normalized.weeks) ? normalized.weeks : [],
      months: Array.isArray(normalized.months) ? normalized.months : [],
      years: Array.isArray(normalized.years) ? normalized.years : [],
      generatedAt: data.generatedAt || null,
    };
  }
  if (strategy.prefix === "tt1030Shadow" && data.summary) {
    const stats = instrument === "OPTIONS" ? data.summary.optStats : data.summary.futStats;
    const months = data.months && typeof data.months === "object" ? Object.keys(data.months).length : 0;
    if (!stats) return null;
    return {
      source: strategy.backtestFile,
      coverage: "2021-2026",
      pnl: num(stats.total),
      pnlUnit: "rupees",
      winRate: num(stats.winRate),
      maxDrawdown: num(stats.maxDD),
      avgMonthlyPnl: months ? (num(stats.total) ?? 0) / months : null,
      totalTrades: num(data.summary.trades),
      dailyRecords: num(data.summary.days) ?? 0,
      monthlyRecords: months,
    };
  }
  const totals = data.totals || data.summary || data.total || {};
  const daily = Array.isArray(data.daily) ? data.daily : [];
  const monthly = data.monthly && typeof data.monthly === "object" ? Object.values(data.monthly) : [];
  const totalTrades = num(totals.trades ?? totals.totalTrades ?? data.tradedDays);
  const wins = num(totals.wins ?? totals.totalWins);
  const winRate = num(data.winRate ?? totals.winRate ?? totals.tradeWinRate) ?? (
    totalTrades && wins !== null ? (wins / totalTrades) * 100 : null
  );
  const maxDrawdown = num(totals.maxDDRs ?? totals.maxDrawdown ?? data.maxDrawdown);
  const cashPnl = num(totals.totalPnlRs ?? totals.pnl ?? totals.totalPnl);
  const pnl = cashPnl ?? num(totals.bodyBreakout);
  const pnlUnit = cashPnl !== null ? "rupees" : "points";
  const dailyValues = daily.map((row: any) => num(row.pnl ?? row.bbPnL)).filter((value: number | null): value is number => value !== null);
  let derivedDrawdown = 0;
  let equity = 0;
  let peak = 0;
  for (const value of dailyValues) {
    equity += value;
    peak = Math.max(peak, equity);
    derivedDrawdown = Math.max(derivedDrawdown, peak - equity);
  }
  const resolvedDrawdown = maxDrawdown ?? (dailyValues.length ? derivedDrawdown : null);
  const avgMonthlyPnl = monthly.length && pnl !== null ? pnl / monthly.length : null;
  if ([totalTrades, winRate, resolvedDrawdown, avgMonthlyPnl, pnl].every(v => v === null)) return null;
  return {
    source: strategy.backtestFile,
    coverage: data.period?.from && data.period?.to ? `${String(data.period.from).slice(0, 4)}-${String(data.period.to).slice(0, 4)}` : null,
    pnlUnit,
    winRate,
    maxDrawdown: resolvedDrawdown,
    avgMonthlyPnl,
    totalTrades,
    pnl,
    dailyRecords: daily.length,
    monthlyRecords: monthly.length,
  };
}

function recentLiveMonthKeys(tradeDate = todayIST()): Set<string> {
  const [year, month] = tradeDate.split("-").map(Number);
  const current = `${year}-${String(month).padStart(2, "0")}`;
  const previousDate = new Date(Date.UTC(year, month - 2, 1));
  const previous = `${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth() + 1).padStart(2, "0")}`;
  return new Set([current, previous]);
}

function normalizedBacktestDays(strategy: StrategyDefinition, instrument: InstrumentType): any[] {
  if (!strategy.backtestFile) return [];
  const data = readJson(strategy.backtestFile, null);
  if (!data) return [];
  const selected = data?.strategies?.[strategy.id];
  const normalized = selected?.[instrument] || selected?.OPTIONS || selected?.FUTURES;
  const rows = Array.isArray(normalized?.days)
    ? normalized.days
    : Array.isArray(data?.days)
      ? data.days
      : Array.isArray(data?.daily) ? data.daily : [];
  return rows.map((row: any) => {
    const date = dateKey(row?.date || row?.period);
    if (!date) return null;
    const pnl = num(row?.pnl ?? row?.total ?? row?.netPnl ?? row?.bbPnL);
    if (pnl === null) return null;
    const trades = num(row?.trades ?? row?.totalTrades) ?? 0;
    const wins = num(row?.wins ?? row?.totalWins) ?? (pnl > 0 && trades > 0 ? 1 : 0);
    const losses = num(row?.losses ?? row?.totalLosses) ?? (pnl < 0 && trades > 0 ? 1 : 0);
    return {
      date,
      pnl,
      capitalDeployed: num(row?.capitalDeployed ?? row?.capitalUsed) ?? 0,
      trades,
      wins,
      losses,
    };
  }).filter(Boolean);
}

function shadowHistory(strategy: StrategyDefinition, instrument: InstrumentType, includeBacktest = true, underlying: UnderlyingId = "BANKNIFTY"): any {
  const byDate = new Map<string, { date: string; pnl: number; capitalDeployed: number; trades: number; wins: number; losses: number }>();
  const tradeDetails: any[] = [];
  const appendTradeDetail = (date: string, row: any) => {
    const direction = text(row?.dir ?? row?.direction ?? row?.side).toUpperCase();
    const quantity = num(row?.qty ?? row?.quantity) ?? 30;
    const entry = num(instrument === "OPTIONS"
      ? row?.premIn ?? row?.premiumEntry ?? row?.entryPremium
      : row?.entry ?? row?.entryPrice);
    const exit = num(instrument === "OPTIONS"
      ? row?.premOut ?? row?.premiumExit ?? row?.exitPremium
      : row?.exit ?? row?.exitPrice);
    if (entry === null && exit === null) return;
    const action = instrument === "OPTIONS"
      ? text(row?.action || "BUY").toUpperCase()
      : text(row?.action || (direction === "PE" || direction === "SELL" ? "SELL" : "BUY")).toUpperCase();
    const exitAction = action === "SELL" ? "BUY" : "SELL";
    const calculatedPnl = entry !== null && exit !== null
      ? (exit - entry) * quantity * (action === "SELL" ? -1 : 1)
      : null;
    const storedPnl = num(row?.pnlRs ?? row?.netPnlRs ?? (instrument === "OPTIONS"
      ? row?.optionsPnl ?? row?.optionPnl ?? row?.premiumPnl
      : null));
    const pnl = storedPnl ?? calculatedPnl ?? num(row?.pnl);
    const capitalDeployed = entry && quantity
      ? (instrument === "OPTIONS" ? entry * quantity : entry * quantity * FUTURES_MARGIN_RATE)
      : 0;
    tradeDetails.push({
      tradeId: text(row?.tradeId ?? row?.id) || `${strategy.id}-${instrument}-${date}-${text(row?.time)}-${tradeDetails.length + 1}`,
      date,
      time: timeValue(row?.time ?? row?.entryTime ?? row?.timestamp ?? row?.date) || "--",
      instrument: instrument === "OPTIONS"
        ? text(row?.symbol ?? row?.tradeSymbol) || `${underlying} ${direction}`
        : `${underlying} FUTURES`,
      contract: direction || "--",
      action,
      exitAction,
      entry,
      exit,
      quantity,
      pnl,
      capitalDeployed: Math.round(capitalDeployed),
      returnPct: capitalDeployed > 0 && pnl !== null ? pnl / capitalDeployed * 100 : null,
      status: exit !== null || pnl !== null ? "CLOSED" : "OPEN",
      reason: text(row?.reasonExit ?? row?.reason ?? row?.exitReason ?? row?.note) || "--",
    });
  };
  const monthlyHistoryKey: Record<string, string> = {
    tt1030Shadow: "TEN_THIRTY",
    tt1030Quality: "TEN_THIRTY_QUALITY",
    tt1000: "TEN_O_CLOCK",
    tt1000Quality: "TEN_O_CLOCK_QUALITY",
    tt0945: "NINE_FORTY_FIVE",
    normalBreakoutShadow: "NORMAL_BREAKOUT_V1",
    hybridShadow: "HYBRID_BODY",
  };
  const historyKey = monthlyHistoryKey[strategy.prefix];
  const ledgerTypeMap: Record<string, { FUTURES: string; OPTIONS: string }> = {
    drishti: { FUTURES: "DRISHTI_V1", OPTIONS: "DRISHTI_V1_OPT" },
    tt1030Shadow: { FUTURES: "TEN_THIRTY_INDEX", OPTIONS: "TEN_THIRTY_OPT" },
    tt1030Quality: { FUTURES: "TEN_THIRTY_QUALITY_INDEX", OPTIONS: "TEN_THIRTY_QUALITY_OPT" },
    tt1000: { FUTURES: "TEN_O_CLOCK_INDEX", OPTIONS: "TEN_O_CLOCK_OPT" },
    tt1000Quality: { FUTURES: "TEN_O_CLOCK_QUALITY_INDEX", OPTIONS: "TEN_O_CLOCK_QUALITY_OPT" },
    normalBreakoutShadow: { FUTURES: "NORMAL_BREAKOUT_V1_INDEX", OPTIONS: "NORMAL_BREAKOUT_V1_OPT" },
    hybridShadow: { FUTURES: "HYBRID_BODY_INDEX", OPTIONS: "HYBRID_BODY_OPT" },
    bodyHoldS1: { FUTURES: "BH_S1_FUT", OPTIONS: "BH_S1_OPT" },
    bodyHoldS2: { FUTURES: "BH_S2_FUT", OPTIONS: "BH_S2_OPT" },
    lowIvGamma: { FUTURES: "", OPTIONS: "LOW_IV_GAMMA_OPT" },
  };
  const ledgerType = ledgerTypeMap[strategy.prefix]?.[instrument];
  if (underlying === "NIFTY") {
    const source = readJson(UNDERLYINGS.NIFTY.historyFile, {});
    const records = source?.strategies?.[strategy.id] || {};
    for (const [date, record] of Object.entries(records) as [string, any][]) {
      const pnl = num(instrument === "OPTIONS" ? record.optionPnl : record.futuresPnl);
      if (pnl === null) continue;
      const rows = Array.isArray(record.tradeLog) ? record.tradeLog : [];
      rows.forEach((row: any) => appendTradeDetail(date, row));
      const trades = num(instrument === "OPTIONS" ? record.optionTrades : record.trades) ?? 0;
      const quantity = num(record.quantity) ?? UNDERLYINGS.NIFTY.quantity;
      const entry = num(instrument === "OPTIONS" ? record.optionEntry : record.entry);
      byDate.set(date, {
        date,
        pnl,
        capitalDeployed: entry && trades ? Math.round(entry * quantity * trades * (instrument === "FUTURES" ? FUTURES_MARGIN_RATE : 1)) : 0,
        trades,
        wins: num(instrument === "OPTIONS" ? record.optionWins : record.wins) ?? 0,
        losses: num(instrument === "OPTIONS" ? record.optionLosses : record.losses) ?? 0,
      });
    }
  } else if (ledgerType) {
    const ledger = readJson("trades.json", []);
    const rows = (Array.isArray(ledger) ? ledger : []).filter((row: any) => {
      if (String(row?.type || "").toUpperCase() !== ledgerType) return false;
      const closed = (num(row?.exitPrice ?? row?.exit ?? row?.premiumExit) ?? 0) > 0 || !!text(row?.reasonExit);
      return closed && !!dateKey(row?.date || row?.exitTime || row?.entryTime);
    });
    const grouped = new Map<string, any[]>();
    for (const row of rows) {
      const date = dateKey(row?.date || row?.exitTime || row?.entryTime);
      const dayRows = grouped.get(date) || [];
      dayRows.push(row);
      grouped.set(date, dayRows);
      appendTradeDetail(date, row);
    }
    for (const [date, dayRows] of grouped) {
      const pnls = dayRows.map((row: any) => {
        const stored = num(row?.pnlRs);
        if (stored !== null) return stored;
        const entry = num(instrument === "OPTIONS" ? row?.premiumEntry ?? row?.premIn : row?.entryPrice ?? row?.entry);
        const exit = num(instrument === "OPTIONS" ? row?.premiumExit ?? row?.premOut : row?.exitPrice ?? row?.exit);
        const quantity = num(row?.qty ?? row?.quantity) ?? 30;
        if (entry === null || exit === null) return 0;
        const direction = String(row?.direction || row?.dir || "").toUpperCase();
        return (exit - entry) * quantity * (instrument === "FUTURES" && direction === "PE" ? -1 : 1);
      });
      const capitalDeployed = dayRows.reduce((sum: number, row: any) => {
        const entry = num(instrument === "OPTIONS" ? row?.premiumEntry ?? row?.premIn : row?.entryPrice ?? row?.entry);
        const quantity = num(row?.qty ?? row?.quantity) ?? 30;
        return sum + (entry && quantity ? (instrument === "OPTIONS" ? entry * quantity : entry * quantity * FUTURES_MARGIN_RATE) : 0);
      }, 0);
      byDate.set(date, {
        date,
        pnl: pnls.reduce((sum, value) => sum + value, 0),
        capitalDeployed: Math.round(capitalDeployed),
        trades: dayRows.length,
        wins: pnls.filter(value => value > 0).length,
        losses: pnls.filter(value => value < 0).length,
      });
    }
  } else if (strategy.processName === "indicator-shadow") {
    const source = readJson("indicator-shadow-history.json", {});
    const indicatorDays = source?.strategies?.[strategy.id] || {};
    for (const [date, record] of Object.entries(indicatorDays) as [string, any][]) {
      const pnl = num(instrument === "OPTIONS" ? record.optionsRs : record.futuresRs);
      if (pnl === null) continue;
      const rows = Array.isArray(record.rows) ? record.rows : [];
      rows.forEach((row: any) => appendTradeDetail(date, row));
      const capitalDeployed = rows.reduce((sum: number, row: any) => {
        const entry = num(instrument === "OPTIONS" ? row.premIn : row.entry);
        const quantity = num(row.qty) ?? 30;
        return sum + (entry && quantity
          ? instrument === "OPTIONS" ? entry * quantity : entry * quantity * FUTURES_MARGIN_RATE
          : 0);
      }, 0);
      byDate.set(date, {
        date,
        pnl,
        capitalDeployed: Math.round(capitalDeployed),
        trades: num(instrument === "OPTIONS" ? record.optionTrades : record.trades) ?? 0,
        wins: num(instrument === "OPTIONS" ? record.optionWins : record.wins) ?? 0,
        losses: num(instrument === "OPTIONS" ? record.optionLosses : record.losses) ?? 0,
      });
    }
  } else if (historyKey) {
    const source = readJson("strategy-monthly-history.json", {});
    const months = source?.months && typeof source.months === "object" ? source.months : {};
    for (const month of Object.values(months) as any[]) {
      const days = month?.[historyKey]?.days || {};
      for (const [date, record] of Object.entries(days) as [string, any][]) {
        const summary = record?.summary || {};
        const pnl = num(instrument === "OPTIONS" ? summary.optionsRs : summary.futuresRs);
        if (pnl === null) continue;
        const tradeRows = Array.isArray(record?.trades) ? record.trades : [];
        const completedRows = tradeRows.filter((row: any) =>
          num(instrument === "OPTIONS" ? row.premOut ?? row.premiumExit : row.exit ?? row.exitPrice) !== null
          || num(row.pnlRs ?? row.pnl ?? row.pts) !== null
        );
        completedRows.forEach((row: any) => appendTradeDetail(date, row));
        const capitalRows = completedRows.length ? completedRows : tradeRows.filter((row: any) =>
          num(instrument === "OPTIONS" ? row.premIn ?? row.premiumEntry : row.entry ?? row.entryPrice) !== null
        );
        const capitalDeployed = capitalRows.reduce((sum: number, row: any) => {
          const entry = num(instrument === "OPTIONS" ? row.premIn ?? row.premiumEntry : row.entry ?? row.entryPrice);
          const quantity = num(row.qty ?? row.quantity) ?? 30;
          return sum + (entry && quantity ? (instrument === "OPTIONS" ? entry * quantity : entry * quantity * FUTURES_MARGIN_RATE) : 0);
        }, 0);
        byDate.set(date, {
          date,
          pnl,
          capitalDeployed: Math.round(capitalDeployed),
          trades: num(summary.trades) ?? 0,
          wins: num(instrument === "OPTIONS" ? summary.optionsWins : summary.wins) ?? (pnl > 0 ? 1 : 0),
          losses: num(instrument === "OPTIONS" ? summary.optionsLosses : summary.losses) ?? (pnl < 0 ? 1 : 0),
        });
      }
    }
  } else if (strategy.prefix === "drishti" || strategy.prefix === "drishtiV2") {
    const historyFile = strategy.prefix === "drishtiV2" ? "drishti-v2-trades.json" : "trades.json";
    const rows: any[] = readJson(historyFile, []);
    for (const row of Array.isArray(rows) ? rows : []) {
      if (strategy.prefix === "drishti") {
        const type = String(row?.type || "").toUpperCase();
        const expectedType = instrument === "OPTIONS" ? "DRISHTI_V1_OPT" : "DRISHTI_V1";
        if (type !== expectedType) continue;
        if ((num(row?.exitPrice ?? row?.exit) ?? 0) <= 0 && !text(row?.reasonExit)) continue;
      }
      const date = dateKey(row.date || row.exitTime || row.entryTime);
      if (!date) continue;
      const symbol = String(row.symbol || row.tradeSymbol || "").toUpperCase();
      const looksOption = /\d+(CE|PE)$/.test(symbol) || num(row.premiumEntry) !== null;
      if (strategy.prefix !== "drishti" && (instrument === "OPTIONS" ? !looksOption : looksOption)) continue;
      const pnl = num(row.netPnlRs ?? row.pnlRs ?? row.pnl);
      if (pnl === null) continue;
      const current = byDate.get(date) || { date, pnl: 0, capitalDeployed: 0, trades: 0, wins: 0, losses: 0 };
      current.pnl += pnl;
      const entry = num(instrument === "OPTIONS" ? row.premiumEntry ?? row.entryPremium : row.entryPrice ?? row.entry);
      const quantity = num(row.qty ?? row.quantity) ?? 30;
      current.capitalDeployed += entry && quantity
        ? (instrument === "OPTIONS" ? entry * quantity : entry * quantity * FUTURES_MARGIN_RATE)
        : 0;
      current.trades += 1;
      if (pnl > 0) current.wins += 1;
      if (pnl < 0) current.losses += 1;
      byDate.set(date, current);
      appendTradeDetail(date, row);
    }
  }

  const liveMonthKeys = recentLiveMonthKeys();
  for (const date of Array.from(byDate.keys())) {
    if (!liveMonthKeys.has(date.slice(0, 7))) byDate.delete(date);
  }
  let backtestRowsAdded = 0;
  if (includeBacktest) {
    for (const day of normalizedBacktestDays(strategy, instrument)) {
      if (liveMonthKeys.has(day.date.slice(0, 7))) continue;
      byDate.set(day.date, {
        date: day.date,
        pnl: day.pnl,
        capitalDeployed: Math.round(day.capitalDeployed),
        trades: day.trades,
        wins: day.wins,
        losses: day.losses,
      });
      backtestRowsAdded += 1;
    }
  }

  const days = Array.from(byDate.values()).map(day => ({
    ...day,
    capitalDeployed: Math.round(day.capitalDeployed),
    returnPct: day.capitalDeployed > 0 ? day.pnl / day.capitalDeployed * 100 : null,
  })).sort((a, b) => a.date.localeCompare(b.date));
  const aggregate = (keyFor: (date: string) => string) => {
    const groups = new Map<string, any>();
    for (const day of days) {
      const key = keyFor(day.date);
      const row = groups.get(key) || { period: key, pnl: 0, capitalDeployed: 0, tradingDays: 0, trades: 0, wins: 0, losses: 0 };
      row.pnl += day.pnl;
      row.capitalDeployed += day.capitalDeployed;
      row.tradingDays += 1;
      row.trades += day.trades;
      row.wins += day.wins;
      row.losses += day.losses;
      groups.set(key, row);
    }
    return Array.from(groups.values()).map((row: any) => ({
      ...row,
      winRate: row.wins + row.losses > 0 ? row.wins / (row.wins + row.losses) * 100 : 0,
      returnPct: row.capitalDeployed > 0 ? row.pnl / row.capitalDeployed * 100 : null,
    })).sort((a: any, b: any) => a.period.localeCompare(b.period)).reverse();
  };
  const weekKey = (date: string) => {
    const parsed = new Date(`${date}T00:00:00Z`);
    const day = parsed.getUTCDay() || 7;
    parsed.setUTCDate(parsed.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(parsed.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((parsed.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${parsed.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  };
  return {
    source: backtestRowsAdded > 0
      ? "live-last-two-months + backtest"
      : historyKey
        ? "strategy-monthly-history.json"
        : strategy.prefix === "drishtiV2"
          ? "drishti-v2-trades.json"
          : strategy.prefix === "drishti" ? "trades.json" : null,
    trades: tradeDetails.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)),
    days: [...days].reverse(),
    weekly: aggregate(weekKey),
    monthly: aggregate(date => date.slice(0, 7)),
    yearly: aggregate(date => date.slice(0, 4)),
  };
}

function runtimeEvidence(processName = "trading-bot"): any {
  const cached = runtimeHealthCache.get(processName);
  if (cached?.value && Date.now() - cached.checkedAt < 15000) {
    return cached.value;
  }
  let processInfo: any = null;
  try {
    const raw = execFileSync("pm2", ["jlist"], {
      encoding: "utf8",
      timeout: 2500,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const rows = JSON.parse(raw);
    const processNames = [
      process.env.TRADING_BOT_PM2_NAME,
      processName,
      ...(processName === "trading-bot" ? ["amina-100-variant-b"] : []),
    ].filter((name, index, names): name is string => !!name && names.indexOf(name) === index);
    const tradingBot = Array.isArray(rows)
      ? processNames.map(name => rows.find((row: any) => row?.name === name)).find(Boolean)
      : null;
    if (tradingBot) {
      processInfo = {
        name: text(tradingBot?.name) || processName,
        status: text(tradingBot?.pm2_env?.status)?.toUpperCase() || "UNKNOWN",
        pid: num(tradingBot?.pid),
        uptimeStartedAt: num(tradingBot?.pm2_env?.pm_uptime),
        restarts: num(tradingBot?.pm2_env?.restart_time) ?? 0,
        unstableRestarts: num(tradingBot?.pm2_env?.unstable_restarts) ?? 0,
      };
    }
  } catch {
    processInfo = null;
  }

  const cpuCount = Math.max(1, os.cpus()?.length || 1);
  const cpuLoadPct = Math.max(0, os.loadavg()[0] / cpuCount * 100);
  const memoryUsedPct = os.totalmem() > 0 ? (1 - os.freemem() / os.totalmem()) * 100 : 0;
  let diskUsedPct: number | null = null;
  try {
    const stats = fs.statfsSync(BOT_DIR);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bavail) * Number(stats.bsize);
    diskUsedPct = total > 0 ? (1 - free / total) * 100 : null;
  } catch {
    diskUsedPct = null;
  }
  const value = { process: processInfo, resources: { cpuLoadPct, memoryUsedPct, diskUsedPct } };
  runtimeHealthCache.set(processName, { checkedAt: Date.now(), value });
  return value;
}

function minuteOfDay(value: any): number | null {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function istClock(): { weekday: number; minutes: number; time: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const part = (type: string) => parts.find(row => row.type === type)?.value || "";
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  const hour = Number(part("hour") || 0);
  const minute = Number(part("minute") || 0);
  return { weekday: weekdays[part("weekday")] ?? now.getDay(), minutes: hour * 60 + minute, time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

const STRATEGY_TRIGGER_MINUTES: Record<string, number> = {
  drishti: 565,
  "drishti-v2": 570,
  tt0945: 585,
  tt1000: 600,
  "tt1000-quality-breakout": 600,
  tt1030: 630,
  "tt1030-quality-reversal": 630,
  "normal-breakout": 585,
  "hybrid-body": 570,
};

function scheduledEvaluationMissed(strategyId: string, fields: ReturnType<typeof strategyFields>): boolean {
  const triggerMinutes = STRATEGY_TRIGGER_MINUTES[strategyId];
  if (triggerMinutes === undefined || fields.inTrade)
    return false;
  const clock = istClock();
  const evaluated = Array.isArray(fields.candleLog) && fields.candleLog.length > 0;
  return clock.weekday >= 1 && clock.weekday <= 5 && clock.minutes >= triggerMinutes + 20 && !evaluated;
}

function systemHealth(
  strategy: StrategyDefinition,
  hb: any,
  fields: ReturnType<typeof strategyFields>,
  candles: any[],
  heartbeatAgeSec: number | null,
  externalHealth: any,
  underlying: UnderlyingId,
): any {
  const processName = underlying === "NIFTY" ? "nifty-shadow" : strategy.processName || "trading-bot";
  const evidenceStrategy = underlying === "NIFTY"
    ? { ...strategy, processName, heartbeatFile: UNDERLYINGS.NIFTY.heartbeatFile }
    : strategy;
  const evidence = runtimeEvidence(processName);
  const processState = String(evidence.process?.status || "UNKNOWN");
  const processOnline = processState === "ONLINE";
  const reportedHeartbeatStatus = String(hb?.status || "").toUpperCase();
  const heartbeatDegraded = /\b(DEGRADED|ERROR|FAILED)\b/.test(reportedHeartbeatStatus);
  const detectedProcessName = evidence.process?.name || processName;
  const botDirectoryAvailable = fs.existsSync(BOT_DIR);
  const runtimeExpected = process.env.NODE_ENV === "production"
    || !!process.env.PM2_HOME
    || !!process.env.TRADING_BOT_DIR
    || botDirectoryAvailable;
  const clock = istClock();
  const tradingDay = clock.weekday >= 1 && clock.weekday <= 5;
  const marketOpen = tradingDay && clock.minutes >= NSE_MARKET_OPEN_MINUTES && clock.minutes <= NSE_FO_MARKET_CLOSE_MINUTES;
  const triggerByStrategy: Record<string, { time: string; minutes: number }> = {
    drishti: { time: "09:25", minutes: 565 },
    "drishti-v2": { time: "09:30", minutes: 570 },
        tt1000: { time: "10:00", minutes: 600 },
        "tt1000-quality-breakout": { time: "10:00", minutes: 600 },
        tt0945: { time: "09:45", minutes: 585 },
    tt1030: { time: "10:30", minutes: 630 },
    "tt1030-quality-reversal": { time: "10:30", minutes: 630 },
    "normal-breakout": { time: "09:45", minutes: 585 },
    "hybrid-body": { time: "09:30", minutes: 570 },
  };
  const scheduledTrigger = triggerByStrategy[strategy.id] || null;
  const trigger = scheduledTrigger || { time: "--", minutes: 0 };
  const candleTimes = candles.map(row => minuteOfDay(row.time)).filter((value): value is number => value !== null);
  const uniqueTimes = new Set(candleTimes);
  const duplicateCandles = candleTimes.length - uniqueTimes.size;
  const sortedTimes = [...uniqueTimes].sort((a, b) => a - b);
  const gapCount = sortedTimes.slice(1).filter((value, index) => value - sortedTimes[index] > 20).length;
  const latestCandleMinute = sortedTimes.length ? sortedTimes[sortedTimes.length - 1] : null;
  const triggerDue = !!scheduledTrigger && marketOpen && clock.minutes >= trigger.minutes + 20;
  const triggerCompleted = !!scheduledTrigger && candleTimes.some(value => value >= trigger.minutes);
  const missedTriggers = triggerDue && !triggerCompleted ? 1 : 0;
  const freshHeartbeat = heartbeatAgeSec !== null && heartbeatAgeSec <= HEARTBEAT_HEALTHY_SEC;
  const delayedHeartbeat = heartbeatAgeSec !== null && heartbeatAgeSec <= HEARTBEAT_CRITICAL_SEC;
  const strategyLivePrice = num(fields.live);
  const livePrice = strategyLivePrice !== null && strategyLivePrice > 0
    ? strategyLivePrice
    : num(hb?.price);
  const completedWithoutLivePrice = !fields.inTrade
    && /\b(DONE|CLOSED|EXITED|FLAT|NO[_ ]?TRADE)\b/i.test(String(fields.phase || ""));
  const strategyMarker = text(
    hb?.[`${strategy.prefix}Strategy`]
      ?? (strategy.id === "drishti" ? hb?.strategy : null)
      ?? fields.phase,
  );
  const recentLogs = recentServerLogs(evidenceStrategy);
  const recentRuntimeErrors = recentLogs.filter(row => /UNCAUGHT|CRASH|FATAL|SAVE_FAIL|WRITE_FAIL/i.test(String(row.message || "")));
  let storageWritable = false;
  try {
    fs.accessSync(BOT_DIR, fs.constants.R_OK | fs.constants.W_OK);
    storageWritable = true;
  } catch {
    storageWritable = false;
  }
  const heartbeatFile = path.join(BOT_DIR, underlying === "NIFTY" ? UNDERLYINGS.NIFTY.heartbeatFile : strategy.heartbeatFile || "bot-heartbeat.json");
  const snapshotReadable = fs.existsSync(heartbeatFile);
  const tokenValid = externalHealth?.token?.valid === true;
  const tokenChecked = !!externalHealth?.token?.source;
  const databaseOK = externalHealth?.database?.ok === true;
  const autoRefreshImplemented = externalHealth?.token?.autoRefreshImplemented === true;
  const autoRefreshVerified = externalHealth?.token?.autoRefreshVerified === true;
  const autoRefreshFailed = externalHealth?.token?.autoRefreshFailed === true;
  const autoRefreshDetail = autoRefreshVerified
    ? `last successful run ${externalHealth?.token?.lastAutoRefreshLogAt || "recorded"}`
    : autoRefreshFailed
      ? "latest attempt reports a failure"
      : autoRefreshImplemented
        ? "helper present but no verified success evidence"
        : "not implemented";
  const strategyState = readJson(strategy.stateFile || "trade-state.json", {});
  const futuresFields = strategyFields(strategy, hb, strategyState, "FUTURES");
  const optionsFields = strategyFields(strategy, hb, strategyState, "OPTIONS");
  const resourceValues = [
    Number(evidence.resources?.cpuLoadPct || 0),
    Number(evidence.resources?.memoryUsedPct || 0),
    Number(evidence.resources?.diskUsedPct || 0),
  ];
  const resourceCritical = resourceValues.some(value => value >= 95);
  const resourceWarning = resourceValues.some(value => value >= 85) || Number(evidence.process?.unstableRestarts || 0) > 0;
  const processUptimeMs = evidence.process?.uptimeStartedAt
    ? Math.max(0, Date.now() - Number(evidence.process.uptimeStartedAt))
    : null;
  const processUptime = processUptimeMs === null
    ? "--"
    : `${Math.floor(processUptimeMs / 86400000)}d ${Math.floor(processUptimeMs % 86400000 / 3600000)}h`;
  const latestFeedLog = recentLogs.find(row => /\b(FEED|TICK|MARKET DATA|HEARTBEAT)\b/i.test(String(row.message || "")));
  const futuresReady = processOnline && !!(futuresFields.phase || futuresFields.rawTrades?.length || strategyMarker);
  const optionsReady = processOnline && !!(optionsFields.phase || optionsFields.rawTrades?.length || strategyMarker);
  const supportsOptions = !strategy.instruments || strategy.instruments.includes("OPTIONS");

  const checks: HealthCheck[] = [
    {
      id: "process",
      label: "Bot Process",
      level: processOnline && !heartbeatDegraded ? "PASS" : runtimeExpected ? "FAIL" : "INFO",
      value: processOnline && heartbeatDegraded ? "Degraded" : processOnline ? "Online" : runtimeExpected ? (processState === "UNKNOWN" ? "Unknown" : processState) : "Not monitored locally",
      detail: processOnline && heartbeatDegraded
        ? `${detectedProcessName} is online but reports ${reportedHeartbeatStatus}: ${text(hb?.error) || "runtime tick failure"}`
        : processOnline
        ? `${detectedProcessName}; PID ${evidence.process?.pid || "--"}; uptime ${processUptime}; ${evidence.process?.restarts || 0} lifetime restarts`
        : runtimeExpected
          ? `PM2 ${processName} process is not online.`
          : "PM2 bot monitoring is unavailable in this local environment.",
      source: `PM2 jlist (${detectedProcessName})`,
      critical: true,
    },
    {
      id: "scheduler",
      label: "Scheduler",
      level: !runtimeExpected ? "INFO" : !processOnline ? "FAIL" : !scheduledTrigger ? "PASS" : !marketOpen ? "PASS" : missedTriggers ? "FAIL" : triggerCompleted ? "PASS" : "INFO",
      value: !runtimeExpected ? "Not monitored locally" : !processOnline ? "Stopped" : !scheduledTrigger ? "Condition based" : !marketOpen ? "Awaiting next session" : missedTriggers ? "Missed trigger" : triggerCompleted ? "Active" : "Waiting",
      detail: !scheduledTrigger
        ? "No fixed intraday trigger; engine runs from live conditions and heartbeat state."
        : `Expected ${trigger.time}; last evaluation ${latestCandleMinute === null ? "--" : `${String(Math.floor(latestCandleMinute / 60)).padStart(2, "0")}:${String(latestCandleMinute % 60).padStart(2, "0")}`}; missed ${missedTriggers}`,
      source: "PM2 + strategy candle evaluation log",
      critical: true,
    },
    {
      id: "trigger",
      label: "Latest Automatic Trigger",
      level: !runtimeExpected ? "INFO" : !scheduledTrigger ? "INFO" : !marketOpen ? "INFO" : missedTriggers ? "FAIL" : triggerCompleted ? "PASS" : triggerDue ? "WARN" : "INFO",
      value: !runtimeExpected ? "Not monitored locally" : !scheduledTrigger ? "Condition based" : !marketOpen ? "Next session" : missedTriggers ? "Missed" : triggerCompleted ? "Completed" : "Pending",
      detail: !scheduledTrigger
        ? "Entry is driven by live strategy conditions rather than a fixed clock trigger."
        : `Scheduled ${trigger.time}; latest strategy evaluation ${latestCandleMinute === null ? "--" : `${String(Math.floor(latestCandleMinute / 60)).padStart(2, "0")}:${String(latestCandleMinute % 60).padStart(2, "0")}`}`,
      source: "Scheduled trigger + selected strategy candle log",
      critical: true,
    },
    {
      id: "heartbeat",
      label: "Strategy Heartbeat",
      level: !runtimeExpected ? "INFO" : heartbeatDegraded ? "FAIL" : !marketOpen && processOnline ? "INFO" : freshHeartbeat ? "PASS" : delayedHeartbeat ? "WARN" : "FAIL",
      value: !runtimeExpected
        ? "Not monitored locally"
        : heartbeatDegraded ? reportedHeartbeatStatus
        : !marketOpen && processOnline
        ? "Idle after market close"
        : heartbeatAgeSec === null ? "Missing" : `${heartbeatAgeSec}s ago`,
      detail: heartbeatDegraded
        ? text(hb?.error) || "Worker heartbeat reports a runtime failure."
        : !marketOpen && processOnline
        ? "The PM2 process is online; an active strategy heartbeat is not required outside market hours."
        : `Expected within ${HEARTBEAT_HEALTHY_SEC}s; critical after ${HEARTBEAT_CRITICAL_SEC}s`,
      source: "bot-heartbeat.json",
      critical: true,
    },
    {
      id: "marketHeartbeat",
      label: "Market Data Heartbeat",
      level: !runtimeExpected ? "INFO" : !marketOpen ? "INFO" : freshHeartbeat && ((livePrice !== null && livePrice > 0) || completedWithoutLivePrice) ? "PASS" : delayedHeartbeat ? "WARN" : "FAIL",
      value: !runtimeExpected ? "Not monitored locally" : !marketOpen ? "Market closed" : freshHeartbeat ? "Receiving" : "Stale",
      detail: completedWithoutLivePrice && !(livePrice !== null && livePrice > 0)
        ? `Strategy phase ${fields.phase}; heartbeat ${heartbeatAgeSec === null ? "missing" : `${heartbeatAgeSec}s ago`}; no open-position LTP required.`
        : `Latest price ${livePrice ?? "--"}; heartbeat ${heartbeatAgeSec === null ? "missing" : `${heartbeatAgeSec}s ago`}`,
      source: "Bot heartbeat market fields",
      critical: true,
    },
    {
      id: "feed",
      label: "Feed Freshness",
      level: !runtimeExpected ? "INFO" : !marketOpen ? "INFO" : freshHeartbeat && ((livePrice !== null && livePrice > 0) || completedWithoutLivePrice) ? "PASS" : delayedHeartbeat ? "WARN" : "FAIL",
      value: !runtimeExpected ? "Not monitored locally" : !marketOpen ? "Market closed" : livePrice || completedWithoutLivePrice ? "Fresh" : "No price",
      detail: !marketOpen
        ? `Fresh ticks are not required outside market hours. Last event: ${latestFeedLog?.message || "not published"}`
        : completedWithoutLivePrice && !(livePrice !== null && livePrice > 0)
          ? `Strategy phase ${fields.phase} is complete with no open position; fresh heartbeat confirms runtime connectivity.`
          : `Latest price evidence ${livePrice ?? "--"}; last feed event ${latestFeedLog?.message || "not published"}.`,
      source: "Heartbeat price evidence",
      critical: true,
    },
    {
      id: "candles",
      label: "Candle Generation",
      level: duplicateCandles > 0 ? "FAIL" : !runtimeExpected && !candles.length ? "INFO" : !scheduledTrigger && !candles.length ? "INFO" : !marketOpen ? "INFO" : missedTriggers ? "FAIL" : gapCount > 0 ? "WARN" : triggerCompleted ? "PASS" : "INFO",
      value: duplicateCandles ? `${duplicateCandles} duplicate` : !runtimeExpected && !candles.length ? "Not monitored locally" : !scheduledTrigger && !candles.length ? "Not required" : !marketOpen ? "Next session" : gapCount ? `${gapCount} gap` : triggerCompleted ? "Updating" : "Waiting",
      detail: !scheduledTrigger && !candles.length
        ? "This condition-based engine publishes live heartbeat and position state instead of a scheduled candle log."
        : `${candles.length} candles; latest ${candles[0]?.time || "--"}; duplicate ${duplicateCandles}; gaps ${gapCount}`,
      source: "Selected strategy candle log",
      critical: true,
    },
    {
      id: "strategy",
      label: "Strategy Engine",
      level: !runtimeExpected ? "INFO" : !processOnline || recentRuntimeErrors.length ? "FAIL" : strategyMarker || candles.length ? "PASS" : "WARN",
      value: !runtimeExpected ? "Not monitored locally" : !processOnline ? "Offline" : recentRuntimeErrors.length ? "Runtime error" : strategyMarker || candles.length ? "Loaded" : "Unverified",
      detail: `${strategy.name}; version ${strategy.version}; phase ${fields.phase || "--"}; recent fatal errors ${recentRuntimeErrors.length}`,
      source: "Heartbeat strategy fields + PM2 logs",
      critical: true,
    },
    {
      id: "futuresExecutor",
      label: "Futures Shadow Executor",
      level: !runtimeExpected ? "INFO" : futuresReady ? "PASS" : processOnline ? "WARN" : "FAIL",
      value: !runtimeExpected ? "Not monitored locally" : futuresReady ? "Ready" : "Unverified",
      detail: `Futures execution adapter; selected strategy ${strategy.name}; mode SHADOW`,
      source: "Futures strategy runtime fields",
      critical: true,
    },
    {
      id: "optionsExecutor",
      label: "Options Shadow Executor",
      level: !runtimeExpected ? "INFO" : supportsOptions ? (optionsReady ? "PASS" : processOnline ? "WARN" : "FAIL") : "INFO",
      value: !runtimeExpected ? "Not monitored locally" : supportsOptions ? (optionsReady ? "Ready" : "Unverified") : "Not used",
      detail: supportsOptions
        ? `Options execution adapter; selected strategy ${strategy.name}; mode SHADOW`
        : `${strategy.name} is intentionally futures-only.`,
      source: "Options strategy runtime fields",
      critical: supportsOptions,
    },
    {
      id: "storage",
      label: "Database & Storage",
      level: !databaseOK ? "FAIL" : !runtimeExpected ? "INFO" : storageWritable && snapshotReadable && !recentRuntimeErrors.some(row => /SAVE_FAIL|WRITE_FAIL/i.test(String(row.message || ""))) ? "PASS" : "FAIL",
      value: !databaseOK ? "Database unavailable" : !runtimeExpected ? "Local database connected" : storageWritable ? "Connected" : "Unavailable",
      detail: `SQLite ${databaseOK ? "readable" : "failed"}; bot storage ${storageWritable ? "writable" : "not writable"}; heartbeat snapshot ${snapshotReadable ? "readable" : "missing"}`,
      source: "SQLite SELECT 1 + filesystem access",
      critical: true,
    },
    {
      id: "token",
      label: "Broker Token",
      level: tokenValid ? "PASS" : !runtimeExpected ? "INFO" : marketOpen ? "FAIL" : tokenChecked ? "WARN" : "INFO",
      value: tokenValid ? "Valid" : !runtimeExpected ? "Not configured locally" : tokenChecked ? "Invalid" : "Not verified",
      detail: tokenValid
        ? `Kite profile verified; auto refresh ${autoRefreshDetail}`
        : `${externalHealth?.token?.error || "Profile validation unavailable"}; auto refresh ${autoRefreshDetail}`,
      source: externalHealth?.token?.source || "Kite profile validation",
      critical: true,
    },
    ...(autoRefreshImplemented ? [{
      id: "autoTokenRefresh",
      label: "Auto Token Refresh",
      level: (autoRefreshVerified ? "PASS" : autoRefreshFailed ? "FAIL" : "WARN") as HealthLevel,
      value: autoRefreshVerified ? "Verified" : autoRefreshFailed ? "Failed" : "Unverified",
      detail: autoRefreshDetail,
      source: "auto_token.js + refresh log",
      critical: false,
    }] : []),
    {
      id: "tokenValidation",
      label: "Last Token Validation",
      level: tokenValid ? "PASS" : tokenChecked ? "WARN" : "INFO",
      value: externalHealth?.checkedAt || "Not verified",
      detail: tokenValid ? "Latest Kite profile validation succeeded." : "No successful token validation is currently available.",
      source: externalHealth?.token?.source || "Kite profile validation",
      critical: false,
    },
    {
      id: "resources",
      label: "Server Resources",
      level: resourceCritical ? "FAIL" : resourceWarning ? "WARN" : "PASS",
      value: resourceCritical ? "Critical" : resourceWarning ? "Elevated" : "Normal",
      detail: `CPU ${evidence.resources?.cpuLoadPct?.toFixed(1) ?? "--"}%; memory ${evidence.resources?.memoryUsedPct?.toFixed(1) ?? "--"}%; disk ${evidence.resources?.diskUsedPct?.toFixed(1) ?? "--"}%; API ${externalHealth?.apiLatencyMs ?? "--"}ms`,
      source: "VPS operating system + API probe",
      critical: false,
    },
  ];
  const criticalChecks = checks.filter(check => check.critical);
  const passedCritical = criticalChecks.filter(check => check.level === "PASS" || check.level === "INFO").length;
  const failedCritical = criticalChecks.filter(check => check.level === "FAIL").length;
  const warningCount = checks.filter(check => check.level === "WARN").length;
  const state = failedCritical > 0 ? "CRITICAL" : warningCount > 0 ? "WARNING" : "HEALTHY";
  return {
    state,
    label: state === "HEALTHY" ? "Healthy" : state === "WARNING" ? "Warning" : "Critical",
    summary: `${passedCritical} of ${criticalChecks.length} critical checks passed`,
    passedCritical,
    criticalTotal: criticalChecks.length,
    warningCount,
    failedCritical,
    checks,
    checkedAt: externalHealth?.checkedAt || new Date().toISOString(),
  };
}

function marketStatus(now = new Date()): "OPEN" | "CLOSED" {
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay();
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  return day >= 1 && day <= 5 && minutes >= NSE_MARKET_OPEN_MINUTES && minutes <= NSE_FO_MARKET_CLOSE_MINUTES ? "OPEN" : "CLOSED";
}

function bankNiftyMovement(): any {
  const heartbeat = readJson("bot-heartbeat.json", {});
  const futures = heartbeat?.bankNiftyFuturesSession && typeof heartbeat.bankNiftyFuturesSession === "object"
    ? heartbeat.bankNiftyFuturesSession
    : null;
  const candidateLogs = [
    heartbeat?.tt1030QualityCandleLog,
    heartbeat?.tt1030ShadowCandleLog,
    heartbeat?.tt1030CandleLog,
    heartbeat?.tt1000QualityCandleLog,
    heartbeat?.tt1000CandleLog,
    heartbeat?.tt0945CandleLog,
    readJson("tt1030-shadow-state.json", {})?.candleLog,
    readJson("tt1030-quality-state.json", {})?.candleLog,
    readJson("tt1000-quality-state.json", {})?.candleLog,
    readJson("ema-trend-state.json", {})?.candleLog,
  ].filter(Array.isArray) as any[][];
  const rows = candidateLogs
    .sort((a, b) => b.length - a.length)[0]
    ?.filter(row => num(row?.open ?? row?.o) !== null && num(row?.close ?? row?.c) !== null) || [];
  const opening = num(rows[0]?.open ?? rows[0]?.o);
  const candleClose = num(rows[rows.length - 1]?.close ?? rows[rows.length - 1]?.c);
  const current = num(
    heartbeat?.livePrice
      ?? heartbeat?.tt1030Live
      ?? heartbeat?.tt1030ShadowLive
      ?? heartbeat?.normalBreakoutShadowLive,
  ) ?? candleClose;
  const highs = rows.map(row => num(row?.high ?? row?.h)).filter((value): value is number => value !== null);
  const lows = rows.map(row => num(row?.low ?? row?.l)).filter((value): value is number => value !== null);
  if (current !== null) {
    highs.push(current);
    lows.push(current);
  }
  const high = highs.length ? Math.max(...highs) : current;
  const low = lows.length ? Math.min(...lows) : current;
  const cash = {
    symbol: "BANKNIFTY CASH", open: opening, current, high, low,
    movementPoints: opening !== null && current !== null ? current - opening : null,
    rangePoints: high !== null && low !== null ? high - low : null,
  };
  const benchmark = futures || cash;
  return {
    symbol: benchmark.symbol,
    open: num(benchmark.open),
    current: num(benchmark.current),
    high: num(benchmark.high),
    low: num(benchmark.low),
    movementPoints: num(benchmark.movementPoints),
    rangePoints: num(benchmark.rangePoints),
    session: "09:15 - 15:40",
    asOf: heartbeat?.at || null,
    cash,
    futures,
    benchmarkSymbol: futures?.symbol || "BANKNIFTY FUTURES",
    benchmarkMovementPoints: num(futures?.movementPoints),
    benchmarkRangePoints: num(futures?.rangePoints),
    regime: futures?.regime || null,
  };
}

function underlyingMovement(underlying: UnderlyingId): any {
  if (underlying === "BANKNIFTY") return bankNiftyMovement();
  const heartbeat = readJson(UNDERLYINGS.NIFTY.heartbeatFile, {});
  const market = heartbeat?.market || {};
  const open = num(market.open);
  const current = num(market.current ?? market.ltp);
  const high = num(market.high);
  const low = num(market.low);
  const cash = {
    symbol: "NIFTY CASH", open, current, high, low,
    movementPoints: num(market.movementPoints) ?? (open !== null && current !== null ? current - open : null),
    rangePoints: num(market.rangePoints) ?? (high !== null && low !== null ? high - low : null),
  };
  const futures = market.futures && typeof market.futures === "object" ? market.futures : null;
  const benchmark = futures || cash;
  return {
    ...benchmark,
    session: "09:15 - 15:40",
    asOf: heartbeat?.at || null,
    cash,
    futures,
    benchmarkSymbol: futures?.symbol || "NIFTY FUTURES",
    benchmarkMovementPoints: num(futures?.movementPoints),
    benchmarkRangePoints: num(futures?.rangePoints),
    regime: futures?.regime || market?.regime || null,
  };
}

function capturedPoints(pnl: number | null, quantity: number | null, traded: boolean): number | null {
  if (!traded || pnl === null || quantity === null || quantity <= 0) return null;
  return pnl / quantity;
}

function capitalForTrade(row: any, instrument: InstrumentType): number {
  const entry = Math.abs(num(row?.entry) ?? 0);
  const quantity = Math.abs(num(row?.quantity) ?? 0);
  if (!entry || !quantity) return 0;
  return instrument === "OPTIONS"
    ? entry * quantity
    : entry * quantity * FUTURES_MARGIN_RATE;
}

function consolidatedShadowSummary(externalHealth: any = {}, underlying: UnderlyingId = "BANKNIFTY"): any {
  const today = todayIST();
  const market = marketStatus();
  const availableStrategies = strategiesForUnderlying(underlying);
  const latestHistoryDate = availableStrategies.flatMap(strategy =>
    (strategy.instruments || (["FUTURES", "OPTIONS"] as InstrumentType[])).flatMap(instrument =>
      (shadowHistory(strategy, instrument, false, underlying).days || [])
        .filter((row: any) => (num(row?.trades) ?? 0) > 0)
        .map((row: any) => String(row?.date || row?.period || ""))
        .filter(date => date && date <= today)
    )
  ).sort().reverse()[0] || "";
  const tradeDate = market === "OPEN" ? today : latestHistoryDate || today;
  const tiles: any[] = [];

  for (const strategy of availableStrategies) {
    const strategyAvailable = strategyAvailableForUnderlying(strategy, underlying);
    const runtime = runtimeFiles(strategy, underlying);
    const heartbeat = runtime.heartbeat;
    const strategyState = runtime.state;
    const heartbeatAt = heartbeat?.at ? new Date(heartbeat.at).getTime() : 0;
    const heartbeatAgeSec = heartbeatAt ? Math.max(0, Math.round((Date.now() - heartbeatAt) / 1000)) : null;
    const stateIsCurrent = dateKey(strategyState?.date || strategyState?.day) === tradeDate;
    const heartbeatAvailable = !!heartbeatAt;
    const hasStrategyHeartbeatEvidence = Object.keys(heartbeat || {}).some(key => key.startsWith(strategy.prefix));
    const stale = market === "OPEN" && (!heartbeatAvailable || (heartbeatAgeSec ?? Infinity) > HEARTBEAT_CRITICAL_SEC);

    for (const instrument of strategy.instruments || (["FUTURES", "OPTIONS"] as InstrumentType[])) {
      const fields = strategyFields(strategy, heartbeat, strategyState, instrument, underlying);
      const trades = normalizedTrades(
        fields.rawTrades,
        strategy,
        instrument,
        tradeDate,
        fields.quantity ?? num(heartbeat.qty) ?? 30,
      );
      const closedTrades = trades.filter((row: any) => String(row.status).toUpperCase() === "CLOSED");
      const todayHistory = (() => {
        const history = shadowHistory(strategy, instrument, false, underlying);
        return Array.isArray(history?.days)
          ? history.days.find((row: any) => row?.date === tradeDate || row?.period === tradeDate)
          : null;
      })();
      const historyTrades = num(todayHistory?.trades) ?? 0;
      const historyPnl = num(todayHistory?.pnl);
      const tradeCount = Math.max(num(fields.trades) ?? 0, closedTrades.length, historyTrades, fields.inTrade ? 1 : 0);
      const capitalDeployed = tradeCount > 0
        ? Math.round(num(todayHistory?.capitalDeployed ?? todayHistory?.capitalUsed) ?? (instrument === "OPTIONS" ? OPTIONS_CAPITAL_FALLBACK : FUTURES_CAPITAL_FALLBACK))
        : 0;
      const hasEvidence = strategyAvailable && (stateIsCurrent || hasStrategyHeartbeatEvidence || trades.length > 0 || !!todayHistory);
      const missedEvaluation = strategyAvailable && scheduledEvaluationMissed(strategy.id, fields);
      const hasTradePnl = tradeCount > 0 || fields.inTrade;
      const pnl = fields.inTrade
        ? (num(fields.total) ?? historyPnl ?? 0)
        : hasTradePnl
          ? (historyPnl ?? num(fields.total) ?? 0)
          : 0;
      const points = capturedPoints(pnl, num(fields.quantity), tradeCount > 0 || fields.inTrade);
      const returnPct = pnl !== null && capitalDeployed > 0 ? pnl / capitalDeployed * 100 : tradeCount === 0 ? 0 : null;
      const positionState = fields.inTrade
        ? "OPEN"
        : stale
          ? "STALE"
          : !strategyAvailable
            ? "NOT CONFIGURED"
          : missedEvaluation
            ? "MISSED"
            : !hasEvidence
              ? heartbeatAvailable ? "MISSED" : "ERROR"
              : tradeCount > 0 ? "CLOSED" : "NO TRADE";

      tiles.push({
        underlying,
        strategyId: strategy.id,
        strategyName: strategy.name.replace(/\s*\(BANKNIFTY\)\s*$/i, ""),
        strategyVersion: strategy.version,
        instrumentType: instrument,
        executionMode: "SHADOW",
        tradeDate,
        pnl,
        capturedPoints: points,
        pointsBasis: instrument === "OPTIONS" ? "PREMIUM" : "UNDERLYING",
        returnPct,
        capitalDeployed,
        trades: tradeCount,
        openPositions: fields.inTrade ? 1 : 0,
        positionState,
        stale,
        configured: strategyAvailable,
        lastUpdatedAt: heartbeat?.at || strategyState?.savedAt || null,
      });
    }
  }

  const validTiles = tiles.filter(tile => tile.pnl !== null);
  return {
    tradeDate,
    marketStatus: market,
    underlying,
    movement: underlyingMovement(underlying),
    bankNiftyMovement: underlyingMovement(underlying),
    lastRefreshedAt: new Date().toISOString(),
    tiles,
    summary: {
      totalPnl: validTiles.reduce((sum, tile) => sum + Number(tile.pnl || 0), 0),
      profitableTiles: validTiles.filter(tile => Number(tile.pnl) > 0).length,
      lossMakingTiles: validTiles.filter(tile => Number(tile.pnl) < 0).length,
      openPositions: tiles.reduce((sum, tile) => sum + Number(tile.openPositions || 0), 0),
      totalTiles: tiles.length,
      configuredTiles: tiles.filter(tile => tile.configured !== false).length,
    },
    source: "CURRENT_DAY_PERSISTED_SHADOW_STATE",
    tokenCheckedAt: externalHealth?.checkedAt || null,
  };
}

function performanceOverview(hb: any, state: any, tradeDate: string, underlying: UnderlyingId = "BANKNIFTY"): any {
  const availableStrategies = strategiesForUnderlying(underlying);
  const coverageMonth = tradeDate.slice(0, 7);
  const coverageYear = tradeDate.slice(0, 4);
  const coverageWeek = (() => {
    const parsed = new Date(`${tradeDate}T00:00:00Z`);
    const day = parsed.getUTCDay() || 7;
    parsed.setUTCDate(parsed.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(parsed.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((parsed.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${parsed.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  })();
  const rows: Record<"TODAY" | "WEEK" | "MONTH" | "YEAR", any[]> = { TODAY: [], WEEK: [], MONTH: [], YEAR: [] };
  const liveTodayFallback: any[] = [];
  const dailyCandidates: any[] = [];
  const performanceRow = (strategy: StrategyDefinition, instrument: InstrumentType, periodRow: any, fallbackCapital: number) => {
    const pnl = num(periodRow?.pnl) ?? 0;
    const trades = num(periodRow?.trades) ?? 0;
    const capitalUsed = Math.round(num(periodRow?.capitalDeployed ?? periodRow?.capitalUsed) ?? (trades > 0 ? fallbackCapital : 0));
    return {
      strategyId: strategy.id,
      strategyName: strategy.name.replace(" (BANKNIFTY)", ""),
      instrument,
      pnl,
      capitalUsed,
      returnPct: capitalUsed > 0 ? pnl / capitalUsed * 100 : null,
      trades,
      date: periodRow?.date,
      period: periodRow?.period,
    };
  };

  for (const strategy of availableStrategies) {
    const runtime = runtimeFiles(strategy, underlying);
    const strategyHeartbeat = underlying === "BANKNIFTY" && !strategy.heartbeatFile ? hb : runtime.heartbeat;
    const strategyState = underlying === "BANKNIFTY" && !strategy.stateFile ? state : runtime.state;
    const supportedInstruments = strategy.instruments || (["FUTURES", "OPTIONS"] as InstrumentType[]);
    for (const instrument of supportedInstruments) {
      const fields = strategyFields(strategy, strategyHeartbeat, strategyState, instrument, underlying);
      const trades = normalizedTrades(
        fields.rawTrades,
        strategy,
        instrument,
        tradeDate,
        fields.quantity ?? num(hb.qty) ?? 30,
      );
      const fallbackPerTrade = instrument === "OPTIONS" ? OPTIONS_CAPITAL_FALLBACK : FUTURES_CAPITAL_FALLBACK;
      const liveTradeCount = Math.max(trades.length, fields.trades, fields.inTrade ? 1 : 0);
      const liveCapital = liveTradeCount > 0 ? fallbackPerTrade : 0;
      if (liveCapital > 0) {
        liveTodayFallback.push({
          strategyId: strategy.id,
          strategyName: strategy.name.replace(" (BANKNIFTY)", ""),
          instrument,
          pnl: fields.total,
          capitalUsed: Math.round(liveCapital),
          returnPct: fields.total / liveCapital * 100,
          trades: liveTradeCount,
        });
      }

      const liveHistory = shadowHistory(strategy, instrument, false, underlying);
      if (Array.isArray(liveHistory.days)) {
        for (const day of liveHistory.days) {
          const date = String(day?.date || day?.period || "");
          if (!date || date > tradeDate || num(day?.pnl) === null || (num(day?.trades) ?? 0) <= 0) continue;
          dailyCandidates.push(performanceRow(strategy, instrument, day, fallbackPerTrade));
        }
      }
      const week = Array.isArray(liveHistory.weekly)
        ? liveHistory.weekly.find((row: any) => row.period === coverageWeek)
        : null;
      if (week && num(week.pnl) !== null && (num(week.trades) ?? 0) > 0) {
        rows.WEEK.push(performanceRow(strategy, instrument, week, fallbackPerTrade));
      }
      const month = Array.isArray(liveHistory.monthly)
        ? liveHistory.monthly.find((row: any) => row.period === coverageMonth)
        : null;
      if (month && num(month.pnl) !== null && (num(month.trades) ?? 0) > 0) {
        rows.MONTH.push(performanceRow(strategy, instrument, month, fallbackPerTrade));
      }
      const year = Array.isArray(liveHistory.yearly)
        ? liveHistory.yearly.find((row: any) => row.period === coverageYear)
        : null;
      if (year && num(year.pnl) !== null && (num(year.trades) ?? 0) > 0) {
        rows.YEAR.push(performanceRow(strategy, instrument, year, fallbackPerTrade));
      }
    }
  }
  const latestTradeDate = dailyCandidates
    .map(row => String(row.date || ""))
    .filter(Boolean)
    .sort()
    .reverse()[0] || "";
  rows.TODAY = latestTradeDate
    ? dailyCandidates.filter(row => row.date === latestTradeDate)
    : liveTodayFallback;

  const summarize = (periodRows: any[], label: string, source: "LIVE" | "BACKTEST") => {
    const capitalUsed = periodRows.reduce((sum, row) => sum + Number(row.capitalUsed || 0), 0);
    const pnl = periodRows.reduce((sum, row) => sum + Number(row.pnl || 0), 0);
    const best = (instrument: InstrumentType) => periodRows
      .filter(row => row.instrument === instrument)
      .sort((a, b) => Number(b.returnPct) - Number(a.returnPct))[0] || null;
    const worst = (instrument: InstrumentType) => periodRows
      .filter(row => row.instrument === instrument)
      .sort((a, b) => Number(a.returnPct) - Number(b.returnPct))[0] || null;
    const bestOverall = [...periodRows]
      .sort((a, b) => Number(b.returnPct) - Number(a.returnPct))[0] || null;
    const worstOverall = [...periodRows]
      .sort((a, b) => Number(a.returnPct) - Number(b.returnPct))[0] || null;
    return {
      label,
      source,
      averageReturnPct: capitalUsed > 0 ? pnl / capitalUsed * 100 : null,
      capitalUsed: Math.round(capitalUsed),
      pnl: Math.round(pnl),
      strategiesCompared: periodRows.length,
      bestOverall,
      worstOverall,
      bestFutures: best("FUTURES"),
      bestOptions: best("OPTIONS"),
      worstFutures: worst("FUTURES"),
      worstOptions: worst("OPTIONS"),
    };
  };

  return {
    definition: "Return on allocated strategy capital = net P&L divided by the configured instrument capital.",
    capitalBasis: {
      futures: "Rs.2,00,000 allocated capital",
      options: "Rs.50,000 allocated capital",
    },
    periods: {
      TODAY: summarize(rows.TODAY, latestTradeDate || tradeDate, "LIVE"),
      WEEK: summarize(rows.WEEK, coverageWeek || "Current week", "LIVE"),
      MONTH: summarize(rows.MONTH, coverageMonth || "Latest month", "LIVE"),
      YEAR: summarize(
        rows.YEAR,
        coverageYear || "Latest year",
        "LIVE",
      ),
    },
  };
}

export function buildShadowMonitorPayload(strategyId = "", instrumentValue = "", externalHealth: any = {}, underlyingValue = "BANKNIFTY"): any {
  const tradeDate = todayIST();
  const underlying = underlyingId(underlyingValue);
  const availableStrategies = strategiesForUnderlying(underlying);
  const strategy = availableStrategies.find(item => item.id === strategyId) || availableStrategies[0] || STRATEGIES[0];
  const requestedInstrument: InstrumentType = instrumentValue === "OPTIONS" ? "OPTIONS" : "FUTURES";
  const instrument: InstrumentType = strategy.instruments?.includes(requestedInstrument)
    ? requestedInstrument
    : strategy.instruments?.[0] || requestedInstrument;
  const runtime = runtimeFiles(strategy, underlying);
  const hb = runtime.heartbeat;
  const state = runtime.state;
  const heartbeatAt = hb?.at ? new Date(hb.at).getTime() : 0;
  const heartbeatAgeSec = heartbeatAt ? Math.max(0, Math.round((Date.now() - heartbeatAt) / 1000)) : null;
  const connected = heartbeatAgeSec !== null && heartbeatAgeSec < 180;
  const fields = strategyFields(strategy, hb, state, instrument, underlying);
  const trades = normalizedTrades(fields.rawTrades, strategy, instrument, tradeDate, fields.quantity ?? num(hb.qty) ?? 30);
  // Trade History is persisted SHADOW execution history only. Backtest results stay in the separate backtest payload.
  const history = shadowHistory(strategy, instrument, false, underlying);
  const persistedTodayTrades = (history.trades || []).filter((row: any) =>
    String(row.date || row.tradeDate || "") === tradeDate
  );
  const persistedTodayClosed = persistedTodayTrades.filter((row: any) =>
    String(row.status || "").toUpperCase() === "CLOSED" && num(row.pnl) !== null
  );
  const persistedRealized = persistedTodayClosed.length
    ? persistedTodayClosed.reduce((sum: number, row: any) => sum + Number(row.pnl || 0), 0)
    : null;
  const realizedPnl = persistedRealized ?? fields.realized ?? (fields.inTrade ? 0 : fields.total);
  const unrealizedPnl = fields.inTrade ? fields.total - realizedPnl : 0;
  const totalPnl = realizedPnl + unrealizedPnl;
  if (fields.inTrade && !trades.some((row: any) => row.status === "OPEN")) {
    const openContract = /\b(CE|PE)\b/i.test(String(fields.direction || ""))
      ? String(fields.direction).match(/\b(CE|PE)\b/i)?.[1]?.toUpperCase()
      : String(fields.symbol || "").match(/(CE|PE)$/i)?.[1]?.toUpperCase() || null;
    const openAction = instrument === "OPTIONS"
      ? "BUY"
      : openContract === "PE" ? "SELL" : "BUY";
    const openCapital = fields.entry && fields.quantity
      ? (instrument === "OPTIONS"
        ? fields.entry * fields.quantity
        : fields.entry * fields.quantity * FUTURES_MARGIN_RATE)
      : null;
    const openTradeId = `${strategy.id}|${instrument}|${tradeDate}|open`;
    trades.unshift({
      id: openTradeId,
      tradeId: openTradeId,
      strategyId: strategy.id,
      strategyVersion: strategy.version,
      instrumentType: instrument,
      executionMode: "SHADOW",
      tradeDate,
      time: fields.entryTime,
      instrument: fields.symbol || (instrument === "OPTIONS" ? `${underlying} option` : underlying),
      side: fields.direction,
      contract: openContract,
      action: openAction,
      exitAction: openAction === "BUY" ? "SELL" : "BUY",
      quantity: fields.quantity,
      entry: fields.entry,
      exit: null,
      stopLoss: fields.sl,
      target: fields.target,
      pnl: fields.unrealized,
      capitalDeployed: openCapital,
      returnPct: fields.unrealized !== null && openCapital ? fields.unrealized / openCapital * 100 : null,
      result: null,
      status: "OPEN",
      reason: "Live shadow position",
    });
  }
  const candles = normalizedCandles(fields.candleLog, hb, instrument);
  const aggregateHealth = systemHealth(strategy, hb, fields, candles, heartbeatAgeSec, externalHealth, underlying);
  const closedTrades = trades.filter((row: any) => String(row.status).toUpperCase() === "CLOSED");
  const wins = fields.wins || closedTrades.filter((row: any) => (row.pnl ?? 0) > 0).length;
  const losses = fields.losses || closedTrades.filter((row: any) => (row.pnl ?? 0) < 0).length;
  const recordedTrades = strategy.prefix === "drishti" || strategy.prefix === "drishtiV2"
    ? fields.trades
    : closedTrades.length;
  const tradeCount = Math.max(fields.trades, recordedTrades, fields.inTrade ? 1 : 0);
  const strategyCapturedPoints = capturedPoints(totalPnl, num(fields.quantity), tradeCount > 0 || fields.inTrade);
  const winRate = wins + losses > 0 ? wins / (wins + losses) * 100 : 0;
  const nowIso = new Date().toISOString();
  const currentMarketStatus = marketStatus();
  const runtimeStatus = fields.inTrade
    ? "RUNNING"
    : currentMarketStatus === "CLOSED"
      ? "SLEEPING"
      : connected
        ? (fields.phase || "WAITING")
        : "OFFLINE";
  const observationTime = timeValue(nowIso) || "";
  const logs = [
    ...recentServerLogs(strategy),
    {
      time: observationTime,
      level: connected ? "INFO" : "WARN",
      message: `[SYSTEM] Bot heartbeat ${connected ? "connected" : "stale"} (${heartbeatAgeSec ?? "unknown"}s)`,
    },
    {
      time: observationTime,
      level: "INFO",
      message: `[STRATEGY] ${strategy.name} ${runtimeStatus}; ${instrument} shadow view selected`,
    },
    {
      time: observationTime,
      level: candles.length ? "INFO" : "WARN",
      message: `[CANDLE] ${candles.length ? `Latest ${candles[0]?.time || ""} candle available` : "No strategy candle recorded yet"}`,
    },
    {
      time: observationTime,
      level: "INFO",
      message: `[P&L] Shadow total ${totalPnl.toFixed(2)}; realized ${realizedPnl.toFixed(2)}; unrealized ${unrealizedPnl.toFixed(2)}`,
    },
  ].slice(-120);

  return {
    ok: true,
    identity: {
      underlying,
      strategyId: strategy.id,
      strategyName: displayStrategyName(strategy, underlying),
      strategyVersion: strategy.version,
      instrumentType: instrument,
      tradeDate,
      executionMode: "SHADOW",
    },
    underlyings: Object.values(UNDERLYINGS).map(item => ({ id: item.id, label: item.label })),
    strategies: availableStrategies.map(item => ({
      id: item.id,
      name: displayStrategyName(item, underlying),
      version: item.version,
      instruments: item.instruments || ["FUTURES", "OPTIONS"],
    })),
    market: { status: currentMarketStatus, checkedAt: nowIso, underlying, movement: underlyingMovement(underlying), bankNiftyMovement: underlyingMovement(underlying) },
    health: {
      overall: aggregateHealth.state,
      label: aggregateHealth.label,
      summary: aggregateHealth.summary,
      passedCritical: aggregateHealth.passedCritical,
      criticalTotal: aggregateHealth.criticalTotal,
      warningCount: aggregateHealth.warningCount,
      failedCritical: aggregateHealth.failedCritical,
      checks: aggregateHealth.checks,
      connected,
      heartbeatAgeSec,
      lastCheckedAt: nowIso,
      feed: connected ? "CONNECTED" : "DISCONNECTED",
      feedLatencyMs: num(hb.feedLatencyMs ?? hb.latencyMs),
      lastTickAt: hb.at || null,
      heartbeatState: heartbeatAgeSec === null ? "MISSING" : heartbeatAgeSec <= HEARTBEAT_HEALTHY_SEC ? "FRESH" : heartbeatAgeSec <= HEARTBEAT_CRITICAL_SEC ? "DELAYED" : "STALE",
      lastFeedEvent: logs.find(row => /\b(FEED|TICK|MARKET DATA|HEARTBEAT)\b/i.test(String(row.message || ""))) || null,
    },
    runtime: {
      status: runtimeStatus,
      selectedStrategy: displayStrategyName(strategy, underlying),
      lastEvaluatedAt: hb.at || null,
      nextEvaluationAt: null,
      version: strategy.version,
      phase: fields.phase,
    },
    performance: performanceOverview(hb, state, tradeDate, underlying),
    backtest: underlying === "BANKNIFTY" ? backtestSummary(strategy, instrument) : null,
    history,
    consolidated: consolidatedShadowSummary(externalHealth, underlying),
    summary: {
      realizedPnl,
      unrealizedPnl,
      totalPnl,
      capturedPoints: strategyCapturedPoints,
      pointsBasis: instrument === "OPTIONS" ? "PREMIUM" : "UNDERLYING",
      trades: tradeCount,
      wins,
      losses,
      winRate,
      openPositions: fields.inTrade ? 1 : 0,
      lastUpdatedAt: hb.at || null,
    },
    position: fields.inTrade ? {
      instrument: fields.symbol,
      side: fields.direction,
      entryPrice: fields.entry,
      ltp: fields.live,
      stopLoss: fields.sl,
      target: fields.target,
      quantity: fields.quantity,
      entryTime: fields.entryTime,
      entryAt: fields.entryAt,
      currentPnl: unrealizedPnl,
      status: "OPEN",
    } : null,
    instrumentSummary: {
      contract: fields.symbol,
      type: fields.symbol && /CE$/i.test(fields.symbol) ? "CE" : fields.symbol && /PE$/i.test(fields.symbol) ? "PE" : null,
      strike: fields.symbol ? num(String(fields.symbol).match(/(\d+)(?:CE|PE)$/i)?.[1]) : null,
      expiry: null,
      lotSize: fields.quantity,
      tickSize: null,
      ltp: fields.live,
      change: null,
      dayHigh: fields.dayHigh,
      dayLow: fields.dayLow,
      openInterest: fields.openInterest,
      volume: fields.volume,
      impliedVolatility: null,
      lastUpdatedAt: hb.at || null,
    },
    lastSignal: fields.phase || "No Signal",
    trades: trades.length ? trades : persistedTodayTrades,
    candles,
    logs,
    refreshedAt: nowIso,
  };
}

export function renderShadowStrategyMonitorPage(navHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Shadow Strategy Monitor - ZeroScreen</title>
  <link rel="stylesheet" href="/public/css/style.css">
  <style>
    :root{--sm-bg:#f7f9fc;--sm-card:#fff;--sm-ink:#0f172a;--sm-muted:#64748b;--sm-line:#e5eaf2;--sm-blue:#315efb;--sm-green:#16a34a;--sm-red:#dc2626;--sm-amber:#b45309;--sm-console:#111c2d}
    *{box-sizing:border-box}.sm-page{background:var(--sm-bg);color:var(--sm-ink);min-height:calc(100vh - 104px);padding:16px 18px 26px;overflow-x:hidden}.sm-shell{max-width:1600px;margin:0 auto}.sm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}.sm-title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.sm-title{font-size:28px;line-height:1.2;margin:0;font-weight:780}.sm-shadow-badge{border:1px solid #c4b5fd;background:#f5f3ff;color:#6d28d9;border-radius:6px;padding:5px 9px;font-size:12px;font-weight:800}.sm-sub{font-size:13px;color:var(--sm-muted);margin:5px 0 0}.sm-head-actions{display:flex;align-items:center;gap:10px}.sm-market,.sm-refresh,.sm-history-btn,.sm-link-btn,.sm-resume{height:38px;border-radius:7px;border:1px solid var(--sm-line);background:#fff;padding:0 14px;font-size:13px;font-weight:750;color:var(--sm-ink);display:inline-flex;align-items:center;gap:7px;cursor:pointer;white-space:nowrap}.sm-market.open{color:var(--sm-green);border-color:#9fdfa9;background:#f0fdf4}.sm-market.closed{color:var(--sm-muted)}.sm-dot{width:8px;height:8px;border-radius:50%;background:currentColor;display:inline-block}.sm-icon{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.sm-control{display:grid;grid-template-columns:minmax(270px,1.5fr) 252px 210px 200px;gap:12px;align-items:end}.sm-control-card{padding:13px 14px;margin-bottom:10px}.sm-field label{display:block;font-size:12px;color:var(--sm-muted);font-weight:700;margin:0 0 6px}.sm-select,.sm-today{width:100%;height:40px;border:1px solid var(--sm-line);border-radius:7px;background:#fff;color:var(--sm-ink);padding:0 12px;font-size:14px;outline:none;display:flex;align-items:center}.sm-segment{display:grid;grid-template-columns:1fr 1fr;height:40px;border:1px solid var(--sm-line);border-radius:7px;overflow:hidden;background:#fff}.sm-segment button{border:0;background:#fff;color:#334155;font-size:13px;font-weight:750;cursor:pointer}.sm-segment button.active{background:var(--sm-blue);color:#fff;box-shadow:none}.sm-mode-box{height:40px;border:1px solid #a7e0b2;border-radius:7px;background:#effdf3;color:var(--sm-green);padding:5px 10px;display:flex;flex-direction:column;justify-content:center}.sm-mode-box b{font-size:12px}.sm-mode-box span{font-size:10px;color:#4b7d5b}.sm-refresh-meta{text-align:right;font-size:12px;color:var(--sm-muted);padding:0}.sm-health{display:grid;grid-template-columns:.9fr .9fr 1fr 1.8fr;gap:10px;margin-bottom:10px}.sm-card{background:var(--sm-card);border:1px solid var(--sm-line);border-radius:8px;box-shadow:0 1px 2px rgba(15,23,42,.04);min-width:0}.sm-health-card{position:relative;min-height:76px;padding:10px 12px;display:flex;align-items:center;gap:10px}.sm-health-card:not(:last-child)::after{content:"";position:absolute;width:10px;height:2px;right:-11px;top:50%;background:#b7e4c5;z-index:2}.sm-health-card.good-step{border-color:#a7e0b2;background:#f6fff8}.sm-health-icon{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#eef5ff;color:var(--sm-blue);flex:0 0 auto}.sm-health-icon.good{background:#dcfce7;color:var(--sm-green)}.sm-health-icon.warn{background:#fff7ed;color:var(--sm-amber)}.sm-health-copy{min-width:0;flex:1}.sm-card-label{font-size:11px;color:#475569;margin-bottom:3px}.sm-health-value{font-size:15px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sm-health-note{font-size:10px;color:var(--sm-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sm-backtest{display:grid;grid-template-columns:auto repeat(6,minmax(0,1fr));gap:0;align-items:center;width:100%}.sm-bt-cell{padding:0 8px;border-left:1px solid var(--sm-line);min-width:0}.sm-bt-cell:first-of-type{border-left:0}.sm-bt-cell span{display:block;font-size:10px;color:var(--sm-muted);white-space:nowrap}.sm-bt-cell b{display:block;font-size:12px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sm-source{font-size:10px;text-transform:uppercase;color:var(--sm-muted);font-weight:800;letter-spacing:.04em}.sm-main-grid{display:grid;grid-template-columns:1.45fr .95fr;gap:12px;margin-bottom:12px}.sm-pnl{padding:16px 18px;min-height:262px;border-color:#cbd5e1}.sm-pnl.profit{background:#eefbf4;border-color:#8dd9aa}.sm-pnl.loss{background:#fff1f1;border-color:#f3a4a4}.sm-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:11px}.sm-card-head h2{font-size:14px;margin:0;font-weight:800;text-transform:uppercase}.sm-live-chip,.sm-type-chip,.sm-status{height:25px;border-radius:4px;border:1px solid #a7e0b2;background:#effdf3;color:var(--sm-green);padding:0 8px;display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:800}.sm-type-chip{border-color:#b8d2ff;background:#eff5ff;color:var(--sm-blue)}.sm-pnl-value{text-align:center;font-size:44px;font-weight:800;line-height:1.05;color:#334155;margin:12px 0 4px}.sm-pnl-sub{text-align:center;font-size:12px;color:var(--sm-muted);margin-bottom:12px}.sm-pnl-state{display:inline-flex;margin-left:6px;padding:3px 7px;border-radius:4px;background:#dcfce7;color:var(--sm-green);font-size:10px;font-weight:800}.sm-pnl.loss .sm-pnl-state{background:#fee2e2;color:var(--sm-red)}.sm-pnl.profit .sm-pnl-value{color:var(--sm-green)}.sm-pnl.loss .sm-pnl-value{color:var(--sm-red)}.sm-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.sm-metric{padding:9px 10px;border:1px solid rgba(100,116,139,.16);background:rgba(255,255,255,.78);border-radius:5px;min-width:0}.sm-metric span{display:block;font-size:11px;color:var(--sm-muted);line-height:1.25}.sm-metric b{display:block;font-size:14px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sm-card-foot{font-size:12px;color:var(--sm-muted);border-top:1px solid rgba(100,116,139,.18);margin-top:11px;padding-top:9px}.sm-snapshot{padding:15px 16px;min-height:262px}.sm-snapshot-grid{display:grid;grid-template-columns:1fr 1fr}.sm-kv{min-height:31px;border-top:1px dashed var(--sm-line);padding:7px 0;display:grid;grid-template-columns:1fr auto;gap:10px;font-size:12px}.sm-kv:nth-child(odd){padding-right:16px}.sm-kv:nth-child(even){padding-left:16px;border-left:1px solid var(--sm-line)}.sm-kv span{color:var(--sm-muted)}.sm-kv b{text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sm-empty{height:194px;display:grid;place-items:center;text-align:center;color:var(--sm-muted);padding:20px;font-size:12px}.sm-empty b{display:block;color:var(--sm-ink);font-size:15px;margin-bottom:6px}.sm-table-card,.sm-log-card{display:flex;flex-direction:column}.sm-trade-card{height:360px;margin-bottom:12px}.sm-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}.sm-detail-card{height:330px}.sm-console-card{height:280px}.sm-card-pad{padding:13px 14px 11px}.sm-table-wrap{overflow:auto;min-height:0;flex:1;border-top:1px solid var(--sm-line)}.sm-table{width:100%;border-collapse:collapse;min-width:900px}.sm-table.candles{min-width:900px}.sm-table th{height:34px;text-align:left;padding:0 9px;color:var(--sm-muted);font-size:11px;font-weight:760;background:#f8fafc;position:sticky;top:0;z-index:1}.sm-table td{height:38px;border-top:1px solid #edf1f6;padding:0 9px;font-size:12px;white-space:nowrap}.sm-table td.note{max-width:260px;overflow:hidden;text-overflow:ellipsis}.sm-table tr.candle-entry td{background:#f0fdf4}.sm-table tr.candle-exit td,.sm-table tr.candle-sl td{background:#fff1f2}.sm-table tr.candle-trail td{background:#fffbeb}.sm-table tr.candle-watch td{background:#f8fafc}.sm-state{display:inline-flex;border-radius:5px;padding:4px 7px;font-size:10px;font-weight:800;background:#e2e8f0;color:#475569}.sm-state.entry,.sm-state.re-entry{background:#dcfce7;color:#15803d}.sm-state.exit,.sm-state.eod-exit,.sm-state.sl-hit,.sm-state.re-exit{background:#fee2e2;color:#dc2626}.sm-state.trail{background:#fef3c7;color:#b45309}.sm-state.watching,.sm-state.hold{background:#dbeafe;color:#1d4ed8}.sm-side{display:inline-flex;min-width:34px;justify-content:center;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:900}.sm-side.ce{background:#dcfce7;color:#15803d;border:1px solid #86efac}.sm-side.pe{background:#fee2e2;color:#dc2626;border:1px solid #fca5a5}.sm-table-footer{height:42px;border-top:1px solid var(--sm-line);display:flex;align-items:center;justify-content:space-between;padding:0 14px;color:var(--sm-muted);font-size:12px}.sm-table-total{font-size:13px;font-weight:800}.sm-positive{color:var(--sm-green)!important}.sm-negative{color:var(--sm-red)!important}.sm-muted{color:var(--sm-muted)!important}.sm-tag{border-radius:4px;padding:4px 7px;font-size:10px;font-weight:800;background:#f1f5f9;color:#475569}.sm-tag.win,.sm-tag.buy,.sm-tag.ce,.sm-tag.closed{background:#ecfdf3;color:var(--sm-green)}.sm-tag.loss,.sm-tag.sell,.sm-tag.pe{background:#fef2f2;color:var(--sm-red)}.sm-tag.open{background:#eff6ff;color:var(--sm-blue)}.sm-cepe{color:#fff!important}.sm-cepe.ce{background:#0f3d91}.sm-cepe.pe{background:#b91c1c}.sm-table-empty{height:230px;text-align:center!important;color:var(--sm-muted)}.sm-instrument-body{display:grid;grid-template-columns:1fr 1fr;gap:0;padding:0 14px}.sm-instrument-note{margin:9px 14px 12px;padding-top:9px;border-top:1px solid var(--sm-line);font-size:11px;color:var(--sm-muted)}.sm-log-card{background:#fff}.sm-log-console{margin:0 8px 8px;background:var(--sm-console);border-radius:6px;color:#e5e7eb;min-height:0;flex:1;overflow:auto;padding:11px 12px;font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.sm-log-line{display:grid;grid-template-columns:76px 50px minmax(0,1fr);gap:8px;white-space:pre-wrap}.sm-log-line .INFO{color:#4ade80}.sm-log-line .WARN{color:#fbbf24}.sm-log-line .ERROR{color:#fb7185}.sm-log-line .DEBUG{color:#94a3b8}.sm-log-actions{display:flex;align-items:center;gap:7px}.sm-resume{height:29px;font-size:11px;padding:0 9px}.sm-history-btn,.sm-link-btn{height:31px;color:var(--sm-blue);border-color:#b8d2ff}.sm-footer-note{text-align:center;font-size:12px;color:var(--sm-muted);margin:14px 0 0}.sm-modal{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:1200;display:none;padding:24px}.sm-modal.open{display:grid;place-items:center}.sm-modal-panel{width:min(1180px,100%);max-height:88vh;background:#fff;border-radius:8px;box-shadow:0 24px 60px rgba(15,23,42,.24);display:flex;flex-direction:column;overflow:hidden}.sm-modal-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--sm-line)}.sm-modal-head h2{margin:0;font-size:17px}.sm-close{border:0;background:#f1f5f9;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:19px}.sm-history-tabs{display:flex;gap:6px;padding:12px 16px;border-bottom:1px solid var(--sm-line);overflow-x:auto}.sm-history-tabs button{height:34px;border:1px solid var(--sm-line);border-radius:6px;background:#fff;padding:0 13px;font-size:12px;font-weight:750;cursor:pointer}.sm-history-tabs button.active{background:#edf4ff;color:var(--sm-blue);border-color:#9fc0ff}.sm-history-body{padding:16px;overflow:auto;font-size:13px}.sm-history-state{border:1px dashed var(--sm-line);border-radius:7px;padding:30px;text-align:center;color:var(--sm-muted)}.sm-loading{opacity:.72}
    .sm-health-trigger{cursor:pointer;transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}.sm-health-trigger:hover{border-color:#8eb4ff;box-shadow:0 8px 24px rgba(37,99,235,.11);transform:translateY(-1px)}.sm-health-trigger:focus-visible{outline:3px solid rgba(37,99,235,.24);outline-offset:2px}.sm-health-action{flex:0 0 auto;color:var(--sm-blue);font-size:10px;font-weight:850;white-space:nowrap;padding:5px 7px;border:1px solid #bfd3ff;border-radius:5px;background:#f7faff}
    .sm-health-card.warning-step{border-color:#f3cd80;background:#fffdf7}.sm-health-card.critical-step{border-color:#f3a6ae;background:#fff9fa}.sm-health-card.warning-step::before,.sm-health-card.critical-step::before{content:"";position:absolute;right:14px;top:14px;width:8px;height:8px;border-radius:50%}.sm-health-card.warning-step::before{background:#e89a0c;box-shadow:0 0 0 3px rgba(232,154,12,.12)}.sm-health-card.critical-step::before{background:#e63c4d;box-shadow:0 0 0 3px rgba(230,60,77,.12)}
    .sm-health-icon.warn{background:#fff4dc;color:#c97900}.sm-health-icon.fail{background:#ffe8eb;color:#d92d42}.sm-health-value.warn{color:#b76800}.sm-health-value.fail{color:#cf2439}
    .sm-health-panel{width:min(920px,100%)}.sm-health-summary{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;padding:16px;border-bottom:1px solid var(--sm-line);background:#f8fbff}.sm-health-state{font-size:14px;font-weight:850;padding:7px 10px;border-radius:6px;background:#edf7f0;color:#11863b}.sm-health-state.warning{background:#fff3d8;color:#a96100}.sm-health-state.critical{background:#ffe8eb;color:#c9283d}.sm-health-summary b{display:block;font-size:14px;margin-bottom:3px}.sm-health-summary span,.sm-health-checked{font-size:12px;color:var(--sm-muted)}.sm-health-list{display:grid;gap:8px;padding:14px;overflow:auto}.sm-health-row{display:grid;grid-template-columns:minmax(180px,1fr) auto minmax(240px,1.4fr);align-items:center;gap:12px;border:1px solid var(--sm-line);border-radius:7px;padding:10px 12px;background:#fff}.sm-health-row-title b{display:block;font-size:13px}.sm-health-row-title small,.sm-health-row-detail small{display:block;color:var(--sm-muted);font-size:10px;margin-top:2px}.sm-health-row-value{text-align:right;font-weight:800;font-size:12px}.sm-check-badge{display:inline-flex;align-items:center;justify-content:center;min-width:54px;height:24px;border-radius:5px;font-size:10px;font-weight:850;margin-bottom:3px}.sm-check-badge.pass{background:#e7f8ed;color:#11863b}.sm-check-badge.warn{background:#fff2d6;color:#a96100}.sm-check-badge.fail{background:#ffe6e9;color:#cb263b}.sm-check-badge.info{background:#eaf1fb;color:#526783}.sm-health-row-detail{font-size:12px;line-height:1.35}
    @media(max-width:1200px){.sm-health{grid-template-columns:1fr 1fr}.sm-main-grid{grid-template-columns:1fr}.sm-control{grid-template-columns:1.4fr 240px 180px 180px}.sm-main-grid .sm-pnl,.sm-main-grid .sm-snapshot{min-height:0}}
    @media(max-width:760px){.sm-page{padding:12px}.sm-head{align-items:flex-start}.sm-title{font-size:24px}.sm-sub{max-width:280px;font-size:13px}.sm-head-actions{display:grid;grid-template-columns:1fr auto}.sm-head-actions .sm-refresh-meta{grid-column:1/-1;grid-row:2;text-align:left}.sm-market,.sm-refresh{height:36px}.sm-control{grid-template-columns:1fr 1fr}.sm-field.strategy,.sm-field.mode{grid-column:1/-1}.sm-health{grid-template-columns:1fr}.sm-health-card{min-height:76px}.sm-health-card:not(:last-child)::after{display:none}.sm-backtest{grid-template-columns:1fr 1fr 1fr;row-gap:12px}.sm-backtest .sm-health-icon{display:none}.sm-bt-cell{border-left:0;padding:0 8px}.sm-main-grid,.sm-detail-grid{grid-template-columns:1fr}.sm-pnl,.sm-snapshot{min-height:0}.sm-pnl-value{font-size:40px}.sm-metrics{grid-template-columns:repeat(2,1fr)}.sm-metric{padding:9px}.sm-snapshot-grid,.sm-instrument-body{grid-template-columns:1fr}.sm-kv:nth-child(odd),.sm-kv:nth-child(even){padding-left:0;padding-right:0;border-left:0}.sm-trade-card,.sm-detail-card,.sm-console-card{height:350px}.sm-modal{padding:10px}}

    /* Premium Shadow Monitor skin. Scoped to this page only. */
    .sm-page{font-family:Inter,Manrope,"Segoe UI",sans-serif;background:linear-gradient(145deg,#f8faff 0%,#f5f8fc 52%,#fbfcff 100%);padding:22px 24px 28px}
    .sm-shell{max-width:1640px}
    .sm-head{align-items:center;margin-bottom:16px}
    .sm-title{font-size:32px;letter-spacing:0;font-weight:800;color:#101a3a}
    .sm-shadow-badge{border:0;border-radius:10px;background:#f0edff;color:#5b35e8;padding:7px 11px;box-shadow:0 5px 16px rgba(91,53,232,.09)}
    .sm-sub{color:#68738f}
    .sm-head-actions{align-items:center}
    .sm-market,.sm-refresh{height:38px;border-color:#e1e7f0;border-radius:10px;box-shadow:0 4px 14px rgba(30,55,90,.05)}
    .sm-market.open{background:#effaf3;border-color:#d5efdd;color:#138a39}
    .sm-refresh-meta{font-size:11px;color:#68738f}
    .sm-card{border-color:#e7ebf3;border-radius:16px;box-shadow:0 8px 26px rgba(30,55,90,.065)}
    .sm-control{grid-template-columns:minmax(290px,1.15fr) minmax(220px,.72fr) minmax(190px,.68fr) minmax(340px,1.65fr);gap:14px;margin-bottom:16px;align-items:stretch}
    .sm-control-box{height:66px;padding:10px 14px;display:flex;flex-direction:column;justify-content:center}
    .sm-control-box label{font-size:9px;text-transform:uppercase;color:#8a94aa;margin:0 0 2px 42px}
    .sm-control-inner{display:flex;align-items:center;min-width:0}
    .sm-control-icon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#24345f;flex:0 0 auto}
    .sm-select,.sm-today{height:34px;border:0;background:transparent;font-size:14px;font-weight:750;padding:0 8px;color:#14203e}
    .sm-segment{height:46px;margin:auto 0;border:0;border-radius:12px;padding:4px;background:#f7f8fc;gap:4px}
    .sm-segment button{border-radius:9px;color:#65708b}
    .sm-segment button.active{background:linear-gradient(135deg,#426cff,#7256ef);box-shadow:0 7px 16px rgba(77,89,231,.22)}
    .sm-shadow-status{height:66px;padding:10px 16px;display:flex;align-items:center;gap:12px;border-color:#e2dbff;background:linear-gradient(120deg,#faf8ff,#f5f2ff)}
    .sm-shadow-status-icon{width:40px;height:40px;border-radius:12px;background:linear-gradient(145deg,#7c5cff,#5136d8);color:#fff;display:grid;place-items:center;box-shadow:0 8px 18px rgba(91,53,232,.2);flex:0 0 auto}
    .sm-shadow-status b{display:block;font-size:13px;color:#202453}
    .sm-shadow-status span{display:block;font-size:11px;color:#626d89;margin-top:3px}
    .sm-health{grid-template-columns:.9fr .9fr 1.05fr 1.65fr;gap:14px;margin-bottom:16px}
    .sm-health-card{min-height:98px;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.92)}
    .sm-health-card:not(:last-child)::after{display:none}
    .sm-health-card.good-step{background:#fff;border-color:#e4eaf2}
    .sm-health-icon{width:54px;height:54px;border-radius:50%;background:#eef3ff;color:#3867e8;box-shadow:inset 0 0 0 1px rgba(61,103,232,.08)}
    .sm-health-icon.good{background:#e8f9ee;color:#12a04a}
    .sm-health-icon.candle{background:#f2efff;color:#6849e9}
    .sm-card-label{font-size:12px;color:#33415f}
    .sm-health-value{font-size:18px;color:#14203e}
    .sm-health-card.good-step .sm-health-value{color:#128438}
    .sm-health-note{font-size:11px;color:#758099}
    .sm-summary-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .sm-summary-head>span{font-size:9px;color:#7c879d}
    .sm-candle-counts{display:grid;grid-template-columns:repeat(3,1fr);margin-top:8px}
    .sm-candle-counts>span{text-align:center;border-left:1px solid #e8ecf3}
    .sm-candle-counts>span:first-child{border-left:0}
    .sm-candle-counts small{display:block;font-size:10px;color:#65708b}
    .sm-candle-counts b{display:block;font-size:16px;margin-top:2px;color:#18254b}
    #backtestStep{background:linear-gradient(135deg,#fff,#fbfbff)}
    .sm-backtest{grid-template-columns:54px repeat(5,minmax(0,1fr))}
    .sm-bt-cell{padding:0 10px}
    .sm-bt-cell span{font-size:9px}
    .sm-bt-cell b{font-size:12px}
    .sm-main-grid{grid-template-columns:minmax(0,1.5fr) minmax(390px,1fr);gap:14px;margin-bottom:16px}
    .sm-pnl,.sm-snapshot{height:270px;min-height:270px;border-radius:18px}
    .sm-pnl{position:relative;overflow:hidden;padding:18px 22px;background:linear-gradient(135deg,#f1fff7 0%,#effbf7 58%,#f8fffb 100%);border-color:#caead8}
    .sm-pnl::after{content:"";position:absolute;inset:auto -8% -50% 35%;height:220px;border-top:1px solid rgba(31,174,96,.12);transform:rotate(-8deg);pointer-events:none}
    .sm-pnl.loss{background:linear-gradient(135deg,#fff5f5,#fffafa);border-color:#f1d1d1}
    .sm-card-head h2{font-size:14px;text-transform:none;letter-spacing:0;color:#17213d}
    .sm-card-head h2 small{font-size:10px;font-weight:600;color:#778199}
    .sm-heading-with-icon{display:flex;align-items:center;gap:9px;min-width:0}
    .sm-heading-with-icon h2{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sm-section-icon{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;flex:0 0 auto}
    .sm-section-icon .sm-icon{width:17px;height:17px}
    .sm-section-icon.pnl{width:48px;height:48px;border-radius:50%;background:#e4f8eb;color:#149447}
    .sm-section-icon.snapshot{background:#edf3ff;color:#3567e9}
    .sm-section-icon.trade{background:#eef4ff;color:#3168ea}
    .sm-section-icon.candle{background:#f1edff;color:#6849e9}
    .sm-section-icon.console{background:rgba(255,255,255,.08);color:#b8cae0}
    .sm-health-card.good-step::before{content:"";position:absolute;right:14px;top:14px;width:8px;height:8px;border-radius:50%;background:#16b653;box-shadow:0 0 0 3px rgba(22,182,83,.1)}
    .sm-health-icon.health.good{background:linear-gradient(145deg,#e9fbef,#dff7e7);color:#16a34a}
    .sm-health-icon.feed.good{background:linear-gradient(145deg,#edf4ff,#dfeaff);color:#3567e9}
    .sm-health-icon.candle{background:linear-gradient(145deg,#f4f1ff,#eae4ff);color:#704fe8}
    .sm-health-icon.backtest.good{background:linear-gradient(145deg,#eef4ff,#e0e9ff);color:#315fe4}
    .sm-live-chip{height:30px;border-radius:10px;padding:0 12px;background:#ecf9f0;border-color:#cbead5;font-size:10px}
    .sm-pnl-value{position:relative;z-index:1;font-size:52px;margin:14px 0 12px;color:#0a8a36}
    .sm-pnl-sub{display:none}
    .sm-metrics{position:relative;z-index:1;grid-template-columns:repeat(6,minmax(0,1fr));gap:0;margin-top:14px}
    .sm-metric{border:0;border-left:1px solid rgba(86,125,106,.18);border-radius:0;background:transparent;text-align:center;padding:7px 9px}
    .sm-metric:first-child{border-left:0}
    .sm-metric span{font-size:10px}
    .sm-metric b{font-size:14px}
    .sm-card-foot{position:relative;z-index:1;font-size:11px;border-color:rgba(86,125,106,.16);margin-top:14px}
    .sm-snapshot{padding:16px 18px;background:#fff}
    .sm-snapshot-grid{grid-template-columns:1fr}
    .sm-kv{min-height:27px;padding:5px 2px;border-top:1px solid #eef1f6;font-size:11px}
    .sm-kv:nth-child(odd),.sm-kv:nth-child(even){padding-left:2px;padding-right:2px;border-left:0}
    .sm-type-chip{border-radius:8px;background:#eef4ff}
    .sm-bottom-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,.9fr);gap:14px}
    .sm-bottom-grid>article{height:380px;margin:0;border-radius:16px;min-width:0;max-width:100%;overflow:hidden}
    .sm-bottom-grid .sm-card-head{min-height:47px;margin:0}
    .sm-bottom-grid .sm-table-wrap{border-color:#eef1f6}
    .sm-bottom-grid .sm-table{min-width:0;table-layout:fixed}
    .sm-bottom-grid .sm-table.candles{min-width:0}
    .sm-table th{height:34px;background:#fafbfe;font-size:9px;color:#68738f}
    .sm-table td{height:34px;font-size:10px;overflow:hidden;text-overflow:ellipsis}
    .sm-trade-card th:nth-child(2),.sm-trade-card td:nth-child(2){width:23%}
    #candleLogs th:nth-child(2),#candleLogs td:nth-child(2){width:27%}
    #candleLogs th:last-child,#candleLogs td:last-child{width:25%}
    .sm-history-btn,.sm-link-btn{height:30px;border-radius:9px;background:#fff;color:#315efb}
    .sm-section-helper{min-height:42px;padding:11px 14px;border-top:1px solid #eef1f6;color:#778199;font-size:10px}
    .sm-console-card{background:linear-gradient(145deg,#10223a,#08182d);border-color:#17385c;color:#e8f0fa;box-shadow:0 12px 30px rgba(7,30,56,.18)}
    .sm-console-full{height:260px;margin-top:14px;overflow:hidden}
    .sm-console-card .sm-card-head h2,.sm-console-card .sm-card-head h2 small{color:#eef5ff}
    .sm-log-console{margin:0 10px 10px;padding:10px 12px;background:transparent;border-top:1px solid rgba(124,158,196,.18);border-radius:0;font-size:10px}
    .sm-log-live{font-size:9px;color:#a9b9ca;display:inline-flex;align-items:center;gap:5px}
    .sm-log-live .sm-dot{color:#2bd46f;box-shadow:0 0 8px #2bd46f}
    .sm-console-card .sm-resume{color:#c8d6e7;background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12)}
    .sm-footer-note{margin-top:18px}
    .sm-control-box,.sm-shadow-status,.sm-health-card,.sm-pnl,.sm-snapshot{min-width:0;max-width:100%;overflow:hidden}
    .sm-health-copy,.sm-backtest,.sm-bt-cell,.sm-metric,.sm-card-head,.sm-log-actions{min-width:0}
    .sm-shadow-status span,.sm-health-note,.sm-bt-cell b,.sm-section-helper{overflow:hidden;text-overflow:ellipsis}
    .sm-card-pad{padding-left:16px;padding-right:16px}
    @media(max-width:1280px){.sm-control{grid-template-columns:1.2fr .72fr .68fr 1.35fr}.sm-main-grid{grid-template-columns:1.35fr 1fr}}
    @media(max-width:900px){.sm-page{padding:16px}.sm-head{align-items:flex-start}.sm-control{grid-template-columns:1fr 1fr}.sm-shadow-status{grid-column:1/-1}.sm-health{grid-template-columns:1fr 1fr}.sm-main-grid,.sm-bottom-grid{grid-template-columns:1fr}.sm-pnl,.sm-snapshot{height:auto;min-height:270px}.sm-bottom-grid>article{height:380px}.sm-console-full{height:280px}}
    @media(max-width:600px){.sm-page{padding:12px}.sm-title{font-size:26px}.sm-head{display:block}.sm-head-actions{margin-top:12px;grid-template-columns:auto 1fr auto}.sm-control{grid-template-columns:1fr}.sm-shadow-status{grid-column:auto}.sm-health{grid-template-columns:1fr}.sm-backtest{grid-template-columns:44px 1fr 1fr}.sm-bt-cell{border-left:0;padding:5px}.sm-metrics{grid-template-columns:repeat(2,1fr)}.sm-metric:nth-child(odd){border-left:0}.sm-pnl-value{font-size:40px}.sm-bottom-grid>article{height:380px}.sm-console-full{height:300px}.sm-section-helper{white-space:normal}}

    /* Final responsive density pass. */
    .sm-page{padding:clamp(14px,1.4vw,24px);font-size:14px}
    .sm-shell{width:100%;max-width:1680px}
    .sm-head{margin-bottom:14px}
    .sm-title{font-size:clamp(28px,2vw,34px)}
    .sm-sub,.sm-market,.sm-refresh,.sm-select,.sm-segment button,.sm-today{font-size:14px}
    .sm-control{grid-template-columns:minmax(260px,1.15fr) minmax(190px,.72fr) minmax(170px,.62fr) minmax(300px,1.45fr);gap:12px;margin-bottom:12px}
    .sm-control-box,.sm-shadow-status{height:62px}
    .sm-control-box label{font-size:11px;margin-left:40px}
    .sm-shadow-status b{font-size:14px}
    .sm-shadow-status span{font-size:12px}
    .sm-health{grid-template-columns:minmax(210px,.85fr) minmax(230px,.9fr) minmax(280px,1.05fr) minmax(430px,1.55fr);gap:12px;margin-bottom:12px}
    .sm-health-card{min-height:88px;padding:12px 14px}
    .sm-health-icon{width:48px;height:48px}
    .sm-card-label{font-size:13px}
    .sm-health-value{font-size:18px}
    .sm-health-note,.sm-summary-head>span{font-size:12px}
    .sm-candle-counts{margin-top:6px}
    .sm-candle-counts small{font-size:11px}
    .sm-candle-counts b{font-size:17px}
    .sm-bt-cell span{font-size:11px}
    .sm-bt-cell b{font-size:13px}
    .sm-main-grid{grid-template-columns:minmax(0,1.45fr) minmax(360px,1fr);gap:12px;margin-bottom:12px;align-items:stretch}
    .sm-pnl,.sm-snapshot{height:auto;min-height:258px}
    .sm-pnl{padding:16px 20px}
    .sm-card-head{margin-bottom:8px}
    .sm-card-head h2{font-size:16px}
    .sm-card-head h2 small{font-size:12px}
    .sm-pnl-value{font-size:clamp(42px,3.2vw,54px);margin:8px 0 10px}
    .sm-metrics{margin-top:8px}
    .sm-metric{padding:8px 10px}
    .sm-metric span{font-size:12px}
    .sm-metric b{font-size:15px}
    .sm-card-foot{font-size:12px;margin-top:10px}
    .sm-snapshot{padding:15px 18px}
    .sm-kv{min-height:28px;padding:5px 2px;font-size:13px}
    .sm-bottom-grid{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:12px}
    .sm-bottom-grid>article{height:clamp(350px,37vh,430px)}
    .sm-bottom-grid .sm-card-head{min-height:54px}
    .sm-card-pad{padding:12px 16px}
    .sm-table th{height:38px;padding:0 10px;font-size:11px}
    .sm-table td{height:40px;padding:0 10px;font-size:12px}
    .sm-state,.sm-side,.sm-tag{font-size:11px}
    .sm-section-helper{min-height:44px;padding:12px 16px;font-size:12px}
    .sm-history-btn,.sm-link-btn{height:34px;font-size:12px}
    .sm-console-full{height:clamp(250px,29vh,330px);margin-top:12px}
    .sm-log-console{font-size:12px;line-height:1.55;padding:12px 14px}
    .sm-log-line{grid-template-columns:82px 54px minmax(0,1fr);gap:10px}
    .sm-log-live{font-size:11px}
    .sm-resume{font-size:12px}
    .sm-footer-note{font-size:13px}
    .sm-control{grid-template-columns:minmax(300px,1.2fr) minmax(250px,.78fr) minmax(210px,.64fr) minmax(360px,1.45fr)}
    .sm-control-box,.sm-shadow-status{height:76px;padding:12px 16px;border-radius:14px}
    .sm-control-box label{margin:0 0 3px 42px;font-size:11px;line-height:1}
    .sm-instrument-control label{margin-left:0;text-align:center}
    .sm-control-icon{width:36px;height:36px}
    .sm-select,.sm-today{font-size:15px}
    .sm-segment{height:46px;margin:3px 0 0}
    .sm-shadow-status{position:relative;display:flex;flex-direction:row;align-items:center;justify-content:flex-start;text-align:left;overflow:hidden}
    .sm-shadow-status-icon{position:static;inset:auto;transform:none;margin:0;flex:0 0 42px}
    .sm-shadow-status>div:last-child{min-width:0}
    .sm-health{align-items:stretch}
    .sm-health-card{height:112px;min-height:112px;align-items:center;overflow:hidden}
    .sm-backtest{height:100%;grid-template-columns:58px repeat(5,minmax(92px,1fr))}
    .sm-bt-cell{display:flex;min-height:54px;flex-direction:column;justify-content:center;padding:0 12px}
    .sm-bt-cell span{font-size:11px}
    .sm-bt-cell b{display:block;max-width:100%;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sm-order-flow{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
    .sm-action{display:inline-flex;align-items:center;justify-content:center;min-width:42px;border-radius:6px;padding:4px 7px;font-size:11px;font-weight:850}
    .sm-action.buy{background:#dcfce7;color:#15803d}
    .sm-action.sell{background:#fee2e2;color:#dc2626}
    .sm-flow-arrow{color:#94a3b8;font-weight:800}
    .sm-performance-card{margin-bottom:12px;padding:13px 16px;border-radius:14px;overflow:hidden}
    .sm-performance-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:11px}
    .sm-performance-title{display:flex;align-items:center;gap:10px;min-width:0}
    .sm-performance-title .sm-section-icon{background:#eef4ff;color:#315efb}
    .sm-performance-title h2{margin:0;font-size:16px}
    .sm-performance-title p{margin:2px 0 0;color:var(--sm-muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sm-performance-tabs{display:flex;align-items:center;gap:4px;padding:3px;background:#f1f5f9;border-radius:9px;flex:0 0 auto}
    .sm-performance-tabs button{height:30px;padding:0 12px;border:0;border-radius:7px;background:transparent;color:#64748b;font-size:12px;font-weight:750;cursor:pointer}
    .sm-performance-tabs button.active{background:#fff;color:#315efb;box-shadow:0 2px 8px rgba(15,23,42,.08)}
    .sm-performance-grid{display:grid;grid-template-columns:.8fr 1.2fr 1.2fr .9fr;gap:0;border-top:1px solid #edf1f6}
    .sm-performance-metric{min-width:0;padding:11px 16px 3px;border-left:1px solid #edf1f6}
    .sm-performance-metric:first-child{border-left:0}
    .sm-performance-metric span{display:block;color:var(--sm-muted);font-size:11px}
    .sm-performance-metric b{display:block;margin-top:3px;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sm-performance-metric small{display:block;margin-top:3px;color:#64748b;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sm-performance-foot{display:flex;justify-content:space-between;gap:12px;margin-top:10px;padding-top:9px;border-top:1px solid #edf1f6;color:#64748b;font-size:11px}
    .sm-trade-card .sm-table{min-width:860px;table-layout:auto}
    .sm-trade-card th:nth-child(2),.sm-trade-card td:nth-child(2){width:24%}
    .sm-trade-card th:nth-child(4),.sm-trade-card td:nth-child(4){width:17%}
    .sm-main-grid{display:block}
    .sm-pnl{width:100%;min-height:245px}
    .sm-pnl .sm-card-head,.sm-pnl .sm-card-foot{max-width:1380px;margin-left:auto;margin-right:auto}
    .sm-pnl .sm-metrics{max-width:1180px;margin-left:auto;margin-right:auto}
    .sm-history-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
    .sm-history-toolbar h3{margin:0;font-size:16px}
    .sm-history-method{border:1px solid var(--sm-line);background:#f8fafc;border-radius:8px;padding:14px 16px;line-height:1.6}
    .sm-history-method b{display:block;font-size:15px;margin-bottom:5px}
    .sm-month-open{width:30px;height:30px;border:1px solid #b8d2ff;border-radius:50%;background:#fff;color:var(--sm-blue);font-size:18px;font-weight:850;line-height:1;cursor:pointer}
    .sm-drill-row{cursor:pointer}
    .sm-drill-row:hover td{background:#f8fbff}
    @media(max-width:1360px){
      .sm-control{grid-template-columns:1.15fr .78fr .64fr 1.25fr}
      .sm-health{grid-template-columns:1fr 1fr}
      .sm-health-card{min-height:82px}
      .sm-metrics{grid-template-columns:repeat(3,minmax(0,1fr));row-gap:8px}
      .sm-metric:nth-child(4){border-left:0}
      .sm-pnl,.sm-snapshot{min-height:300px}
    }
    @media(max-width:1050px){
      .sm-control{grid-template-columns:1fr 1fr}
      .sm-shadow-status{grid-column:1/-1}
      .sm-main-grid,.sm-bottom-grid{grid-template-columns:1fr}
      .sm-pnl,.sm-snapshot{min-height:0}
      .sm-bottom-grid>article{height:390px}
    }
    @media(max-width:700px){
      .sm-page{padding:12px}
      .sm-head{display:block}
      .sm-head-actions{display:grid;grid-template-columns:auto 1fr auto;margin-top:12px}
      .sm-refresh-meta{grid-column:1/-1;text-align:left}
      .sm-control,.sm-health{grid-template-columns:1fr}
      .sm-shadow-status{grid-column:auto}
      .sm-control-box,.sm-shadow-status{height:auto;min-height:60px}
      .sm-health-card{min-height:82px}
      .sm-backtest{grid-template-columns:48px repeat(2,minmax(0,1fr));row-gap:10px}
      .sm-bt-cell{border-left:0;padding:3px 7px}
      .sm-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
      .sm-metric,.sm-metric:nth-child(4){border-left:0;border-top:1px solid rgba(86,125,106,.18)}
      .sm-pnl-value{font-size:40px}
      .sm-snapshot-grid{grid-template-columns:1fr}
      .sm-bottom-grid>article{height:390px}
      .sm-table-wrap{overflow-x:auto}
      .sm-bottom-grid .sm-table{min-width:680px}
      .sm-bottom-grid .sm-table.candles{min-width:580px}
      .sm-console-full{height:320px}
      .sm-log-line{grid-template-columns:66px 48px minmax(0,1fr);font-size:11px}
      .sm-log-actions{flex-wrap:wrap;justify-content:flex-end}
      .sm-performance-head{align-items:flex-start;flex-direction:column}
      .sm-performance-tabs{width:100%}
      .sm-performance-tabs button{flex:1}
      .sm-performance-grid{grid-template-columns:1fr 1fr}
      .sm-performance-metric:nth-child(3){border-left:0;border-top:1px solid #edf1f6}
      .sm-performance-metric:nth-child(4){border-top:1px solid #edf1f6}
      .sm-performance-foot{display:block;line-height:1.5}
    }
    /* Surgical top layout: two controls followed by exactly four common cards. */
    .sm-control{grid-template-columns:minmax(310px,.8fr) minmax(0,2.2fr);align-items:stretch}
    .sm-control .sm-control-box{height:72px}
    .sm-control .sm-instrument-control .sm-segment{height:42px}
    .sm-control .sm-instrument-control .sm-segment button{font-size:14px}
    .sm-health{grid-template-columns:minmax(190px,.9fr) minmax(260px,1.25fr) minmax(460px,2.15fr) minmax(390px,1.8fr);gap:12px}
    .sm-health-card{min-height:126px;height:auto;padding:14px}
    .sm-health-card .sm-health-value{white-space:normal;overflow:visible;text-overflow:clip}
    .sm-feed-card .sm-health-copy{align-self:stretch;display:flex;flex-direction:column;justify-content:center}
    .sm-feed-metrics{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin-top:8px}
    .sm-feed-metrics span{min-width:0;color:var(--sm-muted);font-size:10px}
    .sm-feed-metrics b{display:block;color:var(--sm-ink);font-size:11px;white-space:normal;overflow-wrap:anywhere}
    .sm-backtest-card{align-items:stretch}
    .sm-backtest{grid-template-columns:48px repeat(3,minmax(90px,1fr));grid-template-rows:auto auto;row-gap:10px}
    .sm-backtest .sm-health-icon{grid-row:1/3}
    .sm-bt-cell{padding:0 9px}
    .sm-bt-cell span,.sm-bt-cell b{white-space:normal;overflow:visible;text-overflow:clip}
    .sm-bt-cell b{font-size:13px}
    .sm-best-card{align-items:stretch}
    .sm-best-wrap{width:100%;min-width:0}
    .sm-best-title{font-size:13px;font-weight:850;margin-bottom:9px}
    .sm-best-groups{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));height:calc(100% - 24px)}
    .sm-best-group{min-width:0;padding:0 10px;border-left:1px solid var(--sm-line);display:flex;flex-direction:column;justify-content:center}
    .sm-best-group:first-child{border-left:0;padding-left:0}
    .sm-best-group>span{font-size:9px;color:var(--sm-muted);font-weight:750}
    .sm-best-group>b{font-size:11px;margin:3px 0;white-space:normal;overflow-wrap:anywhere}
    .sm-best-group small{display:block;font-size:9px;color:var(--sm-muted)}
    .sm-best-group strong{display:block;font-size:12px;margin-top:3px}
    @media(max-width:1250px){.sm-health{grid-template-columns:1fr 1fr}.sm-backtest-card,.sm-best-card{min-height:140px}}
    @media(max-width:760px){.sm-control{grid-template-columns:1fr}.sm-control .sm-control-box{height:auto;min-height:72px}.sm-health{grid-template-columns:1fr}.sm-health-summary{grid-template-columns:1fr}.sm-health-checked{text-align:left}.sm-health-row{grid-template-columns:1fr auto}.sm-health-row-detail{grid-column:1/-1}.sm-backtest{grid-template-columns:repeat(2,minmax(0,1fr))}.sm-backtest .sm-health-icon{display:none}.sm-best-groups{grid-template-columns:1fr}.sm-best-group{border-left:0;border-top:1px solid var(--sm-line);padding:8px 0}.sm-best-group:first-child{border-top:0}}
    /* Reference-matched top section. No styles below the common-card row are changed here. */
    .sm-control{grid-template-columns:minmax(280px,28fr) minmax(0,72fr);gap:14px;padding:12px 14px;margin-bottom:14px;background:#fff;border:1px solid #dce5f1;border-radius:15px;box-shadow:0 5px 18px rgba(31,55,91,.06)}
    .sm-control .sm-control-box{height:64px;padding:0 12px;border:0;border-radius:10px;box-shadow:none;background:transparent}
    .sm-control .sm-control-box:first-child{border-right:1px solid #e7edf5;border-radius:0;padding-right:20px}
    .sm-control .sm-control-box label{margin:0 0 5px;font-size:11px;line-height:1;color:#7b879d;font-weight:700;letter-spacing:0;text-transform:uppercase}
    .sm-control .sm-control-inner{height:44px}
    .sm-control .sm-control-icon{width:32px;height:32px;margin-right:8px;background:transparent;color:#243b6b}
    .sm-control .sm-select{height:44px;border-color:#d9e2ef;border-radius:8px;font-size:14px;font-weight:700;background:#fff}
    .sm-control .sm-instrument-control .sm-segment{height:50px;padding:4px;border-radius:10px;background:#f4f6fa;box-shadow:inset 0 0 0 1px #e9edf4}
    .sm-control .sm-instrument-control .sm-segment button{height:42px;border-radius:8px;font-size:14px;font-weight:750;color:#57647c}
    .sm-control .sm-instrument-control .sm-segment button.active{background:linear-gradient(135deg,#6849f5,#4b48eb);color:#fff;box-shadow:0 5px 14px rgba(80,70,235,.25)}
    .sm-health{grid-template-columns:minmax(0,20fr) minmax(0,22fr) minmax(0,30fr) minmax(0,28fr);gap:12px;margin-bottom:14px}
    .sm-health-card{height:156px;min-height:156px;padding:14px 16px;border:1px solid #dfe6f0;border-radius:15px;background:#fff;box-shadow:0 5px 18px rgba(31,55,91,.06);display:block}
    .sm-health-card.good-step{background:#fff;border-color:#dfe6f0}
    .sm-health-card::before{display:none!important}
    .sm-common-head{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;height:30px}
    .sm-common-title{display:flex;align-items:center;gap:8px;min-width:0;color:#17233f;font-size:14px;font-weight:700;line-height:1;white-space:nowrap}
    .sm-title-icon,#healthIcon,#feedIcon{width:30px!important;height:30px!important;min-width:30px;border-radius:50%;display:grid!important;place-items:center;background:#e9f9ef!important;color:#16a34a!important;box-shadow:inset 0 0 0 1px rgba(22,163,74,.08)!important}
    .sm-title-icon.feed,#feedIcon{background:#edf4ff!important;color:#3567e9!important}
    .sm-title-icon.backtest{background:#edf4ff!important;color:#315fe4!important}
    .sm-title-icon.best{background:#f2efff!important;color:#704fe8!important}
    .sm-title-icon .sm-icon,#healthIcon .sm-icon,#feedIcon .sm-icon{width:17px;height:17px}
    .sm-status-dot{width:8px;height:8px;flex:0 0 auto;border-radius:50%;background:#18b653;box-shadow:0 0 0 3px rgba(24,182,83,.1)}
    .warning-step .sm-status-dot{background:#e89a0c;box-shadow:0 0 0 3px rgba(232,154,12,.11)}
    .critical-step .sm-status-dot{background:#e63c4d;box-shadow:0 0 0 3px rgba(230,60,77,.11)}
    .sm-system-card .sm-health-value,.sm-feed-card .sm-health-value{margin:11px 0 10px;font-size:22px;line-height:1.05;font-weight:800;color:#11863b;white-space:nowrap;overflow:visible}
    .sm-system-card.warning-step .sm-health-value,.sm-feed-card.warning-step .sm-health-value{color:#b76800}
    .sm-system-card.critical-step .sm-health-value,.sm-feed-card.critical-step .sm-health-value{color:#cf2439}
    .sm-system-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
    .sm-system-bottom .sm-health-note{margin:0;min-width:0;font-size:11px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sm-health-action{height:28px;padding:0 9px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;font-size:10px;line-height:1;font-weight:800;white-space:nowrap;background:#f7faff;border:1px solid #bed1f8;color:#315efb}
    .sm-feed-card .sm-health-value{margin:8px 0 7px}
    .sm-feed-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin:0}
    .sm-feed-metrics span{padding:0 7px;border-left:1px solid #e5ebf3;color:#7a879d;font-size:10px;line-height:1.15;white-space:nowrap}
    .sm-feed-metrics span:first-child{padding-left:0;border-left:0}
    .sm-feed-metrics b{display:block;margin-top:3px;color:#17233f;font-size:11px;font-weight:750;white-space:nowrap;overflow:visible}
    .sm-feed-event{margin-top:7px;color:#7a879d;font-size:10px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sm-feed-event b{font-weight:600}
    .sm-backtest-card .sm-common-head,.sm-best-card .sm-common-head{margin-bottom:11px}
    .sm-backtest{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,1fr);gap:9px 0;width:100%}
    .sm-backtest>.sm-health-icon{display:none!important}
    .sm-bt-cell{min-width:0;padding:0 10px;border-left:1px solid #e5ebf3}
    .sm-bt-cell:nth-of-type(2),.sm-bt-cell:nth-of-type(5){border-left:0;padding-left:0}
    .sm-bt-cell span{display:block;color:#7a879d;font-size:10px;line-height:1.15;font-weight:600;white-space:nowrap;overflow:visible}
    .sm-bt-cell b{display:block;margin-top:4px;color:#17233f;font-size:15px;line-height:1.1;font-weight:750;white-space:nowrap;overflow:visible;text-overflow:clip}
    .sm-best-groups{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));height:85px}
    .sm-best-group{min-width:0;padding:1px 11px;border-left:1px solid #e5ebf3;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;text-align:center}
    .sm-best-group:first-child{border-left:0;padding-left:0}
    .sm-best-group>span{font-size:10px;line-height:1.15;color:#7a879d;font-weight:650;white-space:nowrap}
    .sm-best-group>b{width:100%;margin:5px 0 3px;color:#17233f;font-size:12px;line-height:1.15;font-weight:750;white-space:normal;overflow-wrap:break-word}
    .sm-best-group small:first-of-type{display:inline-flex;align-items:center;justify-content:center;min-height:18px;padding:2px 6px;border-radius:5px;background:#eef3ff;color:#315efb;font-size:9px;font-weight:800;text-transform:uppercase}
    .sm-best-group strong{display:block;margin-top:4px;font-size:16px;line-height:1;font-weight:800}
    .sm-best-group small:last-of-type{display:block;margin-top:3px;font-size:10px;line-height:1;font-weight:700}
    @media(max-width:1250px){.sm-health{grid-template-columns:1fr 1fr}.sm-health-card{height:156px;min-height:156px}}
    @media(max-width:760px){.sm-control{grid-template-columns:1fr;padding:10px}.sm-control .sm-control-box:first-child{border-right:0;border-bottom:1px solid #e7edf5;padding:0 0 12px}.sm-health{grid-template-columns:1fr}.sm-health-card{height:auto;min-height:156px}.sm-backtest{grid-template-columns:repeat(2,minmax(0,1fr))}.sm-bt-cell:nth-of-type(n){padding:0 8px;border-left:1px solid #e5ebf3}.sm-bt-cell:nth-of-type(2n){border-left:0;padding-left:0}.sm-best-groups{height:auto}.sm-best-group{padding-bottom:4px}}
    .sm-page{position:relative}
    .sm-data-loader{position:fixed;inset:0;z-index:1600;display:none;align-items:center;justify-content:center;flex-direction:column;gap:8px;background:rgba(247,249,252,.88);backdrop-filter:blur(4px);color:#17233f}
    .sm-data-loader.active{display:flex}
    .sm-loader-mark{position:relative;width:74px;height:74px;display:grid;place-items:center;margin-bottom:6px}
    .sm-loader-mark img{width:48px;height:48px;border-radius:11px;filter:drop-shadow(0 8px 14px rgba(66,74,220,.2));animation:smLoaderPulse 1.35s ease-in-out infinite}
    .sm-loader-ring{position:absolute;inset:2px;border:3px solid rgba(82,76,231,.14);border-top-color:#584ce8;border-right-color:#315efb;border-radius:50%;animation:smLoaderSpin .85s linear infinite}
    .sm-data-loader b{font-size:14px;font-weight:800}
    .sm-data-loader>span:last-child{font-size:11px;color:#718096}
    @keyframes smLoaderSpin{to{transform:rotate(360deg)}}
    @keyframes smLoaderPulse{0%,100%{transform:scale(.94);opacity:.82}50%{transform:scale(1);opacity:1}}
    .sm-control .strategy .sm-control-inner{position:relative;padding:4px;border:1px solid #d6e0ee;border-radius:10px;background:#f7f9fd;transition:border-color .16s ease,box-shadow .16s ease,background .16s ease}
    .sm-control .strategy .sm-control-inner:focus-within{border-color:#7c8df6;background:#fff;box-shadow:0 0 0 3px rgba(79,70,229,.12)}
    .sm-control .strategy .sm-control-icon{width:36px;height:36px;flex:0 0 36px;margin-right:2px;border-radius:8px;background:#eef2ff;color:#4f46e5}
    .sm-control .strategy .sm-select{height:36px;padding:0 34px 0 9px;border:0;background:transparent;box-shadow:none;appearance:none;cursor:pointer;color:#18233d;font-size:14px;font-weight:750}
    .sm-control .strategy .sm-control-inner::after{content:"";position:absolute;right:15px;top:50%;width:8px;height:8px;border-right:2px solid #516078;border-bottom:2px solid #516078;transform:translateY(-68%) rotate(45deg);pointer-events:none}
    .sm-control .strategy .sm-select:hover{color:#315efb}
    .sm-control .sm-instrument-control .sm-segment{gap:5px;background:#eef1f7}
    .sm-control .sm-instrument-control .sm-segment button{display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid transparent;transition:background .16s ease,color .16s ease,border-color .16s ease,box-shadow .16s ease,transform .16s ease}
    .sm-control .sm-instrument-control .sm-segment button .sm-icon{width:18px;height:18px}
    .sm-control .sm-instrument-control .sm-segment button:not(.active){background:#fff;border-color:#e1e6ef;color:#56627a;box-shadow:0 1px 2px rgba(15,23,42,.04)}
    .sm-control .sm-instrument-control .sm-segment button:not(.active):hover{border-color:#aebcf4;color:#4338ca;background:#f8f9ff}
    .sm-control .sm-instrument-control .sm-segment button.active{transform:translateY(-1px);background:#5148e8;color:#fff;border-color:#5148e8;box-shadow:0 6px 16px rgba(81,72,232,.26)}
    .sm-control .sm-instrument-control .sm-segment button:disabled{cursor:not-allowed;opacity:.4;transform:none;background:#f3f5f9;color:#94a3b8;border-color:#e2e8f0;box-shadow:none}
    .sm-control .sm-instrument-control .sm-segment button:focus-visible{outline:3px solid rgba(79,70,229,.2);outline-offset:1px}
    /* Shadow Live P&L presentation only. Data bindings remain in renderSummary. */
    .sm-pnl{isolation:isolate;position:relative;width:100%;min-height:238px;padding:14px 20px 12px;overflow:hidden;border:1px solid rgba(81,129,255,.3);border-radius:20px;background:linear-gradient(118deg,#071a4d 0%,#0c1947 38%,#241052 69%,#073e4d 100%);box-shadow:0 14px 30px rgba(13,25,64,.18),inset 0 1px 0 rgba(255,255,255,.1);color:#f8fbff}
    .sm-pnl.profit,.sm-pnl.loss{background:linear-gradient(118deg,#071a4d 0%,#0c1947 38%,#241052 69%,#073e4d 100%);border-color:rgba(81,129,255,.3)}
    .sm-pnl::before{content:"";position:absolute;inset:0;z-index:-3;background-image:radial-gradient(circle,rgba(70,145,255,.45) 1px,transparent 1.4px),radial-gradient(circle,rgba(25,230,202,.28) 1px,transparent 1.4px);background-position:18px 18px,calc(100% - 18px) calc(100% - 18px);background-size:15px 15px,17px 17px;mask-image:linear-gradient(115deg,#000 0%,transparent 24%,transparent 76%,#000 100%);opacity:.4;pointer-events:none}
    .sm-pnl::after{content:"";position:absolute;inset:-35% -12%;z-index:-4;height:auto;border:0;transform:none;background:radial-gradient(circle at 8% 48%,rgba(26,103,255,.28),transparent 30%),radial-gradient(circle at 70% 18%,rgba(112,43,222,.28),transparent 32%),radial-gradient(circle at 96% 70%,rgba(0,205,190,.22),transparent 27%);pointer-events:none}
    .sm-pnl-curve{position:absolute;inset:auto 0 38px 0;z-index:-1;width:100%;height:58%;opacity:.72;pointer-events:none}
    .sm-pnl-orbit{position:absolute;right:5%;top:-90px;z-index:-2;width:270px;height:220px;border:1px solid rgba(75,212,255,.13);border-radius:50%;box-shadow:0 0 0 16px rgba(75,212,255,.045),0 0 0 34px rgba(126,75,255,.035);transform:rotate(18deg);pointer-events:none}
    .sm-pnl .sm-card-head{position:relative;z-index:2;align-items:flex-start;margin:0}
    .sm-pnl-heading{display:flex;align-items:center;gap:11px;min-width:0}
    .sm-pnl-heading-icon{width:40px;height:40px;display:grid;place-items:center;flex:0 0 40px;border:1px solid rgba(43,239,171,.45);border-radius:50%;background:rgba(17,190,168,.13);color:#2ce4a2;box-shadow:inset 0 0 0 5px rgba(19,202,177,.06),0 0 18px rgba(30,211,174,.08)}
    .sm-pnl-heading-icon .sm-icon{width:21px;height:21px;stroke-width:2.5}
    .sm-pnl-heading-copy h2,.sm-pnl .sm-card-head h2{margin:0;color:#f8fbff;font-size:17px;font-weight:800;text-transform:none}
    .sm-pnl-heading-copy p{margin:2px 0 0;color:#9fb6da;font-size:11px}
    .sm-pnl .sm-live-chip{height:32px;min-width:88px;justify-content:center;border:1px solid rgba(32,229,170,.66);border-radius:999px;background:rgba(4,105,99,.22);color:#2ce4a2;font-size:11px;letter-spacing:.04em;box-shadow:inset 0 0 18px rgba(31,224,181,.06)}
    .sm-pnl .sm-live-chip .sm-dot{width:8px;height:8px;box-shadow:0 0 11px currentColor}
    .sm-pnl-value{position:relative;z-index:2;margin:1px 0 0;text-align:center;font-size:clamp(46px,3.8vw,58px);font-weight:850;line-height:1;letter-spacing:0;background:linear-gradient(180deg,#42eca8 0%,#16cd82 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 8px 18px rgba(24,210,137,.15))}
    .sm-pnl.loss .sm-pnl-value{background:linear-gradient(180deg,#ff858e 0%,#ff5264 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
    .sm-pnl:not(.profit):not(.loss) .sm-pnl-value{background:linear-gradient(180deg,#f4f8ff 0%,#b9c9e4 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
    .sm-pnl-sub{position:relative;z-index:2;display:block;min-height:16px;margin:0 0 2px;text-align:center;color:#91a8cc;font-size:9px}
    .sm-pnl-state{margin-left:0;border:1px solid rgba(44,228,162,.3);border-radius:999px;background:rgba(44,228,162,.1);color:#57efb4;padding:3px 8px}
    .sm-pnl.loss .sm-pnl-state{border-color:rgba(255,102,116,.35);background:rgba(255,82,100,.12);color:#ff8994}
    .sm-pnl .sm-metrics{position:relative;z-index:2;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:0;max-width:none;margin:0 auto}
    .sm-pnl .sm-metric{display:flex;align-items:center;justify-content:center;gap:7px;min-width:0;min-height:50px;padding:4px 9px;border:0;border-left:1px solid rgba(151,178,220,.22);border-radius:0;background:transparent;text-align:left}
    .sm-pnl .sm-metric:first-child{border-left:0}
    .sm-pnl-metric-icon{width:30px;height:30px;display:grid;place-items:center;flex:0 0 30px;border:1px solid currentColor;border-radius:50%;background:rgba(255,255,255,.055)}
    .sm-pnl-metric-icon .sm-icon{width:16px;height:16px}
    .sm-pnl .sm-metric:nth-child(1) .sm-pnl-metric-icon{color:#2ce4a2;background:rgba(24,210,137,.13)}
    .sm-pnl .sm-metric:nth-child(2) .sm-pnl-metric-icon{color:#28c8ff;background:rgba(19,148,238,.13)}
    .sm-pnl .sm-metric:nth-child(3) .sm-pnl-metric-icon{color:#9d70ff;background:rgba(119,65,225,.15)}
    .sm-pnl .sm-metric:nth-child(4) .sm-pnl-metric-icon{color:#ffd24e;background:rgba(229,167,14,.15)}
    .sm-pnl .sm-metric:nth-child(5) .sm-pnl-metric-icon{color:#ff6997;background:rgba(226,46,112,.15)}
    .sm-pnl .sm-metric:nth-child(6) .sm-pnl-metric-icon{color:#42dbff;background:rgba(14,170,213,.15)}
    .sm-pnl-metric-copy{min-width:0}
    .sm-pnl .sm-metric span:not(.sm-pnl-metric-icon){display:block;color:#91a8cc;font-size:10px;line-height:1.15;white-space:nowrap}
    .sm-pnl .sm-metric b{display:block;margin-top:3px;color:#eef5ff;font-size:14px;font-weight:800;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sm-pnl .sm-metric:nth-child(3) b{color:#d391ff}
    .sm-pnl .sm-metric:nth-child(4) b{color:#ffd84f}
    .sm-pnl .sm-metric:nth-child(5) b{color:#ff76a0}
    .sm-pnl .sm-metric:nth-child(6) b{color:#b9ebff}
    .sm-pnl .sm-positive{color:#39e9a4!important}.sm-pnl .sm-negative{color:#ff7180!important}.sm-pnl .sm-muted{color:#9fb2cf!important}
    .sm-pnl .sm-card-foot{position:relative;z-index:2;display:flex;align-items:center;gap:7px;max-width:none;margin:3px 0 0;padding:7px 0 0;border-top:1px solid rgba(145,173,216,.2);color:#a9bddc;font-size:10px}
    .sm-pnl-foot-icon{width:20px;height:20px;display:grid;place-items:center;flex:0 0 20px;color:#2ce4a2}
    .sm-pnl-foot-icon .sm-icon{width:17px;height:17px}
    /* Give full backtest amounts enough horizontal room instead of clipping them. */
    .sm-backtest-card{overflow:hidden;padding:10px 14px}
    .sm-backtest-card .sm-common-head{margin-bottom:5px}
    .sm-backtest-card .sm-backtest{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));gap:2px 0}
    .sm-backtest-card .sm-bt-cell{min-width:0;padding:1px 10px;border-left:1px solid #e5ebf3}
    .sm-backtest-card .sm-bt-cell:nth-child(even){padding-left:0;border-left:0}
    .sm-backtest-card .sm-bt-cell span{font-size:9px;line-height:1.1;white-space:nowrap}
    .sm-backtest-card .sm-bt-cell b{margin-top:1px;font-size:clamp(11px,.76vw,13px);line-height:1.05;white-space:nowrap;overflow:visible;text-overflow:clip;font-variant-numeric:tabular-nums}
    .sm-bottom-grid{display:grid;visibility:visible;opacity:1}
    @keyframes smStatusBlink{0%,100%{opacity:1;box-shadow:0 0 0 3px currentColor,0 0 12px currentColor}50%{opacity:.35;box-shadow:0 0 0 1px currentColor,0 0 3px currentColor}}
    .sm-market .sm-dot,.sm-status-dot,.sm-pnl .sm-live-chip .sm-dot{animation:smStatusBlink 1.15s ease-in-out infinite}
    .sm-market.open{color:#16a34a;border-color:#9fdfa9;background:#f0fdf4}
    .sm-market.closed{color:#dc2626;border-color:#fecaca;background:#fff1f2}
    .sm-system-card.good-step .sm-status-dot{color:#16a34a;background:#16a34a}
    .sm-system-card.warning-step .sm-status-dot,.sm-system-card.critical-step .sm-status-dot{color:#dc2626;background:#dc2626}
    .sm-feed-card.market-closed-step .sm-status-dot{color:#dc2626;background:#dc2626}
    .sm-feed-card.market-closed-step .sm-health-value{color:#dc2626}
    .sm-pnl .sm-live-chip.is-live{color:#2ce4a2;border-color:rgba(32,229,170,.66);background:rgba(4,105,99,.22)}
    .sm-pnl .sm-live-chip.is-closed{color:#ff6575;border-color:rgba(255,101,117,.7);background:rgba(151,24,54,.2)}
    .sm-consolidated-toggle{height:42px;border-radius:11px;border:1px solid rgba(99,102,241,.45);background:linear-gradient(135deg,#111827,#172554);color:#fff;padding:0 15px;display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 4px 12px rgba(15,23,42,.16);white-space:nowrap}
    .sm-consolidated-toggle:hover{border-color:rgba(129,140,248,.8);background:linear-gradient(135deg,#172033,#1e3069)}
    .sm-consolidated-view[hidden]{display:none!important}
    .sm-consolidated-mode>.sm-control,.sm-consolidated-mode>.sm-health,.sm-consolidated-mode>.sm-main-grid,.sm-consolidated-mode>.sm-bottom-grid,.sm-consolidated-mode>.sm-console-card,.sm-consolidated-mode>.sm-footer-note{display:none!important}
    .sm-page.sm-consolidated-page{min-height:calc(100vh - 104px);background:radial-gradient(circle at 20% 10%,rgba(49,46,129,.2),transparent 30%),radial-gradient(circle at 82% 14%,rgba(8,145,178,.14),transparent 30%),linear-gradient(135deg,#050b18 0%,#081225 50%,#06101f 100%)}
    .sm-consolidated-mode .sm-head{margin:0 0 16px;padding:18px 20px;border:1px solid rgba(99,102,241,.3);border-radius:14px;background:linear-gradient(135deg,rgba(12,22,43,.98),rgba(20,28,67,.96));box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 12px 28px rgba(0,0,0,.2)}
    .sm-consolidated-mode .sm-title{color:#f8fafc;font-size:22px;line-height:1.15}
    .sm-consolidated-mode .sm-sub,.sm-consolidated-mode .sm-refresh-meta{color:#9fb0ce}
    .sm-consolidated-mode .sm-shadow-badge{display:none}
    .sm-consolidated-mode .sm-market,.sm-consolidated-mode .sm-refresh{color:#e5e7eb;border-color:rgba(148,163,184,.28);background:rgba(15,23,42,.66)}
    .sm-consolidated{color:#e5e7eb}
    .sm-consolidated-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;padding:12px 14px;border:1px solid rgba(96,165,250,.2);border-radius:12px;background:rgba(4,10,22,.42)}
    .sm-consolidated-toolbar-title{display:flex;flex-direction:column;gap:3px;min-width:0}
    .sm-consolidated-toolbar-title b{color:#f8fafc;font-size:15px}
    .sm-consolidated-toolbar-title span{color:#9fb0ce;font-size:11px;font-weight:700}
    .sm-consolidated-instrument{display:grid;grid-template-columns:1fr 1fr;width:250px;height:40px;padding:4px;border:1px solid rgba(148,163,184,.24);border-radius:10px;background:rgba(15,23,42,.72);gap:4px}
    .sm-consolidated-instrument button{border:0;border-radius:7px;background:transparent;color:#9fb0ce;font-size:13px;font-weight:850;cursor:pointer}
    .sm-consolidated-instrument button.active{background:#5148e8;color:#fff;box-shadow:0 6px 16px rgba(81,72,232,.26)}
    .sm-movement-strip{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:12px;padding:12px 14px;border:1px solid rgba(56,189,248,.3);border-radius:12px;background:linear-gradient(135deg,rgba(8,29,52,.96),rgba(12,20,43,.96))}
    .sm-movement-item{min-width:0;padding-left:13px;border-left:1px solid rgba(148,163,184,.2)}.sm-movement-item:first-child{padding-left:0;border-left:0}.sm-movement-item span{display:block;color:#93c5fd;font-size:9px;font-weight:850;letter-spacing:.06em;text-transform:uppercase}.sm-movement-item b{display:block;margin-top:4px;color:#f8fafc;font-size:17px;font-weight:850;font-variant-numeric:tabular-nums}.sm-movement-item small{display:block;margin-top:2px;color:#94a3b8;font-size:10px}.sm-movement-item b.positive{color:#34d399}.sm-movement-item b.negative{color:#fb7185}
    .sm-winner-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}
    .sm-winner-card{min-width:0;min-height:82px;padding:11px 13px;border:1px solid rgba(96,165,250,.32);border-radius:10px;background:linear-gradient(145deg,rgba(14,25,48,.96),rgba(7,14,29,.98));box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
    .sm-winner-period{display:flex;align-items:center;gap:6px;color:#93c5fd;font-size:10px;font-weight:850;text-transform:uppercase}
    .sm-winner-period .star{color:#fde047;font-size:13px}
    .sm-winner-main{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-top:7px}
    .sm-winner-name{min-width:0;color:#f8fafc;font-size:13px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sm-winner-type{display:inline-flex;margin-left:6px;padding:2px 5px;border:1px solid rgba(96,165,250,.35);border-radius:4px;color:#bfdbfe;font-size:9px;vertical-align:1px}
    .sm-winner-values{flex:0 0 auto;text-align:right}.sm-winner-return{display:block;color:#34d399;font-size:15px;font-weight:850}.sm-winner-pnl{display:block;margin-top:2px;color:#cbd5e1;font-size:10px;font-weight:750}
    .sm-winner-empty{margin-top:9px;color:#64748b;font-size:12px}
    .sm-consolidated-groups{display:grid;gap:18px}
    .sm-instrument-group{padding:14px;border:1px solid rgba(96,165,250,.2);border-radius:14px;background:rgba(4,10,22,.42);box-shadow:inset 0 1px 0 rgba(255,255,255,.035)}
    .sm-instrument-group.options{border-color:rgba(167,139,250,.24);background:rgba(14,9,31,.4)}
    .sm-instrument-group-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:11px;padding:0 2px}
    .sm-instrument-group-title{display:flex;align-items:center;gap:9px;margin:0;color:#f8fafc;font-size:15px;font-weight:850;letter-spacing:.02em}
    .sm-instrument-group-title:before{content:"";width:8px;height:8px;border-radius:50%;background:#38bdf8;box-shadow:0 0 0 4px rgba(56,189,248,.12)}
    .sm-instrument-group.options .sm-instrument-group-title:before{background:#a78bfa;box-shadow:0 0 0 4px rgba(167,139,250,.12)}
    .sm-instrument-group-summary{color:#9fb0ce;font-size:11px;font-weight:750;text-align:right}
    .sm-consolidated-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
    .sm-key-tile{position:relative;isolation:isolate;min-height:142px;padding:14px 15px 13px;border:1px solid rgba(128,148,180,.7);border-radius:10px;background:linear-gradient(145deg,rgba(14,22,38,.99),rgba(4,9,19,.99));color:#94a3b8;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),inset 0 -12px 22px rgba(0,0,0,.24),0 8px 24px rgba(0,0,0,.3);cursor:pointer;text-align:left;display:flex;flex-direction:column;transition:border-color .16s ease,transform .16s ease,box-shadow .16s ease,filter .16s ease;min-width:0;overflow:hidden}
    .sm-key-tile:before{content:"";position:absolute;z-index:0;inset:0;border-radius:inherit;pointer-events:none;background:radial-gradient(circle at 15% 0,rgba(255,255,255,.08),transparent 28%),linear-gradient(180deg,rgba(255,255,255,.025),transparent 34%);opacity:1}
    .sm-key-tile:hover{transform:translateY(-2px);filter:brightness(1.06);border-color:#60a5fa;box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 0 20px rgba(59,130,246,.2),0 12px 28px rgba(0,0,0,.38)}
    .sm-key-tile.profit{color:#23e57b;border-color:rgba(55,218,116,.7);background:linear-gradient(145deg,rgba(9,31,29,.99),rgba(3,14,20,.99));box-shadow:inset 0 1px 0 rgba(255,255,255,.07),inset 0 -12px 22px rgba(0,0,0,.26),0 0 16px rgba(34,197,94,.13),0 9px 24px rgba(0,0,0,.34)}
    .sm-key-tile.loss{color:#ff475d;border-color:rgba(244,63,94,.78);background:linear-gradient(145deg,rgba(40,13,27,.99),rgba(14,5,16,.99));box-shadow:inset 0 1px 0 rgba(255,255,255,.06),inset 0 -12px 22px rgba(0,0,0,.28),0 0 17px rgba(244,63,94,.15),0 9px 24px rgba(0,0,0,.35)}
    .sm-key-tile.stale,.sm-key-tile.error,.sm-key-tile.missed{color:#fbbf24;border-color:rgba(245,158,11,.78);background:linear-gradient(145deg,rgba(39,29,10,.99),rgba(15,10,3,.99));box-shadow:inset 0 1px 0 rgba(255,255,255,.06),inset 0 -12px 22px rgba(0,0,0,.28),0 0 17px rgba(245,158,11,.16),0 9px 24px rgba(0,0,0,.35)}
    .sm-key-tile.selected{border-color:#9b63ff;outline:1px solid rgba(139,92,246,.78);outline-offset:3px;box-shadow:inset 0 1px 0 rgba(255,255,255,.1),inset 0 -12px 22px rgba(0,0,0,.26),0 0 0 1px rgba(139,92,246,.25),0 0 24px rgba(124,58,237,.55),0 12px 28px rgba(0,0,0,.42)}
    .sm-key-tile.top-performer{border-color:#38bdf8;outline:1px solid rgba(56,189,248,.88);outline-offset:2px;box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 0 0 1px rgba(14,165,233,.25),0 0 22px rgba(14,165,233,.42),0 10px 25px rgba(0,0,0,.4)}
    @keyframes smLiveTilePulse{0%,100%{border-color:#34d399;background:linear-gradient(145deg,rgba(7,62,43,.98),rgba(3,25,20,.99));box-shadow:inset 0 0 30px rgba(16,185,129,.22),0 0 10px rgba(45,212,191,.34),0 9px 24px rgba(0,0,0,.34)}50%{border-color:#5eead4;background:linear-gradient(145deg,rgba(11,92,63,.98),rgba(4,39,31,.99));box-shadow:inset 0 0 46px rgba(16,185,129,.38),0 0 26px rgba(45,212,191,.75),0 11px 26px rgba(0,0,0,.38)}}
    @keyframes smLiveTileLossPulse{0%,100%{border-color:#fb7185;background:linear-gradient(145deg,rgba(80,15,27,.98),rgba(34,7,17,.99));box-shadow:inset 0 0 30px rgba(239,68,68,.24),0 0 10px rgba(248,113,113,.36),0 9px 24px rgba(0,0,0,.34)}50%{border-color:#fca5a5;background:linear-gradient(145deg,rgba(116,23,38,.98),rgba(55,9,24,.99));box-shadow:inset 0 0 48px rgba(239,68,68,.42),0 0 26px rgba(248,113,113,.78),0 11px 26px rgba(0,0,0,.38)}}
    @keyframes smSelectedLiveTilePulse{0%,100%{border-color:#34d399;background:linear-gradient(145deg,rgba(7,62,43,.98),rgba(3,25,20,.99));box-shadow:inset 0 0 32px rgba(16,185,129,.26),0 0 0 1px rgba(139,92,246,.28),0 0 17px rgba(52,211,153,.48),0 10px 22px rgba(0,0,0,.38)}50%{border-color:#86efac;background:linear-gradient(145deg,rgba(12,105,72,.98),rgba(4,45,35,.99));box-shadow:inset 0 0 50px rgba(16,185,129,.44),0 0 0 1px rgba(167,139,250,.42),0 0 30px rgba(52,211,153,.78),0 12px 24px rgba(0,0,0,.4)}}
    @keyframes smSelectedLiveTileLossPulse{0%,100%{border-color:#fb7185;background:linear-gradient(145deg,rgba(80,15,27,.98),rgba(34,7,17,.99));box-shadow:inset 0 0 32px rgba(239,68,68,.3),0 0 0 1px rgba(139,92,246,.28),0 0 17px rgba(248,113,113,.52),0 10px 22px rgba(0,0,0,.38)}50%{border-color:#fecdd3;background:linear-gradient(145deg,rgba(116,23,38,.98),rgba(55,9,24,.99));box-shadow:inset 0 0 50px rgba(239,68,68,.48),0 0 0 1px rgba(167,139,250,.42),0 0 30px rgba(248,113,113,.82),0 12px 24px rgba(0,0,0,.4)}}
    @keyframes smTileFlashUp{0%{background:linear-gradient(145deg,rgba(18,140,87,1),rgba(4,82,55,1));box-shadow:inset 0 0 58px rgba(74,222,128,.72),0 0 30px rgba(74,222,128,.8)}100%{background:linear-gradient(145deg,rgba(7,62,43,.98),rgba(3,25,20,.99))}}
    @keyframes smTileFlashDown{0%{background:linear-gradient(145deg,rgba(142,25,25,1),rgba(76,8,21,1));box-shadow:inset 0 0 62px rgba(248,113,113,.78),0 0 32px rgba(248,113,113,.78)}100%{background:linear-gradient(145deg,rgba(7,62,43,.98),rgba(3,25,20,.99))}}
    .sm-key-tile.open{color:#86efac;border-color:#34d399;background:linear-gradient(145deg,rgba(7,62,43,.98),rgba(3,25,20,.99));animation:smLiveTilePulse 1.15s ease-in-out infinite}
    .sm-key-tile.open.open-loss{color:#fca5a5;border-color:#fb7185;background:linear-gradient(145deg,rgba(80,15,27,.98),rgba(34,7,17,.99));animation:smLiveTileLossPulse 1.15s ease-in-out infinite}
    .sm-key-tile.open.selected{animation:smSelectedLiveTilePulse 1.15s ease-in-out infinite;outline-color:rgba(167,139,250,.88)}
    .sm-key-tile.open.flash-up{animation:smTileFlashUp .62s ease-out,smLiveTilePulse 1.15s ease-in-out .62s infinite}
    .sm-key-tile.open.flash-down{animation:smTileFlashDown .62s ease-out,smLiveTilePulse 1.15s ease-in-out .62s infinite}
    .sm-key-tile.open.open-loss.flash-up{animation:smTileFlashUp .62s ease-out,smLiveTileLossPulse 1.15s ease-in-out .62s infinite}
    .sm-key-tile.open.open-loss.flash-down{animation:smTileFlashDown .62s ease-out,smLiveTileLossPulse 1.15s ease-in-out .62s infinite}
    .sm-key-tile.open.selected.flash-up{animation:smTileFlashUp .62s ease-out,smSelectedLiveTilePulse 1.15s ease-in-out .62s infinite}
    .sm-key-tile.open.selected.flash-down{animation:smTileFlashDown .62s ease-out,smSelectedLiveTilePulse 1.15s ease-in-out .62s infinite}
    .sm-key-tile.open.open-loss.selected{animation:smSelectedLiveTileLossPulse 1.15s ease-in-out infinite}
    .sm-key-tile.open.open-loss.selected.flash-up{animation:smTileFlashUp .62s ease-out,smSelectedLiveTileLossPulse 1.15s ease-in-out .62s infinite}
    .sm-key-tile.open.open-loss.selected.flash-down{animation:smTileFlashDown .62s ease-out,smSelectedLiveTileLossPulse 1.15s ease-in-out .62s infinite}
    .sm-key-head{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .sm-key-name{font-size:14px;line-height:1.2;font-weight:800;color:#f8fafc;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sm-key-instrument{flex:0 0 auto;padding:3px 7px;border-radius:5px;background:rgba(5,12,23,.8);border:1px solid rgba(148,163,184,.3);color:#dbeafe;font-size:10px;font-weight:850}
    .sm-key-pnl{position:relative;z-index:2;margin-top:15px;font-size:23px;line-height:1;font-weight:800;color:#aeb8ca;white-space:nowrap;text-align:center}
    .sm-key-tile.profit .sm-key-pnl,.sm-key-tile.open.open-profit .sm-key-pnl{color:#23e57b}.sm-key-tile.loss .sm-key-pnl,.sm-key-tile.open.open-loss .sm-key-pnl{color:#ff475d}
    .sm-key-return{position:relative;z-index:2;margin-top:7px;font-size:13px;font-weight:700;color:#aeb8ca;text-align:center}
    .sm-key-captured{position:relative;z-index:2;margin-top:5px;color:#dbeafe;font-size:11px;font-weight:800;text-align:center}.sm-key-captured.positive{color:#86efac}.sm-key-captured.negative{color:#fda4af}
    .sm-key-spark{position:absolute;z-index:1;left:18px;right:0;bottom:36px;width:calc(100% - 18px);height:58px;color:inherit;opacity:.28;pointer-events:none}
    .sm-key-spark polyline{fill:none;stroke:currentColor;stroke-width:1.2;vector-effect:non-scaling-stroke}
    .sm-key-select-mark{display:none;position:absolute;z-index:3;right:-1px;top:-1px;width:42px;height:42px;color:#a78bfa;background:linear-gradient(135deg,#7c3aed 0 49%,transparent 50%);font-size:17px;line-height:21px;text-align:right;padding:5px 7px 0 0}
    .sm-key-tile.top-performer .sm-key-select-mark{display:block;color:#fef08a;background:linear-gradient(135deg,#2563eb 0 49%,transparent 50%)}
    .sm-key-tile.top-performer .sm-key-instrument{margin-right:28px}
    .sm-key-bottom{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:7px;margin-top:auto;padding-top:9px;color:#e2e8f0;font-size:10px;font-weight:700;text-transform:uppercase}
    .sm-key-state{display:inline-flex;align-items:center;gap:7px;padding:0;background:transparent;font-size:12px;font-weight:800}
    .sm-key-state.open,.sm-key-state.running,.sm-key-state.closed{color:#4ade80}.sm-key-state.waiting,.sm-key-state.no-trade{color:#bfdbfe}.sm-key-state.stale,.sm-key-state.error,.sm-key-state.blocked,.sm-key-state.missed,.sm-key-state.eod{color:#fbbf24}
    .sm-key-state.open:before,.sm-key-state.running:before{content:"";width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 0 4px rgba(52,211,153,.12)}
    .sm-key-state.waiting:before,.sm-key-state.no-trade:before{content:"";width:7px;height:7px;border-radius:50%;background:#60a5fa;box-shadow:0 0 0 4px rgba(96,165,250,.1)}
    .sm-key-state.blocked:before,.sm-key-state.stale:before,.sm-key-state.error:before,.sm-key-state.missed:before,.sm-key-state.eod:before{content:"";width:7px;height:7px;border-radius:50%;background:#fbbf24;box-shadow:0 0 0 4px rgba(251,191,36,.12)}
    .sm-consolidated-empty{padding:50px 20px;text-align:center;border:1px dashed rgba(148,163,184,.3);border-radius:14px;color:#94a3b8}
    .sm-consolidated-empty b{display:block;color:#f8fafc;font-size:18px;margin-bottom:7px}
    @media(max-width:1350px){.sm-consolidated-grid{grid-template-columns:repeat(6,minmax(0,1fr));gap:9px}.sm-key-tile{min-height:136px;padding:12px}.sm-key-name{font-size:12px}.sm-key-pnl{font-size:20px}}
    @media(max-width:1023px){.sm-movement-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.sm-movement-item:nth-child(3){padding-left:0;border-left:0}.sm-winner-strip{grid-template-columns:repeat(4,minmax(0,1fr))}.sm-consolidated-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.sm-key-tile{min-height:142px}.sm-key-name{font-size:14px}.sm-key-pnl{font-size:23px}}
    @media(max-width:700px){.sm-consolidated-mode .sm-head{padding:14px;align-items:stretch}.sm-consolidated-mode .sm-head-actions{display:grid;grid-template-columns:1fr auto;gap:8px}.sm-consolidated-mode .sm-refresh-meta{grid-column:1/-1;text-align:left}.sm-consolidated-toggle{height:40px;padding:0 11px}.sm-movement-strip{grid-template-columns:1fr 1fr;padding:11px}.sm-movement-item b{font-size:14px}.sm-winner-strip{grid-template-columns:1fr}.sm-consolidated-groups{gap:14px}.sm-instrument-group{padding:11px}.sm-instrument-group-head{align-items:flex-start}.sm-instrument-group-summary{max-width:58%;font-size:10px}.sm-consolidated-grid{grid-template-columns:1fr;gap:14px}.sm-key-tile{min-height:166px;padding:17px 18px}.sm-key-name{font-size:16px}.sm-key-pnl{margin-top:18px;font-size:27px}.sm-key-return{font-size:15px}}
    @media(max-width:1100px){.sm-pnl{min-height:292px}.sm-pnl .sm-metrics{grid-template-columns:repeat(3,minmax(0,1fr));row-gap:2px}.sm-pnl .sm-metric:nth-child(4){border-left:0}.sm-pnl-value{font-size:clamp(46px,6vw,56px)}}
    @media(max-width:700px){.sm-pnl{min-height:0;padding:16px 14px;border-radius:18px}.sm-pnl-heading{gap:9px}.sm-pnl-heading-icon{width:40px;height:40px;flex-basis:40px}.sm-pnl-heading-copy h2,.sm-pnl .sm-card-head h2{font-size:16px}.sm-pnl-heading-copy p{font-size:10px}.sm-pnl .sm-live-chip{height:30px;min-width:76px;font-size:10px}.sm-pnl-value{margin-top:12px;font-size:clamp(40px,11vw,50px)}.sm-pnl .sm-metrics{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:2px}.sm-pnl .sm-metric,.sm-pnl .sm-metric:nth-child(4){justify-content:flex-start;min-height:56px;padding:7px 6px;border-left:0;border-top:1px solid rgba(151,178,220,.18)}.sm-pnl .sm-metric:nth-child(1),.sm-pnl .sm-metric:nth-child(2){border-top:0}.sm-pnl .sm-metric:nth-child(even){border-left:1px solid rgba(151,178,220,.18)}.sm-pnl-metric-icon{width:32px;height:32px;flex-basis:32px}.sm-pnl .sm-metric b{font-size:14px}.sm-pnl .sm-metric span:not(.sm-pnl-metric-icon){font-size:9px}.sm-pnl .sm-card-foot{align-items:flex-start;line-height:1.4}.sm-backtest-card .sm-backtest{grid-template-columns:repeat(2,minmax(0,1fr))}.sm-backtest-card .sm-bt-cell b{font-size:12px}}
    @media(prefers-reduced-motion:reduce){.sm-loader-mark img,.sm-loader-ring,.sm-market .sm-dot,.sm-status-dot,.sm-pnl .sm-live-chip .sm-dot,.sm-key-tile.open{animation:none}}
  </style>
</head>
<body>
  ${navHtml}
  <main class="sm-page" id="shadowPage">
    <div class="sm-data-loader" id="monitorLoader" role="status" aria-live="polite"><div class="sm-loader-mark"><span class="sm-loader-ring"></span><img src="/public/images/logo.svg" alt=""></div><b>Loading strategy data</b><span>Checking live shadow runtime...</span></div>
    <div class="sm-shell" id="shadowMonitor">
      <header class="sm-head">
        <div>
          <div class="sm-title-row"><h1 class="sm-title" id="monitorTitle">Shadow Strategy Monitor</h1><span class="sm-shadow-badge">SHADOW MODE ONLY</span></div>
          <p class="sm-sub" id="monitorSubtitle">Simulated trades only. No real broker orders are placed.</p>
        </div>
        <div class="sm-head-actions">
          <div class="sm-market closed" id="marketStatus"><span class="sm-dot"></span><span>Checking market</span></div>
          <div class="sm-refresh-meta" id="refreshMeta">Last refreshed: connecting...</div>
          <a href="/strategies" class="sm-link-btn" style="text-decoration:none" title="Strategy Guide"><svg class="sm-icon" viewBox="0 0 24 24"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg><span>Strategies</span></a>
          <a href="/today" class="sm-link-btn" style="text-decoration:none" title="Today's Stock Picks"><svg class="sm-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>Picks</span></a>
          <button class="sm-consolidated-toggle" id="consolidatedToggle" type="button"><svg class="sm-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg><span>Consolidated P&amp;L</span></button>
          <button class="sm-refresh" id="refreshAll" type="button"><svg class="sm-icon" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v6h-6"/></svg>Refresh</button>
        </div>
      </header>
      <section class="sm-consolidated sm-consolidated-view" id="consolidatedView" hidden>
        <div class="sm-consolidated-toolbar"><div class="sm-consolidated-toolbar-title"><b id="consolidatedInstrumentTitle">Futures Consolidated</b><span id="consolidatedInstrumentMeta">All Futures shadow strategies</span></div><div class="sm-consolidated-instrument" role="tablist" aria-label="Consolidated instrument"><button type="button" class="active" data-consolidated-instrument="FUTURES">Futures</button><button type="button" data-consolidated-instrument="OPTIONS">Options</button></div></div>
        <div class="sm-movement-strip" id="bankNiftyMovement"></div>
        <div class="sm-winner-strip" id="consolidatedWinners"></div>
        <div class="sm-consolidated-groups" id="consolidatedGrid"></div>
      </section>
      <section class="sm-control" aria-label="Monitor controls">
        <div class="sm-card sm-control-box sm-field"><label for="underlyingSelect">Underlying</label><select class="sm-select" id="underlyingSelect"><option value="BANKNIFTY">BANKNIFTY</option><option value="NIFTY">NIFTY</option></select></div>
        <div class="sm-card sm-control-box sm-field strategy"><label for="strategySelect">Strategy</label><div class="sm-control-inner"><span class="sm-control-icon"><svg class="sm-icon" viewBox="0 0 24 24"><path d="M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20"/></svg></span><select class="sm-select" id="strategySelect"><option>Loading strategies...</option></select></div></div>
        <div class="sm-card sm-control-box sm-field sm-instrument-control"><label>Instrument</label><div class="sm-segment"><button type="button" class="active" data-instrument="FUTURES"><svg class="sm-icon" viewBox="0 0 24 24"><path d="M7 3v18m10-18v18M4 8h6v8H4m10-6h6v7h-6"/></svg><span>Futures</span></button><button type="button" data-instrument="OPTIONS"><svg class="sm-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg><span>Options</span></button></div></div>
      </section>
      <section class="sm-health">
        <article class="sm-card sm-health-card sm-health-trigger sm-system-card" id="healthStep" role="button" tabindex="0" aria-label="View detailed system health"><div class="sm-common-head"><div class="sm-common-title"><span class="sm-title-icon health" id="healthIcon"><svg class="sm-icon" viewBox="0 0 24 24"><path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z"/><path d="M4.5 12h3l1.5-3.2 2.4 7 2-4h3.7"/></svg></span><span>System Health</span></div><span class="sm-status-dot" aria-hidden="true"></span></div><div class="sm-health-value" id="healthValue">Checking</div><div class="sm-system-bottom"><span class="sm-health-note" id="healthNote">Waiting for real checks</span><span class="sm-health-action" id="healthAction">View Checks</span></div></article>
        <article class="sm-card sm-health-card sm-feed-card" id="feedStep"><div class="sm-common-head"><div class="sm-common-title"><span class="sm-title-icon feed" id="feedIcon"><svg class="sm-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01M11 6.5h7M11 17.5h7"/></svg></span><span>Server / Feed Status</span></div><span class="sm-status-dot" aria-hidden="true"></span></div><div class="sm-health-value" id="feedValue">Checking</div><div class="sm-feed-metrics"><span>Latest Tick<b id="feedLatestTick">--</b></span><span>Heartbeat<b id="feedHeartbeat">--</b></span><span>Latency<b id="feedLatency">--</b></span></div><div class="sm-feed-event">Last event: <b id="feedEvent">--</b></div></article>
        <article class="sm-card sm-health-card sm-backtest-card" id="backtestStep"><div class="sm-common-head"><div class="sm-common-title"><span class="sm-title-icon backtest"><svg class="sm-icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg></span><span>5Y Backtest Summary</span></div><span class="sm-status-dot" aria-hidden="true"></span></div><div class="sm-backtest" id="backtestSummary"><div class="sm-bt-cell"><span>5Y Return</span><b>--</b></div><div class="sm-bt-cell"><span>Net Backtest P&amp;L</span><b>--</b></div><div class="sm-bt-cell"><span>Win Rate</span><b>--</b></div><div class="sm-bt-cell"><span>Max Drawdown</span><b>--</b></div><div class="sm-bt-cell"><span>Avg Monthly Return</span><b>--</b></div><div class="sm-bt-cell"><span>Total Trades</span><b>--</b></div></div></article>
        <article class="sm-card sm-health-card sm-best-card" id="bestStep"><div class="sm-common-head"><div class="sm-common-title"><span class="sm-title-icon best"><svg class="sm-icon" viewBox="0 0 24 24"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/></svg></span><span>Best Performers</span></div></div><div class="sm-best-groups" id="bestPerformers"><div class="sm-best-group"><span>Best Today</span><b>--</b></div><div class="sm-best-group"><span>Best This Month</span><b>--</b></div><div class="sm-best-group"><span>Best This Year</span><b>--</b></div></div></article>
      </section>
      <section class="sm-main-grid">
        <article class="sm-card sm-pnl" id="pnlCard">
          <span class="sm-pnl-orbit" aria-hidden="true"></span>
          <svg class="sm-pnl-curve" viewBox="0 0 1200 260" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="smPnlCurve" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2448d8" stop-opacity=".08"/><stop offset=".55" stop-color="#18bb91" stop-opacity=".42"/><stop offset="1" stop-color="#24d68f" stop-opacity=".9"/></linearGradient></defs><path d="M0 235 C120 218 178 238 285 202 S455 208 555 164 S720 185 805 126 S1015 112 1200 34" fill="none" stroke="url(#smPnlCurve)" stroke-width="3"/><path d="M0 235 C120 218 178 238 285 202 S455 208 555 164 S720 185 805 126 S1015 112 1200 34 L1200 260 L0 260 Z" fill="url(#smPnlCurve)" opacity=".08"/></svg>
          <div class="sm-card-head">
            <div class="sm-pnl-heading"><span class="sm-pnl-heading-icon"><svg class="sm-icon" viewBox="0 0 24 24"><path d="m4 17 6-6 4 4 6-8"/><path d="M15 7h5v5"/></svg></span><div class="sm-pnl-heading-copy"><h2>Shadow Live P&amp;L</h2><p>Simulated trades only. No real broker orders are placed.</p></div></div>
            <span class="sm-live-chip" id="pnlLiveChip"><span class="sm-dot"></span><span>CHECKING</span></span>
          </div>
          <div class="sm-pnl-value" id="totalPnl">&#8377;0.00</div>
          <div class="sm-pnl-sub"><span class="sm-pnl-state" id="pnlState">NO TRADE</span></div>
          <div class="sm-metrics" id="pnlMetrics"></div>
          <div class="sm-card-foot"><span class="sm-pnl-foot-icon"><svg class="sm-icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg></span><span id="pnlFoot">Current day only. Waiting for live shadow data.</span></div>
        </article>
      </section>
      <section class="sm-bottom-grid">
        <article class="sm-card sm-table-card sm-trade-card"><div class="sm-card-head sm-card-pad"><div class="sm-heading-with-icon"><span class="sm-section-icon trade"><svg class="sm-icon" viewBox="0 0 24 24"><path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/><path d="M8 13h3m2 0h3m-8 3h3"/></svg></span><h2 id="tradeTitle">Today's Trade History <small>(Today Only)</small></h2></div><button class="sm-history-btn" id="openHistory" type="button">View Full History</button></div><div class="sm-table-wrap"><table class="sm-table" id="tradeTable"></table></div><div class="sm-section-helper">This table shows today's trades only. Full history is available in View Full History.</div></article>
        <article class="sm-card sm-table-card sm-detail-card" id="candleLogs"><div class="sm-card-head sm-card-pad"><div class="sm-heading-with-icon"><span class="sm-section-icon candle"><svg class="sm-icon" viewBox="0 0 24 24"><path d="M7 3v18M17 3v18M4 8h6v8H4m10-6h6v7h-6"/></svg></span><h2>Candle Logs <small>(Latest 5)</small></h2></div><button class="sm-link-btn" id="openCandles" type="button">View All</button></div><div class="sm-table-wrap"><table class="sm-table candles" id="candleTable"></table></div><div class="sm-section-helper">Candle logs are recorded for active timeframes. Latest 5 entries shown.</div></article>
      </section>
      <article class="sm-card sm-log-card sm-console-card sm-console-full"><div class="sm-card-head sm-card-pad"><div class="sm-heading-with-icon"><span class="sm-section-icon console"><svg class="sm-icon" viewBox="0 0 24 24"><path d="m7 8 4 4-4 4m6 0h4"/></svg></span><h2>Server Logs <small>(Live)</small></h2></div><div class="sm-log-actions"><span class="sm-log-live"><span class="sm-dot"></span>Updates every minute</span><button class="sm-resume" id="pauseLogs" type="button">Pause</button><button class="sm-resume" id="resumeLogs" type="button" hidden>Resume</button></div></div><div class="sm-log-console" id="logConsole"><div class="sm-muted">Loading server logs...</div></div></article>
      <p class="sm-footer-note">Shadow mode trades are not executed in the market. All P&amp;L values are hypothetical.</p>
    </div>
  </main>
  <div class="sm-modal" id="historyModal" role="dialog" aria-modal="true" aria-labelledby="historyTitle"><div class="sm-modal-panel"><div class="sm-modal-head"><h2 id="historyTitle">Shadow Trade History</h2><button class="sm-close" id="closeHistory" type="button" aria-label="Close">&times;</button></div><div class="sm-history-tabs"><button class="active" data-period="DAILY">Daily</button><button data-period="TRADES">Trades</button><button data-period="WEEKLY">Weekly</button><button data-period="YEARLY">Yearly</button></div><div class="sm-history-body" id="historyBody"></div></div></div>
  <div class="sm-modal" id="candleModal" role="dialog" aria-modal="true" aria-labelledby="candleModalTitle"><div class="sm-modal-panel"><div class="sm-modal-head"><div><h2 id="candleModalTitle">Today's Candle Log</h2><div class="sm-health-note" id="candleModalSub">Selected shadow strategy</div></div><button class="sm-close" id="closeCandles" type="button" aria-label="Close">&times;</button></div><div class="sm-history-body"><div class="sm-table-wrap" style="max-height:70vh"><table class="sm-table candles sm-candle-full" id="candleFullTable"></table></div></div></div></div>
  <div class="sm-modal" id="healthModal" role="dialog" aria-modal="true" aria-labelledby="healthModalTitle"><div class="sm-modal-panel sm-health-panel"><div class="sm-modal-head"><div><h2 id="healthModalTitle">System Health Evidence</h2><div class="sm-health-note">Live process, scheduler, feed, execution, storage and token checks</div></div><button class="sm-close" id="closeHealth" type="button" aria-label="Close">&times;</button></div><div class="sm-health-summary"><strong class="sm-health-state" id="healthModalState">CHECKING</strong><div><b id="healthModalSummary">Running checks</b><span>Critical services must pass before the monitor reports healthy.</span></div><div class="sm-health-checked" id="healthModalChecked">Checked: --</div></div><div class="sm-health-list" id="healthDetails"></div></div></div>
  <script>
    (function(){
      var state={underlying:localStorage.getItem("zsShadowUnderlying")||"BANKNIFTY",strategy:localStorage.getItem("zsShadowStrategy")||"drishti",instrument:localStorage.getItem("zsShadowInstrument")||"FUTURES",performancePeriod:localStorage.getItem("zsShadowPerformancePeriod")||"TODAY",viewMode:"dashboard",request:0,data:null,logStick:true};
      el("underlyingSelect").value=state.underlying;
      var shadowFetch=window.fetch.bind(window);window.fetch=function(input,init){var url=String(input);if(url.indexOf("/api/shadow-monitor?")===0&&url.indexOf("underlying=")<0)input=url+"&underlying="+encodeURIComponent(state.underlying);return shadowFetch(input,init)};
      el("underlyingSelect").addEventListener("change",function(){state.underlying=this.value;localStorage.setItem("zsShadowUnderlying",state.underlying);state.userRequestedLoad=true;load(true)});
      var activeController=null;
      function el(id){return document.getElementById(id)}
      function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]})}
      function value(v,digits){return v==null||!isFinite(Number(v))?"--":Number(v).toLocaleString("en-IN",{minimumFractionDigits:digits||0,maximumFractionDigits:digits==null?2:digits})}
      function points(v){if(v==null||!isFinite(Number(v)))return"--";var n=Number(v);return(n>0?"+":"")+value(n)+" pts"}
      function money(v){if(v==null||!isFinite(Number(v)))return"Not available";var n=Number(v);return(n>0?"+":n<0?"-":"")+"&#8377;"+Math.abs(n).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}
      function compactMoney(v,negative){if(v==null||!isFinite(Number(v)))return"--";var n=Math.abs(Number(v));var unit=n>=10000000?(n/10000000).toFixed(2)+" Cr":n>=100000?(n/100000).toFixed(2)+" L":n>=1000?(n/1000).toFixed(1)+" K":n.toFixed(0);return(negative?"-":Number(v)<0?"-":Number(v)>0?"+":"")+"&#8377;"+unit}
      function btValue(v,unit){return unit==="points"?(v==null?"--":value(v)+" pts"):money(v)}
      function pct(v){return v==null||!isFinite(Number(v))?"--":Number(v).toFixed(2)+"%"}
      function dt(v){if(!v)return"--";var d=new Date(v);return isNaN(d.getTime())?esc(v):d.toLocaleTimeString("en-IN",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",second:"2-digit"})}
      function clsPnl(v){return Number(v)>0?"sm-positive":Number(v)<0?"sm-negative":"sm-muted"}
      function metricIcon(label){var icons={"Realized P&L":'<svg class="sm-icon" viewBox="0 0 24 24"><ellipse cx="9" cy="6" rx="5" ry="3"/><path d="M4 6v5c0 1.7 2.2 3 5 3s5-1.3 5-3V6M4 11v5c0 1.7 2.2 3 5 3 1 0 1.9-.2 2.7-.5"/><ellipse cx="17" cy="16" rx="4" ry="2.5"/><path d="M13 16v3c0 1.4 1.8 2.5 4 2.5s4-1.1 4-2.5v-3"/></svg>',"Unrealized P&L":'<svg class="sm-icon" viewBox="0 0 24 24"><path d="M4 7h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12"/><path d="M16 12h5v4h-5a2 2 0 0 1 0-4Z"/></svg>',"Today Trades":'<svg class="sm-icon" viewBox="0 0 24 24"><path d="M4 20V13h4v7H4Zm6 0V8h4v12h-4Zm6 0V4h4v16h-4Z"/><path d="M2 20h20"/></svg>',"Win Rate":'<svg class="sm-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m12 12 7-7M16 5h3v3"/></svg>',"Open Position":'<svg class="sm-icon" viewBox="0 0 24 24"><path d="M4 8h16v12H4zM9 8V5h6v3M4 12h16"/><path d="M10 12v2h4v-2"/></svg>',"Last Update":'<svg class="sm-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'};return icons[label]||icons["Today Trades"]}
      function metric(label,val,cls){return'<div class="sm-metric"><span class="sm-pnl-metric-icon" aria-hidden="true">'+metricIcon(label)+'</span><div class="sm-pnl-metric-copy"><span>'+esc(label)+'</span><b class="'+(cls||"")+'">'+val+'</b></div></div>'}
      function renderStrategies(list){var select=el("strategySelect");var html=(list||[]).map(function(s){return'<option value="'+esc(s.id)+'" '+(s.id===state.strategy?"selected":"")+'>'+esc(s.name)+'</option>'}).join("");select.innerHTML=html;if(!list.some(function(s){return s.id===state.strategy})){state.strategy=list[0]?list[0].id:"";select.value=state.strategy}var selected=(list||[]).find(function(s){return s.id===state.strategy});var allowed=selected&&selected.instruments||["FUTURES","OPTIONS"];if(allowed.indexOf(state.instrument)<0){state.instrument=allowed[0]||"FUTURES";localStorage.setItem("zsShadowInstrument",state.instrument)}document.querySelectorAll(".sm-segment [data-instrument]").forEach(function(button){var enabled=allowed.indexOf(button.dataset.instrument)>=0;button.disabled=!enabled;button.title=enabled?"":"Not available for this strategy";button.classList.toggle("active",button.dataset.instrument===state.instrument)})}
      function renderHealth(d){var good=d.health.connected;var runtimeGood=good&&!/OFFLINE|ERROR|BLOCKED/i.test(d.runtime.status||"");var candles=d.candles||[];var count=function(tf){return candles.filter(function(c){return String(c.timeframe).toLowerCase()===tf}).length};el("healthStep").classList.toggle("good-step",good);el("feedStep").classList.toggle("good-step",good);el("runtimeStep").classList.toggle("good-step",runtimeGood);el("healthIcon").className="sm-health-icon health "+(good?"good":"warn");el("healthValue").textContent=d.health.overall;el("healthNote").textContent=good?"All systems operational":"Heartbeat needs attention";el("feedIcon").className="sm-health-icon feed "+(good?"good":"warn");el("feedValue").textContent=d.health.feed;el("feedNote").textContent=good?"Market data active":"Market data unavailable";el("runtimeValue").textContent=d.runtime.status;el("runtimeNote").textContent=d.runtime.status+" | "+d.runtime.version;el("candleLatest").textContent="Latest: "+(candles[0]?.time||"--");el("count1m").textContent=count("1m");el("count5m").textContent=count("5m");el("count15m").textContent=count("15m");var b=d.backtest;el("backtestStep").classList.toggle("good-step",!!b);el("backtestSummary").innerHTML='<div class="sm-health-icon backtest '+(b?"good":"warn")+'"><svg class="sm-icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="'+(b?"m8.5 12 2.2 2.2 4.8-5":"M12 8v5m0 3h.01")+'"/></svg></div>'+(b?'<div class="sm-bt-cell"><span>5Y Backtest</span><b title="'+esc((b.coverage||"5Y")+(b.modelled?" · Modelled":" · Historical")+" · "+(b.methodology||b.source))+'">'+esc(b.coverage||"5Y")+'</b></div><div class="sm-bt-cell"><span>5Y P&amp;L</span><b class="'+clsPnl(b.pnl)+'">'+compactMoney(b.pnl,false)+'</b></div><div class="sm-bt-cell"><span>Win Rate</span><b>'+pct(b.winRate)+'</b></div><div class="sm-bt-cell"><span>Max Drawdown</span><b class="sm-negative">'+compactMoney(b.maxDrawdown,true)+'</b></div><div class="sm-bt-cell"><span>Avg Monthly</span><b>'+compactMoney(b.avgMonthlyPnl,false)+'</b></div>':'<div class="sm-bt-cell" style="grid-column:2/-1"><span>5Y Backtest Summary</span><b>No strategy-specific result available</b></div>')}
      function renderPerformance(d){var p=d.performance&&d.performance.periods&&d.performance.periods[state.performancePeriod];if(!p)return;var leader=function(row,label){if(!row)return'<div class="sm-performance-metric"><span>'+label+'</span><b>--</b><small>No qualifying trades</small></div>';return'<div class="sm-performance-metric"><span>'+label+'</span><b class="'+clsPnl(row.returnPct)+'">'+pct(row.returnPct)+'</b><small>'+esc(row.strategyName)+' · '+compactMoney(row.pnl,false)+'</small></div>'};el("performanceGrid").innerHTML='<div class="sm-performance-metric"><span>Average Return</span><b class="'+clsPnl(p.averageReturnPct)+'">'+pct(p.averageReturnPct)+'</b><small>'+value(p.strategiesCompared,0)+' strategy/instrument results</small></div>'+leader(p.bestFutures,"Best Futures")+leader(p.bestOptions,"Best Options")+'<div class="sm-performance-metric"><span>Capital Deployed</span><b>'+compactMoney(p.capitalUsed,false).replace(/^\\+/,"")+'</b><small>Combined net P&amp;L '+compactMoney(p.pnl,false)+'</small></div>';el("performanceScope").textContent=(p.source==="LIVE"?"Live":"Backtest")+" · "+p.label;el("performanceFormula").textContent=d.performance.definition;document.querySelectorAll("[data-performance-period]").forEach(function(b){b.classList.toggle("active",b.dataset.performancePeriod===state.performancePeriod)})}
      function renderSummary(d){var s=d.summary;var movement=d.market&&d.market.bankNiftyMovement||{};var benchmark=movement.futures||movement;var total=Number(s.totalPnl);var hasOpen=Number(s.openPositions)>0;var marketOpen=d.market&&d.market.status==="OPEN";var card=el("pnlCard");card.classList.toggle("profit",total>0);card.classList.toggle("loss",total<0);el("totalPnl").innerHTML=money(s.totalPnl);var stateText=total>0?"PROFIT":total<0?"LOSS":hasOpen?"LIVE POSITION":"NO TRADE";el("pnlState").textContent=stateText;var liveChip=el("pnlLiveChip");var liveState=marketOpen||hasOpen;liveChip.className="sm-live-chip "+(liveState?"is-live":"is-closed");liveChip.querySelector("span:last-child").textContent=hasOpen?"POSITION ACTIVE":marketOpen?"LIVE":"MARKET CLOSED";el("pnlMetrics").innerHTML=metric("Realized P&L",money(s.realizedPnl),clsPnl(s.realizedPnl))+metric("Unrealized P&L",money(s.unrealizedPnl),clsPnl(s.unrealizedPnl))+metric("Futures Move",points(benchmark.movementPoints),clsPnl(benchmark.movementPoints))+metric("Futures Range",points(benchmark.rangePoints))+metric("Strategy Captured",points(s.capturedPoints),clsPnl(s.capturedPoints))+metric("Today Trades",value(s.trades,0))+metric("Win Rate",pct(s.winRate))+metric("Open Position",value(s.openPositions,0))+metric("Last Update",dt(s.lastUpdatedAt));var strategy=d.identity.strategyName;var instrument=d.identity.instrumentType==="OPTIONS"?"options":"futures";el("pnlFoot").textContent=hasOpen?"Live shadow P&L updates continuously. Benchmark: front-month BANKNIFTY futures.":Number(s.trades)>0?"Futures captured points use the tradable futures benchmark; Options use premium points.":strategy+" has no "+instrument+" shadow entry today. Current P&L is \u20b90.00."}
      function renderTrades(d){var option=d.identity.instrumentType==="OPTIONS";el("tradeTitle").innerHTML="Today's Trade History <small>(Today Only &middot; "+(option?"Options":"Futures")+")</small>";var headers=["Time","Instrument","Contract","Order Flow","Entry","Exit","Qty","Net P&L","Status"];var trades=d.trades||[];var rows=trades.slice(0,7).map(function(t){var contract=esc(t.contract||"--");var action=String(t.action||"--").toUpperCase();var exitAction=String(t.exitAction||"--").toUpperCase();var status=esc(t.status||"--");var flow='<span class="sm-order-flow"><span class="sm-action '+action.toLowerCase()+'">'+esc(action)+'</span><span class="sm-flow-arrow">&rarr;</span><span class="sm-action '+exitAction.toLowerCase()+'">'+esc(exitAction)+'</span></span>';var cells=[esc(t.time||"--"),esc(t.instrument||"--"),'<span class="sm-side '+contract.toLowerCase()+'">'+contract+"</span>",flow,value(t.entry),value(t.exit),value(t.quantity,0),'<span class="'+clsPnl(t.pnl)+'">'+money(t.pnl)+"</span>",'<span class="sm-tag '+status.toLowerCase()+'">'+status+"</span>"];return"<tr>"+cells.map(function(c){return"<td>"+c+"</td>"}).join("")+"</tr>"}).join("");el("tradeTable").innerHTML="<thead><tr>"+headers.map(function(h){return"<th>"+esc(h)+"</th>"}).join("")+"</tr></thead><tbody>"+(rows||'<tr><td class="sm-table-empty" colspan="9">No shadow trades recorded today for this strategy and instrument.</td></tr>')+"</tbody>"}
      function candleState(raw){var key=String(raw||"watching").toLowerCase().replace(/_/g,"-");var labels={"pre-ref":"Pre-market setup","marked-ref":"Range marked","stale-signal-skip":"Signal skipped","no-trade":"No trade","wait-c2":"Watching","exit-eod":"EOD Exit","eod-exit":"EOD Exit","sl-hit":"SL Hit","reentry":"Re-entry","re-entry":"Re-entry","re-exit":"Re-exit"};return{key:key,label:labels[key]||key.split("-").map(function(x){return x?x[0].toUpperCase()+x.slice(1):x}).join(" ")}}
      function candleCells(c){var st=candleState(c.status);var side=String(c.side||"").toUpperCase();var sideHtml=/^(CE|PE)$/.test(side)?'<span class="sm-side '+side.toLowerCase()+'">'+side+"</span>":"--";var rowClass=/entry/.test(st.key)&&!/exit/.test(st.key)?"candle-entry":/sl/.test(st.key)?"candle-sl":/exit/.test(st.key)?"candle-exit":/trail/.test(st.key)?"candle-trail":"candle-watch";return{st:st,side:sideHtml,rowClass:rowClass}}
      function candleTable(rows,compact){var body=(rows||[]).map(function(c){var x=candleCells(c);var cells=compact?[esc(c.time||"--"),'<span class="sm-state '+x.st.key+'">'+esc(x.st.label)+"</span>",x.side,value(c.close),'<span class="'+clsPnl(c.pnl)+'">'+(c.pnl==null?"--":money(c.pnl))+"</span>",'<span title="'+esc(c.note)+'">'+esc(c.note)+"</span>"]:[value(c.number,0),esc(c.time||"--"),'<span class="sm-state '+x.st.key+'">'+esc(x.st.label)+"</span>",x.side,value(c.open),value(c.high),value(c.low),value(c.close),value(c.entry),value(c.stopLoss),'<span class="'+clsPnl(c.pnl)+'">'+(c.pnl==null?"--":money(c.pnl))+"</span>",'<span title="'+esc(c.note)+'">'+esc(c.note)+"</span>"];return'<tr class="'+x.rowClass+'">'+cells.map(function(v,i){return'<td class="'+(i===cells.length-1?"note":"")+'">'+v+"</td>"}).join("")+"</tr>"}).join("");var headers=compact?["Time","State","Side","Close","P&L","Note"]:["#","Time","State","Side","Open","High","Low","Close","Entry","SL","P&L","Note"];return"<thead><tr>"+headers.map(function(h){return"<th>"+h+"</th>"}).join("")+"</tr></thead><tbody>"+(body||'<tr><td class="sm-table-empty" colspan="'+headers.length+'">No relevant candle logs recorded for the selected strategy.</td></tr>')+"</tbody>"}
      function renderCandles(d){var rows=d.candles||[];el("candleTable").innerHTML=candleTable(rows.slice(0,5),true);el("candleFullTable").innerHTML=candleTable(rows,false);el("candleModalTitle").textContent="Today's Candle Log - "+d.identity.strategyName;el("candleModalSub").textContent=d.identity.instrumentType+" | "+d.identity.tradeDate+" | "+rows.length+" candles"}
      function renderLogs(d){var box=el("logConsole");var nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<28;var rows=(d.logs||[]).map(function(l){return'<div class="sm-log-line"><span>'+esc(l.time||"--:--:--")+'</span><b class="'+esc(l.level)+'">'+esc(l.level)+'</b><span>'+esc(l.message)+'</span></div>'}).join("");box.innerHTML=rows||'<div class="sm-muted">No server log entries available.</div>';if(state.logStick&&nearBottom)box.scrollTop=box.scrollHeight;el("resumeLogs").hidden=state.logStick}
      function renderSection(name,fn){try{fn()}catch(error){console.error("Shadow monitor "+name+" render failed",error)}}
      function consolidatedKey(t){return [t.underlying||state.underlying,t.strategyId,t.strategyVersion,t.instrumentType,t.executionMode,t.tradeDate].join("|")}
      function tileClass(t){var marketClosed=state.data&&state.data.market&&state.data.market.status!=="OPEN";if(t.positionState==="MISSED")return"missed";if(t.positionState==="ERROR")return"error";if(t.positionState==="NOT CONFIGURED")return"no-trade";if(t.positionState==="STALE"||marketClosed&&t.positionState==="OPEN")return"stale";if(t.positionState==="OPEN"){var n=Number(t.pnl);return"open "+(n<0?"open-loss":n>0?"open-profit":"open-flat")}return Number(t.pnl)>0?"profit":Number(t.pnl)<0?"loss":"no-trade"}
      function tileStateLabel(t){var marketClosed=state.data&&state.data.market&&state.data.market.status!=="OPEN";if(t.positionState==="MISSED")return"MISSED";if(t.positionState==="NOT CONFIGURED")return"NOT CONFIGURED";if(t.positionState==="ERROR"||t.positionState==="STALE")return"BLOCKED";if(t.positionState==="OPEN")return marketClosed?"EOD PENDING":"RUNNING";if(t.positionState==="CLOSED")return"CLOSED";if(t.positionState==="NO TRADE")return"NO TRADE";return"WAITING"}
      function rankCard(row,label,icon){if(!row)return'<article class="sm-winner-card"><div class="sm-winner-period"><span class="star">'+esc(icon||"★")+'</span>'+esc(label)+'</div><div class="sm-winner-empty">No completed trades</div></article>';var positive=Number(row.returnPct)>=0;return'<article class="sm-winner-card"><div class="sm-winner-period"><span class="star">'+esc(icon||"★")+'</span>'+esc(label)+'</div><div class="sm-winner-main"><div class="sm-winner-name">'+esc(row.strategyName)+'<span class="sm-winner-type">'+esc(row.instrument==="FUTURES"?"FUT":"OPT")+'</span></div><div class="sm-winner-values"><span class="sm-winner-return '+(positive?"sm-positive":"sm-negative")+'">'+pct(row.returnPct)+'</span><span class="sm-winner-pnl">'+money(row.pnl)+' · '+money(row.capitalUsed).replace(/^\\+/,"")+' capital</span></div></div></article>'}
      function consolidatedTileMarkup(t){var key=consolidatedKey(t);return'<button class="sm-key-tile" type="button" data-tile-key="'+esc(key)+'" data-strategy="'+esc(t.strategyId)+'" data-instrument="'+esc(t.instrumentType)+'"><span class="sm-key-select-mark" aria-hidden="true" title="Top performer today">&#9733;</span><div class="sm-key-head"><span class="sm-key-name"></span><span class="sm-key-instrument"></span></div><div class="sm-key-pnl"></div><div class="sm-key-return"></div><div class="sm-key-captured"></div><svg class="sm-key-spark" viewBox="0 0 320 58" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,43 18,38 34,42 50,34 68,36 86,30 103,33 120,28 138,31 156,24 175,27 193,20 211,23 230,17 248,19 266,12 284,15 302,8 320,4"/></svg><div class="sm-key-bottom"><span class="sm-key-trades"></span><span class="sm-key-state"></span></div></button>'}
      function consolidatedGroupMarkup(type,tiles){var label=type==="FUTURES"?"Futures":"Options";return'<section class="sm-instrument-group '+type.toLowerCase()+'" data-instrument-group="'+type+'"><header class="sm-instrument-group-head"><h2 class="sm-instrument-group-title">'+label+'</h2><span class="sm-instrument-group-summary" data-group-summary="'+type+'"></span></header><div class="sm-consolidated-grid">'+tiles.map(consolidatedTileMarkup).join("")+'</div></section>'}
      function renderConsolidated(d){var c=d.consolidated||{};var tiles=c.tiles||[];var periods=d.performance&&d.performance.periods||{};var m=c.bankNiftyMovement||d.market&&d.market.bankNiftyMovement||{};var selectedInstrument=state.instrument==="OPTIONS"?"OPTIONS":"FUTURES";var selectedShort=selectedInstrument==="OPTIONS"?"OPT":"FUT";var selectedLabel=selectedInstrument==="OPTIONS"?"Options":"Futures";document.querySelectorAll("[data-consolidated-instrument]").forEach(function(b){b.classList.toggle("active",b.dataset.consolidatedInstrument===selectedInstrument)});el("consolidatedInstrumentTitle").textContent=selectedLabel+" Consolidated";el("consolidatedInstrumentMeta").textContent="All "+selectedLabel+" shadow strategies";var moveClass=Number(m.movementPoints)>0?"positive":Number(m.movementPoints)<0?"negative":"";el("bankNiftyMovement").innerHTML='<div class="sm-movement-item"><span>BANKNIFTY Movement</span><b class="'+moveClass+'">'+points(m.movementPoints)+'</b><small>Open '+value(m.open)+' &rarr; '+value(m.current)+'</small></div><div class="sm-movement-item"><span>Intraday Range</span><b>'+points(m.rangePoints)+'</b><small>Low '+value(m.low)+' &middot; High '+value(m.high)+'</small></div><div class="sm-movement-item"><span>F&amp;O Session</span><b>'+esc(m.session||"09:15 - 15:40")+'</b><small>Official close 3:40 PM</small></div><div class="sm-movement-item"><span>Measurement</span><b>Net points</b><small>FUT underlying &middot; OPT premium</small></div>';var bestDay=selectedInstrument==="OPTIONS"?"bestOptions":"bestFutures";var worstDay=selectedInstrument==="OPTIONS"?"worstOptions":"worstFutures";el("consolidatedWinners").innerHTML=rankCard(periods.TODAY&&periods.TODAY[bestDay],selectedShort+" Winner Day","&#9733;")+rankCard(periods.TODAY&&periods.TODAY[worstDay],selectedShort+" Loser Day","&#9660;")+rankCard(periods.MONTH&&periods.MONTH[bestDay],selectedShort+" Winner Month","&#9733;")+rankCard(periods.MONTH&&periods.MONTH[worstDay],selectedShort+" Loser Month","&#9660;");var grid=el("consolidatedGrid");var visibleTiles=tiles.filter(function(t){return t.instrumentType===selectedInstrument});if(!visibleTiles.length){grid.innerHTML='<div class="sm-consolidated-empty"><b>No '+selectedLabel+' shadow strategies</b>Configure at least one '+selectedLabel+' shadow strategy to view consolidated P&amp;L.</div>';return}var todayBest=periods.TODAY&&periods.TODAY[bestDay];var top=todayBest?visibleTiles.find(function(t){return t.strategyId===todayBest.strategyId&&t.instrumentType===todayBest.instrument}):null;var topKey=top?consolidatedKey(top):"";var expected=selectedInstrument+"|"+visibleTiles.map(consolidatedKey).join(",");if(grid.dataset.keys!==expected){grid.dataset.keys=expected;grid.innerHTML=consolidatedGroupMarkup(selectedInstrument,visibleTiles)}visibleTiles.forEach(function(t){var key=consolidatedKey(t);var tile=grid.querySelector('[data-tile-key="'+CSS.escape(key)+'"]');if(!tile)return;var cls=tileClass(t);var selected=t.strategyId===state.strategy&&t.instrumentType===state.instrument;var topPerformer=key===topKey&&t.positionState!=="OPEN";var previousPnl=Number(tile.dataset.pnl);var nextPnl=Number(t.pnl);var displayPnl=Number.isFinite(nextPnl)?nextPnl:0;var shouldFlash=t.positionState==="OPEN"&&Number.isFinite(previousPnl)&&Number.isFinite(displayPnl)&&previousPnl!==displayPnl;var flashClass=shouldFlash?(displayPnl>previousPnl?"flash-up":"flash-down"):"";tile.className="sm-key-tile "+cls+(selected?" selected":"")+(topPerformer?" top-performer":"");if(flashClass){void tile.offsetWidth;tile.classList.add(flashClass)}tile.dataset.pnl=String(displayPnl);tile.querySelector(".sm-key-name").textContent=t.strategyName;tile.querySelector(".sm-key-instrument").textContent=t.instrumentType==="FUTURES"?"FUT":"OPT";tile.querySelector(".sm-key-pnl").innerHTML=money(displayPnl);tile.querySelector(".sm-key-return").textContent=t.positionState==="NOT CONFIGURED"?"Not configured for "+(t.underlying||state.underlying):t.positionState==="MISSED"?"Trigger missed":t.positionState==="ERROR"||t.positionState==="STALE"?"Needs attention":t.returnPct==null?"0.00% return":pct(t.returnPct)+" return";var captured=tile.querySelector(".sm-key-captured");captured.className="sm-key-captured "+(Number(t.capturedPoints)>0?"positive":Number(t.capturedPoints)<0?"negative":"");captured.textContent=t.capturedPoints==null?"Captured --":"Captured "+points(t.capturedPoints);tile.querySelector(".sm-key-trades").textContent=value(t.trades,0)+" "+(Number(t.trades)===1?"trade":"trades");var stateNode=tile.querySelector(".sm-key-state");var stateLabel=tileStateLabel(t);stateNode.className="sm-key-state "+stateLabel.toLowerCase();stateNode.textContent=stateLabel;tile.title=(topPerformer?"Top performer today | ":"")+t.strategyName+" "+t.instrumentType+" | "+stateLabel+" | Captured "+points(t.capturedPoints)+" | P&L "+money(displayPnl)+" | Allocated capital "+value(t.capitalDeployed,0)});var total=visibleTiles.reduce(function(sum,t){return sum+(Number(t.pnl)||0)},0);var trades=visibleTiles.reduce(function(sum,t){return sum+(Number(t.trades)||0)},0);var summary=grid.querySelector('[data-group-summary="'+selectedInstrument+'"]');if(summary)summary.textContent=visibleTiles.length+" strategies · "+money(total)+" · "+trades+" trades"}
      function renderMovementContext(d){var c=d.consolidated||{};var m=c.bankNiftyMovement||d.market&&d.market.bankNiftyMovement||{};var cash=m.cash||{};var fut=m.futures||m;var regime=fut.regime||m.regime||{};var cashClass=Number(cash.movementPoints)>0?"positive":Number(cash.movementPoints)<0?"negative":"";var futClass=Number(fut.movementPoints)>0?"positive":Number(fut.movementPoints)<0?"negative":"";el("bankNiftyMovement").innerHTML='<div class="sm-movement-item"><span>Cash Move</span><b class="'+cashClass+'">'+points(cash.movementPoints)+'</b><small>Open '+value(cash.open)+' &rarr; '+value(cash.current)+'</small></div><div class="sm-movement-item"><span>Cash Range</span><b>'+points(cash.rangePoints)+'</b><small>Low '+value(cash.low)+' &middot; High '+value(cash.high)+'</small></div><div class="sm-movement-item"><span>Futures Move</span><b class="'+futClass+'">'+points(fut.movementPoints)+'</b><small>'+esc(fut.symbol||"BANKNIFTY FUT")+'</small></div><div class="sm-movement-item"><span>Futures Range</span><b>'+points(fut.rangePoints)+'</b><small>Low '+value(fut.low)+' &middot; High '+value(fut.high)+'</small></div><div class="sm-movement-item"><span>Market Regime</span><b>'+esc(regime.label||"--")+'</b><small>'+value(regime.directionality)+'% directional &middot; '+esc(regime.suggestedMode||"--")+'</small></div><div class="sm-movement-item"><span>Measurement</span><b>Futures benchmark</b><small>Options premium &middot; cash reference</small></div>'}
      function setViewMode(mode){state.viewMode=mode;var consolidated=mode==="consolidated";el("shadowMonitor").classList.toggle("sm-consolidated-mode",consolidated);el("shadowPage").classList.toggle("sm-consolidated-page",consolidated);el("consolidatedView").hidden=!consolidated;el("monitorTitle").textContent=consolidated?"Consolidated Shadow P&L":"Shadow Strategy Monitor";el("monitorSubtitle").textContent=consolidated?"Today's P&L across all shadow strategies and instruments":"Simulated trades only. No real broker orders are placed.";el("consolidatedToggle").querySelector("span").textContent=consolidated?"Back to Dashboard":"Consolidated P&L";if(consolidated&&state.data){renderConsolidated(state.data);renderMovementContext(state.data)}if(refreshTimer)scheduleRefresh();window.scrollTo({top:0,behavior:"auto"})}
      function render(d){state.data=d;state.instrument=d.identity.instrumentType||state.instrument;localStorage.setItem("zsShadowInstrument",state.instrument);renderSection("strategies",function(){renderStrategies(d.strategies)});renderSection("trades",function(){renderTrades(d)});renderSection("candles",function(){renderCandles(d)});renderSection("health",function(){renderHealth(d);el("healthAction").textContent="View Checks"});renderSection("summary",function(){renderSummary(d)});renderSection("logs",function(){renderLogs(d)});renderSection("consolidated",function(){renderConsolidated(d);renderMovementContext(d)});var m=el("marketStatus");m.className="sm-market "+(d.market.status==="OPEN"?"open":"closed");m.querySelector("span:last-child").textContent="Market "+(d.market.status==="OPEN"?"Open":"Closed");el("refreshMeta").textContent="Last refreshed: "+dt(d.refreshedAt);document.querySelectorAll(".sm-segment [data-instrument]").forEach(function(b){b.classList.toggle("active",b.dataset.instrument===state.instrument)});el("shadowMonitor").classList.remove("sm-loading");el("monitorLoader").classList.remove("active")}
      async function load(trigger){var interactive=trigger===true||!!(trigger&&trigger.type)||state.userRequestedLoad===true;state.userRequestedLoad=false;var seq=++state.request;if(activeController)activeController.abort();activeController=new AbortController();if(interactive){el("monitorLoader").classList.add("active");el("shadowMonitor").classList.add("sm-loading")}try{var url="/api/shadow-monitor?strategy="+encodeURIComponent(state.strategy)+"&instrument="+encodeURIComponent(state.instrument);var r=await fetch(url,{cache:"no-store",credentials:"same-origin",signal:activeController.signal});if(!r.ok)throw new Error("HTTP "+r.status);var d=await r.json();if(seq!==state.request)return;if(!d.ok)throw new Error(d.error||"Monitor unavailable");render(d)}catch(e){if(e.name==="AbortError")return;el("refreshMeta").textContent="Refresh failed: "+e.message;el("shadowMonitor").classList.remove("sm-loading");el("monitorLoader").classList.remove("active")}}
      el("strategySelect").addEventListener("change",function(){state.userRequestedLoad=true},{capture:true});document.querySelectorAll("[data-instrument]").forEach(function(button){button.addEventListener("click",function(){state.userRequestedLoad=true},{capture:true})});
      el("strategySelect").addEventListener("change",function(){state.strategy=this.value;var selected=state.data&&state.data.strategies&&state.data.strategies.find(function(s){return s.id===state.strategy});var allowed=selected&&selected.instruments||["FUTURES","OPTIONS"];if(allowed.indexOf(state.instrument)<0)state.instrument=allowed[0]||"FUTURES";localStorage.setItem("zsShadowStrategy",state.strategy);localStorage.setItem("zsShadowInstrument",state.instrument);load()});document.querySelectorAll("[data-instrument]").forEach(function(b){b.addEventListener("click",function(){if(this.disabled)return;state.instrument=this.dataset.instrument;localStorage.setItem("zsShadowInstrument",state.instrument);load()})});document.querySelectorAll("[data-performance-period]").forEach(function(b){b.addEventListener("click",function(){state.performancePeriod=this.dataset.performancePeriod;localStorage.setItem("zsShadowPerformancePeriod",state.performancePeriod);if(state.data)renderPerformance(state.data)})});el("refreshAll").addEventListener("click",load);el("logConsole").addEventListener("scroll",function(){if(this.scrollHeight-this.scrollTop-this.clientHeight>=28){state.logStick=false;el("resumeLogs").hidden=false;el("pauseLogs").hidden=true}});el("pauseLogs").addEventListener("click",function(){state.logStick=false;this.hidden=true;el("resumeLogs").hidden=false});el("resumeLogs").addEventListener("click",function(){state.logStick=true;el("logConsole").scrollTop=el("logConsole").scrollHeight;this.hidden=true;el("pauseLogs").hidden=false});el("openHistory").addEventListener("click",function(){var period=state.data&&state.data.history&&state.data.history.trades&&state.data.history.trades.length?"TRADES":"DAILY";document.querySelectorAll("[data-period]").forEach(function(x){x.classList.toggle("active",x.dataset.period===period)});el("historyModal").classList.add("open");renderHistory(period)});el("closeHistory").addEventListener("click",function(){el("historyModal").classList.remove("open")});el("historyModal").addEventListener("click",function(e){if(e.target===this)this.classList.remove("open")});el("openCandles").addEventListener("click",function(){el("candleModal").classList.add("open")});el("closeCandles").addEventListener("click",function(){el("candleModal").classList.remove("open")});el("candleModal").addEventListener("click",function(e){if(e.target===this)this.classList.remove("open")});document.querySelectorAll("[data-period]").forEach(function(b){b.addEventListener("click",function(){document.querySelectorAll("[data-period]").forEach(function(x){x.classList.toggle("active",x===b)});renderHistory(b.dataset.period)})});
      el("consolidatedToggle").addEventListener("click",function(){setViewMode(state.viewMode==="consolidated"?"dashboard":"consolidated")});
      document.querySelectorAll("[data-consolidated-instrument]").forEach(function(b){b.addEventListener("click",function(){state.instrument=this.dataset.consolidatedInstrument==="OPTIONS"?"OPTIONS":"FUTURES";localStorage.setItem("zsShadowInstrument",state.instrument);if(state.data){renderConsolidated(state.data);renderMovementContext(state.data)}state.userRequestedLoad=true;load(true)})});
      el("consolidatedGrid").addEventListener("click",function(event){var tile=event.target.closest("[data-strategy][data-instrument]");if(!tile)return;state.strategy=tile.dataset.strategy;state.instrument=tile.dataset.instrument;localStorage.setItem("zsShadowStrategy",state.strategy);localStorage.setItem("zsShadowInstrument",state.instrument);setViewMode("dashboard");state.userRequestedLoad=true;load(true)});
      function historyRows(rows,withAction){return'<div class="sm-table-wrap" style="max-height:58vh"><table class="sm-table"><thead><tr><th>Period</th><th>Net P&amp;L</th><th>Capital Used</th><th>Return</th><th>Points</th><th>Trading Days</th><th>Trades</th><th>Wins</th><th>Losses</th><th>Win Rate</th>'+(withAction?'<th>Details</th>':'')+'</tr></thead><tbody>'+rows.map(function(r){return"<tr><td>"+esc(r.period)+"</td><td class='"+clsPnl(r.pnl)+"'>"+money(r.pnl)+"</td><td>"+money(r.capitalUsed).replace(/^\\+/,"")+"</td><td class='"+clsPnl(r.returnPct)+"'>"+pct(r.returnPct)+"</td><td>"+value(r.points)+"</td><td>"+value(r.tradingDays,0)+"</td><td>"+value(r.trades,0)+"</td><td class='sm-positive'>"+value(r.wins,0)+"</td><td class='sm-negative'>"+value(r.losses,0)+"</td><td>"+pct(r.winRate)+"</td>"+(withAction?'<td><button class="sm-month-open" data-month-open="'+esc(r.period)+'">View days</button></td>':'')+"</tr>"}).join("")+"</tbody></table></div>"}
      function renderMonthDays(month){var d=state.data;var b=d&&d.backtest;var rows=(b&&b.days||[]).filter(function(r){return String(r.date||"").slice(0,7)===month}).sort(function(a,z){return String(a.date).localeCompare(String(z.date))});var body=el("historyBody");body.innerHTML='<div class="sm-history-toolbar"><div><h3>'+esc(month)+' daily results</h3><div class="sm-health-note">'+esc(d.identity.strategyName)+' · '+esc(d.identity.instrumentType)+(b.modelled?' · Modelled options':' · Historical candles')+'</div></div><button class="sm-history-btn" id="backToMonths" type="button">Back to months</button></div><div class="sm-table-wrap" style="max-height:58vh"><table class="sm-table"><thead><tr><th>Date</th><th>Net P&amp;L</th><th>Capital Used</th><th>Return</th><th>Gross P&amp;L</th><th>Points</th><th>Trades</th><th>Wins</th><th>Losses</th><th>Exit reasons</th></tr></thead><tbody>'+rows.map(function(r){return"<tr><td>"+esc(r.date)+"</td><td class='"+clsPnl(r.pnl)+"'>"+money(r.pnl)+"</td><td>"+money(r.capitalUsed).replace(/^\\+/,"")+"</td><td class='"+clsPnl(r.returnPct)+"'>"+pct(r.returnPct)+"</td><td class='"+clsPnl(r.grossPnl)+"'>"+money(r.grossPnl)+"</td><td>"+value(r.points)+"</td><td>"+value(r.trades,0)+"</td><td class='sm-positive'>"+value(r.wins,0)+"</td><td class='sm-negative'>"+value(r.losses,0)+"</td><td title='"+esc((r.reasons||[]).join(", "))+"'>"+esc((r.reasons||[]).join(", ")||"--")+"</td></tr>"}).join("")+"</tbody></table></div>";el("backToMonths").addEventListener("click",function(){renderHistory("MONTHLY")})}
      function renderHistory(period){var d=state.data;if(!d)return;var body=el("historyBody");var b=d.backtest;if(!b){body.innerHTML='<div class="sm-history-state"><b>No strategy-specific five-year result</b><p>This view will not substitute another strategy&apos;s data.</p></div>';return}if(period==="BACKTEST"){body.innerHTML='<div class="sm-history-method"><b>'+(b.modelled?'Modelled options backtest':'Historical-candle backtest')+' · '+esc(b.coverage||"5Y")+'</b><div>'+esc(b.methodology||"Methodology not recorded")+'</div><div style="margin-top:8px">Source: '+esc(b.source)+' · Generated: '+esc(b.generatedAt||"--")+'</div><div style="margin-top:8px">Net P&amp;L: '+btValue(b.pnl,b.pnlUnit)+' · Return on deployed capital: '+pct(b.returnPct)+' · Win rate: '+pct(b.winRate)+' · Max drawdown: '+btValue(b.maxDrawdown,b.pnlUnit)+' · Trades: '+value(b.totalTrades,0)+'</div></div>';return}var rows=(b.months||[]).slice().sort(function(a,z){return String(z.period).localeCompare(String(a.period))});if(period==="YEARLY"){var years={};rows.forEach(function(r){var y=String(r.period).slice(0,4);var x=years[y]||(years[y]={period:y,pnl:0,capitalUsed:0,points:0,tradingDays:0,trades:0,wins:0,losses:0});x.pnl+=Number(r.pnl||0);x.capitalUsed+=Number(r.capitalUsed||0);x.points+=Number(r.points||0);x.tradingDays+=Number(r.tradingDays||0);x.trades+=Number(r.trades||0);x.wins+=Number(r.wins||0);x.losses+=Number(r.losses||0)});rows=Object.values(years).map(function(r){r.winRate=r.wins+r.losses?r.wins/(r.wins+r.losses)*100:0;r.returnPct=r.capitalUsed?r.pnl/r.capitalUsed*100:null;return r}).sort(function(a,z){return z.period.localeCompare(a.period)});body.innerHTML=historyRows(rows,false);return}body.innerHTML='<div class="sm-history-toolbar"><div><h3>Monthly backtest history</h3><div class="sm-health-note">Open any month to see every traded day.</div></div><div class="sm-source">'+esc(b.coverage||"5Y")+' · '+(b.modelled?"MODELLED OPTIONS":"HISTORICAL CANDLES")+'</div></div>'+historyRows(rows,true);body.querySelectorAll("[data-month-open]").forEach(function(button){button.addEventListener("click",function(){renderMonthDays(button.dataset.monthOpen)})})}
      function renderHealthDetails(health){var h=health||{};var status=String(h.overall||"WARNING").toUpperCase();var stateClass=status==="HEALTHY"?"":status.toLowerCase();el("healthModalState").className="sm-health-state "+stateClass;el("healthModalState").textContent=status;el("healthModalSummary").textContent=h.summary||"Health evidence temporarily unavailable";el("healthModalChecked").textContent="Checked: "+dt(h.checkedAt||new Date().toISOString());var checks=Array.isArray(h.checks)?h.checks:[];el("healthDetails").innerHTML=checks.length?checks.map(function(c){var level=String(c.level||"INFO").toLowerCase();return'<div class="sm-health-row"><div class="sm-health-row-title"><b>'+esc(c.label)+'</b><small>'+esc(c.source||"Runtime evidence")+'</small></div><div class="sm-health-row-value"><span class="sm-check-badge '+level+'">'+esc(c.level||"INFO")+'</span><div>'+esc(c.value||"--")+'</div></div><div class="sm-health-row-detail">'+esc(c.detail||"No additional detail")+'<small>'+(c.critical?"Critical check":"Supporting check")+'</small></div></div>'}).join(""):'<div class="sm-history-state">Health evidence is being refreshed. No failed check was assumed.</div>'}
      renderHealth=function(d){var h=d.health||{};var status=String(h.overall||"CRITICAL").toUpperCase();var healthy=status==="HEALTHY";var warning=status==="WARNING";var checks=Array.isArray(h.checks)?h.checks:[];var check=function(id){return checks.find(function(c){return c.id===id})||{level:"INFO",value:"--",detail:"Evidence unavailable"}};var feed=check("feed");var strategy=check("strategy");var candles=d.candles||[];var count=function(tf){return candles.filter(function(c){return String(c.timeframe).toLowerCase()===tf}).length};var healthCard=el("healthStep");healthCard.classList.toggle("good-step",healthy);healthCard.classList.toggle("warning-step",warning);healthCard.classList.toggle("critical-step",!healthy&&!warning);el("healthIcon").className="sm-health-icon health "+(healthy?"good":warning?"warn":"fail");el("healthValue").className="sm-health-value "+(healthy?"":warning?"warn":"fail");el("healthValue").textContent=h.label||status;el("healthNote").textContent=h.summary||"Health evidence unavailable";var feedGood=feed.level==="PASS";var feedWarn=feed.level==="WARN"||feed.level==="INFO";el("feedStep").classList.toggle("good-step",feedGood);el("feedStep").classList.toggle("warning-step",feedWarn&&!feedGood);el("feedStep").classList.toggle("critical-step",!feedGood&&!feedWarn);el("feedIcon").className="sm-health-icon feed "+(feedGood?"good":feedWarn?"warn":"fail");el("feedValue").textContent=feed.value||h.feed||"--";el("feedNote").textContent=feed.detail||"Market data evidence unavailable";var runtimeGood=strategy.level==="PASS";el("runtimeStep").classList.toggle("good-step",runtimeGood);el("runtimeStep").classList.toggle("warning-step",strategy.level==="WARN"||strategy.level==="INFO");el("runtimeStep").classList.toggle("critical-step",strategy.level==="FAIL");el("runtimeValue").textContent=strategy.value||d.runtime.status;el("runtimeNote").textContent=strategy.detail||((d.runtime.status||"--")+" | "+(d.runtime.version||"--"));el("candleLatest").textContent="Latest: "+(candles[0]&&candles[0].time||"--");el("count1m").textContent=count("1m");el("count5m").textContent=count("5m");el("count15m").textContent=count("15m");var b=d.backtest;el("backtestStep").classList.toggle("good-step",!!b);el("backtestSummary").innerHTML='<div class="sm-health-icon backtest '+(b?"good":"warn")+'"><svg class="sm-icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="'+(b?"m8.5 12 2.2 2.2 4.8-5":"M12 8v5m0 3h.01")+'"/></svg></div>'+(b?'<div class="sm-bt-cell"><span>5Y Backtest</span><b title="'+esc((b.coverage||"5Y")+(b.modelled?" · Modelled":" · Historical")+" · "+(b.methodology||b.source))+'">'+esc(b.coverage||"5Y")+'</b></div><div class="sm-bt-cell"><span>5Y P&amp;L</span><b class="'+clsPnl(b.pnl)+'">'+compactMoney(b.pnl,false)+'</b></div><div class="sm-bt-cell"><span>Win Rate</span><b>'+pct(b.winRate)+'</b></div><div class="sm-bt-cell"><span>Max Drawdown</span><b class="sm-negative">'+compactMoney(b.maxDrawdown,true)+'</b></div><div class="sm-bt-cell"><span>Avg Monthly</span><b>'+compactMoney(b.avgMonthlyPnl,false)+'</b></div>':'<div class="sm-bt-cell" style="grid-column:2/-1"><span>5Y Backtest Summary</span><b>No strategy-specific result available</b></div>');renderHealthDetails(h)};
      function bestPerformer(row,label){if(!row)return'<div class="sm-best-group"><span>'+label+'</span><b>No qualifying trades</b><small>--</small><strong>--</strong></div>';return'<div class="sm-best-group"><span>'+label+'</span><b>'+esc(row.strategyName||"--")+'</b><small>'+esc(row.instrument==="OPTIONS"?"Options":"Futures")+'</small><strong class="'+clsPnl(row.returnPct)+'">'+pct(row.returnPct)+'</strong><small class="'+clsPnl(row.pnl)+'">'+money(row.pnl)+'</small></div>'}
      function renderBestPerformers(d){var periods=d.performance&&d.performance.periods||{};el("bestPerformers").innerHTML=bestPerformer(periods.TODAY&&periods.TODAY.bestOverall,"Best Last Day")+bestPerformer(periods.MONTH&&periods.MONTH.bestOverall,"Best This Month")+bestPerformer(periods.MONTH&&periods.MONTH.worstOverall,"Loser This Month")}
      renderHealth=function(d){var h=d.health||{};var status=String(h.overall||"WARNING").toUpperCase();var healthy=status==="HEALTHY";var warning=status==="WARNING";var checks=Array.isArray(h.checks)?h.checks:[];var check=function(id){return checks.find(function(c){return c.id===id})||{level:"INFO",value:"--",detail:"Evidence unavailable"}};var feed=check("feed");var healthCard=el("healthStep");healthCard.classList.toggle("good-step",healthy);healthCard.classList.toggle("warning-step",warning);healthCard.classList.toggle("critical-step",!healthy&&!warning);el("healthIcon").className="sm-health-icon health "+(healthy?"good":warning?"warn":"fail");el("healthValue").className="sm-health-value "+(healthy?"":warning?"warn":"fail");el("healthValue").textContent=h.label||status;el("healthNote").textContent=h.summary||"Health evidence temporarily unavailable";el("healthAction").textContent=(h.passedCritical==null?"--":h.passedCritical)+"/"+(h.criticalTotal==null?"--":h.criticalTotal)+" · View checks";var marketClosed=d.market&&d.market.status==="CLOSED";var feedGood=feed.level==="PASS";var feedWarn=marketClosed||feed.level==="WARN"||feed.level==="INFO";el("feedStep").classList.toggle("market-closed-step",marketClosed);el("feedStep").classList.toggle("good-step",feedGood||marketClosed);el("feedStep").classList.toggle("warning-step",feedWarn&&!feedGood&&!marketClosed);el("feedStep").classList.toggle("critical-step",!feedGood&&!feedWarn);el("feedIcon").className="sm-health-icon feed "+(feedGood||marketClosed?"good":feedWarn?"warn":"fail");el("feedValue").textContent=marketClosed?"Market Closed":feedGood?"Connected":feed.level==="WARN"?"Delayed":"Disconnected";el("feedLatestTick").textContent=dt(h.lastTickAt);el("feedLatency").textContent=h.feedLatencyMs==null?"Unavailable":value(h.feedLatencyMs,0)+" ms";el("feedHeartbeat").textContent=esc(h.heartbeatState||"--");var event=h.lastFeedEvent&&h.lastFeedEvent.message||"No feed event published";el("feedEvent").textContent=event.length>64?event.slice(0,61)+"...":event;el("feedEvent").title=event;var b=d.backtest;el("backtestStep").classList.toggle("good-step",!!b);el("backtestSummary").innerHTML='<div class="sm-health-icon backtest '+(b?"good":"warn")+'"><svg class="sm-icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="'+(b?"m8.5 12 2.2 2.2 4.8-5":"M12 8v5m0 3h.01")+'"/></svg></div>'+(b?'<div class="sm-bt-cell"><span>5Y Return</span><b class="'+clsPnl(b.returnPct)+'">'+pct(b.returnPct)+'</b></div><div class="sm-bt-cell"><span>Net Backtest P&amp;L</span><b class="'+clsPnl(b.pnl)+'">'+money(b.pnl)+'</b></div><div class="sm-bt-cell"><span>Win Rate</span><b>'+pct(b.winRate)+'</b></div><div class="sm-bt-cell"><span>Max Drawdown</span><b class="sm-negative">'+money(-Math.abs(Number(b.maxDrawdown||0)))+'</b></div><div class="sm-bt-cell"><span>Avg Monthly Return</span><b>'+pct(b.avgMonthlyReturnPct)+'</b></div><div class="sm-bt-cell"><span>Total Trades</span><b>'+value(b.totalTrades,0)+'</b></div>':'<div class="sm-bt-cell"><span>5Y Backtest Summary</span><b>No selected strategy result</b></div>');renderBestPerformers(d);renderHealthDetails(h)};
      renderTrades=function(d){var option=d.identity.instrumentType==="OPTIONS";el("tradeTitle").innerHTML="Today's Trade History <small>(Today Only &middot; "+(option?"Options":"Futures")+")</small>";var headers=["Time","Instrument","Contract","Order Flow","Entry","Exit","Qty","Net P&L","Return %","Status"];var trades=d.trades||[];var rows=trades.slice(0,7).map(function(t){var contract=esc(t.contract||"--");var action=String(t.action||"--").toUpperCase();var exitAction=String(t.exitAction||"--").toUpperCase();var status=esc(t.status||"--");var flow='<span class="sm-order-flow"><span class="sm-action '+action.toLowerCase()+'">'+esc(action)+'</span><span class="sm-flow-arrow">&rarr;</span><span class="sm-action '+exitAction.toLowerCase()+'">'+esc(exitAction)+'</span></span>';var cells=[esc(t.time||"--"),esc(t.instrument||"--"),'<span class="sm-side '+contract.toLowerCase()+'">'+contract+"</span>",flow,value(t.entry),value(t.exit),value(t.quantity,0),'<span class="'+clsPnl(t.pnl)+'">'+money(t.pnl)+"</span>",'<span class="'+clsPnl(t.returnPct)+'">'+pct(t.returnPct)+"</span>",'<span class="sm-tag '+status.toLowerCase()+'">'+status+"</span>"];return"<tr data-trade-id='"+esc(t.tradeId||t.id||"")+"'>"+cells.map(function(c){return"<td>"+c+"</td>"}).join("")+"</tr>"}).join("");el("tradeTable").innerHTML="<thead><tr>"+headers.map(function(h){return"<th>"+esc(h)+"</th>"}).join("")+"</tr></thead><tbody>"+(rows||'<tr><td class="sm-table-empty" colspan="10">No shadow trades recorded today for this strategy and instrument.</td></tr>')+"</tbody>"};
      function tradeHistoryTable(rows){return'<div class="sm-table-wrap" style="max-height:58vh"><table class="sm-table"><thead><tr><th>Date</th><th>Time</th><th>Instrument</th><th>Contract</th><th>Order Flow</th><th>Entry</th><th>Exit</th><th>Qty</th><th>Net P&amp;L</th><th>Return %</th><th>Status</th><th>Reason</th></tr></thead><tbody>'+rows.map(function(t){var action=String(t.action||"--").toUpperCase();var exitAction=String(t.exitAction||"--").toUpperCase();var flow='<span class="sm-order-flow"><span class="sm-action '+action.toLowerCase()+'">'+esc(action)+'</span><span class="sm-flow-arrow">&rarr;</span><span class="sm-action '+exitAction.toLowerCase()+'">'+esc(exitAction)+'</span></span>';return"<tr><td>"+esc(t.date||"--")+"</td><td>"+esc(t.time||"--")+"</td><td>"+esc(t.instrument||"--")+"</td><td><span class='sm-side "+esc(String(t.contract||"").toLowerCase())+"'>"+esc(t.contract||"--")+"</span></td><td>"+flow+"</td><td>"+value(t.entry)+"</td><td>"+value(t.exit)+"</td><td>"+value(t.quantity,0)+"</td><td class='"+clsPnl(t.pnl)+"'>"+money(t.pnl)+"</td><td class='"+clsPnl(t.returnPct)+"'>"+pct(t.returnPct)+"</td><td><span class='sm-tag "+esc(String(t.status||"").toLowerCase())+"'>"+esc(t.status||"--")+"</span></td><td title='"+esc(t.reason||"--")+"'>"+esc(t.reason||"--")+"</td></tr>"}).join("")+"</tbody></table></div>"}
      function liveHistoryTable(rows,withAction){return'<div class="sm-table-wrap" style="max-height:58vh"><table class="sm-table"><thead><tr><th>Period</th><th>Net P&amp;L</th><th>Capital Deployed</th><th>Return %</th><th>Trading Days</th><th>Trades</th><th>Wins</th><th>Losses</th><th>Win Rate</th>'+(withAction?'<th>Details</th>':'')+'</tr></thead><tbody>'+rows.map(function(r){return"<tr><td>"+esc(r.period||r.date)+"</td><td class='"+clsPnl(r.pnl)+"'>"+money(r.pnl)+"</td><td>"+(r.capitalDeployed?money(r.capitalDeployed).replace(/^\\+/,""):"--")+"</td><td class='"+clsPnl(r.returnPct)+"'>"+pct(r.returnPct)+"</td><td>"+value(r.tradingDays==null?1:r.tradingDays,0)+"</td><td>"+value(r.trades,0)+"</td><td class='sm-positive'>"+value(r.wins,0)+"</td><td class='sm-negative'>"+value(r.losses,0)+"</td><td>"+pct(r.winRate==null?(r.wins+r.losses?r.wins/(r.wins+r.losses)*100:0):r.winRate)+"</td>"+(withAction?'<td><button class="sm-month-open" data-month-open="'+esc(r.period)+'">View days</button></td>':'')+"</tr>"}).join("")+"</tbody></table></div>"}
      renderMonthDays=function(month){var d=state.data;var rows=((d&&d.history&&d.history.days)||[]).filter(function(r){return String(r.date||"").slice(0,7)===month});el("historyBody").innerHTML='<div class="sm-history-toolbar"><div><h3>'+esc(month)+' daily shadow results</h3><div class="sm-health-note">'+esc(d.identity.strategyName)+' · '+esc(d.identity.instrumentType)+' · SHADOW</div></div><button class="sm-history-btn" id="backToMonths" type="button">Back to months</button></div>'+liveHistoryTable(rows,false);el("backToMonths").addEventListener("click",function(){renderHistory("MONTHLY")})};
      renderHistory=function(period){var d=state.data;if(!d)return;var h=d.history||{};var body=el("historyBody");if(period==="TRADES"&&!(h.trades||[]).length&&(h.days||[]).length){period="DAILY";document.querySelectorAll("[data-period]").forEach(function(x){x.classList.toggle("active",x.dataset.period===period)})}var rows=period==="TRADES"?(h.trades||[]):period==="DAILY"?(h.days||[]):period==="YEARLY"?(h.yearly||[]):(h.monthly||[]);if(!rows.length){body.innerHTML='<div class="sm-history-state"><b>No stored shadow '+esc(period.toLowerCase())+' for this selection</b><p>'+esc(d.identity.strategyName)+' · '+esc(d.identity.instrumentType)+' · SHADOW</p></div>';return}body.innerHTML='<div class="sm-history-toolbar"><div><h3>'+esc(period==="TRADES"?"All stored trades":period.charAt(0)+period.slice(1).toLowerCase()+" shadow history")+'</h3><div class="sm-health-note">Selected strategy and instrument only. Values come from persisted shadow records.</div></div><div class="sm-source">LIVE SHADOW</div></div>'+(period==="TRADES"?tradeHistoryTable(rows):liveHistoryTable(rows,period==="MONTHLY"));if(period==="MONTHLY")body.querySelectorAll("[data-month-open]").forEach(function(button){button.addEventListener("click",function(){renderMonthDays(button.dataset.monthOpen)})})};
      renderHistory=function(period){var d=state.data;if(!d)return;var h=d.history||{};var body=el("historyBody");if(/^BT_/.test(period)){var b=d.backtest||{};var key=period==="BT_WEEKLY"?"weeks":period==="BT_YEARLY"?"years":"months";var backtestRows=(b[key]||[]).slice().sort(function(a,z){return String(z.period).localeCompare(String(a.period))});if(!backtestRows.length){body.innerHTML='<div class="sm-history-state"><b>No '+esc(key)+' backtest records for this selection</b><p>Backtest data is kept separate from live shadow history.</p></div>';return}body.innerHTML='<div class="sm-history-toolbar"><div><h3>5Y '+esc(key.charAt(0).toUpperCase()+key.slice(1))+' Backtest</h3><div class="sm-health-note">'+esc(d.identity.strategyName)+' · '+esc(d.identity.instrumentType)+' · historical candles</div></div><div class="sm-source">BACKTEST ONLY</div></div>'+historyRows(backtestRows,false);return}if(period==="TRADES"&&!(h.trades||[]).length&&(h.days||[]).length){period="DAILY";document.querySelectorAll("[data-period]").forEach(function(x){x.classList.toggle("active",x.dataset.period===period)})}var rows=period==="TRADES"?(h.trades||[]):period==="DAILY"?(h.days||[]):period==="WEEKLY"?(h.weekly||[]):period==="YEARLY"?(h.yearly||[]):(h.monthly||[]);if(!rows.length){body.innerHTML='<div class="sm-history-state"><b>No stored shadow '+esc(period.toLowerCase())+' for this selection</b><p>'+esc(d.identity.strategyName)+' · '+esc(d.identity.instrumentType)+' · SHADOW</p></div>';return}body.innerHTML='<div class="sm-history-toolbar"><div><h3>'+esc(period==="TRADES"?"All stored trades":period.charAt(0)+period.slice(1).toLowerCase()+" shadow history")+'</h3><div class="sm-health-note">Selected strategy and instrument only. Values come from persisted shadow records.</div></div><div class="sm-source">LIVE SHADOW</div></div>'+(period==="TRADES"?tradeHistoryTable(rows):liveHistoryTable(rows,period==="MONTHLY"));if(period==="MONTHLY")body.querySelectorAll("[data-month-open]").forEach(function(button){button.addEventListener("click",function(){renderMonthDays(button.dataset.monthOpen)})})};
      var renderStoredHistory=renderHistory;
      renderHistory=function(period){var d=state.data;if(!d||!d.history)return renderStoredHistory(period);if(period!=="TRADES"&&period!=="DAILY")return renderStoredHistory(period);var key=period==="TRADES"?"trades":"days";var original=d.history[key];d.history[key]=(original||[]).filter(function(row){return String(row.date||row.tradeDate||"")===String(d.identity.tradeDate||"")});try{renderStoredHistory(period);var heading=el("historyBody").querySelector("h3");if(heading)heading.textContent=period==="TRADES"?"Today's stored trades":"Today's shadow result"}finally{d.history[key]=original}};
      function drillHistoryTable(rows,action){return'<div class="sm-table-wrap" style="max-height:58vh"><table class="sm-table"><thead><tr><th>Period</th><th>Net P&amp;L</th><th>Capital Deployed</th><th>Return %</th><th>Trading Days</th><th>Trades</th><th>Wins</th><th>Losses</th><th>Win Rate</th>'+(action?'<th></th>':'')+'</tr></thead><tbody>'+rows.map(function(r){var period=String(r.period||r.date||"--");var rowAttr=action?action==="year"?' class="sm-drill-row" data-year-open="'+esc(period)+'"':' class="sm-drill-row" data-month-open="'+esc(period)+'"':"";var details=action?action==="year"?'<td><button class="sm-month-open" data-year-open="'+esc(period)+'" aria-label="Open months for '+esc(period)+'">&gt;</button></td>':'<td><button class="sm-month-open" data-month-open="'+esc(period)+'" aria-label="Open days for '+esc(period)+'">&gt;</button></td>':"";return"<tr"+rowAttr+"><td>"+esc(period)+"</td><td class='"+clsPnl(r.pnl)+"'>"+money(r.pnl)+"</td><td>"+(r.capitalDeployed?money(r.capitalDeployed).replace(/^\\+/,""):"--")+"</td><td class='"+clsPnl(r.returnPct)+"'>"+pct(r.returnPct)+"</td><td>"+value(r.tradingDays==null?1:r.tradingDays,0)+"</td><td>"+value(r.trades,0)+"</td><td class='sm-positive'>"+value(r.wins,0)+"</td><td class='sm-negative'>"+value(r.losses,0)+"</td><td>"+pct(r.winRate==null?(r.wins+r.losses?r.wins/(r.wins+r.losses)*100:0):r.winRate)+"</td>"+details+"</tr>"}).join("")+"</tbody></table></div>"}
      function meaningfulHistoryRows(rows){return(rows||[]).filter(function(r){return Number(r.trades||0)>0||Number(r.wins||0)>0||Number(r.losses||0)>0||Number(r.capitalDeployed||0)>0||Number(r.pnl||0)!==0})}
      function showHistoryEmpty(label){var d=state.data;el("historyBody").innerHTML='<div class="sm-history-state"><b>No stored shadow '+esc(label)+' for this selection</b><p>'+esc(d.identity.strategyName)+' · '+esc(d.identity.instrumentType)+' · SHADOW</p></div>'}
      function setHistoryTab(period){document.querySelectorAll("[data-period]").forEach(function(x){x.classList.toggle("active",x.dataset.period===period)})}
      function renderYearMonths(year){var d=state.data;var rows=meaningfulHistoryRows(((d&&d.history&&d.history.monthly)||[]).filter(function(r){return String(r.period||"").slice(0,4)===year})).sort(function(a,z){return String(z.period).localeCompare(String(a.period))});if(!rows.length){showHistoryEmpty(year+" monthly history");return}el("historyBody").innerHTML='<div class="sm-history-toolbar"><div><h3>'+esc(year)+' monthly shadow history</h3><div class="sm-health-note">Click a month to view all daily records.</div></div><button class="sm-history-btn" id="backToYears" type="button">Back to years</button></div>'+drillHistoryTable(rows,"month");el("backToYears").addEventListener("click",function(){renderHistory("YEARLY")});el("historyBody").querySelectorAll("[data-month-open]").forEach(function(button){button.addEventListener("click",function(){renderMonthDays(button.dataset.monthOpen,year)})})}
      renderMonthDays=function(month,year){var d=state.data;var rows=meaningfulHistoryRows(((d&&d.history&&d.history.days)||[]).filter(function(r){return String(r.date||"").slice(0,7)===month})).sort(function(a,z){return String(z.date).localeCompare(String(a.date))});if(!rows.length){showHistoryEmpty(month+" daily history");return}el("historyBody").innerHTML='<div class="sm-history-toolbar"><div><h3>'+esc(month)+' daily shadow history</h3><div class="sm-health-note">'+esc(d.identity.strategyName)+' · '+esc(d.identity.instrumentType)+' · SHADOW</div></div><button class="sm-history-btn" id="backToMonths" type="button">Back to months</button></div>'+drillHistoryTable(rows,null);el("backToMonths").addEventListener("click",function(){renderYearMonths(year||String(month).slice(0,4))})};
      renderHistory=function(period){var d=state.data;if(!d||!d.history)return;period=period==="TRADES"||period==="WEEKLY"||period==="YEARLY"?period:"DAILY";setHistoryTab(period);var h=d.history||{};var rows=period==="TRADES"?(h.trades||[]):meaningfulHistoryRows((period==="DAILY"?h.days:period==="WEEKLY"?h.weekly:h.yearly)||[]);rows=rows.slice().sort(function(a,z){return(String(z.period||z.date)+" "+String(z.time||"")).localeCompare(String(a.period||a.date)+" "+String(a.time||""))});if(!rows.length){showHistoryEmpty(period.toLowerCase()+" history");return}var title=period==="TRADES"?"All stored trades":period==="DAILY"?"Daily shadow history":period==="WEEKLY"?"Weekly shadow history":"Yearly shadow history";var note=period==="YEARLY"?"Click a year to view its months, then click a month to view all days.":"Selected strategy and instrument only. Values come from persisted shadow records.";el("historyBody").innerHTML='<div class="sm-history-toolbar"><div><h3>'+esc(title)+'</h3><div class="sm-health-note">'+esc(note)+'</div></div><div class="sm-source">LIVE SHADOW</div></div>'+(period==="TRADES"?tradeHistoryTable(rows):drillHistoryTable(rows,period==="YEARLY"?"year":null));if(period==="YEARLY")el("historyBody").querySelectorAll("[data-year-open]").forEach(function(button){button.addEventListener("click",function(){renderYearMonths(button.dataset.yearOpen)})})};
      function openHealth(){if(state.data)renderHealthDetails(state.data.health);el("healthModal").classList.add("open")}
      el("healthStep").addEventListener("click",openHealth);el("healthStep").addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();openHealth()}});el("closeHealth").addEventListener("click",function(){el("healthModal").classList.remove("open")});el("healthModal").addEventListener("click",function(e){if(e.target===this)this.classList.remove("open")});
      var refreshTimer=null;
      function scheduleRefresh(){if(refreshTimer)clearTimeout(refreshTimer);var marketOpen=state.data&&state.data.market&&state.data.market.status==="OPEN";var interval=marketOpen?(state.viewMode==="consolidated"?5000:10000):45000;refreshTimer=setTimeout(async function(){await load();scheduleRefresh()},interval)}
      load().finally(scheduleRefresh);
    })();
  </script>
  <script src="/public/js/app.js"></script>
</body>
</html>`;
}
