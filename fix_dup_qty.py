with open('/home/ubuntu/trading-bot/src/index.ts', 'r') as f:
    c = f.read()

# Remove the duplicate qty I added after mode: config.mode,
OLD = '          strategy: ACTIVE_STRATEGY,\n          mode: config.mode,\n          qty: config.quantity,\n          inTrade: _inTrade,'
NEW = '          strategy: ACTIVE_STRATEGY,\n          mode: config.mode,\n          inTrade: _inTrade,'

if OLD in c:
    c = c.replace(OLD, NEW, 1)
    print('OK: removed duplicate qty after mode: config.mode')
else:
    n = c.count('qty: config.quantity,')
    print(f'Pattern not found. qty occurrences: {n}')
    # Show context around the line 2272 qty
    lines = c.split('\n')
    for i, ln in enumerate(lines, 1):
        if 'qty: config.quantity,' in ln:
            print(f'  Line {i}: {repr(ln)}')

with open('/home/ubuntu/trading-bot/src/index.ts', 'w') as f:
    f.write(c)
print('index.ts saved')
