import urllib.request
resp = urllib.request.urlopen('http://localhost:4000/signals').read()
print('Page size:', len(resp))
for needle in [b"Jan '21", b"Jun '26", b'sig3-yr', b'_sigDrill', b'_sigYr', b'_futDly', b'sig3-i-2021-01']:
    print(f'{needle.decode()}: {needle in resp}')
