import io

NEW = '''## 2026-11-10 — PROD-2: closed in code, and now enforced by the build

**Status: RESOLVED.** The code review's H6 finding is closed. All three approval gates in
`apps/api/src/modules/filing/filing.service.ts` compute the required approvers through the single
helper `requiredApproverIds`:

| Gate | Line | Call |
|---|---|---|
| `approveReturn` | 190 | `requiredApproverIds(workspace.household.members)` |
| `recordFiling` | **1222** | `requiredApproverIds(workspace.household.members)` |
| history builder | 1543 | `requiredApproverIds(workspace.household.members)` |

No other approver computation remains in `apps/api/src`. The compiled artifact agrees: the three
matching lines in `apps/api/dist/.../filing.service.js` call the helper too, so the running server is
not on a stale build.

**Why the finding stayed open in the record.** The review captured the defect with its original line
number (1205) and a code quote; the fix moved the line to 1222, and the review body kept reading in
the present tense. Both are corrected: the review now shows an explicit BEFORE/AFTER pair and leads
with RESOLVED.

**Two guards, each mutation-checked by reverting that exact line:**

1. `apps/api/test/prod2-source-invariant.spec.ts` — **4 tests, new.** Asserts the helper is called
   exactly three times in `filing.service.ts`, that no gate rebuilds the list from household members,
   that the helper filters `VIEWER` and nothing else (a widened exclusion would silently lower the
   approval bar for a joint return), and that no other module in `apps/api/src` maps
   `household.members` into approvers. Reverting the `recordFiling` line fails **3 of the 4**.
2. `apps/api/test/viewer-approver.e2e-spec.ts` — **6 tests.** Builds a Class 2 household of two
   filers plus a VIEWER through the public API: the viewer gets **403** on approve, both filers reach
   `APPROVED`, and the return **files (201)**. Reverting the same line fails **3 of the 6**, with the
   predicted 400 "Every required household member must approve the return before it is filed".

**Verification after the change:** **820** unit tests (158 suites, 80 files), **59 / 59 API e2e**
(7 suites, rebuilt `luxtax_e2e`, 17 migrations), `tsc -p tsconfig.test.json` 0,
`tsc -p apps/api/tsconfig.json` 0.

**Observation, not a change (Low).** `questionnaire.service.ts:211` accepts `MARRIED` when
`household.members.length >= 2`, which a VIEWER satisfies. The engine then treats the return as
Class 2 without an assessed spouse (`selectFilerMembers` only considers filer roles, and
`class2WithoutSpouse` is reserved for widow(er)/divorced), which is a coherent outcome rather than a
crash — so this is a copy/validation nicety, not the PROD-2 defect, and changing it would need a
product decision on what a viewer is allowed to unlock.

'''

p = r"B:\B\tax-app\implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
text = raw.replace("\r\n", "\n")

start = text.find("## 2026-11-10 — PROD-2 closed at the e2e level (the missed call site)")
end = text.find("## 2026-11-10 — build verification: web green, mobile unbundleable here")
assert start != -1 and end > start, (start, end)

text = text[:start] + NEW + text[end:]
io.open(p, "w", encoding="utf-8", newline=nl).write(text)
print("tracker PROD-2 section rewritten")
