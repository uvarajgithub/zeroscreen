const fs = require('fs');
const path = require('path');

const botDir = '/home/ubuntu/trading-bot';
const session = process.env.SHADOW_DIAG_SESSION || '2026-07-31';

function readJson(name, fallback = null) {
  try { return JSON.parse(fs.readFileSync(path.join(botDir, name), 'utf8')); } catch (_) { return fallback; }
}
function histogram(rows, field = 'status') {
  const counts = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.[field] || 'unset');
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
function notes(rows) {
  return [...new Set((Array.isArray(rows) ? rows : []).map((row) => String(row?.note || '')).filter(Boolean))]
    .slice(-12).map((value) => value.slice(0, 180));
}
function summarize(name, stateFile, candleFile) {
  const state = readJson(stateFile, {});
  const candleRoot = readJson(candleFile, {});
  const candles = Array.isArray(state?.candleLog) && state.candleLog.length ? state.candleLog : Array.isArray(candleRoot?.log) ? candleRoot.log : [];
  const log = Array.isArray(state?.log) ? state.log : [];
  console.log(JSON.stringify({
    strategy: name,
    stateFile,
    stateDate: state?.date || state?.day || null,
    candleDate: candleRoot?.date || null,
    phase: state?.phase || null,
    inTrade: Boolean(state?.inTrade || state?.dir),
    dir: state?.dir || null,
    trades: Number(state?.trades || 0),
    wins: Number(state?.wins || 0),
    losses: Number(state?.losses || 0),
    candleCount: candles.length,
    firstCandle: candles[0]?.time || null,
    lastCandle: candles[candles.length - 1]?.time || null,
    statuses: histogram(candles),
    notes: notes(candles),
    tradeLogCount: log.length,
  }));
}

summarize('TT1030_SHADOW', 'tt1030-shadow-state.json', 'tt1030-shadow-candle-log.json');
summarize('TT1000_SHADOW', 'tt1000-state.json', 'tt1000-candle-log.json');
summarize('HYBRID_BODY_SHADOW', 'hybrid-state.json', 'hybrid-candle-log.json');
summarize('NORMAL_BREAKOUT_SHADOW', 'normal-breakout-v1-state.json', 'normal-breakout-v1-candle-log.json');

const drishtiCandles = readJson('candle-log.json', []);
const drishtiRows = Array.isArray(drishtiCandles) ? drishtiCandles : drishtiCandles?.log || [];
console.log(JSON.stringify({ strategy: 'DRISHTI_V1', candleDate: drishtiCandles?.date || null, candleCount: drishtiRows.length, reasons: histogram(drishtiRows, 'reason'), signals: histogram(drishtiRows, 'signal') }));

const trades = readJson('trades.json', []);
const sessionTrades = (Array.isArray(trades) ? trades : []).filter((row) => String(row?.date || '').slice(0, 10) === session);
const tradeTypes = {};
for (const row of sessionTrades) {
  const type = String(row?.type || 'UNKNOWN');
  tradeTypes[type] = (tradeTypes[type] || 0) + 1;
}
console.log(JSON.stringify({ session, totalTradeRows: sessionTrades.length, tradeTypes }));
console.log(JSON.stringify({ sessionTradeTimeline: sessionTrades.map((row) => ({ date: row.date, type: row.type, direction: row.direction || null, reasonEntry: row.reasonEntry || null, reasonExit: row.reasonExit || null, pnl: Number(row.pnl || 0), pnlRs: Number(row.pnlRs || 0) })) }));

const markers = [
  'TT1030_RUN_ERR', 'TT1000_RUN_ERR', 'HYBRID_SHADOW_ERR', 'NORMAL_BREAKOUT_SHADOW_ERR', 'BH_SHADOW_ERR',
  'TT1000_ENTRY', 'TT1000_EXIT', 'BH_S1_ENTRY', 'BH_S1_EXIT', 'BH_S2_ENTRY', 'BH_S2_EXIT',
  'NORMAL_BREAKOUT_V1_ENTRY', 'NORMAL_BREAKOUT_V1_EXIT', 'HYBRID_BODY', 'TT1030_SHADOW_BOOTSTRAP',
  'SHADOW_CANDLE_FEED_ERR', 'SKIP_CYCLE', 'RUN_BOT_TIMEOUT', 'DRISHTI_TODAY_BACKFILL_FAIL',
];
const counts = Object.fromEntries(markers.map((marker) => [marker, 0]));
const logDir = '/root/.pm2/logs';
for (const fileName of fs.readdirSync(logDir).filter((name) => /^trading-bot.*\.log$/i.test(name))) {
  const file = path.join(logDir, fileName);
  const data = fs.readFileSync(file, 'utf8');
  for (const marker of markers) counts[marker] += (data.match(new RegExp(marker, 'g')) || []).length;
}
console.log(JSON.stringify({ strategyLogMarkerCounts: counts }));

const sessionErrorDetails = {};
for (const marker of markers.filter((value) => /ERR|FAIL|TIMEOUT/.test(value))) sessionErrorDetails[marker] = [];
for (const fileName of fs.readdirSync(logDir).filter((name) => /^trading-bot.*\.log$/i.test(name))) {
  const file = path.join(logDir, fileName);
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const sessionLike = line.includes(session) || line.includes('31/7/2026') || line.includes('7/31/2026');
    if (!sessionLike) continue;
    for (const marker of Object.keys(sessionErrorDetails)) {
      if (!line.includes(marker)) continue;
      let safe = line;
      try {
        const parsed = JSON.parse(line);
        safe = JSON.stringify({ time: parsed.time || parsed.at || null, event: parsed.event || marker, error: parsed.error || parsed.message || null });
      } catch (_) {
        safe = line.slice(0, 300);
      }
      safe = safe.replace(/[A-Za-z0-9._~-]{24,}/g, '[REDACTED]');
      if (!sessionErrorDetails[marker].includes(safe)) sessionErrorDetails[marker].push(safe);
    }
  }
}
for (const marker of Object.keys(sessionErrorDetails)) sessionErrorDetails[marker] = sessionErrorDetails[marker].slice(-8);
console.log(JSON.stringify({ sessionErrorDetails }));

const bodyHoldSessionEvents = [];
for (const fileName of fs.readdirSync(logDir).filter((name) => /^trading-bot.*\.log$/i.test(name))) {
  const file = path.join(logDir, fileName);
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!(line.includes(session) || line.includes('31/7/2026') || line.includes('7/31/2026'))) continue;
    if (!/BH_(?:S1|S2)_(?:ENTRY|EXIT)/.test(line)) continue;
    bodyHoldSessionEvents.push(line.replace(/[A-Za-z0-9._~-]{24,}/g, '[REDACTED]').slice(0, 500));
  }
}
console.log(JSON.stringify({ bodyHoldSessionEvents: bodyHoldSessionEvents.slice(-30) }));

const source = fs.readFileSync(path.join(botDir, 'dist/src/index.js'), 'utf8');
const scheduled = {
  tt1030: (source.match(/runTenThirtyTradeOps\(/g) || []).length,
  tt1000: (source.match(/runTenOCLockShadow\(/g) || []).length,
  hybrid: (source.match(/runHybridBodyShadow\(/g) || []).length,
  normal: (source.match(/runNormalBreakoutShadow\(/g) || []).length,
  bodyHold: (source.match(/runBodyHoldShadow\(/g) || []).length,
};
console.log(JSON.stringify({ scheduledCallOccurrences: scheduled }));
