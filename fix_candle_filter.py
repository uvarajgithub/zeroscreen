c = open('/home/ubuntu/trading-bot/dist/src/amina-live.js', 'r', encoding='utf-8').read()

old = '''        const data = await kite.getHistoricalData(INSTRUMENT_TOKEN, "15minute", fmt(dayStart), fmt(nowMs - 60000), // exclude the candle currently forming
        false);
        return (data ?? []).map(enrich);'''

new = '''        const data = await kite.getHistoricalData(INSTRUMENT_TOKEN, "15minute", fmt(dayStart), fmt(nowMs - 60000), // exclude the candle currently forming
        false);
        const nowReal = Date.now();
        // Filter out any candle that hasn't completed yet (candle start + 15min > now)
        return (data ?? []).filter(c => {
            try { return new Date(c.date).getTime() + 15 * 60 * 1000 < nowReal; }
            catch (_) { return true; }
        }).map(enrich);'''

if old in c:
    c = c.replace(old, new, 1)
    open('/home/ubuntu/trading-bot/dist/src/amina-live.js', 'w', encoding='utf-8').write(c)
    print('PATCHED dist/src/amina-live.js')
else:
    print('NOT FOUND - searching...')
    idx = c.find('getHistoricalData(INSTRUMENT_TOKEN')
    print(repr(c[idx:idx+200]))
