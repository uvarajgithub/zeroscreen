with open('/root/zeroscreen/src/server.ts','rb') as f:
    c = f.read()

# Find end of HTML grid block (sig3-hm-alerts closing div)
idx_html = c.find(b'\n    <!-- Health Monitor Grid -->\n')
idx_alerts_end = c.find(b'<div class="sig3-hm-alerts"')
print("HTML start marker at:", idx_html)
print("sig3-hm-alerts at:", idx_alerts_end)
# Show what follows alerts
if idx_alerts_end != -1:
    print(repr(c[idx_alerts_end:idx_alerts_end+200]))

# Find end of CSS block
idx_css_end = c.find(b'sig3-hm-alert-btn{')
print("\nCSS end (alert-btn) at:", idx_css_end)
if idx_css_end != -1:
    print(repr(c[idx_css_end:idx_css_end+200]))

# Find JS block - comment + end
idx_js = c.find(b'      // Health Monitor update\n')
print("\nJS start at:", idx_js)
# find what JS ends - look for some anchor after it
if idx_js != -1:
    print(repr(c[idx_js:idx_js+100]))
    # Find end of IIFE
    idx_js_end = c.find(b'})();\n', idx_js)
    print("IIFE end at:", idx_js_end)
    if idx_js_end != -1:
        print(repr(c[idx_js_end-20:idx_js_end+60]))
