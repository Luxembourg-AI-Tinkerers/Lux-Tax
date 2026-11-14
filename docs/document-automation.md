# Document automation — from upload to a filed return

**Goal.** An upload becomes confirmed figures, a calculation and a Form 100 package
without the taxpayer retyping anything, and every figure can be traced back to the
line it was printed on.

**Last updated:** 2026-11-10 · **Phases DA-1 … DA-10 implemented and measured.**

Status legend: ✅ done · 🟡 partial · ⬜ todo · ⛔ blocked by the environment

| Phase | Scope | State |
|---|---|---|
| [DA-1](#da-1--read-the-text-layer-of-a-real-pdf) | Read the text layer of a real PDF | ✅ |
| [DA-2](#da-2--one-entry-point-and-an-honest-state) | One entry point; "cannot read" is a state | ✅ |
| [DA-3](#da-3--a-vision-model-through-a-validated-contract) | Vision model behind a validated contract | ✅ |
| [DA-4](#da-4--stop-mislabelling-documents) | Correct document types | ✅ |
| [DA-5](#da-5--confirm-a-documents-figures-at-once) | Confirm a document's figures at once | ✅ |
| [DA-6](#da-6--re-read-a-stored-document) | Re-read a stored document | ✅ |
| [DA-7](#da-7--the-vault-tells-the-truth) | The vault tells the truth | ✅ |
| [DA-9](#da-9--in-process-ocr-for-images) | In-process OCR for images | ✅ |
| [DA-10](#da-10--scanned-pdfs-reach-the-same-ocr) | Scanned PDFs reach the same OCR | ✅ |
| [DA-8](#da-8--verification) | Verification | ✅ |
| [Backlog](#backlog-explicitly-not-done) | What is deliberately not done, and why | — |

---

## The gap this closes

Measured before DA-1, from the code and the real files in this workspace:

| Fact | Evidence |
|---|---|
| Extraction ran `fileBuffer.toString('utf-8')` and keyword-matched the result | `receipt-ai-vision.service.ts`, pre-DA-2 |
| A real PDF is a container of FlateDecode streams, so that call produced noise | `100f-2025.pdf`: `%PDF-1.7`, `FlateDecode` present, no `Rémunération` in the raw bytes |
| A photo produced nothing at all, and nothing said so | closed by DA-9: local OCR, or an explicit `NEEDS_OCR` |
| "AI" was a slot that no shipped model filled | four built-in models, none with an `endpointUrl` |
| Every figure needed its own HTTP request and click | `POST /facts/confirm`, one `extractedFactId` per call |
| A training invoice, a dental bill and a generic receipt were all stored as `CHILDCARE_INVOICE` | branches F, H, M of the old cascade |

The result was an app that could calculate a return precisely and could not read the
documents the return is made of.

---

## DA-1 — read the text layer of a real PDF

**Delivered.** `apps/api/src/modules/documents/text/pdf-text.ts` — a dependency-free
reader: object index (including objects packed into `/ObjStm` streams), FlateDecode,
`/ToUnicode` CMaps (`bfchar`, `bfrange`, array form), Identity-H two-byte codes,
WinAnsi/Latin-1 fallback, and a content-stream scanner that inserts line breaks at
`Td`/`TD`/`T*`/`Tm`. No native module, no `pdfjs`, nothing to install.

**Measured on the files in the workspace:**

| File | Pages | Characters | Printable | Streams decoded | Result |
|---|---|---|---|---|---|
| `100f-2025.pdf` (Form 100) | 20 | 43 148 | 99.76 % | 27 | `TEXT_LAYER`, readable |
| `lir2025.pdf` (the law) | 359 | 597 847 | 98.6 % | 358 | `TEXT_LAYER`, readable |

(Characters exclude whitespace; the raw strings are 51 493 and 725 220 characters.)

The form's own wording is recovered — `Détermination du revenu net provenant d'une
occupation salariée`, case numbers `1601`, `1553`, `702` — and the law's cover reads
`Loi modifiée du 4 décembre 1967 concernant l'impôt sur le revenu`. The cover only
decodes once object streams are indexed, which is what the second pass in
`indexObjectStreams` is for.

**Acceptance.** `apps/api/test/pdf-text.spec.ts` — 13 tests, including both real
files, a synthetic uncompressed PDF, an image-only page, a truncated file, an
encrypted file, and the quality gate.

---

## DA-2 — one entry point, and an honest state

**Delivered.** `text/document-text.ts` returns exactly one of four sources —
`TEXT_LAYER`, `EMBEDDED_TEXT`, `PLAIN_TEXT`, `NONE` — plus `needsOcr`, a user-facing
`reason`, and the page count. A photographed receipt is `NONE` with
*"This is an image, not a text document. Reading it needs an OCR model."* instead of a
silent empty fact list.

**Persisted.** Migration `20261110190000_document_ocr_state`:

- `DocumentStatus.NEEDS_OCR` — stored, but nothing could be read;
- `ExtractionSource` enum + `Document.extractionSource`;
- `Document.ocrRequired` + a partial index for the "needs attention" filter.

`DocumentExtraction.rawJson` now keeps the provenance (`source`, `modelUsed`,
`reason`, `rejectedFields`, `textCharacters`) instead of a bare field array.

**Acceptance.** `apps/api/test/document-text.spec.ts` — 10 tests.

---

## DA-3 — a vision model through a validated contract

**Delivered.** `extraction/vision-contract.ts`, all pure functions:

- `buildVisionPrompt` pins the field vocabulary (24 names) and the JSON shape;
- `normalizeAmount` reads `1.234,56` and `1,234.56`, drops a sign rather than
  creating a deduction that raises tax;
- `parseVisionExtraction` rejects prose, keeps the best of two answers for one field,
  drops unknown field names **with a report** instead of storing them, and refuses an
  answer with neither a type nor a figure;
- `resolveVisionChain` orders primary → fallbacks, skips disabled / text-only /
  endpoint-less models, and enforces the route's `maxDataClass` at call time (it was
  previously validated only at registration);
- the service tries each model in turn with a 20 s timeout and falls through to the
  `NONE` state, logging which model failed and why.

**Acceptance.** `apps/api/test/vision-contract.spec.ts` — 24 tests.

---

## DA-4 — stop mislabelling documents

**Delivered.** `TRAINING_INVOICE`, `MEDICAL_INVOICE` and `RECEIPT` in the contracts
enum and the Prisma enum, and branches F/H/M now use them. A dental invoice no longer
arrives in the vault labelled *Childcare invoice*.

---

## DA-5 — confirm a document's figures at once

**Delivered.** `POST /api/workspaces/:id/facts/confirm-bulk` (max 50 ids) →
`FactsService.confirmFactsBulk`.

- Each figure still goes through `confirmFact`: same audit row, same approval
  invalidation, same privacy checks, same retention trigger. A bulk path that
  reimplemented those would be a second, unaudited way to change a return.
- One household notification per batch instead of one per figure.
- Ids already confirmed, from another workspace, or unreadable are **skipped with a
  reason**, so a retry is not blocked by its own history.
- The category is now resolved by a shared table (`factCategoryForFieldName` in
  `@luxtax/contracts`) rather than in the browser, which is what made a server-side
  batch possible at all.

**UI.** The pending panel sorts by confidence and offers *Confirm all N*.

---

## DA-6 — re-read a stored document

**Delivered.** `POST /api/workspaces/:id/documents/:id/reextract`.

For the case that matters in practice: the file was uploaded before an OCR model
existed. Confirmed figures are not touched — only unconfirmed candidates are
replaced — and the change is audited as `DOCUMENT_REEXTRACTED`, because the figures
the user sees change without a new upload arriving.

Three guards, each for a failure that would be silent:

| Guard | Failure it prevents |
|---|---|
| A figure already confirmed is not re-offered as a candidate | The engine sums confirmed facts, so confirming the same `grossSalary` twice doubles the income |
| The stored path is resolved inside the upload directory before it is read | A corrupted row turning the endpoint into an arbitrary file reader |
| Confirmed facts keep their `extractedFactId` link (`onDelete: SetNull`), so only unconfirmed rows are deleted | Losing the provenance of a figure the user already accepted |

---

## DA-7 — the vault tells the truth

**Delivered.** `apps/web/src/components/DocumentsView.tsx`:

- a `Needs OCR` chip on every document with `ocrRequired`;
- a *Re-scan* action that re-reads the stored file and reports the outcome;
- a batch confirmation button with a per-batch result message.

---

## DA-8 — verification

| Check | Result |
|---|---|
| API unit suite (`apps/api/test/*.spec.ts`) | **449 / 449** across 44 spec files, with a real Tesseract configured |
| Same suite without `OCR_TESSERACT_PATH` | **447 pass, 2 skipped** — both real-binary tests report why they cannot run |
| Baseline before this work | 364 / 364 — so **85 tests were added**, none removed |
| Packages, web and mobile specs | 426 / 453 — see the note below |
| `tsc -p tsconfig.test.json` | exit 0 |
| `tsc -p apps/api/tsconfig.json` | exit 0 |
| `tsc --noEmit` in `apps/web` | exit 0 |
| `next build` | ✅ compiled, six routes (re-run after the contracts change) |
| Migrations on a fresh database | **23 applied**, `migrate diff` → **No difference detected** |
| API boots with the new module wiring | ✅ `Nest application successfully started` on port 3021 |
| Live HTTP: upload a PNG photo of a receipt | ✅ `201`, `extractionSource: OCR`, 3 figures |
| Live HTTP: upload a **scanned PDF** of the same receipt | ✅ `201`, `extractionSource: OCR`, `pageCount: 1`, 3 figures |
| Typechecks of `contracts`, `validation`, `api-client` | exit 0 |

### How to reproduce

Run from the repository root:

```bash
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json \
  --test apps/api/test/*.spec.ts
```

The suite must be started at the root: `prisma-schema.spec.ts` resolves
`apps/api/prisma/schema.prisma` relative to the working directory and reports four
false failures from inside `apps/api`.

Migrations, against any empty database:

```bash
DATABASE_URL=postgresql://…/luxtax_check \
  npx prisma migrate deploy && \
  npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

### The 27 failures in the web render suites are pre-existing

`LoginPage`, `RegisterPage`, `DashboardPage`, `QuestionnaireView` and
`TaxCalculatorView` fail with `Cannot read properties of null (reading 'useContext')`.
That is the React 18 (`react-test-renderer` in `.tools`) against React 19
(`apps/web`) mismatch already recorded in `implementation-tracker.md`; it appears
whenever `apps/web/node_modules` exists. `documents-view.spec.ts` — the only web
spec covering a file this pass changed — **passes**.

### The HTTP e2e could not run here

`npx jest --config test/jest-e2e.json receipt-scanning` aborts before the first
test with:

```
@nestjs/testing/index.js:7  export * from './interfaces/index.js';
SyntaxError: Unexpected token 'export'
```

Node 24 + Jest 29 + an ESM-only NestJS 12 needs a transform for `node_modules` that
this configuration does not have. The seam it would cover — PDF bytes to figures and
the `NEEDS_OCR` state — is covered in-process instead by
`apps/api/test/document-pipeline.spec.ts` (9 tests), which constructs the real
service with an empty model registry and runs the actual parser over real PDF bytes.

---

## DA-9 — in-process OCR for images

**The gap it closes.** DA-1 … DA-8 made PDFs and text automatic, and left one
case: a photo of a receipt, with no vision endpoint registered, produced an empty
fact list. That is the most common way a taxpayer actually sends a document.

**Delivered.** `apps/api/src/modules/documents/ocr/ocr-engine.ts`:

- an `OcrEngine` port (`recognize(image, mimeType) → TEXT | EMPTY | NOT_CONFIGURED | FAILED`);
- `TesseractCliOcrEngine`, which runs `tesseract <input> <outputbase> -l fra --psm 6`
  in a temporary directory, reads the `.txt` it produces, and removes the
  directory — no network call, nothing written outside the OS temp dir;
- `OCR_TESSERACT_PATH` selects the binary; a missing variable or a path that does
  not exist is `NOT_CONFIGURED` **before anything is spawned**, so a typo in a
  deployment variable cannot look like "this receipt has no amounts";
- `OCR_LANGUAGES` (default `fra`) and `OCR_PSM` (default `6`) are configurable per
  deployment, because a German certificate needs `deu`;
- the child process is injectable (`runner`), so the argument contract and the
  failure paths are unit-tested without a binary.

The pipeline is now **text layer → vision model → local OCR → "cannot read"**. A
readable PDF never reaches OCR (the characters are already there), and a model
endpoint still wins when one is registered.

**Measured with a real engine.** Tesseract 5.4.0 (UB Mannheim build, `fra` from
`tessdata_fast`) on a 41 KB PNG fixture
(`apps/api/test/fixtures/receipt-remuneration-2025.png`):

| Input | Result |
|---|---|
| The fixture, through the real binary | `source: OCR`, 3 figures: `grossSalary 76800.00`, `socialSecurity 9000.00`, `mortgageInterest 3500.00` |
| Same image, no `OCR_TESSERACT_PATH` | `needsOcr: true`, reason names `OCR_TESSERACT_PATH`, zero invented figures |
| A corrupt JPEG with an engine configured | `needsOcr: true` with a readable message — Leptonica's stderr goes to the log, not to the taxpayer |

**What the real run honestly shows.** Tesseract read line `105.` as `195.`, so the
withholding figure did not arrive. The test asserts the three figures the engine
genuinely produced and says why, rather than asserting a nicer number: this is
precisely the case the confirmation step exists for.

**Acceptance.** `apps/api/test/ocr-engine.spec.ts` — 12 tests (arguments, both
`NOT_CONFIGURED` paths, empty output, non-zero exit, timeout, temp-directory
cleanup, text normalisation). `apps/api/test/ocr-pipeline.spec.ts` — 5 tests, four
of them with a stub engine so they run anywhere, and one that spawns the real
binary on the PNG and **skips with a reason** when it is not installed.

**Proven through the running API.** The Jest e2e cannot start here (see DA-8), so
the same journey was driven over HTTP against a real server, a real database built
from the migrations, and a real Tesseract process:

```
POST /api/auth/register            → 201
POST /api/households               → 201
GET  /api/households/:id/workspaces/2025 → 200
POST /api/workspaces/:id/documents  (the PNG, 41 KB) → 201
GET  /api/workspaces/:id/facts     → 3 extracted facts
```

The upload's own response:

```json
{"documentType": "SALARY_CERTIFICATE", "status": "EXTRACTED",
 "extractionSource": "OCR", "ocrRequired": false, "extractedFactsCount": 3}
```

and the facts it produced, each carrying the line it was read from:

| field | value | snippet |
|---|---|---|
| `grossSalary` | 76800.00 | `101. Remuneration brute 76800.00 EUR` |
| `socialSecurity` | 9000.00 | `103. Cotisations sociales 9000.00 EUR` |
| `mortgageInterest` | 3500.00 | `141. Interets debiteurs 3500.00 EUR` |

`status: EXTRACTED` and `ocrRequired: false` are the DA-2 state machine working:
the same endpoint returns `NEEDS_OCR` with `ocrRequired: true` when the engine is
absent, instead of a silently empty fact list.

**Configuration.**

```env
OCR_TESSERACT_PATH=C:\Program Files\Tesseract-OCR\tesseract.exe
OCR_LANGUAGES=fra
OCR_PSM=6
```

The language pack must be present beside the binary (`tessdata/fra.traineddata`);
`tesseract --list-langs` is the quickest check.

---

## DA-10 — scanned PDFs reach the same OCR

**The gap it closes.** DA-9 read images, and the OCR branch only ran for
`image/*`. A certificate scanned straight to PDF — what a multi-function printer
produces, and what many taxpayers actually upload — still ended in
`needsOcr: true` with zero figures. That is the same failure the OCR phase was
meant to end, one container further away.

**Delivered.** `apps/api/src/modules/documents/text/pdf-images.ts`:

- `extractPdfPageImages(buffer)` walks the page tree, resolves each page's
  `/XObject` resources, and returns the largest image per page (a scan carries
  the page picture plus a small logo);
- a `/DCTDecode` stream **is** a JPEG file, so it is passed through untouched —
  no decode, no recompression, no quality loss on a document that will be read
  by OCR;
- a `/FlateDecode` image is inflated and wrapped in a PNG written by a 40-line
  encoder (IHDR/IDAT/IEND with CRC32), because Tesseract reads PNG and this keeps
  the OCR adapter free of raw-pixel formats;
- anything it cannot decode honestly — a `/Predictor`, JPEG 2000, CCITT, CMYK,
  1-bit — is skipped rather than fed to OCR as garbage;
- pages are capped (10) and total pixels bounded (60 M), so one uploaded
  document cannot pin the process.

**Pipeline.** `text layer → vision model → local OCR (page images of a scan) →
"cannot read"`. A vector PDF with a text layer never reaches OCR; a vector PDF
*without* one has no page image either, and says so.

**A defect this surfaced.** The DA-2 "embedded text" fallback was applied to PDFs
too, and a PDF's own object syntax (`/Type /Page /Parent 2 0 R …`) is printable
text — so it was handed to the parser as if it were OCR output. On the scanned
fixture that produced `EMBEDDED_TEXT` with zero figures. The fallback is now
image-only, and the removed branch is explained in the code.

**Measured.** Tesseract 5.4.0 on a 98 KB scan-to-PDF fixture
(`apps/api/test/fixtures/receipt-scanned.pdf`, one 1240×760 JPEG page, no text
layer):

| Input | Result |
|---|---|
| The scanned PDF, real binary, in-process | `source: OCR`, 1 page, 3 figures: `grossSalary 76800.00`, `socialSecurity 9000.00`, `mortgageInterest 3500.00` |
| The same PDF, no `OCR_TESSERACT_PATH` | `needsOcr: true`, reason names the variable, no invented figures |
| A vector PDF with neither text layer nor page image | `needsOcr: true`, no figures — reported, not guessed |
| Live API: `POST /api/workspaces/:id/documents` with the PDF | `201`, `extractionSource: OCR`, `ocrRequired: false`, `pageCount: 1`, 3 facts with their printed lines |

**Acceptance.** `apps/api/test/pdf-images.spec.ts` — 8 tests (JPEG passthrough,
vector PDF yields none, Flate RGB → PNG, greyscale channel count, predictor
refusal, unsupported filter, logo size, non-PDF input).
`apps/api/test/ocr-pipeline.spec.ts` gains three scanned-PDF tests and a
real-binary one that skips when Tesseract is absent.

---

## Decisions recorded

1. **Human-in-the-loop stays.** DA-5 removes clicks, not consent: no figure enters a
   return without an explicit confirmation, and `README` principle 4 still holds. An
   auto-accept threshold was considered and rejected — a misread amount in a tax
   return is a legal exposure, not a UX inconvenience.
2. **Confidence is never invented.** The deterministic branches carry fixed
   confidence (0.88–0.96); a model reports its own, clamped to 0…1 and normalised
   from a percentage. Nothing is calibrated against an evaluation set yet, and the
   UI does not pretend otherwise.
3. **`NONE` is a state, not an error.** A photo stores fine and is marked
   `NEEDS_OCR`; the alternative (a 422 on upload) would lose the file the user just
   took.
4. **No dependency was added.** PDF reading uses `node:zlib`, and OCR shells out to
   an executable the operator installs — no npm package, no wasm bundle, no
   runtime download of a language model.
5. **Local OCR is tried after a vision model, not before.** A registered model is
   an explicit choice by the operator and is usually the better reader; local OCR is
   the fallback that makes a photo work with nothing configured. Neither runs when
   the file has a text layer.

---

## Backlog (explicitly not done)

| Item | Why it is not in this pass | What it needs |
|---|---|---|
| **Shipping an OCR engine with the app** | DA-9 drives whatever Tesseract the host has; it does not bundle one. A desktop installer that ships Tesseract and a `tessdata` set is packaging work, not pipeline work. | An installer that places the binary and `fra.traineddata`, and sets `OCR_TESSERACT_PATH` |
| **Rasterising a vector PDF** | DA-10 reads the image a scan already contains. A page that is *drawn* (vector) with no text layer would need a real renderer (MuPDF/pdfium); the tax forms this app targets are either text or scans, so this is not on the critical path. | A renderer such as MuPDF, or `pdfium` through a native binding |
| **Table-aware extraction** | A certificate's columns can land on separate lines. `codeAmount` now looks two lines past the code, which covers the layouts seen; a real table model is a bigger change. | Layout analysis with coordinates from the text layer |
| **A "needs OCR" task in the questionnaire** | Would need a `TaskType` enum value and a migration; the vault already shows the state. | One enum + one task generator |
| **Confidence calibration** | No labelled corpus to calibrate against. | A fixture set with known answers, plus an evaluation run (the admin console already has the tables for it) |

---

## Files

| Path | Role |
|---|---|
| `apps/api/src/modules/documents/text/pdf-text.ts` | PDF text layer, quality gate |
| `apps/api/src/modules/documents/text/document-text.ts` | Source dispatch for every upload |
| `apps/api/src/modules/documents/extraction/vision-contract.ts` | Prompt, amount parsing, answer validation, model chain |
| `apps/api/src/modules/documents/ocr/ocr-engine.ts` | `OcrEngine` port and the Tesseract CLI adapter |
| `apps/api/test/fixtures/receipt-remuneration-2025.png` | A receipt rendered as a photo, used by the real-OCR test |
| `apps/api/src/modules/documents/text/pdf-images.ts` | Page images out of a scan-to-PDF (JPEG passthrough, Flate → PNG) |
| `apps/api/test/fixtures/receipt-scanned.pdf` | A scan-to-PDF: one JPEG page, no text layer |
| `apps/api/src/modules/documents/receipt-ai-vision.service.ts` | Text → parser, image → model, neither → `NEEDS_OCR` |
| `apps/api/src/modules/facts/facts.service.ts` | `confirmFactsBulk` |
| `packages/contracts/src/fact-category.ts` | Field name → fact category, shared by API and web |
| `apps/api/prisma/migrations/20261110190000_document_ocr_state` | `NEEDS_OCR`, `ExtractionSource`, `ocrRequired` |
| `apps/api/prisma/migrations/20261110191000_audit_actor_fk_set_null` | pre-existing drift, cleared |
| `apps/api/prisma/migrations/20261110192000_document_reextracted_event` | `DOCUMENT_REEXTRACTED` |
