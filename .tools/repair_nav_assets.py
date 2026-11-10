"""Repair a package in the mobile tree from its published tarball (direct URL).

The tree at tmp/mobile-build was assembled by hand from several installs and a
copy dropped two files imported by `@react-navigation/elements`'s own index:
`lib/module/assets/close-icon.png` and `search-icon.png`. Metro refuses to
bundle without them.

The tarball is downloaded with urllib and extracted with Python's tarfile — a
different path from npm and from any file copy, so this also checks whether the
package really ships those files.
"""
import os
import shutil
import tarfile
import urllib.request

URL = "https://registry.npmjs.org/@react-navigation/elements/-/elements-2.9.45.tgz"
STAGE = r"B:\B\tax-app\tmp\nav-fresh"
TARGET = r"B:\B\tax-app\tmp\mobile-build\node_modules\@react-navigation\elements"

with urllib.request.urlopen(URL, timeout=180) as response:
    blob = response.read()
print("downloaded bytes:", len(blob))

shutil.rmtree(STAGE, ignore_errors=True)
os.makedirs(STAGE)
with tarfile.open(fileobj=__import__("io").BytesIO(blob), mode="r:gz") as tf:
    names = tf.getnames()
    assets = [n for n in names if "/lib/module/assets/" in n]
    print("assets in archive:", len(assets))
    print("close-icon in archive:", any(n.endswith("close-icon.png") for n in assets))
    print("search-icon in archive:", any(n.endswith("search-icon.png") for n in assets))
    tf.extractall(STAGE)

src = os.path.join(STAGE, "package", "lib", "module", "assets")
dst = os.path.join(TARGET, "lib", "module", "assets")
added = []
for name in sorted(os.listdir(src)):
    destination = os.path.join(dst, name)
    if not os.path.exists(destination):
        shutil.copy2(os.path.join(src, name), destination)
        added.append(name)

print("added to the tree:", added if added else "none")
have = sorted(os.listdir(dst))
print("assets now:", len(have))
for needed in ("close-icon.png", "search-icon.png"):
    print(f"  {needed}: {'present' if needed in have else 'STILL MISSING'}")
