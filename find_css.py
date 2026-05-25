with open('/root/zeroscreen/src/server.ts', encoding='utf-8', errors='surrogatepass') as f:
    lines = f.readlines()
print("Total lines:", len(lines))
for i, l in enumerate(lines):
    if 'sig3-sub' in l or ('sig3-dot' in l and 'style' in l.lower() and i > 9000):
        print(i+1, repr(l[:130]))
