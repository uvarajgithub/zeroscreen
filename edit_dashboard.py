import re

with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8') as f:
    content = f.read()

orig_len = len(content)

# 1. Remove Trail tab button
content = re.sub(
    r'\n\s*<button class="stab" id="stab-trail".*?</button>',
    '', content, flags=re.DOTALL
)

# 2. Remove Lock50old tab button
content = re.sub(
    r'\n\s*<button class="stab" id="stab-lock50old".*?</button>',
    '', content, flags=re.DOTALL
)

# 3. Remove panel-trail block (comment + div)
content = re.sub(
    r'\n\s*<!--[^>]*TRAIL PAPER SHADOW PANEL.*?</div><!-- /panel-trail -->',
    '', content, flags=re.DOTALL
)

# 4. Remove panel-lock50old block (comment + div)
content = re.sub(
    r'\n\s*<!--[^>]*LOCK50 OLD SHADOW PANEL.*?</div><!-- /panel-lock50old -->',
    '', content, flags=re.DOTALL
)

# 5. Remove trail/lock50old from JS tabMap
content = content.replace("'stab-trail':'trail','stab-lock50old':'lock50old',", '')

with open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'Done. Removed {orig_len - len(content)} chars ({orig_len} -> {len(content)})')
