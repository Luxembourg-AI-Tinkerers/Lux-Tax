import io
p = "packages/tax-engine/test/tax-engine.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = """  test('CIC: no table published -> no credit, mechanism ready', () => {"""
block = """  test('CIC safety gate: a bill table is not paid while the measure is not in force', () => {
    const table = { bands: [{ from: 1_000, to: 20_000, slope: 0, offset: 10 }], topAmount: 10 };

    const billOnly = {
      ...pkg2026,
      cic: table,
      pendingMeasures: (pkg2026.pendingMeasures ?? []).map((m) => ({
        ...m,
        status: m.id === 'CIC_2026' ? ('NOT_IN_FORCE' as const) : m.status,
      })),
    };
    close(cicForSalary(60_000, billOnly), 0);

    const inForce = {
      ...billOnly,
      pendingMeasures: (pkg2026.pendingMeasures ?? []).map((m) => ({
        ...m,
        status: m.id === 'CIC_2026' ? ('IN_FORCE' as const) : m.status,
      })),
    };
    close(cicForSalary(60_000, inForce), 120);
  });

  test('CIC: no table published -> no credit, mechanism ready', () => {"""
assert s.count(anchor) == 1
s = s.replace(anchor, block)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
