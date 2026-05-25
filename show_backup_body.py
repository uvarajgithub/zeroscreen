with open('/root/zeroscreen/dist/server.js.bak.may25-good','rb') as f:
    d = f.read()

idx = d.find(b'Live Bot Dashboard')
# Show 200 bytes before (title) and find the health bar HTML
print("=== From Live Bot Dashboard title ===")
# Skip CSS style section - find first HTML occurrence
pos = idx
while pos != -1:
    if b'<title>' in d[max(0,pos-10):pos+20]:
        break
    pos = d.find(b'Live Bot Dashboard', pos+1)
print(f"Title at: {pos}")
if pos != -1:
    # Show from 2KB after (past CSS, into HTML body)
    print(d[pos:pos+200].decode('utf-8','replace'))

# Find the main HTML body after </head>
body_idx = d.find(b'</head>', pos)
print(f"\n</head> at: {body_idx}")
if body_idx != -1:
    print(d[body_idx:body_idx+3000].decode('utf-8','replace'))
