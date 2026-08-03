import fs from "fs";
import { KiteConnect } from "kiteconnect";
import { config } from "./config";

type Direction = "CE" | "PE";
type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };
type StrategyKind = "OPENING" | "SCHEDULED" | "BODY" | "HOLD" | "INDICATOR" | "GAMMA";
type StrategySpec = {
  id: string; name: string; kind: StrategyKind; reference?: string; indicator?: "VWAP" | "PIVOT" | "EMA" | "SMMA";
  stopPoints: number; buffer: number; maxTrades: number; instruments: ("FUTURES" | "OPTIONS")[];
};
type StrategyState = {
  date: string; phase: string; lastCandleKey: string; inTrade: boolean; direction: Direction | null;
  entry: number; ltp: number; stopLoss: number; target: number; entryAt: string | null;
  futuresSymbol: string | null; optionSymbol: string | null; optionEntry: number; optionLtp: number;
  realizedPnl: number; unrealizedPnl: number; optionRealizedPnl: number; optionUnrealizedPnl: number;
  trades: number; optionTrades: number; wins: number; losses: number; optionWins: number; optionLosses: number;
  quantity: number; tradeLog: any[]; candleLog: any[];
};

const kite = new KiteConnect({ api_key: config.apiKey });
kite.setAccessToken(config.accessToken);

const INDEX_TOKEN = Number(process.env.NIFTY_INDEX_TOKEN || 256265);
const QUANTITY = Number(process.env.NIFTY_SHADOW_QUANTITY || 65);
const POLL_MS = Number(process.env.NIFTY_SHADOW_POLL_MS || 15_000);
const STATE_FILE = "nifty-shadow-state.json";
const HEARTBEAT_FILE = "nifty-shadow-heartbeat.json";
const HISTORY_FILE = "nifty-shadow-history.json";
const IST_OFFSET = 330 * 60_000;

const STRATEGIES: StrategySpec[] = [
  { id: "drishti", name: "DRISHTI", kind: "OPENING", reference: "09:30", stopPoints: 40, buffer: 8, maxTrades: 2, instruments: ["FUTURES", "OPTIONS"] },
  { id: "drishti-v2", name: "DRISHTI V2 Challenger", kind: "OPENING", reference: "09:30", stopPoints: 35, buffer: 10, maxTrades: 2, instruments: ["FUTURES", "OPTIONS"] },
  { id: "tt0945", name: "09:45 Breakout", kind: "SCHEDULED", reference: "09:45", stopPoints: 35, buffer: 5, maxTrades: 1, instruments: ["FUTURES", "OPTIONS"] },
  { id: "tt1000", name: "10:00 Breakout", kind: "SCHEDULED", reference: "10:00", stopPoints: 35, buffer: 5, maxTrades: 1, instruments: ["FUTURES", "OPTIONS"] },
  { id: "tt1030", name: "10:30 Breakout", kind: "SCHEDULED", reference: "10:30", stopPoints: 40, buffer: 5, maxTrades: 1, instruments: ["FUTURES", "OPTIONS"] },
  { id: "normal-breakout", name: "Normal Breakout", kind: "BODY", stopPoints: 40, buffer: 8, maxTrades: 2, instruments: ["FUTURES", "OPTIONS"] },
  { id: "hybrid-body", name: "Hybrid Body Breakout", kind: "BODY", stopPoints: 40, buffer: 10, maxTrades: 3, instruments: ["FUTURES", "OPTIONS"] },
  { id: "body-hold-s1", name: "Body Hold S1", kind: "HOLD", stopPoints: 35, buffer: 5, maxTrades: 2, instruments: ["FUTURES", "OPTIONS"] },
  { id: "body-hold-s2", name: "Body Hold S2", kind: "HOLD", stopPoints: 45, buffer: 8, maxTrades: 2, instruments: ["FUTURES", "OPTIONS"] },
  { id: "low-iv-gamma", name: "Low-IV Gamma Breakout", kind: "GAMMA", reference: "10:00", stopPoints: 35, buffer: 8, maxTrades: 1, instruments: ["OPTIONS"] },
  { id: "vwap-trend", name: "VWAP Trend", kind: "INDICATOR", indicator: "VWAP", stopPoints: 35, buffer: 0, maxTrades: 3, instruments: ["FUTURES", "OPTIONS"] },
  { id: "pivot-trend", name: "Pivot Trend", kind: "INDICATOR", indicator: "PIVOT", stopPoints: 40, buffer: 0, maxTrades: 2, instruments: ["FUTURES", "OPTIONS"] },
  { id: "ema-trend", name: "EMA Trend", kind: "INDICATOR", indicator: "EMA", stopPoints: 35, buffer: 0, maxTrades: 3, instruments: ["FUTURES", "OPTIONS"] },
  { id: "smma-trend", name: "SMMA Trend", kind: "INDICATOR", indicator: "SMMA", stopPoints: 40, buffer: 0, maxTrades: 3, instruments: ["FUTURES", "OPTIONS"] },
];

const states = new Map<string, StrategyState>();
let instruments: any[] = [];
let instrumentsLoadedAt = 0;
let futuresInstrument: any = null;
let running = false;

function nowIST(): Date { return new Date(Date.now() + IST_OFFSET); }
function dayIST(): string { return nowIST().toISOString().slice(0, 10); }
function timeIST(value: string | Date): string { const d = value instanceof Date ? value : new Date(value); return new Date(d.getTime() + IST_OFFSET).toISOString().slice(11, 16); }
function candleDay(c: Candle): string { return new Date(c.date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); }
function candleKey(c: Candle): string { return `${candleDay(c)}|${timeIST(c.date)}`; }
function minutes(value: string): number { const [h, m] = value.split(":").map(Number); return h * 60 + m; }
function emptyState(): StrategyState {
  return { date: dayIST(), phase: "WAITING", lastCandleKey: "", inTrade: false, direction: null, entry: 0, ltp: 0,
    stopLoss: 0, target: 0, entryAt: null, futuresSymbol: null, optionSymbol: null, optionEntry: 0, optionLtp: 0,
    realizedPnl: 0, unrealizedPnl: 0, optionRealizedPnl: 0, optionUnrealizedPnl: 0, trades: 0, optionTrades: 0,
    wins: 0, losses: 0, optionWins: 0, optionLosses: 0, quantity: QUANTITY, tradeLog: [], candleLog: [] };
}
function atomicWrite(file: string, value: any): void { const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(value, null, 2)); fs.renameSync(tmp, file); }
function loadStates(): void {
  let root: any = {};
  try { root = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch {}
  for (const spec of STRATEGIES) {
    const saved = root?.strategies?.[spec.id];
    states.set(spec.id, saved?.date === dayIST() ? { ...emptyState(), ...saved, quantity: QUANTITY } : emptyState());
  }
}
function ema(values: number[], period: number, smoothed = false): number[] {
  if (!values.length) return [];
  const out = [values[0]], alpha = smoothed ? 1 / period : 2 / (period + 1);
  for (let i = 1; i < values.length; i += 1) out.push(values[i] * alpha + out[i - 1] * (1 - alpha));
  return out;
}
function rsi(values: number[], period = 14): number {
  if (values.length <= period) return 50;
  let gains = 0, losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) { const d = values[i] - values[i - 1]; gains += Math.max(0, d); losses += Math.max(0, -d); }
  return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
}
async function loadInstruments(): Promise<void> {
  if (instruments.length && Date.now() - instrumentsLoadedAt < 6 * 60 * 60_000) return;
  instruments = await (kite as any).getInstruments("NFO");
  instrumentsLoadedAt = Date.now();
  const today = dayIST();
  futuresInstrument = instruments.filter(row => row.name === "NIFTY" && row.instrument_type === "FUT" && String(row.expiry).slice(0, 10) >= today)
    .sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)))[0] || null;
  if (!futuresInstrument) throw new Error("NIFTY front-month future not found");
}
async function ltp(symbol: string): Promise<number> {
  const key = symbol.includes(":") ? symbol : `NFO:${symbol}`;
  const result = await (kite as any).getLTP([key]);
  return Number(result?.[key]?.last_price || 0);
}
async function optionFor(direction: Direction, spot: number): Promise<any | null> {
  await loadInstruments();
  const today = dayIST(), strike = Math.round(spot / 50) * 50;
  return instruments.filter(row => row.name === "NIFTY" && row.instrument_type === direction && Number(row.strike) === strike && String(row.expiry).slice(0, 10) >= today)
    .sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)))[0] || null;
}
function signal(spec: StrategySpec, all: Candle[], index: number): { direction?: Direction; note: string } {
  const candle = all[index], today = all.filter(c => candleDay(c) === candleDay(candle));
  const todayIndex = today.findIndex(c => c.date === candle.date), previous = today[todayIndex - 1];
  if (!previous || minutes(timeIST(candle.date)) < 570) return { note: "Waiting for eligible candle" };
  if (spec.kind === "SCHEDULED" || spec.kind === "OPENING" || spec.kind === "GAMMA") {
    const reference = today.find(c => timeIST(c.date) === spec.reference);
    if (!reference || minutes(timeIST(candle.date)) <= minutes(spec.reference!)) return { note: `Waiting for ${spec.reference} reference candle` };
    if (candle.close > reference.high + spec.buffer) return { direction: "CE", note: `${spec.reference} range high breakout` };
    if (candle.close < reference.low - spec.buffer) return { direction: "PE", note: `${spec.reference} range low breakout` };
    return { note: `${spec.reference} range intact` };
  }
  if (spec.kind === "BODY" || spec.kind === "HOLD") {
    const bodyHigh = Math.max(previous.open, previous.close), bodyLow = Math.min(previous.open, previous.close);
    const held = spec.kind !== "HOLD" || (today[todayIndex - 2] && (candle.close > Math.max(today[todayIndex - 2].open, today[todayIndex - 2].close) || candle.close < Math.min(today[todayIndex - 2].open, today[todayIndex - 2].close)));
    if (held && candle.close > bodyHigh + spec.buffer) return { direction: "CE", note: "Previous body high broken and held" };
    if (held && candle.close < bodyLow - spec.buffer) return { direction: "PE", note: "Previous body low broken and held" };
    return { note: "Watching candle body range" };
  }
  const closes = all.slice(0, index + 1).map(c => c.close), score = rsi(closes), fast = ema(closes, spec.indicator === "PIVOT" ? 20 : 9, spec.indicator === "SMMA").slice(-1)[0], slow = ema(closes, spec.indicator === "PIVOT" ? 50 : 21, spec.indicator === "SMMA").slice(-1)[0];
  if (!fast || !slow) return { note: "Waiting for indicator history" };
  if (fast > slow && score >= 52) return { direction: "CE", note: `${spec.indicator} bullish trend; RSI ${score.toFixed(1)}` };
  if (fast < slow && score <= 48) return { direction: "PE", note: `${spec.indicator} bearish trend; RSI ${score.toFixed(1)}` };
  return { note: `${spec.indicator} has no qualified trend` };
}
async function enter(spec: StrategySpec, state: StrategyState, direction: Direction, candle: Candle, note: string): Promise<void> {
  state.inTrade = true; state.direction = direction; state.entry = candle.close; state.ltp = candle.close; state.entryAt = candle.date;
  state.stopLoss = direction === "CE" ? state.entry - spec.stopPoints : state.entry + spec.stopPoints; state.target = 0; state.phase = "RUNNING"; state.trades += 1;
  state.futuresSymbol = futuresInstrument?.tradingsymbol || "NIFTY FUTURES";
  const option = await optionFor(direction, candle.close).catch(() => null);
  if (option) { state.optionSymbol = option.tradingsymbol; state.optionEntry = await ltp(option.tradingsymbol).catch(() => 0); state.optionLtp = state.optionEntry; if (state.optionEntry > 0) state.optionTrades += 1; }
  state.tradeLog.push({ tradeId: `NIFTY-${spec.id}-${state.date}-${state.trades}`, date: state.date, entryTime: candle.date, dir: direction, entry: state.entry, premIn: state.optionEntry || null, symbol: state.optionSymbol, qty: QUANTITY, status: "OPEN", reason: note });
}
async function close(spec: StrategySpec, state: StrategyState, candle: Candle, reason: string, price = candle.close): Promise<void> {
  if (!state.inTrade || !state.direction) return;
  const points = state.direction === "CE" ? price - state.entry : state.entry - price, pnl = Math.round(points * QUANTITY);
  let optionExit = state.optionLtp;
  if (state.optionSymbol) optionExit = await ltp(state.optionSymbol).catch(() => optionExit);
  const optionPnl = state.optionEntry > 0 && optionExit > 0 ? Math.round((optionExit - state.optionEntry) * QUANTITY) : 0;
  state.realizedPnl += pnl; state.optionRealizedPnl += optionPnl;
  if (pnl > 0) state.wins += 1; else if (pnl < 0) state.losses += 1;
  if (optionPnl > 0) state.optionWins += 1; else if (optionPnl < 0) state.optionLosses += 1;
  const open = [...state.tradeLog].reverse().find(row => row.status === "OPEN");
  if (open) Object.assign(open, { exitTime: candle.date, exit: price, premOut: optionExit || null, pnlRs: pnl, optionPnl, status: "CLOSED", reason });
  state.inTrade = false; state.direction = null; state.entry = 0; state.stopLoss = 0; state.entryAt = null; state.optionSymbol = null; state.optionEntry = 0; state.optionLtp = 0; state.unrealizedPnl = 0; state.optionUnrealizedPnl = 0; state.phase = "COMPLETED";
}
async function evaluate(spec: StrategySpec, state: StrategyState, candles: Candle[], index: number): Promise<void> {
  const candle = candles[index], clock = timeIST(candle.date), minute = minutes(clock); state.ltp = candle.close;
  if (state.inTrade && state.optionSymbol) state.optionLtp = await ltp(state.optionSymbol).catch(() => state.optionLtp);
  if (state.inTrade && state.direction) {
    const points = state.direction === "CE" ? candle.close - state.entry : state.entry - candle.close;
    state.unrealizedPnl = Math.round(points * QUANTITY); state.optionUnrealizedPnl = state.optionEntry > 0 && state.optionLtp > 0 ? Math.round((state.optionLtp - state.optionEntry) * QUANTITY) : 0;
    const stopped = state.direction === "CE" ? candle.low <= state.stopLoss : candle.high >= state.stopLoss;
    if (stopped || minute >= 920) await close(spec, state, candle, stopped ? "Stop loss" : "EOD exit", stopped ? state.stopLoss : candle.close);
  } else if (minute < 920 && state.trades < spec.maxTrades) {
    const next = signal(spec, candles, index);
    if (next.direction) await enter(spec, state, next.direction, candle, next.note);
    else state.phase = minute > minutes(spec.reference || "09:15") ? "SCANNING" : "WAITING";
  }
  state.candleLog.push({ time: clock, number: state.candleLog.length + 1, open: candle.open, high: candle.high, low: candle.low, close: candle.close, status: state.inTrade ? "hold" : state.phase.toLowerCase(), side: state.direction, entry: state.inTrade ? state.entry : null, stopLoss: state.inTrade ? state.stopLoss : null, pnl: state.inTrade ? state.unrealizedPnl : null, note: state.phase });
  state.candleLog = state.candleLog.slice(-80); state.lastCandleKey = candleKey(candle);
}
async function candles(): Promise<Candle[]> {
  const now = nowIST(), to = new Date(Date.now() - 60_000), from = new Date(Date.now() - 14 * 86400000);
  const rows: any[] = await (kite as any).getHistoricalData(INDEX_TOKEN, "15minute", from, to, false);
  return (rows || []).map(row => ({ date: typeof row.date === "string" ? row.date : new Date(row.date).toISOString(), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume || 0) }));
}
function persist(market: any): void {
  const root: any = { schemaVersion: 2, underlying: "NIFTY", executionMode: "SHADOW", updatedAt: new Date().toISOString(), strategies: {} };
  const history: any = (() => { try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch { return { schemaVersion: 2, underlying: "NIFTY", strategies: {} }; } })();
  for (const spec of STRATEGIES) {
    const state = states.get(spec.id)!; root.strategies[spec.id] = state; history.strategies[spec.id] ||= {};
    history.strategies[spec.id][state.date] = { futuresPnl: state.realizedPnl + state.unrealizedPnl, optionPnl: state.optionRealizedPnl + state.optionUnrealizedPnl, trades: state.trades, optionTrades: state.optionTrades, wins: state.wins, losses: state.losses, optionWins: state.optionWins, optionLosses: state.optionLosses, quantity: QUANTITY, entry: state.entry, optionEntry: state.optionEntry, tradeLog: state.tradeLog };
  }
  history.updatedAt = root.updatedAt; atomicWrite(STATE_FILE, root); atomicWrite(HISTORY_FILE, history);
  atomicWrite(HEARTBEAT_FILE, { at: root.updatedAt, status: "RUNNING", process: "nifty-shadow", underlying: "NIFTY", executionMode: "SHADOW", quantity: QUANTITY, market, strategies: root.strategies });
}
async function tick(): Promise<void> {
  if (running) return; running = true;
  try {
    await loadInstruments(); const rows = await candles(); const today = rows.filter(c => candleDay(c) === dayIST());
    const indexLtp = await (async () => { const result = await (kite as any).getLTP(["NSE:NIFTY 50"]); return Number(result?.["NSE:NIFTY 50"]?.last_price || today[today.length - 1]?.close || 0); })();
    const futureLtp = futuresInstrument ? await ltp(futuresInstrument.tradingsymbol).catch(() => 0) : 0;
    for (const spec of STRATEGIES) {
      let state = states.get(spec.id)!; if (state.date !== dayIST()) { state = emptyState(); states.set(spec.id, state); }
      const last = state.lastCandleKey ? today.findIndex(c => candleKey(c) === state.lastCandleKey) : -1;
      for (let i = last + 1; i < today.length; i += 1) { const full = rows.findIndex(c => c.date === today[i].date); if (full >= 0) await evaluate(spec, state, rows, full); }
      if (indexLtp > 0) { state.ltp = indexLtp; if (state.inTrade && state.direction) state.unrealizedPnl = Math.round((state.direction === "CE" ? indexLtp - state.entry : state.entry - indexLtp) * QUANTITY); }
    }
    const open = today[0]?.open || indexLtp, high = Math.max(indexLtp, ...today.map(c => c.high)), low = Math.min(indexLtp, ...today.map(c => c.low));
    persist({ symbol: "NIFTY 50", open, current: indexLtp, high, low, movementPoints: indexLtp - open, rangePoints: high - low, futures: { symbol: futuresInstrument?.tradingsymbol || "NIFTY FUT", open: today[0]?.open || futureLtp, current: futureLtp, high: null, low: null, movementPoints: futureLtp && today[0]?.open ? futureLtp - today[0].open : null, rangePoints: null } });
  } finally { running = false; }
}
async function run(): Promise<void> {
  if (String(process.env.NIFTY_SHADOW_ENABLED || "true").toLowerCase() === "false") return;
  loadStates(); console.log(`[nifty-shadow] starting ${STRATEGIES.length} NIFTY strategies; execution is hard-locked to SHADOW`);
  await tick(); setInterval(() => tick().catch(error => { console.error(`[nifty-shadow] tick failed: ${error?.message || error}`); try { atomicWrite(HEARTBEAT_FILE, { at: new Date().toISOString(), status: "DEGRADED", executionMode: "SHADOW", underlying: "NIFTY", error: String(error?.message || error) }); } catch {} }), POLL_MS);
}
run().catch(error => { console.error(`[nifty-shadow] startup failed: ${error?.stack || error}`); process.exitCode = 1; });
