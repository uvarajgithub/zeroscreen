"use strict";

const fs = require("fs");
const path = require("path");
const { KiteConnect } = require("kiteconnect");
const ENGINE_FILE = process.env.LOW_IV_GAMMA_MODULE || path.join(__dirname, "..", "..", "deployment", "trading-bot", "low_iv_gamma.js");
const { impliedVol, ema, atr, vwap } = require(ENGINE_FILE);

const BOT_DIR = process.env.TRADING_BOT_DIR || "/home/ubuntu/trading-bot";
require("dotenv").config({ path: path.join(BOT_DIR, ".env") });
const CONFIG = JSON.parse(fs.readFileSync(path.join(BOT_DIR, "low-iv-gamma-config.json"), "utf8"));
const FROM = process.argv[2] || "2026-07-29";
const TO = process.argv[3] || "2026-07-31";
const OUTPUT = process.argv[4] || path.join(BOT_DIR, "low-iv-gamma-backtest.json");
const RATE = Number(CONFIG.riskFreeRate || 0.065);
const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const round = (v, dp = 2) => Math.round(Number(v) * 10 ** dp) / 10 ** dp;
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const time = c => new Date(c.date).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
const day = c => new Date(c.date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function expiryYears(expiry, at) {
  const date = new Date(expiry).toISOString().slice(0, 10);
  const end = new Date(`${date}T15:30:00+05:30`).getTime();
  return Math.max((end - new Date(at).getTime()) / (365 * 86400000), 1 / (365 * 24 * 60));
}

function ivFor(candle, instrument, underlying, field = "close") {
  const price = Number(candle?.[field]);
  if (!(price > 0 && underlying > 0)) return null;
  return impliedVol(price, underlying, Number(instrument.strike), expiryYears(instrument.expiry, candle.date), RATE, instrument.instrument_type);
}

function aggregateSummary(days) {
  const total = days.reduce((s, d) => s + d.pnl, 0);
  let equity = 0, peak = 0, maxDrawdown = 0;
  for (const row of days) {
    equity += row.pnl; peak = Math.max(peak, equity); maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  const trades = days.reduce((s, d) => s + d.trades, 0);
  const wins = days.reduce((s, d) => s + d.wins, 0), losses = days.reduce((s, d) => s + d.losses, 0);
  const capitalUsed = days.reduce((s, d) => s + d.capitalDeployed, 0);
  return {
    total: round(total), totalTrades: trades, wins, losses,
    winRate: trades ? round(wins / trades * 100) : 0,
    maxDrawdown: round(maxDrawdown), capitalUsed: round(capitalUsed),
    returnPct: capitalUsed ? round(total / capitalUsed * 100) : 0,
    avgMonthlyPnl: round(total), avgMonthlyReturnPct: capitalUsed ? round(total / capitalUsed * 100) : 0,
  };
}

async function main() {
  if (!process.env.API_KEY || !process.env.ACCESS_TOKEN) throw new Error("Kite credentials unavailable");
  const master = (await kite.getInstruments("NFO")).filter(i => i.name === "BANKNIFTY");
  const futures = master.filter(i => i.instrument_type === "FUT").sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  const options = master.filter(i => i.instrument_type === "CE" || i.instrument_type === "PE");
  if (!futures.length || !options.length) throw new Error("Current BANKNIFTY instruments unavailable");
  const future = futures[0];
  const expiryTimes = [...new Set(options.map(o => new Date(o.expiry).getTime()))].sort((a, b) => a - b);
  const expiryMs = expiryTimes[0];
  const expiryOptions = options.filter(o => new Date(o.expiry).getTime() === expiryMs);
  const strikes = [...new Set(expiryOptions.map(o => Number(o.strike)))].sort((a, b) => a - b);
  const findOption = (strike, type) => expiryOptions.find(o => Number(o.strike) === Number(strike) && o.instrument_type === type);
  const nearestStrike = price => strikes.reduce((best, strike) => Math.abs(strike - price) < Math.abs(best - price) ? strike : best, strikes[0]);
  const itmStrike = (price, type) => {
    const atm = nearestStrike(price), index = strikes.indexOf(atm);
    return type === "CE" ? strikes[Math.max(0, index - 1)] : strikes[Math.min(strikes.length - 1, index + 1)];
  };

  const requestFrom = new Date(`${FROM}T00:00:00+05:30`);
  requestFrom.setDate(requestFrom.getDate() - 7);
  const requestFromString = requestFrom.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const requestToString = `${TO} 15:30:00`;
  const rawFuture = await kite.getHistoricalData(future.instrument_token, "5minute", requestFromString, requestToString, false, true);
  const futureBars = rawFuture.map(c => ({ ...c, open: +c.open, high: +c.high, low: +c.low, close: +c.close, volume: +(c.volume || 0), oi: +(c.oi || 0) }));
  const optionCache = new Map();
  async function optionBars(instrument) {
    if (optionCache.has(instrument.instrument_token)) return optionCache.get(instrument.instrument_token);
    await sleep(380);
    const raw = await kite.getHistoricalData(instrument.instrument_token, "5minute", requestFromString, requestToString, false, true);
    const bars = raw.map(c => ({ ...c, open: +c.open, high: +c.high, low: +c.low, close: +c.close, volume: +(c.volume || 0), oi: +(c.oi || 0) }));
    optionCache.set(instrument.instrument_token, bars);
    return bars;
  }

  const sessionKeys = [...new Set(futureBars.map(day))].filter(d => d >= FROM && d <= TO).sort();
  const results = [], diagnostics = [];
  for (const date of sessionKeys) {
    const bars = futureBars.filter(c => day(c) === date);
    const reasons = {};
    const reject = reason => { reasons[reason] = (reasons[reason] || 0) + 1; };
    const opening = bars.filter(c => time(c) >= "09:15" && time(c) < "10:15");
    const morningBar = bars.find(c => time(c) === "10:15");
    let trade = null;
    if (opening.length < 12 || !morningBar) {
      diagnostics.push({ date, tested: false, reason: "opening_range_or_1015_bar_missing", bars: bars.length });
      results.push({ date, pnl: 0, capitalDeployed: 0, trades: 0, wins: 0, losses: 0 });
      continue;
    }
    const morningAtm = nearestStrike(morningBar.open);
    const morningCE = findOption(morningAtm, "CE"), morningPE = findOption(morningAtm, "PE");
    if (!morningCE || !morningPE) throw new Error(`Morning ATM pair missing ${date} ${morningAtm}`);
    const [morningCeBars, morningPeBars] = await Promise.all([optionBars(morningCE), optionBars(morningPE)]);
    const morningCeCandle = morningCeBars.find(c => day(c) === date && time(c) === "10:15");
    const morningPeCandle = morningPeBars.find(c => day(c) === date && time(c) === "10:15");
    const morningCeIv = ivFor(morningCeCandle, morningCE, morningBar.open, "open");
    const morningPeIv = ivFor(morningPeCandle, morningPE, morningBar.open, "open");
    const morningIv = morningCeIv > 0 && morningPeIv > 0 ? (morningCeIv + morningPeIv) / 2 : null;
    if (!(morningIv > 0)) {
      diagnostics.push({ date, tested: false, reason: "morning_iv_unavailable" });
      results.push({ date, pnl: 0, capitalDeployed: 0, trades: 0, wins: 0, losses: 0 });
      continue;
    }
    const rangeHigh = Math.max(...opening.map(c => c.high)), rangeLow = Math.min(...opening.map(c => c.low));
    for (let i = bars.findIndex(c => time(c) === "10:15"); i < bars.length - 1 && time(bars[i]) <= "13:30"; i++) {
      const c = bars[i], globalIndex = futureBars.indexOf(c), warm = futureBars.slice(0, globalIndex + 1);
      const todayBars = bars.slice(0, i + 1), e = ema(warm.map(x => x.close), 20), currentEma = e.at(-1), previousEma = e.at(-2);
      const currentVwap = vwap(todayBars), currentAtr = atr(warm.slice(-30), 14);
      const prior5 = bars.slice(Math.max(0, i - 5), i), avgVolume = mean(prior5.map(x => x.volume));
      const bodyRatio = Math.abs(c.close - c.open) / Math.max(c.high - c.low, 0.01);
      if (!(currentVwap > 0 && currentAtr > 0 && avgVolume > 0)) { reject("indicator_or_volume_unavailable"); continue; }
      const ceBreak = c.close > rangeHigh && c.close > currentVwap && currentEma > previousEma;
      const peBreak = c.close < rangeLow && c.close < currentVwap && currentEma < previousEma;
      const direction = ceBreak ? "CE" : peBreak ? "PE" : null;
      if (!direction) { reject("no_or_vwap_ema_breakout"); continue; }
      if (bodyRatio < CONFIG.minBodyRatio) { reject("body_ratio"); continue; }
      if (c.volume < avgVolume * CONFIG.minVolumeMultiple) { reject("volume_multiple"); continue; }
      const currentAtm = nearestStrike(c.close);
      if (Math.abs(c.close - currentAtm) / c.close > CONFIG.nearAtmPct) { reject("near_atm"); continue; }
      const currentCE = findOption(currentAtm, "CE"), currentPE = findOption(currentAtm, "PE");
      if (!currentCE || !currentPE) { reject("current_atm_pair_missing"); continue; }
      const [ceBars, peBars] = await Promise.all([optionBars(currentCE), optionBars(currentPE)]);
      const ceCandle = ceBars.find(x => day(x) === date && time(x) === time(c));
      const peCandle = peBars.find(x => day(x) === date && time(x) === time(c));
      const ceIv = ivFor(ceCandle, currentCE, c.close), peIv = ivFor(peCandle, currentPE, c.close);
      const currentIv = ceIv > 0 && peIv > 0 ? (ceIv + peIv) / 2 : null;
      if (!(currentIv > 0) || currentIv / morningIv > CONFIG.ivContractionRatio) { reject("iv_contraction"); continue; }
      const strike = itmStrike(c.close, direction), selected = findOption(strike, direction);
      if (!selected) { reject("itm_contract_missing"); continue; }
      const selectedBars = await optionBars(selected), selectedToday = selectedBars.filter(x => day(x) === date);
      const signalIndex = selectedToday.findIndex(x => time(x) === time(c));
      const optionSignal = selectedToday[signalIndex], previous = selectedToday.slice(Math.max(0, signalIndex - CONFIG.premiumLookback), signalIndex);
      if (!optionSignal || previous.length < CONFIG.premiumLookback || optionSignal.high <= Math.max(...previous.map(x => x.high))) { reject("premium_breakout"); continue; }
      if (Number(optionSignal.oi || 0) < CONFIG.minOpenInterest) { reject("open_interest"); continue; }
      const confirm = bars[i + 1];
      const confirmed = direction === "CE" ? confirm.high > c.high : confirm.low < c.low;
      if (!confirmed) { reject("next_candle_confirmation"); continue; }
      const entryOption = selectedToday.find(x => time(x) === time(confirm));
      if (!entryOption || !(entryOption.close > 0)) { reject("confirmation_option_bar_missing"); continue; }
      const entryPremium = entryOption.close, riskPerUnit = entryPremium * CONFIG.premiumStopPct;
      const lot = Number(selected.lot_size || 1), lots = Math.floor((CONFIG.paperEquityRs * CONFIG.riskPerTradePct) / (riskPerUnit * lot)), qty = lots * lot;
      if (qty < lot) { reject("risk_budget"); continue; }
      const guard = direction === "CE" ? Math.max(c.high, currentVwap) : Math.min(c.low, currentVwap);
      let stop = entryPremium * (1 - CONFIG.premiumStopPct), remaining = qty, realized = 0, t1 = false, t2 = false;
      let exitPremium = entryPremium, exitTime = time(confirm), exitReason = "NO_EXIT_DATA";
      const startOptIndex = selectedToday.findIndex(x => time(x) === time(confirm));
      for (let j = i + 2; j < bars.length; j++) {
        const u = bars[j], o = selectedToday[startOptIndex + (j - (i + 1))];
        if (!o || time(o) !== time(u)) continue;
        if (time(u) >= "15:10") { exitPremium = o.open; exitTime = time(u); exitReason = "FORCE_EXIT_1510"; break; }
        const underlyingStop = direction === "CE" ? u.close <= guard : u.close >= guard;
        if (underlyingStop) { exitPremium = o.close; exitTime = time(u); exitReason = "UNDERLYING_CLOSE_STOP"; break; }
        if (o.low <= stop) { exitPremium = Math.min(o.open, stop); exitTime = time(u); exitReason = t2 ? "TRAIL_STOP" : "PREMIUM_STOP"; break; }
        const takePartial = stage => {
          const desired = Math.floor((qty / 3) / lot) * lot;
          const part = desired > 0 && remaining - desired >= lot ? desired : 0;
          if (part > 0) { realized += (stage - entryPremium) * part; remaining -= part; }
        };
        const oneR = entryPremium + riskPerUnit, twoR = entryPremium + 2 * riskPerUnit;
        if (!t1 && o.high >= oneR) { t1 = true; takePartial(oneR); stop = Math.max(stop, entryPremium); }
        if (!t2 && o.high >= twoR) { t2 = true; takePartial(twoR); stop = Math.max(stop, oneR); }
        if (t2) {
          const recent = selectedToday.slice(Math.max(0, startOptIndex + (j - (i + 1)) - 1), startOptIndex + (j - (i + 1)) + 1);
          if (recent.length === 2) stop = Math.max(stop, Math.min(...recent.map(x => x.low)));
        }
        exitPremium = o.close; exitTime = time(u); exitReason = "LAST_AVAILABLE_BAR";
      }
      const pnl = round(realized + (exitPremium - entryPremium) * remaining);
      trade = {
        date, direction, symbol: selected.tradingsymbol, strike, expiry: new Date(selected.expiry).toISOString().slice(0, 10),
        signalTime: time(c), entryTime: time(confirm), exitTime, entryPremium: round(entryPremium), exitPremium: round(exitPremium),
        qty, pnlRs: pnl, reasonExit: exitReason, morningIvPct: round(morningIv * 100), signalIvPct: round(currentIv * 100),
        ivRatio: round(currentIv / morningIv, 3), volumeMultiple: round(c.volume / avgVolume, 2), bodyRatio: round(bodyRatio, 3),
      };
      break;
    }
    const pnl = trade?.pnlRs || 0;
    results.push({ date, pnl, capitalDeployed: trade ? round(trade.entryPremium * trade.qty) : 0, trades: trade ? 1 : 0, wins: pnl > 0 ? 1 : 0, losses: pnl < 0 ? 1 : 0, trade });
    diagnostics.push({ date, tested: true, morningAtm, morningIvPct: round(morningIv * 100), trade, rejectionCounts: reasons });
  }
  const summary = aggregateSummary(results);
  const month = FROM.slice(0, 7);
  const monthly = [{ period: month, pnl: summary.total, capitalUsed: summary.capitalUsed, tradingDays: results.length, trades: summary.totalTrades, wins: summary.wins, losses: summary.losses, winRate: summary.winRate, returnPct: summary.returnPct }];
  const output = {
    generatedAt: new Date().toISOString(), coverage: { from: FROM, to: TO },
    dataProvenance: {
      underlying: `Kite historical 5-minute ${future.tradingsymbol} with volume/OI`,
      options: `Kite historical 5-minute listed ${new Date(expiryMs).toISOString().slice(0, 10)} BANKNIFTY option OHLC/volume/OI`,
      exactFields: ["underlying OHLC", "futures volume", "option OHLC", "option volume", "option OI", "IV derived from actual option candle prices"],
      unavailableFields: ["historical bid/ask spread", "tick-level confirmation fill", "historical quote age"],
    },
    strategies: { "low-iv-gamma": { OPTIONS: {
      modelled: true,
      methodology: "Signals use actual 5-minute BANKNIFTY futures and listed option candles. IV is Black-Scholes implied volatility derived from actual option OHLC. Entry is conservatively priced at the next confirmation candle close. Bid/ask and tick-level ordering are unavailable; results are a candle replay, not an execution-quality simulation.",
      summary, days: results, weeks: [], months: monthly, years: [{ period: FROM.slice(0, 4), ...monthly[0] }], diagnostics,
    } } },
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ output: OUTPUT, sessions: results.length, summary, future: future.tradingsymbol, optionExpiry: new Date(expiryMs).toISOString().slice(0, 10) }, null, 2));
}

main().catch(error => { console.error(error?.stack || error); process.exitCode = 1; });
