const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.resolve(
  __dirname,
  '../../.tmp-build/fresh-banknifty-15m-2m-2026-08-16.vps.json',
), 'utf8')).days;

function round(value, digits = 1) {
  return Number(value.toFixed(digits));
}

function minutes(time) {
  const [hh, mm] = time.split(':').map(Number);
  return hh * 60 + mm;
}

function bodyPct(c) {
  return Math.abs(c.close - c.open) / Math.max(0.01, c.high - c.low) * 100;
}

function simulateBreakout(candles, rangeTime, trailBufferPts) {
  const idx = candles.findIndex((c) => c.time === rangeTime);
  if (idx < 0) return { points: 0, trades: [], first: null, range: null };
  const range = candles[idx];
  let active = null;
  const trades = [];

  function close(c, exit, reason) {
    const points = active.dir === 'CE' ? exit - active.entry : active.entry - exit;
    trades.push({
      dir: active.dir,
      entryTime: active.entryTime,
      exitTime: c.time,
      entry: round(active.entry, 2),
      exit: round(exit, 2),
      points: round(points, 2),
      reason,
      signalBreakPts: round(active.signalBreakPts, 2),
      signalRiskPts: round(active.signalRiskPts, 2),
      signalBodyPct: round(active.signalBodyPct, 1),
    });
    active = null;
  }

  for (let i = idx + 1; i < candles.length; i += 1) {
    const c = candles[i];
    const eod = i === candles.length - 1 || c.time >= '15:30';
    if (active) {
      const slHit = active.dir === 'CE' ? c.close <= active.sl : c.close >= active.sl;
      if (slHit || eod) {
        close(c, slHit ? active.sl : c.close, slHit ? 'sl_hit' : 'exit_eod');
        continue;
      }
      if (active.dir === 'CE' && c.close > active.refHigh) {
        active.sl = Math.max(active.sl, c.low - trailBufferPts);
        active.refHigh = c.high;
        active.refLow = c.low;
      } else if (active.dir === 'PE' && c.close < active.refLow) {
        active.sl = Math.min(active.sl, c.high + trailBufferPts);
        active.refHigh = c.high;
        active.refLow = c.low;
      }
      continue;
    }

    if (trades.length >= 2 || eod) continue;
    const upBreakPts = c.close - range.high;
    const downBreakPts = range.low - c.close;
    const dir = upBreakPts > 0 ? 'CE' : downBreakPts > 0 ? 'PE' : null;
    if (!dir) continue;

    const entry = c.close;
    const sl = dir === 'CE' ? c.low : c.high;
    active = {
      dir,
      entry,
      entryTime: c.time,
      sl,
      refHigh: c.high,
      refLow: c.low,
      signalBreakPts: dir === 'CE' ? upBreakPts : downBreakPts,
      signalRiskPts: dir === 'CE' ? entry - sl : sl - entry,
      signalBodyPct: bodyPct(c),
    };
  }

  return {
    points: round(trades.reduce((sum, trade) => sum + trade.points, 0), 1),
    trades,
    first: trades[0] || null,
    range,
  };
}

function dayFeatures(date, candles) {
  const ten = simulateBreakout(candles, '10:00', 10);
  const tt = simulateBreakout(candles, '10:30', 0);
  const firstOpen = candles[0].open;
  const dayHigh = Math.max(...candles.map((c) => c.high));
  const dayLow = Math.min(...candles.map((c) => c.low));
  const dayClose = candles[candles.length - 1].close;
  const dayMove = dayClose - firstOpen;
  const dayRange = dayHigh - dayLow;
  const first10 = ten.first;
  const first1030 = tt.first;
  const tenRange = ten.range;
  const ttRange = tt.range;
  const status = first10 && first1030
    ? first10.dir === first1030.dir ? 'SAME' : 'OPPOSITE'
    : first10 ? '10_ONLY'
      : first1030 ? '1030_ONLY'
        : 'NO_TRADE';

  return {
    date,
    status,
    ten,
    tt,
    tenPts: ten.points,
    ttPts: tt.points,
    winner: ten.points > tt.points ? '10' : tt.points > ten.points ? '1030' : 'TIE',
    tenSide: first10?.dir || '-',
    ttSide: first1030?.dir || '-',
    tenFirstTime: first10?.entryTime || '-',
    ttFirstTime: first1030?.entryTime || '-',
    tenBreakPts: first10?.signalBreakPts || 0,
    ttBreakPts: first1030?.signalBreakPts || 0,
    tenRiskPts: first10?.signalRiskPts || 0,
    ttRiskPts: first1030?.signalRiskPts || 0,
    tenBodyPct: first10?.signalBodyPct || 0,
    ttBodyPct: first1030?.signalBodyPct || 0,
    tenRangeWidth: tenRange ? tenRange.high - tenRange.low : 0,
    ttRangeWidth: ttRange ? ttRange.high - ttRange.low : 0,
    moveTo1030Close: ttRange ? ttRange.close - firstOpen : 0,
    dayMove,
    dayRange,
    directionality: Math.abs(dayMove) / Math.max(1, dayRange) * 100,
    timeGap: first10 && first1030 ? minutes(first1030.entryTime) - minutes(first10.entryTime) : 0,
  };
}

const rows = Object.entries(data).map(([date, candles]) => dayFeatures(date, candles));
const opposite = rows.filter((r) => r.status === 'OPPOSITE');

function evaluateRule(rule) {
  let points = 0;
  let wins = 0;
  let greenDays = 0;
  let redDays = 0;
  let flatDays = 0;
  const picks = [];
  for (const row of rows) {
    let pick;
    if (row.status === 'SAME') pick = '10';
    else if (row.status === 'OPPOSITE') pick = rule(row) ? '10' : '1030';
    else if (row.status === '10_ONLY') pick = '10';
    else if (row.status === '1030_ONLY') pick = '1030';
    else pick = 'NONE';
    const pickPts = pick === '10' ? row.tenPts : pick === '1030' ? row.ttPts : 0;
    points += pickPts;
    if (pickPts > 0) greenDays += 1;
    else if (pickPts < 0) redDays += 1;
    else flatDays += 1;
    if (pick === row.winner || row.winner === 'TIE') wins += 1;
    picks.push({ ...row, pick, pickPts });
  }
  return {
    points: round(points, 1),
    rupees: Math.round(points * 30),
    winnerDays: wins,
    greenDays,
    redDays,
    flatDays,
    picks,
  };
}

const candidatePredicates = [];
function add(name, fn) {
  candidatePredicates.push({ name, fn });
}

add('status same', (r) => r.status === 'SAME');
add('status opposite', (r) => r.status === 'OPPOSITE');

for (const t of ['10:30', '10:45', '11:00', '11:15', '11:30', '12:00']) {
  add(`10 if 10 first <= ${t}`, (r) => r.tenFirstTime <= t);
  add(`10 if 1030 first >= ${t}`, (r) => r.ttFirstTime >= t);
}
for (const v of [25, 50, 75, 100, 125, 150, 200, 250, 300, 400]) {
  add(`10 if abs moveTo1030 >= ${v}`, (r) => Math.abs(r.moveTo1030Close) >= v);
  add(`10 if abs moveTo1030 < ${v}`, (r) => Math.abs(r.moveTo1030Close) < v);
  add(`10 if 1030 range <= ${v}`, (r) => r.ttRangeWidth <= v);
  add(`10 if 1030 range > ${v}`, (r) => r.ttRangeWidth > v);
  add(`10 if 10 break >= ${v}`, (r) => r.tenBreakPts >= v);
  add(`10 if 1030 break >= ${v}`, (r) => r.ttBreakPts >= v);
}
for (const v of [25, 50, 75, 100, 125, 150]) {
  add(`10 if 10 risk <= ${v}`, (r) => r.tenRiskPts <= v);
  add(`10 if 1030 risk <= ${v}`, (r) => r.ttRiskPts <= v);
}
for (const v of [20, 40, 60, 80]) {
  add(`10 if 10 body >= ${v}`, (r) => r.tenBodyPct >= v);
  add(`10 if 1030 body >= ${v}`, (r) => r.ttBodyPct >= v);
}

const baseline10 = evaluateRule(() => true);
const baseline1030 = evaluateRule(() => false);
const simpleOppositeRules = candidatePredicates
  .map(({ name, fn }) => ({ name, ...evaluateRule(fn) }))
  .sort((a, b) => b.points - a.points)
  .slice(0, 20)
  .map(({ picks, ...rest }) => rest);

const bestRule = candidatePredicates
  .map(({ name, fn }) => ({ name, fn, ...evaluateRule(fn) }))
  .sort((a, b) => b.points - a.points)[0];

const comboRules = [];
for (let i = 0; i < candidatePredicates.length; i += 1) {
  for (let j = i + 1; j < candidatePredicates.length; j += 1) {
    const a = candidatePredicates[i];
    const b = candidatePredicates[j];
    comboRules.push({
      name: `(${a.name}) OR (${b.name})`,
      ...evaluateRule((r) => a.fn(r) || b.fn(r)),
    });
    comboRules.push({
      name: `(${a.name}) AND (${b.name})`,
      ...evaluateRule((r) => a.fn(r) && b.fn(r)),
    });
  }
}

const topComboRules = comboRules
  .sort((a, b) => b.points - a.points)
  .slice(0, 20)
  .map(({ picks, ...rest }) => rest);
const bestComboRule = comboRules.sort((a, b) => b.points - a.points)[0];

const selected = bestRule.picks.map((r) => ({
  date: r.date,
  status: r.status,
  tenSide: r.tenSide,
  ttSide: r.ttSide,
  tenPts: r.tenPts,
  ttPts: r.ttPts,
  winner: r.winner,
  pick: r.pick,
  pickPts: r.pickPts,
  tenFirstTime: r.tenFirstTime,
  ttFirstTime: r.ttFirstTime,
  moveTo1030Close: round(r.moveTo1030Close, 1),
  ttRangeWidth: round(r.ttRangeWidth, 1),
  tenBreakPts: round(r.tenBreakPts, 1),
  ttBreakPts: round(r.ttBreakPts, 1),
}));

console.log(JSON.stringify({
  totals: {
    days: rows.length,
    sameDays: rows.filter((r) => r.status === 'SAME').length,
    oppositeDays: opposite.length,
  },
  always10WithSameRule: {
    points: baseline10.points,
    rupees: baseline10.rupees,
    note: 'same/10-only use 10; opposite also choose 10',
  },
  always1030OnOpposite: {
    points: baseline1030.points,
    rupees: baseline1030.rupees,
    note: 'same uses 10; opposite choose 10:30',
  },
  topSimpleRules: simpleOppositeRules,
  bestRule: {
    name: bestRule.name,
    points: bestRule.points,
    rupees: bestRule.rupees,
    winnerDays: bestRule.winnerDays,
  },
  topComboRules,
  bestComboRuleMisses: bestComboRule.picks
    .filter((r) => r.pick !== r.winner && r.winner !== 'TIE')
    .map((r) => ({
      date: r.date,
      status: r.status,
      tenSide: r.tenSide,
      ttSide: r.ttSide,
      tenPts: r.tenPts,
      ttPts: r.ttPts,
      winner: r.winner,
      picked: r.pick,
      moveTo1030Close: round(r.moveTo1030Close, 1),
      tenBodyPct: round(r.tenBodyPct, 1),
      tenBreakPts: round(r.tenBreakPts, 1),
      ttBreakPts: round(r.ttBreakPts, 1),
      tenFirstTime: r.tenFirstTime,
      ttFirstTime: r.ttFirstTime,
    })),
  selected,
}, null, 2));
