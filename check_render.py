import sys, subprocess, re

r = subprocess.run(['curl', '-s', 'http://localhost:4000/signals'], capture_output=True)
d = r.stdout.decode('utf-8', errors='replace')

# Check subtitle rows
idx = d.find('sig3-sub')
if idx != -1:
    print("sig3-sub found:")
    print(d[idx:idx+600])
else:
    print("sig3-sub NOT FOUND")

# Check health monitor grid
idx2 = d.find('sig3-hm-grid')
print("\nsig3-hm-grid:", "FOUND" if idx2 != -1 else "NOT FOUND")
if idx2 != -1:
    print(d[idx2:idx2+200])

# Check BHAV V3
print("\nBHAV V3:", "FOUND" if 'BHAV V3' in d else "NOT FOUND")

# check hm CSS
print("sig3-hm-card CSS:", "FOUND" if 'sig3-hm-card' in d else "NOT FOUND")
