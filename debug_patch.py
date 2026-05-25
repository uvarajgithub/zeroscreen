import re
path = "/home/ubuntu/trading-bot/src/index.ts"
with open(path, encoding='utf-8-sig') as f:
    content = f.read()

idx = content.find('LOCK50_TG_LABEL')
if idx < 0:
    # try without BOM
    with open(path, encoding='utf-8') as f:
        content = f.read()
    idx = content.find('LOCK50_TG_LABEL')

print("Index of LOCK50_TG_LABEL:", idx)
if idx >= 0:
    seg = content[idx:idx+300]
    print("Repr:", repr(seg))
    # Test basic match
    m1 = re.search(r'LOCK50_TG_LABEL', content)
    print("Basic match:", m1 is not None)
    m2 = re.search(r'LOCK50_TG_LABEL\n', content)
    print("With newline:", m2 is not None)
    m3 = re.search(r'LOCK50_TG_LABEL\n      if', content)
    print("With if:", m3 is not None)
    # Detect dashes
    m4 = re.search(r'LOCK50_TG_LABEL\n      if \(strategyCtx\) strategyCtx = `(\S+?)\\n', content)
    print("Dashes match:", m4 is not None)
    if m4:
        print("DASHES:", repr(m4.group(1)))
    # Try full match
    if m4:
        DASHES = m4.group(1)
        full = re.search(r'      // LOCK50_TG_LABEL\n      if \(strategyCtx\) strategyCtx = `' + re.escape(DASHES) + r'[^`]+`[^;]+;', content)
        print("Full match:", full is not None)
