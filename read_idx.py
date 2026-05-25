import subprocess

raw = subprocess.check_output(['iconv', '-f', 'utf-16', '-t', 'utf-8',
                               '/home/ubuntu/trading-bot/src/index.ts'])
lines = raw.decode('utf-8', 'ignore').splitlines()
keywords = ['hybridState', 'processHybrid', 'createHybrid', 'trailLock50',
            'trailDefault', 'runHybrid', '9:15', 'bhavState',
            'prevDayCandle', 'runBhav', 'hybridPrev', 'hybridLast',
            'isInTrade', 'entryPrice', 'tradeSide']
for i, l in enumerate(lines, 1):
    if any(kw in l for kw in keywords):
        print(f'{i}: {l[:130]}')
