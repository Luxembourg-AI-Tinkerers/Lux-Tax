import io

p = "apps/web/src/components/QuestionnaireView.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
crlf = "\r\n" in raw
s = raw.replace("\r\n", "\n")

old = """              {answers.spouseResidence &&
                answers.spouseResidence !== (answers.nonResidentAssimilation ? 'NON_RESIDENT' : 'RESIDENT') && (
                  <label className="flex items-start gap-2 text-[11px] text-slate-700">"""
new = """              {answers.spouseResidence && (
                  <label className="flex items-start gap-2 text-[11px] text-slate-700">"""
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new, 1)

if crlf:
    s = s.replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
