"""Correct the DS 1553 claim and record the accepted limitations.

Verified: 1553 carries the expenses covered by the statutory minimum
(Art. 111 / 111bis / ASRD / epargne-logement); Art. 112 donations are additional
and sit on case 1611; LRCP on 1609. 3,200 + 0 + 500 = 3,700, so the package
reconciles to the engine. Pinned by apps/api/test/form100-case-map.spec.ts.

Both source sections are replaced wholesale (from their heading to the next
heading) so the tables stay well formed.
"""
import io

RESOLVED = """
### DS 1553 — resolved: the two figures measure different scopes

The first pass recorded "DS 1553 shows EUR 3,200 while the engine deducted EUR 3,700 — one of the
two is wrong". **Neither is.** Checked against the persisted snapshot of the e2e workspace and
against a fresh engine run:

| Line | Amount | Meaning |
|---|---|---|
| DS **1503** (Art. 111bis) | 3,200.00 | declared pension-savings premium, after the cap |
| DS **1553** | 3,200.00 | total of the expenses covered by the statutory minimum (cases 1301–1552) |
| DS **1609** (LRCP) | 0.00 | none declared |
| DS **1611** (Art. 112 donations) | 500.00 | deducted *in addition* to the forfait |
| engine `specialExpensesTotal` | **3,700.00** | `max(forfait 480, covered 3,200) + LRCP 0 + donations 500` |

3,200 + 0 + 500 = **3,700** — the package reconciles to the engine exactly. Art. 112 donations are
not part of the "covered by the forfait" total (they are additional by law), so folding them into
1553 would have *double-counted* them. The statutory minimum (480 here) replaces the covered total
only when it is **higher**, and that branch emits an explicit INSTRUCTION on 1553 instead of
silently overwriting the figure.

Pinned by `apps/api/test/form100-case-map.spec.ts` — four tests assert the split, the
`1553 + 1609 + 1611 = total` identity, the case mapping, and the "forfait above covered ⇒
instruction" branch, so a later change cannot fold the donation back into 1553.
"""

NOT_COVERED = """## Not covered — two accepted limitations, two open gaps

| Item | Status and reason |
|---|---|
| Mobile on a device | **Accepted limitation.** `apps/mobile` had never been built at all. The attempt found and fixed five real blockers: a missing `assets/` directory referenced by `app.json`, no `babel.config.js`, no `metro.config.js` for the `@luxtax/*` monorepo imports, and undeclared `@babel/runtime` and `expo-asset`. Metro then resolves **772 modules** of the real app and stops inside a truncated vendored `expo@52` (`src/lib/statuses` absent; the package ships no compiled output, and two independent installs of two different majors reproduce the truncation). Close it on a healthy machine: `cd apps/mobile && npm install && npm run build`. |
| Real e-mail / push delivery | **Accepted limitation.** Both transports are implemented and tested against a real SMTP socket and a real HTTP push server, but this environment has no mailbox and no handset, so delivery to a device is unverified. |
| Firefox / Safari | Open. Only the bundled Chromium was driven. |
| Multi-user flows with two live sessions | Open. The invite path was exercised with one session; the second participant's view was not. |

"""


def replace_section(path: str, heading: str, new_text: str) -> None:
    raw = io.open(path, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in raw else '\n'
    text = raw.replace('\r\n', '\n')

    start = text.find(heading)
    assert start != -1, f'{path}: heading {heading!r} not found'

    # The section ends at the next "## " heading after it.
    rest = text[start + len(heading):]
    nxt = rest.find('\n## ')
    if nxt == -1:
        end = len(text)
        tail = ''
    else:
        end = start + len(heading) + nxt + 1
        tail = text[end:]

    text = text[:start] + new_text.lstrip('\n') + tail
    io.open(path, 'w', encoding='utf-8', newline=nl).write(text)
    print(f'  ok {path}: {heading!r}')


SITE = r'B:\B\tax-app\site-e2e-2026-11-10.md'

# 1. The DS row leaves the "found but not changed" table...
raw = io.open(SITE, encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in raw else '\n'
lines = raw.replace('\r\n', '\n').split('\n')
before = len(lines)
lines = [ln for ln in lines if 'DS 1553 shows' not in ln]
assert len(lines) == before - 1, 'DS row not removed exactly once'
text = '\n'.join(lines)

# ...and the resolution goes right after that table, before "## Not covered".
RESOLVED_HEADING = '### DS 1553 — resolved: the two figures measure different scopes'
anchor = '\n## Not covered'
idx = text.find(anchor)
assert idx != -1
text = text[:idx] + '\n' + RESOLVED.strip('\n') + '\n' + text[idx:]
io.open(SITE, 'w', encoding='utf-8', newline=nl).write(text)
print('  ok site-e2e: DS row moved to a resolution section')

# 2. The "Not covered" section gets explicit accepted-limitation rows.
replace_section(SITE, '## Not covered', NOT_COVERED)

# 3. Tracker: the open item and the not-covered row.
TRACKER = r'B:\B\tax-app\implementation-tracker.md'
raw = io.open(TRACKER, encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in raw else '\n'
lines = raw.replace('\r\n', '\n').split('\n')

ds_new = (
    '| **DS 1553 = EUR 3,200 against an engine line of EUR 3,700** — **RESOLVED, not a defect.** '
    '1553 carries the expenses covered by the statutory minimum (1503 Art. 111bis = 3,200); Art. 112 '
    'donations are additional and sit on 1611 (500); LRCP 1609 is 0, so 3,200 + 0 + 500 = 3,700 and '
    'the package reconciles to the engine. Folding the donation into 1553 would double-count it. '
    'Pinned by `apps/api/test/form100-case-map.spec.ts`. |'
)
mob_new = (
    '| **Mobile on a device — ACCEPTED LIMITATION.** `apps/mobile` had never been built; the attempt '
    'fixed five real blockers (missing `assets/`, no `babel.config.js`, no `metro.config.js` for the '
    '`@luxtax/*` imports, undeclared `@babel/runtime` and `expo-asset`). Metro resolves 772 modules '
    'and stops in a truncated vendored `expo@52` (`src/lib/statuses` absent, no compiled output; '
    'reproduced by two independent installs of two different majors). Close with '
    '`cd apps/mobile && npm install && npm run build`. |'
)

ds_hits = mob_hits = 0
for i, line in enumerate(lines):
    if 'The package prints DS 1553 =' in line:
        lines[i] = ds_new
        ds_hits += 1
    if line.startswith('| Mobile on a device |'):
        lines[i] = mob_new
        mob_hits += 1

assert ds_hits == 1, f'tracker DS rows: {ds_hits}'
print(f'  ok tracker: DS row ({ds_hits}), mobile rows ({mob_hits})')
io.open(TRACKER, 'w', encoding='utf-8', newline=nl).write('\n'.join(lines))
print('done')
