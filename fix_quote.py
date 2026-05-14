#!/usr/bin/env python3
# Fix unclosed string in sh-trail-today-count and sh-l50o-today-count lines
# Bug: +');\n  (missing closing quote before semicolon)
# Fix: +')';\n  (proper close)
FILE = '/root/zeroscreen/dist/server.js'
src = open(FILE, 'rb').read()
fixes = 0

# The bad sequence at end of today-count line: b'+\x27)\x3b\x0a' = +');\n
# Should be: b"+');\n" -> b"+')';\n"

BAD  = b"sh-trail-today-count')).textContent='('+shTr+' trade'+(shTr!==1?'s':'')+');\n"
GOOD = b"sh-trail-today-count')).textContent='('+shTr+' trade'+(shTr!==1?'s':'')+')';\n"
if BAD in src:
    src = src.replace(BAD, GOOD, 1); fixes+=1; print("OK: TRAIL today-count fixed")
else:
    # Try alternate (with single close-paren match)
    BAD2  = b"shTr+' trade'+(shTr!==1?'s':'')+');\n"
    GOOD2 = b"shTr+' trade'+(shTr!==1?'s':'')+')';\n"
    if BAD2 in src:
        src = src.replace(BAD2, GOOD2, 1); fixes+=1; print("OK: TRAIL today-count fixed (alt)")
    else:
        print("WARN: TRAIL today-count not matched; searching...")
        idx = src.find(b'sh-trail-today-count')
        if idx > 0:
            le = src.find(b'\n', idx)
            print(repr(src[le-20:le+2]))

BAD3  = b"sh-l50o-today-count')).textContent='('+s1Tr+' trade'+(s1Tr!==1?'s':'')+');\n"
GOOD3 = b"sh-l50o-today-count')).textContent='('+s1Tr+' trade'+(s1Tr!==1?'s':'')+')';\n"
if BAD3 in src:
    src = src.replace(BAD3, GOOD3, 1); fixes+=1; print("OK: LOCK50 today-count fixed")
else:
    BAD4  = b"s1Tr+' trade'+(s1Tr!==1?'s':'')+');\n"
    GOOD4 = b"s1Tr+' trade'+(s1Tr!==1?'s':'')+')';\n"
    if BAD4 in src:
        src = src.replace(BAD4, GOOD4, 1); fixes+=1; print("OK: LOCK50 today-count fixed (alt)")
    else:
        print("WARN: LOCK50 today-count not matched")
        idx = src.find(b'sh-l50o-today-count')
        if idx > 0:
            le = src.find(b'\n', idx)
            print(repr(src[le-20:le+2]))

open(FILE, 'wb').write(src)
print(f"DONE — {fixes} fixes")
