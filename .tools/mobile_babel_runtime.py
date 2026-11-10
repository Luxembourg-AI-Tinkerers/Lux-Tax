import io, json

# Metro/babel-preset-expo emit imports of @babel/runtime helpers. The app never
# declared it, so the bundle failed with
#   Unable to resolve module @babel/runtime/helpers/interopRequireDefault
# It is a real runtime dependency of the bundled output, not a devDependency.
p = r"B:\B\tax-app\apps\mobile\package.json"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
pkg = json.loads(raw)

pkg["dependencies"]["@babel/runtime"] = "^7.25.0"
pkg["dependencies"] = dict(sorted(pkg["dependencies"].items()))

io.open(p, "w", encoding="utf-8", newline=nl).write(json.dumps(pkg, indent=2) + nl)
print("added @babel/runtime to apps/mobile")
