import io

# FactsView label
p = "apps/web/src/components/FactsView.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = "All financial values confirmed here are directly injected into the 2025 calculation engine and Form 100."
new = "All financial values confirmed here are injected into the versioned calculation engine and the Form 100 package for the workspace tax year."
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))

# engine: explicit CIC note for 2026
p2 = "packages/tax-engine/src/engine.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
old2 = """    if (pkg.singleClass) {"""
new2 = """    if (taxYear === 2026) {
      warnings.push(
        'The 2026 crédit d’impôt conjoncture (1 June – 31 December 2026) is not modelled: its monthly amounts were not published in a Mémorial text at the time this rule package was built. The withholding simulation may therefore be conservative.',
      );
    }
    if (pkg.singleClass) {"""
assert s2.count(old2) == 1
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace(old2, new2).replace("\n", "\r\n"))
print("ok")
