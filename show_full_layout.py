import subprocess

r = subprocess.run(['git', 'show', 'HEAD:src/server.ts'], capture_output=True, cwd='/root/zeroscreen')
d = r.stdout

# Find the sig3 section start (the admin bot dashboard)
idx_hdr = d.find(b'sig3-hdr')
# Show from sig3-hdr to 5000 bytes ahead
print("=== FULL SIG3 LAYOUT (git HEAD) ===")
print(d[idx_hdr:idx_hdr+5000].decode('utf-8','replace'))
