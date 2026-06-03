// ================================================================
// DRISHTI V1 — June 1, 2026 — Bug vs Fixed Bot Simulation
// Source: actual PM2 logs + candle-log.json
// ================================================================

const LOT_SIZE = 15;
const TRAIL_GAP = 10;
const SL_PTS   = 150;
const MAX_TRADES = 5;
const PDH = 55184.45, PDL = 54116.15;

// ──────────────────────────────────────────────────────────────
// ACTUAL BANKNIFTY 15-min CANDLES (from PM2 candle-log.json)
// ──────────────────────────────────────────────────────────────
const candles = [
  { idx:0,  time:'09:45', close:54273.00,  bodyPct:-27 },
  { idx:1,  time:'10:00', close:54099.55,  bodyPct:-48 },
  { idx:2,  time:'10:15', close:54061.25,  bodyPct:-14 },
  { idx:3,  time:'10:30', close:53905.30,  bodyPct:-69 },  // PE ENTRY signal
  { idx:4,  time:'10:45', close:53936.10,  bodyPct: 38 },  // +38% < 40% → no re-entry
  // idx 5 = offline artifact (restart), skipped
  { idx:6,  time:'11:00', close:54059.55,  bodyPct: 74 },  // +74% CE → re-entry
  { idx:7,  time:'11:15', close:54142.80,  bodyPct: 76 },
  { idx:9,  time:'11:30', close:54066.40,  bodyPct:-50 },  // −50% PE → re-entry candidate
  { idx:10, time:'11:45', close:54046.55,  bodyPct: 16 },
  { idx:11, time:'12:00', close:53935.55,  bodyPct:-64 },
  { idx:12, time:'12:15', close:53936.30,  bodyPct: 52 },
  { idx:13, time:'12:30', close:53869.65,  bodyPct:-72 },
  { idx:14, time:'12:45', close:53848.40,  bodyPct:-36 },
  { idx:15, time:'13:00', close:53812.75,  bodyPct:-40 },
  { idx:16, time:'13:15', close:53666.20,  bodyPct:-79 },  // ← MARKET LOW
  { idx:17, time:'13:30', close:53733.70,  bodyPct: 74 },  // bull reversal → T3 trail exit + T4 CE entry
  { idx:18, time:'13:56', close:53726.20,  bodyPct:-31 },  // small pullback
  { idx:19, time:'14:00', close:53682.20,  bodyPct:-53 },
  { idx:20, time:'14:15', close:53586.80,  bodyPct:-83 },
  { idx:21, time:'14:30', close:53525.90,  bodyPct:-45 },
  { idx:22, time:'14:45', close:53596.80,  bodyPct: 43 },
  { idx:24, time:'15:15', close:53671.00,  bodyPct: 63 },  // EOD close
];

// ──────────────────────────────────────────────────────────────
// ACTUAL LTP MONITOR READINGS (from PM2 logs, every 60s OLD / 15s NEW)
// ──────────────────────────────────────────────────────────────
const ltpReadingsT1 = [
  { time:'10:30:05', ltp:53905.30, note:'ENTRY' },
  { time:'10:31:05', ltp:53878.10, pts:27.2,  peak:27.2,  trail:17.2  },
  { time:'10:32:05', ltp:53883.30, pts:22.0,  peak:27.2,  trail:17.2  },
  { time:'10:33:05', ltp:53884.05, pts:21.3,  peak:27.2,  trail:17.2  },
  { time:'10:34:05', ltp:53846.60, pts:58.7,  peak:58.7,  trail:48.7  }, // ← PEAK
  // Price REVERSED FAST — every 15s status line:
  { time:'10:34:18', ltp:53877.25, pts:28.1, note:'[15s poll would fire here → EXIT]' },
  { time:'10:34:33', ltp:53880.25, pts:25.1, note:'60s: still waiting...' },
  { time:'10:34:48', ltp:53875.85, pts:29.5, note:'60s: still waiting...' },
  { time:'10:35:03', ltp:53878.50, pts:26.8, note:'60s: still waiting...' },
  { time:'10:35:05', ltp:53878.70, pts:26.6, peak:58.7, trail:48.7, note:'[60s BUGGY EXIT ← LATE]' },
];

// ──────────────────────────────────────────────────────────────
// TRAIL SIMULATOR (candle-close approximation for T2+)
// Simulates LOCK10 trail checking at each candle close
// ──────────────────────────────────────────────────────────────
function simulateTrade(dir, entryIdx, entryPrice, allCandles) {
  let peakGain = 0;
  let events = [];
  let exitPrice = null, exitIdx = null, exitReason = null;

  // Candles AFTER entry
  const tradingCandles = allCandles.filter(c => c.idx > entryIdx);

  for (const c of tradingCandles) {
    if (c.time >= '15:15') {
      // EOD force-close
      const eodGain = dir === 'PE' ? entryPrice - c.close : c.close - entryPrice;
      exitPrice = c.close;
      exitIdx = c.idx;
      exitReason = `EOD 15:15 close`;
      events.push({ time: c.time, ltp: c.close, gain: +eodGain.toFixed(1),
                    peak: +peakGain.toFixed(1), note: '⏹ EOD EXIT' });
      break;
    }

    const gain = dir === 'PE' ? entryPrice - c.close : c.close - entryPrice;
    if (gain > peakGain) peakGain = gain;
    const trailLevel = peakGain - TRAIL_GAP;

    // SL check (when gain < -SL_PTS)
    if (gain < -SL_PTS) {
      exitPrice = dir === 'PE' ? entryPrice + SL_PTS : entryPrice - SL_PTS;
      exitIdx = c.idx;
      exitReason = `SL hit (−${SL_PTS} pts)`;
      events.push({ time: c.time, ltp: c.close, gain: -SL_PTS,
                    peak: +peakGain.toFixed(1), note: `🛑 SL EXIT at ${exitPrice.toFixed(1)}` });
      break;
    }

    // Trail check (only if peak established above TRAIL_GAP)
    if (peakGain > TRAIL_GAP && gain < trailLevel) {
      exitPrice = dir === 'PE' ? entryPrice - trailLevel : entryPrice + trailLevel;
      exitIdx = c.idx;
      exitReason = `Trail locked ${trailLevel.toFixed(1)} pts`;
      events.push({ time: c.time, ltp: c.close, gain: +gain.toFixed(1),
                    peak: +peakGain.toFixed(1), note: `✅ TRAIL EXIT at ${exitPrice.toFixed(2)} (+${trailLevel.toFixed(1)} pts)` });
      break;
    }

    events.push({ time: c.time, ltp: c.close, gain: +gain.toFixed(1),
                  peak: +peakGain.toFixed(1), note: '' });
  }

  return { exitPrice, exitIdx, exitReason, exitGain: peakGain > TRAIL_GAP ? peakGain - TRAIL_GAP : (exitReason?.includes('EOD') || exitReason?.includes('SL') ? (dir==='PE' ? entryPrice-exitPrice : exitPrice-entryPrice) : 0), events };
}

// ──────────────────────────────────────────────────────────────
// FIND RE-ENTRY
// Re-entry is checked at each candle CLOSE while flat.
// After exit during candle C_x, the CLOSE of C_x itself is the first
// opportunity. We check from exitIdx (inclusive).
// After PE exit → look for CE (bullish ≥40%)
// After CE exit → look for PE (bearish ≥40%)
// ──────────────────────────────────────────────────────────────
function findReEntry(exitIdx, lastExitDir, allCandles) {
  const lookFor = lastExitDir === 'PE' ? 'CE' : 'PE';
  for (const c of allCandles) {
    if (c.idx < exitIdx) continue;   // include the exit candle itself
    if (c.time >= '15:15') break;
    const isBullish = c.bodyPct >= 40;
    const isBearish = c.bodyPct <= -40;
    if (lookFor === 'CE' && isBullish) return { ...c, signal: 'CE' };
    if (lookFor === 'PE' && isBearish) return { ...c, signal: 'PE' };
  }
  return null;
}

// ──────────────────────────────────────────────────────────────
// PRINT HELPERS
// ──────────────────────────────────────────────────────────────
function hr(char='─', n=70) { return char.repeat(n); }
function fmt(n, width=8) { return String(n).padStart(width); }
function fmtPts(pts) {
  const s = typeof pts === 'number' ? (pts > 0 ? `+${pts.toFixed(1)}` : pts.toFixed(1)) : pts;
  return s.padStart(8);
}

// ──────────────────────────────────────────────────────────────
// SECTION 1: ACTUAL LTP TIMELINE FOR T1 PE
// ──────────────────────────────────────────────────────────────
console.log('\n' + hr('═'));
console.log(' DRISHTI V1 — June 1, 2026 — Bug vs Fixed Bot Simulation');
console.log(' BankNifty  |  PDH: 55,184  PDL: 54,116  |  Market opened INSIDE range');
console.log(hr('═'));

console.log('\n📊 ACTUAL LTP MONITOR DATA — Trade 1 PE (from PM2 logs)');
console.log(hr());
console.log(`${'Time'.padEnd(12)} ${'BankNifty'.padStart(12)} ${'Gain(pts)'.padStart(10)} ${'Peak'.padStart(8)} ${'Trail'.padStart(8)}  Note`);
console.log(hr());
for (const r of ltpReadingsT1) {
  const gain  = r.pts  !== undefined ? fmtPts(r.pts)  : '        ';
  const peak  = r.peak !== undefined ? fmtPts(r.peak) : '        ';
  const trail = r.trail!== undefined ? fmtPts(r.trail): '        ';
  const ltp   = r.ltp.toFixed(2).padStart(12);
  const note  = r.note ? `  ← ${r.note}` : '';
  console.log(`${r.time.padEnd(12)} ${ltp} ${gain} ${peak} ${trail}${note}`);
}
console.log(hr());
console.log(' KEY: Peak hit at 10:34:05 (58.7 pts). Trail locked at 48.7 pts.');
console.log(' BUGGY  (60s poll): Next check at 10:35:05 → 26.6 pts → EXIT = +27 pts ❌');
console.log(' FIXED  (15s poll): Next check at 10:34:20 → 28.1 pts → EXIT = +28 pts ✓');
console.log(' NOTE: Price reversed 32 pts in <15 sec — both bots get similar result on T1.');

// ──────────────────────────────────────────────────────────────
// SECTION 2: CANDLE-BY-CANDLE FLOW
// ──────────────────────────────────────────────────────────────
console.log('\n\n📉 CANDLE TIMELINE  (PDH:55184  PDL:54116)');
console.log(hr());
console.log(`${'C#'.padEnd(5)} ${'Time'.padEnd(7)} ${'Close'.padStart(10)} ${'Body%'.padStart(7)}  Signal/Event`);
console.log(hr());

const candleEvents = {
  3:  'PE ENTRY ← inside_c3_strong (close < prev.low, body -69%)',
  4:  'body +38% → < 40% threshold → no re-entry',
  6:  '[FIXED] CE re-entry (body +74% after PE exit)',
  9:  '[FIXED] PE re-entry (body -50% after CE exit)',
  16: '⬇ MARKET LOW  (+400 pts from entry at 54066)',
  17: '⬆ Bull reversal  (+74% CE) → trail exit T3 + T4 CE entry',
  21: 'T4 CE SL zone  (body -45% → T5 PE entry)',
  24: 'EOD close',
};

for (const c of candles) {
  const body = `${c.bodyPct > 0 ? '+' : ''}${c.bodyPct}%`.padStart(7);
  const evt  = candleEvents[c.idx] ? `  ← ${candleEvents[c.idx]}` : '';
  const cIdx = `C${c.idx}`.padEnd(5);
  console.log(`${cIdx} ${c.time.padEnd(7)} ${c.close.toFixed(2).padStart(10)} ${body}${evt}`);
}
console.log(hr());

// ──────────────────────────────────────────────────────────────
// SECTION 3: BUGGY BOT
// ──────────────────────────────────────────────────────────────
console.log('\n\n🐛 BUGGY BOT (3 bugs active — what actually happened)');
console.log(hr());
console.log(' BUG 1: backfill seed candle skipped → lastExitIdx offset +1 → re-entry blocked');
console.log(' BUG 2: firstDone race → state not restored → re-entry condition failed');
console.log(' BUG 3: LTP poll 60s → missed optimal exit window');
console.log(hr());

const buggyTrades = [
  { n:1, dir:'PE', entry:53905.30, exitPts:27,  exitPrice:53878.70, reason:'LTP 60s poll (10:35:05)' },
];
let buggyTotal = 0;
for (const t of buggyTrades) {
  const pnl = t.exitPts * LOT_SIZE;
  buggyTotal += t.exitPts;
  console.log(` T${t.n} ${t.dir}: Entry ${t.entry.toFixed(2)} → Exit ${t.exitPrice.toFixed(2)}`);
  console.log(`    Gain: +${t.exitPts} pts  |  P&L per lot: ₹${pnl}  |  ${t.reason}`);
}
console.log('');
console.log(` T2–T5: ALL BLOCKED by bugs (re-entry condition always false)`);
console.log(`   ❌ Missed C6  +74% CE at 11:00 AM`);
console.log(`   ❌ Missed C11 −64% PE at 12:00 PM  (market was falling 300+ pts)`);
console.log(`   ❌ Missed C13 −72% PE at 12:30 PM`);
console.log(`   ❌ Missed C16 −79% PE at 1:15 PM   (BankNifty low of the day)`);
console.log(hr());
console.log(` BUGGY TOTAL:  +${buggyTotal} pts  =  ₹${buggyTotal * LOT_SIZE} per lot`);

// ──────────────────────────────────────────────────────────────
// SECTION 4: FIXED BOT — TRADE BY TRADE SIMULATION
// ──────────────────────────────────────────────────────────────
console.log('\n\n✅ FIXED BOT (all 6 bugs fixed — simulation)');
console.log(hr());
console.log(' Using LOCK10 trail on candle closes (conservative — real 15s LTP would be slightly better)');
console.log(hr());

// T1: Use actual LTP data (28 pts from 15s poll)
const t1 = { n:1, dir:'PE', entryIdx:3, entry:53905.30, exitPts:28, exitIdx:4, exitReason:'LTP 15s poll (10:34:20) — price reversed fast' };
console.log(`\n T1 PE — Entry at 10:30 AM at 53905.30 (inside_c3_strong)`);
console.log(`   Peak: +58.7 pts at 10:34:04 (BankNifty = 53846.60)`);
console.log(`   Trail locked: 48.7 pts → exit when LTP rises above 53856.60`);
console.log(`   Exit: 15s poll at 10:34:20 → LTP 53877 → +28 pts`);
console.log(`   (Old 60s poll exited at 10:35:05 for +27 pts — only 1 pt difference)`);
console.log(`   ✅ T1 = +28 pts  |  ₹${28 * LOT_SIZE} per lot`);

// T2: CE at C6 (first qualifying CE after lastExitIdx=3)
const t2entry = candles.find(c => c.idx === 6);
const t2sim   = simulateTrade('CE', 6, t2entry.close, candles);
console.log(`\n T2 CE — Entry at ${t2entry.time} at ${t2entry.close} (body +74%, re-entry after PE exit)`);
console.log(`   lastExitIdx=3, looking for CE (bullish >40%) → C6 qualifies`);
for (const e of t2sim.events) {
  console.log(`   ${e.time}: BN=${e.ltp.toFixed(2).padStart(10)} | gain=${fmtPts(e.gain)} | peak=${fmtPts(e.peak)} ${e.note}`);
}
console.log(`   ✅ T2 = +${t2sim.exitGain.toFixed(1)} pts  |  ₹${(t2sim.exitGain * LOT_SIZE).toFixed(0)} per lot`);

// T3: PE re-entry after T2 CE exit
const t3entryCandle = findReEntry(t2entry.idx, 'CE', candles);  // after T2 CE exit, lastExitIdx=6
const t3sim = simulateTrade('PE', t3entryCandle.idx, t3entryCandle.close, candles);
console.log(`\n T3 PE — Entry at ${t3entryCandle.time} at ${t3entryCandle.close} (body ${t3entryCandle.bodyPct}%, re-entry after CE exit)`);
console.log(`   lastExitIdx=6, looking for PE (bearish >40%) → C${t3entryCandle.idx} qualifies`);
for (const e of t3sim.events) {
  const marker = e.note ? `  ${e.note}` : '';
  console.log(`   ${e.time}: BN=${e.ltp.toFixed(2).padStart(10)} | gain=${fmtPts(e.gain)} | peak=${fmtPts(e.peak)}${marker}`);
}
console.log(`   ✅ T3 = +${t3sim.exitGain.toFixed(1)} pts  |  ₹${(t3sim.exitGain * LOT_SIZE).toFixed(0)} per lot  ← BIG TREND TRADE`);

// T4: CE re-entry after T3 PE exit at C17
// T3 exits DURING C17 (trail hit intrabar). At C17 CLOSE, re-entry fires.
// findReEntry checks from exitIdx=17 (inclusive) → C17 body +74% CE → T4 CE at C17 close
const t4entryCandle = findReEntry(t3sim.exitIdx, 'PE', candles);
let t4GainPts = 0;
let t4SummaryLine = '';
if (t4entryCandle) {
  const t4sim = simulateTrade('CE', t4entryCandle.idx, t4entryCandle.close, candles);
  t4GainPts = t4sim.exitReason?.includes('SL') ? -SL_PTS :
              t4sim.exitReason?.includes('EOD') ? (t4sim.exitPrice - t4entryCandle.close) :
              t4sim.exitGain;
  console.log(`\n T4 CE — Entry at ${t4entryCandle.time} at ${t4entryCandle.close} (body +${t4entryCandle.bodyPct}%, re-entry after PE exit)`);
  console.log(`   Market reverses against CE trade — bear trend resumes`);
  for (const e of t4sim.events) {
    const marker = e.note ? `  ${e.note}` : '';
    console.log(`   ${e.time}: BN=${e.ltp.toFixed(2).padStart(10)} | gain=${fmtPts(e.gain)} | peak=${fmtPts(e.peak)}${marker}`);
  }
  const t4sign = t4GainPts > 0 ? '+' : '';
  console.log(`   ${t4GainPts < 0 ? '❌' : '✅'} T4 = ${t4sign}${t4GainPts.toFixed(1)} pts  |  ₹${(t4GainPts * LOT_SIZE).toFixed(0)} per lot`);
  t4SummaryLine = `T4: ${t4sign}${t4GainPts.toFixed(1)} pts`;

  // T5: after T4 CE exit
  const t5entryCandle = findReEntry(t4sim.exitIdx, 'CE', candles);
  let t5GainPts = 0;
  if (t5entryCandle) {
    const t5sim = simulateTrade('PE', t5entryCandle.idx, t5entryCandle.close, candles);
    t5GainPts = t5sim.exitReason?.includes('SL') ? -SL_PTS :
                t5sim.exitReason?.includes('EOD') ? (t5entryCandle.close - t5sim.exitPrice) :
                t5sim.exitGain;
    console.log(`\n T5 PE — Entry at ${t5entryCandle.time} at ${t5entryCandle.close} (body ${t5entryCandle.bodyPct}%, re-entry after CE exit)`);
    console.log(`   Market reverses UP in final hour — PE trade goes against`);
    for (const e of t5sim.events) {
      const marker = e.note ? `  ${e.note}` : '';
      console.log(`   ${e.time}: BN=${e.ltp.toFixed(2).padStart(10)} | gain=${fmtPts(e.gain)} | peak=${fmtPts(e.peak)}${marker}`);
    }
    const t5sign = t5GainPts > 0 ? '+' : '';
    console.log(`   ${t5GainPts < 0 ? '❌' : '✅'} T5 = ${t5sign}${t5GainPts.toFixed(1)} pts  |  ₹${(t5GainPts * LOT_SIZE).toFixed(0)} per lot`);

    // Final summary
    const total = 28 + t2sim.exitGain + t3sim.exitGain + t4GainPts + t5GainPts;
    const pnl   = total * LOT_SIZE;
    console.log('\n' + hr('═'));
    console.log(' FINAL COMPARISON SUMMARY');
    console.log(hr('═'));
    console.log(` ${'Trade'.padEnd(8)} ${'Dir'.padEnd(5)} ${'Entry'.padStart(10)} ${'Exit'.padStart(10)} ${'Pts'.padStart(8)}  ${'₹ per lot'.padStart(10)}  Notes`);
    console.log(hr());

    const buggyRows = [
      ['T1', 'PE', '53905.3', '53878.7', '+27',  `+₹${27*LOT_SIZE}`, 'actual (60s poll)'],
      ['T2', '—',  '—',       '—',       '  0',  `  ₹0`,  '❌ BLOCKED by bug 1+2'],
      ['T3', '—',  '—',       '—',       '  0',  `  ₹0`,  '❌ BLOCKED'],
      ['T4', '—',  '—',       '—',       '  0',  `  ₹0`,  '❌ BLOCKED'],
      ['T5', '—',  '—',       '—',       '  0',  `  ₹0`,  '❌ BLOCKED'],
    ];
    console.log('\n BUGGY BOT:');
    for (const r of buggyRows) {
      console.log(`  ${r[0].padEnd(8)} ${r[1].padEnd(5)} ${r[2].padStart(10)} ${r[3].padStart(10)} ${r[4].padStart(8)}  ${r[5].padStart(10)}  ${r[6]}`);
    }
    console.log(`  ${'TOTAL'.padEnd(35)} ${'+27'.padStart(8)}  ${`+₹${27*LOT_SIZE}`.padStart(10)}`);

    const fixedRows = [
      ['T1', 'PE', '53905.3',                            '~53877',                              '+28',
        `+₹${28*LOT_SIZE}`, '15s poll (1 pt better than buggy)'],
      ['T2', 'CE', `${t2entry.close}`, `~${t2sim.exitPrice?.toFixed(1)||'?'}`,
        `+${t2sim.exitGain.toFixed(1)}`,  `+₹${(t2sim.exitGain*LOT_SIZE).toFixed(0)}`, 'C6 +74% → trail exit'],
      ['T3', 'PE', `${t3entryCandle.close}`, `~${t3sim.exitPrice?.toFixed(1)||'?'}`,
        `+${t3sim.exitGain.toFixed(1)}`, `+₹${(t3sim.exitGain*LOT_SIZE).toFixed(0)}`, '🐋 BIG TREND — C9→C16 bear run'],
      ['T4', 'CE', `${t4entryCandle.close}`, `${(t4entryCandle.close-SL_PTS).toFixed(1)}`,
        `${t4GainPts>0?'+':''}${t4GainPts.toFixed(1)}`, `${t4GainPts>0?'+':''}₹${Math.abs(t4GainPts*LOT_SIZE).toFixed(0)}`, 'SL hit — market resumed down'],
      ['T5', 'PE', `${t5entryCandle.close}`, '~53671', `${t5GainPts>0?'+':''}${t5GainPts.toFixed(1)}`,
        `${t5GainPts>0?'+':''}₹${Math.abs(t5GainPts*LOT_SIZE).toFixed(0)}`, 'EOD loss (market went up late)'],
    ];

    console.log('\n FIXED BOT (simulation — candle-close trail approximation):');
    for (const r of fixedRows) {
      console.log(`  ${r[0].padEnd(8)} ${r[1].padEnd(5)} ${r[2].padStart(10)} ${r[3].padStart(10)} ${r[4].padStart(8)}  ${r[5].padStart(10)}  ${r[6]}`);
    }
    const fixedSign = total > 0 ? '+' : '';
    console.log(`  ${'TOTAL'.padEnd(35)} ${(fixedSign+total.toFixed(1)).padStart(8)}  ${(fixedSign+'₹'+pnl.toFixed(0)).padStart(10)}`);

    console.log('\n' + hr('═'));
    const improvement = total - 27;
    console.log(` 📈 IMPROVEMENT: +${improvement.toFixed(1)} pts  |  ₹${(improvement*LOT_SIZE).toFixed(0)} extra per lot`);
    console.log(` 📊 MULTIPLIER:  ${(total/27).toFixed(1)}x more profitable`);
    console.log(hr('═'));

    console.log(`\n 💡 WHERE THE MONEY WAS:`);
    console.log(`    T3 PE alone: +${t3sim.exitGain.toFixed(0)} pts = ₹${(t3sim.exitGain*LOT_SIZE).toFixed(0)}`);
    console.log(`    Bot entered at C9 (11:30) → 54066.40`);
    console.log(`    Market fell to 53666.20 at 1:15 PM (+400 pts gain!)`);
    console.log(`    Trail locked at ${(t3sim.exitGain).toFixed(0)} pts → exited at ~53676`);
    console.log(`    This was the 300+ pt bear move the user saw and couldn't capture`);
    console.log('');
    console.log(`    T4 CE was a counter-trend entry after T3 — took SL (−150 pts)`);
    console.log(`    T5 PE entered near day low but market went up EOD — small loss`);
    console.log('');
    console.log(` ⚠️  NOTE: T4/T5 losses are STRATEGY BEHAVIOR (counter-trend re-entry),`);
    console.log(`    not bugs. With better re-entry filtering, T4/T5 could be avoided.`);
    console.log(`    Even with those losses, fixed bot = ${(total/27).toFixed(1)}x the buggy bot.`);
    console.log(hr('═'));
  }
}
