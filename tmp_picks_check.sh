#!/bin/bash
# Check intraday picks vs current prices
declare -A picks
picks["VEDL"]="SHORT:272.36:270.74:266.66:274.27"
picks["HFCL"]="LONG:115.68:116.38:118.12:114.87"
picks["MEESHO"]="LONG:192.55:193.71:196.61:191.2"
picks["SYNGENE"]="LONG:466.25:469.05:476.07:462.97"
picks["CEMPRO"]="LONG:812.8:817.7:829.92:807.1"

echo "Stock | Dir | Entry_Low | Entry_High | Target | SL | Current | Status"
echo "-------|-----|-----------|------------|--------|-----|---------|-------"

for sym in VEDL HFCL MEESHO SYNGENE CEMPRO; do
  IFS=':' read -r dir el eh tgt sl <<< "${picks[$sym]}"
  price=$(curl -s "https://www.nseindia.com/api/quote-equity?symbol=$sym" \
    -H "User-Agent: Mozilla/5.0" -H "Accept: */*" -H "Referer: https://www.nseindia.com" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['priceInfo']['lastPrice'])" 2>/dev/null)
  
  if [ -z "$price" ]; then status="fetch_err"; 
  elif [ "$dir" = "LONG" ]; then
    if python3 -c "exit(0 if $price >= $el and $price <= $eh else 1)" 2>/dev/null; then status="IN ENTRY ZONE"
    elif python3 -c "exit(0 if $price > $eh else 1)" 2>/dev/null; then status="ABOVE ENTRY"
    elif python3 -c "exit(0 if $price < $sl else 1)" 2>/dev/null; then status="SL HIT"
    elif python3 -c "exit(0 if $price >= $tgt else 1)" 2>/dev/null; then status="TARGET HIT"
    else status="BELOW ENTRY"
    fi
  else
    if python3 -c "exit(0 if $price <= $eh and $price >= $el else 1)" 2>/dev/null; then status="IN ENTRY ZONE"
    elif python3 -c "exit(0 if $price < $el else 1)" 2>/dev/null; then status="BELOW ENTRY (profit)"
    elif python3 -c "exit(0 if $price > $sl else 1)" 2>/dev/null; then status="SL HIT"
    else status="ABOVE ENTRY"
    fi
  fi
  echo "$sym | $dir | $el | $eh | $tgt | $sl | $price | $status"
done
