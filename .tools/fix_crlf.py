import io, re

paths = [
    r"B:\B\tax-app\apps\api\src\modules\filing\filing.service.ts",
]

for p in paths:
    raw = io.open(p, encoding="utf-8-sig", newline="").read()
    before = raw.count("\r\r\n")
    if before:
        raw = raw.replace("\r\r\n", "\r\n")
    io.open(p, "w", encoding="utf-8", newline="").write(raw)
    print(p, "fixed", before, "double-CR;", "stray CR:", raw.count("\r") - raw.count("\r\n"))
