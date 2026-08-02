#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const artifact = path.join(process.cwd(), "deployment", "trading-bot", "dist", "src", "order.js");
if (!fs.existsSync(artifact)) throw new Error(`Missing PM2 order artifact: ${artifact}`);

const source = fs.readFileSync(artifact, "utf8");
const required = [
  "function wholeOrderPrice(value, side)",
  "side === \"BUY\" ? Math.ceil(n) : Math.floor(n)",
  "function kiteOrder(payload)",
  "ORDER_PRICE_ROUNDED",
];
for (const marker of required) {
  if (!source.includes(marker)) throw new Error(`PM2 order artifact is missing rounding marker: ${marker}`);
}

const placements = source.match(/kite\.placeOrder\("regular"/g) || [];
const guardedPlacements = source.match(/kite\.placeOrder\("regular", kiteOrder\(\{/g) || [];
if (!placements.length) throw new Error("PM2 order artifact contains no regular order placements");
if (placements.length !== guardedPlacements.length) {
  throw new Error(`Only ${guardedPlacements.length}/${placements.length} regular order placements use kiteOrder()`);
}

console.log(`PM2_ORDER_ARTIFACT_OK placements=${placements.length} guarded=${guardedPlacements.length} path=${artifact}`);
