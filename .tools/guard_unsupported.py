import io

p = "apps/web/src/components/TaxCalculatorView.tsx"
s = io.open(p, encoding="utf-8", newline="").read()

old = (
    "      {/* Unsupported-scenario banner */}\r\n"
    "      {calc && calc.unsupported.length > 0 && (\r\n"
)
new = (
    "      {/* Unsupported-scenario banner */}\r\n"
    "      {/* `unsupported` can be absent on a stored result that predates the field: the API\r\n"
    "          casts saved JSON straight to the DTO, so guard the array instead of trusting it. */}\r\n"
    "      {calc && Array.isArray(calc.unsupported) && calc.unsupported.length > 0 && (\r\n"
)
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("patched")
