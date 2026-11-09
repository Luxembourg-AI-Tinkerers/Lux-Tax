import io
p = "apps/mobile/src/components/DocumentCameraScanner.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """import { mobileApiClient } from '../lib/api-client';"""
new = """import { mobileApiClient } from '../lib/api-client';
import { enqueueOperation, isNetworkError, replayQueue } from '../lib/queue-runtime';"""
assert s.count(old) == 1
s = s.replace(old, new)

# replay when the scanner opens
old2 = """export function DocumentCameraScanner({"""
assert s.count(old2) == 1
idx = s.index(old2)
# add a tiny effect after the component's first useState line is risky; instead add on-open flush in props destructure area
print("import added")
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
