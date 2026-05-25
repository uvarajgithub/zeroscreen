import subprocess

r = subprocess.run(['git', 'show', 'HEAD:src/server.ts'], capture_output=True, cwd='/root/zeroscreen')
d = r.stdout

idx = d.find(b'sig3-bot-status')
if idx == -1:
    print("sig3-bot-status NOT FOUND in git HEAD")
    # try looking for sig3 section
    idx2 = d.find(b'sig3-hdr')
    print("sig3-hdr at:", idx2)
    if idx2 != -1:
        print(d[idx2:idx2+2000].decode('utf-8','replace'))
else:
    # show from 200 before sig3-bot-status to 1500 after
    print(d[max(0,idx-200):idx+1500].decode('utf-8','replace'))
