import io

# contracts filing: annex data
p = "packages/contracts/src/filing.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """export interface FilingPackageDto {"""
new = """export interface AnnexRequestDto {
  /** ACD annex code, e.g. "190/210", "700", "104". */
  code: string;
  title: string;
  /** Why the annex is required for this return. */
  reason: string;
  /** Values the user must carry into the official annex. */
  fields: Array<{ label: string; value: string }>;
  /** False when the app supplies the data but does not generate the official PDF. */
  produced: boolean;
}

export interface FilingPackageDto {"""
assert s.count(old) == 1
s = s.replace(old, new)

old2 = """  form100Boxes: Form100BoxMapping[];
  myGuichetGuide: MyGuichetStepGuide[];"""
new2 = """  form100Boxes: Form100BoxMapping[];
  /** ACD annexes implied by the declared income and deductions. */
  annexes: AnnexRequestDto[];
  myGuichetGuide: MyGuichetStepGuide[];"""
assert s.count(old2) == 1
s = s.replace(old2, new2)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("contracts ok")
