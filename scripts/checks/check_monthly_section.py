import urllib.request
resp = urllib.request.urlopen('http://localhost:4000/signals').read()
idx = resp.find(b'MONTHLY P&L')
print(resp[idx-50:idx+600])
