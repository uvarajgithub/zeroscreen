#!/usr/bin/env python3
"""Wave 4 bug fixes:
  1. Remove backdrop-filter blur from .nav-mob-backdrop (causes visual blur artifact on mobile WebKit)
  2. Raise z-indexes: backdrop 998→1100, nav-links 999→1200, hamburger 1000→1300 (avoid stacking conflicts)
  3. Hide news ticker on all mobile ≤768px (was ≤600px), fix overlap with indices ticker
"""

CSS_PATH = '/root/zeroscreen/public/css/style.css'

with open(CSS_PATH, encoding='utf-8') as f:
    css = f.read()

original_len = len(css)

# -----------------------------------------------------------------
# Fix 1: Remove backdrop-filter from .nav-mob-backdrop
# The blur causes visual bleed-through onto the nav-links panel
# on mobile Chrome/WebKit because of GPU compositing artifacts.
# -----------------------------------------------------------------
OLD_BACKDROP_BLOCK = (
    '.nav-mob-backdrop {\n'
    '  display: none;\n'
    '  position: fixed;\n'
    '  inset: 0;\n'
    '  z-index: 998;\n'
    '  background: rgba(0, 0, 0, 0.55);\n'
    '  backdrop-filter: blur(3px);\n'
    '  -webkit-backdrop-filter: blur(3px);\n'
    '  animation: none;\n'
    '}'
)
NEW_BACKDROP_BLOCK = (
    '.nav-mob-backdrop {\n'
    '  display: none;\n'
    '  position: fixed;\n'
    '  inset: 0;\n'
    '  z-index: 1100;\n'
    '  background: rgba(0, 0, 0, 0.55);\n'
    '  animation: none;\n'
    '}'
)
if OLD_BACKDROP_BLOCK in css:
    css = css.replace(OLD_BACKDROP_BLOCK, NEW_BACKDROP_BLOCK, 1)
    print('Fix 1a: backdrop block replaced (blur removed, z-index raised to 1100)')
else:
    print('WARNING: backdrop block not found for Fix 1a')

# -----------------------------------------------------------------
# Fix 2: Raise nav-links z-index from 999 to 1200 (must be above backdrop 1100)
# -----------------------------------------------------------------
OLD_NAVLINKS_ZINDEX = '    z-index: 999 !important;\n'
NEW_NAVLINKS_ZINDEX = '    z-index: 1200 !important;\n'
if OLD_NAVLINKS_ZINDEX in css:
    css = css.replace(OLD_NAVLINKS_ZINDEX, NEW_NAVLINKS_ZINDEX, 1)
    print('Fix 1b: nav-links z-index raised to 1200')
else:
    print('WARNING: nav-links z-index 999 not found')

# -----------------------------------------------------------------
# Fix 3: Raise hamburger z-index from 1000 to 1300 (above nav-links)
# -----------------------------------------------------------------
OLD_HAMBURGER_ZINDEX = '  .hamburger { z-index: 1000; }\n'
NEW_HAMBURGER_ZINDEX = '  .hamburger { z-index: 1300; }\n'
if OLD_HAMBURGER_ZINDEX in css:
    css = css.replace(OLD_HAMBURGER_ZINDEX, NEW_HAMBURGER_ZINDEX, 1)
    print('Fix 2: hamburger z-index raised to 1300')
else:
    print('WARNING: hamburger z-index 1000 not found')

# -----------------------------------------------------------------
# Fix 4: Hide news ticker on ALL mobile ≤768px (was ≤600px)
# Both the news ticker and indices ticker would show between 601-768px
# causing visual overlap. Show only indices ticker on mobile.
# -----------------------------------------------------------------
OLD_TICKER_RULE = (
    '/* \xe2\x86\x92 News ticker: hide on small mobile (show only indices) \xe2\x86\x92 */\n'
    '@media (max-width: 600px) {\n'
    '  .ticker-wrap { display: none !important; }\n'
    '}'
)
NEW_TICKER_RULE = (
    '/* \xe2\x86\x92 News ticker: hide on all mobile (show only indices) \xe2\x86\x92 */\n'
    '@media (max-width: 768px) {\n'
    '  .ticker-wrap { display: none !important; }\n'
    '}'
)

# Try the arrow variant (Windows might have rendered → differently)
OLD_TICKER_RULE2 = (
    '@media (max-width: 600px) {\n'
    '  .ticker-wrap { display: none !important; }\n'
    '}'
)
NEW_TICKER_RULE2 = (
    '@media (max-width: 768px) {\n'
    '  .ticker-wrap { display: none !important; }\n'
    '}'
)

if OLD_TICKER_RULE in css:
    css = css.replace(OLD_TICKER_RULE, NEW_TICKER_RULE, 1)
    print('Fix 4: news ticker hide threshold raised to 768px (with comment)')
elif OLD_TICKER_RULE2 in css:
    css = css.replace(OLD_TICKER_RULE2, NEW_TICKER_RULE2, 1)
    print('Fix 4: news ticker hide threshold raised to 768px (without comment)')
else:
    print('WARNING: ticker-wrap 600px rule not found, trying inline search...')
    import re
    pattern = r'@media \(max-width: 600px\) \{\s*\.ticker-wrap \{ display: none !important; \}\s*\}'
    match = re.search(pattern, css)
    if match:
        css = css[:match.start()] + '@media (max-width: 768px) {\n  .ticker-wrap { display: none !important; }\n}' + css[match.end():]
        print('Fix 4: news ticker hide threshold raised to 768px (regex)')
    else:
        print('ERROR: Could not find ticker-wrap 600px rule at all')

print(f'\nOriginal CSS length: {original_len}')
print(f'New CSS length: {len(css)}')
print(f'Delta: {len(css) - original_len} bytes')

with open(CSS_PATH, 'w', encoding='utf-8') as f:
    f.write(css)

print('\nDone. style.css patched successfully.')
