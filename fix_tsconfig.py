import json
cfg = {
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": False,
    "esModuleInterop": True,
    "resolveJsonModule": True,
    "skipLibCheck": True,
    "incremental": True,
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
with open("/root/zeroscreen/tsconfig.json", "w") as f:
    f.write(json.dumps(cfg, indent=2))
print("tsconfig.json written OK")
print(open("/root/zeroscreen/tsconfig.json").read())
