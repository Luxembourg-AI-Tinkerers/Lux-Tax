import io

for path in ["gap-check-2026-11-08.md", "implementation-tracker.md"]:
    s = io.open(path, encoding="utf-8", newline="").read()
    print(path)
    print("  em dash present:", "\u2014" in s)
    print("  mojibake present:", "\u00e2\u20ac\u201d" in s)
    print("  head:", repr(s[:60]))
