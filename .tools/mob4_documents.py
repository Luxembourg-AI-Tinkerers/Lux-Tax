import io
p = "apps/mobile/app/(tabs)/documents.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """import { resolveWorkspace } from '../../src/lib/workspace';"""
new = """import { resolveWorkspace } from '../../src/lib/workspace';
import { replayQueue } from '../../src/lib/queue-runtime';"""
assert s.count(old) == 1
s = s.replace(old, new)

old2 = """          if (docsRes.data) setDocuments(docsRes.data);"""
new2 = """          // MOB-4: replay queued uploads so a scan sent offline appears here.
          try {
            await replayQueue(mobileApiClient);
          } catch {
            // best effort; the queue retries on the next refresh
          }

          if (docsRes.data) setDocuments(docsRes.data);"""
assert s.count(old2) == 1
s = s.replace(old2, new2)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("documents wired")
