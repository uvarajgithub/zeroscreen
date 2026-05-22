with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8') as f:
    content = f.read()

before_tick_trail = content.count('TICK TRAIL')
before_lock50_old = content.count('LOCK50 Old')
before_amina = content.count('AMINA')

print(f"BEFORE -> TICK TRAIL: {before_tick_trail}, LOCK50 Old: {before_lock50_old}, AMINA: {before_amina}")

content = content.replace('TICK TRAIL', 'AMINA')
content = content.replace('LOCK50 Old', 'AMINA Lock50')

with open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8') as f:
    f.write(content)

with open('/root/zeroscreen/dist/server.js', 'r', encoding='utf-8') as f:
    content2 = f.read()

after_tick_trail = content2.count('TICK TRAIL')
after_lock50_old = content2.count('LOCK50 Old')
after_amina = content2.count('AMINA')

print(f"AFTER  -> TICK TRAIL: {after_tick_trail}, LOCK50 Old: {after_lock50_old}, AMINA: {after_amina}")
print("Done!")
