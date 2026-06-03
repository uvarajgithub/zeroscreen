raw=open('/root/zeroscreen/dist/server.js','rb').read()
idx = raw.find(b'th-panel-m')
print('th-panel-m at:', idx)

# Find the res.send BEFORE th-panel-m more precisely
# Look for "res.send(`" (backtick template)
send_idx = raw.rfind(b'res.send(`', 0, idx)
print('Nearest res.send before:', send_idx)

# Find the route that contains this res.send
route_idx = raw.rfind(b'app.get(', 0, send_idx)
print('Route:', repr(raw[route_idx:route_idx+80]))
