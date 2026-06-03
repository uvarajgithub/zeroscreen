from pathlib import Path

p = Path('src/index.ts')
lines = p.read_text().splitlines()
del_start = None
for i, line in enumerate(lines):
    if line == '    log(" ENTRY_PRICE_UPDATE, { indexCandle: bc.close.toFixed(1), futuresFill: actualFillPrice.toFixed(1), diff: (actualFillPrice - bc.close).toFixed(1) });':
        del_start = i - 3
        break
if del_start is None:
    raise SystemExit('duplicate malformed block not found')
del lines[del_start:del_start + 5]
p.write_text('\n'.join(lines) + '\n')
print('removed duplicate malformed block')
