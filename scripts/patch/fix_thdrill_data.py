#!/usr/bin/env python3
"""
Fix _thDrill to use its OWN embedded _thDly data instead of relying
on window._futDly which is defined in a different, later script block.
Embed window._thDly = {...} inside the same IIFE, right before _thDrill.
"""
import json

f = '/root/zeroscreen/dist/server.js'
data = open(f, 'rb').read()

# ── 1. Load daily data from futures-daily-results.json ───────────────────────
raw = json.load(open('/home/ubuntu/trading-bot/futures-daily-results.json'))
daily_flat = raw['daily']  # {date: {grossPts, netRs, trades}, ...}

# Build monthly → daily dict
by_month = {}
for date, v in daily_flat.items():
    mo = date[:7]
    if mo not in by_month:
        by_month[mo] = {}
    by_month[mo][date] = v

print('Months in _thDly:', len(by_month))
print('2026-05 days:', len(by_month.get('2026-05', {})))
thDly_json = json.dumps(by_month, separators=(',', ':'))

# ── 2. Replace _thDrill's data source ────────────────────────────────────────
OLD = b"          var days=(window._futDly&&window._futDly[mo])||{};"
NEW = b"          var days=(window._thDly&&window._thDly[mo])||{};"

if OLD not in data:
    print('ERROR: old pattern not found'); exit(1)
data = data.replace(OLD, NEW, 1)

# ── 3. Inject window._thDly right before window._thDrill inside the IIFE ─────
anchor = b'        window._thDrill=function(mo){'
inject = ('        window._thDly=' + thDly_json + ';\n').encode()

if anchor not in data:
    print('ERROR: _thDrill anchor not found'); exit(1)
data = data.replace(anchor, inject + anchor, 1)

open(f, 'wb').write(data)
print('DONE, size:', len(data))

# Verify
d2 = open(f, 'rb').read()
print('_thDly present:', b'window._thDly=' in d2)
print('_thDrill uses _thDly:', b'window._thDly&&window._thDly[mo]' in d2)
print('still has _futDly ref in thDrill:', b'_futDly' in d2[d2.find(b'window._thDrill'):d2.find(b'window._thDrill')+2000])
