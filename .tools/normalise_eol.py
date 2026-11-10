"""Restore each modified file's original line-ending convention.

The repository is CRLF on disk for most files; a few (`form100-case-map.ts`) are
LF and must stay that way. The edits above rewrote some files with LF, which git
would turn into a whole-file diff on the next checkout.
"""
import io
import subprocess

root = r"B:\B\tax-app"
files = subprocess.run(
    ["git", "-C", root, "diff", "--name-only"],
    capture_output=True,
    text=True,
    check=True,
).stdout.split()

fixed = []
for rel in files:
    if not rel.endswith((".ts", ".tsx", ".json", ".md", ".prisma", ".sql", ".example", ".yml")):
        continue
    # Was the committed version CRLF?
    head = subprocess.run(
        ["git", "-C", root, "show", f"HEAD:{rel}"],
        capture_output=True,
        check=False,
    )
    if head.returncode != 0:
        continue
    original_crlf = b"\r\n" in head.stdout

    path = root + "\\" + rel.replace("/", "\\")
    try:
        raw = io.open(path, encoding="utf-8", newline="").read()
    except FileNotFoundError:
        continue

    normalised = raw.replace("\r\n", "\n")
    target = normalised.replace("\n", "\r\n") if original_crlf else normalised
    if target != raw:
        io.open(path, "w", encoding="utf-8", newline="").write(target)
        fixed.append(rel)

print("normalised", len(fixed), "files")
for f in fixed:
    print(" ", f)
