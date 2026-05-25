with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    cur = f.read()

# Replace CSS variable references in the hb-* CSS block with hardcoded values
replacements = [
    (b'background:var(--card);border:1px solid var(--border-c);', 
     b'background:#1e293b;border:1px solid #334155;'),
    (b'color:var(--green)', b'color:#10b981'),
    (b'color:var(--amber)', b'color:#f59e0b'),
    (b'color:var(--red)',   b'color:#ef4444'),
    (b'color:var(--muted)', b'color:#94a3b8'),
    (b'color:var(--text-muted)', b'color:#94a3b8'),
]

for old, new in replacements:
    count = cur.count(old)
    cur = cur.replace(old, new)
    print(f"{'OK' if count else 'NOT FOUND'} ({count}): {old[:40].decode()}")

with open('/root/zeroscreen/dist/server.js', 'wb') as f:
    f.write(cur)
print(f"Done. Size: {len(cur)}")
