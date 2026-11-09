import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("**Last updated:** 2026-11-08 · Phase 1–5 implemented · 36 golden tests passing · gap check: `gap-check-2026-11-08.md`",
    "**Last updated:** 2026-11-08 · Phase 1–6 implemented · **43 tests passing (36 engine + 7 annex PDF)** · gap check: `gap-check-2026-11-08.md`")

rep("""# 36 golden tests (ACD-checked values + 2025/2026 divergence + treaties + plus-values + CISSM + securities + rental register + Art. 3 d)
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts""",
"""# 36 engine golden tests
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts

# 7 annex-PDF tests
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test apps/api/test/annex-pdf.spec.ts

# both suites (43)
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts""")

rep("| R8 | Annex production | ✅ | `annexes[]` (190/210, 700, 104, CIM request) persisted, rendered and printable; official ACD PDF not replicated |",
    "| R8 | Annex PDF generation | ✅ | dependency-free PDF builder (`annex-pdf.builder.ts`), JWT-protected `GET …/filing-package/annexes.pdf`, one page per annex + cover; 7 tests |")

rep("""## Gap check (2026-11-08)""",
"""## Phase 6 — annex PDF generation

The last product gap (an official-layout annex document) is closed with a
dependency-free PDF writer, because no PDF library can be installed in this
workspace.

| Piece | File | Behaviour |
|---|---|---|
| PDF engine | `apps/api/src/modules/filing/annex-pdf.builder.ts` | PDF 1.4, A4, Helvetica/Helvetica-Bold, correct xref + startxref, latin-1 text with `(` `)` `\\` escaping, automatic pagination |
| Layout | same | cover page (household, taxpayer, class, annex list, reference) then one page per annex: header band, reason, property/taxpayer block, label → amount → **empty “case” column**, declaration + signature lines, footer |
| Data source | persisted `FilingPackage.annexesJson` | no recomputation: the PDF renders exactly what the package stored |
| API | `annex-pdf.service.ts` + `GET /api/workspaces/:id/filing-package/annexes.pdf` | JWT + household guard, `application/pdf`, `Content-Disposition`, `X-Annex-Count`; 400 when no package/annex, 404 when no workspace |
| UI | `FilingPackageView` | **Download annex PDF** (blob download through the authenticated API) next to **Print** |
| Tests | `apps/api/test/annex-pdf.spec.ts` | 7 tests: PDF envelope, page count = annexes + 1, codes/values present, disclaimer + signature, xref offsets resolve to real objects, escaping, single-page assembler |

**Scope statement kept in the document itself:** the PDF is a *preparation sheet*
(“ne remplace pas le formulaire officiel ACD”), with an empty case column so the
taxpayer transcribes into the administration’s own form. It deliberately does not
clone the official ACD artwork or case numbering.

## Gap check (2026-11-08)""")

rep("""| 2026-11-08 | Golden tests | ✅ **36 / 36 pass** |""",
"""| 2026-11-08 | Engine golden tests | ✅ **36 / 36 pass** |
| 2026-11-08 | Annex PDF tests | ✅ **7 / 7 pass** |
| 2026-11-08 | Combined run | ✅ **43 / 43 pass** |""")

rep("""| 3.5 | Annexes 190/210, 700, 104 | ✅ | `annexes[]` with values, reason, `produced: false`, UI card + Print / Save as PDF |""",
"""| 3.5 | Annexes 190/210, 700, 104, CIM | ✅ | `annexes[]` persisted; **PDF generated** by `annex-pdf.builder.ts` and downloadable from the filing view |""")

rep("""| 2.12 | Securities + rental inputs in the questionnaire | ✅ | one-row entry each, mapped to `securities` / `rentalProperties` |""",
"""| 2.12 | Securities + rental inputs in the questionnaire | ✅ | one-row entry each, mapped to `securities` / `rentalProperties` |
| 2.13 | Annex PDF endpoint + download button | ✅ | `GET …/filing-package/annexes.pdf`; blob download in `FilingPackageView` |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
