import re
path = "/home/ubuntu/trading-bot/src/index.ts"
with open(path, encoding='utf-8-sig') as f:
    content = f.read()

# Find line 535
lines = content.split('\n')
print("Line 535:", repr(lines[534]))

# Test exact trail regex
trail_m = re.search(r'\(trailCtx \? `\\n\S+\\n\$\{trailCtx\}` : ""\)', content)
print("trail_m:", trail_m is not None)
if trail_m:
    print("match:", repr(trail_m.group(0)[:80]))
