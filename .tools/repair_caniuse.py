"""Repair the truncated `caniuse-lite` that blocked the Metro bundle.

Root cause of the long-standing "Cannot find module '../lib/statuses'" error:
it was never an `expo` defect. `browserslist`'s nested `caniuse-lite` had 611
files but no `package.json` and no `dist/lib/` directory, so its own
`dist/unpacker/feature.js` could not load `../lib/statuses`. Metro surfaced the
error against whichever file it happened to be transforming, which is why the
name in the message kept moving (expo, @babel/runtime, expo-router).

This extracts a complete copy from the published tarball with Python's tarfile.
"""
import io
import json
import os
import shutil
import tarfile
import urllib.request

BROWSERSLIST = r"B:\B\tax-app\tmp\mobile-build\node_modules\browserslist"
TARGET = os.path.join(BROWSERSLIST, "node_modules", "caniuse-lite")
STAGE = r"B:\B\tax-app\tmp\caniuse-fresh"

with open(os.path.join(BROWSERSLIST, "package.json"), encoding="utf-8") as handle:
    wanted = json.load(handle)["dependencies"]["caniuse-lite"]
print("browserslist wants caniuse-lite:", wanted)

meta = urllib.request.urlopen(
    "https://registry.npmjs.org/caniuse-lite", timeout=120
).read()
versions = sorted(json.loads(meta)["versions"].keys())
# The declared range is a caret; take the newest satisfying major.
major = wanted.lstrip("^~").split(".")[0]
candidates = [v for v in versions if v.split(".")[0] == major]
version = candidates[-1]
print("latest in that major:", version)

with urllib.request.urlopen(
    f"https://registry.npmjs.org/caniuse-lite/-/caniuse-lite-{version}.tgz", timeout=300
) as response:
    blob = response.read()
print("downloaded bytes:", len(blob))

shutil.rmtree(STAGE, ignore_errors=True)
os.makedirs(STAGE)
with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tf:
    names = tf.getnames()
    print("entries in archive:", len(names))
    print("has package.json:", "package/package.json" in names)
    print("has dist/lib/statuses.js:", "package/dist/lib/statuses.js" in names)
    tf.extractall(STAGE)

shutil.rmtree(TARGET, ignore_errors=True)
shutil.copytree(os.path.join(STAGE, "package"), TARGET)

print("installed:", version)
print("package.json present:", os.path.exists(os.path.join(TARGET, "package.json")))
print("dist/lib present:", os.path.isdir(os.path.join(TARGET, "dist", "lib")))
print("statuses.js present:", os.path.exists(os.path.join(TARGET, "dist", "lib", "statuses.js")))
print("files now:", sum(len(f) for _, _, f in os.walk(TARGET)))
