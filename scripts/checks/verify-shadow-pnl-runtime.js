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
    bankNiftyFuturesSession: {
      symbol: 'BANKNIFTY26AUGFUT', open: 57750, current: 57880, high: 58066, low: 57712,
      movementPoints: 130, rangePoints: 354,
      regime: { label: 'MIXED', directionality: 36.7, suggestedMode: 'CONFIRMATION_ONLY' },
    },
    tt1030ShadowCandleLog: [
      { time: '09:15', open: 57500, high: 57600, low: 57450, close: 57580 },
      { time: '15:30', open: 57800, high: 58250, low: 57750, close: 58200 },
    ],
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
  assert(bodyFutures.summary.capturedPoints === -6290 / 30, 'Body Hold Futures captured-points mismatch');
  assert(bodyFutures.market.bankNiftyMovement.movementPoints === 130, 'Futures benchmark movement mismatch');
  assert(bodyFutures.market.bankNiftyMovement.rangePoints === 354, 'Futures benchmark range mismatch');
  assert(bodyFutures.market.bankNiftyMovement.cash.movementPoints === 300, 'Cash-index movement mismatch');
  assert(bodyFutures.market.bankNiftyMovement.cash.rangePoints === 800, 'Cash-index range mismatch');
  assert(bodyFutures.market.bankNiftyMovement.regime.label === 'MIXED', 'Futures regime mismatch');

  const bodyOptions = buildShadowMonitorPayload('body-hold-s1', 'OPTIONS');
  assert(bodyOptions.summary.realizedPnl === 50, 'Body Hold Options realized P&L mismatch');
  assert(bodyOptions.summary.unrealizedPnl === 300, 'Body Hold Options unrealized P&L mismatch');
  assert(bodyOptions.summary.totalPnl === 350 && bodyOptions.position.ltp === 700, 'Body Hold Options total/LTP mismatch');

  const consolidated = bodyOptions.consolidated.tiles;
  const noTradeLeaks = consolidated.filter((tile) =>
    tile.positionState === 'NO TRADE'
    && Number(tile.trades || 0) === 0
    && Number(tile.openPositions || 0) === 0
    && (
      Number(tile.pnl || 0) !== 0
      || Number(tile.capitalDeployed || 0) !== 0
      || tile.capturedPoints !== null
      || Number(tile.returnPct || 0) !== 0
    )
  );
  assert(noTradeLeaks.length === 0, `NO TRADE consolidated tiles leaked P&L: ${noTradeLeaks.map((tile) => `${tile.strategyId}:${tile.instrumentType}:${tile.pnl}`).join(', ')}`);

  const drishtiFutures = buildShadowMonitorPayload('drishti', 'FUTURES');
  assert(drishtiFutures.summary.totalPnl === -4400, 'DRISHTI Futures rupee MTM mismatch');
  const drishtiOptions = buildShadowMonitorPayload('drishti', 'OPTIONS');
  assert(drishtiOptions.summary.totalPnl === 920, 'DRISHTI Options rupee MTM mismatch');

  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'shadowMonitor.ts'), 'utf8');
  assert(source.includes('scheduledEvaluationMissed(strategy.id, fields)'), 'Consolidated missed-evaluation classification is absent');
  for (const artifact of [source, fs.readFileSync(path.join(__dirname, '..', '..', 'dist', 'shadowMonitor.js'), 'utf8')]) {
    assert(artifact.includes('sm-consolidated-groups'), 'Consolidated Futures/Options group layout is absent');
    assert(artifact.includes('data-consolidated-instrument="FUTURES"'), 'Consolidated Futures switch is absent');
    assert(artifact.includes('data-consolidated-instrument="OPTIONS"'), 'Consolidated Options switch is absent');
    assert(artifact.includes('visibleTiles=tiles.filter(function(t){return t.instrumentType===selectedInstrument})'), 'Consolidated grid is not filtered by selected instrument');
    assert(artifact.includes('data-group-summary'), 'Consolidated instrument summaries are absent');
    assert(artifact.includes('selectedShort+" Winner Day"'), 'Consolidated selected-instrument day winner card is absent');
    assert(artifact.includes('selectedShort+" Loser Day"'), 'Consolidated selected-instrument day loser card is absent');
    assert(artifact.includes('selectedShort+" Winner Month"'), 'Consolidated selected-instrument month winner card is absent');
    assert(artifact.includes('selectedShort+" Loser Month"'), 'Consolidated selected-instrument month loser card is absent');
    assert(artifact.includes('sm-key-captured'), 'Per-tile captured points are absent');
    assert(artifact.includes('bankNiftyMovement'), 'BANKNIFTY movement display is absent');
    assert(artifact.includes('function renderMovementContext'), 'Cash/futures movement split is absent');
    assert(artifact.includes('Futures benchmark'), 'Tradable futures benchmark label is absent');
    assert(artifact.includes('Market Regime'), 'Market-regime display is absent');
    assert(artifact.includes('09:15 - 15:40'), 'Updated F&O session is absent');
  }
  const botSource = fs.readFileSync(path.join(__dirname, '..', '..', 'deployment', 'trading-bot', 'index.ts'), 'utf8');
  const botRuntime = fs.readFileSync(path.join(__dirname, '..', '..', 'deployment', 'trading-bot', 'dist', 'src', 'index.js'), 'utf8');
  for (const artifact of [botSource, botRuntime]) {
    assert(artifact.includes('async function runNineFortyFiveShadow('), '09:45 runtime engine is absent');
    assert(artifact.includes('...tt0945HeartbeatFields()'), '09:45 heartbeat publication is absent');
    assert(artifact.includes('runNineFortyFiveShadow(shadowIsEOD)'), '09:45 scheduler invocation is absent');
    assert(artifact.includes('const shadowRuns = await Promise.allSettled(['), 'Scheduled shadow engines are not awaited');
    assert(artifact.includes('bodyHoldS1FuturesUnrealizedPnL'), 'Body Hold MTM heartbeat fields are absent');
    assert(artifact.includes('isCompletedSessionCandle'), 'Final 15:30-15:40 candle completion handling is absent');
    assert(artifact.includes('Stopped new trades at 15:25'), 'Updated new-entry cutoff is absent');
    assert(artifact.includes('15:39 exit all positions'), 'Updated pre-close square-off is absent');
    assert(artifact.includes('replayFinalForEOD'), 'Index-signal EOD replay handling is absent');
    assert(artifact.includes('DRISHTI_TRAIL_ACTIVATE_PTS") || 10'), 'DRISHTI LOCK10 activation does not match the validated strategy');
    assert(artifact.includes('entryTime = Date.now()'), 'DRISHTI actual entry timestamp is not captured');
    assert(artifact.includes('tradeId: `DRISHTI_V1-${entryTime}`'), 'DRISHTI open/close rows do not share a stable trade id');
    assert(artifact.includes('drishtiLtpCheckRunning'), 'DRISHTI LTP monitor overlap guard is absent');
    assert(artifact.includes('Math.max(0, Number(DrishtiState.peakPts || 0))'), 'DRISHTI restart does not restore the protected peak');
    assert(artifact.includes('PORTFOLIO_CORRELATION_BLOCK'), 'Live BANKNIFTY portfolio exposure guard is absent');
    assert(artifact.includes('DRISHTI_REGIME_REENTRY_BLOCK'), 'Two-sided-session re-entry guard is absent');
    assert(artifact.includes('maxConcurrentBankNiftyLiveStrategies: 1'), 'Portfolio-risk heartbeat contract is absent');
    assert(artifact.includes('benchmark: "NFO_FRONT_MONTH_FUTURES"'), 'Runtime futures benchmark contract is absent');
  }
  assert(botSource === botRuntime, 'Trading-bot source and deployable runtime artifact differ');
  const indicatorSource = fs.readFileSync(path.join(__dirname, '..', '..', 'deployment', 'trading-bot', 'indicator-shadow.ts'), 'utf8');
  assert(indicatorSource.includes('sessionMinutes >= 15 * 60 + 40'), 'Indicator 15:40 explicit close is absent');
  assert(indicatorSource.includes('F&O session close; final BANKNIFTY index print'), 'Indicator final index close evidence is absent');
  console.log('SHADOW_PNL_RUNTIME_VERIFICATION=OK');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
