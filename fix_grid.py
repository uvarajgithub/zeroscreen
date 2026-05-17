c = open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8').read()

# The script tag is a 3rd grid item and there's a stray </div> closing atl-top-grid early.
# Fix: move the </script> inside the LEFT column div (before its closing </div>),
# and remove the stray </div> that prematurely closes atl-top-grid.

old = """      </script>
      </div>

      <!-- RIGHT: Position / Watching card -->"""

new = """      </script>
      </div>

      <!-- RIGHT: Position / Watching card -->"""

# The real fix: the </div> after </script> is closing atl-top-grid too early.
# Remove it so RIGHT column stays inside the grid.
old = "      </script>\n      </div>\n\n      <!-- RIGHT: Position / Watching card -->"
new = "      </script>\n\n      <!-- RIGHT: Position / Watching card -->"

if old in c:
    c = c.replace(old, new, 1)
    open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8').write(c)
    print('PATCHED: removed stray closing div')
else:
    # Try to find what's actually there
    idx = c.find('</script>\n      </div>\n\n      <!-- RIGHT')
    if idx >= 0:
        print('FOUND at char', idx, '- content:', repr(c[idx:idx+80]))
    else:
        idx2 = c.find('<!-- RIGHT: Position')
        if idx2 >= 0:
            print('RIGHT col found, context before:', repr(c[idx2-60:idx2+40]))
        else:
            print('NOT FOUND')
