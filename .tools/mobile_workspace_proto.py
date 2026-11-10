import io, json

p = r"B:\B\tax-app\apps\mobile\package.json"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
pkg = json.loads(raw)

# pnpm 11 does not link a workspace package for a bare "*" (`link-workspace-packages`
# defaults to false), so it went looking for @luxtax/config on the registry. The
# `workspace:` protocol is the explicit, correct form inside a monorepo.
for section in ("dependencies", "devDependencies"):
    for name in list(pkg.get(section, {})):
        if name.startswith("@luxtax/"):
            pkg[section][name] = "workspace:*"

io.open(p, "w", encoding="utf-8", newline=nl).write(json.dumps(pkg, indent=2) + nl)
print("apps/mobile: @luxtax deps now use workspace:*")
