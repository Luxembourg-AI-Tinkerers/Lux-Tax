import io
import os

root = r"B:\B\tax-app"
checked = 0
repaired = []

for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [
        d for d in dirnames
        if d not in {'.git', 'node_modules', 'dist', '.next', 'tmp', '.tools', '.zwork', 'uploads'}
    ]
    for name in filenames:
        if not name.endswith(('.ts', '.tsx', '.json', '.md', '.prisma', '.sql', '.mjs', '.cjs')):
            continue
        path = os.path.join(dirpath, name)
        try:
            raw = io.open(path, encoding='utf-8', newline='').read()
        except (UnicodeDecodeError, OSError):
            continue
        checked += 1
        if '\r\r\n' in raw:
            io.open(path, 'w', encoding='utf-8', newline='').write(raw.replace('\r\r\n', '\r\n'))
            repaired.append(os.path.relpath(path, root))

print('checked', checked)
print('repaired', len(repaired))
for r in repaired[:15]:
    print(' ', r)
