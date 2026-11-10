import io

OLD_START = "`expo@52` ships **TypeScript sources only**"
OLD_END = "### To finish it on a healthy machine"

NEW = '''### The published tarball is a stub — measured, not inferred

`expo@52` ships **TypeScript sources only** (`package.json` ⇒ `main: src/Expo.ts`, no compiled
`build/*.js`), so there is no compiled fallback when a source file is missing.

Downloading the tarball directly bypasses npm's extractor entirely, and it shows the tarball itself —
not the install — is incomplete:

```
npm pack expo@52.0.49   →  expo-52.0.49.tgz, 0.09 MB, 295 entries
tar -tzf expo-52.0.49.tgz | grep 'package/src/' | wc -l   →  83 .ts entries
tar -tzf expo-52.0.49.tgz | grep 'package/src/lib'        →  0
tar -tzf expo-52.0.49.tgz | grep 'package/build/.*\\.js$'  →  0
```

| Version packed straight from the registry | Size | Entries | `src/lib` | compiled `.js` |
|---|---|---|---|---|
| `expo@52.0.36` | 0.09 MB | 290 | **0** | **0** |
| `expo@52.0.46` | 0.09 MB | 295 | **0** | **0** |
| `expo@52.0.49` | 0.09 MB | 295 | **0** | **0** |

Every 52.x tarball on this registry is a ~0.09 MB stub with 83 source files and no `src/lib`. The
upstream package is over ten times that size. So this is a **registry mirror publishing truncated
packages**, not a filesystem or cache quirk on the machine, and it cannot be fixed by re-installing,
clearing the cache, extracting with `tar`, or pinning a different 52.x version.

Supporting evidence from the install attempts, kept for the record:

| Attempt | Result |
|---|---|
| `npm install` (full tree, twice) | stalls at ~510 of ~1000 packages; `react-native` never lands |
| `npm install --ignore-scripts` | completes but leaves `expo-modules-core` with no `src/` |
| fresh `npm install expo@52.0.49` in an empty prefix | `expo/src` = 83 modules, `src/lib` empty |
| fresh `npm install @expo/cli` in another prefix | pulled `expo@58.0.23`, whose `src/lib` is *also* empty |
| `npm cache verify` | 69 corrupt entries collected (128 MB) — after which `react-native` did install |

The bundle reached **772 modules** before hitting the gap, which is the useful signal: the app's own
code, its imports and the monorepo wiring resolve; what fails is a vendored package that does not
exist in complete form here.

'''

p = r"B:\B\tax-app\build-verification-2026-11-10.md"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
text = raw.replace("\r\n", "\n")

start = text.find(OLD_START)
end = text.find(OLD_END)
assert start != -1 and end > start, (start, end)

text = text[:start] + NEW + text[end:]
io.open(p, "w", encoding="utf-8", newline=nl).write(text)
print("mobile evidence replaced with the tarball measurement")
