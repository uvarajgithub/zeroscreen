const fs = require('fs');

const source = fs.readFileSync('/home/ubuntu/trading-bot/dist/src/index.js', 'utf8');
function extractFunction(name) {
  let start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Production function not found: ${name}`);
  if (source.slice(start - 6, start) === 'async ') start -= 6;
  const brace = source.indexOf('{', start);
  let depth = 0, quote = null, escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Production function was not terminated: ${name}`);
}

const deployedFunctions = ['tt1030BrokerRiskSnapshot', 'tt1030DailyCapReached', 'tt1030MonitorLiveRisk']
  .map(extractFunction).join('\n');

function harness({ position, flattenOnClose = true, brokerError = null, trade = {} }) {
  const factory = Function('initialPosition', 'flattenOnClose', 'brokerError', 'initialTrade', `
    const TT1030_DAILY_LOSS_CAP_RS = 6000;
    const TT1030_WARN_RISK_PTS = 150;
    let tt1030RiskMonitorInFlight = false;
    let tt1030LastBrokerPnlRs = 0;
    let tt1030LastRiskAlertAt = 0;
    let tt1030ReconciliationBlockedReason = '';
    let currentPosition = initialPosition;
    let closeCount = 0;
    let alertCount = 0;
    let persistCount = 0;
    const audits = [];
    const tt1030 = Object.assign({ inTrade: true, futSym: 'BANKNIFTYTESTFUT', futEntryPrice: 50000, futLivePrice: 50000, entry: 50000, optLivePrem: 0, dailyLossLocked: false }, initialTrade);
    function tt1030IsLiveFutures() { return true; }
    const kite = { getPositions: async () => {
      if (brokerError) throw brokerError;
      return { net: currentPosition ? [currentPosition] : [] };
    }};
    async function tt1030BrokerPosition(symbol) { return currentPosition && currentPosition.tradingsymbol === symbol ? currentPosition : null; }
    async function tt1030CloseTrade() { closeCount += 1; if (flattenOnClose) currentPosition = null; }
    function appendTT1030Audit(event, details, severity) { audits.push({ event, details, severity }); }
    function persistTT1030State() { persistCount += 1; }
    async function notifyTT1030Telegram() { alertCount += 1; }
    const market_1 = { getCurrentPrice: async () => 50000 };
    const lastKnownPrice = 50000;
    ${deployedFunctions}
    return {
      monitor: tt1030MonitorLiveRisk,
      dailyCap: tt1030DailyCapReached,
      snapshot() { return { trade: { ...tt1030 }, closeCount, alertCount, persistCount, audits, blocked: tt1030ReconciliationBlockedReason, lastBrokerPnl: tt1030LastBrokerPnlRs }; },
    };
  `);
  return factory(position, flattenOnClose, brokerError, trade);
}

function future({ quantity = 30, average = 50000, last = 50000, pnl = 0 } = {}) {
  return { exchange: 'NFO', tradingsymbol: 'BANKNIFTYTESTFUT', quantity, average_price: average, last_price: last, pnl };
}
function assert(ok, message) { if (!ok) throw new Error(message); }

async function main() {
  let test = harness({ position: future({ last: 49851, pnl: -5999 }) });
  await test.monitor();
  let state = test.snapshot();
  assert(state.closeCount === 0 && !state.trade.dailyLossLocked && !state.blocked, 'below-limit state incorrectly exited or locked');
  assert(test.dailyCap(-5999) === false && test.dailyCap(-6000) === true, 'daily-cap boundary is incorrect');
  console.log('PASS below-limit behavior and exact daily-cap boundary');

  test = harness({ position: future({ last: 49900, pnl: -6000 }) });
  await test.monitor();
  state = test.snapshot();
  assert(state.closeCount === 1 && state.trade.dailyLossLocked === true && /daily loss lock/i.test(state.blocked) && state.alertCount === 1, 'daily loss did not lock, exit, and alert');
  console.log('PASS daily-loss lock, exit, and alert');

  test = harness({ position: future({ last: 49850, pnl: -1000 }) });
  await test.monitor();
  state = test.snapshot();
  assert(state.closeCount === 1 && state.trade.dailyLossLocked === false && state.blocked === '' && state.alertCount === 1, 'long maximum-risk exit behavior is incorrect');
  console.log('PASS long-position maximum-risk exit');

  test = harness({ position: future({ quantity: -30, last: 50150, pnl: -1000 }) });
  await test.monitor();
  state = test.snapshot();
  assert(state.closeCount === 1 && state.blocked === '', 'short maximum-risk exit behavior is incorrect');
  console.log('PASS short-position maximum-risk exit');

  test = harness({ position: future({ last: 49850, pnl: -1000 }), flattenOnClose: false });
  await test.monitor();
  state = test.snapshot();
  assert(state.closeCount === 1 && /Risk exit was not verified flat/.test(state.blocked) && state.alertCount === 1, 'non-flat risk exit did not remain blocked and alert');
  console.log('PASS non-flat exit verification failure blocking');

  test = harness({ position: null, brokerError: new Error('simulated broker outage') });
  await test.monitor();
  state = test.snapshot();
  assert(state.closeCount === 0 && /simulated broker outage/.test(state.blocked) && state.alertCount === 1, 'broker failure did not block risk monitor and alert');
  console.log('PASS broker failure blocking and alert');
  console.log('LIVE_RISK_FAILURE_INJECTION=OK');
}

main().catch((error) => {
  console.error(`LIVE_RISK_FAILURE_INJECTION=FAILED:${error.message}`);
  process.exitCode = 1;
});
