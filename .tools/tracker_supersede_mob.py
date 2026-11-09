import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

# Find the last "MOB-1..11 unchanged" table row and append a superseding note after that table.
marker = "| Mobile | MOB-1..11 unchanged; `apps/mobile` is outside the workspace build |"
assert s.count(marker) >= 1
last = s.rfind(marker)

# The table ends at the next blank line after the marker.
end = s.find("\n\n", last)
assert end != -1

note = """

> **Superseded (2026-11-09):** the “unchanged” status above is historical. MOB-1…11 were
> delivered in Phases 19–29: workspace-id fixes (MOB-1), the dead `submitTaxProfile` call
> (MOB-2), the offline queue and its wiring (MOB-3/MOB-4), private-draft redaction (MOB-5),
> authenticated package download (MOB-6), push/offline policy (MOB-7), deep links (MOB-8),
> app-lock policy (MOB-9), export/share (MOB-10) and the two renderers (MOB-11). The mobile
> **policy** layers carry 74 tests; the **rendering** layer is transpile-only because no React
> Native runtime exists here. The only items still open are R6/R7 — blocked on projet de loi 8775.
"""

s = s[:end] + note + s[end:]

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
