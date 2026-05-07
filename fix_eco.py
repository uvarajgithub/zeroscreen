path = '/home/ubuntu/trading-bot/ecosystem.config.js'
content = open(path).read()
old = "cron_restart: '30 3 * * 1-5',"
new = "cron_restart: '30 3 * * 1-5',\n      stop_exit_codes: [0],"
if 'stop_exit_codes' not in content:
    content = content.replace(old, new)
    open(path, 'w').write(content)
    print('Added stop_exit_codes')
else:
    print('Already present')
