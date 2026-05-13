#!/usr/bin/env python3
path = '/home/ubuntu/trading-bot/token-server.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

fixed = content.replace(
    'pm2 restart ${BOT_NAME} --update-env',
    'pm2 restart ${BOT_NAME}'
)

if fixed != content:
    with open(path, 'w', encoding='utf-8') as f:
        f.write(fixed)
    print('Patched: removed --update-env')
else:
    print('No change - checking if present:')
    print('has --update-env:', '--update-env' in content)
