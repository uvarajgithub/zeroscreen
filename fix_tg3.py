FILE = '/home/ubuntu/trading-bot/dist/src/index.js'
lines = open(FILE, encoding='utf-8').read().split('\n')
out = []
trail_done = False
l50o_done = False

T_INSERT = '            // Append per-trade rows to TRAIL (same as TICK TRAIL)\n            if (trailCtx && shadowTradeLog.length > 0) {\n                const _shRows = shadowTradeLog.slice(-9).map((t, i2) => {\n                    if (t.pts !== null && t.pts !== undefined) {\n                        const _s = t.pts >= 0 ? "+" : "";\n                        return `T${i2+1}: ${t.dir} → ${_s}${t.pts} pts`;\n                    } else if (_shInTrade && t.entryMs === shadowTradeLog[shadowTradeLog.length-1].entryMs) {\n                        const _u2 = _shDir==="CE" ? price-(t.entry||0) : (t.entry||0)-price;\n                        const _us2 = _u2>=0?"+":" ";\n                        return `T${i2+1}: ${t.dir} → open (${_us2}${_u2.toFixed(0)} pts)`;\n                    } else { return `T${i2+1}: ${t.dir} → (not logged)`; }\n                });\n                const _shUnr = _shInTrade ? (_shDir==="CE" ? price-_shEntry : _shEntry-price) : 0;\n                const _shTotal = shadowPnL + _shUnr;\n                trailCtx += "\\n" + _shRows.join("\\n") + "\\n─────────────────\\nTotal: " + (_shTotal>=0?"+":"") + _shTotal.toFixed(0) + " pts";\n            }'
L_INSERT = '            // Append per-trade rows to LOCK50 Old (same as TICK TRAIL)\n            if (scalp1TradeLog.length > 0) {\n                const _l50Rows = scalp1TradeLog.slice(-9).map((t, i3) => {\n                    if (t.pts !== null && t.pts !== undefined) {\n                        const _s = t.pts >= 0 ? "+" : "";\n                        return `T${i3+1}: ${t.dir} → ${_s}${t.pts} pts`;\n                    } else if (lock50ShadowState.inTrade && t.entryMs === scalp1TradeLog[scalp1TradeLog.length-1].entryMs) {\n                        const _u3 = lock50ShadowState.dir==="CE" ? price-(lock50ShadowState.entry||0) : (lock50ShadowState.entry||0)-price;\n                        const _us3 = _u3>=0?"+":" ";\n                        return `T${i3+1}: ${t.dir} → open (${_us3}${_u3.toFixed(0)} pts)`;\n                    } else { return `T${i3+1}: ${t.dir} → (not logged)`; }\n                });\n                const _l50Unr = lock50ShadowState.inTrade ? (lock50ShadowState.dir==="CE" ? price-(lock50ShadowState.entry||0) : (lock50ShadowState.entry||0)-price) : 0;\n                const _l50Total = scalp1PnL + _l50Unr;\n                lock50OldCtx += "\\n" + _l50Rows.join("\\n") + "\\n─────────────────\\nTotal: " + (_l50Total>=0?"+":"") + _l50Total.toFixed(0) + " pts";\n            }'

for line in lines:
    if not trail_done and '// Build LOCK50 Old shadow context (always visible)' in line:
        out.append(T_INSERT)
        trail_done = True
    if not l50o_done and '// Build LOCK50 per-trade log' in line:
        out.append(L_INSERT)
        l50o_done = True
    out.append(line)

print('TRAIL:', trail_done, '  LOCK50:', l50o_done)
if trail_done and l50o_done:
    open(FILE, 'w', encoding='utf-8').write('\n'.join(out))
    print('DONE')
else:
    for j,l in enumerate(lines):
        if 'Build LOCK50' in l or 'per-trade log' in l:
            print(j, l[:80])
