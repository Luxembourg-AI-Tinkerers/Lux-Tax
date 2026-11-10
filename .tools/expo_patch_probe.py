"""Which expo 52.x patches can actually bundle?

`expo@52.0.49` ships `src/errors/ExpoErrorManager.native.ts`, which imports
`../lib/statuses` — and the published package contains no `src/lib` at all
(295 files, confirmed by npm metadata, a hash-verified tarball download and
jsDelivr's independent mirror of the public registry).

If an earlier 52.x patch does not contain that file, pinning the app to it is a
one-line, product-correct fix — the same reason a lockfile exists.
"""
import json
import subprocess
import urllib.request

VERSIONS = ["52.0.36", "52.0.40", "52.0.46", "52.0.49"]


def flat_listing(version: str) -> list[str]:
    url = f"https://data.jsdelivr.com/v1/packages/npm/expo@{version}?structure=flat"
    with urllib.request.urlopen(url, timeout=120) as response:
        data = json.load(response)
    return [entry["name"] for entry in data.get("files", [])]


for version in VERSIONS:
    try:
        names = flat_listing(version)
    except Exception as exc:  # noqa: BLE001 - diagnostic
        print(f"{version:9} listing failed: {type(exc).__name__}")
        continue

    error_manager = [n for n in names if n.endswith("/src/errors/ExpoErrorManager.native.ts")]
    lib_statuses = [n for n in names if n.endswith("/src/lib/statuses.ts")]
    lib_any = [n for n in names if "/src/lib/" in n]
    build_js = [n for n in names if "/build/" in n and n.endswith(".js")]

    print(
        f"{version:9} files={len(names):>4}  error-manager={len(error_manager)}  "
        f"src/lib={len(lib_any):>3}  build-js={len(build_js):>4}"
    )
    if error_manager and not lib_statuses:
        # Show what the file imports, so the breakage is visible rather than inferred.
        raw_url = f"https://cdn.jsdelivr.net/npm/expo@{version}/src/errors/ExpoErrorManager.native.ts"
        try:
            with urllib.request.urlopen(raw_url, timeout=60) as response:
                source = response.read().decode("utf-8", "replace")
            imports = [line.strip() for line in source.splitlines() if line.startswith("import")]
            print("          imports: " + " | ".join(imports[:3]))
        except Exception:  # noqa: BLE001
            pass
