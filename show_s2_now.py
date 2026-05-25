with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    cur = f.read()

# Show current hb HTML and CSS
hb_html_start = cur.find(b'<div class="hb" id="hb-bar">')
hb_html_end = cur.find(b'\n    <!-- ', hb_html_start + 10)
print("=== HB HTML ===")
print(cur[hb_html_start:hb_html_end].decode('utf-8','replace'))

# Show hb CSS
style_start = cur.rfind(b'<style>', 0, cur.find(b'</head>', cur.find(b'Live Bot Dashboard')))
style_end = cur.find(b'</style>', style_start)
hb_css_start = cur.find(b'.hb{', style_start, style_end)
print("\n=== HB CSS ===")
print(cur[hb_css_start:hb_css_start+600].decode('utf-8','replace'))
