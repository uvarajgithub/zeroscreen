with open('/home/ubuntu/trading-bot/auto_token.js', 'r') as f:
    txt = f.read()

old = """    if (!requestToken) {
      throw new Error(`No request_token found.\\nTOTP status: ${r2.status}\\nTOTP body: ${r2.body.slice(0,200)}\\nRedirect loc: ${loc3}\\nRedirect body: ${r3.body.slice(0,200)}`);
    }
  }"""

new = """    // Step 3c: Follow /connect/finish to get request_token
    if (!requestToken && loc3.includes('/connect/finish')) {
      console.log('[auto_token] Step 3c: Following /connect/finish...');
      const finishPath = loc3.replace('https://kite.zerodha.com', '');
      const r4 = await httpsGet(finishPath, cookies);
      cookies = mergeCookies(cookies, r4.headers);
      const loc4 = r4.headers['location'] || '';
      const m5 = loc4.match(/request_token=([^&]+)/);
      if (m5) requestToken = m5[1];
      if (!requestToken) {
        const m6 = r4.body.match(/request_token=([A-Za-z0-9]+)/);
        if (m6) requestToken = m6[1];
      }
      if (!requestToken) {
        throw new Error(`No request_token found.\\nFinish status: ${r4.status}\\nFinish loc: ${loc4}\\nFinish body: ${r4.body.slice(0,300)}`);
      }
    } else if (!requestToken) {
      throw new Error(`No request_token found.\\nTOTP status: ${r2.status}\\nTOTP body: ${r2.body.slice(0,200)}\\nRedirect loc: ${loc3}\\nRedirect body: ${r3.body.slice(0,200)}`);
    }
  }"""

if old in txt:
    txt = txt.replace(old, new)
    with open('/home/ubuntu/trading-bot/auto_token.js', 'w') as f:
        f.write(txt)
    print('Patched OK - Step 3c added')
else:
    idx = txt.find('No request_token found')
    print('ERROR: marker not found, context:')
    print(repr(txt[idx-300:idx+100]) if idx >= 0 else 'not found at all')
