lines = open('/root/zeroscreen/dist/server.js').readlines()

# Find the exact lines with extra closes
# We look for the pattern: </div>\n\n            </div>\n\n            </div>\n          </div>\n        </div>\n      </div><!-- /db-main -->
# The extra 2 closes are the blank-line </div> entries

old = (
    '            \n'
    '            </div>\n'
    '            \n'
    '            </div>\n'
    '          </div>\n'
    '        </div>\n'
    '      </div><!-- /db-main -->\n'
)

new = (
    '          </div>\n'
    '        </div>\n'
    '      </div><!-- /db-main -->\n'
)

content = ''.join(lines)
if old in content:
    content = content.replace(old, new, 1)
    open('/root/zeroscreen/dist/server.js', 'w').write(content)
    print('Fixed: removed 2 extra closing divs')
else:
    # Try to find what's actually there
    idx = content.find('</div><!-- /db-main -->')
    print('Pattern not found. Context around /db-main:')
    start = max(0, idx - 300)
    print(repr(content[start:idx+30]))
