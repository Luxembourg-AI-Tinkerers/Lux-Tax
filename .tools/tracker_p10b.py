import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""## Phase 9 — publication gate (R6 / R7 as data switches)""",
"""## Phase 10 — definitive publication check (2026-11-08)

The ACD publishes the authoritative list **“Lois votées en 2026 ayant une incidence sur la
fiscalité directe”** (`impotsdirects.public.lu/fr/legislation/legi26.html`). Read today, the
**last entry is the loi du 16 juillet 2026** (Mémorial A N° 360 du 17 juillet 2026).

**Projet de loi 8775 is not in that list** — it has not been voted definitively and has not
been published. A Legilux ELI probe for a November 2026 law returns 404, which is expected
for an act that does not exist.

> **Status of R6 / R7: BLOCKED (external).** Not unfinished code, not a missing
> implementation. Two published documents are required and neither exists on 2026-11-08:
> (a) the 2026 CIC monthly table, (b) the loi 8775 text removing the épargne-logement age
> limit. Everything that depends on the repository is done; the four activation steps are
> documented in Phase 9 and proven by test.

Watch list, in order of reliability:

1. `impotsdirects.public.lu/fr/legislation/legi26.html` — the list above; 8775 appears here the day it is voted and published.
2. `impotsdirects.public.lu/fr/archive/newsletter/2026/` — ACD announces the entry into force.
3. `chd.lu/fr/dossier/8775` — vote and text of the bill.
4. ACD A–Z page `…/credit-impot-conjoncture/` — the 2026 table replaces the 2023 one.

## Phase 9 — publication gate (R6 / R7 as data switches)""")

rep("""| 2026-11-08 | Combined run after the CIC safety gate | ✅ **48 / 48 pass** |""",
"""| 2026-11-08 | Combined run after the CIC safety gate | ✅ **48 / 48 pass** |
| 2026-11-08 | ACD “Lois votées en 2026” list · Legilux ELI probe | ⛔ 8775 absent — last law 16.07.2026 (Mémorial A 360); ELI 404 |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
