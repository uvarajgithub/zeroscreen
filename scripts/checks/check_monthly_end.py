raw=open('/root/zeroscreen/dist/server.js','rb').read()
idx = raw.find(b'<!-- MONTHLY P&L -->')
# Find end of the monthly table section
# Look for '</table>' after MONTHLY P&L, then the closing div
t_idx = raw.find(b'</table>', idx)
print('</table> at:', t_idx)
print('Context around </table>:', repr(raw[t_idx:t_idx+80]))
print()
# Check for sig3-tw closing div
div_idx = raw.find(b'</div>', t_idx)
print('</div> at:', div_idx)
print('Context:', repr(raw[div_idx:div_idx+100]))
