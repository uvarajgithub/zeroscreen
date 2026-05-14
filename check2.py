src = open('/root/zeroscreen/dist/server.js').read()
needle = 'id="stab-trail"'
i = src.find(needle)
print('stab-trail pos:', i)
print(repr(src[max(0,i-5):i+160]))
print()
idx = src.find('.stab-wrap{')
print('stab CSS:', repr(src[idx:idx+300]))
print()
# check for form tags near tabs
i2 = src.find('class="stab-wrap"')
chunk = src[max(0,i2-3000):i2]
print('Has form tag near tabs:', '<form' in chunk)
print('Last form close before tabs:', chunk.rfind('</form>'))
