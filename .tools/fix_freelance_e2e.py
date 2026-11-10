import io

p = r"B:\B\tax-app\apps\api\test\freelance-lifecycle.e2e-spec.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """    const boxes = filingPkg.form100Boxes || [];
    const aliceIncomeBox = boxes.find((b: any) => b.boxNumber === '21');
    const aliceExpenseBox = boxes.find((b: any) => b.boxNumber === '23');
    const bobIncomeBox = boxes.find((b: any) => b.boxNumber === '22');
    const bobExpenseBox = boxes.find((b: any) => b.boxNumber === '24');

    expect(aliceIncomeBox).toBeDefined();
    expect(parseFloat(aliceIncomeBox.amount)).toBe(12000);
    expect(aliceExpenseBox).toBeDefined();
    expect(parseFloat(aliceExpenseBox.amount)).toBe(3000);
    expect(bobIncomeBox).toBeDefined();
    expect(parseFloat(bobIncomeBox.amount)).toBe(8000);
    expect(bobExpenseBox).toBeDefined();
    expect(parseFloat(bobExpenseBox.amount)).toBe(1500);"""

new = """    // Since LEG-7 the package emits ONE net-profit line per owner on C/A
    // 501 (taxpayer) / 502 (spouse) — never a gross income line plus a positive
    // expense line. The pre-LEG-7 assertions used boxNumber 21/22/23/24, which
    // no longer exist on the 100F.
    const boxes = filingPkg.form100Boxes || [];
    const netProfitBoxes = boxes.filter(
      (b: any) => b.kind === 'FORM_100' && b.sheet === 'C/A',
    );

    const aliceBox = netProfitBoxes.find((b: any) => b.caseNumber === '501');
    const bobBox = netProfitBoxes.find((b: any) => b.caseNumber === '502');

    expect(aliceBox).toBeDefined();
    // Alice: 12 000 revenue − 3 000 expenses = 9 000 net profit.
    expect(parseFloat(aliceBox.amount)).toBe(9000);
    expect(bobBox).toBeDefined();
    // Bob: 8 000 revenue − 1 500 expenses = 6 500 net profit.
    expect(parseFloat(bobBox.amount)).toBe(6500);

    // A gross revenue line and a positive expense line must not exist.
    expect(boxes.some((b: any) => b.caseNumber === '21' || b.caseNumber === '23')).toBe(false);"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
