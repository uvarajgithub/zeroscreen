import { KiteConnect } from "kiteconnect";
import { config } from "./config";

const kite = new KiteConnect({ api_key: config.apiKey });
kite.setAccessToken(config.accessToken);

const INSTRUMENT_TOKEN = config.instrument.token;
const LTP_SYMBOL       = config.instrument.ltpSymbol;
const INSTRUMENT_NAME  = config.instrument.name;

let signalInstrumentTokenCache: number | null = null;
let signalInstrumentTokenCacheAt = 0;

function istDateStr(): string {
  const d = new Date(Date.now() + IST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function getSignalInstrumentToken(): Promise<number> {
  if ((config as any).activeStrategy !== "DRISHTI_V1") return INSTRUMENT_TOKEN;
  if (signalInstrumentTokenCache && Date.now() - signalInstrumentTokenCacheAt < 15 * 60 * 1000) {
    return signalInstrumentTokenCache;
  }
  const instruments: any[] = await kite.getInstruments("NFO");
  const today = istDateStr();
  const toExpiryStr = (expiry: any): string => {
    const d = new Date(expiry);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };
  const futures = instruments
    .filter(i => i.name === INSTRUMENT_NAME && i.instrument_type === "FUT" && toExpiryStr(i.expiry) >= today)
    .sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
  if (!futures.length) {
    throw new Error(`No ${INSTRUMENT_NAME} futures instrument found for DRISHTI signal candles`);
  }
  signalInstrumentTokenCache = Number(futures[0].instrument_token);
  signalInstrumentTokenCacheAt = Date.now();
  console.log(`[DRISHTI_SIGNAL_TOKEN] ${futures[0].tradingsymbol} token=${signalInstrumentTokenCache} expiry=${toExpiryStr(futures[0].expiry)}`);
  return signalInstrumentTokenCache;
}

// IST = UTC + 5:30
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

// Returns current time as an "IST epoch" — a millisecond value where
// getUTCHours/getUTCMinutes/getUTCDate etc. all yield IST values.
// Use ONLY for IST field reads and IST arithmetic. NOT a real UTC epoch.
function nowISTEpoch(): number {
  return Date.now() + IST_OFFSET_MS;
}

// Format an IST epoch (from nowISTEpoch) as "YYYY-MM-DD HH:MM:SS" for Kite API
function fmtIST(istEpochMs: number): string {
  const d = new Date(istEpochMs);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

// Returns the IST epoch of today's IST midnight (00:00:00 IST)
function istMidnightEpoch(): number {
  const now = nowISTEpoch();
  const d = new Date(now);
  return now - (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) * 1000 - d.getUTCMilliseconds();
}

// Returns {from, to} as IST API strings for the last completed 15-min candle window.
// backMin: how far back to set "from" (default 90 min = 6 candles)
function getISTCandleWindow(backMin: number = 90): { from: string; to: string } {
  const now = nowISTEpoch();
  const d = new Date(now);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  const mins = h * 60 + m;
  const candleStartMin = Math.floor(mins / 15) * 15;
  const midnight = now - (h * 3600 + m * 60 + d.getUTCSeconds()) * 1000 - d.getUTCMilliseconds();
  const candleStartMs = midnight + candleStartMin * 60_000;
  return {
    from: fmtIST(candleStartMs - backMin * 60_000),
    to:   fmtIST(candleStartMs - 60_000),   // 1 min before current candle start
  };
}

// Wrap any promise with a timeout — throws if not resolved within `ms` milliseconds
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms))
  ]);
}

// Fetch previous completed 15-min candle for BANKNIFTY
export async function getPreviousCandle() {
  const { from, to } = getISTCandleWindow(90);

  const data = await withTimeout(
    kite.getHistoricalData(await getSignalInstrumentToken(), "15minute", from, to, false),
    8000, "getPreviousCandle"
  );
  const candles = data as any[];

  if (!candles || candles.length < 1) throw new Error(`Not enough candle data (got ${candles?.length ?? 0})`);

  // Last candle is the most recently COMPLETED 15-min candle (forming candle excluded by to)
  const prev = candles[candles.length - 1];
  // Use candle open time as stable key — it never changes for a completed candle
  const dateStr = prev.date ? String(prev.date) : `${prev.open}_${prev.high}_${prev.low}`;
  return { open: prev.open, high: prev.high, low: prev.low, close: prev.close, date: dateStr };
}

// Return the last TWO completed 15-min candles: [olderCandle, newerCandle]
// Used on bot startup to immediately detect if the latest candle already broke the prior one.
export async function getTwoLastCandles(): Promise<[any, any]> {
  const { from, to } = getISTCandleWindow(90);

  const data = await kite.getHistoricalData(await getSignalInstrumentToken(), "15minute", from, to, false);
  const candles = data as any[];
  if (!candles || candles.length < 2) throw new Error(`Need at least 2 candles, got ${candles?.length ?? 0}`);

  const toCandle = (c: any) => ({
    open: c.open, high: c.high, low: c.low, close: c.close,
    date: c.date ? String(c.date) : `${c.open}_${c.high}_${c.low}`
  });
  return [toCandle(candles[candles.length - 2]), toCandle(candles[candles.length - 1])];
}

// Find the last STRUCTURE candle (the last candle that broke the prior one's high or low)
// and the most recently completed candle.
// Inside bars are skipped — they don't update the structure reference.
export async function getStructureSeed(): Promise<{ refCandle: any; currentCandle: any }> {
  const { from, to } = getISTCandleWindow(10 * 15); // look back 10 candles

  const data = await withTimeout(
    kite.getHistoricalData(await getSignalInstrumentToken(), "15minute", from, to, false),
    8000, "getStructureSeed"
  );
  const candles = data as any[];
  if (!candles || candles.length < 2) throw new Error(`Need at least 2 candles for structure seed, got ${candles?.length ?? 0}`);

  const toCandle = (c: any) => ({
    open: c.open, high: c.high, low: c.low, close: c.close,
    date: c.date ? String(c.date) : `${c.open}_${c.high}_${c.low}`
  });

  // Walk forward through all candles EXCEPT the last one.
  // Track the "structure candle" — the last one that broke the prior reference's high or low.
  // Inside bars (within the reference's range) are ignored.
  let refCandle = candles[0];
  for (let i = 1; i < candles.length - 1; i++) {
    if (candles[i].high > refCandle.high || candles[i].low < refCandle.low) {
      refCandle = candles[i]; // this candle broke structure — it becomes the new reference
    }
    // inside bar → refCandle unchanged
  }

  return {
    refCandle:     toCandle(refCandle),
    currentCandle: toCandle(candles[candles.length - 1]),
  };
}

// Fetch the CURRENT FORMING 15-min candle (live, in-progress)
// Returns the running high/low of the candle that is still building
export async function getCurrentCandle(): Promise<{ open: number; high: number; low: number; close: number }> {
  const nowMs = nowISTEpoch();
  const d = new Date(nowMs);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  const candleStartMin = Math.floor((h * 60 + m) / 15) * 15;
  const midnight = nowMs - (h * 3600 + m * 60 + d.getUTCSeconds()) * 1000 - d.getUTCMilliseconds();
  const from = fmtIST(midnight + candleStartMin * 60_000);
  const to   = fmtIST(nowMs);

  const data = await kite.getHistoricalData(await getSignalInstrumentToken(), "15minute", from, to, false);
  const candles = data as any[];
  if (!candles || candles.length < 1) throw new Error("No current candle data");

  const c = candles[candles.length - 1];
  return { open: c.open, high: c.high, low: c.low, close: c.close };
}

// Get swing high and swing low from last N completed 15-min candles
// swingHigh = highest high across all N candles (the "previous higher high")
// swingLow  = lowest low  across all N candles (the "previous lower low")
export async function getSwingLevels(n: number = 4): Promise<{ swingHigh: number; swingLow: number }> {
  const { from, to } = getISTCandleWindow((n + 1) * 15);

  const data = await kite.getHistoricalData(await getSignalInstrumentToken(), "15minute", from, to, false);
  const candles = data as any[];
  if (!candles || candles.length < 1) throw new Error("No swing candle data");

  const recent = candles.slice(-n);
  const swingHigh = Math.max(...recent.map((c: any) => c.high));
  const swingLow  = Math.min(...recent.map((c: any) => c.low));
  return { swingHigh, swingLow };
}

// Fetch last N 15-min candles and return avg body size (for sideways check)
export async function getAvgCandleSize(n: number = 5): Promise<number> {
  const nowMs = nowISTEpoch();
  const to   = fmtIST(nowMs);
  const from = fmtIST(nowMs - n * 15 * 60_000);

  const data = await kite.getHistoricalData(await getSignalInstrumentToken(), "15minute", from, to, false);
  const candles = data as any[];

  if (!candles || candles.length < 1) return 0;
  const total = candles.reduce((sum: number, c: any) => sum + Math.abs(c.close - c.open), 0);
  return total / candles.length;
}

// Calculate VWAP from today's 5-min candles
export async function getVWAP(): Promise<number> {
  const nowMs = nowISTEpoch();
  const to   = fmtIST(nowMs);
  // VWAP from 9:15 AM IST today
  const from = fmtIST(istMidnightEpoch() + (9 * 60 + 15) * 60_000);

  const data = await withTimeout(
    kite.getHistoricalData(await getSignalInstrumentToken(), "5minute", from, to, false),
    8000, "getVWAP"
  );
  const candles = data as any[];

  if (!candles || candles.length < 1) throw new Error("No candles for VWAP");

  let tpvSum = 0;
  let volSum = 0;
  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const volume = c.volume;
    tpvSum += typicalPrice * volume;
    volSum += volume;
  }
  return volSum > 0 ? tpvSum / volSum : candles[candles.length - 1].close;
}

// Fetch avg volume from last N 5-min candles
export async function getAvgVolume(n: number = 5): Promise<number> {
  const nowMs = nowISTEpoch();
  const to   = fmtIST(nowMs);
  const from = fmtIST(nowMs - n * 5 * 60_000);

  const data = await kite.getHistoricalData(await getSignalInstrumentToken(), "5minute", from, to, false);
  const candles = data as any[];

  if (!candles || candles.length < 1) return 0;
  return candles.reduce((sum: number, c: any) => sum + c.volume, 0) / candles.length;
}

// Fetch last N 5-min candles (for same-direction check in isStrongTrend)
export async function getRecentCandles(n: number = 2): Promise<any[]> {
  const nowMs = nowISTEpoch();
  const to   = fmtIST(nowMs);
  const from = fmtIST(nowMs - n * 5 * 60_000);

  const data = await kite.getHistoricalData(await getSignalInstrumentToken(), "5minute", from, to, false);
  const candles = data as any[];
  return candles.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
}

// Get today's open price of BANKNIFTY (for big move check)
export async function getDayOpenPrice(): Promise<number> {
  const openMs = istMidnightEpoch() + (9 * 60 + 15) * 60_000;
  const from = fmtIST(openMs);
  const to   = fmtIST(openMs + 15 * 60_000);

  const data = await kite.getHistoricalData(await getSignalInstrumentToken(), "day", from, to, false);
  const candles = data as any[];
  if (!candles || candles.length < 1) throw new Error("Cannot get day open price");
  return candles[0].open;
}


// Get previous trading day's high and low (PDH / PDL context)
export async function getPrevDayHL(): Promise<{ high: number; low: number }> {
  const todayMs = istMidnightEpoch();
  const from    = fmtIST(todayMs - 5 * 86_400_000); // 5 days back - handles weekends
  const to      = fmtIST(todayMs - 60_000);          // up to yesterday end
  const data    = await kite.getHistoricalData(await getSignalInstrumentToken(), "day", from, to, false);
  const candles = data as any[];
  if (!candles || candles.length < 1) throw new Error("Cannot get prev day high/low");
  const prev = candles[candles.length - 1];           // most recent completed trading day
  return { high: prev.high, low: prev.low };
}


// Get all 15-min candles from the previous trading day (for BHAV strategy)
export async function getPrevDayCandles(): Promise<{ open: number; high: number; low: number; close: number }[]> {
  const todayMs = istMidnightEpoch();
  // Go back up to 5 days to handle weekends/holidays
  const from    = fmtIST(todayMs - 5 * 86_400_000);
  const to      = fmtIST(todayMs - 60_000);  // up to yesterday end
  const data    = await kite.getHistoricalData(await getSignalInstrumentToken(), "15minute", from, to, false);
  const candles = data as any[];
  if (!candles || candles.length < 1) throw new Error("Cannot get prev day candles");
  // Group by date, take the most recent trading day
  const byDate: Record<string, any[]> = {};
  for (const c of candles) {
    const d = new Date(c.date).toISOString().slice(0, 10);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(c);
  }
  const dates = Object.keys(byDate).sort();
  const prevDate = dates[dates.length - 1];
  return byDate[prevDate].map((c: any) => ({
    open: +c.open, high: +c.high, low: +c.low, close: +c.close
  }));
}


// Get all 15-min candles completed today (from 9:15 AM IST to now)
export async function getTodayCandles(): Promise<{ open: number; high: number; low: number; close: number; date: string }[]> {
  const todayMs = istMidnightEpoch();
  const from    = fmtIST(todayMs + (9 * 60 + 15) * 60_000);  // 9:15 AM today
  const to      = fmtIST(nowISTEpoch() - 60_000);             // 1 minute ago
  const data    = await kite.getHistoricalData(await getSignalInstrumentToken(), "15minute", from, to, false);
  const candles = data as any[];
  if (!candles || candles.length < 1) return [];
  return candles.map((c: any) => ({
    open: +c.open, high: +c.high, low: +c.low, close: +c.close,
    date: typeof c.date === "string" ? c.date : new Date(c.date).toISOString(),
  }));
}

// Fetch a recent 5-min candle for early entry momentum check
export async function getLatest5MinCandle() {
  const nowMs = nowISTEpoch();
  const to   = fmtIST(nowMs);
  const from = fmtIST(nowMs - 15 * 60_000);

  const data = await kite.getHistoricalData(await getSignalInstrumentToken(), "5minute", from, to, false);
  const candles = data as any[];

  if (!candles || candles.length < 1) throw new Error("No 5-min candle data");
  const c = candles[candles.length - 1];
  return { open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
}

// Get live LTP for BANKNIFTY index

export async function getLatest1MinCandle() {
  const { from, to } = getISTCandleWindow(5);
  try {
    const data = await withTimeout(
      kite.getHistoricalData(await getSignalInstrumentToken(), "minute", from, to, false),
      5000, "getLatest1MinCandle"
    );
    if (!data || data.length < 2) return null;
    const c = data[data.length - 2];
    return { open: +c.open, high: +c.high, low: +c.low, close: +c.close, date: c.date };
  } catch { return null; }
}

export async function getCurrentPrice(): Promise<number> {
  const quote = await withTimeout(kite.getLTP([LTP_SYMBOL]), 5000, "getCurrentPrice");
  return (quote as any)[LTP_SYMBOL].last_price;
}

// Fetch option chain and pick best strike (premium 400–600, highest volume)
export async function getBestOptionSymbol(direction: "CE" | "PE"): Promise<string> {
  // Step 1: Get live BANKNIFTY spot price for ATM calculation
  const ltpData: any = await kite.getLTP([LTP_SYMBOL]);
  const spotPrice: number = ltpData[LTP_SYMBOL]?.last_price ?? 0;
  if (!spotPrice) throw new Error("Could not fetch BANKNIFTY spot price for option selection");

  // Step 2: ATM strike = nearest 100
  const atmStrike = Math.round(spotPrice / 100) * 100;

  // Step 3: Get NFO instruments, filter BANKNIFTY options nearest expiry
  const instruments: any[] = await kite.getInstruments("NFO");

  // Use pure UTC arithmetic — avoids toLocaleDateString locale/ICU issues on Windows Node.js
  // IST = UTC + 5:30. Shift now to IST and read the UTC date fields as the IST date.
  const nowIST = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000);
  const todayIST = `${nowIST.getUTCFullYear()}-${String(nowIST.getUTCMonth() + 1).padStart(2, '0')}-${String(nowIST.getUTCDate()).padStart(2, '0')}`;

  // kiteconnect returns i.expiry as a Date at midnight UTC (e.g. 2026-05-26T00:00:00Z).
  // Extract YYYY-MM-DD directly from UTC fields — this equals the IST date for midnight-UTC dates.
  const toExpiryStr = (expiry: any): string => {
    const d = new Date(expiry);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  };

  const bankniftyOptions = instruments.filter(i =>
    i.name === INSTRUMENT_NAME &&
    i.instrument_type === direction &&
    toExpiryStr(i.expiry) >= todayIST
  );
  console.log(`Option filter: todayIST=${todayIST}, raw found=${bankniftyOptions.length}`);
  if (!bankniftyOptions.length) throw new Error(`No BANKNIFTY ${direction} options found in NFO instruments (todayIST=${todayIST})`);

  bankniftyOptions.sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
  const nearestExpiry = bankniftyOptions[0].expiry;
  const nearestExpiryStr = toExpiryStr(nearestExpiry);
  const thisWeek = bankniftyOptions.filter(i => toExpiryStr(i.expiry) === nearestExpiryStr);
  console.log(`Option filter: nearestExpiry=${nearestExpiryStr}, thisWeek=${thisWeek.length} strikes`);

  // Step 4: Sort by proximity to ATM, take 50 nearest strikes
  // (weekly ATM ~500 premium, monthly ATM ~1000 premium → need wider range to find 400-600 OTM)
  thisWeek.sort((a, b) => Math.abs(a.strike - atmStrike) - Math.abs(b.strike - atmStrike));
  const nearATM = thisWeek.slice(0, 50);

  // Step 5: Fetch live quotes for these strikes
  const tokens = nearATM.map(i => `NFO:${i.tradingsymbol}`);
  const quotes: any = await kite.getQuote(tokens);

  // Step 6: Pick strike with premium in 400-600 range from nearest expiry only
  // e.g. at spot 56100, 55500CE/55600CE (ITM) have ~500-600 premium on April expiry
  const MIN_PREMIUM = 400;
  const MAX_PREMIUM = 600;
  const allCandidates = nearATM
    .map(i => {
      const q   = quotes[`NFO:${i.tradingsymbol}`];
      const ltp = q?.last_price ?? 0;
      const oi  = q?.oi ?? 0;
      return { symbol: i.tradingsymbol, strike: i.strike, ltp, oi };
    })
    .filter(c => c.ltp > 5);

  const inRange = allCandidates.filter(c => c.ltp >= MIN_PREMIUM && c.ltp <= MAX_PREMIUM);
  // Fallback: when no option in 400-600 range (e.g. monthly expiry with high premiums),
  // pick nearest-ATM strike with OI > 0 so delta stays ~0.5
  const candidates = inRange.length
    ? inRange.sort((a, b) => b.oi - a.oi)
    : allCandidates
        .filter(c => c.oi > 0)
        .sort((a, b) => Math.abs(a.strike - atmStrike) - Math.abs(b.strike - atmStrike));

  if (!candidates.length) throw new Error(`No liquid ${direction} option found near ATM ${atmStrike} (spot: ${spotPrice})`);

  const best = candidates[0];
  console.log(`Selected option: ${best.symbol} | Strike: ${best.strike} | LTP: ${best.ltp} | OI: ${best.oi} | Expiry: ${nearestExpiry}`);
  return best.symbol;
}

// Get today's day high, day low, open, close for a traded option symbol
export async function getOptionDayOHLC(symbol: string): Promise<{ open: number; high: number; low: number; close: number }> {
  const key = `NFO:${symbol}`;
  const data: any = await kite.getOHLC([key]);
  const ohlc = data[key]?.ohlc;
  if (!ohlc) throw new Error(`No OHLC data for ${symbol}`);
  return { open: ohlc.open, high: ohlc.high, low: ohlc.low, close: ohlc.close };
}

// Get live LTP of a traded option symbol
export async function getOptionLTP(symbol: string): Promise<number> {
  const key = `NFO:${symbol}`;
  const data: any = await kite.getLTP([key]);
  return data[key]?.last_price ?? 0;
}

// ── ITM_HOLD strategy: select nearest monthly-expiry ITM option ──────────────
// Monthly expiry = last Thursday of the month (next Thursday is in a different month)
// strikeOffset: pts in the money (1000 → delta ~0.8)
// minDTE: must have at least this many calendar days to expiry at entry
export async function getITMMonthlyOptionSymbol(
  direction: "CE" | "PE",
  strikeOffset: number,
  minDTE: number
): Promise<string> {
  // Step 1: spot price
  const ltpData: any = await withTimeout(kite.getLTP([LTP_SYMBOL]), 8000, "getLTP");
  const spot: number = ltpData[LTP_SYMBOL]?.last_price ?? 0;
  if (!spot) throw new Error("Could not fetch BANKNIFTY spot price for ITM option selection");

  // Step 2: target ITM strike
  const itmStrike = direction === "CE"
    ? Math.round((spot - strikeOffset) / 100) * 100
    : Math.round((spot + strikeOffset) / 100) * 100;

  // Step 3: all NFO instruments
  const instruments: any[] = await withTimeout(kite.getInstruments("NFO"), 15000, "getInstruments");

  // Today in IST (pure UTC arithmetic avoids locale issues on Windows)
  const nowIST = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000);
  const todayStr = `${nowIST.getUTCFullYear()}-${String(nowIST.getUTCMonth() + 1).padStart(2, "0")}-${String(nowIST.getUTCDate()).padStart(2, "0")}`;

  const toExpiryStr = (expiry: any): string => {
    const d = new Date(expiry);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };

  // Monthly expiry = last Thursday of month: next Thursday (7 days later) is in a different month
  const isMonthlyExpiry = (expiryStr: string): boolean => {
    const d = new Date(expiryStr + "T00:00:00Z");
    if (d.getUTCDay() !== 4) return false; // not Thursday
    const nextThursday = new Date(d.getTime() + 7 * 24 * 3600 * 1000);
    return nextThursday.getUTCMonth() !== d.getUTCMonth();
  };

  const dteDays = (expiryStr: string): number => {
    const exp = new Date(expiryStr + "T00:00:00Z");
    const now = new Date(todayStr + "T00:00:00Z");
    return Math.floor((exp.getTime() - now.getTime()) / (24 * 3600 * 1000));
  };

  // Step 4: find nearest monthly expiry with >= minDTE days remaining
  const validExpiries = [...new Set(
    instruments
      .filter(i => i.name === INSTRUMENT_NAME && i.instrument_type === direction)
      .map(i => toExpiryStr(i.expiry))
      .filter(exp => exp >= todayStr && isMonthlyExpiry(exp) && dteDays(exp) >= minDTE)
  )].sort();

  if (!validExpiries.length) {
    throw new Error(`No monthly ${direction} expiry found with DTE >= ${minDTE} (today: ${todayStr})`);
  }
  const targetExpiry = validExpiries[0];

  // Step 5: find strikes available for that expiry, sorted by proximity to itmStrike
  const candidates = instruments.filter(i =>
    i.name === INSTRUMENT_NAME &&
    i.instrument_type === direction &&
    toExpiryStr(i.expiry) === targetExpiry
  ).sort((a, b) => Math.abs(a.strike - itmStrike) - Math.abs(b.strike - itmStrike));

  if (!candidates.length) throw new Error(`No ${direction} strikes for expiry ${targetExpiry}`);

  // Step 6: fetch live quotes for top 5 closest strikes, pick first with LTP >= 50
  const top5 = candidates.slice(0, 5);
  const tokens = top5.map(i => `NFO:${i.tradingsymbol}`);
  const quotes: any = await withTimeout(kite.getQuote(tokens), 8000, "getQuote ITM");

  const liquid = top5.find(i => (quotes[`NFO:${i.tradingsymbol}`]?.last_price ?? 0) >= 50);
  if (!liquid) throw new Error(`No liquid ITM ${direction} option near strike ${itmStrike} (spot: ${spot})`);

  const ltp = quotes[`NFO:${liquid.tradingsymbol}`]?.last_price ?? 0;
  console.log(`ITM Monthly selected: ${liquid.tradingsymbol} | strike: ${liquid.strike} | expiry: ${targetExpiry} | spot: ${spot} | LTP: ${ltp} | DTE: ${dteDays(targetExpiry)}`);
  return liquid.tradingsymbol;
}

