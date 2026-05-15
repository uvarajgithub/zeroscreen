/**
 * today_sim.js — Simulate Tick Trail + Amina for TODAY's candles
 * Fetches live 15-min BANKNIFTY candles and runs both strategies
 * Rs/pt = 15 (30 qty × 0.5 delta)
 */
'use strict';
require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT    = 15;

// ── Kite fetch ────────────────────────────────────────────────────────────────
function kiteGet(path) {
  return new Promise((res, rej) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` },
      timeout: 20000
    }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch(e) { rej(e); } });
    });
    req.on('error', rej); req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
    req.end();
  });
}

async function fetchToday() {
  const now = new Date();
  const ist = new Date(now.getTime() + (5*60+30)*60*1000);
  const d   = ist.toISOString().slice(0, 10);
  const url = `/instruments/historical/260105/15minute?from=${d}+09:00:00&to=${d}+15:30:00&continuous=0&oi=0`;
  const r   = await kiteGet(url);
  if (!r || !r.data || !r.data.candles) throw new Error('No candle data: ' + JSON.stringify(r));
  return r.data.candles.map(c => {
    const dt  = new Date(c[0]);
    const ist = new Date(dt.getTime() + (5*60+30)*60*1000);
    const h   = ist.getUTCHours(), m = ist.getUTCMinutes();
    const tm  = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    return { time: tm, h, m, open: c[1], high: c[2], low: c[3], close: c[4],
             bull: c[4] >= c[1],
             bodyH: Math.max(c[1], c[4]), bodyL: Math.min(c[1], c[4]),
             bodySize: Math.abs(c[4]-c[1]) };
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const p = (n, w=7) => String(Math.round(n)).padStart(w);
const pf = (n, w=7) => (n >= 0 ? '+' : '') + String(Math.round(n)).padStart(w-1);

// ══ STRATEGY 1: TICK TRAIL (Hybrid Reverse) ══════════════════════════════════
// Body breakout +25 pt buffer | SL ±100 | C1 -3 early exit
// Trail activates at peak ≥ 100pts → SL locks at entry+(peak-50)
// Re-entry: hybrid reverse (if SL body candle closes past SL → enter opposite)
function runTickTrail(candles) {
  const SL=100, BUF=25, C1_PTS=3;
  let inTrade=false, dir=null, entry=0, sl=0, peak=0;
  let pnl=0, trades=[];

  function trailSL(e, d, pk) {
    if (pk < 50) return d === 'CE' ? e - SL : e + SL;          // initial SL
    return d === 'CE' ? Math.max(e - SL, e + (pk - 50))        // lock BE @ pk=50, trail beyond
                      : Math.min(e + SL, e - (pk - 50));
  }

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i-1];
    const c    = candles[i];
    const eod  = c.h >= 15 && c.m >= 14;

    if (inTrade) {
      const fav = dir === 'CE' ? c.high - entry : entry - c.low;
      if (fav > peak) peak = fav;

      const curSL = trailSL(entry, dir, peak);
      const pnlNow = dir === 'CE' ? c.close - entry : entry - c.close;

      // EOD exit
      if (eod) {
        pnl += pnlNow;
        trades.push({ time: c.time, dir, entry, exit: c.close, pts: Math.round(pnlNow), reason: 'EOD' });
        inTrade = false; firstDone = true; waitRev = false; break;
      }

      // SL check (simulated: assume worst extreme is last)
      const slHit = dir === 'CE' ? c.low <= curSL : c.high >= curSL;
      if (slHit) {
        const exitPx = curSL;
        const pts    = dir === 'CE' ? exitPx - entry : entry - exitPx;
        pnl += pts;
        trades.push({ time: c.time, dir, entry, exit: exitPx, pts: Math.round(pts),
          reason: peak >= 100 ? 'TRAIL_SL' : peak >= 50 ? 'LOCK_SL(BE)' : 'SL' });
        inTrade = false;
        continue;
      }

      // C1 early exit: candle closes C1_PTS against
      const c1loss = dir === 'CE' ? entry - c.close : c.close - entry;
      if (c1loss >= C1_PTS && !eod) {
        pnl += pnlNow;
        trades.push({ time: c.time, dir, entry, exit: c.close, pts: Math.round(pnlNow), reason: `C1(-${C1_PTS})` });
        inTrade = false;
        continue;
      }
    }

    if (!inTrade) {
      const bH = prev.bodyH, bL = prev.bodyL;
      if (c.close > bH + BUF) {
        inTrade = true; dir = 'CE'; entry = c.close;
        sl = entry - SL; peak = 0;
        trades.push({ time: c.time, dir: 'CE', entry: c.close, exit: null, pts: null, reason: 'ENTRY' });
      } else if (c.close < bL - BUF) {
        inTrade = true; dir = 'PE'; entry = c.close;
        sl = entry + SL; peak = 0;
        trades.push({ time: c.time, dir: 'PE', entry: c.close, exit: null, pts: null, reason: 'ENTRY' });
      }
    }
  }

  return { pnl, trades };
}

// ══ STRATEGY 2: AMINA ════════════════════════════════════════════════════════
// Rolling C1+C2 scan | T1 SL 50 | Re-entry opposite 100 SL | No target
function runAmina(candles) {
  const SL_T1 = 50, SL_RE = 100;
  const dayOpen = candles[0].open;
  let phase = 'SCANNING';
  let t1Dir=null, t1Entry=0, t1Pts=0;
  let reDir=null, reEntry=0;
  let slClose=0;
  let dayPts=0;
  let trades=[];

  // Rolling entry scan on candles[0..n-1], return first valid signal where entryIdx === n-1
  function scan(cs) {
    const n = cs.length;
    for (let i = 0; i < n - 1; i++) {
      const ca = cs[i], cb = cs[i+1];
      let sig=null, bl=null, rule=null;
      if (ca.bull === cb.bull) {
        sig = ca.bull ? 'CE' : 'PE';
        bl  = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
        rule = 'A';
      } else if (cb.bodySize > ca.bodySize) {
        sig = cb.bull ? 'CE' : 'PE';
        bl  = sig === 'CE' ? Math.max(ca.bodyH, cb.bodyH) : Math.min(ca.bodyL, cb.bodyL);
        rule = 'B';
      } else continue;

      // Check each candle from i+2 onward for breakout
      for (let j = i+2; j < n; j++) {
        const cx = cs[j];
        if (cx.h >= 15 && cx.m >= 15) break;
        const breaks = sig === 'CE' ? cx.close > bl : cx.close < bl;
        if (breaks) {
          if (j === n - 1) return { sig, px: cx.close, bl, rule, pairIdx: i, entryIdx: j };
          break; // breakout happened on a past candle, skip this pair
        }
      }
    }
    return null;
  }

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const eod = (c.h === 15 && c.m >= 14) || c.h > 15;

    if (phase === 'SCANNING') {
      if (eod) break;
      const res = scan(candles.slice(0, i + 1));
      if (res) {
        t1Dir = res.sig; t1Entry = res.px; t1Pts = 0;
        phase = 'IN_T1';
        trades.push({ time: c.time, dir: t1Dir, entry: t1Entry, exit: null, pts: null,
                      reason: `T1_ENTRY R${res.rule} BL=${Math.round(res.bl)}` });
      }
      continue;
    }

    if (phase === 'IN_T1') {
      t1Pts = t1Dir === 'CE' ? c.close - t1Entry : t1Entry - c.close;

      if (eod) {
        dayPts = t1Pts;
        trades.push({ time: c.time, dir: t1Dir, entry: t1Entry, exit: c.close, pts: Math.round(t1Pts), reason: 'T1_EOD' });
        break;
      }

      if (t1Pts <= -SL_T1) {
        slClose = c.close;
        trades.push({ time: c.time, dir: t1Dir, entry: t1Entry, exit: slClose, pts: -SL_T1, reason: 'T1_SL' });

        // Re-entry filter
        reDir = t1Dir === 'CE' ? 'PE' : 'CE';
        const moveFromOpen  = slClose - dayOpen;
        const moveAgainstRe = reDir === 'CE' ? moveFromOpen : -moveFromOpen;

        if (moveAgainstRe >= 0) {
          dayPts = -SL_T1;
          phase = 'DONE';
          trades.push({ time: c.time, dir: '-', entry: '-', exit: '-', pts: null, reason: `RE_SKIP (move ${Math.round(moveAgainstRe)>=0?'+':''}${Math.round(moveAgainstRe)} vs open)` });
        } else {
          reEntry = slClose;
          phase = 'IN_RE';
          const reSL = reDir === 'CE' ? reEntry - SL_RE : reEntry + SL_RE;
          trades.push({ time: c.time, dir: reDir, entry: reEntry, exit: null, pts: null,
                        reason: `RE_ENTRY SL=${Math.round(reSL)} filter:${Math.round(moveAgainstRe)}` });
        }
        continue;
      }
    }

    if (phase === 'IN_RE') {
      const rePts = reDir === 'CE' ? c.close - reEntry : reEntry - c.close;

      if (eod) {
        dayPts = -SL_T1 + rePts;
        trades.push({ time: c.time, dir: reDir, entry: reEntry, exit: c.close, pts: Math.round(rePts), reason: 'RE_EOD' });
        break;
      }

      if (rePts <= -SL_RE) {
        dayPts = -SL_T1 + (-SL_RE);
        trades.push({ time: c.time, dir: reDir, entry: reEntry, exit: c.close, pts: -SL_RE, reason: 'RE_SL' });
        phase = 'DONE';
        continue;
      }
    }
  }

  if (phase === 'SCANNING') dayPts = 0;

  return { pnl: dayPts, trades };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n' + '═'.repeat(72));
  console.log(' TODAY\'S SIMULATION — BANKNIFTY 15-min');

  let candles;
  try {
    candles = await fetchToday();
  } catch(e) {
    console.log('ERROR fetching candles:', e.message);
    process.exit(1);
  }

  if (!candles || candles.length < 2) {
    console.log('Not enough candles yet. Come back after 9:30 AM IST.');
    process.exit(0);
  }

  const dayOpen = candles[0].open;
  const latest  = candles[candles.length - 1];
  const now     = new Date(new Date().getTime() + (5*60+30)*60*1000);
  const istTime = `${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}`;

  console.log(` Date: ${new Date().toISOString().slice(0,10)}  |  IST: ${istTime}  |  Candles: ${candles.length}`);
  console.log(` Day Open: ${Math.round(dayOpen)}  |  Last Close: ${Math.round(latest.close)}  |  Net so far: ${Math.round(latest.close - dayOpen) >= 0 ? '+' : ''}${Math.round(latest.close - dayOpen)} pts`);
  console.log('═'.repeat(72));

  // Print candle table
  console.log('\n CANDLES');
  console.log(' Time   Open    High    Low    Close   Move   Bull/Bear');
  console.log(' ' + '─'.repeat(60));
  for (const c of candles) {
    const mv = Math.round(c.close - c.open);
    console.log(` ${c.time}  ${p(c.open,6)}  ${p(c.high,6)}  ${p(c.low,6)}  ${p(c.close,6)}  ${(mv>=0?'+':'')+mv}  ${c.bull ? '▲ Bull' : '▼ Bear'}`);
  }

  // Run strategies
  const tt = runTickTrail(candles);
  const am = runAmina(candles);

  // Market is closed when we have the 15:15 candle (last candle of the day)
  const isLive = !candles.some(c => c.h === 15 && c.m >= 15);

  // A trade is "open" only if last meaningful trade row has no exit AND market still running
  function isOpen(trades, entryKeyword) {
    if (!isLive) return false;
    const last = [...trades].reverse().find(t => t.reason && t.reason.includes(entryKeyword));
    return last && (last.exit == null || last.exit === '-');
  }

  // ── Pair raw trade events → completed trade blocks ────────────────────────
  function pairTrades(rawTrades) {
    const out = []; let cur = null;
    for (const t of rawTrades) {
      const isEntry = t.reason && /ENTRY|HYB_REV/.test(t.reason);
      const isSkip  = t.reason && t.reason.includes('SKIP');
      const isExit  = t.exit != null && t.exit !== '-';
      if (isEntry) {
        cur = { dir: t.dir, entryTime: t.time, entryPx: t.entry, note: null };
      } else if (isExit && cur) {
        out.push({ ...cur, exitTime: t.time, exitPx: t.exit, pts: t.pts, how: t.reason });
        cur = null;
      } else if (isSkip && cur === null) {
        // attach skip note to last trade
        if (out.length) out[out.length-1].note = t.reason;
      }
    }
    if (cur) out.push({ ...cur, exitTime: null, exitPx: null, pts: null, how: isLive ? 'OPEN' : 'EOD_HOLD' });
    return out;
  }

  function printStrategy(label, desc, result) {
    const trades = pairTrades(result.trades);
    const hasOpen = isLive && trades.some(t => t.how === 'OPEN');
    const W = 52;
    console.log('\n┌' + '─'.repeat(W) + '┐');
    console.log(`│  ${label.padEnd(W-1)}│`);
    console.log(`│  ${desc.padEnd(W-1)}│`);
    console.log('├' + '─'.repeat(W) + '┤');
    console.log(`│  Total trades : ${trades.length}${' '.repeat(W - 19 - String(trades.length).length)}│`);
    console.log('├' + '─'.repeat(W) + '┤');

    if (trades.length === 0) {
      console.log(`│  No entry signal today.${''.padEnd(W-24)}│`);
    }

    for (let i = 0; i < trades.length; i++) {
      const t   = trades[i];
      const num = `Trade #${i+1}`;
      const dir = t.dir === 'CE' ? 'CE  (buy call)' : t.dir === 'PE' ? 'PE  (buy put) ' : String(t.dir).padEnd(14);
      console.log(`│                                                    │`);
      console.log(`│  ${num} — ${dir}${''.padEnd(W - 9 - 14 - String(i+1).length)}│`);
      console.log(`│    Entry  : ${t.entryTime}  @  ${String(Math.round(t.entryPx)).padEnd(6)}${''.padEnd(W-33)}│`);
      if (t.exitPx != null) {
        console.log(`│    Exit   : ${t.exitTime}  @  ${String(Math.round(t.exitPx)).padEnd(6)}${''.padEnd(W-33)}│`);
        const sign = t.pts >= 0 ? '+' : '';
        const ptsStr  = `${sign}${t.pts} pts`;
        const rsStr   = `Rs ${sign}${t.pts * RS_PER_PT}`;
        const how     = t.how;
        console.log(`│    P&L    : ${ptsStr.padEnd(10)}  ${rsStr.padEnd(12)}  [${how}]${''.padEnd(Math.max(0,W - 13 - 10 - 12 - how.length - 5))}│`);
      } else {
        const tag = isLive ? 'still running...' : 'EOD hold';
        console.log(`│    Exit   : ${tag}${''.padEnd(W-13-tag.length)}│`);
        console.log(`│    P&L    : open${''.padEnd(W-16)}│`);
      }
      if (t.note) {
        console.log(`│    Note   : ${t.note.slice(0,W-14)}${''.padEnd(Math.max(0,W-14-Math.min(t.note.length,W-14)))}│`);
      }
    }

    console.log(`│                                                    │`);
    console.log('├' + '─'.repeat(W) + '┤');
    const totalPts = Math.round(result.pnl);
    const totalRs  = totalPts * RS_PER_PT;
    const sign     = totalPts >= 0 ? '+' : '';
    const status   = hasOpen ? '(open)' : '✓ FINAL';
    const summary  = `DAY P&L : ${sign}${totalPts} pts  =  Rs ${sign}${totalRs}  ${status}`;
    console.log(`│  ${summary.padEnd(W-1)}│`);
    console.log('└' + '─'.repeat(W) + '┘');
  }

  printStrategy('STRATEGY 1 — TICK TRAIL (UNLIMITED)', 'SL 100 | Body+25 buf | Trail+Lock @ peak≥50 | Re-entry after every exit', tt);
  printStrategy('STRATEGY 2 — AMINA',      'T1 SL 50 | Re-entry opposite | SL 100',       am);

  // ── Final comparison ──────────────────────────────────────────────────────
  const ttList = pairTrades(tt.trades);
  const amList = pairTrades(am.trades);
  const diff   = am.pnl - tt.pnl;
  const winner = diff > 0 ? '🟢 AMINA' : diff < 0 ? '🔴 TICK TRAIL' : '🟡 TIED';
  const W2 = 52;
  console.log('\n┌' + '─'.repeat(W2) + '┐');
  const hdr = `EXPECTED RESULT — ${new Date().toISOString().slice(0,10)}`;
  console.log(`│  ${hdr.padEnd(W2-1)}│`);
  console.log(`│  ${(isLive ? 'INTRADAY (not final)' : 'FULL DAY FINAL').padEnd(W2-1)}│`);
  console.log('├' + '─'.repeat(W2) + '┤');

  // Per-strategy summary rows
  for (const [name, list, pnl] of [['Tick Trail', ttList, tt.pnl], ['Amina     ', amList, am.pnl]]) {
    const s  = pnl >= 0 ? '+' : '';
    const ln = `${name}  |  ${list.length} trade(s)  |  ${s}${Math.round(pnl)} pts  =  Rs ${s}${Math.round(pnl * RS_PER_PT)}`;
    console.log(`│  ${ln.padEnd(W2-1)}│`);
    // print each trade inline
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const sp = pnl >= 0 ? '+' : '';
      let row;
      if (t.exitPx != null) {
        const ps = t.pts >= 0 ? '+' : '';
        row = `  Trade ${i+1}: ${t.dir}  ${t.entryTime}@${Math.round(t.entryPx)} → ${t.exitTime}@${Math.round(t.exitPx)}  ${ps}${t.pts}pts  Rs${ps}${t.pts*RS_PER_PT}  [${t.how}]`;
      } else {
        row = `  Trade ${i+1}: ${t.dir}  ${t.entryTime}@${Math.round(t.entryPx)} → OPEN`;
      }
      console.log(`│  ${row.padEnd(W2-1)}│`);
    }
    if (list.length === 0) console.log(`│    (no entry signal)${''.padEnd(W2-22)}│`);
  }

  console.log('├' + '─'.repeat(W2) + '┤');
  const wRow = `Winner : ${winner} better by +${Math.abs(Math.round(diff))} pts  (Rs ${Math.abs(Math.round(diff * RS_PER_PT))})`;
  console.log(`│  ${wRow.padEnd(W2-1)}│`);
  console.log('└' + '─'.repeat(W2) + '┘\n');

})();
