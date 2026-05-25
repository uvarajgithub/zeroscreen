with open('/root/zeroscreen/src/server.ts','rb') as f:
    c = f.read()

idx_dot = c.find(b'sig3-dot{')
# Try different forms of </style>
for pat in [b'</style>', b'  </style>', b'    </style>', b'\n    </style>']:
    idx = c.find(pat, idx_dot)
    print(f"Pattern {repr(pat)}: found at {idx}")
    if idx != -1:
        print("  Context:", repr(c[idx-80:idx+20]))
        break
