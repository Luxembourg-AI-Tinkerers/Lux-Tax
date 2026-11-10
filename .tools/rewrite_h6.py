import io

NEW_H6 = '''### H6. A joint return can never be filed when a VIEWER is an active member — **RESOLVED**

`filing.service.ts`, `recordFiling` (was line 1205 at review time, now 1222)

At review time this gate rebuilt the required-approver list itself instead of calling the shared
helper, so it counted VIEWERs while `approveReturn` and the history badge excluded them. A Class 2
household with a viewer reached `APPROVED` and then answered 400 on filing forever, because a
VIEWER is forbidden from approving (403).

**BEFORE (the defect):**

```ts
// recordFiling — rebuilt the list, VIEWER included
const requiredMemberIds = workspace.household.members.map((member) => member.userId);
```

**AFTER (current source, compiled output and e2e agree):**

```ts
// recordFiling — same helper as approveReturn and the history builder
const requiredMemberIds = requiredApproverIds(workspace.household.members);
```

This was the call site the earlier PROD-2 fix missed — the reason the rule belongs in one place.

**Closed 2026-11-10, with three independent guards:**

1. **Source invariant** — `apps/api/test/prod2-source-invariant.spec.ts` (4 tests) asserts that
   `filing.service.ts` calls `requiredApproverIds` exactly **three** times, that no gate rebuilds the
   list from household members, that the helper filters `VIEWER` and nothing else, and that no other
   module in `apps/api/src` maps `household.members` into approvers. Reverting the line above makes
   **3 of its 4 tests fail**.
2. **End-to-end** — `apps/api/test/viewer-approver.e2e-spec.ts` (6 tests) builds a Class 2 household
   of two filers plus a VIEWER through the public API, shows the viewer gets **403** on approve,
   shows both filers reaching `APPROVED`, and then **files the return (201)**. Reverting the same
   line makes **3 of those 6 fail**, with the exact 400 "Every required household member must
   approve" the finding predicted.
3. **Compiled artifact** — `apps/api/dist/.../filing.service.js` calls the helper at all three sites
   (rebuilt after the fix), so what the server actually runs matches the source.

'''

p = r"B:\B\tax-app\code-review-2026-11-10.md"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
text = raw.replace("\r\n", "\n")

start = text.find("### H6.")
end = text.find("### H7.")
assert start != -1 and end != -1 and end > start

text = text[:start] + NEW_H6 + text[end:]
io.open(p, "w", encoding="utf-8", newline=nl).write(text)
print("code review H6 rewritten")
