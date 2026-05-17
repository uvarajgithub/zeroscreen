with open('/root/zeroscreen/dist/server.js','r') as f:
    lines = f.readlines()

# Extract pos-lock50-wrap full block (lines 10658-10691, 0-indexed 10657-10690)
pos_wrap_full = ''.join(lines[10657:10691])

# ss-card content (lines 10695-10738, 0-indexed 10694-10737)
ss_card = ''.join(lines[10694:10738]).rstrip()

# Timeline block (lines 10742-10834, 0-indexed 10741-10834)
tl_full = ''.join(lines[10741:10835])
# Extract just pm-tl div + script
tl_start_idx = tl_full.index('<div class="pm-tl"')
script_end_idx = tl_full.rindex('</script>') + len('</script>')
tl_core = tl_full[tl_start_idx:script_end_idx]

print(f'pos_wrap: {len(pos_wrap_full)}, ss_card: {len(ss_card)}, tl_core: {len(tl_core)}')

new_layout = (
    '\n'
    '    <!-- === AMINA 100 Top Layout: Timeline + Stats === -->\n'
    '    <div class="pm-grid" style="margin-bottom:1.2rem;align-items:start">\n'
    '\n'
    '      <!-- LEFT: Session Timeline -->\n'
    '      <div>\n'
    '        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">\n'
    '          <span style="font-size:.72rem;text-transform:uppercase;letter-spacing:1px;color:#8b949e;font-weight:700">&#9201; Today&#8217;s Session Timeline</span>\n'
    '          <span class="pm-phase" id="atl-phase-badge">Loading&hellip;</span>\n'
    '        </div>\n'
    + tl_core + '\n'
    '      </div>\n'
    '\n'
    '      <!-- RIGHT: Session Stats -->\n'
    '      <div>\n'
    '        <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:1px;color:#8b949e;font-weight:700;margin-bottom:8px">&#128200; Session Stats</div>\n'
    + ss_card + '\n'
    '      </div>\n'
    '\n'
    '    </div><!-- /amina-top-grid -->\n'
    '\n'
    '    <!-- Position / Watching card (full width) -->\n'
    + pos_wrap_full
    + '\n'
)

before     = lines[:10652]
panel_open = lines[10652]
after      = lines[10835:]

new_lines = before + [panel_open, new_layout] + after

with open('/root/zeroscreen/dist/server.js','w') as f:
    f.writelines(new_lines)

print('DONE')
