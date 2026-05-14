#!/usr/bin/env python3
f = open('/root/zeroscreen/dist/server.js', encoding='utf-8').read()

before1 = 'trailDefault\n        </div>\n      </div>'
after1  = 'trailDefault</div>\n        </div>\n      </div>'
before2 = 'trailLock50Old\n        </div>\n      </div>'
after2  = 'trailLock50Old</div>\n        </div>\n      </div>'

c1 = f.count(before1)
c2 = f.count(before2)
print(f"trailDefault occurrences: {c1}")
print(f"trailLock50Old occurrences: {c2}")

f = f.replace(before1, after1, 1)
f = f.replace(before2, after2, 1)

open('/root/zeroscreen/dist/server.js', 'w', encoding='utf-8').write(f)
print("DONE")
