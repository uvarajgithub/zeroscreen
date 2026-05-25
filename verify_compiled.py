with open('/root/zeroscreen/dist/server.js','r',errors='replace') as f:
    txt=f.read()

checks = [
    ('BHAV V3', 'P1 BHAV V3 subtitle'),
    ('Max 5 trades/day', 'P2 row1 expanded'),
    ('5yr Backtest', 'P3 row3 backtest'),
    ('bhavPrevDayHigh', 'P3/P4 live PDH'),
    ('sig3-hm-grid', 'P6 hm grid HTML'),
    ('sig3-hm-card', 'P5 hm CSS'),
    ('s3hm-bot', 'P6 bot heartbeat card'),
    ('sig3hmBlink', 'P5 CSS animation'),
    ('_sig3Refresh', 'P7 JS refresh'),
]

for needle, label in checks:
    found = needle in txt
    print(f"{'OK' if found else 'MISS'} - {label}: {needle!r}")
