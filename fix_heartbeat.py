#!/usr/bin/env python3
"""Fix scalp1InTrade undefined references in both heartbeat blocks"""

content = open('/home/ubuntu/trading-bot/dist/src/index.js', encoding='utf-8').read()

# Block 1: setInterval heartbeat (4-space indent)
OLD1 = (
    '                    scalp1InTrade,\n'
    '                    scalp1Dir: scalp1InTrade ? scalp1Dir : null,\n'
    '                    scalp1Entry: scalp1InTrade ? scalp1Entry : null,\n'
    '                    scalp1SL: scalp1InTrade ? scalp1SL : null,\n'
    '                    scalp1Target: scalp1InTrade ? scalp1Target : null,'
)
NEW1 = (
    '                    scalp1InTrade: lock50ShadowState.inTrade,\n'
    '                    scalp1Dir: lock50ShadowState.inTrade ? lock50ShadowState.dir : null,\n'
    '                    scalp1Entry: lock50ShadowState.inTrade ? lock50ShadowState.entry : null,\n'
    '                    scalp1SL: lock50ShadowState.inTrade ? lock50ShadowState.sl : null,\n'
    '                    scalp1Target: null,'
)

# Block 2: error handler heartbeat (5-space indent)
OLD2 = (
    '                        scalp1InTrade,\n'
    '                        scalp1Dir: scalp1InTrade ? scalp1Dir : null,\n'
    '                        scalp1Entry: scalp1InTrade ? scalp1Entry : null,\n'
    '                        scalp1SL: scalp1InTrade ? scalp1SL : null,\n'
    '                        scalp1Target: scalp1InTrade ? scalp1Target : null,'
)
NEW2 = (
    '                        scalp1InTrade: lock50ShadowState.inTrade,\n'
    '                        scalp1Dir: lock50ShadowState.inTrade ? lock50ShadowState.dir : null,\n'
    '                        scalp1Entry: lock50ShadowState.inTrade ? lock50ShadowState.entry : null,\n'
    '                        scalp1SL: lock50ShadowState.inTrade ? lock50ShadowState.sl : null,\n'
    '                        scalp1Target: null,'
)

c1 = content.count(OLD1)
c2 = content.count(OLD2)
print(f'Block1 count: {c1}  Block2 count: {c2}')

if c1 == 1 and c2 == 1:
    content = content.replace(OLD1, NEW1).replace(OLD2, NEW2)
    open('/home/ubuntu/trading-bot/dist/src/index.js', 'w', encoding='utf-8').write(content)
    print('DONE - both blocks fixed')
else:
    print('ERROR - counts wrong, NOT patching')
    import sys; sys.exit(1)
