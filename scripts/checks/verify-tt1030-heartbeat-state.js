const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'deployment', 'trading-bot', 'index.ts'), 'utf8');
const heartbeat = source.match(/function tt1030HeartbeatFields\(\) \{[\s\S]*?\n\}\nconst TT1000_STATE_FILE/)?.[0]
  ?.replace(/\nconst TT1000_STATE_FILE$/, '');
const merge = source.match(/function tt1030MergeRecoveredCandleLogs\(stateLog, candleFileLog\) \{[\s\S]*?\n\}/)?.[0];
const failures = [];

const stateSection = source.match(/function tt1030WriteJsonAtomic\(file, value\) \{[\s\S]*?(?=\nasync function reconcileTT1030LiveStateOnStartup)/)?.[0];
if (!stateSection) {
  failures.push('TT1030 persistence/restore section was not found');
} else {
  try {
    Function(stateSection);
  } catch (error) {
    failures.push(`TT1030 persistence/restore section has invalid syntax: ${error.message}`);
  }
}

if (!heartbeat) failures.push('TT1030 heartbeat function was not found');
if (!merge) failures.push('TT1030 recovered-candle merge function was not found');

if (heartbeat) {
  const factory = Function(`
    const tt1030ExecutionContext = 'SHADOW';
    const tt1030 = { day: '2099-01-01', trades: 99, wins: 0, losses: 0, dayRs: 0, dayPts: 0, inTrade: false, dir: null, entry: 0, sl: 0, optSym: '', optEntryPrem: 0, optLivePrem: 0, futSym: '', futEntryPrice: 0, futLivePrice: 0, liveQty: 0, entryOrderId: '', exitOrderId: '', stopOrderId: '', stopTriggerPrice: 0, dailyLossLocked: false, tenHigh: 0, tenLow: 0, log: [], candleLog: [] };
    const tt1030LiveState = { ...tt1030, day: '2026-08-02', trades: 2, wins: 1, losses: 1, savedAt: 'saved-live', restoredAt: 'restored-live', stateSource: 'tt1030-state+candle-log', log: [{ id: 'live-trade' }], candleLog: [{ idx: 1, time: '09:15' }, { idx: 2, time: '09:30' }] };
    const tt1030Shadow = { ...tt1030, day: '2026-08-02', trades: 9, log: [{ id: 'shadow-trade' }], candleLog: Array.from({ length: 9 }, (_, i) => ({ idx: i + 1, time: String(i) })) };
    const tt1030ShadowPublishedState = tt1030Shadow;
    const tt1030AuditIssues = [{ severity: 'error', source: 'shadow' }];
    const tt1030LiveAuditIssues = [];
    const tt1030ShadowAuditIssues = [];
    const lastKnownPrice = 0;
    const config_1 = { config: { quantity: 30 } };
    const latestDrishtiBlockReason = '';
    const tt1030LastBrokerPnlRs = 0;
    const TT1030_DAILY_LOSS_CAP_RS = 6000;
    const TT1030_WARN_RISK_PTS = 150;
    const tt1030ReconciliationBlockedReason = '';
    const tt1030ISTParts = () => ({ ymd: '2026-08-02' });
    ${heartbeat}
    return tt1030HeartbeatFields;
  `);
  const previousMode = process.env.TT1030_FUTURES_MODE;
  process.env.TT1030_FUTURES_MODE = 'LIVE';
  try {
    const result = factory()();
    if (result.tt1030Trades !== 2 || result.tt1030CandleCount !== 2) failures.push('Heartbeat used shadow replay counts instead of recovered live counts');
    if (result.tt1030ShadowTrades !== 9) failures.push('Heartbeat lost the separate shadow counts');
    if (result.tt1030FuturesMode !== 'LIVE') failures.push('Heartbeat mode changed during shadow replay');
    if (!result.tt1030StateConsistent || result.tt1030SessionDate !== '2026-08-02') failures.push('Heartbeat live-state consistency metadata is incorrect');
    if (result.tt1030AuditStatus !== 'OK') failures.push('Heartbeat used shadow audit issues as live audit issues');
    process.env.TT1030_FUTURES_MODE = 'SHADOW';
    const shadowResult = factory()();
    if (shadowResult.tt1030Trades !== 9 || shadowResult.tt1030CandleCount !== 9) failures.push('SHADOW heartbeat did not publish the restored shadow state');
    if (!shadowResult.tt1030StateConsistent || shadowResult.tt1030SessionDate !== '2026-08-02') failures.push('SHADOW heartbeat consistency metadata is incorrect');
  } finally {
    if (previousMode === undefined) delete process.env.TT1030_FUTURES_MODE;
    else process.env.TT1030_FUTURES_MODE = previousMode;
  }
}

if (merge) {
  const mergeFn = Function(`${merge}; return tt1030MergeRecoveredCandleLogs;`)();
  const result = mergeFn(
    [{ idx: 1, time: '09:15', status: 'old' }, { idx: 2, time: '09:30' }],
    [{ idx: 1, time: '09:15', status: 'new' }, { idx: 3, time: '09:45' }],
  );
  if (result.length !== 3 || result[0].status !== 'new') failures.push('Recovered candle logs were not deduplicated with the candle-file version preferred');
}

if (!source.includes('tt1030WriteJsonAtomic(tt1030StateFile()') || !source.includes('tt1030WriteJsonAtomic(tt1030CandleLogFile()')) {
  failures.push('TT1030 state files are not both written atomically');
}

if (failures.length) {
  console.error(`TT1030_HEARTBEAT_STATE_FAILED (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('TT1030_HEARTBEAT_STATE_OK');
