import io
import glob

bad = []
for path in glob.glob(r"B:\B\tax-app\apps\api\test\*.e2e-spec.ts"):
    raw = io.open(path, encoding="utf-8-sig", newline="").read()
    if "\r\r\n" in raw:
        raw = raw.replace("\r\r\n", "\r\n")
        io.open(path, "w", encoding="utf-8", newline="").write(raw)
        bad.append(path)
print("repaired", len(bad))
for p in bad:
    print(" ", p)
