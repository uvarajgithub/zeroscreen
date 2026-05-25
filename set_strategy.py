import json
path = "/home/ubuntu/trading-bot/user-settings.json"
with open(path) as f:
    d = json.load(f)
d["activeStrategy"] = "BHAV_V3"
with open(path, "w") as f:
    json.dump(d, f, indent=2)
print("done:", d)
