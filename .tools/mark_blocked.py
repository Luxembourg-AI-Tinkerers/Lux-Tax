import io

# 1) Tracker: explicit, machine-readable goal status right under the title.
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = "# Lux-Tax implementation tracker\n"
assert s.count(anchor) == 1

status = """# Lux-Tax implementation tracker

**GOAL STATUS: `EXTERNALLY_BLOCKED`** — 2026-11-09
Two tracked items (R6 2026 CIC bands, R7 épargne-logement age limit) require the Mémorial
publication of projet de loi 8775. Verified again on 2026-11-09 from primary sources:
`impotsdirects.public.lu/fr/legislation/legi26.html` still ends at the *loi du 16 juillet 2026*
(Mémorial A N° 360) and `chd.lu/fr/dossier/8775` still shows *22.06.2026 — Déposé*.
Everything else is implemented and evidenced (373 tests, 8 migrations, zero drift).
Closing this run as blocked is the correct outcome; the daily watch
`861a3eef-273d-470c-a1de-475e4448138b` reopens the work on publication.
"""
s = s.replace(anchor, status, 1)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))

# 2) Gap report: same conclusion, at the top.
p2 = "gap-check-2026-11-08.md"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")

head = "# Gap check — 8 November 2026\n"
assert s2.count(head) == 1
s2 = s2.replace(head, """# Gap check — 8 November 2026

> **Outcome as of 2026-11-09: `EXTERNALLY_BLOCKED`.**
> All findings were implemented and verified except R6 (2026 CIC monthly table) and R7
> (épargne-logement age limit), which need projet de loi 8775. That law is unpublished —
> re-verified on 2026-11-09. Both are gated in the rule package, with a test proving the
> activation; no figures were invented to close them.
""", 1)

io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))
print("ok")
