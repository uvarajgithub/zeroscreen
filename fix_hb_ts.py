c = open('/home/ubuntu/trading-bot/src/amina-live.ts', 'r', encoding='utf-8').read()

old = """async function tick() {
  try {
    if (!isMarketOpen()) return;

    const price = await getCurrentPrice();"""

new = """async function tick() {
  try {
    if (!isMarketOpen()) {
      // Write pre-market heartbeat so dashboard shows Bot Online
      try {
        const existing = fs.existsSync(STATE_FILE) ? state : {};
        fs.writeFileSync('bot-heartbeat.json', JSON.stringify({
          at: new Date().toISOString(),
          strategy: 'AMINA 100',
          status: 'Pre-Market \u2014 Waiting',
          mode: process.env.MODE || 'PAPER',
          qty: parseInt(process.env.QUANTITY || '30'),
          slPts: SL_INITIAL,
          inTrade: false,
          tradeCount: state.tradeCount || 0,
        }));
      } catch(_) {}
      return;
    }

    const price = await getCurrentPrice();"""

if old in c:
    c = c.replace(old, new, 1)
    open('/home/ubuntu/trading-bot/src/amina-live.ts', 'w', encoding='utf-8').write(c)
    print('TS PATCHED')
else:
    print('NOT FOUND')
