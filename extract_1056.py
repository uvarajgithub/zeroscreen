import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

path = r'c:\Users\LENOVO\AppData\Roaming\Code\User\workspaceStorage\4cb6232631bc1d47f86848884929e8b3\GitHub.copilot-chat\transcripts\6fa6470a-cbec-47a2-a4fa-4daec4e5810f.jsonl'
lines = open(path, encoding='utf-8').readlines()

# Line 1056 has big multi_replace (18067 chars) - likely the picks tracker HTML
obj = json.loads(lines[1056])
data = obj.get('data', {})
args_str = data.get('arguments', '{}')
args = json.loads(args_str) if isinstance(args_str, str) else args_str
tool = data.get('toolName', '')

sys.stdout.write(f"Tool: {tool}\n")
reps = args.get('replacements', [])
sys.stdout.write(f"Number of replacements: {len(reps)}\n")

for j, r in enumerate(reps):
    ns = r.get('newString', '')
    os_s = r.get('oldString', '')
    sys.stdout.write(f"\n  Rep {j+1}: ns_len={len(ns)}\n")
    sys.stdout.write(f"  oldString: {os_s[:120]}\n")
    sys.stdout.write(f"  newString: {ns[:150]}\n")
    if len(ns) > 1000:
        fname = f'rec_1056_rep{j+1}.txt'
        open(fname, 'w', encoding='utf-8').write(ns)
        sys.stdout.write(f"  Saved: {fname}\n")

sys.stdout.flush()
