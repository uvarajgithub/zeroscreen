with open('/root/zeroscreen/src/server.ts', encoding='utf-8', errors='surrogatepass') as f:
    lines = f.readlines()
for i in range(9993, 10015):
    print(i+1, repr(lines[i][:130]))
