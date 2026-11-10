import io

p = r"B:\B\tax-app\apps\api\test\prisma-schema.spec.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

start = s.index("  test('the datasource carries the DATABASE_URL env reference'")
end = s.index("  });", s.index("assert.match(schema", start)) + len("  });")

new = (
    "  test('the datasource URL lives in prisma.config.ts, as Prisma 7 requires', () => {\n"
    "    const schema = readFileSync(schemaPath, 'utf8');\n"
    "    // Prisma 7 rejects a `url` in the datasource outright. The CLI the project\n"
    "    // pins refused to generate a client while that line was present, which made\n"
    "    // the API unbootable; the URL now lives in prisma.config.ts.\n"
    "    assert.doesNotMatch(schema, /url\\s*=\\s*env\\(/);\n"
    "\n"
    "    const configPath = join(process.cwd(), 'apps', 'api', 'prisma.config.ts');\n"
    "    const config = readFileSync(configPath, 'utf8');\n"
    "    assert.match(config, /process\\.env\\.DATABASE_URL/);\n"
    "    assert.match(config, /datasource/);\n"
    "  });"
)

s = s[:start] + new + s[end:]
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
