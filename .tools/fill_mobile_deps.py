"""Fill missing packages in the app tree from the pristine prefix tree.

The app's node_modules was assembled by several interrupted installs and is
missing whole packages (query-string, @expo/* helpers) as well as files inside a
few packages. npm cannot repair it in place — any further `npm install` aborts
with "Invalid Version" because one entry has an empty version — so the gaps are
filled from tmp/expo-cli/node_modules, which was installed in one clean pass.

Only packages ABSENT from the app are copied; nothing already present is
overwritten, so the app's own react-native / expo versions are preserved.
"""
import os
import shutil

APP = r"B:\B\tax-app\tmp\mobile-build\node_modules"
DONOR = r"B:\B\tax-app\tmp\expo-cli\node_modules"

copied = 0
skipped = 0
scopes = 0


def copy_package(src: str, dst: str) -> None:
    global copied
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copytree(src, dst, dirs_exist_ok=True, symlinks=True)
    copied += 1


def handle(scope_dir_name: str | None = None) -> None:
    global skipped, scopes
    donor_dir = DONOR if scope_dir_name is None else os.path.join(DONOR, scope_dir_name)
    app_dir = APP if scope_dir_name is None else os.path.join(APP, scope_dir_name)
    if not os.path.isdir(donor_dir):
        return

    for name in os.listdir(donor_dir):
        if name.startswith('.'):
            continue
        src = os.path.join(donor_dir, name)
        if not os.path.isdir(src):
            continue

        if name.startswith('@') and scope_dir_name is None:
            os.makedirs(os.path.join(APP, name), exist_ok=True)
            handle(name)
            scopes += 1
            continue

        dst = os.path.join(app_dir, name)
        if os.path.exists(dst):
            skipped += 1
            continue
        copy_package(src, dst)


handle()
print('scopes', scopes, 'copied', copied, 'skipped(existing)', skipped)
