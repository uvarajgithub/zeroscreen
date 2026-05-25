#!/usr/bin/env python3
"""Second-pass fix: remove remaining straggler shadow/scalp1/lock50TradeLog references."""

with open('/home/ubuntu/trading-bot/src/index.ts', 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()

# Fix printStatus() — lines ~627, 633
# Remove shadowSign line and replace else branch with BHAV V3 only output
new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    # Remove the shadowSign line
    if 'const shadowSign = shadowPnL' in line:
        i += 1
        continue
    # Replace the LOCK50 console.log else branch with nothing (it's after the BHAV_V3 if block)
    if 'LOCK50:' in line and 'TRAIL:' in line and 'shadowSign' in line:
        i += 1
        continue
    # Remove "// Reset SCALP1 shadow state" section (lines 822-827)
    if '// Reset SCALP1 shadow state' in line:
        # skip this line and the next 5 (scalp1PnL/Trades/Wins/Losses/TradeLog)
        i += 1
        count = 0
        while i < len(lines) and count < 6:
            if any(x in lines[i] for x in ['scalp1PnL', 'scalp1Trades', 'scalp1Wins', 'scalp1Losses', 'scalp1TradeLog']):
                i += 1
                count += 1
            else:
                break
        continue
    # Remove lock50TradeLog.push(...) lines (legacy HYBRID_REVERSE only)
    if 'lock50TradeLog.push(' in line:
        i += 1
        continue
    # Remove lock50TradeLog = [] reset lines
    if 'lock50TradeLog' in line and '= []' in line:
        i += 1
        continue
    # Remove shadowPrevCandle assignments in hybrid seeding block
    if 'shadowPrevCandle' in line and ('= {' in line or '= null' in line):
        i += 1
        continue
    new_lines.append(line)
    i += 1

content = "".join(new_lines)

with open('/home/ubuntu/trading-bot/src/index.ts', 'w', encoding='utf-8', errors='replace') as f:
    f.write(content)

print("Done! Second-pass complete.")

# Verify no more straggler references
remaining = []
for term in ['shadowPnL', 'shadowTrades', 'shadowWins', 'shadowLosses', 'shadowSign',
             'shadowPrevCandle', 'shadowTradeLog', 'shadowState', 'shadowInTrade',
             'scalp1PnL', 'scalp1Trades', 'scalp1Wins', 'scalp1Losses', 'scalp1TradeLog',
             'scalp1InTrade', 'scalp1Dir', 'scalp1Entry', 'scalp1SL', 'scalp1Target',
             'scalp1WaitSignal', 'scalp1SignalDir', 'scalp1WaitExpiry', 'scalp1Last1mKey',
             'lock50TradeLog']:
    for j, line in enumerate(content.split('\n'), 1):
        if term in line:
            remaining.append(f"  line {j}: [{term}] {line.strip()}")

if remaining:
    print(f"\nStill remaining ({len(remaining)}):")
    for r in remaining:
        print(r)
else:
    print("\nClean! No straggler references remain.")
