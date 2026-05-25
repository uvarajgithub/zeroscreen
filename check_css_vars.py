with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    cur = f.read()

# Find the CSS variables defined in the signals page style block
style_start = cur.find(b'Live Bot Dashboard')
style_start = cur.rfind(b'<style>', 0, style_start)
style_end = cur.find(b'</style>', style_start)
style_block = cur[style_start:style_end+8]

# Check which CSS vars the hb-* CSS uses
import re
hb_css_start = style_block.find(b'.hb{')
print("=== HB CSS ===")
print(style_block[hb_css_start:hb_css_start+2000].decode('utf-8','replace'))

# Check what --card and --border-c and --green are defined as in the style block
for var in [b'--card', b'--border-c', b'--green', b'--amber', b'--red', b'--muted', b'--text-muted']:
    idx = style_block.find(var + b':')
    if idx != -1:
        print(f"{var.decode()}: {style_block[idx:idx+50].decode('utf-8','replace')}")
    else:
        print(f"{var.decode()}: NOT DEFINED IN STYLE BLOCK")
