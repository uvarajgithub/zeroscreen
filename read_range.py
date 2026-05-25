import subprocess

raw = subprocess.check_output(['cat', '/home/ubuntu/trading-bot/src/index.ts'])
lines = raw.decode('utf-8', 'ignore').splitlines()
# Print lines 870-1060
for i, l in enumerate(lines, 1):
    if 1060 <= i <= 1340:
        print(f'{i}: {l}')
