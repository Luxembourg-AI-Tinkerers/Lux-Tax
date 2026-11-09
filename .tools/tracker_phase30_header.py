import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

pairs = [
    ("Everything else is implemented and evidenced (373 tests, 8 migrations, zero drift).",
     "Everything else is implemented and evidenced (384 tests, 8 migrations, zero drift)."),
    ("> - **Implemented and tested:** Phases 0–29 — tax engine, filing package + annex PDFs, eight",
     "> - **Implemented and tested:** Phases 0–30 — tax engine, filing package + annex PDFs, eight"),
]

for old, new in pairs:
    assert s.count(old) == 1, old[:60]
    s = s.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
