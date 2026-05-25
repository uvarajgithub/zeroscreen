with open('/root/zeroscreen/dist/server.js.bak.may25-good','rb') as f:
    d = f.read()

checks = [b'Session Timeline', b'AMINA 100', b'Heartbeat', b'sig3-bot-status', b'HYBRID_REVERSE', b'BHAV', b'Bot &bull;', b'Token &check;']
for ch in checks:
    print(ch.decode('utf-8','replace'), ':', 'FOUND' if ch in d else 'MISSING')
print('Size:', len(d))
