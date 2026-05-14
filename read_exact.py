#!/usr/bin/env python3
# Read exact bytes for matching
src = open('/root/zeroscreen/dist/server.js', 'rb').read()
idx = src.find(b'TRAIL shadow')
print('TRAIL shadow header:', repr(src[idx:idx+80]))
idx2 = src.find(b'sh-trail-wr')
line_start = src.rfind(b'\n', 0, idx2) + 1
print('sh-trail-wr line:', repr(src[line_start:line_start+120]))
idx3 = src.find(b'sh-pos-trail-flat')
line_start3 = src.rfind(b'\n', 0, idx3) + 1
print('sh-pos-trail-flat line:', repr(src[line_start3:line_start3+150]))
idx4 = src.find(b'trailDefault')
print('trailDefault line:', repr(src[max(0,idx4-50):idx4+80]))
idx5 = src.find(b'LOCK50 Old shadow')
print('LOCK50 Old shadow header:', repr(src[idx5:idx5+80]))
