import io

p = "packages/tax-engine/test/mixed-couple.spec.ts"
s = io.open(p, encoding="utf-8", newline="").read()
s = s.replace("'LIR-ART-3-D'", "'LIR-ART-3-d'")
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("occurrences now:", s.count("'LIR-ART-3-d'"))
