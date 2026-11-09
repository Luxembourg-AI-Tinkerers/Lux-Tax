import io, re

contracts = io.open("packages/contracts/src/tax.ts", encoding="utf-8").read()
m = re.search(r"export interface TaxCalculationParams \{(.*?)\n\}", contracts, re.S)
assert m, "params interface not found"
fields = re.findall(r"^\s{2}([A-Za-z_][A-Za-z0-9_]*)\??\s*:", m.group(1), re.M)
fields = [f for f in dict.fromkeys(fields) if f != "facts"]
print("engine params (%d):" % len(fields), ", ".join(fields))

svc = io.open("apps/api/src/modules/calculations/calculations.service.ts", encoding="utf-8").read()
missing = [f for f in fields if not re.search(r"\b" + re.escape(f) + r"\b", svc)]
print("\nNOT mentioned in calculations.service.ts:", missing)
