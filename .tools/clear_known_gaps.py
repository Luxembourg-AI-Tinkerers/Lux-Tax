import io

p = "apps/api/test/param-wiring.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
crlf = "\r\n" in raw
s = raw.replace("\r\n", "\n")

old = """/**
 * Known gaps: the engine can do it, but no questionnaire field reaches it yet. Listed rather than
 * hidden, so the test still guards everything else.
 */
const KNOWN_UNWIRED: Record<string, string> = {
  spouseResidence:
    'no questionnaire field yet, so a mixed resident/non-resident couple cannot be described',
  mixedCoupleCollectiveRequested:
    'no questionnaire field yet, so the Art. 3ter collective election cannot be expressed',
};
"""
new = """/**
 * Known gaps: the engine can do it, but no questionnaire field reaches it yet. Listed rather than
 * hidden, so the test still guards everything else.
 *
 * Empty since Phase 44 wired `spouseResidence` and `mixedCoupleCollectiveRequested`. The assertion
 * below still runs, so any future entry has to stay honest.
 */
const KNOWN_UNWIRED: Record<string, string> = {};
"""
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new, 1)

# Make the honesty assertion meaningful when the list is empty.
old2 = """  it('keeps the known-gap list honest: each entry is still genuinely absent', () => {"""
new2 = """  it('has no unwired engine parameter left (Phase 44)', () => {
    assert.deepEqual(Object.keys(KNOWN_UNWIRED), []);
  });

  it('keeps the known-gap list honest: each entry is still genuinely absent', () => {"""
assert s.count(old2) == 1
s = s.replace(old2, new2, 1)

if crlf:
    s = s.replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
