import io

p = "apps/web/test/questionnaire-view.spec.ts"
s = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")

# 1) saveQuestionnaire uses PUT, not POST.
s = s.replace(
    "    const writes = calls.filter((c) => c.method === 'POST');",
    "    const writes = calls.filter(\n"
    "      (c) => c.method !== 'GET' && c.url.endsWith('/questionnaire'),\n"
    "    );",
    1,
)

# 2) helper to enable the mortgage block (its inputs only render when the box is checked).
marker = "async function submitForm(tree: Node[]): Promise<void> {"
assert s.count(marker) == 1
s = s.replace(
    marker,
    "async function toggleMortgage(tree: Node[]): Promise<void> {\n"
    "  const label = tree.find(\n"
    "    (n) => n.type === 'label' && textOf(n).join('').includes('Mortgage Interest on Primary Residence'),\n"
    "  );\n"
    "  assert.ok(label, 'mortgage toggle not found');\n"
    "  const box = nodes(label!.children).find((n) => n.type === 'input')!;\n"
    "  const onChange = box.props.onChange as (e: unknown) => void;\n"
    "  await TestRenderer.act(async () => {\n"
    "    onChange({ target: { checked: true } });\n"
    "  });\n"
    "}\n\n"
    + marker,
    1,
)

# 3) enable the mortgage block before filling its quick field.
s = s.replace(
    "    await type(tree, 'e.g. 12500', '12000');\n    await type(tree, 'e.g. 3500', '3000');",
    "    await type(tree, 'e.g. 12500', '12000');\n"
    "    await toggleMortgage(tree);\n"
    "    const reopened = nodes(current!.toJSON());\n"
    "    await type(reopened, 'e.g. 3500', '3000');",
    1,
)

# submitForm uses the tree captured at mount; re-read it after the toggle re-render.
s = s.replace(
    "    await type(reopened, 'e.g. 3500', '3000');\n    await submitForm(tree);",
    "    await type(reopened, 'e.g. 3500', '3000');\n    await submitForm(nodes(current!.toJSON()));",
    1,
)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("patched")
