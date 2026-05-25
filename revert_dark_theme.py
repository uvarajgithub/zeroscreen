#!/usr/bin/env python3
# revert_dark_theme.py — restore original light theme CSS
path = '/root/zeroscreen/dist/server.js'
with open(path,'rb') as f:
    data = f.read()

changes = [
    # root
    (b':root{--green:#10b981;--red:#ef4444;--blue:#3b82f6;--amber:#f59e0b;--card:#111120;--border-c:rgba(148,163,184,.1);--muted:#64748b;--text-main:#dde1f0}html,body{background:#080812!important;color:#dde1f0!important}',
     b':root{--green:#059669;--red:#dc2626;--blue:#2563eb;--amber:#d97706;--card:var(--card-bg,#fff);--border-c:var(--border,#dde3f5);--muted:var(--text-muted,#5b6490);--text-main:var(--text,#0a0e27)}'),
    # db-layout
    (b'.db{max-width:1140px;margin:0 auto;padding:0 1rem 3rem}',
     b'.db{max-width:1080px;margin:0 auto;padding:0 .75rem 3rem}'),
    # pos-ce
    (b'.pos-ce{background:linear-gradient(135deg,rgba(23,37,84,.6),rgba(23,37,84,.3));border-color:rgba(59,130,246,.4);box-shadow:0 0 32px rgba(59,130,246,.08),inset 0 1px 0 rgba(255,255,255,.04)}',
     b'.pos-ce{background:linear-gradient(135deg,rgba(219,234,254,.55),rgba(219,234,254,.25));border-color:rgba(37,99,235,.3)}'),
    # pos-pe
    (b'.pos-pe{background:linear-gradient(135deg,rgba(84,20,20,.6),rgba(84,20,20,.3));border-color:rgba(239,68,68,.4);box-shadow:0 0 32px rgba(239,68,68,.08),inset 0 1px 0 rgba(255,255,255,.04)}',
     b'.pos-pe{background:linear-gradient(135deg,rgba(254,226,226,.55),rgba(254,226,226,.25));border-color:rgba(220,38,38,.3)}'),
    # pos-flat
    (b'.pos-flat{background:#111120;border-color:rgba(148,163,184,.1)}',
     b'.pos-flat{background:var(--card);border-color:var(--border-c)}'),
    # pnl-rs
    (b'.pos-pnl-rs{font-size:2.8rem;font-weight:800;letter-spacing:-.5px;line-height:1;font-variant-numeric:tabular-nums;transition:text-shadow .4s}.pos-pnl-rs.g{text-shadow:0 0 28px rgba(16,185,129,.5)}.pos-pnl-rs.r{text-shadow:0 0 28px rgba(239,68,68,.5)}',
     b'.pos-pnl-rs{font-size:2.6rem;font-weight:800;letter-spacing:-.5px;line-height:1;font-variant-numeric:tabular-nums}'),
    # pos-card
    (b'.pos-card{border-radius:16px;padding:22px 24px;border:1.5px solid;position:relative;overflow:hidden}',
     b'.pos-card{border-radius:14px;padding:20px 22px;border:1.5px solid;position:relative;overflow:hidden}'),
    # pos-b-ce
    (b'.pos-b-ce{background:rgba(59,130,246,.2);color:#60a5fa}',
     b'.pos-b-ce{background:#dbeafe;color:#1d4ed8}'),
    # pos-b-pe
    (b'.pos-b-pe{background:rgba(239,68,68,.2);color:#fca5a5}',
     b'.pos-b-pe{background:#fee2e2;color:#dc2626}'),
    # pos-b-flat
    (b'.pos-b-flat{background:rgba(100,116,139,.15);color:#8b94b2}',
     b'.pos-b-flat{background:rgba(100,116,139,.18);color:var(--muted)}'),
    # watch-card
    (b'.watch-card{padding:18px 22px;background:#111120;border:1.5px solid rgba(148,163,184,.1);border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,.35)}',
     b'.watch-card{padding:18px 22px;background:var(--card);border:1.5px solid var(--border-c);border-radius:14px}'),
    # kpi-m
    (b'.kpi-m{background:#111120;border:1px solid rgba(148,163,184,.08);border-radius:12px;padding:12px 14px;box-shadow:0 2px 8px rgba(0,0,0,.3)}',
     b'.kpi-m{background:var(--card);border:1px solid var(--border-c);border-radius:10px;padding:11px 13px}'),
    # kpi-m-v
    (b'.kpi-m-v{font-size:1.25rem;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}',
     b'.kpi-m-v{font-size:1.2rem;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}'),
    # tw
    (b'.tw{overflow-x:auto;border:1px solid rgba(148,163,184,.08);border-radius:14px;margin-bottom:4px;background:#0e0e1c}',
     b'.tw{overflow-x:auto;border:1px solid var(--border-c);border-radius:12px;margin-bottom:4px}'),
    # tt-th
    (b'.tt th{text-align:left;padding:10px 12px;font-size:.58rem;text-transform:uppercase;letter-spacing:.08em;color:#8b94b2;border-bottom:1px solid rgba(148,163,184,.08);font-weight:700;white-space:nowrap;background:rgba(255,255,255,.025)}',
     b'.tt th{text-align:left;padding:9px 11px;font-size:.6rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);border-bottom:1px solid var(--border-c);font-weight:700;white-space:nowrap;background:rgba(240,244,255,.8)}'),
    # tt-td
    (b'.tt td{padding:10px 12px;border-bottom:1px solid rgba(148,163,184,.06);vertical-align:middle}',
     b'.tt td{padding:9px 11px;border-bottom:1px solid rgba(51,65,85,.5);vertical-align:middle}'),
    # tt-hover
    (b'.tt tr:hover td{background:rgba(255,255,255,.03)}',
     b'.tt tr:hover td{background:rgba(240,244,255,.5)}'),
    # tt-e
    (b'.tt-e{text-align:center;padding:28px 16px;color:#475569;font-size:.82rem}',
     b'.tt-e{text-align:center;padding:24px 16px;color:var(--muted);font-size:.82rem}'),
    # db-badge-ce
    (b'.db-badge.ce{background:rgba(59,130,246,.18);color:#60a5fa}',
     b'.db-badge.ce{background:#dbeafe;color:#1d4ed8}'),
    # db-badge-pe
    (b'.db-badge.pe{background:rgba(239,68,68,.18);color:#fca5a5}',
     b'.db-badge.pe{background:#fee2e2;color:#dc2626}'),
    # ctl-wrap
    (b'.ctl-wrap{background:#111120;border:1px solid rgba(148,163,184,.08);border-radius:14px;padding:14px 16px;margin-bottom:1rem;overflow-x:auto}',
     b'.ctl-wrap{background:var(--card);border:1px solid var(--border-c);border-radius:12px;padding:14px 16px;margin-bottom:1rem;overflow-x:auto}'),
    # ctl-tooltip
    (b'.ctl-tooltip{display:none;position:absolute;bottom:100%;left:50%;transform:translateX(-50%);background:#1e1e30;border:1px solid rgba(148,163,184,.15);border-radius:8px;padding:7px 10px;font-size:.68rem;white-space:nowrap;z-index:10;margin-bottom:6px;box-shadow:0 8px 24px rgba(0,0,0,.5);color:#dde1f0}',
     b'.ctl-tooltip{display:none;position:absolute;bottom:100%;left:50%;transform:translateX(-50%);background:#fff;border:1px solid var(--border-c);border-radius:8px;padding:7px 10px;font-size:.68rem;white-space:nowrap;z-index:10;margin-bottom:6px;box-shadow:0 4px 12px rgba(0,0,0,.1);color:var(--text-main)}'),
    # ctl-tip-after
    (b'.ctl-tooltip::after{content:\'\';position:absolute;top:100%;left:50%;transform:translateX(-50%);border:5px solid transparent;border-top-color:#1e1e30}',
     b'.ctl-tooltip::after{content:\'\';position:absolute;top:100%;left:50%;transform:translateX(-50%);border:5px solid transparent;border-top-color:#fff}'),
    # pm-card
    (b'.pm-card{background:#111120;border:1.5px solid rgba(148,163,184,.1);border-radius:16px;padding:0;margin-bottom:1rem;overflow:hidden}',
     b'.pm-card{background:var(--card);border:1.5px solid var(--border-c);border-radius:14px;padding:0;margin-bottom:1rem;overflow:hidden}'),
    # ctl-empty
    (b'.ctl-bar.empty{background:rgba(255,255,255,.04);border:1px dashed rgba(148,163,184,.18)}',
     b'.ctl-bar.empty{background:rgba(100,116,139,.15);border:1px dashed rgba(100,116,139,.3)}'),
    # hb
    (b'.hb{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 16px;border-radius:14px;background:#111120;border:1px solid rgba(148,163,184,.08);margin-bottom:1.1rem}',
     b'.hb{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 16px;border-radius:12px;background:var(--card);border:1px solid var(--border-c);margin-bottom:1.1rem}'),
    # sec
    (b'.sec{font-size:.63rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#8b94b2;border-bottom:1px solid rgba(148,163,184,.07);padding-bottom:7px;margin:1.3rem 0 .75rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}',
     b'.sec{font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);border-bottom:1px solid var(--border-c);padding-bottom:7px;margin:1.3rem 0 .75rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}'),
    # pos-lbl
    (b'.pos-lbl{font-size:.55rem;color:#64748b;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px}',
     b'.pos-lbl{font-size:.56rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px}'),
    # pos-mode
    (b'.pos-mode{font-size:.59rem;background:rgba(255,255,255,.06);color:#8b94b2;padding:.12rem .45rem;border-radius:4px;font-weight:700;letter-spacing:.05em;border:1px solid rgba(255,255,255,.06)}',
     b'.pos-mode{font-size:.6rem;background:rgba(255,255,255,.07);color:var(--muted);padding:.1rem .4rem;border-radius:4px;font-weight:700;letter-spacing:.04em}'),
]

ok = True
for i,(old,new) in enumerate(changes):
    c = data.count(old)
    print(f'  {i+1}: {"OK" if c==1 else f"MISS({c})"}')
    if c != 1: ok = False

if not ok:
    print('ERROR: aborting')
    exit(1)

for old,new in changes:
    data = data.replace(old, new, 1)

with open(path,'wb') as f:
    f.write(data)
print('REVERTED OK')
