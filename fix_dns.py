"""Fix ecosystem.config.js to add NODE_OPTIONS=--dns-result-order=ipv4first"""
path = '/home/ubuntu/trading-bot/ecosystem.config.js'
with open(path, 'r') as f:
    content = f.read()

old = "      env: {\n        NODE_ENV: 'production',\n      },\n\n      // Cron: auto-restart bot at 9:00 AM IST"
new = "      env: {\n        NODE_ENV: 'production',\n        NODE_OPTIONS: '--dns-result-order=ipv4first',\n      },\n\n      // Cron: auto-restart bot at 9:00 AM IST"

if old in content:
    content = content.replace(old, new, 1)
    with open(path, 'w') as f:
        f.write(content)
    print('DONE - NODE_OPTIONS added to trading-bot env')
else:
    # show surrounding context
    idx = content.find('cron_restart')
    print('Pattern not found. Context around cron_restart:')
    print(repr(content[max(0,idx-200):idx+50]))
