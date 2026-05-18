c = open('/home/ubuntu/trading-bot/dist/src/amina-live.js', 'r', encoding='utf-8').read()

old = """        // --- 15-min candle Telegram update ---
        try {
          const _cDir = latest.close >= latest.open ? '\\U0001F7E2 Bullish' : '\\U0001F534 Bearish';
          const _cTime = (() => { try { const d = new Date(latest.key); const ist = new Date(d.toLocaleString('en-US',{timeZone:'Asia/Kolkata'})); const h=ist.getHours(),m=ist.getMinutes(); return (h>12?h-12:h)+':'+(m<10?'0'+m:m)+(h>=12?'PM':'AM'); } catch(_){return '';} })();
          let _scanMsg = '';
          if (state.phase === 'SCANNING') {
            if (candles.length === 1) _scanMsg = '\\nC1 locked. Watching for C2 breakout...';
            else _scanMsg = '\\nScanning for entry signal...';
          } else if (state.phase === 'IN_T1') {
            _scanMsg = `\\nIn T1 ${state.t1Dir} trade @ ${state.t1Entry}`;
          } else if (state.phase === 'IN_RE') {
            _scanMsg = `\\nIn Re-entry ${state.reDir} trade @ ${state.reEntry}`;
          }
          await (0, notifier_1.sendTelegram)(
            `\\U0001F4CA *AMINA 100 \\u2014 Candle ${_cTime}*\\n` +
            `${_cDir} | O:${latest.open.toFixed(0)} H:${latest.high.toFixed(0)} L:${latest.low.toFixed(0)} C:${latest.close.toFixed(0)}` +
            _scanMsg
          ).catch(() => {});
        } catch(_) {}"""

new = """        // --- 15-min candle Telegram update (same format as old strategy) ---
        try {
          const _colour = latest.close >= latest.open ? '\\U0001F7E2 Bullish' : '\\U0001F534 Bearish';
          const _ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
          // Strategy context
          let _stratCtx = '';
          if (state.phase === 'IN_T1' && state.t1Entry) {
            const _unr = state.t1Dir === 'CE' ? price - state.t1Entry : state.t1Entry - price;
            const _unrS = _unr >= 0 ? '+' : '';
            const _sl = state.t1Dir === 'CE' ? state.t1Entry - 60 : state.t1Entry + 60;
            _stratCtx = `\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\n` +
              `\\U0001F7E1 *AMINA 100 \\u00B7 ${state.t1Dir} In Trade*\\n` +
              `Entry: ${state.t1Entry.toFixed(0)}  \\u00B7  SL: \\u221260 pts\\n` +
              `${_unr >= 0 ? '\\U0001F7E2' : '\\U0001F534'} *${_unrS}${_unr.toFixed(0)} pts*  \\u00B7  Day: ${state.dayPts >= 0 ? '+' : ''}${state.dayPts.toFixed(0)} pts`;
          } else if (state.phase === 'IN_RE' && state.reEntry) {
            const _unr = state.reDir === 'CE' ? price - state.reEntry : state.reEntry - price;
            const _unrS = _unr >= 0 ? '+' : '';
            _stratCtx = `\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\n` +
              `\\U0001F7E1 *AMINA 100 \\u00B7 ${state.reDir} Re-Entry*\\n` +
              `Entry: ${state.reEntry.toFixed(0)}  \\u00B7  SL: \\u221260 pts\\n` +
              `${_unr >= 0 ? '\\U0001F7E2' : '\\U0001F534'} *${_unrS}${_unr.toFixed(0)} pts*  \\u00B7  Day: ${state.dayPts >= 0 ? '+' : ''}${state.dayPts.toFixed(0)} pts`;
          } else if (state.phase === 'DONE') {
            _stratCtx = `\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\n` +
              `\\u2705 *AMINA 100 \\u00B7 Done for Day*\\n` +
              `\\U0001F4C8 *${state.dayPts >= 0 ? '+' : ''}${state.dayPts.toFixed(0)} pts*  (\\u20B9${state.dayRs >= 0 ? '+' : ''}${state.dayRs.toFixed(0)})`;
          } else {
            // SCANNING - show C1 level and what to watch for
            const _c1 = candles[0];
            let _watchLine = '';
            if (_c1) {
              const _ceT = _c1.high.toFixed(0);
              const _peT = _c1.low.toFixed(0);
              const _ceD = (price - _c1.high).toFixed(0);
              const _peD = (_c1.low - price).toFixed(0);
              _watchLine = `\\U0001F50D Watching: CE > *${_ceT}* (${_ceD > 0 ? _ceD+' pts ahead' : Math.abs(_ceD)+' pts away'})  |  PE < *${_peT}* (${_peD > 0 ? _peD+' pts ahead' : Math.abs(_peD)+' pts away'})`;
            }
            _stratCtx = `\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\n` +
              `\\U0001F6A6 *AMINA 100 \\u00B7 Scanning* (${candles.length} candles)\\n` +
              (_watchLine ? _watchLine + '\\n' : '') +
              `Live: *${price.toFixed(0)}*  \\u00B7  Day: ${state.dayPts >= 0 ? '+' : ''}${state.dayPts.toFixed(0)} pts`;
          }
          await (0, notifier_1.sendTelegram)(
            `\\U0001F56F *15-Min Candle*  ${_ist}  ${_colour}\\n` +
            `O: ${latest.open.toFixed(0)}  H: ${latest.high.toFixed(0)}  L: ${latest.low.toFixed(0)}  C: ${latest.close.toFixed(0)}\\n` +
            _stratCtx +
            `\\n\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\n` +
            `[\\U0001F511 Token](https://139-59-18-52.nip.io/login)  \\u00B7  [\\U0001F4C8 Dashboard](https://139-59-18-52.nip.io/signals)`
          ).catch(() => {});
          // Write lastCandle to heartbeat for dashboard
          try {
            const _hbRaw = fs_1.default.existsSync('bot-heartbeat.json') ? fs_1.default.readFileSync('bot-heartbeat.json', 'utf-8') : '{}';
            const _hb = JSON.parse(_hbRaw);
            _hb.lastCandle = { time: _ist, open: latest.open, high: latest.high, low: latest.low, close: latest.close, colour: latest.close >= latest.open ? 'bull' : 'bear' };
            fs_1.default.writeFileSync('bot-heartbeat.json', JSON.stringify(_hb));
          } catch(_) {}
        } catch(_) {}"""

if old in c:
    c = c.replace(old, new, 1)
    open('/home/ubuntu/trading-bot/dist/src/amina-live.js', 'w', encoding='utf-8').write(c)
    print('PATCHED')
else:
    print('NOT FOUND')
    # find what is there
    idx = c.find('15-min candle Telegram update')
    if idx >= 0:
        print('Found at', idx, repr(c[idx:idx+100]))
