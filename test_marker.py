#!/usr/bin/env python3
"""Add a bright test marker to panel-trail to verify the user is seeing new HTML."""
import re

path = '/root/zeroscreen/dist/server.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

OLD = '<div id="panel-trail" style="display:none">'
NEW = '<div id="panel-trail" style="display:none"><!-- TEST_V3 --><div style="background:#ef4444;color:#fff;padding:8px 14px;border-radius:8px;font-weight:800;margin-bottom:10px">🔴 TEST MARKER — New HTML v3 is live</div>'

if OLD not in content:
    print("ERROR: Could not find panel-trail div!")
    exit(1)

content2 = content.replace(OLD, NEW, 1)
with open(path, 'w', encoding='utf-8') as f:
    f.write(content2)
print("Done — test marker added.")
