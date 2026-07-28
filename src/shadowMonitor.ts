import fs from "fs";
import path from "path";

type InstrumentType = "FUTURES" | "OPTIONS";

type StrategyDefinition = {
  id: string;
  name: string;
  version: string;
  prefix: "drishti" | "tt1030" | "normalBreakoutShadow" | "hybridShadow";
  backtestFile?: string;
};

const BOT_DIR = process.env.TRADING_BOT_DIR || "/home/ubuntu/trading-bot";

const STRATEGIES: StrategyDefinition[] = [
  { id: "drishti", name: "DRISHTI (BANKNIFTY)", version: "Current", prefix: "drishti", backtestFile: "5year-backtest-result.json" },
  { id: "tt1030", name: "10:30 Breakout (BANKNIFTY)", version: "Current", prefix: "tt1030", backtestFile: "fixed-futures-signal-backtest-compare.json" },
  { id: "normal-breakout", name: "Normal Breakout (BANKNIFTY)", version: "V1", prefix: "normalBreakoutShadow", backtestFile: "normal-breakout-june-july-sweep.json" },
  { id: "hybrid-body", name: "Hybrid Body Breakout (BANKNIFTY)", version: "Current", prefix: "hybridShadow" },
];

function readJson(file: string, fallback: any): any {
  try {
    const filePath = path.join(BOT_DIR, file);
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function recentServerLogs(): any[] {
  const candidates = [
    "/root/.pm2/logs/trading-bot-out.log",
    "/root/.pm2/logs/trading-bot-error.log",
    "/home/ubuntu/.pm2/logs/trading-bot-out.log",
    "/home/ubuntu/.pm2/logs/trading-bot-error.log",
    path.join(BOT_DIR, "logs/server.log"),
    path.join(BOT_DIR, "logs/bot-out.log"),
    path.join(BOT_DIR, "logs/bot-err.log"),
  ];
  const rows: any[] = [];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).slice(-45);
      for (const line of lines) {
        if (/access[_ -]?token|authorization:|api[_ -]?key/i.test(line)) continue;
        const message = sanitizeLog(line);
        if (!message || /^\s*at\s|node:internal|requireStack/i.test(message)) continue;
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
  return rows.slice(-120);
}

function strategyFields(strategy: StrategyDefinition, hb: any, state: any, instrument: InstrumentType) {
  const isOptions = instrument === "OPTIONS";
  if (strategy.prefix === "drishti") {
    const candleFile = readJson("candle-log.json", []);
    const candleRows = Array.isArray(candleFile)
      ? candleFile
      : Array.isArray(candleFile?.log)
        ? candleFile.log
        : Array.isArray(candleFile?.candles) ? candleFile.candles : [];
    const inTrade = isOptions ? !!(hb.optInTrade || state.optInTrade) : !!(hb.inTrade || state.activeTrade);
    const realized = isOptions ? num(hb.optDailyRs) : num(hb.dailyRealRs);
    const unrealized = isOptions ? num(hb.unrealisedPnL) : num(hb.unrealisedPnL);
    return {
      inTrade,
      realized,
      unrealized: inTrade ? unrealized : 0,
      total: (realized ?? 0) + (inTrade ? (unrealized ?? 0) : 0),
      trades: num(isOptions ? hb.optRecentTrades?.length : hb.tradeCount) ?? 0,
      wins: num(isOptions ? hb.optWins : state.drishtiWins) ?? 0,
      losses: num(isOptions ? hb.optLosses : state.drishtiLosses) ?? 0,
      direction: text(isOptions ? (hb.optDir || state.optDir) : (hb.direction || state.tradeDirection)),
      symbol: text(isOptions ? (hb.optSymbol || state.optSymbol) : (hb.symbol || state.tradeSymbol)),
      entry: num(isOptions ? (hb.optEntryPrem || state.optEntryPrem) : (hb.entryPrice || state.drishtiFuturesEntry || state.entryPrice)),
      live: num(isOptions ? (hb.livePremium || state.livePremium) : hb.livePrice),
      sl: num(isOptions ? state.candleSL : (hb.sl || state.candleSL)),
      target: null,
      quantity: num(isOptions ? (state.mainQty || hb.qty) : (state.mainQty || hb.qty)),
      entryTime: timeValue(isOptions ? state.optEntryTime : state.entryTime),
      entryAt: isOptions ? state.optEntryTime : state.entryTime,
      phase: text(hb.status),
      dayHigh: null,
      dayLow: null,
      volume: null,
      openInterest: null,
      rawTrades: isOptions && Array.isArray(hb.optRecentTrades) ? hb.optRecentTrades : readJson("trades.json", []),
      candleLog: candleRows,
    };
  }

  const prefix = strategy.prefix;
  const inTrade = !!hb[`${prefix}InTrade`];
  const total = num(hb[isOptions ? `${prefix}OptPnL` : `${prefix}PnL`]) ?? 0;
  const closed = num(hb[`${prefix}ClosedPnL`]);
  const realized = closed ?? (inTrade ? null : total);
  const unrealized = inTrade && realized !== null ? total - realized : (inTrade ? total : 0);
  const optionSymbol = text(hb[`${prefix}OptionSymbol`]);
  const futuresSymbol = text(hb[`${prefix}FuturesSymbol`]);
  const direction = text(hb[`${prefix}Dir`]);
  return {
    inTrade,
    realized,
    unrealized,
    total,
    trades: num(hb[`${prefix}Trades`]) ?? 0,
    wins: num(hb[`${prefix}Wins`]) ?? 0,
    losses: num(hb[`${prefix}Losses`]) ?? 0,
    direction,
    symbol: isOptions ? optionSymbol : futuresSymbol,
    entry: num(hb[isOptions ? `${prefix}OptionEntry` : `${prefix}FuturesEntry`] ?? hb[`${prefix}Entry`]),
    live: num(hb[isOptions ? `${prefix}OptionLive` : `${prefix}FuturesLive`] ?? hb[`${prefix}Live`]),
    sl: num(hb[`${prefix}SL`]),
    target: null,
    quantity: num(hb[`${prefix}LiveQty`] ?? hb.qty),
    entryTime: null,
    entryAt: null,
    phase: text(hb[`${prefix}Phase`] || hb.status),
    dayHigh: num(hb[`${prefix}High`]),
    dayLow: num(hb[`${prefix}Low`]),
    volume: num(hb[`${prefix}Volume`]),
    openInterest: num(hb[`${prefix}OpenInterest`]),
    rawTrades: Array.isArray(hb[`${prefix}TradeLog`]) ? hb[`${prefix}TradeLog`] : [],
    candleLog: Array.isArray(hb[`${prefix}CandleLog`]) ? hb[`${prefix}CandleLog`] : [],
  };
}

function normalizedTrades(rawTrades: any[], strategy: StrategyDefinition, instrument: InstrumentType, tradeDate: string) {
  const seen = new Set<string>();
  return rawTrades
    .filter((row: any) => {
      const rowDate = dateKey(row.date || row.at || row.entryTime || row.exitTime);
      return !rowDate || rowDate === tradeDate;
    })
    .filter((row: any) => {
      const symbol = String(row.symbol || row.tradeSymbol || row.contract || "").toUpperCase();
      const looksOption = /\d+(CE|PE)$/.test(symbol) || !!row.premiumEntry || !!row.entryPremium;
      return instrument === "OPTIONS" ? looksOption || strategy.prefix !== "drishti" : !looksOption || strategy.prefix !== "drishti";
    })
    .map((row: any, index: number) => {
      const direction = text(row.direction || row.dir || row.side);
      const symbol = text(row.symbol || row.tradeSymbol || row.contract);
      const pnl = num(row.pnlRs ?? row.pnl ?? row.points ?? row.pts);
      const entry = num(row.premiumEntry ?? row.entryPremium ?? row.premIn ?? row.entryPrice ?? row.entry);
      const exit = num(row.premiumExit ?? row.exitPremium ?? row.premOut ?? row.exitPrice ?? row.exit);
      const stableId = text(row.tradeId || row.signalId) || [
        strategy.id, instrument, tradeDate, symbol, direction, entry, row.entryTime || row.date || index,
      ].join("|");
      return {
        id: stableId,
        time: timeValue(row.entryTime || row.date || row.at || row.time),
        instrument: symbol,
        side: direction,
        quantity: num(row.qty ?? row.quantity ?? row.lots),
        entry,
        exit,
        stopLoss: num(row.sl ?? row.stopLoss),
        target: num(row.target),
        pnl,
        result: pnl === null ? null : pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "FLAT",
        status: text(row.status) || (exit !== null && exit > 0 ? "CLOSED" : "OPEN"),
        reason: text(row.reasonExit || row.reason || row.note),
      };
    })
    .filter((row: any) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .slice(-25)
    .reverse();
}

function normalizedCandles(raw: any[], hb: any): any[] {
  const rows = Array.isArray(raw) ? raw : [];
  return rows.slice(-5).reverse().map((row: any) => ({
    time: text(row.time) || timeValue(row.at || row.date),
    timeframe: text(row.timeframe || row.tf) || "15m",
    open: num(row.open ?? row.o),
    high: num(row.high ?? row.h),
    low: num(row.low ?? row.l),
    close: num(row.close ?? row.c),
    volume: num(row.volume ?? row.v),
    status: text(row.status || row.state),
    note: text(row.note || row.reason) || "No evaluation note recorded",
  })).map((row: any) => ({ ...row, receivedAt: hb?.at || null }));
}

function backtestSummary(strategy: StrategyDefinition): any {
  if (!strategy.backtestFile) return null;
  const data = readJson(strategy.backtestFile, null);
  if (!data) return null;
  const totals = data.totals || data.summary || data.total || {};
  const daily = Array.isArray(data.daily) ? data.daily : [];
  const monthly = data.monthly && typeof data.monthly === "object" ? Object.values(data.monthly) : [];
  const totalTrades = num(totals.trades ?? totals.totalTrades ?? data.tradedDays);
  const wins = num(totals.wins ?? totals.totalWins);
  const winRate = num(data.winRate ?? totals.winRate) ?? (
    totalTrades && wins !== null ? (wins / totalTrades) * 100 : null
  );
  const returnPct = num(totals.returnPct ?? totals.totalReturnPct ?? data.returnPct);
  const maxDrawdown = num(totals.maxDrawdownPct ?? totals.maxDrawdown ?? data.maxDrawdown);
  const avgMonthlyReturn = num(totals.avgMonthlyReturnPct ?? totals.avgMonthlyReturn ?? data.avgMonthlyReturn);
  const pnl = num(totals.pnl ?? totals.totalPnl ?? totals.bodyBreakout);
  if ([totalTrades, winRate, returnPct, maxDrawdown, avgMonthlyReturn, pnl].every(v => v === null)) return null;
  return {
    source: strategy.backtestFile,
    returnPct,
    winRate,
    maxDrawdown,
    avgMonthlyReturn,
    totalTrades,
    pnl,
    dailyRecords: daily.length,
    monthlyRecords: monthly.length,
  };
}

function shadowHistory(strategy: StrategyDefinition, instrument: InstrumentType): any {
  const byDate = new Map<string, { date: string; pnl: number; trades: number; wins: number; losses: number }>();
  if (strategy.prefix === "tt1030") {
    const source = readJson("strategy-monthly-history.json", {});
    const months = source?.months && typeof source.months === "object" ? source.months : {};
    for (const month of Object.values(months) as any[]) {
      const days = month?.TEN_THIRTY?.days || month?.days || {};
      for (const [date, record] of Object.entries(days) as [string, any][]) {
        const summary = record?.summary || {};
        const pnl = num(instrument === "OPTIONS" ? summary.optionsRs : summary.futuresRs);
        if (pnl === null) continue;
        byDate.set(date, {
          date,
          pnl,
          trades: num(summary.trades) ?? 0,
          wins: num(summary.wins) ?? (pnl > 0 ? 1 : 0),
          losses: num(summary.losses) ?? (pnl < 0 ? 1 : 0),
        });
      }
    }
  } else if (strategy.prefix === "drishti") {
    const rows: any[] = readJson("trades.json", []);
    for (const row of Array.isArray(rows) ? rows : []) {
      const date = dateKey(row.date || row.exitTime || row.entryTime);
      if (!date) continue;
      const symbol = String(row.symbol || row.tradeSymbol || "").toUpperCase();
      const looksOption = /\d+(CE|PE)$/.test(symbol) || num(row.premiumEntry) !== null;
      if (instrument === "OPTIONS" ? !looksOption : looksOption) continue;
      const pnl = num(row.pnlRs ?? row.pnl);
      if (pnl === null) continue;
      const current = byDate.get(date) || { date, pnl: 0, trades: 0, wins: 0, losses: 0 };
      current.pnl += pnl;
      current.trades += 1;
      if (pnl > 0) current.wins += 1;
      if (pnl < 0) current.losses += 1;
      byDate.set(date, current);
    }
  }

  const days = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  const aggregate = (keyFor: (date: string) => string) => {
    const groups = new Map<string, any>();
    for (const day of days) {
      const key = keyFor(day.date);
      const row = groups.get(key) || { period: key, pnl: 0, tradingDays: 0, trades: 0, wins: 0, losses: 0 };
      row.pnl += day.pnl;
      row.tradingDays += 1;
      row.trades += day.trades;
      row.wins += day.wins;
      row.losses += day.losses;
      groups.set(key, row);
    }
    return Array.from(groups.values()).map((row: any) => ({
      ...row,
      winRate: row.wins + row.losses > 0 ? row.wins / (row.wins + row.losses) * 100 : 0,
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
    source: strategy.prefix === "tt1030" ? "strategy-monthly-history.json" : strategy.prefix === "drishti" ? "trades.json" : null,
    days: [...days].reverse(),
    weekly: aggregate(weekKey),
    monthly: aggregate(date => date.slice(0, 7)),
    yearly: aggregate(date => date.slice(0, 4)),
  };
}

function marketStatus(now = new Date()): "OPEN" | "CLOSED" {
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay();
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  return day >= 1 && day <= 5 && minutes >= 555 && minutes <= 930 ? "OPEN" : "CLOSED";
}

export function buildShadowMonitorPayload(strategyId = "", instrumentValue = ""): any {
  const tradeDate = todayIST();
  const strategy = STRATEGIES.find(item => item.id === strategyId) || STRATEGIES[0];
  const instrument: InstrumentType = instrumentValue === "OPTIONS" ? "OPTIONS" : "FUTURES";
  const hb = readJson("bot-heartbeat.json", {});
  const state = readJson("trade-state.json", {});
  const heartbeatAt = hb?.at ? new Date(hb.at).getTime() : 0;
  const heartbeatAgeSec = heartbeatAt ? Math.max(0, Math.round((Date.now() - heartbeatAt) / 1000)) : null;
  const connected = heartbeatAgeSec !== null && heartbeatAgeSec < 180;
  const fields = strategyFields(strategy, hb, state, instrument);
  const trades = normalizedTrades(fields.rawTrades, strategy, instrument, tradeDate);
  const candles = normalizedCandles(fields.candleLog, hb);
  const closedTrades = trades.filter((row: any) => String(row.status).toUpperCase() === "CLOSED");
  const wins = fields.wins || closedTrades.filter((row: any) => (row.pnl ?? 0) > 0).length;
  const losses = fields.losses || closedTrades.filter((row: any) => (row.pnl ?? 0) < 0).length;
  const tradeCount = Math.max(fields.trades, trades.length);
  const winRate = wins + losses > 0 ? wins / (wins + losses) * 100 : 0;
  const nowIso = new Date().toISOString();
  const runtimeStatus = connected
    ? fields.inTrade ? "RUNNING" : (fields.phase || "WAITING")
    : marketStatus() === "CLOSED" ? "SLEEPING" : "OFFLINE";
  const observationTime = timeValue(nowIso) || "";
  const logs = [
    ...recentServerLogs(),
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
      message: `[P&L] Shadow total ${fields.total.toFixed(2)}; realized ${fields.realized === null ? "unavailable" : fields.realized.toFixed(2)}; unrealized ${fields.unrealized === null ? "unavailable" : fields.unrealized.toFixed(2)}`,
    },
  ].slice(-120);

  return {
    ok: true,
    identity: {
      strategyId: strategy.id,
      strategyName: strategy.name,
      strategyVersion: strategy.version,
      instrumentType: instrument,
      tradeDate,
      executionMode: "SHADOW",
    },
    strategies: STRATEGIES.map(item => ({ id: item.id, name: item.name, version: item.version })),
    market: { status: marketStatus(), checkedAt: nowIso },
    health: {
      overall: connected ? "HEALTHY" : marketStatus() === "CLOSED" ? "SLEEPING" : "WARNING",
      connected,
      heartbeatAgeSec,
      lastCheckedAt: nowIso,
      feed: connected ? "CONNECTED" : "DISCONNECTED",
      feedLatencyMs: num(hb.feedLatencyMs ?? hb.latencyMs),
      lastTickAt: hb.at || null,
    },
    runtime: {
      status: runtimeStatus,
      selectedStrategy: strategy.name,
      lastEvaluatedAt: hb.at || null,
      nextEvaluationAt: null,
      version: strategy.version,
      phase: fields.phase,
    },
    backtest: backtestSummary(strategy),
    history: shadowHistory(strategy, instrument),
    summary: {
      realizedPnl: fields.realized,
      unrealizedPnl: fields.unrealized,
      totalPnl: fields.total,
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
      currentPnl: fields.unrealized,
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
    trades,
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
    *{box-sizing:border-box}.sm-page{background:var(--sm-bg);color:var(--sm-ink);min-height:calc(100vh - 104px);padding:14px 18px 24px;overflow-x:hidden}.sm-shell{max-width:1600px;margin:0 auto}.sm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:10px}.sm-title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.sm-title{font-size:26px;line-height:1.2;margin:0;font-weight:780}.sm-shadow-badge{border:1px solid #c4b5fd;background:#f5f3ff;color:#6d28d9;border-radius:6px;padding:5px 9px;font-size:11px;font-weight:800}.sm-sub{font-size:12px;color:var(--sm-muted);margin:4px 0 0}.sm-head-actions{display:flex;align-items:center;gap:10px}.sm-market,.sm-refresh,.sm-history-btn,.sm-link-btn,.sm-resume{height:36px;border-radius:7px;border:1px solid var(--sm-line);background:#fff;padding:0 13px;font-size:12px;font-weight:750;color:var(--sm-ink);display:inline-flex;align-items:center;gap:7px;cursor:pointer;white-space:nowrap}.sm-market.open{color:var(--sm-green);border-color:#9fdfa9;background:#f0fdf4}.sm-market.closed{color:var(--sm-muted)}.sm-dot{width:8px;height:8px;border-radius:50%;background:currentColor;display:inline-block}.sm-icon{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.sm-control{display:grid;grid-template-columns:minmax(270px,1.5fr) 252px 210px 200px;gap:12px;align-items:end}.sm-control-card{padding:12px 14px;margin-bottom:12px}.sm-field label{display:block;font-size:11px;color:var(--sm-muted);font-weight:700;margin:0 0 5px}.sm-select,.sm-today{width:100%;height:38px;border:1px solid var(--sm-line);border-radius:7px;background:#fff;color:var(--sm-ink);padding:0 12px;font-size:13px;outline:none;display:flex;align-items:center}.sm-segment{display:grid;grid-template-columns:1fr 1fr;height:38px;border:1px solid var(--sm-line);border-radius:7px;overflow:hidden;background:#fff}.sm-segment button{border:0;background:#fff;color:#334155;font-size:12px;font-weight:750;cursor:pointer}.sm-segment button.active{background:var(--sm-blue);color:#fff;box-shadow:none}.sm-mode-box{height:38px;border:1px solid #a7e0b2;border-radius:7px;background:#effdf3;color:var(--sm-green);padding:5px 10px;display:flex;flex-direction:column;justify-content:center}.sm-mode-box b{font-size:11px}.sm-mode-box span{font-size:9px;color:#4b7d5b}.sm-refresh-meta{text-align:right;font-size:11px;color:var(--sm-muted);padding:0}.sm-health{display:grid;grid-template-columns:1fr 1fr 1.18fr 1.65fr;gap:12px;margin-bottom:12px}.sm-card{background:var(--sm-card);border:1px solid var(--sm-line);border-radius:8px;box-shadow:0 1px 2px rgba(15,23,42,.04);min-width:0}.sm-health-card{min-height:102px;padding:13px 14px;display:flex;align-items:center;gap:12px}.sm-health-icon{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:#eef5ff;color:var(--sm-blue);flex:0 0 auto}.sm-health-icon.good{background:#ecfdf3;color:var(--sm-green)}.sm-health-icon.warn{background:#fff7ed;color:var(--sm-amber)}.sm-health-copy{min-width:0;flex:1}.sm-card-label{font-size:11px;color:#334155;margin-bottom:5px}.sm-health-value{font-size:17px;font-weight:780;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sm-health-note{font-size:10px;color:var(--sm-muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sm-backtest{display:grid;grid-template-columns:auto repeat(6,minmax(0,1fr));gap:0;align-items:center;width:100%}.sm-bt-cell{padding:0 9px;border-left:1px solid var(--sm-line);min-width:0}.sm-bt-cell:first-of-type{border-left:0}.sm-bt-cell span{display:block;font-size:10px;color:var(--sm-muted);white-space:nowrap}.sm-bt-cell b{display:block;font-size:13px;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sm-source{font-size:9px;text-transform:uppercase;color:var(--sm-muted);font-weight:800;letter-spacing:.04em}.sm-main-grid{display:grid;grid-template-columns:1.45fr .95fr;gap:12px;margin-bottom:12px}.sm-pnl{padding:15px 18px;min-height:244px;border-color:#cbd5e1}.sm-pnl.profit{background:#eefbf4;border-color:#8dd9aa}.sm-pnl.loss{background:#fff1f1;border-color:#f3a4a4}.sm-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.sm-card-head h2{font-size:13px;margin:0;font-weight:800;text-transform:uppercase}.sm-live-chip,.sm-type-chip,.sm-status{height:23px;border-radius:4px;border:1px solid #a7e0b2;background:#effdf3;color:var(--sm-green);padding:0 8px;display:inline-flex;align-items:center;gap:6px;font-size:9px;font-weight:800}.sm-type-chip{border-color:#b8d2ff;background:#eff5ff;color:var(--sm-blue)}.sm-pnl-value{text-align:center;font-size:40px;font-weight:800;line-height:1.05;color:#334155;margin:11px 0 3px}.sm-pnl-sub{text-align:center;font-size:10px;color:var(--sm-muted);margin-bottom:11px}.sm-pnl-state{display:inline-flex;margin-left:6px;padding:3px 7px;border-radius:4px;background:#dcfce7;color:var(--sm-green);font-size:9px;font-weight:800}.sm-pnl.loss .sm-pnl-state{background:#fee2e2;color:var(--sm-red)}.sm-pnl.profit .sm-pnl-value{color:var(--sm-green)}.sm-pnl.loss .sm-pnl-value{color:var(--sm-red)}.sm-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.sm-metric{padding:8px 10px;border:1px solid rgba(100,116,139,.16);background:rgba(255,255,255,.78);border-radius:5px;min-width:0}.sm-metric span{display:block;font-size:9px;color:var(--sm-muted);line-height:1.25}.sm-metric b{display:block;font-size:12px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sm-card-foot{font-size:10px;color:var(--sm-muted);border-top:1px solid rgba(100,116,139,.18);margin-top:10px;padding-top:8px}.sm-snapshot{padding:14px 16px;min-height:244px}.sm-snapshot-grid{display:grid;grid-template-columns:1fr 1fr}.sm-kv{min-height:27px;border-top:1px dashed var(--sm-line);padding:6px 0;display:grid;grid-template-columns:1fr auto;gap:10px;font-size:10px}.sm-kv:nth-child(odd){padding-right:16px}.sm-kv:nth-child(even){padding-left:16px;border-left:1px solid var(--sm-line)}.sm-kv span{color:var(--sm-muted)}.sm-kv b{text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sm-empty{height:182px;display:grid;place-items:center;text-align:center;color:var(--sm-muted);padding:20px}.sm-empty b{display:block;color:var(--sm-ink);font-size:14px;margin-bottom:5px}.sm-table-card,.sm-log-card{display:flex;flex-direction:column}.sm-trade-card{height:330px;margin-bottom:12px}.sm-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}.sm-detail-card{height:310px}.sm-console-card{height:260px}.sm-card-pad{padding:12px 12px 10px}.sm-table-wrap{overflow:auto;min-height:0;flex:1;border-top:1px solid var(--sm-line)}.sm-table{width:100%;border-collapse:collapse;min-width:820px}.sm-table.candles{min-width:650px}.sm-table th{height:31px;text-align:left;padding:0 8px;color:var(--sm-muted);font-size:9px;font-weight:760;background:#f8fafc;position:sticky;top:0;z-index:1}.sm-table td{height:34px;border-top:1px solid #edf1f6;padding:0 8px;font-size:10px;white-space:nowrap}.sm-table td.note{max-width:190px;overflow:hidden;text-overflow:ellipsis}.sm-table-footer{height:38px;border-top:1px solid var(--sm-line);display:flex;align-items:center;justify-content:space-between;padding:0 12px;color:var(--sm-muted);font-size:10px}.sm-table-total{font-size:11px;font-weight:800}.sm-positive{color:var(--sm-green)!important}.sm-negative{color:var(--sm-red)!important}.sm-muted{color:var(--sm-muted)!important}.sm-tag{border-radius:4px;padding:3px 6px;font-size:9px;font-weight:800;background:#f1f5f9;color:#475569}.sm-tag.win,.sm-tag.buy,.sm-tag.ce,.sm-tag.closed{background:#ecfdf3;color:var(--sm-green)}.sm-tag.loss,.sm-tag.sell,.sm-tag.pe{background:#fef2f2;color:var(--sm-red)}.sm-tag.open{background:#eff6ff;color:var(--sm-blue)}.sm-cepe{color:#fff!important}.sm-cepe.ce{background:#0f3d91}.sm-cepe.pe{background:#b91c1c}.sm-table-empty{height:220px;text-align:center!important;color:var(--sm-muted)}.sm-instrument-body{display:grid;grid-template-columns:1fr 1fr;gap:0;padding:0 14px}.sm-instrument-note{margin:8px 14px 12px;padding-top:8px;border-top:1px solid var(--sm-line);font-size:9px;color:var(--sm-muted)}.sm-log-card{background:#fff}.sm-log-console{margin:0 8px 8px;background:var(--sm-console);border-radius:6px;color:#e5e7eb;min-height:0;flex:1;overflow:auto;padding:10px 12px;font:10px/1.55 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.sm-log-line{display:grid;grid-template-columns:70px 45px minmax(0,1fr);gap:7px;white-space:pre-wrap}.sm-log-line .INFO{color:#4ade80}.sm-log-line .WARN{color:#fbbf24}.sm-log-line .ERROR{color:#fb7185}.sm-log-line .DEBUG{color:#94a3b8}.sm-log-actions{display:flex;align-items:center;gap:7px}.sm-resume{height:26px;font-size:10px;padding:0 8px}.sm-history-btn,.sm-link-btn{height:28px;color:var(--sm-blue);border-color:#b8d2ff}.sm-footer-note{text-align:center;font-size:11px;color:var(--sm-muted);margin:14px 0 0}.sm-modal{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:1200;display:none;padding:24px}.sm-modal.open{display:grid;place-items:center}.sm-modal-panel{width:min(1040px,100%);max-height:88vh;background:#fff;border-radius:8px;box-shadow:0 24px 60px rgba(15,23,42,.24);display:flex;flex-direction:column;overflow:hidden}.sm-modal-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--sm-line)}.sm-modal-head h2{margin:0;font-size:16px}.sm-close{border:0;background:#f1f5f9;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px}.sm-history-tabs{display:flex;gap:6px;padding:12px 16px;border-bottom:1px solid var(--sm-line);overflow-x:auto}.sm-history-tabs button{height:32px;border:1px solid var(--sm-line);border-radius:6px;background:#fff;padding:0 13px;font-size:11px;font-weight:750;cursor:pointer}.sm-history-tabs button.active{background:#edf4ff;color:var(--sm-blue);border-color:#9fc0ff}.sm-history-body{padding:16px;overflow:auto}.sm-history-state{border:1px dashed var(--sm-line);border-radius:7px;padding:30px;text-align:center;color:var(--sm-muted)}.sm-loading{opacity:.72}
    @media(max-width:1200px){.sm-health{grid-template-columns:1fr 1fr}.sm-main-grid{grid-template-columns:1fr}.sm-control{grid-template-columns:1.4fr 240px 180px 180px}.sm-main-grid .sm-pnl,.sm-main-grid .sm-snapshot{min-height:0}}
    @media(max-width:760px){.sm-page{padding:12px}.sm-head{align-items:flex-start}.sm-title{font-size:21px}.sm-sub{max-width:260px}.sm-head-actions{display:grid;grid-template-columns:1fr auto}.sm-head-actions .sm-refresh-meta{grid-column:1/-1;grid-row:2;text-align:left}.sm-market,.sm-refresh{height:32px}.sm-control{grid-template-columns:1fr 1fr}.sm-field.strategy,.sm-field.mode{grid-column:1/-1}.sm-health{grid-template-columns:1fr}.sm-health-card{min-height:84px}.sm-backtest{grid-template-columns:1fr 1fr 1fr;row-gap:12px}.sm-backtest .sm-health-icon{display:none}.sm-bt-cell{border-left:0;padding:0 8px}.sm-main-grid,.sm-detail-grid{grid-template-columns:1fr}.sm-pnl,.sm-snapshot{min-height:0}.sm-pnl-value{font-size:36px}.sm-metrics{grid-template-columns:repeat(2,1fr)}.sm-metric{padding:7px 9px}.sm-snapshot-grid,.sm-instrument-body{grid-template-columns:1fr}.sm-kv:nth-child(odd),.sm-kv:nth-child(even){padding-left:0;padding-right:0;border-left:0}.sm-trade-card,.sm-detail-card,.sm-console-card{height:326px}.sm-modal{padding:10px}}
  </style>
</head>
<body>
  ${navHtml}
  <main class="sm-page">
    <div class="sm-shell" id="shadowMonitor">
      <header class="sm-head">
        <div>
          <div class="sm-title-row"><h1 class="sm-title">Shadow Strategy Monitor</h1><span class="sm-shadow-badge">SHADOW MODE ONLY</span></div>
          <p class="sm-sub">Simulated trades only. No real broker orders are placed.</p>
        </div>
        <div class="sm-head-actions">
          <div class="sm-market closed" id="marketStatus"><span class="sm-dot"></span><span>Checking market</span></div>
          <div class="sm-refresh-meta" id="refreshMeta">Last refreshed: connecting...</div>
          <button class="sm-refresh" id="refreshAll" type="button"><svg class="sm-icon" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v6h-6"/></svg>Refresh</button>
        </div>
      </header>
      <section class="sm-card sm-control-card sm-control" aria-label="Monitor controls">
        <div class="sm-field strategy"><label for="strategySelect">Strategy</label><select class="sm-select" id="strategySelect"><option>Loading strategies...</option></select></div>
        <div class="sm-field"><label>Instrument</label><div class="sm-segment"><button type="button" class="active" data-instrument="FUTURES">FUTURES</button><button type="button" data-instrument="OPTIONS">OPTIONS</button></div></div>
        <div class="sm-field"><label>Date</label><div class="sm-today" id="todayLabel">Today</div></div>
        <div class="sm-field mode"><label>Execution</label><div class="sm-mode-box"><b>SHADOW MODE</b><span>Simulated Execution Only</span></div></div>
      </section>
      <section class="sm-health">
        <article class="sm-card sm-health-card"><div class="sm-health-icon" id="healthIcon"><svg class="sm-icon" viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg></div><div class="sm-health-copy"><div class="sm-card-label">System Health</div><div class="sm-health-value" id="healthValue">Checking</div><div class="sm-health-note" id="healthNote">Waiting for heartbeat</div></div></article>
        <article class="sm-card sm-health-card"><div class="sm-health-icon" id="feedIcon"><svg class="sm-icon" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="7" rx="2"/><rect x="4" y="14" width="16" height="7" rx="2"/><path d="M8 6.5h.01M8 17.5h.01"/></svg></div><div class="sm-health-copy"><div class="sm-card-label">Server / Feed Status</div><div class="sm-health-value" id="feedValue">Checking</div><div class="sm-health-note" id="feedNote">Market data status</div></div></article>
        <article class="sm-card sm-health-card"><div class="sm-health-icon"><svg class="sm-icon" viewBox="0 0 24 24"><path d="M6 3v18M18 3v18M4 8h4v8H4M16 6h4v10h-4M10 11h4v7h-4"/></svg></div><div class="sm-health-copy"><div class="sm-card-label">Strategy Runtime</div><div class="sm-health-value" id="runtimeValue">Checking</div><div class="sm-health-note" id="runtimeNote">Waiting for strategy state</div></div></article>
        <article class="sm-card sm-health-card"><div class="sm-backtest" id="backtestSummary"><div class="sm-health-icon"><svg class="sm-icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div><div class="sm-bt-cell"><span>Backtest Data</span><b>Checking</b></div><div class="sm-bt-cell"><span>Return</span><b>--</b></div><div class="sm-bt-cell"><span>Win Rate</span><b>--</b></div><div class="sm-bt-cell"><span>Max Drawdown</span><b>--</b></div><div class="sm-bt-cell"><span>Total Trades</span><b>--</b></div></div></article>
      </section>
      <section class="sm-main-grid">
        <article class="sm-card sm-pnl" id="pnlCard"><div class="sm-card-head"><h2><span class="sm-dot sm-positive"></span> Shadow Live P&amp;L (Today)</h2><span class="sm-live-chip"><span class="sm-dot"></span>LIVE SHADOW</span></div><div class="sm-pnl-value" id="totalPnl">&#8377;0.00</div><div class="sm-pnl-sub">Total Shadow P&amp;L <span class="sm-pnl-state" id="pnlState">NO TRADE</span></div><div class="sm-metrics" id="pnlMetrics"></div><div class="sm-card-foot" id="pnlFoot">Current day only. Waiting for live shadow data.</div></article>
        <article class="sm-card sm-snapshot"><div class="sm-card-head"><h2 id="positionTitle">Current Position (Futures)</h2><span class="sm-type-chip" id="instrumentChip">WAITING</span></div><div id="positionBody" class="sm-empty"><div><b>Loading position</b><span>Checking the selected shadow instrument.</span></div></div></article>
      </section>
      <article class="sm-card sm-table-card sm-trade-card"><div class="sm-card-head sm-card-pad"><h2 id="tradeTitle">Today's Trade History (Futures)</h2><button class="sm-history-btn" id="openHistory" type="button">View Full History</button></div><div class="sm-table-wrap"><table class="sm-table" id="tradeTable"></table></div><div class="sm-table-footer"><span id="tradeShowing">Showing 0 trades</span><span class="sm-table-total" id="tradeTotal">Total P&amp;L: &#8377;0.00</span></div></article>
      <section class="sm-detail-grid">
        <article class="sm-card sm-table-card sm-detail-card"><div class="sm-card-head sm-card-pad"><h2>Candle Logs - Latest 5</h2><a class="sm-link-btn" href="/dashboard">View All</a></div><div class="sm-table-wrap"><table class="sm-table candles" id="candleTable"></table></div></article>
        <article class="sm-card sm-detail-card"><div class="sm-card-head sm-card-pad"><h2 id="instrumentSummaryTitle">Instrument Summary (Futures)</h2><span class="sm-type-chip" id="summaryTypeChip">FUTURES</span></div><div class="sm-instrument-body" id="instrumentSummaryBody"></div><div class="sm-instrument-note">All prices are indicative. Shadow execution uses simulated fills.</div></article>
      </section>
      <article class="sm-card sm-log-card sm-console-card"><div class="sm-card-head sm-card-pad"><h2><span class="sm-dot sm-positive"></span> Server Logs - Live <span class="sm-source">(Updates every minute)</span></h2><div class="sm-log-actions"><button class="sm-resume" id="pauseLogs" type="button">Pause Auto-scroll</button><button class="sm-resume" id="resumeLogs" type="button" hidden>Resume Auto-scroll</button></div></div><div class="sm-log-console" id="logConsole"><div class="sm-muted">Loading server logs...</div></div></article>
      <p class="sm-footer-note">Shadow mode trades are not executed in the market. All P&amp;L values are hypothetical.</p>
    </div>
  </main>
  <div class="sm-modal" id="historyModal" role="dialog" aria-modal="true" aria-labelledby="historyTitle"><div class="sm-modal-panel"><div class="sm-modal-head"><h2 id="historyTitle">Shadow Performance History</h2><button class="sm-close" id="closeHistory" type="button" aria-label="Close">&times;</button></div><div class="sm-history-tabs"><button class="active" data-period="WEEKLY">Weekly</button><button data-period="MONTHLY">Monthly</button><button data-period="YEARLY">Yearly</button><button data-period="BACKTEST">Backtest</button></div><div class="sm-history-body" id="historyBody"></div></div></div>
  <script>
    (function(){
      var state={strategy:localStorage.getItem("zsShadowStrategy")||"drishti",instrument:localStorage.getItem("zsShadowInstrument")||"FUTURES",request:0,data:null,logStick:true};
      var activeController=null;
      function el(id){return document.getElementById(id)}
      function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]})}
      function value(v,digits){return v==null||!isFinite(Number(v))?"--":Number(v).toLocaleString("en-IN",{minimumFractionDigits:digits||0,maximumFractionDigits:digits==null?2:digits})}
      function money(v){if(v==null||!isFinite(Number(v)))return"Not available";var n=Number(v);return(n>0?"+":n<0?"-":"")+"&#8377;"+Math.abs(n).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}
      function pct(v){return v==null||!isFinite(Number(v))?"--":Number(v).toFixed(2)+"%"}
      function dt(v){if(!v)return"--";var d=new Date(v);return isNaN(d.getTime())?esc(v):d.toLocaleTimeString("en-IN",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",second:"2-digit"})}
      function clsPnl(v){return Number(v)>0?"sm-positive":Number(v)<0?"sm-negative":"sm-muted"}
      function metric(label,val,cls){return'<div class="sm-metric"><span>'+esc(label)+'</span><b class="'+(cls||"")+'">'+val+'</b></div>'}
      function renderStrategies(list){var select=el("strategySelect");var html=(list||[]).map(function(s){return'<option value="'+esc(s.id)+'" '+(s.id===state.strategy?"selected":"")+'>'+esc(s.name)+'</option>'}).join("");select.innerHTML=html;if(!list.some(function(s){return s.id===state.strategy})){state.strategy=list[0]?list[0].id:"";select.value=state.strategy}}
      function renderHealth(d){var good=d.health.connected;el("healthIcon").className="sm-health-icon "+(good?"good":"warn");el("healthValue").textContent=d.health.overall;el("healthNote").textContent=(good?"All systems operational. ":"Heartbeat requires attention. ")+"Checked: "+dt(d.health.lastCheckedAt);el("feedIcon").className="sm-health-icon "+(good?"good":"warn");el("feedValue").textContent=d.health.feed;el("feedNote").textContent=(d.health.feedLatencyMs==null?"Latency unavailable":"Latency: "+d.health.feedLatencyMs+" ms")+" | Last Tick: "+dt(d.health.lastTickAt);el("runtimeValue").textContent=d.runtime.status;el("runtimeNote").textContent="Last Eval: "+dt(d.runtime.lastEvaluatedAt)+" | Next: "+dt(d.runtime.nextEvaluationAt)+" | "+d.runtime.version;var b=d.backtest;el("backtestSummary").innerHTML='<div class="sm-health-icon"><svg class="sm-icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>'+(b?'<div class="sm-bt-cell"><span>Backtest Data</span><b title="'+esc(b.source)+'">BACKTEST DATA</b></div><div class="sm-bt-cell"><span>5Y Return</span><b class="'+clsPnl(b.returnPct)+'">'+pct(b.returnPct)+'</b></div><div class="sm-bt-cell"><span>Win Rate</span><b>'+pct(b.winRate)+'</b></div><div class="sm-bt-cell"><span>Max Drawdown</span><b class="sm-negative">'+pct(b.maxDrawdown)+'</b></div><div class="sm-bt-cell"><span>Avg Monthly</span><b>'+pct(b.avgMonthlyReturn)+'</b></div><div class="sm-bt-cell"><span>Total Trades</span><b>'+value(b.totalTrades,0)+'</b></div>':'<div class="sm-bt-cell" style="grid-column:2/-1"><span>Backtest Data</span><b>Not connected for this strategy</b></div>')}
      function renderSummary(d){var s=d.summary;var card=el("pnlCard");card.classList.toggle("profit",Number(s.totalPnl)>0);card.classList.toggle("loss",Number(s.totalPnl)<0);el("totalPnl").innerHTML=money(s.totalPnl);var stateText=Number(s.totalPnl)>0?"PROFIT":Number(s.totalPnl)<0?"LOSS":"NO TRADE";el("pnlState").textContent=stateText;el("pnlMetrics").innerHTML=metric("Realized P&L",money(s.realizedPnl),clsPnl(s.realizedPnl))+metric("Unrealized P&L",money(s.unrealizedPnl),clsPnl(s.unrealizedPnl))+metric("Today's Trades",value(s.trades,0))+metric("Open Positions",value(s.openPositions,0))+metric("Wins",value(s.wins,0),"sm-positive")+metric("Losses",value(s.losses,0),"sm-negative")+metric("Win Rate",pct(s.winRate))+metric("Last Updated",dt(s.lastUpdatedAt));el("pnlFoot").textContent=s.trades===0&&s.openPositions===0?"No shadow trade executed today.":"Total Shadow P&L = Realized Shadow P&L + Unrealized Shadow P&L."}
      function renderPosition(d){var option=d.identity.instrumentType==="OPTIONS";el("positionTitle").textContent="Current Position ("+(option?"Options":"Futures")+")";var p=d.position;if(!p){el("instrumentChip").textContent="WAITING";el("positionBody").className="sm-empty";el("positionBody").innerHTML='<div><b>No open shadow position</b><span>The selected strategy is waiting for the next valid signal.</span><div class="sm-health-note" style="margin-top:10px">Last evaluated: '+dt(d.runtime.lastEvaluatedAt)+' | Next: '+dt(d.runtime.nextEvaluationAt)+' | Result: '+esc(d.lastSignal||"No Signal")+'</div></div>';return}el("instrumentChip").textContent="OPEN";el("positionBody").className="sm-snapshot-grid";var age=p.entryAt?(Math.max(0,Math.floor((Date.now()-new Date(p.entryAt).getTime())/60000))+" min"):"--";var risk=p.entryPrice!=null&&p.stopLoss!=null&&p.target!=null&&Math.abs(p.entryPrice-p.stopLoss)>0?"1 : "+(Math.abs(p.target-p.entryPrice)/Math.abs(p.entryPrice-p.stopLoss)).toFixed(2):"--";var rows=option?[["Contract",p.instrument],["Type",/CE$/i.test(p.instrument||"")?"CE":/PE$/i.test(p.instrument||"")?"PE":"--"],["Buy / Sell",p.side],["Lots",value(p.quantity,0)],["Entry Premium",value(p.entryPrice)],["Current Premium",value(p.ltp)],["Stop Loss",value(p.stopLoss)],["Target",value(p.target)],["Current P&L",money(p.currentPnl)],["Status",p.status],["Entry Time",p.entryTime||"--"],["Position Age",age],["Last Evaluated",dt(d.runtime.lastEvaluatedAt)],["Next Evaluation",dt(d.runtime.nextEvaluationAt)]]:[["Instrument",p.instrument],["Direction",p.side],["Quantity / Lots",value(p.quantity,0)],["Entry Price",value(p.entryPrice)],["LTP",value(p.ltp)],["Current P&L",money(p.currentPnl)],["Stop Loss",value(p.stopLoss)],["Target",value(p.target)],["Risk / Reward",risk],["Entry Time",p.entryTime||"--"],["Position Age",age],["Status",p.status],["Last Evaluated",dt(d.runtime.lastEvaluatedAt)],["Next Evaluation",dt(d.runtime.nextEvaluationAt)]];el("positionBody").innerHTML=rows.map(function(r){var special=r[0]==="Current P&L";var type=r[0]==="Type"&&/^(CE|PE)$/.test(r[1]);return'<div class="sm-kv"><span>'+esc(r[0])+'</span><b class="'+(special?clsPnl(p.currentPnl):type?"sm-tag sm-cepe "+r[1].toLowerCase():"")+'">'+(String(r[1]).indexOf("&#8377;")>=0?r[1]:esc(r[1]))+'</b></div>'}).join("")}
      function renderTrades(d){var option=d.identity.instrumentType==="OPTIONS";el("tradeTitle").textContent="Today's Trade History ("+(option?"Options":"Futures")+")";var headers=option?["#","Time","Contract","Type","Strike","Side","Qty","Entry Premium","Exit Premium","SL","Target","P&L","Result","Status"]:["#","Time","Instrument","Side","Qty (Lots)","Entry Price","Exit Price","SL","Target","P&L","Result","Status"];var trades=d.trades||[];var rows=trades.map(function(t,index){var side=esc(t.side||"--");var result=esc(t.result||"--");var status=esc(t.status||"--");var type=/CE$/i.test(t.instrument||"")?"CE":/PE$/i.test(t.instrument||"")?"PE":"--";var strike=(t.instrument||"").match(/(\\d+)(?:CE|PE)$/i);var common=option?[index+1,esc(t.time||"--"),esc(t.instrument||"--"),'<span class="sm-tag sm-cepe '+type.toLowerCase()+'">'+type+"</span>",strike?strike[1]:"--",'<span class="sm-tag '+(/buy|ce/i.test(side)?"buy":"sell")+'">'+side+"</span>",value(t.quantity,0),value(t.entry),value(t.exit),value(t.stopLoss),value(t.target),'<span class="'+clsPnl(t.pnl)+'">'+money(t.pnl)+"</span>",'<span class="sm-tag '+result.toLowerCase()+'">'+result+"</span>",'<span class="sm-tag '+status.toLowerCase()+'">'+status+"</span>"]:[index+1,esc(t.time||"--"),esc(t.instrument||"--"),'<span class="sm-tag '+(/buy|long|ce/i.test(side)?"buy":"sell")+'">'+side+"</span>",value(t.quantity,0),value(t.entry),value(t.exit),value(t.stopLoss),value(t.target),'<span class="'+clsPnl(t.pnl)+'">'+money(t.pnl)+"</span>",'<span class="sm-tag '+result.toLowerCase()+'">'+result+"</span>",'<span class="sm-tag '+status.toLowerCase()+'">'+status+"</span>"];return"<tr>"+common.map(function(c){return"<td>"+c+"</td>"}).join("")+"</tr>"}).join("");el("tradeTable").innerHTML="<thead><tr>"+headers.map(function(h){return"<th>"+esc(h)+"</th>"}).join("")+"</tr></thead><tbody>"+(rows||'<tr><td class="sm-table-empty" colspan="'+headers.length+'">No shadow trades recorded today for this strategy and instrument.</td></tr>')+"</tbody>";el("tradeShowing").textContent=trades.length?"Showing 1 to "+trades.length+" of "+trades.length+" trades":"Showing 0 trades";var total=trades.reduce(function(sum,t){return sum+(isFinite(Number(t.pnl))?Number(t.pnl):0)},0);el("tradeTotal").className="sm-table-total "+clsPnl(total);el("tradeTotal").innerHTML="Total P&L: "+money(total)}
      function renderCandles(d){var rows=(d.candles||[]).map(function(c){return"<tr><td>"+esc(c.time||"--")+"</td><td>"+esc(c.timeframe||"--")+"</td><td>"+value(c.open)+"</td><td>"+value(c.high)+"</td><td>"+value(c.low)+"</td><td>"+value(c.close)+"</td><td>"+value(c.volume,0)+"</td><td><span class='sm-tag'>"+esc(c.status||"--")+"</span></td><td class='note' title='"+esc(c.note)+"'>"+esc(c.note)+"</td></tr>"}).join("");el("candleTable").innerHTML="<thead><tr><th>Time</th><th>Timeframe</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th><th>Status</th><th>Evaluation Note</th></tr></thead><tbody>"+(rows||'<tr><td class="sm-table-empty" colspan="9">No relevant candle logs recorded for the selected strategy.</td></tr>')+"</tbody>"}
      function renderInstrumentSummary(d){var option=d.identity.instrumentType==="OPTIONS";var s=d.instrumentSummary||{};el("instrumentSummaryTitle").textContent="Instrument Summary ("+(option?"Options":"Futures")+")";el("summaryTypeChip").textContent=option?(s.type||"OPTIONS"):"FUTURES";el("summaryTypeChip").className="sm-type-chip "+(option&&s.type?"sm-cepe "+String(s.type).toLowerCase():"");var rows=option?[["Contract",s.contract],["Type",s.type],["Strike",value(s.strike,0)],["Expiry",s.expiry],["Lot Size",value(s.lotSize,0)],["LTP",value(s.ltp)],["Change",value(s.change)],["Day High",value(s.dayHigh)],["Day Low",value(s.dayLow)],["Open Interest",value(s.openInterest,0)],["Volume",value(s.volume,0)],["Implied Volatility",pct(s.impliedVolatility)]]:[["Contract",s.contract],["Lot Size",value(s.lotSize,0)],["Tick Size",value(s.tickSize)],["LTP",value(s.ltp)],["Change",value(s.change)],["Day High",value(s.dayHigh)],["Day Low",value(s.dayLow)],["Open Interest",value(s.openInterest,0)],["Volume",value(s.volume,0)],["Expiry",s.expiry]];el("instrumentSummaryBody").innerHTML=rows.map(function(r){return'<div class="sm-kv"><span>'+esc(r[0])+'</span><b>'+esc(r[1]==null?"--":r[1])+'</b></div>'}).join("")}
      function renderLogs(d){var box=el("logConsole");var nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<28;var rows=(d.logs||[]).map(function(l){return'<div class="sm-log-line"><span>'+esc(l.time||"--:--:--")+'</span><b class="'+esc(l.level)+'">'+esc(l.level)+'</b><span>'+esc(l.message)+'</span></div>'}).join("");box.innerHTML=rows||'<div class="sm-muted">No server log entries available.</div>';if(state.logStick&&nearBottom)box.scrollTop=box.scrollHeight;el("resumeLogs").hidden=state.logStick}
      function render(d){state.data=d;renderStrategies(d.strategies);renderHealth(d);renderSummary(d);renderPosition(d);renderTrades(d);renderCandles(d);renderInstrumentSummary(d);renderLogs(d);var tradeDay=new Date(d.identity.tradeDate+"T00:00:00");el("todayLabel").textContent="Today ("+tradeDay.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})+")";var m=el("marketStatus");m.className="sm-market "+(d.market.status==="OPEN"?"open":"closed");m.querySelector("span:last-child").textContent="Market "+(d.market.status==="OPEN"?"Open":"Closed");el("refreshMeta").textContent="Last refreshed: "+dt(d.refreshedAt);document.querySelectorAll("[data-instrument]").forEach(function(b){b.classList.toggle("active",b.dataset.instrument===state.instrument)});el("shadowMonitor").classList.remove("sm-loading")}
      async function load(){var seq=++state.request;if(activeController)activeController.abort();activeController=new AbortController();el("shadowMonitor").classList.add("sm-loading");try{var url="/api/shadow-monitor?strategy="+encodeURIComponent(state.strategy)+"&instrument="+encodeURIComponent(state.instrument);var r=await fetch(url,{cache:"no-store",credentials:"same-origin",signal:activeController.signal});if(!r.ok)throw new Error("HTTP "+r.status);var d=await r.json();if(seq!==state.request)return;if(!d.ok)throw new Error(d.error||"Monitor unavailable");render(d)}catch(e){if(e.name==="AbortError")return;el("refreshMeta").textContent="Refresh failed: "+e.message;el("shadowMonitor").classList.remove("sm-loading")}}
      el("strategySelect").addEventListener("change",function(){state.strategy=this.value;localStorage.setItem("zsShadowStrategy",state.strategy);load()});document.querySelectorAll("[data-instrument]").forEach(function(b){b.addEventListener("click",function(){state.instrument=this.dataset.instrument;localStorage.setItem("zsShadowInstrument",state.instrument);load()})});el("refreshAll").addEventListener("click",load);el("logConsole").addEventListener("scroll",function(){if(this.scrollHeight-this.scrollTop-this.clientHeight>=28){state.logStick=false;el("resumeLogs").hidden=false;el("pauseLogs").hidden=true}});el("pauseLogs").addEventListener("click",function(){state.logStick=false;this.hidden=true;el("resumeLogs").hidden=false});el("resumeLogs").addEventListener("click",function(){state.logStick=true;el("logConsole").scrollTop=el("logConsole").scrollHeight;this.hidden=true;el("pauseLogs").hidden=false});el("openHistory").addEventListener("click",function(){el("historyModal").classList.add("open");renderHistory("WEEKLY")});el("closeHistory").addEventListener("click",function(){el("historyModal").classList.remove("open")});el("historyModal").addEventListener("click",function(e){if(e.target===this)this.classList.remove("open")});document.querySelectorAll("[data-period]").forEach(function(b){b.addEventListener("click",function(){document.querySelectorAll("[data-period]").forEach(function(x){x.classList.toggle("active",x===b)});renderHistory(b.dataset.period)})});
      function renderHistory(period){var d=state.data;if(!d)return;var body=el("historyBody");if(period==="BACKTEST"){var b=d.backtest;body.innerHTML=b?'<div class="sm-history-state"><b>Backtest Data</b><p>Source: '+esc(b.source)+'</p><p>Return: '+pct(b.returnPct)+' | Win rate: '+pct(b.winRate)+' | Max drawdown: '+pct(b.maxDrawdown)+' | Trades: '+value(b.totalTrades,0)+'</p></div>':'<div class="sm-history-state">Backtest data is not connected for this strategy.</div>';return}var h=d.history||{};var rows=period==="WEEKLY"?h.weekly:period==="MONTHLY"?h.monthly:h.yearly;if(!rows||!rows.length){body.innerHTML='<div class="sm-history-state"><b>Historical Shadow Data - '+esc(period)+'</b><p>No persisted '+esc(period.toLowerCase())+' shadow records are available for this strategy and instrument.</p></div>';return}body.innerHTML='<div class="sm-source" style="margin-bottom:10px">Historical Shadow Data | Source: '+esc(h.source||"Not available")+'</div><div class="sm-table-wrap" style="max-height:54vh"><table class="sm-table"><thead><tr><th>Period</th><th>Net P&L</th><th>Trading Days</th><th>Trades</th><th>Wins</th><th>Losses</th><th>Win Rate</th></tr></thead><tbody>'+rows.map(function(r){return"<tr><td>"+esc(r.period)+"</td><td class='"+clsPnl(r.pnl)+"'>"+money(r.pnl)+"</td><td>"+value(r.tradingDays,0)+"</td><td>"+value(r.trades,0)+"</td><td class='sm-positive'>"+value(r.wins,0)+"</td><td class='sm-negative'>"+value(r.losses,0)+"</td><td>"+pct(r.winRate)+"</td></tr>"}).join("")+"</tbody></table></div>"}
      load();setInterval(load,10000);
    })();
  </script>
  <script src="/public/js/app.js"></script>
</body>
</html>`;
}
