import json, time, datetime, os

# Bot heartbeat
hb_path = '/root/zeroscreen/data/bot-heartbeat.json'
state_path = '/root/zeroscreen/data/trade-state.json'
token_path = '/root/zeroscreen/data/kite-token.json'

print("=== BOT HEARTBEAT ===")
try:
    d = json.load(open(hb_path))
    at = d.get('at','')
    if at:
        ts = datetime.datetime.fromisoformat(at.replace('Z','+00:00'))
        age_min = round((datetime.datetime.now(datetime.timezone.utc) - ts).total_seconds()/60, 1)
        print(f"Last beat: {at}  ({age_min} min ago)")
        print(f"Alive: {'YES' if age_min < 3 else 'NO - OFFLINE'}")
    print(f"Status: {d.get('status','?')}")
    print(f"In Trade: {d.get('inTrade', d.get('activeTrade','?'))}")
    print(f"Live Price: {d.get('livePrice','?')}")
    print(f"Qty: {d.get('qty','?')}  |  SL pts: {d.get('slPts','?')}")
    print(f"Token Valid: {d.get('tokenValid','?')}")
    print(f"Trade count today: {d.get('tradeCount','?')}")
except Exception as e:
    print(f"ERROR: {e}")

print("\n=== TRADE STATE ===")
try:
    s = json.load(open(state_path))
    print(f"Active trade: {s.get('activeTrade', s.get('mainEntryDone','?'))}")
    print(f"Direction: {s.get('tradeDirection','none')}")
    print(f"Entry price: {s.get('entryPrice','?')}")
    print(f"Daily reset: {s.get('dailyDate','?')}")
except Exception as e:
    print(f"ERROR: {e}")

print("\n=== KITE TOKEN ===")
try:
    t = json.load(open(token_path))
    at2 = t.get('generatedAt', t.get('at',''))
    print(f"Token exists: YES")
    print(f"Generated at: {at2}")
    print(f"Access token (first 8): {str(t.get('accessToken','?'))[:8]}...")
except Exception as e:
    print(f"ERROR reading token: {e}")
    print(f"Token file exists: {os.path.exists(token_path)}")
