c = open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8').read()

# Step 1: Renumber existing atl-row/atl-dot IDs from 0-7 → 1-8 (in reverse to avoid double-replace)
for i in range(7, -1, -1):
    c = c.replace(f'id="atl-row-{i}"', f'id="atl-row-{i+1}"')
    c = c.replace(f'id="atl-dot-{i}"', f'id="atl-dot-{i+1}"')

# Step 2: Prepend new row-0 (7:30 AM Token Refreshed) before row-1 (previously row-0)
new_row = '''          <div class="pm-tl-row" id="atl-row-0">
            <div class="pm-tl-dot" id="atl-dot-0"></div>
            <div class="pm-tl-txt">
              <div class="pm-tl-time">7:30 AM &mdash; Token Auto-Refreshed &mdash; Bot Ready</div>
              <div class="pm-tl-label">Kite access token refreshed via TOTP. Bot restarted with fresh session</div>
            </div>
          </div>
          '''

c = c.replace(
    '<div class="pm-tl-row" id="atl-row-1">',
    new_row + '<div class="pm-tl-row" id="atl-row-1">',
    1
)

# Step 3: Update JS _ATL array (add id:0 at start, shift rest)
old_atl = 'var _ATL=[{id:0,h:8,m:30},{id:1,h:9,m:15},{id:2,h:9,m:15},{id:3,h:9,m:30},{id:4,h:9,m:30},{id:5,h:9,m:45},{id:6,h:15,m:14},{id:7,h:15,m:30}];'
new_atl = 'var _ATL=[{id:0,h:7,m:30},{id:1,h:8,m:30},{id:2,h:9,m:15},{id:3,h:9,m:15},{id:4,h:9,m:30},{id:5,h:9,m:30},{id:6,h:9,m:45},{id:7,h:15,m:14},{id:8,h:15,m:30}];'
if old_atl in c:
    c = c.replace(old_atl, new_atl, 1)
    print('_ATL updated')
else:
    print('WARNING: _ATL not found')

# Step 4: Update _ATLPH phases (add Token Refresh phase before Pre-Market)
old_ph = "var _ATLPH=[[8,30,'Pre-Market',''"
new_ph = "var _ATLPH=[[7,30,'Token Refresh',''],[8,30,'Pre-Market',''"
if old_ph in c:
    c = c.replace(old_ph, new_ph, 1)
    print('_ATLPH updated')
else:
    print('WARNING: _ATLPH not found')

open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8').write(c)
print('DONE')
