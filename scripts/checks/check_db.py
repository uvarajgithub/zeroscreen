import subprocess
result = subprocess.run(
    ['sqlite3', '/root/zeroscreen/zeroscreen.db', ".tables"],
    capture_output=True, text=True
)
print("TABLES:", result.stdout)
