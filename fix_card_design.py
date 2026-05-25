#!/usr/bin/env python3
"""Fix position card, watch card, kpi-m card styling — remove grey, soften title."""

with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()

changes = 0

for i, ln in enumerate(lines):

    # 1. .watch-card — subtle dark purple-tinted card instead of flat grey
    if '.watch-card{padding:18px 22px;background:var(--card);border:1.5px solid var(--border-c);border-radius:14px}' in ln:
        lines[i] = ln.replace(
            '.watch-card{padding:18px 22px;background:var(--card);border:1.5px solid var(--border-c);border-radius:14px}',
            '.watch-card{padding:18px 22px;background:rgba(124,58,237,0.07);border:1.5px solid rgba(124,58,237,0.22);border-radius:14px}'
        )
        print(f"  [1] .watch-card CSS updated at line {i+1}")
        changes += 1

    # 2. .watch-title — muted label style instead of bold bright white
    if '.watch-title{font-size:.92rem;font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:8px}' in ln:
        lines[i] = ln.replace(
            '.watch-title{font-size:.92rem;font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:8px}',
            '.watch-title{font-size:.72rem;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:7px;color:#a78bfa;text-transform:uppercase;letter-spacing:.07em}'
        )
        print(f"  [2] .watch-title CSS updated at line {i+1}")
        changes += 1

    # 3. .pos-flat — match watch-card style
    if '.pos-flat{background:var(--card);border-color:var(--border-c)}' in ln:
        lines[i] = ln.replace(
            '.pos-flat{background:var(--card);border-color:var(--border-c)}',
            '.pos-flat{background:rgba(124,58,237,0.07);border-color:rgba(124,58,237,0.22)}'
        )
        print(f"  [3] .pos-flat CSS updated at line {i+1}")
        changes += 1

    # 4. .pos-ce — darken the light-blue gradient for dark theme
    if '.pos-ce{background:linear-gradient(135deg,rgba(219,234,254,.55),rgba(219,234,254,.25));border-color:rgba(37,99,235,.3)}' in ln:
        lines[i] = ln.replace(
            '.pos-ce{background:linear-gradient(135deg,rgba(219,234,254,.55),rgba(219,234,254,.25));border-color:rgba(37,99,235,.3)}',
            '.pos-ce{background:linear-gradient(135deg,rgba(56,189,248,.12),rgba(56,189,248,.06));border-color:rgba(56,189,248,.3)}'
        )
        print(f"  [4] .pos-ce CSS updated at line {i+1}")
        changes += 1

    # 5. .pos-pe — darken the light-red gradient for dark theme
    if '.pos-pe{background:linear-gradient(135deg,rgba(254,226,226,.55),rgba(254,226,226,.25));border-color:rgba(220,38,38,.3)}' in ln:
        lines[i] = ln.replace(
            '.pos-pe{background:linear-gradient(135deg,rgba(254,226,226,.55),rgba(254,226,226,.25));border-color:rgba(220,38,38,.3)}',
            '.pos-pe{background:linear-gradient(135deg,rgba(192,132,252,.12),rgba(192,132,252,.06));border-color:rgba(192,132,252,.3)}'
        )
        print(f"  [5] .pos-pe CSS updated at line {i+1}")
        changes += 1

    # 6. .kpi-m — subtle transparent dark instead of grey
    if '.kpi-m{background:var(--card);border:1px solid var(--border-c);border-radius:10px;padding:11px 13px}' in ln:
        lines[i] = ln.replace(
            '.kpi-m{background:var(--card);border:1px solid var(--border-c);border-radius:10px;padding:11px 13px}',
            '.kpi-m{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:10px;padding:11px 13px}'
        )
        print(f"  [6] .kpi-m CSS updated at line {i+1}")
        changes += 1

with open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8', errors='replace') as f:
    f.writelines(lines)

print(f"\nDone — {changes} CSS rules updated")
