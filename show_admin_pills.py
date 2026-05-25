with open('/root/zeroscreen/src/server.ts','rb') as f:
    c = f.read()

# Find the admin page compact status pills bar
# The screenshot shows: "Bot Online | Token Valid | Heartbeat 5s ago | PAPER | Bot V"
# Search for patterns that might generate these pills
for needle in [b'Bot &bull;', b'Token &check;', b'Last seen', b'hm-pill', b'status-pill', b'bot-pills', b'hm-bar']:
    idx = c.find(needle)
    if idx != -1:
        print(f"\nFound {repr(needle)} at {idx}:")
        print(c[max(0,idx-50):idx+200].decode('utf-8','replace'))
        break

# Also look for the strategy tab cards (AMINA 100 / Trail / Lock50 / VMT)
print("\n\n--- Strategy summary cards ---")
idx2 = c.find(b'AMINA 100')
if idx2 != -1:
    print(f"AMINA 100 at {idx2}:")
    print(c[max(0,idx2-200):idx2+500].decode('utf-8','replace'))
