#!/usr/bin/env python3
"""Restore onclick directly on tab buttons — DOMContentLoaded fires before the script block at bottom of body."""
FILE = '/root/zeroscreen/dist/server.js'
with open(FILE, 'r', encoding='utf-8') as f:
    src = f.read()

fixes = 0
def rpl(old, new, label):
    global src, fixes
    if old not in src:
        print(f"WARN: {label} not found"); return
    src = src.replace(old, new, 1)
    fixes += 1; print(f"OK: {label}")

# Restore onclick on all 3 tab buttons
rpl(
    'class="stab act" id="stab-lock50" type="button"',
    'class="stab act" id="stab-lock50" type="button" onclick="_sTab(\'lock50\')"',
    'stab-lock50 onclick restored'
)
rpl(
    'class="stab" id="stab-trail" type="button"',
    'class="stab" id="stab-trail" type="button" onclick="_sTab(\'trail\')"',
    'stab-trail onclick restored'
)
rpl(
    'class="stab" id="stab-lock50old" type="button"',
    'class="stab" id="stab-lock50old" type="button" onclick="_sTab(\'lock50old\')"',
    'stab-lock50old onclick restored'
)

# Also replace the DOMContentLoaded wiring (which never fires) with immediate wiring
# since the script is at the bottom of body — elements already exist
rpl(
    '''  // Wire tab buttons via addEventListener (belt-and-suspenders approach)
  document.addEventListener('DOMContentLoaded',function(){
    var tabMap={'stab-lock50':'lock50','stab-trail':'trail','stab-lock50old':'lock50old'};
    Object.keys(tabMap).forEach(function(btnId){
      var btn=ge(btnId);
      if(btn)btn.addEventListener('click',function(){_sTab(tabMap[btnId]);});
    });
  });''',
    '''  // Wire tab buttons immediately (script is at bottom of body, elements exist)
  (function(){
    var tabMap={'stab-lock50':'lock50','stab-trail':'trail','stab-lock50old':'lock50old'};
    Object.keys(tabMap).forEach(function(btnId){
      var btn=ge(btnId);
      if(btn)btn.addEventListener('click',function(){_sTab(tabMap[btnId]);});
    });
  })();''',
    'DOMContentLoaded -> IIFE wiring'
)

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"\nDONE — {fixes} fixes applied")
