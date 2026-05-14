import re

log = open('/home/ubuntu/trading-bot/logs/bot-out.log').read()

# Extract all TRAIL live P&L lines for May 13
lines = [l for l in log.split('\n') if '2026-05-13' in l and 'TRAIL:' in l and 'T:' in l and 'IN TRADE' in l]

trades = {}
for line in lines:
    m_pnl   = re.search(r'TRAIL: ([+-]\d+)pts', line)
    m_trade = re.search(r'TRAIL:.*?T:(\d+)/5', line)
    m_entry = re.search(r'Entry: ([\d.]+)', line)
    m_dir   = re.search(r'IN TRADE \((\w+)\)', line)
    if m_pnl and m_trade and m_entry:
        t = m_trade.group(1)
        pnl = int(m_pnl.group(1))
        entry = m_entry.group(1)
        key = t + '_' + entry
        if key not in trades:
            trades[key] = {'t': t, 'entry': entry, 'dir': m_dir.group(1) if m_dir else '?', 'max': pnl, 'min': pnl, 'count': 0}
        trades[key]['max'] = max(trades[key]['max'], pnl)
        trades[key]['min'] = min(trades[key]['min'], pnl)
        trades[key]['count'] += 1

print(f"{'Trade':<8} {'Dir':<4} {'Entry':<10} {'Peak MFE':<12} {'Max Adverse':<14} {'Samples'}")
print('-' * 58)
for key in sorted(trades.keys()):
    d = trades[key]
    print(f"T{d['t']:<7} {d['dir']:<4} {d['entry']:<10} +{d['max']:<11} {d['min']:<14} {d['count']}")
