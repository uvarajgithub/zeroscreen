#!/usr/bin/env python3
"""Wave 4 deep fix:
  1. Remove backdrop-filter from .topnav on mobile (root cause of blurred drawer)
  2. Cache-bust style.css and app.js links in server.ts (?v=5)
"""
import re

CSS_PATH = '/root/zeroscreen/public/css/style.css'
TS_PATH  = '/root/zeroscreen/src/server.ts'

# ===========================================================================
# FIX 1: CSS — remove backdrop-filter from .topnav on mobile (≤768px)
# ===========================================================================
with open(CSS_PATH, encoding='utf-8') as f:
    css = f.read()

TOPNAV_MOBILE_FIX = '''
/* ↑↑ Topnav: remove backdrop-filter on mobile (prevents nav-links drawer blur)
   backdrop-filter creates a containing block for position:fixed children,
   causing the slide-in drawer to render inside the compositing layer and appear blurred */
@media (max-width: 768px) {
  .topnav {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    background: rgba(255,255,255,0.98) !important;
  }
  html.dark .topnav {
    background: rgba(22,27,34,0.98) !important;
  }
}'''

# Insert right before the end of the file (after last rule)
# Find the closing of the last @media block so we append cleanly
if 'backdrop-filter: none !important' in css and 'topnav' in css[css.rfind('backdrop-filter: none !important')-100:]:
    print('Fix 1: topnav mobile backdrop-filter rule already exists, skipping')
else:
    css = css + TOPNAV_MOBILE_FIX + '\n'
    print('Fix 1: topnav mobile backdrop-filter removal rule appended')

with open(CSS_PATH, 'w', encoding='utf-8') as f:
    f.write(css)

print('style.css saved.')

# ===========================================================================
# FIX 2: TS — cache-bust all CSS/JS static links
# ===========================================================================
with open(TS_PATH, encoding='utf-8') as f:
    ts = f.read()

original_len = len(ts)

# Replace all style.css links (without existing ?v=)
ts_new = ts.replace('/public/css/style.css"', '/public/css/style.css?v=5"')
css_count = ts.count('/public/css/style.css"')

# Replace all app.js links
ts_new2 = ts_new.replace('/public/js/app.js"', '/public/js/app.js?v=5"')
js_count = ts_new.count('/public/js/app.js"')

with open(TS_PATH, 'w', encoding='utf-8') as f:
    f.write(ts_new2)

print(f'Fix 2: cache-busted {css_count} style.css links and {js_count} app.js links with ?v=5')
print(f'server.ts: {original_len} -> {len(ts_new2)} bytes (delta {len(ts_new2)-original_len})')
print('\nAll fixes applied.')
