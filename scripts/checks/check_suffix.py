raw=open('/root/zeroscreen/dist/server.js','rb').read()
# Also check what comes right after the last static row (closing of the tbody)
idx = raw.find(b'${!<tr>')
print(repr(raw[idx-15:idx+20]))
# Find the closing and check what follows
# The last row ends with </tr> and then </tbody>
end_idx = raw.find(b'</tbody>', idx)
print('tbody close at:', end_idx)
print(repr(raw[end_idx-20:end_idx+10]))
