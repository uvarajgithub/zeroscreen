#!/usr/bin/env python3
"""Read exact bytes to build correct patch"""
import subprocess

raw = subprocess.run(
    "iconv -f UTF-16 -t UTF-8 /home/ubuntu/trading-bot/src/index.ts",
    shell=True, capture_output=True
)
lines_bytes = raw.stdout.split(b'\n')

print("=== L472 ===")
print(repr(lines_bytes[471]))
print()
print("=== L1982-1988 ===")
for l in lines_bytes[1981:1988]:
    print(repr(l))
