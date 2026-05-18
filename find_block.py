c = open('/home/ubuntu/trading-bot/dist/src/amina-live.js', 'r', encoding='utf-8').read()

old = """        // --- 15-min candle Telegram update ---
        try {
          const _cDir = latest.close >= latest.open ? '\u{1F7E2} Bullish' : '\u{1F534} Bearish';
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
            `\u{1F4C8} *AMINA 100 \u2014 Candle ${_cTime}*\\n` +
            `${_cDir} | O:${latest.open.toFixed(0)} H:${latest.high.toFixed(0)} L:${latest.low.toFixed(0)} C:${latest.close.toFixed(0)}` +
            _scanMsg
          ).catch(() => {});
        } catch(_) {}"""

# find actual bytes
idx = c.find('// --- 15-min candle Telegram update ---')
if idx < 0:
    print('block not found'); exit()

end = c.find("        } catch(_) {}\n        // \u2500\u2500 SCANNING", idx)
if end < 0:
    # find next comment after the try block
    end = c.find('\n        // \u2500\u2500 SCANNING', idx)

old_actual = c[idx:end]
print('OLD BLOCK:')
print(repr(old_actual[:200]))
