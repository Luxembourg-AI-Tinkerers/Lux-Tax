import io

p = "packages/validation/test/mortgage-year.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
crlf = "\r\n" in raw
s = raw.replace("\r\n", "\n")

old = "  hasDonations: false,\n};"
new = "  hasDonations: false,\n  hasLifeInsuranceOrPensionPlan: false,\n};"
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new, 1)

if crlf:
    s = s.replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("patched, crlf=", crlf)
