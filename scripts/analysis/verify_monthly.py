import urllib.request
resp = urllib.request.urlopen('http://localhost:4000/signals').read()
print('Page size:', len(resp))
for needle in [b"Jan '21", b"Jun '26", b"May '21", b'sig3-tw']:
    print(f"{needle}: {needle in resp}")
# Show a sample
idx = resp.find(b"Jan '21")
if idx >= 0: print('Sample:', resp[idx:idx+150])
