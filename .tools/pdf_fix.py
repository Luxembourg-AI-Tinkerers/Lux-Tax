import io
p = "apps/api/src/modules/filing/annex-pdf.builder.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """  text(page, MARGIN, MARGIN - 14, `Document de préparation — annexe ${index + 1}/${meta ? '' : ''}`, 7);
  return page;"""
new = """  void index;
  return page;"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("ok")
