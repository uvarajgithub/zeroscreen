import subprocess

r = subprocess.run(['curl', '-sv', 'http://localhost:4000/signals'], capture_output=True)
headers = r.stderr.decode('utf-8', errors='replace')
body = r.stdout.decode('utf-8', errors='replace')

print("Status:", headers[headers.find('< HTTP'):headers.find('< HTTP')+30])
print("Body length:", len(body))
print("First 300 chars:")
print(body[:300])
