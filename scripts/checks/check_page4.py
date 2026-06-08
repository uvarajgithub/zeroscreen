import urllib.request
resp = urllib.request.urlopen('http://localhost:4000/signals').read()
# Search for trade history related content
for needle in [b'MONTHLY', b'Monthly', b'Trade', b'th-', b'Tab', b'btn-', b'panel']:
    idx = resp.find(needle)
    if idx >= 0:
        print(f'{needle} at {idx}:', resp[idx:idx+80])
    else:
        print(f'{needle}: NOT FOUND')
