import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""| 2026-11-08 | Scheduled watch created | ✅ task `861a3eef…` daily 08:00 Europe/Luxembourg, client notification, read-only |""",
"""| 2026-11-08 | Scheduled watch created | ✅ task `861a3eef…` daily 08:00 Europe/Luxembourg, client notification, read-only |
| 2026-11-09 | Watch confirmed enabled (`schedule_task list`, revision 2) | ✅ cron `0 8 * * *` Europe/Luxembourg, client notification |
| 2026-11-09 | `legi26.html` + `chd.lu/fr/dossier/8775` re-check | ⛔ **no change** — law list still ends 16.07.2026; dossier unchanged since 22.06.2026 |""")

rep("""**Status of R6 / R7: BLOCKED (external).** Re-checked again on 2026-11-08: no change.""",
"""**Status of R6 / R7: BLOCKED (external).** Re-checked on 2026-11-09: no change.""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
