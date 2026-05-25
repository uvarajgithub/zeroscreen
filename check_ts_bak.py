import subprocess

# Check the server.ts.bak files
r = subprocess.run(['ls', '-la', '/root/zeroscreen/src/server.ts.bak', '/root/zeroscreen/server.ts.bak'], 
                   capture_output=True)
print(r.stdout.decode())
print(r.stderr.decode())

# Check size of current server.ts
r2 = subprocess.run(['wc', '-c', '/root/zeroscreen/src/server.ts'], capture_output=True)
print("Current server.ts size:", r2.stdout.decode())
