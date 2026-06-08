import urllib.request
resp = urllib.request.urlopen('http://localhost:4000/signals').read()
print('Page size:', len(resp))
print('Has Jan 2021:', b'Jan 2021' in resp)
print('Has Jun 2026:', b'Jun 2026' in resp)
print('Has th-panel-m:', b'th-panel-m' in resp)
print('Has 5yr button:', b'th-btn-5y' in resp)
# Find monthly panel
idx = resp.find(b'th-panel-m')
if idx >= 0:
    print('Monthly panel context:', resp[idx:idx+200])
