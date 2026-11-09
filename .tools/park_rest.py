import io

# ---------------------------------------------------------------- tracker: parked record
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
crlf = "\r\n" in raw
s = raw.replace("\r\n", "\n")

old_head = "## Closing record — 2026-11-09\n"
new_head = """## Parked record — 2026-11-09

**Deferred, not blocking.** R6 and R7 were moved out of the active queue: no work inside this
repository can complete them, because the figures must come from a published law. The rest of the
tracker stays active.

| Deferred row | Why it cannot be worked now | Unparks when |
|---|---|---|
| **R6** — 2026 CIC monthly bands | The table exists only in projet de loi 8775; there is no Mémorial text | the watch reports a new ACD law entry |
| **R7** — épargne-logement age limit | Same law; the 40-year condition is still in force, so `savingsHousingYoungMaxAge` stays `40` | same |

Unparking is four documented commands (`docs/8775-activation-handoff.md`), proven end-to-end on a
throwaway copy in Phase 33 exactly so that day is mechanical.

"""
assert s.count(old_head) == 1, s.count(old_head)
s = s.replace(old_head, new_head, 1)

old_decision = "**Decision: this goal is closed as `EXTERNALLY_BLOCKED`.** Recorded here rather than only in the\nstatus line, so the basis is auditable later.\n"
new_decision = "**Decision: parked.** Recorded here rather than only in the status line, so the basis is auditable\nand nobody re-opens these rows by accident.\n"
assert s.count(old_decision) == 1, s.count(old_decision)
s = s.replace(old_decision, new_decision, 1)

if crlf:
    s = s.replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(s)

# ---------------------------------------------------------------- handoff card
p2 = "docs/8775-activation-handoff.md"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
crlf2 = "\r\n" in raw2
h = raw2.replace("\r\n", "\n")
old_open = "**Read this if** the daily watch `861a3eef-273d-470c-a1de-475e4448138b` has reported a **new entry**\nin the ACD list of laws for 2026, or if you are otherwise told the Mémorial published loi 8775."
new_open = """**Status: PARKED, not pending.** R6 and R7 sit in the backlog; nothing in the active queue depends on
them. Do not re-open them on a hunch — only a published text unparks them.

**Read this if** the daily watch `861a3eef-273d-470c-a1de-475e4448138b` has reported a **new entry**
in the ACD list of laws for 2026, or if you are otherwise told the Mémorial published loi 8775."""
assert h.count(old_open) == 1, h.count(old_open)
h = h.replace(old_open, new_open, 1)
if crlf2:
    h = h.replace("\n", "\r\n")
io.open(p2, "w", encoding="utf-8", newline="").write(h)

# ---------------------------------------------------------------- gap check
p3 = "gap-check-2026-11-08.md"
raw3 = io.open(p3, encoding="utf-8", newline="").read()
crlf3 = "\r\n" in raw3
g = raw3.replace("\r\n", "\n")
old_g = "> **Outcome as of 2026-11-09: `EXTERNALLY_BLOCKED`.**"
new_g = "> **Outcome as of 2026-11-09: `PARKED` — R6/R7 deferred to the backlog, not blocking.**"
assert g.count(old_g) == 1, g.count(old_g)
g = g.replace(old_g, new_g, 1)
if crlf3:
    g = g.replace("\n", "\r\n")
io.open(p3, "w", encoding="utf-8", newline="").write(g)

print("ok")
