import io
p = "apps/web/src/components/FilingPackageView.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = "import { apiClient } from '../lib/api';"
new = "import { apiClient, downloadAnnexPdf } from '../lib/api';"
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("ok")
