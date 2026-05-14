#!/usr/bin/env python3
"""Add _sTab('lock50') call on init to properly set initial panel visibility"""
path = '/root/zeroscreen/dist/server.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

OLD = "  setInterval(_dbRefresh,3000);\n  _dbRefresh();"
NEW = "  setInterval(_dbRefresh,3000);\n  _dbRefresh();\n  _sTab('lock50');"

if OLD in content:
    content = content.replace(OLD, NEW, 1)
    print("Added _sTab init call")
else:
    print("ERROR: anchor not found")
    exit(1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done.")
