with open('/root/zeroscreen/src/server.ts','rb') as f:
    c = f.read()

# Find the BHAV panel section - show KPI cards
idx = c.find(b'<!-- KPI Stats')
if idx == -1:
    idx = c.find(b'sig3-kpis')
print("KPI section at:", idx)
print(c[idx:idx+2000].decode('utf-8','replace'))
