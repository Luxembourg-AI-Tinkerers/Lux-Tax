"""Independent check of the expo@52.0.49 tarball.

Uses urllib (no npm) to download and Python's tarfile (a different extractor) to
list, then compares the SHA-1 with the `dist.shasum` the registry advertises for
that version. That separates three possibilities:

  * the registry serves a complete package and npm drops files -> the extractor
    is at fault, and another tool fixes it;
  * the registry serves a truncated archive whose hash still matches -> the
    package really is published that way upstream;
  * the hash does not match -> something in between is altering the download.
"""
import hashlib
import io
import tarfile
import urllib.request

URL = "https://registry.npmjs.org/expo/-/expo-52.0.49.tgz"
EXPECTED_SHA1 = "b73982759b822f5e93dcaa49cf1fbc97d90faea9"

req = urllib.request.Request(URL, headers={"User-Agent": "luxtax-build-check/1.0"})
with urllib.request.urlopen(req, timeout=180) as response:
    blob = response.read()

print(f"downloaded bytes : {len(blob)}")
sha1 = hashlib.sha1(blob).hexdigest()
print(f"sha1             : {sha1}")
print(f"matches registry : {sha1 == EXPECTED_SHA1}")

with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tf:
    names = tf.getnames()

print(f"entries          : {len(names)}")
lib = [n for n in names if "/src/lib" in n]
js_build = [n for n in names if "/build/" in n and n.endswith(".js")]
print(f"src/lib entries  : {len(lib)}")
print(f"build .js entries: {len(js_build)}")

markers = [
    "package/src/Expo.ts",
    "package/src/errors/ExpoErrorManager.native.ts",
    "package/src/lib/statuses.ts",
]
for marker in markers:
    print(f"{'present' if marker in names else 'MISSING':8} {marker}")

print("\nfirst 12 entries:")
for name in names[:12]:
    print("  " + name)
