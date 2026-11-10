"""Extract expo@52.0.49 with Python's tarfile and diff it against the app tree.

An earlier conclusion blamed the published package for importing
`../lib/statuses`. The file served by jsDelivr for 52.0.49 does not import it, so
the on-disk copy must have come from somewhere else — the tree was assembled by
hand from several installs. This script settles which copy is authentic and
stages a pristine extraction to bundle against.
"""
import io
import os
import shutil
import tarfile

TARBALL = r"B:\B\tax-app\tmp\pkg\expo-52.0.49.tgz"
STAGE = r"B:\B\tax-app\tmp\expo-fresh"
TARGET = r"B:\B\tax-app\tmp\mobile-build\node_modules\expo"

if os.path.exists(STAGE):
    shutil.rmtree(STAGE)
os.makedirs(STAGE)

with tarfile.open(TARBALL, "r:gz") as tf:
    tf.extractall(STAGE)

fresh = os.path.join(STAGE, "package")
marker = os.path.join("src", "errors", "ExpoErrorManager.native.ts")

for label, root in (("fresh", fresh), ("on disk", TARGET)):
    path = os.path.join(root, marker)
    if not os.path.exists(path):
        print(f"{label:8} {marker}: MISSING")
        continue
    text = io.open(path, encoding="utf-8", errors="replace").read()
    bad = "../lib/statuses" in text
    lines = text.count("\n") + 1
    print(f"{label:8} {marker}: {lines} lines, imports ../lib/statuses = {bad}")

fresh_files = sum(len(files) for _, _, files in os.walk(fresh))
disk_files = sum(len(files) for _, _, files in os.walk(TARGET))
print(f"\nfresh file count : {fresh_files}")
print(f"disk  file count : {disk_files}")
