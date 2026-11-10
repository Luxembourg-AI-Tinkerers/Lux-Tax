import io, json

p = r"B:\B\tax-app\apps\mobile\package.json"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
pkg = json.loads(raw)

# Make the bundle reproducible instead of a remembered command line.
pkg["scripts"]["build"] = "expo export --platform ios --platform android --output-dir dist"
pkg["scripts"] = dict(sorted(pkg["scripts"].items()))

io.open(p, "w", encoding="utf-8", newline=nl).write(json.dumps(pkg, indent=2) + nl)
print("build script added")
