const fs = require('fs');
const os = require('os');
const path = require('path');

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-pnl-runtime-'));
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

try {
  fs.writeFileSync(path.join(temp, 'bot-heartbeat.json'), JSON.stringify({
    at: new Date().toISOString(),
    qty: 30,
    price: 57800,
    strategy: 'DRISHTI_V1',
    inTrade: true,
    direction: 'CE',
    entryPrice: 57950,
    livePrice: 57800,
    dailyRealRs: 100,
    optInTrade: true,
    optDir: 'CE',
    optSymbol: 'BANKNIFTYTESTCE',
    optEntryPrem: 669,
    livePremium: 698,
    optDailyRs: 50,
    bodyHoldS1Strategy: 'BODY_HOLD_S1_SHADOW',
    bodyHoldS1InTrade: true,
    bodyHoldS1Dir: 'CE',
    bodyHoldS1Entry: 58013,
    bodyHoldS1Live: 57800,
    bodyHoldS1FuturesRealizedPnL: 100,
    bodyHoldS1FuturesUnrealizedPnL: -6390,
    bodyHoldS1FuturesPnL: -6290,
    bodyHoldS1OptionSymbol: 'BANKNIFTYTESTCE',
    bodyHoldS1OptionLive: 700,
    bodyHoldS1OptionsRealizedPnL: 50,
    bodyHoldS1OptionsUnrealizedPnL: 300,
    bodyHoldS1OptionsPnL: 350,
  }));
  fs.writeFileSync(path.join(temp, 'body-hold-shadow-state.json'), JSON.stringify({
    date: today,
    savedAt: new Date().toISOString(),
    s1: { inTrade: true, dir: 'CE', entryIdx: 58013, liveIdx: 57800, entryPrem: 690, livePrem: 700, optSym: 'BANKNIFTYTESTCE', dayFutRs: 100, dayOptRs: 50, sl: 57813, slPrem: 490 },
    s2: { inTrade: false },
  }));
  fs.writeFileSync(path.join(temp, 'trades.json'), '[]');

  process.env.TRADING_BOT_DIR = temp;
  const { buildShadowMonitorPayload } = require('../../dist/shadowMonitor.js');

  const bodyFutures = buildShadowMonitorPayload('body-hold-s1', 'FUTURES');
  assert(bodyFutures.summary.realizedPnl === 100, 'Body Hold Futures realized P&L mismatch');
  assert(bodyFutures.summary.unrealizedPnl === -6390, 'Body Hold Futures unrealized P&L mismatch');
  assert(bodyFutures.summary.totalPnl === -6290 && bodyFutures.position.ltp === 57800, 'Body Hold Futures total/LTP mismatch');

  const bodyOptions = buildShadowMonitorPayload('body-hold-s1', 'OPTIONS');
  assert(bodyOptions.summary.realizedPnl === 50, 'Body Hold Options realized P&L mismatch');
  assert(bodyOptions.summary.unrealizedPnl === 300, 'Body Hold Options unrealized P&L mismatch');
  assert(bodyOptions.summary.totalPnl === 350 && bodyOptions.position.ltp === 700, 'Body Hold Options total/LTP mismatch');

  const drishtiFutures = buildShadowMonitorPayload('drishti', 'FUTURES');
  assert(drishtiFutures.summary.totalPnl === -4400, 'DRISHTI Futures rupee MTM mismatch');
  const drishtiOptions = buildShadowMonitorPayload('drishti', 'OPTIONS');
  assert(drishtiOptions.summary.totalPnl === 920, 'DRISHTI Options rupee MTM mismatch');

  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'shadowMonitor.ts'), 'utf8');
  assert(source.includes('scheduledEvaluationMissed(strategy.id, fields)'), 'Consolidated missed-evaluation classification is absent');
  const botSource = fs.readFileSync(path.join(__dirname, '..', '..', 'deployment', 'trading-bot', 'index.ts'), 'utf8');
  const botRuntime = fs.readFileSync(path.join(__dirname, '..', '..', 'deployment', 'trading-bot', 'dist', 'src', 'index.js'), 'utf8');
  for (const artifact of [botSource, botRuntime]) {
    assert(artifact.includes('async function runNineFortyFiveShadow('), '09:45 runtime engine is absent');
    assert(artifact.includes('...tt0945HeartbeatFields()'), '09:45 heartbeat publication is absent');
    assert(artifact.includes('runNineFortyFiveShadow(shadowIsEOD)'), '09:45 scheduler invocation is absent');
    assert(artifact.includes('const shadowRuns = await Promise.allSettled(['), 'Scheduled shadow engines are not awaited');
    assert(artifact.includes('bodyHoldS1FuturesUnrealizedPnL'), 'Body Hold MTM heartbeat fields are absent');
  }
  assert(botSource === botRuntime, 'Trading-bot source and deployable runtime artifact differ');
  console.log('SHADOW_PNL_RUNTIME_VERIFICATION=OK');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
