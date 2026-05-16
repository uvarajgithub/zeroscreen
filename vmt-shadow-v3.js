'use strict';
/**
 * vmt-shadow.js — VMT Strategy v3
 *
 * SIGNAL SOURCE: BankNifty spot 1-min candle (real Zerodha data via bot-heartbeat.json)
 * TRADE LEVELS:  Expressed in ATM option premiums (Black-Scholes translation)
 *
 * LOGIC:
 *   9:15 AM   → Snapshot: spot open, ATM strike, DTE, opening premiums
 *   9:15–9:20 → Watch BNF spot 1-min candles for first directional candle
 *               CE signal: bullish candle on spot (close > open, body >= MIN_BODY_PTS)
 *               PE signal: bearish candle on spot (open > close, body >= MIN_BODY_PTS)
 *
 *   On signal:
 *     Entry premium = BS(spot_now, ATM, ...)     ← current option price at entry
 *     SL spot level = candle low  (CE) or candle high (PE)
 *     SL premium    = BS(sl_spot, ATM, ...)      ← option price if spot were at that level
 *     1R            = entry_prem − sl_prem       ← risk in premium points, fully dynamic
 *
 *   In trade (ratchet trail — no fixed target):
 *     Profit hits 1R → SL floor moves to breakeven
 *     Profit hits 2R → SL floor moves to +1R
 *     Profit hits NR → SL floor moves to +(N-1)R
 *     Trail SL hit or 11:30 time exit → DONE
 */

const fs   = require('fs');
const path = require('path');

const BASE       = path.join(__dirname);
const HEARTBEAT  = path.join(BASE, 'bot-heartbeat.json');
const STATE_FILE = path.join(BASE, 'vmt-shadow.json');
const TICK_MS    = 15000;    // 15-second ticks
const IV_SETUP   = 18;       // IV% at open (calm pre-market)
const IV_LIVE    = 20;       // IV% during session
const MIN_BODY   = 20;       // minimum BNF spot candle body (pts) to qualify as signal

// ── Black-Scholes ─────────────────────────────────────────────────────────────
function normalCDF(x) {
    const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
    const sign=x<0?-1:1; x=Math.abs(x)/Math.sqrt(2);
    const t=1.0/(1.0+p*x);
    const y=1-(((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t)*Math.exp(-x*x);
    return 0.5*(1.0+sign*y);
}
function bs(S,K,T,sigma,type){
    if(T<=0)return Math.max(type==='CE'?S-K:K-S,0);
    const r=0.065;
    const d1=(Math.log(S/K)+(r+0.5*sigma*sigma)*T)/(sigma*Math.sqrt(T));
    const d2=d1-sigma*Math.sqrt(T);
    return type==='CE'
        ?S*normalCDF(d1)-K*Math.exp(-r*T)*normalCDF(d2)
        :K*Math.exp(-r*T)*normalCDF(-d2)-S*normalCDF(-d1);
}
function optPrem(spot, strike, dte, type, iv) {
    const T = Math.max(dte / 252, 0.001);
    return Math.round(bs(spot, strike, T, iv / 100, type) * 100) / 100;
}

// ── Time helpers ──────────────────────────────────────────────────────────────
function getIST(){ return new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'})); }
function hhmm(d){ return d.getHours()*100+d.getMinutes(); }
function todayStr(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function timeStr(d){ return d.toTimeString().slice(0,8); }
function daysToNextThursday(d){
    const day=d.getDay(); let delta=(4-day+7)%7; if(delta===0)delta=7; return delta;
}
function dteFraction(d){
    const s=new Date(d); s.setHours(9,15,0,0);
    return Math.max((d-s)/3600000,0)/(6.25*252);
}

// ── State ─────────────────────────────────────────────────────────────────────
let state = makeBlank('');
function makeBlank(date){
    return {
        status:   'IDLE',
        date, ts: '',
        // Open snapshot
        spotOpen:    null,
        atmStrike:   null,
        dte:         null,
        // Opening premiums (reference only — shown in UI)
        cePremium:   null,
        pePremium:   null,
        // Signal candle info (shown in pre-market card)
        signalCandle:  null,   // { open, high, low, close, dir }
        // CE setup levels in premium space
        ceEntry: null,   // premium at entry
        ceSL:    null,   // premium if spot were at candle low
        ceRangeHigh: null,  // CE prem at candle high (range context)
        ceRangeLow:  null,  // CE prem at candle low
        // PE setup levels
        peEntry: null,
        peSL:    null,
        peRangeHigh: null,
        peRangeLow:  null,
        // Live prices
        ceNow: null,
        peNow: null,
        // Active trade
        tradeDir:     null,
        tradeEntry:   null,
        tradeSL:      null,   // moves as trail ratchets
        tradeRisk:    null,   // 1R in premium pts — dynamic per day
        trailLevel:   0,
        liveOptPrice: null,
        livePnlPts:   null,
        livePnl:      null,   // ₹ (lot 15)
        // Result
        exitReason: null,
        finalPnl:   null,
        log: []
    };
}

let seenCandleTime = '';   // track last processed candle so we don't double-signal

function readHB(){
    try{
        if(!fs.existsSync(HEARTBEAT))return null;
        return JSON.parse(fs.readFileSync(HEARTBEAT,'utf8'));
    }catch{ return null; }
}
function save(){
    state.ts=timeStr(getIST());
    try{ fs.writeFileSync(STATE_FILE,JSON.stringify(state,null,2)); }catch{}
}
function log(msg){
    const e=`[${timeStr(getIST())}] ${msg}`;
    console.log('[VMT-Shadow]',e);
    state.log=[...(state.log||[]).slice(-49),e];
}

// ── Main tick ─────────────────────────────────────────────────────────────────
function tick(){
    const now=getIST(), t=hhmm(now), today=todayStr(now);

    // New day reset
    if(state.date!==today){
        state=makeBlank(today); state.status='WAITING';
        seenCandleTime='';
        log('New day — waiting for 9:15 open'); save();
    }

    if(t<915||t>=1530){ save(); return; }
    if(state.status==='DONE') return;

    const hb=readHB();
    const spot=hb&&hb.price?parseFloat(hb.price):null;
    if(!spot){ save(); return; }

    // ── STEP 1: Capture open at first 9:15 tick ───────────────────────────────
    if(!state.spotOpen){
        const atm = Math.round(spot/100)*100;
        const dte = daysToNextThursday(now);
        state.spotOpen  = spot;
        state.atmStrike = atm;
        state.dte       = dte;
        state.cePremium = optPrem(spot,atm,dte,'CE',IV_SETUP);
        state.pePremium = optPrem(spot,atm,dte,'PE',IV_SETUP);
        state.status    = 'SCANNING';
        log(`OPEN  spot=${spot}  ATM=${atm}  DTE=${dte}d  CE_open=${state.cePremium}  PE_open=${state.pePremium}`);
        save(); return;
    }

    const dteLive = Math.max(state.dte - dteFraction(now), 0.05);

    // Update live premiums always
    state.ceNow = optPrem(spot, state.atmStrike, dteLive, 'CE', IV_LIVE);
    state.peNow = optPrem(spot, state.atmStrike, dteLive, 'PE', IV_LIVE);

    // ── STEP 2: SCANNING — watch for signal candle in 9:15–9:19 ──────────────
    if(state.status==='SCANNING'){

        // No entry window after 9:20
        if(t>=920){
            state.status='DONE'; state.exitReason='NO_TRADE'; state.finalPnl=0;
            log('No directional spot candle by 9:20 — flat for the day');
            save(); return;
        }

        // Get last completed BNF spot candle from heartbeat
        const c = hb.lastCandle;
        if(!c||!c.time||c.time===seenCandleTime){ save(); return; }

        const body = c.close - c.open;  // positive = bullish, negative = bearish
        const absbody = Math.abs(body);
        if(absbody < MIN_BODY){ save(); return; }  // too small — indecisive, skip

        seenCandleTime = c.time;  // mark as processed

        const dir = body > 0 ? 'CE' : 'PE';

        // Translate spot candle levels into ATM premium space
        // CE: spot candle high → premium high, spot candle low → premium SL
        // PE: spot candle low  → premium low,  spot candle high → premium SL
        const pAtHigh  = optPrem(c.high,  state.atmStrike, dteLive, dir, IV_LIVE);
        const pAtLow   = optPrem(c.low,   state.atmStrike, dteLive, dir, IV_LIVE);
        const pAtClose = optPrem(c.close, state.atmStrike, dteLive, dir, IV_LIVE);

        if(dir==='CE'){
            state.ceEntry     = Math.round(pAtClose * 100) / 100;  // entry at candle close translated
            state.ceSL        = Math.round(pAtLow   * 100) / 100;  // SL = premium if spot at candle low
            state.ceRangeHigh = Math.round(pAtHigh  * 100) / 100;
            state.ceRangeLow  = Math.round(pAtLow   * 100) / 100;
        } else {
            state.peEntry     = Math.round(pAtClose * 100) / 100;
            state.peSL        = Math.round(pAtHigh  * 100) / 100;  // SL = premium if spot at candle high
            state.peRangeHigh = Math.round(pAtHigh  * 100) / 100;
            state.peRangeLow  = Math.round(pAtLow   * 100) / 100;
        }

        state.signalCandle = { open:c.open, high:c.high, low:c.low, close:c.close, dir };

        const entryPrem = dir==='CE' ? state.ceEntry : state.peEntry;
        const slPrem    = dir==='CE' ? state.ceSL    : state.peSL;
        const risk      = Math.round(Math.abs(entryPrem - slPrem) * 100) / 100;

        log(`${dir} SIGNAL  spot candle=[${c.open}→${c.close}  L:${c.low} H:${c.high}]  body=${body.toFixed(0)}pts`);
        log(`  Premium entry=${entryPrem}  SL=${slPrem}  1R=${risk} prem-pts`);

        if(risk <= 0){
            log('Risk=0 — candle too small in premium space, skipping');
            save(); return;
        }

        state.tradeDir    = dir;
        state.tradeEntry  = entryPrem;
        state.tradeSL     = slPrem;
        state.tradeRisk   = risk;
        state.trailLevel  = 0;
        state.liveOptPrice = entryPrem;
        state.livePnlPts  = 0;
        state.livePnl     = 0;
        state.status      = 'IN_TRADE';
        save(); return;
    }

    // ── STEP 3: IN_TRADE — ratchet trail, no fixed target ────────────────────
    if(state.status==='IN_TRADE'){
        const optNow = optPrem(spot, state.atmStrike, dteLive, state.tradeDir, IV_LIVE);
        state.liveOptPrice = optNow;
        const pnlPts = Math.round((optNow - state.tradeEntry) * 100) / 100;
        state.livePnlPts = pnlPts;
        state.livePnl    = Math.round(pnlPts * 15 * 100) / 100;  // ₹ lot size 15

        const R = state.tradeRisk;

        // Ratchet: at every new full-R milestone, lock in previous R as floor
        const level = Math.floor(pnlPts / R);
        if(level > state.trailLevel && level >= 1){
            const newFloor = Math.round((state.tradeEntry + (level-1)*R) * 100) / 100;
            if(newFloor > state.tradeSL){
                state.tradeSL   = newFloor;
                state.trailLevel = level;
                log(`TRAIL  pnl=${pnlPts.toFixed(1)}pts = ${level}R  SL locked → ${newFloor} (${(level-1)}R protected)`);
            }
        }

        // SL hit (original candle-low SL or ratcheted floor)
        if(optNow <= state.tradeSL){
            state.finalPnl   = Math.round((state.tradeSL - state.tradeEntry) * 100) / 100;
            state.exitReason = state.trailLevel > 0 ? 'TRAIL_SL' : 'SL';
            state.status     = 'DONE';
            const rs = Math.round(state.finalPnl * 15);
            log(`${state.exitReason}  opt=${optNow}  exit at ${state.tradeSL}  P&L=${state.finalPnl}pts  ₹${rs}`);
        }
        // Time exit 11:30
        else if(t >= 1130){
            state.finalPnl   = pnlPts;
            state.exitReason = 'TIME_EXIT';
            state.status     = 'DONE';
            log(`TIME EXIT 11:30  opt=${optNow}  P&L=${pnlPts}pts  ₹${Math.round(pnlPts*15)}`);
        }
        save();
    }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
console.log('[VMT-Shadow] v3 — BNF spot candle signal → ATM premium levels → ratchet trail');
save();
tick();
setInterval(tick, TICK_MS);
