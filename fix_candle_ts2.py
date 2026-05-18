c = open('/home/ubuntu/trading-bot/src/amina-live.ts', 'r', encoding='utf-8').read()

old = '''    const data = await kite.getHistoricalData(
      INSTRUMENT_TOKEN, "15minute",
      fmt(dayStart),
      fmt(nowMs - 60_000), // exclude the candle currently forming
      false
    ) as any[];
    return (data ?? []).map(enrich);'''

new = '''    const data = await kite.getHistoricalData(
      INSTRUMENT_TOKEN, "15minute",
      fmt(dayStart),
      fmt(nowMs - 60_000), // exclude the candle currently forming
      false
    ) as any[];
    const nowReal = Date.now();
    // Filter out any candle that hasn\'t completed yet (candle start + 15min > now)
    return (data ?? []).filter((c: any) => {
      try { return new Date(c.date).getTime() + 15 * 60 * 1000 < nowReal; }
      catch (_) { return true; }
    }).map(enrich);'''

if old in c:
    c = c.replace(old, new, 1)
    open('/home/ubuntu/trading-bot/src/amina-live.ts', 'w', encoding='utf-8').write(c)
    print('TS PATCHED')
else:
    print('NOT FOUND')
