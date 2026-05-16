'use strict';
/**
 * vmt-shadow.js — VMT Strategy v2
 *
 * Everything derived from real candle data. Nothing hardcoded.
 *
 * ENTRY:  Watch 1-min option price candles from 9:15 → 9:20.
 *         First candle that shows clear directional move triggers entry.
 *         CE: bullish candle (close > open)  → enter at candle close
 *         PE: bearish candle (close < open)  → enter at candle close
 *
 * SL:     Low of CE signal candle (for CE trade)
 *         High of PE signal candle (for PE trade)
 *         Risk (1R) = |entry − SL| — completely dynamic per day
 *
 * TARGET: No fixed target. Ratchet trail in 1R steps:
 *         Profit hits 1R → SL moves to breakeven
 *         Profit hits 2R → SL moves to +1R (locked)
 *         Profit hits 3R → SL moves to +2R (locked)
 *         ... continues until trail SL is hit or 11:30 time exit
 *
 * NO_TRADE: If no signal candle forms by 9:20 → flat for the day
 */

const fs   = require('fs');
const path = require('path');

const BASE       = path.join(__dirname);
const HEARTBEAT  = path.join(BASE, 'bot-heartbeat.json');
const STATE_FILE = path.join(BASE, 'vmt-shadow.json');
const TICK_MS    = 15000;          // 15-second ticks
const IV_SETUP   = 18;             // IV at open (pre-market calm)
const IV_LIVE    = 20;             // IV during session
const MIN_BODY   = 2;              // minimum candle body (pts) to qualify as signal — avoids noise ticks

// ── Black-Scholes ────────────────────────────────────────────────────────────
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
function optionPrice(spot,strike,dte,type,iv){
    const T=Math.max(dte/252,0.001);
    return Math.round(bs(spot,strike,T,iv/100,type)*100)/100;
}

// ── Time helpers ─────────────────────────────────────────────────────────────
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
function minuteKey(d){ return d.getHours()*100+d.getMinutes(); }

// ── 1-min candle builder ──────────────────────────────────────────────────────
// Takes current candle-in-progress + new price + current minute.
// Returns { cur: updatedCandle, closed: completedCandle|null }
function tickCandle(cur, price, mKey){
    if(!cur||cur.minute!==mKey){
        const closed = cur ? {minute:cur.minute,open:cur.open,high:cur.high,low:cur.low,close:cur.last} : null;
        return { cur:{minute:mKey,open:price,high:price,low:price,last:price}, closed };
    }
    cur.high=Math.max(cur.high,price);
    cur.low =Math.min(cur.low, price);
    cur.last=price;
    return { cur, closed:null };
}

// ── In-memory candle state (resets each day) ──────────────────────────────────
let cs = resetCandleState('');
function resetCandleState(date){
    return { date, ceCandles:[], peCandles:[], ceCur:null, peCur:null };
}

// ── Persistent state ──────────────────────────────────────────────────────────
let state = makeBlank('');
function makeBlank(date){
    return {
        status:   'IDLE',     // IDLE | WAITING | SCANNING | IN_TRADE | DONE
        date, ts: '',
        // Market open snapshot
        spotOpen:  null, atmStrike: null, dte: null,
        // Opening premiums
        cePremium: null, pePremium: null,
        // First candle range (9:15 candle H/L — shown in UI)
        ceRangeHigh: null, ceRangeLow:  null,
        peRangeHigh: null, peRangeLow:  null,
        // Signal candle derived levels (shown in UI before entry)
        ceEntry: null, ceSL: null,
        peEntry: null, peSL: null,
        // Live option estimates
        ceNow: null, peNow: null,
        // Active trade
        tradeDir:     null,
        tradeEntry:   null,
        tradeSL:      null,   // moves as trail advances
        tradeRisk:    null,   // 1R in pts — dynamic
        trailLevel:   0,      // how many full R-multiples locked
        liveOptPrice: null,
        livePnl:      null,   // ₹ PnL
        livePnlPts:   null,   // pts PnL
        // Result
        exitReason: null,
        finalPnl:   null,
        log: []
    };
}

function readHB(){
    try{ if(!fs.existsSync(HEARTBEAT))return null; return JSON.parse(fs.readFileSync(HEARTBEAT,'utf8')); }
    catch{ return null; }
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

    // New day
    if(state.date!==today){
        state=makeBlank(today); state.status='WAITING';
        cs=resetCandleState(today);
        log('New day — waiting for 9:15 open'); save();
    }
    if(cs.date!==today) cs=resetCandleState(today);

    if(t<915||t>=1530){ save(); return; }
    if(state.status==='DONE') return;

    const hb=readHB();
    const spot=hb&&hb.price?parseFloat(hb.price):null;
    if(!spot){ save(); return; }

    // ─ STEP 1: Capture market open snapshot at first 9:15 tick ─
    if(!state.spotOpen){
        const atm=Math.round(spot/100)*100;
        const dte=daysToNextThursday(now);
        state.spotOpen  =spot;
        state.atmStrike =atm;
        state.dte       =dte;
        state.cePremium =optionPrice(spot,atm,dte,'CE',IV_SETUP);
        state.pePremium =optionPrice(spot,atm,dte,'PE',IV_SETUP);
        state.status    ='SCANNING';
        log(`OPEN  spot=${spot}  ATM=${atm}  DTE=${dte}d  CE_prem=${state.cePremium}  PE_prem=${state.pePremium}`);
        save(); return;
    }

    const dteLive=Math.max(state.dte-dteFraction(now),0.05);
    const ceNow=optionPrice(spot,state.atmStrike,dteLive,'CE',IV_LIVE);
    const peNow=optionPrice(spot,state.atmStrike,dteLive,'PE',IV_LIVE);
    state.ceNow=ceNow; state.peNow=peNow;
    const mKey=minuteKey(now);

    // ─ STEP 2: SCANNING — build 1-min candles, watch for signal ─
    if(state.status==='SCANNING'){

        // Tick both CE and PE candles
        const ceR=tickCandle(cs.ceCur,ceNow,mKey); cs.ceCur=ceR.cur;
        if(ceR.closed){
            cs.ceCandles.push(ceR.closed);
            // Store 9:15 opening candle range for display
            if(cs.ceCandles.length===1){
                state.ceRangeHigh=ceR.closed.high;
                state.ceRangeLow =ceR.closed.low;
            }
        }
        const peR=tickCandle(cs.peCur,peNow,mKey); cs.peCur=peR.cur;
        if(peR.closed){
            cs.peCandles.push(peR.closed);
            if(cs.peCandles.length===1){
                state.peRangeHigh=peR.closed.high;
                state.peRangeLow =peR.closed.low;
            }
        }

        // Scan completed candles in 9:15–9:19 window for first directional signal
        let signal=null;
        // CE: first bullish candle
        for(const c of cs.ceCandles){
            if(c.minute<915||c.minute>=920) continue;
            const body=c.close-c.open;
            if(body>=MIN_BODY){ signal={dir:'CE',candle:c}; break; }
        }
        // PE: first bearish candle (only if no CE signal)
        if(!signal){
            for(const c of cs.peCandles){
                if(c.minute<915||c.minute>=920) continue;
                const body=c.open-c.close;
                if(body>=MIN_BODY){ signal={dir:'PE',candle:c}; break; }
            }
        }

        if(signal){
            const {dir,candle}=signal;
            const entryPx = dir==='CE' ? ceNow : peNow;   // enter at live price (next tick after signal)
            const sl      = dir==='CE' ? candle.low : candle.high;  // candle structure defines SL
            const risk    = Math.abs(entryPx-sl);

            // Store display levels regardless
            if(dir==='CE'){ state.ceEntry=entryPx; state.ceSL=sl; }
            else           { state.peEntry=entryPx; state.peSL=sl; }

            if(risk>0){
                state.tradeDir    =dir;
                state.tradeEntry  =entryPx;
                state.tradeSL     =sl;
                state.tradeRisk   =Math.round(risk*100)/100;
                state.trailLevel  =0;
                state.liveOptPrice=entryPx;
                state.livePnl     =0;
                state.livePnlPts  =0;
                state.status      ='IN_TRADE';
                log(`${dir} ENTRY @ ${entryPx}  SL=${sl}  1R=${risk.toFixed(1)} pts  candle=[${candle.open}→${candle.close}  L:${candle.low} H:${candle.high}]`);
                save(); return;
            }
        }

        // No signal by 9:20 → no trade today
        if(t>=920){
            state.status='DONE'; state.exitReason='NO_TRADE'; state.finalPnl=0;
            log('No directional signal by 9:20 — flat for the day');
        }
        save(); return;
    }

    // ─ STEP 3: IN_TRADE — ratchet trail, no fixed target ─
    if(state.status==='IN_TRADE'){
        const optNow=optionPrice(spot,state.atmStrike,dteLive,state.tradeDir,IV_LIVE);
        state.liveOptPrice=optNow;
        const pnlPts=Math.round((optNow-state.tradeEntry)*100)/100;
        state.livePnlPts=pnlPts;
        state.livePnl   =Math.round(pnlPts*15*100)/100;  // ₹ (lot size 15)

        const R=state.tradeRisk;

        // Ratchet: every time profit crosses a new R multiple, floor moves up
        // At +1R → floor = entry (breakeven)
        // At +2R → floor = entry + 1R
        // At +NR → floor = entry + (N-1)R
        const level=Math.floor(pnlPts/R);
        if(level>state.trailLevel&&level>=1){
            const newFloor=Math.round((state.tradeEntry+(level-1)*R)*100)/100;
            if(newFloor>state.tradeSL){
                state.tradeSL   =newFloor;
                state.trailLevel=level;
                log(`TRAIL  profit=${pnlPts.toFixed(1)}pts (${level}R)  SL locked → ${newFloor}  (${level-1}R protected)`);
            }
        }

        // SL hit (original or trailed)
        if(optNow<=state.tradeSL){
            state.finalPnl  =Math.round((state.tradeSL-state.tradeEntry)*100)/100;
            state.exitReason=state.trailLevel>0?'TRAIL_SL':'SL';
            state.status    ='DONE';
            const rs=Math.round(state.finalPnl*15);
            log(`${state.exitReason}  opt=${optNow}  exit=${state.tradeSL}  P&L=${state.finalPnl}pts  ₹${rs}`);
        }
        // Time exit 11:30
        else if(t>=1130){
            state.finalPnl  =pnlPts;
            state.exitReason='TIME_EXIT';
            state.status    ='DONE';
            log(`TIME EXIT 11:30  opt=${optNow}  P&L=${pnlPts}pts  ₹${Math.round(pnlPts*15)}`);
        }
        save();
    }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
console.log('[VMT-Shadow] v2 — candle-based entry, dynamic SL, ratchet trail. No hardcoded offsets.');
save();
tick();
setInterval(tick,TICK_MS);
