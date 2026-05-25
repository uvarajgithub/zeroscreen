with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    c = f.read()

tl_start = c.find(b'<div class="pm-tl" id="atl-tl">')
# End is the closing </div> for atl-tl, find it by looking for closing tag after last atl-row
# Find C3+ scan button area or CURRENT POSITION
right_col = c.find(b'id="atl-top-grid"')
right_end = c.find(b'<!-- RIGHT', right_col)
print(f"right_col:{right_col} right_end:{right_end}")
# The tl block ends before the right col marker
tl_end = c.rfind(b'</div>', tl_start, right_end)
print(f"tl_end:{tl_end}")
print(c[tl_start:tl_end+6].decode('utf-8','replace'))
