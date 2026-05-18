c = open('/home/ubuntu/trading-bot/dist/src/amina-live.js', 'r', encoding='utf-8').read()

idx = c.find('// --- 15-min candle Telegram update ---')
if idx < 0:
    print('block not found'); exit()

# find end of the try/catch block - look for the closing brace followed by SCANNING comment
end_marker = '} catch(_) {}\n        // '
end_idx = c.find(end_marker, idx)
if end_idx < 0:
    print('end not found')
    print(repr(c[idx:idx+800]))
    exit()

old_block = c[idx:end_idx + len('} catch(_) {}')]
print('FOUND, length:', len(old_block))
print('ENDS WITH:', repr(old_block[-50:]))
