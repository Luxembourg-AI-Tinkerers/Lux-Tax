import io

p = "apps/web/test/tax-calculator-view.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

# 1) React splits copy across child nodes, so assert on the concatenation.
s = s.replace("    const joined = view.text.join(' | ');", "    const joined = view.text.join('');", 1)
s = s.replace("    const joined = view.text.join(' | ');", "    const joined = view.text.join('');", 1)
s = s.replace(
    "    assert.ok(!view.text.join(' | ').includes('This scenario is not fully supported'));",
    "    assert.ok(!view.text.join('').includes('This scenario is not fully supported'));",
    1,
)

# 2) The empty-state fixture must be the client's own envelope: a null body.
s = s.replace(
    "  it('falls back to the empty state when no calculation is saved yet', async () => {\n    stubFetch({ data: null });",
    "  it('falls back to the empty state when no calculation is saved yet', async () => {\n    stubFetch(null);",
    1,
)

# 3) New regression test: a stored result that predates the `unsupported` field.
marker = "  it('survives an API error without rendering a broken result', async () => {"
assert s.count(marker) == 1
s = s.replace(
    marker,
    "  it('tolerates a stored result that predates the unsupported field', async () => {\n"
    "    const { unsupported: _dropped, ...legacy } = dto as unknown as Record<string, unknown>;\n"
    "    stubFetch(legacy);\n"
    "    const view = await mount();\n"
    "    const joined = view.text.join('');\n"
    "    assert.match(joined, /Deterministic Tax Engine/);\n"
    "    assert.ok(!joined.includes('This scenario is not fully supported'));\n"
    "    view.unmount();\n"
    "  });\n\n"
    + marker,
    1,
)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("patched")
