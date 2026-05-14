#!/usr/bin/env python3
"""Fix tab clickability: use explicit display:'block', add type=button, wire via addEventListener."""
import sys

FILE = '/root/zeroscreen/dist/server.js'
with open(FILE, 'r', encoding='utf-8') as f:
    src = f.read()

fixes = 0

def rpl(old, new, label):
    global src, fixes
    if old not in src:
        print(f"WARN: {label} not found")
        return False
    src = src.replace(old, new, 1)
    fixes += 1
    print(f"OK: {label}")
    return True

# 1. Fix _sTab to use explicit 'block' instead of '' ('' can leave hidden if CSS rule exists)
rpl(
    "if(p)p.style.display=t===id?'':'none';",
    "if(p)p.style.display=t===id?'block':'none';",
    "_sTab display fix"
)

# 2. Add type="button" to ALL stab buttons (prevents form-submit default in some contexts)
#    Also remove onclick - we'll wire via addEventListener below
rpl(
    'class="stab act" id="stab-lock50"   onclick="_sTab(\'lock50\')"',
    'class="stab act" id="stab-lock50" type="button"',
    'stab-lock50 type=button + remove onclick'
)
rpl(
    'class="stab" id="stab-trail" onclick="_sTab(\'trail\')"',
    'class="stab" id="stab-trail" type="button"',
    'stab-trail type=button + remove onclick'
)
rpl(
    'class="stab" id="stab-lock50old" onclick="_sTab(\'lock50old\')"',
    'class="stab" id="stab-lock50old" type="button"',
    'stab-lock50old type=button + remove onclick'
)

# 3. Wire tab clicks via addEventListener in the _sTab function block (guaranteed to fire)
OLD_STAB_FN = '''  function _sTab(t){
    ['lock50','trail','lock50old'].forEach(function(id){
      var p=ge('panel-'+id);var b=ge('stab-'+id);
      if(p)p.style.display=t===id?'block':'none';
      if(b)b.classList.toggle('act',t===id);
    });
  }'''
NEW_STAB_FN = '''  function _sTab(t){
    ['lock50','trail','lock50old'].forEach(function(id){
      var p=ge('panel-'+id);var b=ge('stab-'+id);
      if(p)p.style.display=t===id?'block':'none';
      if(b)b.classList.toggle('act',t===id);
    });
  }
  // Wire tab buttons via addEventListener (belt-and-suspenders approach)
  document.addEventListener('DOMContentLoaded',function(){
    var tabMap={'stab-lock50':'lock50','stab-trail':'trail','stab-lock50old':'lock50old'};
    Object.keys(tabMap).forEach(function(btnId){
      var btn=ge(btnId);
      if(btn)btn.addEventListener('click',function(){_sTab(tabMap[btnId]);});
    });
  });'''

if OLD_STAB_FN not in src:
    print("WARN: _sTab fn block not found — skipping addEventListener wiring")
else:
    src = src.replace(OLD_STAB_FN, NEW_STAB_FN, 1)
    fixes += 1
    print("OK: addEventListener wiring added")

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(src)
print(f"\nDONE — {fixes} fixes applied")
