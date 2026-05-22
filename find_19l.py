import json, os
files = ['strategy-research-result.json','strategy-research-v2-result.json','5year-backtest-result.json','5yr_clean_result.json','5year_new_strategy_result.json']
base = '/home/ubuntu/trading-bot/'
for fname in files:
    try:
        d = json.load(open(base+fname))
        def search(obj, path=''):
            if isinstance(obj, dict):
                rs = obj.get('totalRs') or obj.get('totalProfit') or obj.get('rs') or obj.get('profit')
                pts = obj.get('totalPts') or obj.get('pts') or obj.get('points')
                if rs and abs(rs) > 400000:
                    print(f'{fname} | {path}: pts={pts}, rs=Rs{rs:,.0f}')
                for k,v in obj.items():
                    search(v, path+'.'+str(k) if path else str(k))
        search(d)
    except Exception as e:
        print(f'{fname}: {e}')
