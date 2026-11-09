import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = """>   Both are gated in the rule package with their source and activation diff, and a test proves the
>   activation. No number has been invented to close them."""

replacement = """>   Both are gated in the rule package with their source and activation diff, and a test proves the
>   activation. No number has been invented to close them.
>
> **Recommendation: close this run as `externally blocked`.** Every other item is implemented and
> evidenced. R6/R7 cannot move until the Mémorial publishes projet de loi 8775; the daily watch
> (`861a3eef-273d-470c-a1de-475e4448138b`, 08:00 Europe/Luxembourg, read-only) reports that morning,
> and activation is the four documented edits — `cic.bands`, `savingsHousingYoungMaxAge: 200`,
> both `pendingMeasures` → `IN_FORCE`, then the suite. Re-checked again at the end of this run:
> `legi26.html` still ends at the *loi du 16 juillet 2026*, unchanged."""

assert s.count(anchor) == 1
s = s.replace(anchor, replacement)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
