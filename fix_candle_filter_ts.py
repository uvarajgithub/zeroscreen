c = open('/home/ubuntu/trading-bot/src/amina-live.ts', 'r', encoding='utf-8').read()

old = '''        const data = await kite.getHistoricalData(INSTRUMENT_TOKEN, "15minute", fmt(dayStart), fmt(nowMs - 60000), // exclude the candle currently forming
      false);
    return (data ?? []).map(enrich);'''

if old in c:
    new = '''        const data = await kite.getHistoricalData(INSTRUMENT_TOKEN, "15minute", fmt(dayStart), fmt(nowMs - 60000), // exclude the candle currently forming
      false);
    const nowReal = Date.now();
    // Filter out any candle that hasn\'t completed yet (candle start + 15min > now)
    return (data ?? []).filter((c: any) => {
      try { return new Date(c.date).getTime() + 15 * 60 * 1000 < nowReal; }
      catch (_) { return true; }
    }).map(enrich);'''
    c = c.replace(old, new, 1)
    open('/home/ubuntu/trading-bot/src/amina-live.ts', 'w', encoding='utf-8').write(c)
    print('PATCHED src/amina-live.ts')
else:
    # try to find the actual text
    idx = c.find('getHistoricalData(INSTRUMENT_TOKEN')
    if idx >= 0:
        print('Found at', idx, ':', repr(c[idx:idx+200]))
    else:
        print('NOT FOUND')
