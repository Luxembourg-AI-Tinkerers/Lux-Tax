import io

# 1) tsconfig.render.json: include the shim declarations.
p = "tsconfig.render.json"
s = io.open(p, encoding="utf-8", newline="").read()
old = '    "packages/tax-engine/src/**/*.ts",'
assert s.count(old) == 1
s = s.replace(old, '    ".tools/types/react-native.d.ts",\n' + old, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)

# 2) render spec: SIGN_IN carries a reason in the AuthPrompt union.
p2 = "apps/mobile/test/render.spec.ts"
raw = io.open(p2, encoding="utf-8", newline="").read()
crlf = "\r\n" in raw
t = raw.replace("\r\n", "\n")

pairs = [
    (
        "        promptOverride: { kind: 'SIGN_IN' },",
        "        promptOverride: { kind: 'SIGN_IN', reason: 'TOO_MANY_FAILURES' },",
    ),
    (
        "    assert.ok(!text.includes('Unlock with biometrics'));\n"
        "    assert.ok(!text.includes('Use device passcode'));\n"
        "    assert.equal(tags.filter((t) => t === 'TouchableOpacity').length, 1, JSON.stringify(text));",
        "    assert.ok(text.includes('Sign in again'), JSON.stringify(text));\n"
        "    assert.ok(!text.includes('Unlock with biometrics'));\n"
        "    assert.ok(!text.includes('Use device passcode'));\n"
        "    assert.equal(tags.filter((t) => t === 'TouchableOpacity').length, 1, JSON.stringify(text));",
    ),
]

for old_text, new_text in pairs:
    assert t.count(old_text) == 1, old_text[:50]
    t = t.replace(old_text, new_text, 1)

if crlf:
    t = t.replace("\n", "\r\n")
io.open(p2, "w", encoding="utf-8", newline="").write(t)
print("patched")
