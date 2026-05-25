with open('/root/zeroscreen/src/server.ts','rb') as f:
    c = f.read()

patches = []

# ── P3: add subtitle rows 2 + 3 ─────────────────────────────────────────────
# After row1 ending "Max 5 trades/day</div>" before "\n      </div>\n      <div class="sig3-live""
p3_old = (b' &middot; Max 5 trades/day</div>\n'
          b'      </div>\n'
          b'      <div class="sig3-live">')
p3_new = (b' &middot; Max 5 trades/day</div>\n'
          b'        <div class="sig3-sub" style="margin-top:3px">'
          b'PDH: <span id="sig3-pdh" style="color:#10b981;font-weight:600">'
          b'${hb2?.bhavPrevDayHigh ?? "&mdash;"}</span>'
          b' &middot; PDL: <span id="sig3-pdl" style="color:#ef4444;font-weight:600">'
          b'${hb2?.bhavPrevDayLow ?? "&mdash;"}</span>'
          b' &middot; Candles today: <span id="sig3-cndl">${hb2?.bhavCandles ?? "&mdash;"}</span>'
          b' &middot; &#8377; P&amp;L: idx pts &times; 15 &middot; prem pts &times; 30</div>\n'
          b'        <div class="sig3-sub" style="margin-top:3px">'
          b'5yr Backtest (Jan&rsquo;21&ndash;May&rsquo;26):'
          b' <strong style="color:#10b981">&#8377;31.07L</strong>'
          b' &middot; 74.6% WR &middot; &#8377;2,583 avg/trade &middot; MaxDD &#8377;11,027</div>\n'
          b'      </div>\n'
          b'      <div class="sig3-live">')
if p3_old in c:
    c = c.replace(p3_old, p3_new, 1); patches.append('P3 subtitle rows 2+3 OK')
else:
    patches.append('P3 NOT FOUND')

# ── P5: inject hm CSS before </style></head> ────────────────────────────────
p5_old = b'\n  </style>\n</head>\n<body class="page-theme-signals">'
p5_new = (
    b'\n'
    b'    .sig3-hm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-bottom:1rem;margin-top:.75rem}\n'
    b'    .sig3-hm-card{background:var(--card-bg,#1e293b);border:1px solid var(--border,#334155);border-radius:10px;padding:13px 16px;display:flex;align-items:center;gap:11px;transition:border-color .3s}\n'
    b'    .sig3-hm-card.hm-ok{border-color:rgba(16,185,129,.4)}\n'
    b'    .sig3-hm-card.hm-warn{border-color:rgba(251,191,36,.5)}\n'
    b'    .sig3-hm-card.hm-err{border-color:rgba(239,68,68,.5)}\n'
    b'    .sig3-hm-card.hm-dim{border-color:var(--border,#334155)}\n'
    b'    .sig3-hm-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;background:#475569}\n'
    b'    .sig3-hm-card.hm-ok .sig3-hm-dot{background:#10b981}\n'
    b'    .sig3-hm-card.hm-warn .sig3-hm-dot{background:#fbbf24;box-shadow:0 0 6px rgba(251,191,36,.6)}\n'
    b'    .sig3-hm-card.hm-err .sig3-hm-dot{background:#ef4444;box-shadow:0 0 7px rgba(239,68,68,.7);animation:sig3hmBlink 1s infinite}\n'
    b'    @keyframes sig3hmBlink{0%,100%{opacity:1}50%{opacity:.25}}\n'
    b'    .sig3-hm-label{font-size:.67rem;color:var(--text-muted,#94a3b8);text-transform:uppercase;letter-spacing:.05em;line-height:1}\n'
    b'    .sig3-hm-val{font-size:.82rem;font-weight:700;margin-top:4px;line-height:1.2}\n'
    b'    .sig3-hm-sub{font-size:.7rem;opacity:.65;margin-top:3px;line-height:1.2}\n'
    b'    .sig3-hm-fix button,.sig3-hm-fix a{font-size:.7rem;padding:2px 8px;border-radius:4px;cursor:pointer;border:1px solid currentColor;background:transparent;text-decoration:none;margin-top:4px;display:inline-block}\n'
    b'    .sig3-hm-alerts{display:flex;flex-direction:column;gap:8px;margin-bottom:1rem}\n'
    b'    .sig3-hm-alert{border-radius:10px;padding:11px 16px;border:1px solid;display:flex;align-items:flex-start;gap:12px}\n'
    b'    .sig3-hm-alert.hm-alert-err{background:rgba(239,68,68,.07);border-color:rgba(239,68,68,.4);color:#fca5a5}\n'
    b'    .sig3-hm-alert.hm-alert-warn{background:rgba(251,191,36,.07);border-color:rgba(251,191,36,.4);color:#fde68a}\n'
    b'    .sig3-hm-alert-title{font-weight:700;font-size:.82rem}\n'
    b'    .sig3-hm-alert-msg{font-size:.73rem;opacity:.8;margin-top:2px}\n'
    b'    .sig3-hm-alert-btn{display:inline-block;margin-top:7px;padding:3px 11px;border-radius:5px;font-size:.71rem;font-weight:700;cursor:pointer;border:1px solid currentColor;background:transparent;color:inherit;text-decoration:none}\n'
    b'  </style>\n</head>\n<body class="page-theme-signals">'
)
if p5_old in c:
    c = c.replace(p5_old, p5_new, 1); patches.append('P5 hm CSS OK')
else:
    patches.append('P5 NOT FOUND')

with open('/root/zeroscreen/src/server.ts', 'wb') as f:
    f.write(c)

print('\n'.join(patches))
print('WRITTEN OK, size:', len(c))
