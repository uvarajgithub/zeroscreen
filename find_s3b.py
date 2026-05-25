with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

# Find full stab-wrap block
s3_start = c.find(b'<div class="stab-wrap">')
# Find end — next major comment after it
s3_end = c.find(b'\n    <!-- ', s3_start + 10)
print(f"stab-wrap: {s3_start}..{s3_end}")
print(c[s3_start:s3_end].decode('utf-8','replace'))
