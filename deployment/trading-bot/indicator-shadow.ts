import fs from "fs";
import { KiteConnect } from "kiteconnect";
import { config } from "./config";
import { getBestOptionSymbol, getCurrentPrice, getOptionLTP } from "./market";

type Direction = "CE" | "PE";
type Candle = { date: string; open: number; high: number; low: number; close: number; volume?: number };
type StrategyId =
  | "vwap-trend" | "pivot-trend" | "ema-trend" | "smma-trend";
type StrategySpec = {
  id: StrategyId; name: string; prefix: string; stateFile: string;
  stopAtr?: number; maxTrades?: number;
};
type StrategyState = {
  date: string; initialized: boolean; lastCandleKey: string; phase: string;
  inTrade: boolean; dir: Direction | null; entry: number; entryTime: string;
  sl: number; live: number; optSym: string; optEntryPrem: number; optLivePrem: number;
  dayRs: number; optDayRs: number; trades: number; optTrades: number;
  wins: number; losses: number; optWins: number; optLosses: number;
  log: any[]; candleLog: any[];
};

const kite = new KiteConnect({ api_key: config.apiKey });
kite.setAccessToken(config.accessToken);

const QTY = Number(config.quantity || 30);
const HISTORICAL_INDEX_TOKEN = Number(process.env.BANKNIFTY_INDEX_TOKEN || process.env.INDEX_HISTORICAL_TOKEN || 260105);
const HEARTBEAT_FILE = "indicator-shadow-heartbeat.json";
const HISTORY_FILE = "indicator-shadow-history.json";
const POLL_MS = 15_000;
const IST_OFFSET_MS = 330 * 60_000;
const STRATEGIES: StrategySpec[] = [
  { id: "vwap-trend", name: "VWAP Trend", prefix: "vwapTrend", stateFile: "vwap-trend-state.json", stopAtr: 2, maxTrades: 3 },
  { id: "pivot-trend", name: "Pivot Trend", prefix: "pivotTrend", stateFile: "pivot-trend-state.json", stopAtr: 2, maxTrades: 2 },
  { id: "ema-trend", name: "EMA Trend", prefix: "emaTrend", stateFile: "ema-trend-state.json", stopAtr: 2, maxTrades: 3 },
  { id: "smma-trend", name: "SMMA Trend", prefix: "smmaTrend", stateFile: "smma-trend-state.json", stopAtr: 2, maxTrades: 3 },
];
const states = new Map<StrategyId, StrategyState>();

function nowIST(): Date { return new Date(Date.now() + IST_OFFSET_MS); }
function dayIST(): string { return nowIST().toISOString().slice(0, 10); }
function timeIST(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(11, 16);
}
function kiteDate(istEpoch: number): string {
  const d = new Date(istEpoch);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
function emptyState(date = dayIST()): StrategyState {
  return {
    date, initialized: false, lastCandleKey: "", phase: "STARTING",
    inTrade: false, dir: null, entry: 0, entryTime: "", sl: 0, live: 0,
    optSym: "", optEntryPrem: 0, optLivePrem: 0, dayRs: 0, optDayRs: 0,
    trades: 0, optTrades: 0, wins: 0, losses: 0, optWins: 0, optLosses: 0,
    log: [], candleLog: [],
  };
}
function readState(spec: StrategySpec): StrategyState {
  try {
    const parsed = JSON.parse(fs.readFileSync(spec.stateFile, "utf8"));
    const state = { ...emptyState(parsed.date || parsed.day), ...parsed };
    if (state.inTrade && state.entryTime && state.trades < 1) {
      state.trades = 1;
      if (state.optSym && state.optEntryPrem > 0) state.optTrades = Math.max(1, state.optTrades || 0);
      if (!state.log.length) {
        state.log.push({
          tradeId: `${spec.id}-${state.date}-${state.entryTime}-1`,
          date: state.date,
          time: state.entryTime,
          entryTime: `${state.date}T${state.entryTime}:00+05:30`,
          exitTime: null,
          dir: state.dir,
          entry: state.entry,
          exit: null,
          pnlRs: null,
          qty: QTY,
          symbol: state.optSym || null,
          premIn: state.optEntryPrem || null,
          premOut: null,
          optionPnlRs: null,
          reason: "Reconstructed open shadow trade",
          status: "OPEN",
        });
      }
    }
    return state;
  } catch { return emptyState(); }
}
function atomicWrite(file: string, value: any): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}
function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return values.slice(-period).reduce((sum, value) => sum + value, 0) / period;
}
function stdDev(values: number[], period: number): number | null {
  const mean = sma(values, period);
  if (mean === null) return null;
  return Math.sqrt(values.slice(-period).reduce((sum, value) => sum + (value - mean) ** 2, 0) / period);
}
function emaSeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  const result = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    result.push(values[index] * alpha + result[index - 1] * (1 - alpha));
  }
  return result;
}
function smmaSeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const result = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    result.push((result[index - 1] * (period - 1) + values[index]) / period);
  }
  return result;
}
function rsiSeries(values: number[], period = 14): number[] {
  const result = new Array(values.length).fill(50);
  let avgGain = 0, avgLoss = 0;
  for (let index = 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    const gain = Math.max(0, change), loss = Math.max(0, -change);
    if (index <= period) {
      avgGain += gain / period; avgLoss += loss / period;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (index >= period) result[index] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}
function atrSeries(candles: Candle[], period = 10): number[] {
  const tr = candles.map((candle, index) => {
    if (!index) return candle.high - candle.low;
    const previous = candles[index - 1].close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previous), Math.abs(candle.low - previous));
  });
  return emaSeries(tr, period);
}
function wilderAtrSeries(candles: Candle[], period = 14): number[] {
  const tr = candles.map((candle, index) => {
    if (!index) return candle.high - candle.low;
    const previous = candles[index - 1].close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previous), Math.abs(candle.low - previous));
  });
  return smmaSeries(tr, period);
}
function supertrendDirections(candles: Candle[], period = 10, multiplier = 3): Direction[] {
  const atr = atrSeries(candles, period);
  const directions: Direction[] = [];
  let finalUpper = 0, finalLower = 0;
  let direction: Direction = "CE";
  candles.forEach((candle, index) => {
    const midpoint = (candle.high + candle.low) / 2;
    const basicUpper = midpoint + multiplier * (atr[index] || 0);
    const basicLower = midpoint - multiplier * (atr[index] || 0);
    if (!index) {
      finalUpper = basicUpper; finalLower = basicLower;
    } else {
      const previousClose = candles[index - 1].close;
      finalUpper = basicUpper < finalUpper || previousClose > finalUpper ? basicUpper : finalUpper;
      finalLower = basicLower > finalLower || previousClose < finalLower ? basicLower : finalLower;
      if (direction === "PE" && candle.close > finalUpper) direction = "CE";
      else if (direction === "CE" && candle.close < finalLower) direction = "PE";
    }
    directions.push(direction);
  });
  return directions;
}

function signalFor(spec: StrategySpec, candles: Candle[], index: number): { entry?: Direction; exit?: boolean; note: string } {
  const closes = candles.slice(0, index + 1).map(row => row.close);
  const current = candles[index], previous = candles[index - 1];
  if (!previous) return { note: "Waiting for previous candle" };
  if (["vwap-trend", "pivot-trend", "ema-trend", "smma-trend"].includes(spec.id)) {
    const smoothed = spec.id === "smma-trend";
    const fastPeriod = spec.id === "pivot-trend" ? 20 : spec.id === "ema-trend" ? 9 : 5;
    const slowPeriod = spec.id === "pivot-trend" ? 50 : spec.id === "ema-trend" ? 21 : 13;
    if (closes.length < slowPeriod) return { note: `Waiting for ${slowPeriod}-period indicator history` };
    const fast = (smoothed ? smmaSeries : emaSeries)(closes, fastPeriod).slice(-1)[0];
    const slow = (smoothed ? smmaSeries : emaSeries)(closes, slowPeriod).slice(-1)[0];
    const currentRsi = rsiSeries(closes, 14).slice(-1)[0];
    let direction: Direction | undefined;
    let context = `${smoothed ? "SMMA" : "EMA"} ${fastPeriod}/${slowPeriod}; RSI ${currentRsi.toFixed(1)}`;
    if (spec.id === "vwap-trend") {
      const today = candles.slice(0, index + 1).filter(row => candleDay(row) === candleDay(current));
      const weighted = today.reduce((sum, row) => {
        const weight = Number(row.volume || 1);
        return { value: sum.value + ((row.high + row.low + row.close) / 3) * weight, weight: sum.weight + weight };
      }, { value: 0, weight: 0 });
      const vwap = weighted.value / Math.max(1, weighted.weight);
      if (fast > slow && current.close > vwap && currentRsi >= 55) direction = "CE";
      if (fast < slow && current.close < vwap && currentRsi <= 45) direction = "PE";
      context = `VWAP ${vwap.toFixed(2)}; EMA 5/13; RSI ${currentRsi.toFixed(1)}`;
    } else if (spec.id === "pivot-trend") {
      const days = Array.from(new Set(candles.slice(0, index).map(candleDay)));
      const previousDay = days.filter(day => day < candleDay(current)).slice(-1)[0];
      const prior = candles.filter(row => candleDay(row) === previousDay);
      if (!prior.length) return { note: "Waiting for previous-session pivot" };
      const high = Math.max(...prior.map(row => row.high));
      const low = Math.min(...prior.map(row => row.low));
      const close = prior[prior.length - 1].close;
      const pivot = (high + low + close) / 3;
      const r1 = 2 * pivot - low, s1 = 2 * pivot - high;
      if (fast > slow && current.close > r1) direction = "CE";
      if (fast < slow && current.close < s1) direction = "PE";
      context = `Pivot R1 ${r1.toFixed(2)} / S1 ${s1.toFixed(2)}; EMA 20/50`;
    } else {
      if (fast > slow && currentRsi >= 52) direction = "CE";
      if (fast < slow && currentRsi <= 48) direction = "PE";
    }
    return direction ? { entry: direction, note: `${context}; ${direction} trend` } : { note: `${context}; no qualified trend` };
  }
  return { note: "No validated signal" };
}

async function recentCandles(): Promise<Candle[]> {
  const now = nowIST();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const from = kiteDate(midnight - 12 * 24 * 60 * 60_000 + 555 * 60_000);
  const to = kiteDate(now.getTime() - 60_000);
  let rows: any;
  try {
    rows = await kite.getHistoricalData(HISTORICAL_INDEX_TOKEN, "15minute", from, to, false);
  } catch (error: any) {
    throw new Error(`historical candles unavailable: ${error?.message || error}`);
  }
  if (!Array.isArray(rows)) {
    throw new Error(`historical candles response malformed: ${JSON.stringify(rows || {}).slice(0, 240)}`);
  }
  return (rows || []).map(row => ({
    date: typeof row.date === "string" ? row.date : new Date(row.date).toISOString(),
    open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close),
    volume: Number(row.volume || 0),
  }));
}
function candleDay(candle: Candle): string {
  return new Date(candle.date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function candleKey(candle: Candle): string { return `${candleDay(candle)}|${timeIST(candle.date)}`; }
function isCompletedSessionCandle(candle: Candle): boolean {
  const startMs = new Date(candle.date).getTime();
  if (!Number.isFinite(startMs)) return true;
  const durationMs = timeIST(candle.date) === "15:30" ? 10 * 60_000 : 15 * 60_000;
  return Date.now() >= startMs + durationMs;
}

async function enter(spec: StrategySpec, state: StrategyState, direction: Direction, candle: Candle, note: string, atr: number): Promise<void> {
  state.inTrade = true; state.dir = direction; state.entry = candle.close;
  state.entryTime = timeIST(candle.date);
  const stopMultiplier = spec.stopAtr || 1.5;
  state.sl = direction === "CE" ? candle.close - atr * stopMultiplier : candle.close + atr * stopMultiplier;
  state.live = candle.close; state.phase = "IN_TRADE";
  try {
    state.optSym = await getBestOptionSymbol(direction);
    state.optEntryPrem = await getOptionLTP(state.optSym);
    state.optLivePrem = state.optEntryPrem;
  } catch (error: any) {
    state.optSym = ""; state.optEntryPrem = 0; state.optLivePrem = 0;
    console.warn(`[${spec.id}] option shadow entry unavailable: ${error?.message || error}`);
  }
  state.trades += 1;
  if (state.optSym && state.optEntryPrem > 0) state.optTrades += 1;
  state.log.push({
    tradeId: `${spec.id}-${state.date}-${state.entryTime}-${state.trades}`,
    date: state.date,
    time: state.entryTime,
    entryTime: `${state.date}T${state.entryTime}:00+05:30`,
    exitTime: null,
    dir: state.dir,
    entry: state.entry,
    exit: null,
    pnlRs: null,
    qty: QTY,
    symbol: state.optSym || null,
    premIn: state.optEntryPrem || null,
    premOut: null,
    optionPnlRs: null,
    reason: note,
    status: "OPEN",
  });
  state.log = state.log.slice(-100);
  console.log(`[${spec.id}] ENTRY ${direction} index=${state.entry} option=${state.optSym || "unavailable"} ${note}`);
}
async function close(
  spec: StrategySpec,
  state: StrategyState,
  candle: Candle,
  reason: string,
  exitOverride?: number,
): Promise<{ pnlRs: number; optionPnlRs: number | null } | null> {
  if (!state.inTrade || !state.dir) return null;
  const exit = exitOverride ?? candle.close;
  const points = state.dir === "CE" ? exit - state.entry : state.entry - exit;
  const pnlRs = Math.round(points * QTY);
  let premiumExit = 0;
  if (state.optSym && state.optEntryPrem > 0) {
    try { premiumExit = await getOptionLTP(state.optSym); } catch {}
  }
  const optionPnl = premiumExit > 0 ? Math.round((premiumExit - state.optEntryPrem) * QTY) : 0;
  const closedTrade = {
    tradeId: `${spec.id}-${state.date}-${state.entryTime}-${Math.max(1, state.trades)}`,
    date: state.date, time: state.entryTime, entryTime: `${state.date}T${state.entryTime}:00+05:30`,
    exitTime: candle.date, dir: state.dir, entry: state.entry, exit, pnlRs, qty: QTY,
    symbol: state.optSym, premIn: state.optEntryPrem || null, premOut: premiumExit || null,
    optionPnlRs: premiumExit > 0 ? optionPnl : null, reason, status: "CLOSED",
  };
  const openTrade = [...state.log].reverse().find(row =>
    row?.status === "OPEN" && row?.date === state.date && row?.time === state.entryTime && row?.dir === state.dir
  );
  if (openTrade) Object.assign(openTrade, closedTrade);
  else state.log.push(closedTrade);
  state.dayRs += pnlRs;
  if (pnlRs > 0) state.wins += 1; else if (pnlRs < 0) state.losses += 1;
  if (premiumExit > 0) {
    state.optDayRs += optionPnl;
    if (optionPnl > 0) state.optWins += 1; else if (optionPnl < 0) state.optLosses += 1;
  }
  state.log = state.log.slice(-100);
  state.inTrade = false; state.dir = null; state.entry = 0; state.entryTime = "";
  state.sl = 0; state.optSym = ""; state.optEntryPrem = 0; state.optLivePrem = 0;
  state.phase = "SCANNING";
  console.log(`[${spec.id}] EXIT index=${exit} pnl=${pnlRs} optionPnl=${premiumExit > 0 ? optionPnl : "unavailable"} reason=${reason}`);
  return { pnlRs, optionPnlRs: premiumExit > 0 ? optionPnl : null };
}
async function evaluate(spec: StrategySpec, state: StrategyState, candles: Candle[], index: number): Promise<void> {
  const candle = candles[index], time = timeIST(candle.date);
  const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const signal = signalFor(spec, candles, index);
  const testedIndicator = ["vwap-trend", "pivot-trend", "ema-trend", "smma-trend"].includes(spec.id);
  const atr = (testedIndicator
    ? wilderAtrSeries(candles.slice(0, index + 1), 14)
    : atrSeries(candles.slice(0, index + 1), 10)
  ).slice(-1)[0] || Math.max(50, candle.high - candle.low);
  state.live = candle.close;
  if (state.inTrade && state.optSym) {
    try { state.optLivePrem = await getOptionLTP(state.optSym); } catch {}
  }
  const points = state.inTrade && state.dir ? (state.dir === "CE" ? candle.close - state.entry : state.entry - candle.close) : 0;
  const slHit = state.inTrade && state.dir
    ? (state.dir === "CE"
      ? (testedIndicator ? candle.low <= state.sl : candle.close <= state.sl)
      : (testedIndicator ? candle.high >= state.sl : candle.close >= state.sl))
    : false;
  const oppositeSignal = state.inTrade && signal.entry && signal.entry !== state.dir;
  let closedResult: { pnlRs: number; optionPnlRs: number | null } | null = null;
  let candleState = state.inTrade ? "hold" : signal.entry ? "entry" : "watching";
  if (state.inTrade && (minutes >= 930 || slHit || signal.exit || oppositeSignal)) {
    const oldDirection = state.dir;
    closedResult = await close(
      spec,
      state,
      candle,
      minutes >= 930 ? "EOD exit" : slHit ? "ATR stop loss" : oppositeSignal ? "Opposite indicator signal" : "Indicator exit",
      slHit && testedIndicator ? state.sl : undefined,
    );
    candleState = minutes >= 930 ? "exit_eod" : slHit ? "sl_hit" : oppositeSignal ? "re_exit" : "exit";
    if (minutes < 900 && signal.entry && signal.entry !== oldDirection && state.trades < (spec.maxTrades || 99)) {
      await enter(spec, state, signal.entry, candle, signal.note, atr);
      candleState = "reentry";
    }
  } else if (!state.inTrade && minutes >= 570 && minutes < 900 && signal.entry && state.trades < (spec.maxTrades || 99)) {
    await enter(spec, state, signal.entry, candle, signal.note, atr);
    candleState = "entry";
  }
  const candleOptionPnl = state.inTrade && state.optEntryPrem > 0 && state.optLivePrem > 0
    ? Math.round((state.optLivePrem - state.optEntryPrem) * QTY)
    : closedResult?.optionPnlRs ?? null;
  state.candleLog.push({
    time, num: state.candleLog.length + 1, open: candle.open, high: candle.high, low: candle.low, close: candle.close,
    status: candleState, dir: state.dir,
    entry: state.inTrade ? state.entry : null, sl: state.inTrade ? state.sl : null,
    pnlRs: state.inTrade ? Math.round(points * QTY) : closedResult?.pnlRs ?? null,
    optionPnlRs: candleOptionPnl,
    note: signal.note,
  });
  state.candleLog = state.candleLog.slice(-50);
  state.lastCandleKey = candleKey(candle);
}

function persistHistory(spec: StrategySpec, state: StrategyState): void {
  let history: any = { strategies: {} };
  try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch {}
  history.strategies ||= {};
  history.strategies[spec.id] ||= {};
  history.strategies[spec.id][state.date] = {
    date: state.date, futuresRs: state.dayRs, optionsRs: state.optDayRs,
    trades: state.trades, optionTrades: state.optTrades, wins: state.wins, losses: state.losses,
    optionWins: state.optWins, optionLosses: state.optLosses, rows: state.log,
  };
  history.updatedAt = new Date().toISOString();
  atomicWrite(HISTORY_FILE, history);
}
function heartbeat(): any {
  const result: any = { at: new Date().toISOString(), status: "RUNNING", executionMode: "SHADOW", process: "indicator-shadow" };
  for (const spec of STRATEGIES) {
    const state = states.get(spec.id)!;
    const unrealizedPoints = state.inTrade && state.dir ? (state.dir === "CE" ? state.live - state.entry : state.entry - state.live) : 0;
    const optionUnrealized = state.inTrade && state.optEntryPrem > 0 && state.optLivePrem > 0 ? Math.round((state.optLivePrem - state.optEntryPrem) * QTY) : 0;
    Object.assign(result, {
      [`${spec.prefix}Strategy`]: `${spec.name.toUpperCase().replace(/\W+/g, "_")}_V1`,
      [`${spec.prefix}PnL`]: state.dayRs + Math.round(unrealizedPoints * QTY),
      [`${spec.prefix}ClosedPnL`]: state.dayRs,
      [`${spec.prefix}OptPnL`]: state.optDayRs + optionUnrealized,
      [`${spec.prefix}OptClosedPnL`]: state.optDayRs,
      [`${spec.prefix}Trades`]: state.trades,
      [`${spec.prefix}OptTrades`]: state.optTrades,
      [`${spec.prefix}Wins`]: state.wins,
      [`${spec.prefix}Losses`]: state.losses,
      [`${spec.prefix}InTrade`]: state.inTrade,
      [`${spec.prefix}Phase`]: state.phase,
      [`${spec.prefix}Dir`]: state.dir,
      [`${spec.prefix}Entry`]: state.entry || null,
      [`${spec.prefix}FuturesEntry`]: state.entry || null,
      [`${spec.prefix}FuturesLive`]: state.live || null,
      [`${spec.prefix}SL`]: state.sl || null,
      [`${spec.prefix}LiveQty`]: QTY,
      [`${spec.prefix}EntryTime`]: state.entryTime || null,
      [`${spec.prefix}OptionSymbol`]: state.optSym || null,
      [`${spec.prefix}OptionEntry`]: state.optEntryPrem || null,
      [`${spec.prefix}OptionLive`]: state.optLivePrem || null,
      [`${spec.prefix}TradeLog`]: state.log,
      [`${spec.prefix}CandleLog`]: state.candleLog,
    });
  }
  return result;
}
async function tick(): Promise<void> {
  const candles = await recentCandles();
  const todayCandles = candles.filter(candle => candleDay(candle) === dayIST() && isCompletedSessionCandle(candle));
  let indexLtp = 0;
  try { indexLtp = await getCurrentPrice(); } catch {}
  for (const spec of STRATEGIES) {
    let state = states.get(spec.id)!;
    if (state.date !== dayIST()) {
      state = emptyState(); state.initialized = true; state.phase = "SCANNING"; states.set(spec.id, state);
    }
    if (!state.initialized) {
      state.initialized = true; state.phase = "SCANNING";
    }
    const lastIndex = state.lastCandleKey ? todayCandles.findIndex(candle => candleKey(candle) === state.lastCandleKey) : -1;
    for (let todayIndex = lastIndex + 1; todayIndex < todayCandles.length; todayIndex += 1) {
      const candle = todayCandles[todayIndex];
      const fullIndex = candles.findIndex(row => row.date === candle.date);
      if (fullIndex >= 0) await evaluate(spec, state, candles, fullIndex);
    }
    if (indexLtp > 0) state.live = indexLtp;
    if (state.inTrade && state.optSym) {
      try {
        const optionLtp = await getOptionLTP(state.optSym);
        if (optionLtp > 0) state.optLivePrem = optionLtp;
      } catch {}
    }
    atomicWrite(spec.stateFile, state);
    persistHistory(spec, state);
  }
  atomicWrite(HEARTBEAT_FILE, heartbeat());
}
async function run(): Promise<void> {
  for (const spec of STRATEGIES) states.set(spec.id, readState(spec));
  console.log(`[indicator-shadow] starting ${STRATEGIES.length} isolated 15m BANKNIFTY shadow strategies`);
  await tick().catch(error => {
    console.error(`[indicator-shadow] tick failed: ${error?.message || error}`);
    try { atomicWrite(HEARTBEAT_FILE, { ...heartbeat(), status: "DEGRADED", error: String(error?.message || error) }); } catch {}
  });
  setInterval(() => tick().catch(error => {
    console.error(`[indicator-shadow] tick failed: ${error?.message || error}`);
    try { atomicWrite(HEARTBEAT_FILE, { ...heartbeat(), status: "DEGRADED", error: String(error?.message || error) }); } catch {}
  }), POLL_MS);
}
run().catch(error => {
  console.error(`[indicator-shadow] startup failed: ${error?.stack || error}`);
  process.exitCode = 1;
});
