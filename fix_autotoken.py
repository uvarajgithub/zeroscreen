with open('/home/ubuntu/trading-bot/auto_token.js', 'r') as f:
    txt = f.read()

# Add Step 3b after the TOTP call: GET connect/login again to trigger OAuth redirect
old = "  if (!requestToken) {\n    throw new Error(`No request_token found.\\nStatus: ${r2.status}\\nLocation: ${loc}\\nBody: ${r2.body.slice(0,300)}`);\n  }"

new = """  // Step 3b: After 2FA success, GET connect/login again to trigger OAuth redirect to callback
  if (!requestToken) {
    console.log('[auto_token] Step 3b: Triggering OAuth redirect...');
    const r3 = await httpsGet(`/connect/login?api_key=${API_KEY}&v=3`, cookies);
    cookies = mergeCookies(cookies, r3.headers);
    const loc3 = r3.headers['location'] || '';
    const m3 = loc3.match(/request_token=([^&]+)/);
    if (m3) requestToken = m3[1];
    if (!requestToken) {
      const m4 = r3.body.match(/request_token=([A-Za-z0-9]+)/);
      if (m4) requestToken = m4[1];
    }
    if (!requestToken) {
      throw new Error(`No request_token found.\\nTOTP status: ${r2.status}\\nTOTP body: ${r2.body.slice(0,200)}\\nRedirect loc: ${loc3}\\nRedirect body: ${r3.body.slice(0,200)}`);
    }
  }"""

if old in txt:
    txt = txt.replace(old, new)
    with open('/home/ubuntu/trading-bot/auto_token.js', 'w') as f:
        f.write(txt)
    print('Patched OK - Step 3b added')
else:
    # Try to find what's there
    idx = txt.find('No request_token found')
    if idx >= 0:
        print('Context around error throw:')
        print(repr(txt[idx-200:idx+100]))
    else:
        print('ERROR: marker not found in file')
