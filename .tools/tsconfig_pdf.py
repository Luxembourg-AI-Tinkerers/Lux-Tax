import io
p = "tsconfig.test.json"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace("""    "packages/tax-engine/test/**/*.ts"
  ]""",
"""    "packages/tax-engine/test/**/*.ts",
    "apps/api/src/modules/filing/annex-pdf.builder.ts",
    "apps/api/test/**/*.ts"
  ]""")
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
