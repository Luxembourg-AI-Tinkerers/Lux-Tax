import io
p = "apps/mobile/src/lib/push-and-status.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """  return previous.level === 'OFFLINE' && next.isConnected !== false && pendingOperations > 0;"""
new = """  return previous.level === 'OFFLINE' && next.level !== 'OFFLINE' && pendingOperations > 0;"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("ok")
