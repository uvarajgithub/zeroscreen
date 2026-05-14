import json
d=json.load(open('/tmp/hb2.json'))
print('shadowInTrade:', d.get('shadowInTrade'))
print('shadowEntry:', d.get('shadowEntry'))
print('scalp1InTrade:', d.get('scalp1InTrade'))
print('scalp1Entry:', d.get('scalp1Entry'))
print('scalp1Dir:', d.get('scalp1Dir'))
