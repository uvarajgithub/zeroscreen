import os

f='/root/zeroscreen/dist/server.js'
raw=open(f,'rb').read()

# 1. Remove the 5-Year button
OLD_BTN = b'\n          <button id="th-btn-5y" onclick="_thFilter(\'5y\')" style="padding:3px 12px;border-radius:5px;font-size:.72rem;font-weight:700;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text-muted)">5-Year</button>'
print('btn found:', raw.count(OLD_BTN))
raw = raw.replace(OLD_BTN, b'', 1)

# 2. Remove the 5-year panel (everything between panel anchor and Stats strip)
import re
raw = re.sub(
    rb'\n      <!-- 5-YEAR panel -->.*?</div>\n\n    <!-- Stats strip -->',
    b'\n\n    <!-- Stats strip -->',
    raw,
    count=1,
    flags=re.DOTALL
)

# 3. Revert filter array back to ['d','w','m']
OLD_FILTER = b"['d','w','m','5y'].forEach(function(x){"
NEW_FILTER = b"['d','w','m'].forEach(function(x){"
print('filter found:', raw.count(OLD_FILTER))
raw = raw.replace(OLD_FILTER, NEW_FILTER, 1)

tmp = f + '.undo5yr_tmp'
open(tmp,'wb').write(raw)
os.rename(tmp, f)
print('DONE, size:', os.path.getsize(f))
