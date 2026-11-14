# Help affordances — the "?" beside an option

**Goal.** Any option whose name does not explain itself carries a small **?** that
says, in one or two sentences, what it changes. The taxpayer should never have to
guess what "CIM", "ASRD", "Art. 111bis" or "Proposed for return" means — and
should never have to leave the page to find out.

**Last updated:** 2026-11-10 · 63 affordances across 9 screens.

---

## How it behaves

| Action | Result |
|---|---|
| Hover the **?** | The explanation opens |
| Focus it with the keyboard | The explanation opens |
| Click / tap it | It pins open, for touch screens with no hover |
| `Escape`, a click outside, scrolling or a resize | It closes |

The bubble is rendered in a portal with fixed positioning, so it is never clipped
by a table's scroll container, and it flips above the trigger when there is no
room below. It is clamped to the viewport edges, which matters on a phone where a
`?` near the right margin would otherwise push the bubble off-screen.

**Accessibility.** The trigger is a real `<button>` with
`aria-label="About: <topic>"`, `aria-expanded`, and `aria-describedby` pointing at
the bubble while it is open. Tips next to a wrapping checkbox sit *outside* the
`<label>`, so a control's accessible name stays "Employment income" rather than
"Employment income About: Employment income". Clicking a `?` never toggles the
checkbox it sits beside.

---

## The copy

One source of truth: [`apps/web/src/lib/help-texts.ts`](../apps/web/src/lib/help-texts.ts).
An id is a compile-time key, so a component cannot ask for help that does not
exist.

Rules the text follows:

1. **Explain the consequence, not the label.** "Tax class" is not explained by
   saying it is the tax class; it is explained by "decides which class the engine
   applies: single, Class 1a with children, or Class 2 for a couple filing
   together".
2. **One or two sentences.** A tooltip is not documentation; long copy is a link
   to a page that does not exist yet.
3. **Name the rule when it is legal.** `(Art. 111bis)`, `(Art. 119 n° 3)` — the
   citation is what a taxpayer shows an adviser.
4. **Never invent a figure.** No threshold appears in a tooltip unless it is in
   the engine or the law summary.

---

## Where they are

| Screen | Tips | Examples |
|---|---|---|
| Tax profile & questionnaire | 26 | Household status, cross-border couple, Art. 111 / 111bis envelopes, travel units, moderated children, CIM, ASRD, start-up investment |
| Tax engine & calculation | 12 | Marginal vs effective rate, solidarity surcharge, frais d'obtention, withheld at source, credits, scenario comparison |
| Assessment & rollover | 5 | Declared vs assessed, objection deadline, follow-up date, filing route, rollover |
| Document vault | 4 | Document visibility, reading confidence, needs-OCR state, vault scope |
| Approvals & filing package | 4 | Approval gate, Form 100 case, package checksum, MyGuichet route |
| Admin & models | 4 | Task routing, capabilities, data class, rollout percentage |
| Confirmed facts | 3 | Category, included-in-return, confirmed facts |
| Freelance & business | 3 | Art. 14 vs Art. 91, net taxable profit, VAT |
| Dashboard | 2 | Tax year, household members |

---

## Adding one

1. Add the entry to `help-texts.ts` (`title` ≤ 48 characters, `body` 40–260
   characters, ending with a full stop).
2. Place `<HelpTip id="…" />` next to the label. If the label wraps a checkbox,
   put the tip **after** the `</label>` and keep the label `inline-flex w-fit`, so
   the name stays clean and the tip stays on the same line.
3. Run `apps/web/test/help-tip.spec.ts`. It fails on an unused entry, on a `?`
   without copy, on copy that grew into a paragraph, and if the questionnaire,
   calculator, vault or filing screens lose their help entirely.

---

## Verification

| Check | Result |
|---|---|
| `node --test apps/web/test/help-tip.spec.ts` | 9 tests: 5 on placement (centring, both edges, flip, top clamp), 4 on the inventory |
| `tsc --noEmit` in `apps/web` | exit 0 |
| `next build` | compiled, six routes |
| Browser (Chromium, 440 px viewport) | 25 affordances on the questionnaire; opens on click with the right copy; `aria-expanded=true`, `aria-describedby` set; `position: fixed`, `z-index: 70`, bubble 288 px wide and inside the viewport; `Escape` closes it; clicking a tip does not toggle its checkbox |
| Pre-existing render-suite failures | unchanged (5 suites, 27 tests — the React 18/19 harness mismatch, not this work) |
