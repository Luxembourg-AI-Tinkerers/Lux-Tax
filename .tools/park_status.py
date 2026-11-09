import io, re

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
crlf = "\r\n" in raw
s = raw.replace("\r\n", "\n")

pattern = re.compile(
    r"\*\*GOAL STATUS: `EXTERNALLY_BLOCKED`\*\* — 2026-11-09\n.*?reopens the work on publication\.\n",
    re.S,
)
match = pattern.search(s)
assert match, "status block not found"
print("---- replaced block ----")
print(match.group(0))

new_status = """**GOAL STATUS: `PARKED`** — 2026-11-09
R6 (2026 CIC bands) and R7 (épargne-logement age limit) are **deferred to the backlog**, not queued as
the current task. They need the Mémorial publication of projet de loi 8775, which does not exist yet:
`impotsdirects.public.lu/fr/legislation/legi26.html` still ends at the *loi du 16 juillet 2026*
(Mémorial A N° 360) and `chd.lu/fr/dossier/8775` still shows *22.06.2026 — Déposé*.
Everything else is implemented and evidenced (488 tests, 8 migrations, zero drift). Active work
continues on the rest of the repository; the daily watch `861a3eef-273d-470c-a1de-475e4448138b`
unparks R6/R7 on publication.
"""

s = s[: match.start()] + new_status + s[match.end() :]
if crlf:
    s = s.replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("tracker status replaced")
