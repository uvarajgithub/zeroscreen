#!/usr/bin/env python3
"""
Fix the real _sTab (main script block) to scroll panel into view on tab click.
Also improve the watching card visibility.
"""

path = '/root/zeroscreen/dist/server.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# ── 1. Fix the real _sTab (main script, line ~10510) to scroll panel into view ─
OLD_STAB2 = """  function _sTab(t){
    ['lock50','trail','lock50old'].forEach(function(id){
      var p=ge('panel-'+id);var b=ge('stab-'+id);
      if(p)p.style.display=t===id?'block':'none';
      if(b)b.classList.toggle('act',t===id);
    });
  }"""
NEW_STAB2 = """  function _sTab(t){
    ['lock50','trail','lock50old'].forEach(function(id){
      var p=ge('panel-'+id);var b=ge('stab-'+id);
      if(p)p.style.display=t===id?'block':'none';
      if(b)b.classList.toggle('act',t===id);
    });
    // Scroll to top of the shown panel so position card is visible
    var wrap=ge('stab-wrap')||document.querySelector('.stab-wrap');
    if(wrap){var y=wrap.getBoundingClientRect().top+window.scrollY-8;window.scrollTo({top:y,behavior:'smooth'});}
  }"""

if OLD_STAB2 in content:
    content = content.replace(OLD_STAB2, NEW_STAB2, 1)
    print("Fix 1: main _sTab scroll behavior added")
    changes += 1
else:
    print("Fix 1 ERROR: main _sTab not found with expected whitespace")
    # Try compact version
    compact = "  function _sTab(t){\n    ['lock50','trail','lock50old'].forEach(function(id){"
    if compact in content:
        print(f"  Found partial: {compact[:60]}")
    else:
        print("  Not found at all")

# ── 2. Remove the duplicate inline _sTab (it's overridden by the main one) ─────
OLD_INLINE = """    <script>function _sTab(t){['lock50','trail','lock50old'].forEach(function(id){var p=document.getElementById('panel-'+id);var b=document.getElementById('stab-'+id);if(p)p.style.display=t===id?'block':'none';if(b)b.classList.toggle('act',t===id);});var btn=document.getElementById('stab-'+t);if(btn){var y=btn.getBoundingClientRect().top+window.scrollY-12;window.scrollTo({top:y,behavior:'smooth'});}}</script>"""
NEW_INLINE = """    <script>/* _sTab defined in main script below */</script>"""

if OLD_INLINE in content:
    content = content.replace(OLD_INLINE, NEW_INLINE, 1)
    print("Fix 2: duplicate inline _sTab removed")
    changes += 1
else:
    # Try without scroll part (maybe it's still the original)
    old2 = """    <script>function _sTab(t){['lock50','trail','lock50old'].forEach(function(id){var p=document.getElementById('panel-'+id);var b=document.getElementById('stab-'+id);if(p)p.style.display=t===id?'block':'none';if(b)b.classList.toggle('act',t===id);});</script>"""
    if old2 in content:
        content = content.replace(old2, NEW_INLINE, 1)
        print("Fix 2: duplicate inline _sTab removed (original version)")
        changes += 1
    else:
        import re
        m = re.search(r'<script>function _sTab\(t\)\{.*?</script>', content)
        if m:
            content = content.replace(m.group(0), NEW_INLINE, 1)
            print("Fix 2: duplicate inline _sTab removed (regex)")
            changes += 1
        else:
            print("Fix 2: inline _sTab not found (may already be cleaned up)")

# ── 3. Make the watching card more visually distinct ─────────────────────────
# Change sh-pos-watch background to a subtle tint so it's visible in light theme
OLD_CSS = ".sh-pos-watch{background:var(--card);border-color:var(--border-c)}"
NEW_CSS = ".sh-pos-watch{background:rgba(248,250,252,0.95);border-color:var(--border-c);box-shadow:0 1px 6px rgba(0,0,0,.06)}"

if OLD_CSS in content:
    content = content.replace(OLD_CSS, NEW_CSS, 1)
    print("Fix 3: watching card CSS improved (subtle shadow added)")
    changes += 1
else:
    print("Fix 3: watching card CSS not found")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\nTotal changes: {changes}/3")
