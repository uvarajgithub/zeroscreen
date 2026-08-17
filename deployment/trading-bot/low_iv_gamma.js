// BANKNIFTY Low-IV Gamma Breakout — SHADOW ONLY.
// This module deliberately has no broker-execution dependency and cannot place orders.
"use strict";

const fs = require("fs");

const STATE_FILE = "low-iv-gamma-shadow-state.json";
const HEARTBEAT_FILE = "low-iv-gamma-heartbeat.json";
const CONFIG_FILE = "low-iv-gamma-config.json";
const DEFAULTS = {
  enabled: true,
  executionMode: "SHADOW",
  underlying: "BANKNIFTY_FUTURES",
  candleInterval: "5minute",
  openingRangeStart: "09:15",
  openingRangeEnd: "10:15",
  entryEnd: "13:30",
  forceExit: "15:10",
  ivSnapshotLatest: "10:25",
  ivContractionRatio: 0.90,
  nearAtmPct: 0.003,
  minBodyRatio: 0.60,
  minVolumeMultiple: 1.25,
  premiumLookback: 3,
  premiumStopPct: 0.18,
  riskPerTradePct: 0.005,
  maxDailyLossPct: 0.01,
  paperEquityRs: 1000000,
  maxSpreadPct: 0.025,
  minOpenInterest: 1000,
  maxQuoteAgeSec: 90,
  allowExpiryDay: false,
  allowReentry: false,
  gammaFilterEnabled: false,
  minGamma: 0,
  riskFreeRate: 0.065,
  eventDates: [],
};

function readConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return { ...DEFAULTS, ...(parsed || {}), executionMode: "SHADOW" };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

function atomicJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function istParts(value = new Date()) {
  const d = new Date(value.getTime() + 19800000);
  return {
    day: d.toISOString().slice(0, 10),
    hhmm: d.toISOString().slice(11, 16),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}
function kiteDateTimeIST(value) { const d = new Date(value.getTime() + 19800000).toISOString(); return `${d.slice(0, 10)} ${d.slice(11, 19)}`; }

function candleTime(c) { return istParts(new Date(c.date)).hhmm; }
function finite(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function round(v, dp = 2) { const p = 10 ** dp; return Math.round(Number(v) * p) / p; }
function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function safeMessage(e) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const nested = e.message || e.error?.message || e.error || e.data?.message;
    if (nested) return typeof nested === "string" ? nested : JSON.stringify(nested);
    try { return JSON.stringify(e); } catch (_) {}
  }
  return String(e);
}

function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const p = 1 - d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? p : 1 - p;
}

function normalPdf(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }

function bsPrice(spot, strike, years, rate, vol, type) {
  if (!(spot > 0 && strike > 0 && years > 0 && vol > 0)) return 0;
  const rootT = Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + vol * vol / 2) * years) / (vol * rootT);
  const d2 = d1 - vol * rootT;
  return type === "CE"
    ? spot * normalCdf(d1) - strike * Math.exp(-rate * years) * normalCdf(d2)
    : strike * Math.exp(-rate * years) * normalCdf(-d2) - spot * normalCdf(-d1);
}

function impliedVol(price, spot, strike, years, rate, type) {
  const intrinsic = type === "CE" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  if (!(price > intrinsic && years > 0)) return null;
  let lo = 0.01, hi = 5;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (bsPrice(spot, strike, years, rate, mid, type) > price) hi = mid;
    else lo = mid;
  }
  const result = (lo + hi) / 2;
  return result > 0.01 && result < 5 ? result : null;
}

function greeks(spot, strike, years, rate, vol, type) {
  if (!(vol > 0 && years > 0)) return { delta: null, gamma: null };
  const rootT = Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + vol * vol / 2) * years) / (vol * rootT);
  return {
    delta: type === "CE" ? normalCdf(d1) : normalCdf(d1) - 1,
    gamma: normalPdf(d1) / (spot * vol * rootT),
  };
}

function ema(values, period) {
  if (!values.length) return [];
  const k = 2 / (period + 1), out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function atr(candles, period = 14) {
  if (candles.length < 2) return null;
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    tr.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close)));
  }
  return tr.length >= period ? mean(tr.slice(-period)) : null;
}

function vwap(candles) {
  let pv = 0, volume = 0;
  for (const c of candles) {
    const v = Number(c.volume || 0);
    pv += ((c.high + c.low + c.close) / 3) * v;
    volume += v;
  }
  return volume > 0 ? pv / volume : null;
}

function blankState(day) {
  return {
    day, savedAt: new Date().toISOString(), phase: "PRE_OPEN", inTrade: false,
    completedTrades: 0, wins: 0, losses: 0, dayRs: 0, partialRealizedRs: 0,
    morningIv: null, morningAtm: null, morningIvAt: null, signal: null,
    position: null, log: [], candleLog: [], lastEvaluatedCandle: null,
    lastReason: "Waiting for market data", dataQuality: "WAITING", errors: 0,
  };
}

function createLowIvGammaShadow({ kite, log, logTrade }) {
  let cfg = readConfig();
  let instruments = null;
  let instrumentsDay = "";
  let running = false;
  let timer = null;
  const today = istParts().day;
  let state = blankState(today);
  try {
    const restored = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (restored && restored.day === today) state = { ...state, ...restored };
  } catch (_) {}

  function save() {
    state.savedAt = new Date().toISOString();
    atomicJson(STATE_FILE, state);
    heartbeat();
  }

  function event(name, details = {}) {
    const row = { at: new Date().toISOString(), event: name, ...details };
    state.candleLog.push(row);
    state.candleLog = state.candleLog.slice(-120);
    if (typeof log === "function") log(`LOW_IV_GAMMA_${name}`, details);
  }

  function heartbeat() {
    const p = state.position;
    const unrealized = p && p.lastPremium > 0 ? (p.lastPremium - p.entryPremium) * p.remainingQty : 0;
    const hb = {
      at: new Date().toISOString(), status: cfg.enabled ? state.phase : "DISABLED",
      mode: "SHADOW", strategy: "LOW_IV_GAMMA_BREAKOUT", lowIvGammaStrategy: true,
      lowIvGammaMode: "SHADOW", lowIvGammaPhase: state.phase,
      lowIvGammaInTrade: !!state.inTrade, lowIvGammaDir: p?.direction || state.signal?.direction || null,
      lowIvGammaOptionSymbol: p?.symbol || null, lowIvGammaOptionEntry: p?.entryPremium || null,
      lowIvGammaOptionLive: p?.lastPremium || null, lowIvGammaSL: p?.premiumStop || null,
      lowIvGammaPnL: round(state.dayRs + unrealized), lowIvGammaClosedPnL: round(state.dayRs),
      lowIvGammaTrades: state.completedTrades, lowIvGammaWins: state.wins, lowIvGammaLosses: state.losses,
      lowIvGammaLiveQty: p?.remainingQty || p?.qty || null, lowIvGammaEntryAt: p?.entryAt || null,
      lowIvGammaOptionVolume: p?.volume || null, lowIvGammaOptionOpenInterest: p?.oi || null,
      lowIvGammaTradeLog: state.log.slice(-20), lowIvGammaCandleLog: state.candleLog.slice(-40),
      lowIvGammaDataQuality: state.dataQuality, lowIvGammaLastReason: state.lastReason,
      lowIvGammaMorningIv: state.morningIv, lowIvGammaCurrentIv: p?.iv || null,
    };
    try { atomicJson(HEARTBEAT_FILE, hb); } catch (_) {}
  }

  async function loadInstruments(day) {
    if (instruments && instrumentsDay === day) return instruments;
    const rows = await kite.getInstruments("NFO");
    const valid = rows.filter(i => i.name === "BANKNIFTY");
    const futures = valid.filter(i => i.instrument_type === "FUT").sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
    const options = valid.filter(i => i.instrument_type === "CE" || i.instrument_type === "PE").sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
    if (!futures.length || !options.length) throw new Error("BANKNIFTY NFO instruments unavailable");
    instruments = { future: futures[0], options };
    instrumentsDay = day;
    return instruments;
  }

  function expiryYears(expiry) {
    const end = new Date(`${new Date(expiry).toISOString().slice(0, 10)}T15:40:00+05:30`).getTime();
    return Math.max((end - Date.now()) / (365 * 86400000), 1 / (365 * 24 * 60));
  }

  function optionFor(book, expiryMs, strike, type) {
    return book.options.find(o => new Date(o.expiry).getTime() === expiryMs && Math.round(Number(o.strike)) === Math.round(strike) && o.instrument_type === type);
  }

  function chainAt(book, underlying, itmType = null) {
    const futureExpiry = new Date(book.future.expiry).getTime();
    const expiryTimes = [...new Set(book.options.map(o => new Date(o.expiry).getTime()))].filter(t => t >= Date.now() - 86400000).sort((a, b) => a - b);
    const expiryMs = expiryTimes[0];
    if (!expiryMs) throw new Error("No current BANKNIFTY option expiry");
    const expiryOptions = book.options.filter(o => new Date(o.expiry).getTime() === expiryMs);
    const strikes = [...new Set(expiryOptions.map(o => Number(o.strike)).filter(Number.isFinite))].sort((a, b) => a - b);
    const atm = strikes.reduce((best, s) => Math.abs(s - underlying) < Math.abs(best - underlying) ? s : best, strikes[0]);
    const strikeIndex = strikes.indexOf(atm);
    let strike = atm;
    if (itmType === "CE" && strikeIndex > 0) strike = strikes[strikeIndex - 1];
    if (itmType === "PE" && strikeIndex < strikes.length - 1) strike = strikes[strikeIndex + 1];
    return { expiryMs, atm, strike, CE: optionFor(book, expiryMs, itmType ? strike : atm, "CE"), PE: optionFor(book, expiryMs, itmType ? strike : atm, "PE") };
  }

  async function quotes(symbols) {
    const keys = symbols.map(s => `NFO:${s}`);
    const result = await kite.getQuote(keys);
    return symbols.map((s, i) => result[keys[i]] || result[s] || null);
  }

  function quoteMetrics(q) {
    if (!q) return null;
    const bid = finite(q.depth?.buy?.[0]?.price), ask = finite(q.depth?.sell?.[0]?.price), ltp = finite(q.last_price);
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : ltp;
    const spreadPct = bid > 0 && ask > 0 && mid > 0 ? (ask - bid) / mid : null;
    const stamp = q.timestamp || q.last_trade_time;
    const ageSec = stamp ? Math.max(0, (Date.now() - new Date(stamp).getTime()) / 1000) : null;
    return { ltp, mid, bid, ask, spreadPct, ageSec, volume: finite(q.volume), oi: finite(q.oi) };
  }

  function optionAnalytics(instrument, q, underlying) {
    const m = quoteMetrics(q);
    if (!m || !(m.mid > 0)) return null;
    const years = expiryYears(instrument.expiry);
    const iv = impliedVol(m.mid, underlying, Number(instrument.strike), years, cfg.riskFreeRate, instrument.instrument_type);
    const g = greeks(underlying, Number(instrument.strike), years, cfg.riskFreeRate, iv, instrument.instrument_type);
    return { ...m, iv, ...g, years };
  }

  async function history(token, from, to, oi = false) {
    const kiteFrom = from instanceof Date ? kiteDateTimeIST(from) : from;
    const kiteTo = to instanceof Date ? kiteDateTimeIST(to) : to;
    const rows = await kite.getHistoricalData(Number(token), "5minute", kiteFrom, kiteTo, false, oi);
    return (rows || []).map(c => ({ ...c, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close), volume: Number(c.volume || 0), oi: Number(c.oi || 0) }));
  }

  async function historyIncludingToday(token, from, now, oi = false) {
    const day = istParts(now).day;
    const todayStart = new Date(`${day}T00:00:00+05:30`);
    if (from.getTime() >= todayStart.getTime()) return history(token, from, now, oi);
    // Kite limits a historical response to 250 rows. Keep the warm-up window,
    // but fetch today's candles separately so the opening range cannot be
    // pushed out of the response by older five-minute bars.
    const [prior, todayRows] = await Promise.all([
      history(token, from, new Date(todayStart.getTime() - 1000), oi),
      history(token, todayStart, now, oi),
    ]);
    const byTime = new Map();
    for (const candle of [...prior, ...todayRows]) byTime.set(new Date(candle.date).getTime(), candle);
    return [...byTime.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  function completedCandles(rows, now) {
    return rows.filter(c => new Date(c.date).getTime() + 5 * 60000 <= now.getTime() + 1000);
  }

  function liquidityReason(a) {
    if (!a || !(a.ltp > 0) || !(a.iv > 0)) return "OPTION_PRICE_OR_IV_UNAVAILABLE";
    if (a.spreadPct === null) return "BID_ASK_DEPTH_UNAVAILABLE";
    if (a.spreadPct > cfg.maxSpreadPct) return `SPREAD_TOO_WIDE_${round(a.spreadPct * 100, 2)}PCT`;
    if (!(a.oi >= cfg.minOpenInterest)) return `OPEN_INTEREST_BELOW_${cfg.minOpenInterest}`;
    if (a.ageSec !== null && a.ageSec > cfg.maxQuoteAgeSec) return `STALE_OPTION_QUOTE_${Math.round(a.ageSec)}S`;
    return null;
  }

  async function takeMorningIv(book, underlying, nowParts) {
    if (state.morningIv || nowParts.hhmm < cfg.openingRangeEnd) return;
    if (nowParts.hhmm > cfg.ivSnapshotLatest) {
      state.phase = "BLOCKED";
      state.dataQuality = "MORNING_IV_MISSING";
      state.lastReason = "Morning ATM IV snapshot unavailable after restart";
      return;
    }
    const chain = chainAt(book, underlying);
    if (!chain.CE || !chain.PE) throw new Error("ATM CE/PE pair unavailable");
    const [ceQ, peQ] = await quotes([chain.CE.tradingsymbol, chain.PE.tradingsymbol]);
    const ce = optionAnalytics(chain.CE, ceQ, underlying), pe = optionAnalytics(chain.PE, peQ, underlying);
    if (!(ce?.iv > 0 && pe?.iv > 0)) throw new Error("Morning ATM IV calculation unavailable");
    state.morningIv = (ce.iv + pe.iv) / 2;
    state.morningAtm = chain.atm;
    state.morningIvAt = new Date().toISOString();
    state.phase = "SCANNING";
    state.dataQuality = "GOOD";
    state.lastReason = "Morning ATM IV captured";
    event("MORNING_IV", { atm: chain.atm, iv: round(state.morningIv * 100, 2) });
  }

  async function enter(signal, instrument, analytics, underlying, candle) {
    const riskPerUnit = analytics.ltp * cfg.premiumStopPct;
    const riskBudget = cfg.paperEquityRs * cfg.riskPerTradePct;
    const lot = Number(instrument.lot_size || 1);
    const lots = Math.floor(riskBudget / (riskPerUnit * lot));
    const qty = lots * lot;
    if (qty < lot) {
      state.phase = "BLOCKED";
      state.lastReason = `Risk budget Rs${round(riskBudget)} cannot support one lot (risk Rs${round(riskPerUnit * lot)})`;
      event("ENTRY_REJECTED_RISK", { riskBudget, oneLotRisk: riskPerUnit * lot, lot });
      return;
    }
    state.position = {
      tradeId: `LIG-${state.day}-${signal.direction}-${Date.now()}`,
      direction: signal.direction, symbol: instrument.tradingsymbol, strike: Number(instrument.strike), expiry: new Date(instrument.expiry).toISOString().slice(0, 10),
      entryAt: new Date().toISOString(), entryPremium: analytics.ltp, lastPremium: analytics.ltp,
      entryUnderlying: underlying, breakoutLevel: signal.direction === "CE" ? signal.high : signal.low,
      underlyingStop: signal.direction === "CE" ? signal.low : signal.high,
      premiumStop: analytics.ltp * (1 - cfg.premiumStopPct), initialRisk: riskPerUnit,
      qty, remainingQty: qty, lotSize: lot, realizedRs: 0, target1: false, target2: false,
      iv: analytics.iv, gamma: analytics.gamma, delta: analytics.delta, oi: analytics.oi, volume: analytics.volume,
      signalCandle: candle.date,
      entryVwap: signal.vwap,
    };
    state.inTrade = true;
    state.signal = null;
    state.phase = "IN_TRADE";
    state.lastReason = "Confirmed next-candle option entry";
    event("SHADOW_ENTRY", { symbol: instrument.tradingsymbol, direction: signal.direction, premium: analytics.ltp, qty, iv: round(analytics.iv * 100, 2), gamma: analytics.gamma });
  }

  function exitPosition(premium, underlying, reason) {
    const p = state.position;
    if (!p) return;
    const finalRs = (premium - p.entryPremium) * p.remainingQty;
    const pnlRs = round(p.realizedRs + finalRs);
    const row = {
      tradeId: p.tradeId, date: new Date().toISOString(), type: "LOW_IV_GAMMA_OPT",
      direction: p.direction, symbol: p.symbol, entryPrice: p.entryUnderlying, exitPrice: underlying,
      premiumEntry: p.entryPremium, premiumExit: premium, pnl: premium - p.entryPremium,
      pnlRs, qty: p.qty, reasonEntry: "low_iv_gamma_breakout_confirmed", reasonExit: reason,
      entryTime: p.entryAt, exitTime: new Date().toISOString(), status: "CLOSED", executionMode: "SHADOW",
      iv: p.iv, gamma: p.gamma, strike: p.strike, expiry: p.expiry,
    };
    state.dayRs = round(state.dayRs + finalRs);
    state.completedTrades += 1;
    if (pnlRs > 0) state.wins += 1; else if (pnlRs < 0) state.losses += 1;
    state.log.push(row); state.log = state.log.slice(-20);
    state.inTrade = false; state.position = null; state.signal = null;
    state.phase = state.completedTrades >= 1 ? "DONE" : "SCANNING";
    state.lastReason = reason;
    if (typeof logTrade === "function") logTrade(row);
    event("SHADOW_EXIT", { symbol: p.symbol, premium, pnlRs, reason });
  }

  async function monitorPosition(book, futuresCandles, futLtp, nowParts) {
    const p = state.position;
    if (!p) return;
    const instrument = book.options.find(o => o.tradingsymbol === p.symbol);
    if (!instrument) throw new Error(`Open option ${p.symbol} missing from instrument master`);
    const [q] = await quotes([p.symbol]);
    const a = optionAnalytics(instrument, q, futLtp);
    if (!a || !(a.ltp > 0)) { state.dataQuality = "OPTION_QUOTE_UNAVAILABLE"; return; }
    p.lastPremium = a.ltp; p.iv = a.iv; p.gamma = a.gamma; p.oi = a.oi; p.volume = a.volume;
    const last = futuresCandles[futuresCandles.length - 1];
    if (nowParts.hhmm >= cfg.forceExit) return exitPosition(a.ltp, futLtp, "FORCE_EXIT_1510");
    const projectedDayRs = state.dayRs + (a.ltp - p.entryPremium) * p.remainingQty;
    if (projectedDayRs <= -(cfg.paperEquityRs * cfg.maxDailyLossPct)) return exitPosition(a.ltp, futLtp, "DAILY_LOSS_LIMIT");
    if (a.ltp <= p.premiumStop) return exitPosition(a.ltp, futLtp, "PREMIUM_STOP_18PCT");
    const underlyingGuard = p.direction === "CE" ? Math.max(p.breakoutLevel, p.entryVwap || 0) : Math.min(p.breakoutLevel, p.entryVwap || Infinity);
    const spotStop = p.direction === "CE" ? last.close <= underlyingGuard : last.close >= underlyingGuard;
    if (spotStop) return exitPosition(a.ltp, futLtp, "UNDERLYING_BREAKOUT_CLOSE_STOP");
    const oneR = p.entryPremium + p.initialRisk, twoR = p.entryPremium + 2 * p.initialRisk;
    const takePartial = (stage) => {
      const desired = Math.floor((p.qty / 3) / p.lotSize) * p.lotSize;
      const exitQty = desired > 0 && p.remainingQty - desired >= p.lotSize ? desired : 0;
      if (exitQty > 0) {
        const realized = (a.ltp - p.entryPremium) * exitQty;
        p.realizedRs += realized; p.remainingQty -= exitQty; state.dayRs += realized;
        event("PARTIAL_EXIT", { stage, symbol: p.symbol, premium: a.ltp, qty: exitQty, realizedRs: round(realized), remainingQty: p.remainingQty });
      } else event("PARTIAL_SKIPPED_LOT_SIZE", { stage, qty: p.qty, lotSize: p.lotSize });
    };
    if (!p.target1 && a.ltp >= oneR) { p.target1 = true; takePartial("1R"); p.premiumStop = Math.max(p.premiumStop, p.entryPremium); event("TARGET_1R", { symbol: p.symbol, premium: a.ltp }); }
    if (!p.target2 && a.ltp >= twoR) { p.target2 = true; takePartial("2R"); p.premiumStop = Math.max(p.premiumStop, oneR); event("TARGET_2R", { symbol: p.symbol, premium: a.ltp }); }
    if (p.target2) {
      const from = new Date(Date.now() - 30 * 60000), optionBars = completedCandles(await history(instrument.instrument_token, from, new Date(), true), new Date());
      if (optionBars.length >= 2) p.premiumStop = Math.max(p.premiumStop, Math.min(...optionBars.slice(-2).map(c => c.low)));
    }
  }

  async function scan(book, allCandles, futLtp, nowParts) {
    if (!state.morningIv || state.completedTrades >= 1 || state.inTrade || nowParts.hhmm < cfg.openingRangeEnd || nowParts.hhmm > cfg.entryEnd) return;
    if (state.dayRs <= -(cfg.paperEquityRs * cfg.maxDailyLossPct)) { state.phase = "DONE"; state.lastReason = "Daily loss limit reached"; return; }
    if ((cfg.eventDates || []).includes(state.day)) { state.phase = "BLOCKED"; state.lastReason = "Configured event-date block"; return; }
    const todayBars = allCandles.filter(c => istParts(new Date(c.date)).day === state.day);
    const opening = todayBars.filter(c => candleTime(c) >= cfg.openingRangeStart && candleTime(c) < cfg.openingRangeEnd);
    if (opening.length < 12) { state.dataQuality = "OPENING_RANGE_INCOMPLETE"; state.lastReason = `Opening range has ${opening.length}/12 completed candles`; return; }
    state.dataQuality = "GOOD";
    const candidate = todayBars[todayBars.length - 1];
    const key = new Date(candidate.date).toISOString();
    if (state.signal) {
      const signalMs = new Date(state.signal.candleDate).getTime();
      const currentStart = Math.floor(Date.now() / 300000) * 300000;
      if (currentStart >= signalMs + 300000 && currentStart < signalMs + 600000) {
        const crossed = state.signal.direction === "CE" ? futLtp > state.signal.high : futLtp < state.signal.low;
        if (crossed) {
          const chain = chainAt(book, futLtp, state.signal.direction);
          const instrument = state.signal.direction === "CE" ? chain.CE : chain.PE;
          if (!instrument) throw new Error("Selected one-strike ITM option unavailable");
          const [q] = await quotes([instrument.tradingsymbol]);
          const a = optionAnalytics(instrument, q, futLtp), reject = liquidityReason(a);
          if (reject) { state.signal = null; state.phase = "SCANNING"; state.lastReason = reject; event("CONFIRM_REJECTED", { reason: reject }); return; }
          return enter(state.signal, instrument, a, futLtp, candidate);
        }
      } else if (currentStart >= signalMs + 600000) {
        event("SIGNAL_EXPIRED", { candle: state.signal.candleDate, direction: state.signal.direction });
        state.signal = null; state.phase = "SCANNING"; state.lastReason = "Next-candle confirmation not received";
      }
      return;
    }
    if (state.lastEvaluatedCandle === key || candleTime(candidate) < cfg.openingRangeEnd) return;
    state.lastEvaluatedCandle = key;
    const rangeHigh = Math.max(...opening.map(c => c.high)), rangeLow = Math.min(...opening.map(c => c.low));
    const closes = allCandles.map(c => c.close), e = ema(closes, 20), currentEma = e[e.length - 1], previousEma = e[e.length - 2];
    const todayThroughCandidate = todayBars.filter(c => new Date(c.date) <= new Date(candidate.date));
    const currentVwap = vwap(todayThroughCandidate), currentAtr = atr(allCandles.slice(-30), 14);
    const bodyRatio = Math.abs(candidate.close - candidate.open) / Math.max(candidate.high - candidate.low, 0.01);
    const prior5 = todayThroughCandidate.slice(-6, -1), avgVolume = mean(prior5.map(c => c.volume));
    if (!(currentVwap > 0 && currentAtr > 0 && avgVolume > 0)) { state.dataQuality = "INDICATOR_OR_VOLUME_UNAVAILABLE"; state.lastReason = "VWAP, ATR, or futures volume unavailable"; return; }
    const ceBreak = candidate.close > rangeHigh && candidate.close > currentVwap && currentEma > previousEma;
    const peBreak = candidate.close < rangeLow && candidate.close < currentVwap && currentEma < previousEma;
    const direction = ceBreak ? "CE" : peBreak ? "PE" : null;
    if (!direction) { state.phase = "SCANNING"; state.lastReason = "No opening-range/VWAP/EMA breakout"; return; }
    if (bodyRatio < cfg.minBodyRatio || candidate.volume < avgVolume * cfg.minVolumeMultiple) { state.lastReason = "Breakout candle body or volume filter failed"; return; }
    const atmChain = chainAt(book, futLtp), nearAtm = Math.abs(futLtp - atmChain.atm) / futLtp <= cfg.nearAtmPct;
    if (!nearAtm) { state.lastReason = "Underlying not near ATM"; return; }
    const [atmCeQ, atmPeQ] = await quotes([atmChain.CE.tradingsymbol, atmChain.PE.tradingsymbol]);
    const atmCe = optionAnalytics(atmChain.CE, atmCeQ, futLtp), atmPe = optionAnalytics(atmChain.PE, atmPeQ, futLtp);
    const currentIv = atmCe?.iv > 0 && atmPe?.iv > 0 ? (atmCe.iv + atmPe.iv) / 2 : null;
    if (!(currentIv > 0) || currentIv / state.morningIv > cfg.ivContractionRatio) { state.lastReason = "ATM IV has not contracted enough"; return; }
    const selectedChain = chainAt(book, futLtp, direction), selected = direction === "CE" ? selectedChain.CE : selectedChain.PE;
    if (!selected) throw new Error("One-strike ITM contract unavailable");
    if (!cfg.allowExpiryDay && istParts(new Date(selected.expiry)).day === state.day) { state.phase = "BLOCKED"; state.lastReason = "Expiry-day entries disabled"; return; }
    const [selectedQ] = await quotes([selected.tradingsymbol]);
    const a = optionAnalytics(selected, selectedQ, futLtp), reject = liquidityReason(a);
    if (reject) { state.lastReason = reject; return; }
    if (cfg.gammaFilterEnabled && !(a.gamma >= cfg.minGamma)) { state.lastReason = "Gamma filter failed"; return; }
    const optFrom = new Date(Date.now() - 60 * 60000), optBars = completedCandles(await history(selected.instrument_token, optFrom, new Date(), true), new Date());
    const previous = optBars.filter(c => new Date(c.date) < new Date(candidate.date)).slice(-cfg.premiumLookback);
    const optionSignalBar = optBars.find(c => new Date(c.date).getTime() === new Date(candidate.date).getTime());
    if (previous.length < cfg.premiumLookback || !optionSignalBar || !(optionSignalBar.high > Math.max(...previous.map(c => c.high)))) { state.lastReason = "Option premium signal candle has not broken previous three highs"; return; }
    state.signal = { direction, candleDate: candidate.date, high: candidate.high, low: candidate.low, optionSymbol: selected.tradingsymbol, currentIv, atr: currentAtr, vwap: currentVwap };
    state.phase = "WAIT_CONFIRMATION"; state.lastReason = "Breakout found; waiting for next-candle confirmation";
    event("SIGNAL", { direction, candle: key, option: selected.tradingsymbol, ivRatio: round(currentIv / state.morningIv, 3), bodyRatio: round(bodyRatio, 3), volumeMultiple: round(candidate.volume / avgVolume, 2) });
  }

  async function runOnce(now = new Date()) {
    if (running) return;
    running = true;
    try {
      cfg = readConfig();
      const parts = istParts(now);
      if (state.day !== parts.day) { state = blankState(parts.day); save(); }
      if (!cfg.enabled) { state.phase = "DISABLED"; state.lastReason = "Disabled by configuration"; return heartbeat(); }
      if (cfg.executionMode !== "SHADOW") throw new Error("Execution mode safety invariant violated");
      const weekday = new Date(now.getTime() + 19800000).getUTCDay();
      if (weekday === 0 || weekday === 6) { state.phase = "MARKET_CLOSED"; state.lastReason = "Weekend"; return heartbeat(); }
      if (parts.hhmm < "09:10" || parts.hhmm > "15:40") { state.phase = parts.hhmm < "09:10" ? "PRE_OPEN" : "MARKET_CLOSED"; return heartbeat(); }
      const book = await loadInstruments(parts.day);
      const [futQuote] = await quotes([book.future.tradingsymbol]);
      const futLtp = quoteMetrics(futQuote)?.ltp;
      if (!(futLtp > 0)) throw new Error("BANKNIFTY futures quote unavailable");
      // Seven calendar days guarantees Friday warm-up data on Monday for EMA20/ATR14.
      const from = new Date(now.getTime() - 7 * 86400000), rows = completedCandles(await historyIncludingToday(book.future.instrument_token, from, now, true), now);
      if (!rows.length) throw new Error("No completed BANKNIFTY futures 5-minute candles");
      await takeMorningIv(book, futLtp, parts);
      if (state.inTrade) await monitorPosition(book, rows, futLtp, parts);
      else await scan(book, rows, futLtp, parts);
      state.dataQuality = state.dataQuality === "WAITING" ? "GOOD" : state.dataQuality;
      state.errors = 0;
      save();
    } catch (e) {
      state.errors += 1; state.dataQuality = "ERROR"; state.lastReason = safeMessage(e);
      event("ERROR", { error: safeMessage(e), consecutive: state.errors });
      save();
    } finally { running = false; }
  }

  function start() {
    heartbeat();
    setTimeout(() => runOnce(), 3000);
    timer = setInterval(() => runOnce(), 15000);
    return timer;
  }

  return { start, runOnce, getState: () => JSON.parse(JSON.stringify(state)), stop: () => timer && clearInterval(timer) };
}

module.exports = { createLowIvGammaShadow, impliedVol, bsPrice, greeks, ema, atr, vwap };
