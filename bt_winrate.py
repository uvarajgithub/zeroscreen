import json
bt = json.load(open('/home/ubuntu/trading-bot/5year-backtest-result.json'))
m = bt['monthly']
total_wins = sum(v.get('bbWins', 0) for v in m.values())
total_losses = sum(v.get('bbLosses', 0) for v in m.values())
total_trades = sum(v.get('bbTrades', 0) for v in m.values())
calc_wr = round(total_wins / total_trades * 100, 1) if total_trades else 0
print('From monthly: wins=%d losses=%d trades=%d winRate=%s%%' % (total_wins, total_losses, total_trades, calc_wr))
print('Stored winRate: %s%%  MATCH: %s' % (bt['winRate'], abs(calc_wr - bt['winRate']) < 0.2))
print('Total pts (monthly bbTotal sum):', round(sum(v.get('bbTotal', 0) for v in m.values()), 1))
print('Total pts (stored totals.bodyBreakout):', bt['totals']['bodyBreakout'])
print()
# Check if any monthly entry has unrealistic PnL vs trades
print('=== Monthly anomaly check (>300 pts/trade avg) ===')
for mk, mv in sorted(m.items()):
    trades = mv.get('bbTrades', 0)
    total = mv.get('bbTotal', 0)
    avg = round(total / trades, 1) if trades else 0
    if trades > 0 and abs(avg) > 300:
        print(f'  ANOMALY {mk}: {total} pts / {trades} trades = {avg} avg')
print('(no anomalies = all months reasonable)')
