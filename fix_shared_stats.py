#!/usr/bin/env python3
"""
Move the db-main section (position card + session stats) out of panel-lock50
so it is always visible regardless of which tab is active.
"""
FILE = '/root/zeroscreen/dist/server.js'
with open(FILE, 'r', encoding='utf-8') as f:
    src = f.read()

# ── Find the db-main block inside panel-lock50 ─────────────────────────────
# Anchor: panel-lock50 opens, then has the db-main block up to /db-main

# Start: <div class="db-main"> inside panel-lock50
PANEL_START = '<div id="panel-lock50">'
panel_pos = src.find(PANEL_START)
if panel_pos < 0:
    print("ERROR: panel-lock50 not found"); exit(1)

# From panel_pos, find the first <div class="db-main">
dbmain_start_rel = src.find('\n      <div class="db-main">', panel_pos)
if dbmain_start_rel < 0:
    print("ERROR: db-main start not found"); exit(1)

# End: </div><!-- /db-main -->
DBMAIN_END = '      </div><!-- /db-main -->'
dbmain_end_rel = src.find(DBMAIN_END, dbmain_start_rel)
if dbmain_end_rel < 0:
    print("ERROR: /db-main not found"); exit(1)

# Extract the block (including trailing newline)
block_start = dbmain_start_rel  # starts with \n      <div class="db-main">
block_end = dbmain_end_rel + len(DBMAIN_END)  # ends after /db-main comment

extracted = src[block_start:block_end]
print(f"Extracted {len(extracted)} chars of db-main block")
print(f"Preview: {repr(extracted[:80])}")

# Remove the block from panel-lock50
src = src[:block_start] + src[block_end:]
print("OK: removed db-main from panel-lock50")

# ── Insert the block BEFORE panel-lock50 (after the inline _sTab script) ──
# The inline _sTab script tag ends with </script>
# Then comes a newline and the TICK TRAIL PANEL comment block

INSERT_BEFORE = '\n    <!-- '
# We need the one right before panel-lock50, find it after the _sTab script
stab_script_end = src.find('function _sTab(t){')
if stab_script_end < 0:
    print("ERROR: _sTab script not found"); exit(1)

# Find the next '\n    <!-- ' after the stab script
insert_pos = src.find(INSERT_BEFORE, stab_script_end)
if insert_pos < 0:
    print("ERROR: insert position not found"); exit(1)

# Insert extracted block at insert_pos
src = src[:insert_pos] + extracted + '\n' + src[insert_pos:]
print("OK: inserted db-main before TICK TRAIL PANEL comment")

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(src)
print("DONE")
