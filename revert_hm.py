with open('/root/zeroscreen/src/server.ts','rb') as f:
    c = f.read()

print("Size before:", len(c))

# ── Remove P5 CSS block ──────────────────────────────────────────────────────
# Find start: \n    .sig3-hm-grid{
css_start = c.find(b'\n    .sig3-hm-grid{')
# Find end: ends with sig3-hm-alert-btn line + newline
css_end_marker = b'color:inherit;text-decoration:none}\n'
css_end = c.find(css_end_marker, css_start)
if css_start != -1 and css_end != -1:
    css_end += len(css_end_marker)
    c = c[:css_start] + c[css_end:]
    print(f"P5 CSS removed ({css_end - css_start} bytes)")
else:
    print(f"P5 CSS NOT FOUND: css_start={css_start} css_end={css_end}")

# ── Remove P6 HTML block ─────────────────────────────────────────────────────
html_start = c.find(b'\n    <!-- Health Monitor Grid -->\n')
html_end_marker = b'<div class="sig3-hm-alerts" id="s3hm-alerts" style="display:none"></div>\n\n'
html_end = c.find(html_end_marker, html_start)
if html_start != -1 and html_end != -1:
    html_end += len(html_end_marker)
    c = c[:html_start] + c[html_end:]
    print(f"P6 HTML removed ({html_end - html_start} bytes)")
else:
    print(f"P6 HTML NOT FOUND: html_start={html_start} html_end={html_end}")

# ── Remove P7 JS block ───────────────────────────────────────────────────────
js_start = c.find(b'      // Health Monitor update\n')
js_end_marker = b'})();\n'
js_end = c.find(js_end_marker, js_start)
if js_start != -1 and js_end != -1:
    js_end += len(js_end_marker)
    c = c[:js_start] + c[js_end:]
    print(f"P7 JS removed ({js_end - js_start} bytes)")
else:
    print(f"P7 JS NOT FOUND: js_start={js_start} js_end={js_end}")

with open('/root/zeroscreen/src/server.ts','wb') as f:
    f.write(c)

print("Size after:", len(c))
print("DONE")
