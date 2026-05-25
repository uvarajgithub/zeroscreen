import re

with open('/root/zeroscreen/dist/server.js','r',errors='replace') as f:
    txt=f.read()

# Find all occurrences of app.get("/signals"
for m in re.finditer(r'app\.get\("/signals"', txt):
    print(f"app.get('/signals') at: {m.start()}")
    # Show context
    print(txt[m.start():m.start()+100])
    print("---")

# Also check what's the HTML file at 576525 - is it inline or loaded?
idx = txt.find('Live Bot Dashboard')
# Look forward from idx to find route that follows this response
next_route = txt.find('app.get(', idx)
print(f"\nNext route after bot dashboard: at {next_route}")
print(txt[next_route:next_route+80])
