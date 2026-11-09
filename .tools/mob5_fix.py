import io
p = "apps/mobile/test/privacy.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""    assert.strictEqual(canSeeAmount({ fieldValue: '10.00' }, 'u2'), false);
    assert.strictEqual(canSeeAmount({ visibility: 'ARCHIVED' }, 'u2'), false);""",
"""    const noMetadata: RedactableFact = { fieldValue: '10.00' };
    assert.strictEqual(canSeeAmount(noMetadata, 'u2'), false);
    assert.strictEqual(canSeeAmount({ visibility: 'ARCHIVED' }, 'u2'), false);""")

rep("""    assert.strictEqual(name, 'luxtax-annexes-2025-etcpasswd.pdf');""",
"""    assert.strictEqual(name, 'luxtax-annexes-2025-etcpassw.pdf');""")

rep("""  REDACTED_PLACEHOLDER,
} from '../src/lib/privacy';""",
"""  REDACTED_PLACEHOLDER,
  type RedactableFact,
} from '../src/lib/privacy';""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
