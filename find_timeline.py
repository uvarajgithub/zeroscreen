with open('/root/zeroscreen/src/server.ts','rb') as f:
    c = f.read()

# Look for the session timeline style in admin
for needle in [b'Session Timeline', b'session-timeline', b'C3+ Scan', b'Token Auto-Refresh', b'Bot Ready', b'LIVE v2.0']:
    idx = c.find(needle)
    if idx != -1:
        print(f"Found {repr(needle)} at {idx}:")
        print(c[max(0,idx-100):idx+200].decode('utf-8','replace'))
        print("---")

# Also check which route serves "Today's Session Timeline"
print("\n\nSearching for compact pill bar...")
for needle in [b'hm-pill', b'pill-bar', b'bot-online', b'Token &check;', b'Heartbeat']:
    idx = c.find(needle)
    if idx != -1:
        print(f"Found {repr(needle)} at {idx}:")
        print(c[max(0,idx-50):idx+200].decode('utf-8','replace'))
        print("---")
