import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""## Phase 10 — definitive publication check (2026-11-08)""",
"""## Phase 11 — automated publication watch

Manual polling is replaced by a scheduled job, as requested.

| Field | Value |
|---|---|
| Task id | `861a3eef-273d-470c-a1de-475e4448138b` |
| Label | Lux-Tax — projet de loi 8775 publication watch |
| Schedule | cron `0 8 * * *`, timezone `Europe/Luxembourg` (daily 08:00) |
| Notification | client |
| Policies | overlap `skip`, misfire `run_once` (6 h grace), retry 3 × 5 min |
| Status | enabled |

What it does each morning:

1. Reads `impotsdirects.public.lu/fr/legislation/legi26.html` and compares against the
   seven-law baseline of 2026-11-08.
2. Reads `chd.lu/fr/dossier/8775` and checks for activity after “22.06.2026 — Déposé”.
3. **No change** → answers exactly one line: `8775 not published yet (<date>)`.
4. **Change** → reports the law date + Mémorial number, quotes the title, and prints the
   five-step activation checklist (add `cic.bands`, set `savingsHousingYoungMaxAge: 200`,
   flip `pendingMeasures`, run the suite, update this tracker).

The job is deliberately **read-only**: it never edits the repository, so a false positive
cannot corrupt the tax rules. Activation stays a reviewed, human-triggered change.

Manage with `schedule_task` (`list` / `pause` / `resume` / `delete`) and the task id above.

## Phase 10 — definitive publication check (2026-11-08)""")

rep("""| 2026-11-08 (re-check) | `legi26.html` + `chd.lu/fr/dossier/8775` | ⛔ **no change** — law list still ends 16.07.2026; dossier still “Déposé 22.06.2026”, last update 22.06.2026 |""",
"""| 2026-11-08 (re-check) | `legi26.html` + `chd.lu/fr/dossier/8775` | ⛔ **no change** — law list still ends 16.07.2026; dossier still “Déposé 22.06.2026”, last update 22.06.2026 |
| 2026-11-08 | Scheduled watch created | ✅ task `861a3eef…` daily 08:00 Europe/Luxembourg, client notification, read-only |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
