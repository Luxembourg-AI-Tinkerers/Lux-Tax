import io

p = r"B:\B\tax-app\apps\api\test\calculation-snapshot.spec.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """  test('returns null when the snapshot carries no cote', () => {
    assert.strictEqual(cimSplit(credits({ cim: 750 }), undefined), null);
  });"""

new = """  test('returns null when neither a stored split nor a cote is available', () => {
    const bare = credits({ cim: 750 });
    delete (bare as Record<string, unknown>).cimApplied;
    delete (bare as Record<string, unknown>).cimRefund;
    assert.strictEqual(cimSplit(bare, undefined), null);
  });

  test('a stored split wins over recomputation, even with no cote', () => {
    assert.deepStrictEqual(
      cimSplit(credits({ cim: 750, cimApplied: 0, cimRefund: 750 }), undefined),
      { applied: 0, refund: 750 },
    );
  });"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
