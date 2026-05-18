c = open('/home/ubuntu/trading-bot/dist/src/amina-live.js', 'r', encoding='utf-8').read()

old = """async function tick() {
    try {
        if (!isMarketOpen())
            return;
        const price = await (0, market_1.getCurrentPrice)();"""

new = """async function tick() {
    try {
        if (!isMarketOpen()) {
            // Write pre-market heartbeat so dashboard shows Bot Online
            try {
                const fs = require('fs');
                const existing = fs.existsSync('bot-heartbeat.json') ? JSON.parse(fs.readFileSync('bot-heartbeat.json','utf-8')) : {};
                fs.writeFileSync('bot-heartbeat.json', JSON.stringify({
                    ...existing,
                    at: new Date().toISOString(),
                    strategy: 'AMINA 100',
                    status: 'Pre-Market \u2014 Waiting',
                    mode: process.env.MODE || 'PAPER',
                    qty: parseInt(process.env.QUANTITY || '30'),
                    slPts: 60,
                    inTrade: false,
                    tradeCount: state.tradeCount || 0,
                }));
            } catch(_) {}
            return;
        }
        const price = await (0, market_1.getCurrentPrice)();"""

if old in c:
    c = c.replace(old, new, 1)
    open('/home/ubuntu/trading-bot/dist/src/amina-live.js', 'w', encoding='utf-8').write(c)
    print('PATCHED')
else:
    print('NOT FOUND')
