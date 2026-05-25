with open('/root/zeroscreen/dist/server.js', 'rb') as f:
    cur = f.read()

# ── Step 1: Remove the misplaced hb CSS (currently sitting outside <style>) ──
hb_css_pos = cur.find(b'\n    .hb{display:flex')
hb_css_end_marker = cur.find(b'\n    .bot-ctl-wrap{', hb_css_pos)
# Find end of bot-ctl-menu rule (closing })
bot_rule_end = cur.find(b'}', hb_css_end_marker + 20)
while cur[bot_rule_end+1:bot_rule_end+2] != b'\n':
    bot_rule_end = cur.find(b'}', bot_rule_end+1)
misplaced_css = cur[hb_css_pos:bot_rule_end+1]
print(f"Misplaced CSS at {hb_css_pos}..{bot_rule_end+1} ({len(misplaced_css)} bytes)")
print(misplaced_css[:200].decode('utf-8','replace'))
cur = cur[:hb_css_pos] + cur[bot_rule_end+1:]
print("Removed misplaced CSS")

# ── Step 2: Build the hb CSS (single-row, hardcoded colors) ──────────────────
hb_css = b"""
    .hb{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;overflow-x:auto;padding:10px 16px;border-radius:12px;background:#1a2236;border:1px solid #334155;margin-bottom:1.1rem}
    .hb-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:.7rem;font-weight:700;border:1px solid transparent;white-space:nowrap;flex-shrink:0}
    .hb-pill.ok{background:rgba(16,185,129,.12);border-color:rgba(16,185,129,.3);color:#10b981}
    .hb-pill.warn{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.3);color:#f59e0b}
    .hb-pill.err{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.35);color:#ef4444}
    .hb-pill.dim{background:rgba(100,116,139,.1);border-color:rgba(100,116,139,.2);color:#94a3b8}
    .hb-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0}
    .hb-dot.blink{animation:blink 1.2s infinite}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
    .hb-age{margin-left:auto;font-size:.68rem;color:#94a3b8;white-space:nowrap;flex-shrink:0}
    .bot-ctl-wrap{position:relative;flex-shrink:0}
    .bot-ctl-menu{display:none;position:absolute;right:0;top:110%;background:#1e293b;border:1px solid #334155;border-radius:8px;min-width:150px;z-index:999;box-shadow:0 8px 24px rgba(0,0,0,.5);overflow:hidden}"""

# ── Step 3: Insert CSS before the signals page </style></head> ────────────────
# Find: </style> just before </head><body class="page-theme-signals">
marker = b'</style>\n</head>\n<body class="page-theme-signals">'
idx = cur.find(marker)
if idx == -1:
    marker = b'</style>\n  </head>\n  <body class="page-theme-signals">'
    idx = cur.find(marker)
if idx == -1:
    # Try finding </head><body class="page-theme-signals"> and go back to find </style>
    head_body = cur.find(b'</head>\n<body class="page-theme-signals">')
    if head_body == -1:
        head_body = cur.find(b'<body class="page-theme-signals">')
    idx = cur.rfind(b'</style>', 0, head_body)
    print(f"Fallback: </style> at {idx}, </head> at {head_body}")
    marker = cur[idx:idx+len(b'</style>')]

print(f"CSS insertion point (</style>): {idx}")
cur = cur[:idx] + hb_css + b'\n  ' + cur[idx:]

# ── Step 4: Write ─────────────────────────────────────────────────────────────
with open('/root/zeroscreen/dist/server.js', 'wb') as f:
    f.write(cur)

print(f"Done. Size: {len(cur)}")

# Verify
test = cur[cur.find(b'<body class="page-theme-signals">'):cur.find(b'<body class="page-theme-signals">')+50]
idx2 = cur.find(b'.hb{')
print(f".hb CSS now at: {idx2}")
print(f"Signals body at: {cur.find(b'<body class=\"page-theme-signals\">')}")
print("OK" if idx2 < cur.find(b'<body class="page-theme-signals">') else "STILL WRONG - CSS after body")
