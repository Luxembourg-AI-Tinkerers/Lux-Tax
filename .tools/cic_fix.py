import io
p = "packages/tax-engine/src/credits.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """  for (const band of table.bands) {
    if (monthly >= band.from && monthly <= band.to) {
      const value = band.slope * (monthly - band.from) + band.offset;
      return ceilCent(Math.max(0, value) * 12);
    }
  }

  if (table.topAmount !== undefined) return ceilCent(table.topAmount * 12);
  return 0;"""
new = """  const bands = table.bands;
  if (bands.length === 0) return 0;

  // Below the first band the credit is not granted.
  if (monthly < bands[0].from) return 0;

  for (const band of bands) {
    if (monthly >= band.from && monthly <= band.to) {
      const value = band.slope * (monthly - band.from) + band.offset;
      return ceilCent(Math.max(0, value) * 12);
    }
  }

  // Above the last band: the flat top amount, when the table defines one.
  const last = bands[bands.length - 1];
  if (monthly > last.to && table.topAmount !== undefined) return ceilCent(table.topAmount * 12);
  return 0;"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("ok")
