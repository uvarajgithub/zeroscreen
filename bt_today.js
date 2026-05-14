require('dotenv').config({ path: '/home/ubuntu/trading-bot/.env' });
const { KiteConnect } = require('/home/ubuntu/trading-bot/node_modules/kiteconnect');
const { createHybridState, processHybridCandle, trailLock50, trailDefault } = require('/home/ubuntu/trading-bot/dist/src/strategy');

const kc = new KiteConnect({ api_key: process.env.API_KEY });
kc.setAccessToken(process.env.ACCESS_TOKEN);

const QTY = 30, TGT = 40, SL1 = 20;

function parseHour(ist) {
  const m = /(\d+):(\d+)\s*(am|pm)/i.exec(ist);
  if (!m) return 0;
  let h = parseInt(m[1]);
  if (m[3].toLowerCase() === 'pm' && h !== 12) h += 12;
  if (m[3].toLowerCase() === 'am' && h === 12) h = 0;
  return h;
}

async function run() {
  const raw = await kc.getHistoricalData(260105, '15minute', '2026-05-13 09:15:00', '2026-05-13 15:30:00', false);
  if (!raw || raw.length === 0) { console.log('No candles returned. raw:', JSON.stringify(raw)); return; }
  const C = raw.map(c => ({
    open: c.open, high: c.high, low: c.low, close: c.close, date: c.date,
    ist: new Date(c.date).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })
  }));
  console.log('Candles: ' + C.length + '  from ' + C[0].ist + ' to ' + C[C.length-1].ist);

  let lS = createHybridState(), lPnl = 0, lW = 0, lL = 0, lLog = [], lPrev = null;
  let tS = createHybridState(), tPnl = 0, tW = 0, tL = 0, tLog = [], tPrev = null;
  let s1Pnl = 0, s1W = 0, s1L = 0, s1Log = [], s1In = false, s1Dir = null;
  let s1En = 0, s1SL = 0, s1Tgt = 0, s1Ct = 0;

  // TICK_TRAIL: same entries as LOCK50 but exits via peak-25 tick trail (activates at peak>=50)
  // Simulated per candle: assume favorable extreme hit BEFORE adverse extreme within same candle
  let ttS = createHybridState(), ttPnl = 0, ttW = 0, ttL = 0, ttLog = [], ttPrev = null;
  let ttPeak = 0; // live peak for current trade

  // TICK_TRAIL_EOD: same as TICK_TRAIL but after 3:00 PM, ignore trail → hold to EOD close
  let teS = createHybridState(), tePnl = 0, teW = 0, teL = 0, teLog = [], tePrev = null;
  let tePeak = 0;

  // MFE helpers: update peak on each candle while trade is open
  function mfeUpdate(log, high, low) {
    const l = log[log.length-1];
    if (!l || l.pts != null || !l.d) return;
    const fav = l.d === 'CE' ? high - l.en : l.en - low;
    if (l.mfe == null || fav > l.mfe) l.mfe = Math.round(fav);
  }

  // Tick trail check within a candle: returns exit pts if trail fires, else null
  // Assumes favorable move happens BEFORE adverse move within the candle
  function tickTrailCheck(log, peak, curr, eodOverride) {
    const l = log[log.length-1];
    if (!l || l.pts != null || !l.d) return null;
    const favNow = l.d === 'CE' ? curr.high - l.en : l.en - curr.low;
    const newPeak = Math.max(peak, favNow);
    if (newPeak < 50) return { peak: newPeak, exit: null }; // trail not active yet
    const trailSL = newPeak - 25;
    // adverse move within this candle
    const adverse = l.d === 'CE' ? l.en - curr.low : curr.high - l.en;
    if (!eodOverride && adverse >= trailSL) {
      // trail SL hit → exit at trailSL pts
      return { peak: newPeak, exit: trailSL };
    }
    return { peak: newPeak, exit: null };
  }

  for (let i = 1; i < C.length; i++) {
    const prev = C[i-1], curr = C[i];
    const ist = curr.ist;
    const eod = ist.includes('3:15') || ist.includes('3:30');
    const h = parseHour(ist);

    // ── LOCK50 ───────────────────────────────────────────────────────
    if (lPrev) {
      const sig = processHybridCandle(lS, lPrev, curr, eod, trailLock50);
      if (sig.action === 'ENTER' || sig.action === 'REVERSE_ENTER') {
        if (sig.action === 'REVERSE_ENTER') {
          const l = lLog[lLog.length-1];
          if (l && l.pts == null) { l.ex = curr.close; l.pts = -100; l.r = 'sl_reverse'; lPnl -= 100; lL++; }
        }
        lLog.push({ t: ist, d: lS.dir, en: lS.entry || curr.close, ex: null, pts: null, r: null, mfe: null });
        // arm SCALP1 (before 12 PM, max 3)
        if (s1Ct < 3 && !s1In && h < 12) {
          s1In = true; s1Dir = lS.dir; s1En = curr.close;
          s1SL  = s1Dir === 'CE' ? s1En - SL1 : s1En + SL1;
          s1Tgt = s1Dir === 'CE' ? s1En + TGT : s1En - TGT;
          s1Ct++; s1Log.push({ t: ist, d: s1Dir, en: s1En, ex: null, pts: null, r: null, mfe: null });
        }
      }
      if (sig.action === 'EXIT_EARLY' || sig.action === 'EXIT_SL' || sig.action === 'EXIT_EOD') {
        const l = lLog[lLog.length-1];
        if (l && l.pts == null) { l.ex = curr.close; l.pts = Math.round(sig.pts); l.r = sig.action.toLowerCase(); lPnl += sig.pts; if (sig.pts > 0) lW++; else lL++; }
      }
      // update MFE every candle while open
      mfeUpdate(lLog, curr.high, curr.low);
    }
    lPrev = prev;

    // ── TRAIL ─────────────────────────────────────────────────────────
    if (tPrev) {
      const sig = processHybridCandle(tS, tPrev, curr, eod, trailDefault);
      if (sig.action === 'ENTER' || sig.action === 'REVERSE_ENTER') {
        if (sig.action === 'REVERSE_ENTER') {
          const l = tLog[tLog.length-1];
          if (l && l.pts == null) { l.ex = curr.close; l.pts = -100; l.r = 'sl_reverse'; tPnl -= 100; tL++; }
        }
        tLog.push({ t: ist, d: tS.dir, en: tS.entry || curr.close, ex: null, pts: null, r: null, mfe: null });
      }
      if (sig.action === 'EXIT_EARLY' || sig.action === 'EXIT_SL' || sig.action === 'EXIT_EOD') {
        const l = tLog[tLog.length-1];
        if (l && l.pts == null) { l.ex = curr.close; l.pts = Math.round(sig.pts); l.r = sig.action.toLowerCase(); tPnl += sig.pts; if (sig.pts > 0) tW++; else tL++; }
      }
      // update MFE every candle while open
      mfeUpdate(tLog, curr.high, curr.low);
    }
    tPrev = prev;

    // ── TICK_TRAIL (peak-25, activates at +50) ────────────────────────
    if (ttPrev) {
      const sig = processHybridCandle(ttS, ttPrev, curr, eod, trailLock50);
      if (sig.action === 'ENTER' || sig.action === 'REVERSE_ENTER') {
        if (sig.action === 'REVERSE_ENTER') {
          const l = ttLog[ttLog.length-1];
          if (l && l.pts == null) { l.ex = curr.close; l.pts = Math.round(ttPeak >= 50 ? ttPeak - 25 : -100); l.r = 'sl_reverse'; ttPnl += l.pts; if (l.pts > 0) ttW++; else ttL++; }
        }
        ttLog.push({ t: ist, d: ttS.dir, en: ttS.entry || curr.close, ex: null, pts: null, r: null });
        ttPeak = 0;
      }
      // check tick trail FIRST (favorable before adverse within candle)
      const tt = tickTrailCheck(ttLog, ttPeak, curr, false);
      if (tt) {
        ttPeak = tt.peak;
        if (tt.exit != null) {
          const l = ttLog[ttLog.length-1];
          if (l && l.pts == null) { l.ex = null; l.pts = Math.round(tt.exit); l.r = 'tick_trail'; ttPnl += tt.exit; if (tt.exit > 0) ttW++; else ttL++; ttPeak = 0; }
        }
      }
      // if not exited by tick trail, check normal candle exits
      if (ttLog[ttLog.length-1] && ttLog[ttLog.length-1].pts == null) {
        if (sig.action === 'EXIT_EARLY' || sig.action === 'EXIT_SL' || sig.action === 'EXIT_EOD') {
          const l = ttLog[ttLog.length-1];
          if (l && l.pts == null) { l.ex = curr.close; l.pts = Math.round(sig.pts); l.r = sig.action.toLowerCase(); ttPnl += sig.pts; if (sig.pts > 0) ttW++; else ttL++; ttPeak = 0; }
        }
      }
    }
    ttPrev = prev;

    // ── TICK_TRAIL_EOD (tick trail before 3 PM, hold to EOD after) ────
    if (tePrev) {
      const sig = processHybridCandle(teS, tePrev, curr, eod, trailLock50);
      if (sig.action === 'ENTER' || sig.action === 'REVERSE_ENTER') {
        if (sig.action === 'REVERSE_ENTER') {
          const l = teLog[teLog.length-1];
          if (l && l.pts == null) { l.ex = curr.close; l.pts = Math.round(tePeak >= 50 ? tePeak - 25 : -100); l.r = 'sl_reverse'; tePnl += l.pts; if (l.pts > 0) teW++; else teL++; }
        }
        teLog.push({ t: ist, d: teS.dir, en: teS.entry || curr.close, ex: null, pts: null, r: null });
        tePeak = 0;
      }
      const eodOverride = h >= 15; // after 3:00 PM don't use tick trail
      const te = tickTrailCheck(teLog, tePeak, curr, eodOverride);
      if (te) {
        tePeak = te.peak;
        if (te.exit != null) {
          const l = teLog[teLog.length-1];
          if (l && l.pts == null) { l.ex = null; l.pts = Math.round(te.exit); l.r = 'tick_trail'; tePnl += te.exit; if (te.exit > 0) teW++; else teL++; tePeak = 0; }
        }
      }
      if (teLog[teLog.length-1] && teLog[teLog.length-1].pts == null) {
        if (sig.action === 'EXIT_EARLY' || sig.action === 'EXIT_SL' || sig.action === 'EXIT_EOD') {
          const l = teLog[teLog.length-1];
          if (l && l.pts == null) { l.ex = curr.close; l.pts = Math.round(sig.pts); l.r = sig.action.toLowerCase(); tePnl += sig.pts; if (sig.pts > 0) teW++; else teL++; tePeak = 0; }
        }
      }
    }
    tePrev = prev;

    // ── SCALP1 monitor ────────────────────────────────────────────────
    if (s1In && s1Dir) {
      // update SCALP1 MFE
      const fav1 = s1Dir === 'CE' ? curr.high - s1En : s1En - curr.low;
      const ls1 = s1Log[s1Log.length-1];
      if (ls1 && ls1.pts == null && (ls1.mfe == null || fav1 > ls1.mfe)) ls1.mfe = Math.round(fav1);
      const slHit  = s1Dir === 'CE' ? curr.low  <= s1SL  : curr.high >= s1SL;
      const tgtHit = s1Dir === 'CE' ? curr.high >= s1Tgt : curr.low  <= s1Tgt;
      if (slHit || tgtHit || h >= 15) {
        const pts = tgtHit ? TGT : slHit ? -SL1 : Math.round(s1Dir === 'CE' ? curr.close - s1En : s1En - curr.close);
        const l = s1Log[s1Log.length-1];
        if (l && l.pts == null) { l.ex = curr.close; l.pts = pts; l.r = tgtHit ? 'target' : slHit ? 'sl' : 'eod'; s1Pnl += pts; if (pts > 0) s1W++; else s1L++; }
        s1In = false; s1Dir = null;
      }
    }
  }

  const fp = p => (p >= 0 ? '+' : '') + p.toFixed(0) + ' pts';
  const fr = p => (p >= 0 ? '+' : '-') + 'Rs.' + Math.abs(Math.round(p * QTY)).toLocaleString('en-IN');
  const row = t => {
    const pStr = t.pts != null ? ((t.pts >= 0 ? '+' : '') + t.pts + ' pts') : 'open';
    const mStr = t.mfe != null ? '(peak +' + t.mfe + ')' : '';
    return '  ' + String(t.t).padEnd(12) + String(t.d||'').padEnd(4) +
      String((t.en||0).toFixed(1)).padEnd(9) + '-> ' +
      String(t.ex != null ? t.ex.toFixed(1) : 'open').padEnd(9) +
      pStr.padEnd(12) + mStr.padEnd(14) + (t.r||'');
  };
  const rowSimple = t => {
    const pStr = t.pts != null ? ((t.pts >= 0 ? '+' : '') + t.pts + ' pts') : 'open';
    return '  ' + String(t.t).padEnd(12) + String(t.d||'').padEnd(4) +
      String((t.en||0).toFixed(1)).padEnd(9) +
      pStr.padEnd(12) + (t.r||'');
  };

  console.log('\n=== LOCK50 current (' + lLog.length + ' trades) ===');
  lLog.forEach(t => console.log(row(t)));
  console.log('  TOTAL: ' + fp(lPnl) + ' = ' + fr(lPnl) + '  ' + lW + 'W/' + lL + 'L');

  console.log('\n=== TRAIL current (' + tLog.length + ' trades) ===');
  tLog.forEach(t => console.log(row(t)));
  console.log('  TOTAL: ' + fp(tPnl) + ' = ' + fr(tPnl) + '  ' + tW + 'W/' + tL + 'L');

  console.log('\n=== TICK TRAIL peak-25 (activates @+50) (' + ttLog.length + ' trades) ===');
  ttLog.forEach(t => console.log(rowSimple(t)));
  console.log('  TOTAL: ' + fp(ttPnl) + ' = ' + fr(ttPnl) + '  ' + ttW + 'W/' + ttL + 'L');

  console.log('\n=== TICK TRAIL + EOD override (hold after 3PM) (' + teLog.length + ' trades) ===');
  teLog.forEach(t => console.log(rowSimple(t)));
  console.log('  TOTAL: ' + fp(tePnl) + ' = ' + fr(tePnl) + '  ' + teW + 'W/' + teL + 'L');

  console.log('\n' + '═'.repeat(55));
  console.log('COMPARISON (qty ' + QTY + '):');
  console.log('  LOCK50 current       : ' + fp(lPnl).padEnd(14) + fr(lPnl));
  console.log('  TRAIL current        : ' + fp(tPnl).padEnd(14) + fr(tPnl));
  console.log('  Tick trail peak-25   : ' + fp(ttPnl).padEnd(14) + fr(ttPnl));
  console.log('  Tick trail + EOD     : ' + fp(tePnl).padEnd(14) + fr(tePnl));
}

run().catch(e => { console.error('ERR:', e.message); process.exit(1); });
