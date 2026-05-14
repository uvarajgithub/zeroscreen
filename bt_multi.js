require('dotenv').config({ path: '/home/ubuntu/trading-bot/.env' });
const { KiteConnect } = require('/home/ubuntu/trading-bot/node_modules/kiteconnect');
const { createHybridState, processHybridCandle, trailLock50 } = require('/home/ubuntu/trading-bot/dist/src/strategy');

const kc = new KiteConnect({ api_key: process.env.API_KEY });
kc.setAccessToken(process.env.ACCESS_TOKEN);

const QTY = 30;

const DATES = [
  '2026-04-22', '2026-04-23', '2026-04-27', '2026-04-28', '2026-04-29', '2026-04-30',
  '2026-05-01', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08',
  '2026-05-11', '2026-05-12', '2026-05-13'
];

function parseHour(ist) {
  const m = /(\d+):(\d+)\s*(am|pm)/i.exec(ist);
  if (!m) return 0;
  let h = parseInt(m[1]);
  if (m[3].toLowerCase() === 'pm' && h !== 12) h += 12;
  if (m[3].toLowerCase() === 'am' && h === 12) h = 0;
  return h;
}

// Tick trail check: favorable assumed before adverse within same candle
function tickTrailCheck(log, peak, curr) {
  const l = log[log.length - 1];
  if (!l || l.pts != null || !l.d) return null;
  const favNow = l.d === 'CE' ? curr.high - l.en : l.en - curr.low;
  const newPeak = Math.max(peak, favNow);
  if (newPeak < 50) return { peak: newPeak, exit: null };
  const trailSL = newPeak - 25;
  const adverse = l.d === 'CE' ? l.en - curr.low : curr.high - l.en;
  if (adverse >= trailSL) return { peak: newPeak, exit: trailSL };
  return { peak: newPeak, exit: null };
}

async function runDay(dateStr) {
  const from = dateStr + ' 09:15:00';
  const to   = dateStr + ' 15:30:00';
  let raw;
  try {
    raw = await kc.getHistoricalData(260105, '15minute', from, to, false);
  } catch (e) {
    return { date: dateStr, err: e.message };
  }
  if (!raw || raw.length === 0) return { date: dateStr, err: 'no_data' };

  const C = raw.map(c => ({
    open: c.open, high: c.high, low: c.low, close: c.close, date: c.date,
    ist: new Date(c.date).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true
    })
  }));

  // ── LOCK50 ──────────────────────────────────────────────────────────
  let lS = createHybridState(), lPnl = 0, lW = 0, lL = 0, lLog = [], lPrev = null;
  // ── TICK TRAIL ──────────────────────────────────────────────────────
  let ttS = createHybridState(), ttPnl = 0, ttW = 0, ttL = 0, ttLog = [], ttPrev = null;
  let ttPeak = 0;

  for (let i = 1; i < C.length; i++) {
    const prev = C[i - 1], curr = C[i];
    const ist  = curr.ist;
    const eod  = ist.includes('3:15') || ist.includes('3:30');

    // ── LOCK50 ──
    if (lPrev) {
      const sig = processHybridCandle(lS, lPrev, curr, eod, trailLock50);
      if (sig.action === 'ENTER' || sig.action === 'REVERSE_ENTER') {
        if (sig.action === 'REVERSE_ENTER') {
          const l = lLog[lLog.length - 1];
          if (l && l.pts == null) { l.ex = curr.close; l.pts = -100; l.r = 'sl_reverse'; lPnl -= 100; lL++; }
        }
        lLog.push({ t: ist, d: lS.dir, en: lS.entry || curr.close, ex: null, pts: null, r: null });
      }
      if (sig.action === 'EXIT_EARLY' || sig.action === 'EXIT_SL' || sig.action === 'EXIT_EOD') {
        const l = lLog[lLog.length - 1];
        if (l && l.pts == null) { l.ex = curr.close; l.pts = Math.round(sig.pts); l.r = sig.action.toLowerCase(); lPnl += sig.pts; if (sig.pts > 0) lW++; else lL++; }
      }
    }
    lPrev = prev;

    // ── TICK TRAIL ──
    if (ttPrev) {
      const sig = processHybridCandle(ttS, ttPrev, curr, eod, trailLock50);
      if (sig.action === 'ENTER' || sig.action === 'REVERSE_ENTER') {
        if (sig.action === 'REVERSE_ENTER') {
          const l = ttLog[ttLog.length - 1];
          if (l && l.pts == null) {
            l.pts = Math.round(ttPeak >= 50 ? ttPeak - 25 : -100);
            l.ex = curr.close; l.r = 'sl_reverse'; ttPnl += l.pts; if (l.pts > 0) ttW++; else ttL++;
          }
        }
        ttLog.push({ t: ist, d: ttS.dir, en: ttS.entry || curr.close, ex: null, pts: null, r: null });
        ttPeak = 0;
      }
      // tick trail check BEFORE normal exits
      const tt = tickTrailCheck(ttLog, ttPeak, curr);
      if (tt) {
        ttPeak = tt.peak;
        if (tt.exit != null) {
          const l = ttLog[ttLog.length - 1];
          if (l && l.pts == null) { l.pts = Math.round(tt.exit); l.ex = null; l.r = 'tick_trail'; ttPnl += tt.exit; if (tt.exit > 0) ttW++; else ttL++; ttPeak = 0; }
        }
      }
      if (ttLog[ttLog.length - 1] && ttLog[ttLog.length - 1].pts == null) {
        if (sig.action === 'EXIT_EARLY' || sig.action === 'EXIT_SL' || sig.action === 'EXIT_EOD') {
          const l = ttLog[ttLog.length - 1];
          if (l && l.pts == null) { l.ex = curr.close; l.pts = Math.round(sig.pts); l.r = sig.action.toLowerCase(); ttPnl += sig.pts; if (sig.pts > 0) ttW++; else ttL++; ttPeak = 0; }
        }
      }
    }
    ttPrev = prev;
  }

  return {
    date: dateStr, candles: C.length,
    lock: { pnl: Math.round(lPnl), w: lW, l: lL, trades: lLog.length, log: lLog },
    tick: { pnl: Math.round(ttPnl), w: ttW, l: ttL, trades: ttLog.length, log: ttLog }
  };
}

async function run() {
  const results = [];
  for (const d of DATES) {
    process.stdout.write('Fetching ' + d + ' ... ');
    const r = await runDay(d);
    if (r.err) { console.log('ERROR: ' + r.err); }
    else        { console.log('OK  (' + r.candles + ' candles)'); }
    results.push(r);
    await new Promise(res => setTimeout(res, 400)); // rate limit
  }

  // ── TRADE-WISE TABLE PER DATE ──────────────────────────────────────
  for (const r of results) {
    if (r.err) continue;
    console.log('\n' + '─'.repeat(80));
    console.log('DATE: ' + r.date);
    console.log('─'.repeat(80));
    const maxT = Math.max(r.lock.log.length, r.tick.log.length);
    if (maxT === 0) { console.log('  No trades'); continue; }

    // header
    console.log(
      ' #  Time         Dir  Entry     | LOCK50        Reason       | TICK TRAIL    Reason'
    );
    console.log(' ' + '─'.repeat(78));

    // align by trade index (same entry signals so trades correspond 1:1)
    for (let i = 0; i < maxT; i++) {
      const lt = r.lock.log[i];
      const tt = r.tick.log[i];
      const base = lt || tt;
      const tStr  = String(i + 1).padStart(2);
      const time  = String(base.t || '').padEnd(12);
      const dir   = String(base.d || '').padEnd(4);
      const en    = String((base.en || 0).toFixed(1)).padEnd(9);

      const lpts  = lt && lt.pts != null ? (lt.pts >= 0 ? '+' : '') + lt.pts + ' pts' : 'open';
      const tpts  = tt && tt.pts != null ? (tt.pts >= 0 ? '+' : '') + tt.pts + ' pts' : 'open';
      const lr    = lt ? (lt.r || '') : '';
      const tr    = tt ? (tt.r || '') : '';

      console.log(
        ' ' + tStr + '  ' + time + dir + en +
        '| ' + lpts.padEnd(14) + lr.padEnd(13) +
        '| ' + tpts.padEnd(14) + tr
      );
    }

    const ldiff = r.tick.pnl - r.lock.pnl;
    console.log(' ' + '─'.repeat(78));
    console.log(
      '    ' + ' '.repeat(26) +
      '| ' + ((r.lock.pnl >= 0 ? '+' : '') + r.lock.pnl + ' pts').padEnd(14) + (r.lock.w + 'W/' + r.lock.l + 'L').padEnd(13) +
      '| ' + ((r.tick.pnl >= 0 ? '+' : '') + r.tick.pnl + ' pts').padEnd(14) + (r.tick.w + 'W/' + r.tick.l + 'L')
    );
    console.log('    Diff: ' + (ldiff >= 0 ? '+' : '') + ldiff + ' pts   (' + (ldiff >= 0 ? '+' : '-') + 'Rs.' + Math.abs(ldiff * QTY).toLocaleString('en-IN') + ')');
  }

  // ── SUMMARY TABLE ─────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('SUMMARY  (qty ' + QTY + ')');
  console.log('═'.repeat(70));
  console.log(
    ' Date        Candles | LOCK50 pts  Rs           | TICK TRAIL pts  Rs'
  );
  console.log(' ' + '─'.repeat(67));

  let totL = 0, totT = 0;
  for (const r of results) {
    if (r.err) {
      console.log(' ' + r.date + '         | ERROR: ' + r.err);
      continue;
    }
    const lrs = (r.lock.pnl >= 0 ? '+' : '') + r.lock.pnl;
    const trs = (r.tick.pnl >= 0 ? '+' : '') + r.tick.pnl;
    const lmoney = (r.lock.pnl >= 0 ? '+' : '-') + 'Rs.' + Math.abs(r.lock.pnl * QTY).toLocaleString('en-IN');
    const tmoney = (r.tick.pnl >= 0 ? '+' : '-') + 'Rs.' + Math.abs(r.tick.pnl * QTY).toLocaleString('en-IN');
    console.log(
      ' ' + r.date + '  ' + String(r.candles).padEnd(7) +
      '| ' + (lrs + ' pts').padEnd(12) + lmoney.padEnd(14) +
      '| ' + (trs + ' pts').padEnd(16) + tmoney
    );
    totL += r.lock.pnl;
    totT += r.tick.pnl;
  }

  console.log(' ' + '─'.repeat(67));
  const totLmoney = (totL >= 0 ? '+' : '-') + 'Rs.' + Math.abs(totL * QTY).toLocaleString('en-IN');
  const totTmoney = (totT >= 0 ? '+' : '-') + 'Rs.' + Math.abs(totT * QTY).toLocaleString('en-IN');
  console.log(
    ' TOTAL              | ' + ((totL >= 0 ? '+' : '') + totL + ' pts').padEnd(12) + totLmoney.padEnd(14) +
    '| ' + ((totT >= 0 ? '+' : '') + totT + ' pts').padEnd(16) + totTmoney
  );
  console.log('═'.repeat(70));
  const diff = totT - totL;
  console.log(' Tick Trail advantage: ' + (diff >= 0 ? '+' : '') + diff + ' pts = ' + (diff >= 0 ? '+' : '-') + 'Rs.' + Math.abs(diff * QTY).toLocaleString('en-IN'));
}

run().catch(e => { console.error('ERR:', e.message); process.exit(1); });
