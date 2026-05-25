#!/usr/bin/env python3
path = '/home/ubuntu/trading-bot/dist/src/index.js'
with open(path, 'r') as f:
    c = f.read()

# Remove fetch block at reset
c = c.replace(
    '        // Fetch previous day high/low for PDH/PDL context (non-blocking)\n'
    '        pdhHigh = 0;\n'
    '        pdhLow = 0;\n'
    '        pdhContext = "NEUTRAL";\n'
    '        (0, market_1.getPrevDayHL)().then(({ high, low }) => {\n'
    '            pdhHigh = high;\n'
    '            pdhLow = low;\n'
    '            log("PDH_FETCHED", { pdhHigh, pdhLow });\n'
    '        }).catch(e => log("PDH_FETCH_FAIL", { error: String(e) }));\n',
    '')

# Remove BEARISH CE block
c = c.replace(
    '            if (pdhContext === "BEARISH" && sig.dir === "CE") {\n'
    '                log("PDH_BLOCKED", { dir: sig.dir, pdhContext, price: sig.price });\n'
    '                break;\n'
    '            }\n',
    '')

remaining = c.count('pdhHigh') + c.count('PDH_BLOCKED') + c.count('getPrevDayHL')
print('PDH refs remaining:', remaining)
with open(path, 'w') as f:
    f.write(c)
print('Done')
