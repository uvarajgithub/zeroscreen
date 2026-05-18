c = open('/home/ubuntu/trading-bot/src/amina-live.ts', 'r', encoding='utf-8').read()

old = '''    _lastKey = latest.key;
    state.lastCandleKey = latest.key;
    log("NEW_CANDLE", { key: latest.key, o: latest.open, h: latest.high, l: latest.low, c: latest.close, phase: state.phase });

    // \u2500\u2500 SCANNING'''

new = '''    _lastKey = latest.key;
    state.lastCandleKey = latest.key;
    log("NEW_CANDLE", { key: latest.key, o: latest.open, h: latest.high, l: latest.low, c: latest.close, phase: state.phase });

    // --- 15-min candle Telegram update ---
    try {
      const _cDir = latest.close >= latest.open ? '\\U0001F7E2 Bullish' : '\\U0001F534 Bearish';
      const _cTime = (() => { try { const d = new Date(latest.key); const ist = new Date(d.toLocaleString('en-US',{timeZone:'Asia/Kolkata'})); const h=ist.getHours(),m=ist.getMinutes(); return (h>12?h-12:h)+':'+(m<10?'0'+m:m)+(h>=12?'PM':'AM'); } catch(_){return '';} })();
      let _scanMsg = '';
      if (state.phase === 'SCANNING') {
        _scanMsg = candles.length === 1 ? '\\nC1 locked. Watching for C2 breakout...' : '\\nScanning for entry signal...';
      } else if (state.phase === 'IN_T1') {
        _scanMsg = `\\nIn T1 ${state.t1Dir} trade @ ${state.t1Entry}`;
      } else if (state.phase === 'IN_RE') {
        _scanMsg = `\\nIn Re-entry ${state.reDir} trade @ ${state.reEntry}`;
      }
      await sendTelegram(
        `\\U0001F4CA *AMINA 100 \\u2014 Candle ${_cTime}*\\n` +
        `${_cDir} | O:${latest.open.toFixed(0)} H:${latest.high.toFixed(0)} L:${latest.low.toFixed(0)} C:${latest.close.toFixed(0)}` +
        _scanMsg
      ).catch(() => {});
    } catch(_) {}

    // \u2500\u2500 SCANNING'''

if old in c:
    c = c.replace(old, new, 1)
    open('/home/ubuntu/trading-bot/src/amina-live.ts', 'w', encoding='utf-8').write(c)
    print('TS PATCHED')
else:
    print('NOT FOUND')
