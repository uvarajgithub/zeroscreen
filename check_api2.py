import subprocess, json

r = subprocess.run(['curl', '-s', 'http://localhost:4000/api/bot/status'], capture_output=True)
try:
    d = json.loads(r.stdout)
    print("TOP LEVEL KEYS:", list(d.keys()))
    print("\ntoday:", json.dumps(d.get('today'), indent=2))
    print("\nweekly:", json.dumps(d.get('weekly'), indent=2))
    print("\nallTime:", json.dumps(d.get('allTime'), indent=2))
    hb = d.get('heartbeat', {})
    print("\nheartbeat keys:", list(hb.keys()))
    print("heartbeat ts/time:", hb.get('ts') or hb.get('time') or hb.get('lastSeen') or hb.get('updatedAt'))
except Exception as e:
    print("ERROR:", e)
    print("Raw:", r.stdout[:500])
