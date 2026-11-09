import io
p = "packages/tax-engine/test/tax-engine.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """    const synthetic = {
      ...pkg2026,
      cic: {
        bands: [{ from: 1_000, to: 2_000, slope: 0, offset: 10 }],
        topAmount: 20,
      },
    };"""
new = """    const synthetic = {
      ...pkg2026,
      cic: {
        bands: [{ from: 1_000, to: 2_000, slope: 0, offset: 10 }],
        topAmount: 20,
      },
      // Activate the measure, otherwise the safety gate correctly returns 0.
      pendingMeasures: (pkg2026.pendingMeasures ?? []).map((m) => ({
        ...m,
        status: m.id === 'CIC_2026' ? ('IN_FORCE' as const) : m.status,
      })),
    };"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("ok")
