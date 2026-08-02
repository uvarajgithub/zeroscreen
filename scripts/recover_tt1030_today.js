const fs = require("fs");
const { KiteConnect } = require("kiteconnect");
const { config } = require("./dist/src/config");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_err) {
    return fallback;
  }
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function istParts(d = new Date()) {
  const z = new Date(d.getTime() + 5.5 * 3600000);
  return { ymd: z.toISOString().slice(0, 10), hhmm: z.toISOString().slice(11, 16) };
}

function fmtIST(epochMs) {
  const z = new Date(epochMs + 5.5 * 3600000);
  return `${z.toISOString().slice(0, 10)} ${z.toISOString().slice(11, 19)}`;
}

function candleTime(c) {
  return istParts(new Date(c.date)).hhmm;
}

(async () => {
  const today = istParts().ymd;
  const trades = readJson("trades.json", []);
  const fut = trades.find((t) =>
    String(t.date || "").slice(0, 10) === today &&
    String(t.type || "").toUpperCase().includes("TEN_THIRTY_INDEX")
  );
  if (!fut) {
    console.log(JSON.stringify({ ok: false, reason: "No today TEN_THIRTY_INDEX trade row found" }, null, 2));
    return;
  }
  const opt = trades.find((t) =>
    String(t.date || "").slice(0, 10) === today &&
    String(t.type || "").toUpperCase().includes("TEN_THIRTY_OPT")
  );

  const todayStart = new Date(`${today}T00:00:00.000Z`).getTime() - 5.5 * 3600000;
  const from = fmtIST(todayStart + (9 * 60 + 15) * 60000);
  const to = fmtIST(Date.now() - 60000);
  const kite = new KiteConnect({ api_key: config.apiKey });
  kite.setAccessToken(config.accessToken);
  const rawCandles = await kite.getHistoricalData(260105, "15minute", from, to, false);
  const candles = (rawCandles || []).map((c) => ({
    open: +c.open,
    high: +c.high,
    low: +c.low,
    close: +c.close,
    date: typeof c.date === "string" ? c.date : new Date(c.date).toISOString(),
  }));
  if (candles.length < 6) {
    console.log(JSON.stringify({ ok: false, reason: "Not enough candles from Kite", count: candles.length }, null, 2));
    return;
  }

  const rangeCandle = candles[5];
  const tradeAt = new Date(fut.date || fut.exitTime || fut.entryTime || Date.now()).getTime();
  const dir = String(fut.direction || fut.side || "").toUpperCase();
  const entry = Number(fut.entryPrice || 0);
  const exit = Number(fut.exitPrice || 0);
  const pts = Number(fut.pnl || fut.points || 0);
  const pnlRs = Number(fut.pnlRs || Math.round(pts * Number(fut.qty || config.quantity || 30)));
  const qty = Number(fut.qty || config.quantity || 30);

  const candleLog = candles.map((c, index) => {
    const idx = index + 1;
    const time = candleTime(c);
    const cStart = new Date(c.date).getTime();
    const row = {
      idx,
      time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      status: "watching",
      dir: null,
      sl: null,
      note: "",
    };
    if (idx < 6) {
      row.status = "pre_1030";
      row.note = "waiting for 10:30 candle";
    } else if (idx === 6) {
      row.status = "marked_1030";
      row.note = `range ${rangeCandle.high.toFixed(1)} / ${rangeCandle.low.toFixed(1)}`;
    } else if (cStart <= tradeAt && tradeAt < cStart + 15 * 60 * 1000) {
      row.status = String(fut.reasonExit || "sl_hit");
      row.dir = dir;
      row.entry = entry;
      row.exit = exit;
      row.pnlPts = pts;
      row.pnlRs = pnlRs;
      row.note = `${row.status} ${exit || ""}`.trim();
    } else if (idx > 6) {
      row.dir = dir || null;
      row.note = "recovered from Kite candles";
    }
    return row;
  });

  const tradeLog = [{
    time: candleTime({ date: fut.date || new Date().toISOString() }),
    dir,
    entry,
    exit,
    pts,
    pnlRs,
    reason: fut.reasonExit || "recovered",
    premIn: opt?.premiumEntry || opt?.entryPrice || undefined,
    premOut: opt?.premiumExit || opt?.exitPrice || undefined,
    symbol: opt?.symbol || undefined,
    liveMode: "SHADOW",
  }];

  const savedAt = new Date().toISOString();
  const state = {
    date: today,
    savedAt,
    restoredAt: savedAt,
    stateSource: "manual-kite-recovery",
    inTrade: false,
    dir: null,
    entry: 0,
    entryTime: "",
    sl: 0,
    optSym: "",
    optEntryPrem: 0,
    optLivePrem: 0,
    refHigh: 0,
    refLow: 0,
    tenHigh: rangeCandle.high,
    tenLow: rangeCandle.low,
    tenTime: candleTime(rangeCandle),
    trades: 1,
    wins: pts > 0 ? 1 : 0,
    losses: pts > 0 ? 0 : 1,
    dayPts: pts,
    dayRs: pnlRs,
    log: tradeLog,
    candleLog,
    lastSignalKey: "",
    trendMode: false,
    trendBreakPts: 0,
    trendBodyPct: 0,
    liveMode: "SHADOW",
    futSym: "",
    futEntryPrice: 0,
    futLivePrice: 0,
    liveQty: 0,
    entryOrderId: "",
    exitOrderId: "",
    stopOrderId: "",
    stopTriggerPrice: 0,
    dailyLossLocked: false,
  };

  writeJsonAtomic("tt1030-candle-log.json", { date: today, savedAt, log: candleLog });
  writeJsonAtomic("tt1030-state.json", state);
  console.log(JSON.stringify({ ok: true, today, candles: candleLog.length, trades: state.trades, dayRs: state.dayRs, from, to }, null, 2));
})().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: err && err.message ? err.message : String(err) }, null, 2));
  process.exitCode = 1;
});
