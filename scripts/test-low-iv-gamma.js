"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const moduleFile = process.env.LOW_IV_GAMMA_MODULE || path.join(__dirname, "..", "deployment", "trading-bot", "low_iv_gamma.js");
const engine = require(moduleFile);

const call = engine.bsPrice(50000, 50000, 7 / 365, 0.065, 0.20, "CE");
const recovered = engine.impliedVol(call, 50000, 50000, 7 / 365, 0.065, "CE");
assert(Math.abs(recovered - 0.20) < 0.0001, "IV solver must recover the source volatility");

const g = engine.greeks(50000, 50000, 7 / 365, 0.065, 0.20, "CE");
assert(g.delta > 0 && g.delta < 1, "CE delta must be bounded");
assert(g.gamma > 0, "gamma must be positive");

const candles = Array.from({ length: 15 }, (_, i) => ({
  high: 50020 + i * 5, low: 49980 + i * 5, close: 50000 + i * 5, volume: 100 + i,
}));
assert(engine.ema(candles.map(c => c.close), 20).length === 15, "EMA must preserve length");
assert(engine.atr(candles, 14) > 0, "ATR14 must be available with 15 candles");
assert(engine.vwap(candles) > 0, "VWAP must be available with volume");

const source = fs.readFileSync(moduleFile, "utf8");
assert(!/placeOrder|exitTrade|squareOffAll|order\.js/.test(source), "shadow engine must not reference broker order paths");
assert(/executionMode:\s*"SHADOW"/.test(source), "shadow mode must be hard-coded");
assert(/LOW_IV_GAMMA_OPT/.test(source), "completed trades must use a dedicated ledger type");

const configFile = process.env.LOW_IV_GAMMA_CONFIG || path.join(__dirname, "..", "deployment", "trading-bot", "low-iv-gamma-config.json");
const cfg = JSON.parse(fs.readFileSync(configFile, "utf8"));
assert.strictEqual(cfg.executionMode, "SHADOW");
assert.strictEqual(cfg.allowExpiryDay, false);
assert.strictEqual(cfg.allowReentry, false);
assert.strictEqual(cfg.gammaFilterEnabled, false);

console.log("LOW_IV_GAMMA_TEST_PASS=12");
