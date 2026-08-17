const path = require("path");
const fs = require("fs");
const BOT_DIR = process.env.TRADING_BOT_DIR || "/home/ubuntu/trading-bot";
const { KiteConnect } = require(path.join(BOT_DIR, "node_modules", "kiteconnect"));

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const day = process.argv[2] || "2026-07-08";
const env = readEnv(path.join(BOT_DIR, ".env"));
const kite = new KiteConnect({ api_key: env.API_KEY });
kite.setAccessToken(env.ACCESS_TOKEN);
const token = Number(process.env.BANKNIFTY_INDEX_TOKEN || 260105);
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
const round = (n) => Math.round(Number(n) * 100) / 100;
const label = (d) => timeFmt.format(new Date(d));

function simulate(candles, mode) {
  let rangeHigh = 0, rangeLow = 0;
  let inTrade = false, dir = "", entry = 0, entryTime = "";
  let mainHigh = 0, mainLow = 0, sl = 0;
  let trades = 0, pnl = 0;
  const log = [];
  const trace = [];
  for (const c of candles) {
    const row = { time: c.time, close: c.close, action: "", dir, mainHigh, mainLow, sl };
    if (c.time === "10:30" && !rangeHigh) {
      rangeHigh = c.high; rangeLow = c.low;
      row.action = `MARK ${rangeHigh}/${rangeLow}`;
      trace.push(row);
      continue;
    }
    if (!rangeHigh) { trace.push(row); continue; }

    if (inTrade) {
      let exit = false;
      if (mode === "old") {
        exit = dir === "CE" ? c.close <= sl : c.close >= sl;
      } else {
        exit = dir === "CE" ? c.close < mainLow : c.close > mainHigh;
      }
      const eod = c.time >= "15:15";
      if (exit || eod) {
        const exitPrice = eod ? c.close : (mode === "old" ? sl : (dir === "CE" ? mainLow : mainHigh));
        const pts = dir === "CE" ? exitPrice - entry : entry - exitPrice;
        pnl += pts;
        log.push({ side: dir, entryTime, entry: round(entry), exitTime: c.time, exit: round(exitPrice), pts: round(pts), reason: eod ? "exit_eod" : "trail_exit" });
        row.action = `EXIT ${dir} ${exitPrice}`;
        inTrade = false; dir = ""; entry = 0; entryTime = ""; mainHigh = 0; mainLow = 0; sl = 0;
      } else {
        if (mode === "old") {
          if (dir === "CE" && c.close > mainHigh) { sl = Math.max(sl, c.low); mainHigh = c.high; mainLow = c.low; row.action = `OLD_TRAIL SL ${sl}`; }
          else if (dir === "PE" && c.close < mainLow) { sl = Math.min(sl, c.high); mainHigh = c.high; mainLow = c.low; row.action = `OLD_TRAIL SL ${sl}`; }
        } else {
          if (dir === "CE" && c.close > mainHigh) { mainHigh = c.high; mainLow = c.low; sl = mainLow; row.action = `STRUCT_SHIFT ${mainHigh}/${mainLow}`; }
          else if (dir === "PE" && c.close < mainLow) { mainHigh = c.high; mainLow = c.low; sl = mainHigh; row.action = `STRUCT_SHIFT ${mainHigh}/${mainLow}`; }
          else row.action = "INSIDE_IGNORE";
        }
      }
    }

    if (!inTrade && trades < 2 && c.time < "15:15") {
      const nd = c.close > rangeHigh ? "CE" : c.close < rangeLow ? "PE" : "";
      if (nd) {
        trades += 1;
        dir = nd;
        entry = dir === "CE" ? rangeHigh : rangeLow;
        entryTime = c.time;
        mainHigh = c.high;
        mainLow = c.low;
        sl = dir === "CE" ? mainLow : mainHigh;
        inTrade = true;
        row.action = `${row.action ? row.action + "; " : ""}ENTRY ${dir} entry ${entry} main ${mainHigh}/${mainLow}`;
      }
    }
    trace.push(row);
  }
  return { mode, totalPts: round(pnl), totalRs: Math.round(pnl * 30), trades: log.length, log, trace };
}

(async () => {
  const raw = await kite.getHistoricalData(token, "15minute", day, day, false);
  const candles = raw.map((c) => ({ time: label(c.date), open: +c.open, high: +c.high, low: +c.low, close: +c.close }))
    .filter((c) => c.time >= "09:15" && c.time <= "15:30");
  console.log(JSON.stringify({ day, old: simulate(candles, "old"), structure: simulate(candles, "structure") }, null, 2));
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
