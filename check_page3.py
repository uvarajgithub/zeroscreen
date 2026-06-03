import urllib.request
resp = urllib.request.urlopen('http://localhost:4000/signals').read()
print('Size:', len(resp))
# Show last 500 bytes
print('Last 500:', resp[-500:])
