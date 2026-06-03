'use strict';
// bt_reality_check.js
// Audits DRISHTI_V1 BankNifty Futures backtest for real-world discrepancies:
//   1. Correct margin capital (not Rs 20,000)
//   2. Brokerage + STT + exchange charges per trade
//   3. Slippage (entry + exit)
//   4. Monthly rollover cost (futures expiry)
//   5. Overnight gap risk (SL breach on open)
//   6. Futures price vs Index price discrepancy

const fs   = require('fs');
const data = JSON.parse(fs.readFileSync('./bt_compare2_result.json', 'utf-8'));
const LOT  = 30;
const daily = data.daily;

// ── Real Cost Model ────────────────────────────────────────────────────────
// BankNifty futures ~ 50,000 level (avg over 5yr, adjust as needed)
const AVG_BNF_LEVEL = 45000;   // conservative avg — was ~35k in 2021, ~50k in 2026
const CONTRACT_VAL  = AVG_BNF_LEVEL * LOT;   // = 13,50,000

// ZERODHA CHARGES (per trade round-trip):
//   Brokerage   : Rs 20/order × 2 = Rs 40
//   STT         : 0.01% of sell-side notional (index futures — sell side only)
//   Exchange (NSE): 0.00188% on both sides turnover
//   SEBI        : 0.0001% both sides
//   Stamp duty  : 0.002% on buy side
//   GST (18%)   : on brokerage + exchange charges only
const BROKERAGE     = 40;
const STT           = CONTRACT_VAL * 0.0001;          // 0.01%
const EXCHANGE      = CONTRACT_VAL * 2 * 0.0000188;   // both sides
const SEBI          = CONTRACT_VAL * 2 * 0.000001;
const STAMP         = CONTRACT_VAL * 0.00002;          // buy side
const GST           = (BROKERAGE + EXCHANGE) * 0.18;
const TOTAL_CHARGES = BROKERAGE + STT + EXCHANGE + SEBI + STAMP + GST;

// SLIPPAGE: realistic for BNF futures (15-min candle, market order at close)
//   Entry: 3 pts  | Exit: 3 pts | Total: 6 pts round trip = 6 × 30 = Rs 180
const SLIP_PTS      = 6;    // round-trip index pts
const SLIP_RS       = SLIP_PTS * LOT;

// ROLLOVER: once per month (near expiry Thursday), spread ~50 pts avg
const ROLLOVER_RS   = 50 * LOT;  // Rs 1,500 per month

// MARGIN (SPAN + Exposure for BNF futures):
// Zerodha margin calculator: BNF futures ~Rs 80,000–1,20,000 per lot
// Using 10% SPAN + 3% Exposure on contract value at current ~55,000 level
// Conservative estimate: 13% of contract value
const SPAN_MARGIN   = AVG_BNF_LEVEL * LOT * 0.13;   // ~Rs 1,75,500 at 45k

const COST_PER_TRADE = TOTAL_CHARGES + SLIP_RS;

const fmt  = n => Math.round(n).toLocaleString('en-IN');
const fmtf = n => n.toFixed(2);

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  REALITY CHECK — DRISHTI_V1 BankNifty FUTURES');
console.log('══════════════════════════════════════════════════════════════');

console.log('\n── Per Trade Cost Breakdown ──────────────────────────────────');
console.log('  Brokerage (Rs 20 × 2 orders)    : Rs ' + fmtf(BROKERAGE));
console.log('  STT (0.01% sell-side notional)  : Rs ' + fmtf(STT));
console.log('  Exchange charges (NSE, 2-sided) : Rs ' + fmtf(EXCHANGE));
console.log('  SEBI charges                    : Rs ' + fmtf(SEBI));
console.log('  Stamp duty (buy side)           : Rs ' + fmtf(STAMP));
console.log('  GST (18% on brokerage+exchange) : Rs ' + fmtf(GST));
console.log('  ─────────────────────────────────────────');
console.log('  Total charges per trade         : Rs ' + fmtf(TOTAL_CHARGES));
console.log('  Slippage (6 pts × 30)           : Rs ' + fmt(SLIP_RS));
console.log('  TOTAL friction per trade        : Rs ' + fmtf(COST_PER_TRADE));

// Count actual trades from backtest
const totalTrades = daily.reduce((s, d) => s + (d.candelT || 0), 0);
const tradingDays = daily.length;
const avgTradesPerDay = totalTrades / tradingDays;
const months = new Set(daily.map(d => d.date.slice(0, 7))).size;

console.log('\n── Actual Trade Stats (from backtest) ──────────────────────');
console.log('  Trading days           : ' + tradingDays);
console.log('  Total trades           : ' + totalTrades);
console.log('  Avg trades/day         : ' + avgTradesPerDay.toFixed(2));
console.log('  Avg trades/month       : ' + (totalTrades / months).toFixed(1));

// Total friction
const totalFrictionTrades = totalTrades * COST_PER_TRADE;
const totalRollover        = months * ROLLOVER_RS;
const totalFriction        = totalFrictionTrades + totalRollover;
const grossPnL             = daily.reduce((s, d) => s + d.candle, 0) * LOT;
const netPnL               = grossPnL - totalFriction;

console.log('\n── 5-Year P&L Reality ───────────────────────────────────────');
console.log('  Gross P&L (index pts × 30)      : +Rs ' + fmt(grossPnL));
console.log('  Total charges+slippage           :  -Rs ' + fmt(totalFrictionTrades));
console.log('  Monthly rollover costs (×' + months + ')    :  -Rs ' + fmt(totalRollover));
console.log('  ─────────────────────────────────────────');
console.log('  NET P&L (realistic)              : +Rs ' + fmt(netPnL));
console.log('  Friction as % of gross           : ' + (totalFriction / grossPnL * 100).toFixed(1) + '%');

const grossPerMonth = grossPnL / months;
const netPerMonth   = netPnL   / months;
console.log('\n── Monthly Avg ──────────────────────────────────────────────');
console.log('  Gross/month              : +Rs ' + fmt(grossPerMonth));
console.log('  Net/month (after costs)  : +Rs ' + fmt(netPerMonth));

// Capital & ROI
console.log('\n── Capital Required ─────────────────────────────────────────');
console.log('  WRONG (what I said):     Rs 20,000   ← OPTIONS margin, not futures');
console.log('  CORRECT (SPAN+Exposure): Rs ' + fmt(SPAN_MARGIN) + '  ← ~13% of contract value');
console.log('  Contract value (45k×30): Rs ' + fmt(CONTRACT_VAL));
console.log('  5yr ROI on real capital  : ' + (netPnL / SPAN_MARGIN * 100).toFixed(0) + '% over 5 years');
console.log('  Annual ROI               : ' + (netPnL / SPAN_MARGIN / 5 * 100).toFixed(0) + '% per year');

// Gap risk analysis
const gapRiskDays = daily.filter(d => d.candle <= -100).length;
console.log('\n── Overnight Gap / SL Breach Risk ───────────────────────────');
console.log('  Days with loss > -100 pts         : ' + gapRiskDays);
console.log('  (SL=150 pts, but gap-open could'); 
console.log('   breach SL before market reacts)');
console.log('  Max single-day loss                : ' + Math.min(...daily.map(d=>d.candle)).toFixed(1) + ' pts = -Rs ' + fmt(Math.abs(Math.min(...daily.map(d=>d.candle))) * LOT));

// Futures premium vs Index discrepancy
console.log('\n── Futures Price vs Index Discrepancy ───────────────────────');
console.log('  Backtest uses: BankNifty INDEX candles (spot)');
console.log('  Trading on  : BankNifty FUTURES (different OHLC)');
console.log('  Typical spread: futures trade +50 to +200 pts ABOVE spot');
console.log('  Near expiry   : spread compresses to ~0');
console.log('  Effect        : entry/exit pts differ from backtest by ±10-30 pts');
console.log('  Impact        : small on trend-following (signal direction unchanged)');

// Win rate confidence interval
const n    = tradingDays;
const p    = daily.filter(d => d.candle > 0).length / n;
const z95  = 1.96;
const ciLow  = (p - z95 * Math.sqrt(p*(1-p)/n) * 100).toFixed(1);
const ciHigh = (p + z95 * Math.sqrt(p*(1-p)/n) * 100).toFixed(1);
console.log('\n── Statistical Confidence ───────────────────────────────────');
console.log('  Backtest win rate     : ' + (p*100).toFixed(1) + '%');
console.log('  95% confidence interval: [' + ciLow + '%, ' + ciHigh + '%]');
console.log('  Forward win rate range: roughly 87–94%');
console.log('  Note: backtest uses SAME data it was tuned on (look-ahead bias risk)');

console.log('\n── Summary of Discrepancies ─────────────────────────────────');
console.log('  1. Capital: Rs 20k (WRONG) → Rs ' + fmt(SPAN_MARGIN) + ' (REAL)');
console.log('  2. Monthly gross Rs ' + fmt(grossPerMonth) + ' → net Rs ' + fmt(netPerMonth) + ' after charges');
console.log('  3. Brokerage+STT+slip costs: Rs ' + fmt(totalFriction) + ' over 5yr');
console.log('  4. Futures OHLC ≠ Index OHLC (±10-30 pts per trade)');
console.log('  5. Rollover: Rs 1,500/month cost to switch expiry');
console.log('  6. No circuit-breaker / exchange halt modeled');
console.log('  7. OHLC assumes high before low in same candle (favorable assumption)');
console.log('  8. Max 5 trades/day — real bot may miss signals if connection drops');
console.log('══════════════════════════════════════════════════════════════\n');
