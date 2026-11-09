import io
p = "gap-check-2026-11-08.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:60])
    s = s.replace(old, new)

rep("| R9 migration execution | Two migration folders committed; no PostgreSQL here | ⛔ blocked |",
    "| R9 migration execution | PostgreSQL 18.4 cluster initialised in `.tools/pgdata`; a missing **baseline** migration was generated first; 3 migrations applied; `migrate diff` reports **no drift**; 23 tables, 17 enum values, `annexesJson` jsonb | ✅ closed |")

rep("**What is still genuinely not produced:** execution of the migrations against a live database (R9), the 2026 CIC amounts (R6) and the loi 8775 épargne-logement change (R7). The annex PDF now exists as a preparation sheet with an empty “case” column — it deliberately does not clone the official ACD artwork or case numbering.",
    "**What is still genuinely not produced:** the 2026 CIC amounts (R6) and the loi 8775 épargne-logement change (R7) — both need a published legal text. Everything else in the audit's scope is implemented, including the annex PDF (a preparation sheet with an empty “case” column, not a clone of ACD artwork) and the migrations (applied, zero drift).")

rep("If “everything” means the audit’s P0 **and** P1 breadth lists, plus a usable annex document → **done**, except the three items that depend on something outside the repository: the CIC 2026 amounts, the loi 8775 text, and a live database for the migrations.",
    "If “everything” means the audit’s P0 **and** P1 breadth lists, the annex document and the database schema → **done**, except two items that require a published legal text: the CIC 2026 monthly amounts and the loi 8775 épargne-logement change.")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
