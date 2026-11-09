import io
p = "apps/mobile/src/lib/workspace.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace("""import type { LuxTaxApiClient } from '@luxtax/api-client';

""", "")
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
