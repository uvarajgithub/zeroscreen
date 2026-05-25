import subprocess

# Check the dist/server.js BEFORE our last recompile (we need the git-stashed or backup)
# First check if there's a backup of dist/server.js
r = subprocess.run(['ls', '-la', '/root/zeroscreen/dist/'], capture_output=True)
print(r.stdout.decode())

# Check if there's a .bak or backup file
r2 = subprocess.run(['find', '/root/zeroscreen/', '-name', '*.bak', '-o', '-name', '*.orig', '-o', '-name', '*.backup'], 
                    capture_output=True)
print("Backups:", r2.stdout.decode())

# Check git reflog to see if there was a stash
r3 = subprocess.run(['git', '-C', '/root/zeroscreen/', 'stash', 'list'], capture_output=True)
print("Git stash:", r3.stdout.decode())

r4 = subprocess.run(['git', '-C', '/root/zeroscreen/', 'reflog', '--oneline', '-10'], capture_output=True)
print("Git reflog:", r4.stdout.decode())
