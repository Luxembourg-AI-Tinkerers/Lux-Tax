import io
p = "gap-check-2026-11-08.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:60])
    s = s.replace(old, new)

rep("**What is still genuinely not produced:** only the *published numbers* — the 2026 CIC monthly table and the loi 8775 Mémorial text. Neither exists on 2026-11-08 (ACD newsletter unchanged: first constitutional vote only). Both are gated in the rule package with their source and activation diff, and a test proves that flipping the gate produces the expected credit and cap. This is an external dependency, not unfinished code.",
    "**What is still genuinely not produced:** only the *published numbers* — the 2026 CIC monthly table and the loi 8775 Mémorial text. Re-checked on 2026-11-08 across three sources: the ACD newsletter is unchanged (first constitutional vote only), the Chambre dossier 8775 lists nothing after “Déposé 22.06.2026”, and no ACD CIC 2026 page exists. Both are gated in the rule package with their source and activation diff; a **safety gate** now returns 0 for any CIC table whose measure is still `NOT_IN_FORCE`, so bill numbers can never be paid out early. Tests cover both states. This is an external dependency, not unfinished code.")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
