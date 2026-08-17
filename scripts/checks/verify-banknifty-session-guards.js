const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const source = fs.readFileSync(path.join(root, "deployment", "trading-bot", "index.ts"), "utf8");
const runtime = fs.readFileSync(path.join(root, "deployment", "trading-bot", "dist", "src", "index.js"), "utf8");

assert.equal(runtime, source, "BANKNIFTY source and deployed runtime artifact must remain byte-identical");
assert.match(source, /const request = \(async \(\) =>/);
assert.match(source, /todayIndex15mInFlight = request/);
assert.match(source, /if \(todayIndex15mInFlight === request\)\s+todayIndex15mInFlight = null/);
assert.doesNotMatch(source, /todayIndex15mInFlight = \(async \(\) =>[\s\S]{0,1800}finally \{\s+todayIndex15mInFlight = null/);
assert.match(source, /h === 9 && m === 15 && drishtiLastResetDay !== todayKey/);
assert.match(source, /drishtiLastResetDay = todayKey/);
assert.match(source, /h > 15 \|\| \(h === 15 && m >= 45\)/);
assert.match(source, /fallbackClose = Number\(lastKnownPrice \|\| bhs1\.liveIdx/);
assert.match(source, /BH_EOD_DEFERRED/);
assert.match(source, /async function runBot\(\) \{[\s\S]{0,500}await finalizeBodyHoldAfterClose\(eodIST, tt1030ISTParts\(\)\.ymd\);[\s\S]{0,120}if \(!isMarketHours\(\)\)/);
assert.match(source, /const shadowEngineInFlight = new Set\(\)/);
assert.match(source, /runShadowEngineOnce\('HYBRID_BODY'/);
assert.match(source, /runShadowEngineOnce\('NORMAL_BREAKOUT'/);
assert.match(source, /runShadowEngineOnce\('BODY_HOLD'/);
assert.doesNotMatch(source, /const timeout = setTimeout\(\(\) => \{\s*runBotActive = false/);
assert.match(source, /processedCandleKeys: \[\.\.\.bhProcessedCandleKeys\]/);
assert.match(source, /async function runBodyHoldHistory\(isEOD\)/);
assert.match(source, /const completed = candles\.filter\(isCompletedSessionCandle\)/);
assert.match(source, /bhProcessedCandleKeys\.has\(key\)/);

console.log("PASS BANKNIFTY candle-cache recovery, one-shot reset, artifact parity, and Body Hold EOD fallback guards");
