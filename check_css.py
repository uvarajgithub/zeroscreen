with open('/root/zeroscreen/src/server.ts','rb') as f:
    c = f.read()

# Check what follows sig3-dot (and next few lines to find </style>)
idx = c.find(b'sig3-dot{')
segment = c[idx:idx+600]
print("After sig3-dot CSS:")
print(repr(segment))
