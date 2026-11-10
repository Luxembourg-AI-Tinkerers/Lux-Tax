"""Is expo@52 an outlier, or does this registry truncate everything?

Compares `dist.fileCount` / `dist.unpackedSize` across packages whose real size
is well known. A proxy that strips tarballs would shrink all of them; a genuine
publishing fault in one package would leave the others intact.
"""
import json
import subprocess
import sys

TARGETS = [
    "expo@52.0.36",
    "expo@52.0.49",
    "expo@53.0.0",
    "react-native@0.76.7",
    "expo-router@4.0.22",
    "expo-modules-core@2.2.3",
    "@expo/cli@0.22.28",
    "typescript@5.8.2",
]

for spec in TARGETS:
    try:
        out = subprocess.run(
            ["npm", "view", spec, "dist", "--json"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
            shell=True,
        )
        raw = out.stdout.strip()
        start = raw.find("{")
        data = json.loads(raw[start:]) if start >= 0 else {}
        count = data.get("fileCount")
        size = data.get("unpackedSize")
        mb = f"{size / 1_048_576:.2f} MB" if isinstance(size, int) else "?"
        print(f"{spec:24} files={str(count):>6}  unpacked={mb}")
    except Exception as exc:  # noqa: BLE001 - diagnostic only
        print(f"{spec:24} ERROR {type(exc).__name__}: {exc}")
