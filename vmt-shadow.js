'use strict';
/**
 * vmt-shadow.js  —  VMT Strategy Paper Shadow
 *
 * Runs alongside the main trading bot (PM2).
 * Reads live BNF price from bot-heartbeat.json (no extra API calls).
 *
 * VMT Logic:
 *   9:15 AM  → Capture open price, select ATM strike
 *              Calculate CE + PE premium via Black-Scholes (IV=18%)
 *              Entry = premium + 7, SL = premium, Target = Entry + 21 (3R)
 *   9:15–9:45 → Watch which side's option reaches entry level first
 *   In trade  → Monitor SL / Target every 15 sec
 *   11:30 AM  → Time exit if neither SL nor target hit
 *
 * Writes state to: /home/ubuntu/trading-bot/vmt-shadow.json
 * Read by: dashboard.js /api/vmt endpoint
 */

const fs   = require('fs');
const path = require('path');

const BASE         = path.join(__dirname);
const HEARTBEAT    = path.join(BASE, 'bot-heartbeat.json');
const STATE_FILE   = path.join(BASE, 'vmt-shadow.json');
const TICK_MS      = 15000;   // check every 15 seconds
const IV_SETUP     = 18;      // IV % at open (stable pre-open)
const IV_LIVE      = 20;      // IV % during session (slightly elevated)

// ── Black-Scholes ─────────────────────────────────────────────────────────────
function normalCDF(x) {
    const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1 - (((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t) * Math.exp(-x*x);
    return 0.5 * (1.0 + sign * y);
}

function bs(S, K, T, sigma, type) {
    if (T <= 0) return Math.max(type === 'CE' ? S - K : K - S, 0);
    const r  = 0.065;
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    if (type === 'CE') return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
    return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
}

function optionPrice(spot, strike, dte, type, iv) {
    const T = Math.max(dte / 252, 0.001);
    return Math.round(bs(spot, strike, T, iv / 100, type) * 100) / 100;
}

// ── Time helpers ──────────────────────────────────────────────────────────────
function getIST() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}
function hhmm(d) {
    return d.getHours() * 100 + d.getMinutes();
}
function todayStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function daysToNextThursday(d) {
    const day = d.getDay();
    let delta = (4 - day + 7) % 7;
    if (delta === 0) delta = 7;
    return delta;
}
function timeStr(d) {
    return d.toTimeString().slice(0, 8);
}
// Fraction of trading day elapsed since 9:15 AM
function dteFractionElapsed(d) {
    const mktStart = new Date(d);
    mktStart.setHours(9, 15, 0, 0);
    const elapsed_hours = Math.max((d - mktStart) / 3600000, 0);
    // 6.25 hrs trading day → fraction as trading days / 252
    return elapsed_hours / (6.25 * 252);
}

// ── State ─────────────────────────────────────────────────────────────────────
let state = makeBlankState('');

function makeBlankState(date) {
    return {
        status:   'IDLE',    // IDLE | WAITING | READY | IN_TRADE | DONE
        date,
        ts:       '',
        // Setup
        spotOpen:    null,
        atmStrike:   null,
        dte:         null,
        // CE setup
        cePremium:   null,
        ceEntry:     null,
        ceSL:        null,
        ceTarget:    null,
        // PE setup
        pePremium:   null,
        peEntry:     null,
        peSL:        null,
        peTarget:    null,
        // Live option estimates (updated every tick before trade)
        ceNow:   null,
        peNow:   null,
        // Active trade
        tradeDir:     null,
        tradeEntry:   null,
        tradeSL:      null,
        tradeTarget:  null,
        liveOptPrice: null,
        livePnl:      null,
        // Result
        exitReason:   null,   // TARGET | SL | TIME_EXIT | NO_TRADE
        finalPnl:     null,
        // Log
        log: []
    };
}

function readHB() {
    try {
        if (!fs.existsSync(HEARTBEAT)) return null;
        return JSON.parse(fs.readFileSync(HEARTBEAT, 'utf8'));
    } catch { return null; }
}

function save() {
    state.ts = timeStr(getIST());
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch {}
}

function log(msg) {
    const ist = getIST();
    const entry = `[${timeStr(ist)}] ${msg}`;
    console.log('[VMT-Shadow]', entry);
    state.log = [...(state.log || []).slice(-49), entry]; // keep last 50
}

// ── Main tick ────────────────────────────────────────────────────────────────
function tick() {
    const now  = getIST();
    const t    = hhmm(now);
    const today = todayStr(now);

    // New day reset
    if (state.date !== today) {
        state = makeBlankState(today);
        state.status = 'WAITING';
        log('New day — waiting for market open');
        save();
    }

    // Outside market hours → nothing to do
    if (t < 915 || t >= 1530) { save(); return; }

    // Already wrapped up
    if (state.status === 'DONE') return;

    // Get live spot from bot heartbeat
    const hb   = readHB();
    const spot = hb && hb.price ? parseFloat(hb.price) : null;
    if (!spot) { save(); return; }

    // ═══════════════════════════════════════════════
    // STEP 1 — First tick at/after 9:15: capture open
    // ═══════════════════════════════════════════════
    if (!state.spotOpen) {
        const atm = Math.round(spot / 100) * 100;
        const dte = daysToNextThursday(now);

        const cePrem = optionPrice(spot, atm, dte, 'CE', IV_SETUP);
        const pePrem = optionPrice(spot, atm, dte, 'PE', IV_SETUP);

        state.spotOpen  = spot;
        state.atmStrike = atm;
        state.dte       = dte;

        state.cePremium = cePrem;
        state.ceEntry   = Math.round((cePrem + 7) * 100) / 100;
        state.ceSL      = cePrem;
        state.ceTarget  = Math.round((state.ceEntry + (state.ceEntry - state.ceSL) * 3) * 100) / 100;

        state.pePremium = pePrem;
        state.peEntry   = Math.round((pePrem + 7) * 100) / 100;
        state.peSL      = pePrem;
        state.peTarget  = Math.round((state.peEntry + (state.peEntry - state.peSL) * 3) * 100) / 100;

        state.status = 'READY';
        log(`SETUP  spot=${spot}  ATM=${atm}  DTE=${dte}d`);
        log(`  CE: prem=${cePrem}  entry=${state.ceEntry}  SL=${state.ceSL}  tgt=${state.ceTarget}`);
        log(`  PE: prem=${pePrem}  entry=${state.peEntry}  SL=${state.peSL}  tgt=${state.peTarget}`);
        save();
        return;
    }

    // Live DTE (decays through the day)
    const dteLive = Math.max(state.dte - dteFractionElapsed(now), 0.05);

    // ═══════════════════════════════════════════════
    // STEP 2 — READY: watch for entry trigger
    // ═══════════════════════════════════════════════
    if (state.status === 'READY') {
        const ceNow = optionPrice(spot, state.atmStrike, dteLive, 'CE', IV_LIVE);
        const peNow = optionPrice(spot, state.atmStrike, dteLive, 'PE', IV_LIVE);
        state.ceNow = ceNow;
        state.peNow = peNow;

        // Entry window: 9:15–9:45 only
        if (t > 945) {
            state.status    = 'DONE';
            state.exitReason = 'NO_TRADE';
            state.finalPnl  = 0;
            log(`No entry trigger by 9:45 — flat for the day`);
            save();
            return;
        }

        if (ceNow >= state.ceEntry) {
            state.tradeDir    = 'CE';
            state.tradeEntry  = ceNow;
            state.tradeSL     = state.ceSL;
            state.tradeTarget = state.ceTarget;
            state.liveOptPrice = ceNow;
            state.livePnl     = 0;
            state.status      = 'IN_TRADE';
            log(`CE ENTRY @ ${ceNow}  SL=${state.tradeSL}  Target=${state.tradeTarget}`);
        } else if (peNow >= state.peEntry) {
            state.tradeDir    = 'PE';
            state.tradeEntry  = peNow;
            state.tradeSL     = state.peSL;
            state.tradeTarget = state.peTarget;
            state.liveOptPrice = peNow;
            state.livePnl     = 0;
            state.status      = 'IN_TRADE';
            log(`PE ENTRY @ ${peNow}  SL=${state.tradeSL}  Target=${state.tradeTarget}`);
        }
        save();
        return;
    }

    // ═══════════════════════════════════════════════
    // STEP 3 — IN_TRADE: monitor SL / Target / Time
    // ═══════════════════════════════════════════════
    if (state.status === 'IN_TRADE') {
        const optNow = optionPrice(spot, state.atmStrike, dteLive, state.tradeDir, IV_LIVE);
        state.liveOptPrice = optNow;
        state.livePnl      = Math.round((optNow - state.tradeEntry) * 100) / 100;

        if (optNow <= state.tradeSL) {
            state.finalPnl  = Math.round((state.tradeSL - state.tradeEntry) * 100) / 100;
            state.exitReason = 'SL';
            state.status    = 'DONE';
            log(`SL HIT  opt=${optNow}  P&L=${state.finalPnl} pts`);
        } else if (optNow >= state.tradeTarget) {
            state.finalPnl  = Math.round((state.tradeTarget - state.tradeEntry) * 100) / 100;
            state.exitReason = 'TARGET';
            state.status    = 'DONE';
            log(`TARGET HIT  opt=${optNow}  P&L=${state.finalPnl} pts`);
        } else if (t >= 1130) {
            state.finalPnl  = state.livePnl;
            state.exitReason = 'TIME_EXIT';
            state.status    = 'DONE';
            log(`TIME EXIT @ 11:30  opt=${optNow}  P&L=${state.finalPnl} pts`);
        }
        save();
    }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
console.log('[VMT-Shadow] Starting — writes to', STATE_FILE);
save();
tick();
setInterval(tick, TICK_MS);
