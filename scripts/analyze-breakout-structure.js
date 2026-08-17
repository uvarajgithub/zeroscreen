const fs = require("fs");

const input = process.argv[2] || "research-banknifty-15m-1y.json";
const markIndex = Number(process.argv[3] || 0);
const buffer = Number(process.argv[4] || 25);
const qty = Number(process.argv[5] || 30);
const data = JSON.parse(fs.readFileSync(input, "utf8"));

const round = (n) => Math.round(Number(n) * 100) / 100;

function simulate(candles) {
  const mark = candles[markIndex];
  if (!mark || candles.length < markIndex + 3) return null;
  const rangeHigh = mark.high;
  const rangeLow = mark.low;
  let inTrade = false, dir = "", entry = 0, entryTime = "", mainHigh = 0, mainLow = 0;
  let trades = 0, total = 0, blockNext = false;
  const log = [];

  for (let i = markIndex + 1; i < candles.length; i += 1) {
    const c = candles[i];
    let exited = false;
    if (inTrade) {
      const exitBreak = dir === "PE" ? c.close > mainHigh + buffer : c.close < mainLow - buffer;
      const eod = i >= candles.length - 2 || c.time >= "15:15";
      if (exitBreak || eod) {
        const exit = eod ? c.close : (dir === "PE" ? mainHigh + buffer : mainLow - buffer);
        const pts = dir === "PE" ? entry - exit : exit - entry;
        total += pts;
        log.push({ side: dir, entryTime, entry: round(entry), exitTime: c.time, exit: round(exit), pts: round(pts), rs: Math.round(pts * qty), reason: eod ? "exit_eod" : "structure_buffer_exit" });
        inTrade = false; dir = ""; entry = 0; entryTime = ""; mainHigh = 0; mainLow = 0;
        exited = true; blockNext = true;
      } else if (dir === "PE" && c.close < mainLow) {
        mainHigh = c.high; mainLow = c.low;
      } else if (dir === "CE" && c.close > mainHigh) {
        mainHigh = c.high; mainLow = c.low;
      }
    }
    if (blockNext) { blockNext = false; continue; }
    if (!inTrade && !exited && trades < 2 && c.time < "15:15") {
      const signal = c.close > rangeHigh ? "CE" : c.close < rangeLow ? "PE" : "";
      if (signal) {
        trades += 1;
        dir = signal;
        entry = signal === "CE" ? rangeHigh : rangeLow;
        entryTime = c.time;
        mainHigh = c.high; mainLow = c.low;
        inTrade = true;
      }
    }
  }
  return { pts: round(total), rs: Math.round(total * qty), trades: log.length, log };
}

const rows = [];
for (const day of data.sessions || Object.keys(data.days || {}).sort()) {
  const candles = data.days[day] || [];
  const result = simulate(candles);
  if (!result) continue;
  rows.push({ day, ...result });
}

const totalPts = rows.reduce((s, r) => s + r.pts, 0);
const totalRs = rows.reduce((s, r) => s + r.rs, 0);
const green = rows.filter((r) => r.pts > 0).length;
const red = rows.filter((r) => r.pts < 0).length;
const trades = rows.reduce((s, r) => s + r.trades, 0);

console.log(JSON.stringify({
  input,
  markIndex,
  markCandle: markIndex + 1,
  rule: "mark candle range; enter on later close breakout; structure trail + buffer; max 2 trades",
  buffer,
  qty,
  days: rows.length,
  totalPts: round(totalPts),
  totalRs,
  avgPts: rows.length ? round(totalPts / rows.length) : 0,
  green,
  red,
  trades,
  rows,
}, null, 2));
