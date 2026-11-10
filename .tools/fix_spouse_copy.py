import io

p = r"B:\B\tax-app\apps\web\src\components\FilingPackageView.tsx"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = "      showFeedback('success', 'Return version approved successfully! Both spouses can now review.');"

new = """      // A single filer has no spouse to notify; the copy said otherwise.
      const activeMembers = household?.members?.filter((m) => m.status === 'ACTIVE').length ?? 1;
      showFeedback(
        'success',
        activeMembers > 1
          ? 'Return version approved successfully! Both spouses can now review.'
          : 'Return version approved successfully!',
      );"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
