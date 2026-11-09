import io
p = "gap-check-2026-11-08.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:60])
    s = s.replace(old, new)

rep("| R8 annexes | `annexes[]` (190/210, 700, 104, CIM request) computed from the return, persisted, rendered with a **Print / Save as PDF** action | ✅ data + print |",
    "| R8 annexes | `annexes[]` computed and persisted; a dependency-free **PDF builder** renders cover + one page per annex, exposed at `GET …/filing-package/annexes.pdf` and downloaded from the filing view (7 tests) | ✅ closed |")

rep("**What is still genuinely not produced:** an official ACD annex *PDF* (the data and a printable view exist, the official layout does not), and execution of the migrations against a live database.",
    "**What is still genuinely not produced:** execution of the migrations against a live database (R9), the 2026 CIC amounts (R6) and the loi 8775 épargne-logement change (R7). The annex PDF now exists as a preparation sheet with an empty “case” column — it deliberately does not clone the official ACD artwork or case numbering.")

rep("If “everything” means the audit’s P0 **and** P1 breadth lists → **done**, except the three items that depend on something outside the repository: the CIC 2026 amounts, the loi 8775 text, and a live database for the migrations.",
    "If “everything” means the audit’s P0 **and** P1 breadth lists, plus a usable annex document → **done**, except the three items that depend on something outside the repository: the CIC 2026 amounts, the loi 8775 text, and a live database for the migrations.")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
