import codecs
with codecs.open('/root/zeroscreen/src/scheduler.ts', encoding='utf-16') as f:
    c = f.read()
if '18 hours' in c:
    print('FIX APPLIED')
elif "date(published_at) = date" in c:
    print('OLD BUG STILL PRESENT')
else:
    print('UNKNOWN STATE')
    # Try to fix inline
    old = "status='active' AND date(published_at) = date('now','localtime')"
    new = "status='active' AND published_at >= datetime('now','localtime','-18 hours')"
    c2 = c.replace(old, new, 1)
    if c2 != c:
        with open('/root/zeroscreen/src/scheduler.ts', 'w', encoding='utf-8') as out:
            out.write(c2)
        print('FIXED AND CONVERTED TO UTF-8')
