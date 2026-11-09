import io
p = "apps/mobile/src/lib/deep-links.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);"""
new = """  // With a custom scheme the first segment is parsed as the *host*:
  // `luxtax://notifications` → hostname "notifications", pathname "". Put it back so
  // the route grammar is the same for `luxtax://x/y` and `https://host/x/y`.
  const pathSegments = url.pathname.split('/').filter((segment) => segment.length > 0);
  const segments =
    scheme === APP_SCHEME && url.hostname ? [decodeURIComponent(url.hostname), ...pathSegments] : pathSegments;"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("ok")
