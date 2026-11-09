import io

p = "apps/web/test/questionnaire-view.spec.ts"
s = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")

# A re-render replaces the element tree: always submit the *current* tree, otherwise the
# form handler closes over the state from before typing.
s = s.replace(
    "    await type(tree, 'e.g. 75000', '50000');\n    await submitForm(tree);",
    "    await type(tree, 'e.g. 75000', '50000');\n    await submitForm(nodes(current!.toJSON()));",
)
s = s.replace(
    "    await type(tree, 'e.g. 75000', 'not-a-number');\n    await submitForm(tree);",
    "    await type(tree, 'e.g. 75000', 'not-a-number');\n    await submitForm(nodes(current!.toJSON()));",
)
s = s.replace(
    "    const { tree } = await mount();\n    await submitForm(tree);",
    "    const { tree } = await mount();\n    await submitForm(tree);",
)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("patched", s.count("submitForm(nodes(current!.toJSON()))"))
