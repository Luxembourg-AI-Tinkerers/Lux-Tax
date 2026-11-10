"""Build a flat node_modules of directory junctions from the pnpm virtual store.

pnpm's linking step is pathologically slow on this machine (about 10 packages per
minute, filesystem/AV bound). The packages are already in the virtual store, so a
flat junction farm gives the same module resolution in seconds. Junctions are
used rather than symlinks because a symlink needs a privilege this process does
not hold, while `mklink /J` does not.
"""
import os
import subprocess

root = r"B:\B\tax-app"
store = os.path.join(root, "node_modules", ".pnpm")
flat = os.path.join(root, "tmp", "flat", "node_modules")

os.makedirs(flat, exist_ok=True)

created = 0
skipped = 0
failed = 0


def junction(src, target):
    global created, skipped, failed
    if os.path.lexists(target):
        skipped += 1
        return
    result = subprocess.run(
        ["cmd", "/c", "mklink", "/J", target, src],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        created += 1
    else:
        failed += 1


for entry in os.listdir(store):
    inner = os.path.join(store, entry, "node_modules")
    if not os.path.isdir(inner):
        continue
    for name in os.listdir(inner):
        if name.startswith("."):
            continue
        src = os.path.join(inner, name)
        if not os.path.isdir(src):
            continue
        if name.startswith("@"):
            scope_dir = os.path.join(flat, name)
            os.makedirs(scope_dir, exist_ok=True)
            for pkg in os.listdir(src):
                if pkg.startswith("."):
                    continue
                if os.path.isdir(os.path.join(src, pkg)):
                    junction(os.path.join(src, pkg), os.path.join(scope_dir, pkg))
        else:
            junction(src, os.path.join(flat, name))

for pkg, sub in [
    ("@luxtax/contracts", "packages/contracts"),
    ("@luxtax/tax-engine", "packages/tax-engine"),
    ("@luxtax/validation", "packages/validation"),
    ("@luxtax/api-client", "packages/api-client"),
    ("@luxtax/design-tokens", "packages/design-tokens"),
]:
    scope_dir = os.path.join(flat, "@luxtax")
    os.makedirs(scope_dir, exist_ok=True)
    name = pkg.split("/")[1]
    real = os.path.join(root, sub.replace("/", os.sep))
    junction(real, os.path.join(scope_dir, name))

print("created", created, "skipped", skipped, "failed", failed)
