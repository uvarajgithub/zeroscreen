with open('/root/zeroscreen/src/server.ts','rb') as f:
    c = f.read()

# Find ALL occurrences of sig3-kpis to compare admin vs guest
positions = []
start = 0
while True:
    idx = c.find(b'sig3-kpis', start)
    if idx == -1:
        break
    positions.append(idx)
    start = idx + 1

print(f"Found {len(positions)} occurrences of sig3-kpis at:", positions)

for pos in positions:
    print(f"\n=== At position {pos} ===")
    print(c[pos-100:pos+400].decode('utf-8','replace'))
    print("---")
