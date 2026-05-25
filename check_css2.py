with open('/root/zeroscreen/src/server.ts','rb') as f:
    c = f.read()

# Find the </style> that closes the sig3 style block
# The sig3 style block starts around sig3-dot CSS
idx_dot = c.find(b'sig3-dot{')
# Find next </style> after sig3-dot
idx_style_end = c.find(b'    </style>\n', idx_dot)
print("sig3-dot at:", idx_dot)
print("</style> at:", idx_style_end)
# show the last 300 bytes before </style>
print(repr(c[idx_style_end-200:idx_style_end+20]))
