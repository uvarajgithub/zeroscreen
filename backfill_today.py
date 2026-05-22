import json, os

trades_file = '/home/ubuntu/trading-bot/trades.json'
state_file  = '/home/ubuntu/trading-bot/amina-state.json'

with open(state_file) as f:
    s = json.load(f)

existing = json.load(open(trades_file)) if os.path.exists(trades_file) else []

already = [t for t in existing if t.get('date','').startswith(s['date'])]
print('already in trades.json for today:', len(already))

if not already and s.get('phase') == 'DONE' and s.get('t1Entry', 0) > 0:
    # T1 trade (CE, exited via tick SL)
    existing.append({
        'date': s['t1EntryTime'],
        'direction': s['t1Dir'],
        'symbol': s['t1Symbol'],
        'entryPrice': s['t1Entry'],
        'exitPrice': s['slClose'],
        'premiumEntry': s['t1EntryLTP'],
        'premiumExit': 0,
        'pnl': round(s['t1Pts'], 2),
        'pnlRs': s['t1Rs'],
        'reasonExit': 'T1_SL_TICK',
        'duration': 3208
    })
    # RE trade (PE, exited via tick SL)
    re_exit = s['reEntry'] - s['rePts'] if s['reDir'] == 'PE' else s['reEntry'] + s['rePts']
    existing.append({
        'date': s['reEntryTime'],
        'direction': s['reDir'],
        'symbol': s['reSymbol'],
        'entryPrice': s['reEntry'],
        'exitPrice': round(re_exit, 2),
        'premiumEntry': s['reEntryLTP'],
        'premiumExit': 0,
        'pnl': round(s['rePts'], 2),
        'pnlRs': s['reRs'],
        'reasonExit': 'RE_SL_TICK',
        'duration': 419
    })
    with open(trades_file, 'w') as f:
        json.dump(existing, f, indent=2)
    print('Added 2 trades for', s['date'])
else:
    print('Skipped')
