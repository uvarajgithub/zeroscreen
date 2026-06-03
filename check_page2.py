import urllib.request
resp = urllib.request.urlopen('http://localhost:4000/signals').read()
print('Size:', len(resp))
# Find trade history section
for needle in [b'th-panel', b'Trade History', b'MONTHLY', b'th-btn-', b'th-filter']:
    found = needle in resp
    print(f'{needle}: {found}')
# Print first 300 bytes
print('\nFirst 300:', resp[:300])
