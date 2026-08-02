const fs = require("fs");

const files = [
  "/home/ubuntu/trading-bot/src/index.ts",
  "/home/ubuntu/trading-bot/dist/src/index.js",
];

const variants = [
  {
    before: `        const savedTT1030CandleLog = loadTT1030CandleLog(tt1030ISTParts().ymd);
        tt1030 = TT1030_EMPTY();
        hybridShadow = HYBRID_EMPTY();
        hybridShadow.day = tt1030ISTParts().ymd;
        tt1030.day = tt1030ISTParts().ymd;
        tt1030.candleLog = savedTT1030CandleLog;
        if (!savedTT1030CandleLog.length)
            persistTT1030CandleLog();`,
    after: `        const todayKey = tt1030ISTParts().ymd;
        const savedTT1030CandleLog = loadTT1030CandleLog(todayKey);
        hybridShadow = HYBRID_EMPTY();
        hybridShadow.day = todayKey;
        restoreTT1030State(todayKey, savedTT1030CandleLog);
        if (!savedTT1030CandleLog.length)
            persistTT1030CandleLog();`,
  },
];

let patched = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let text = fs.readFileSync(file, "utf8");
  let next = text;
  for (const { before, after } of variants) {
    next = next.split(before).join(after);
  }
  const changes = text === next ? 0 : text.split(variants[0].before).length - 1;
  if (changes) {
    fs.copyFileSync(file, `${file}.tt1030-reset.bak`);
    fs.writeFileSync(file, next);
    patched += changes;
    console.log(`${file}: patched ${changes} reset block(s)`);
  } else {
    console.log(`${file}: no matching reset block found`);
  }
}

if (!patched) {
  process.exitCode = 1;
}
