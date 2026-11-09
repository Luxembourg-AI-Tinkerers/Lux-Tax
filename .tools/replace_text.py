"""Apply exact text replacements to a file, tolerating CRLF/LF differences.

Usage: python .tools/replace_text.py <job.json>
job.json: {"path": "...", "edits": [{"old": "...", "new": "..."}]}

Every old string must occur exactly once after newline normalisation. The file's
dominant line ending is preserved. Exits non-zero on any failed or ambiguous match.
"""
import json
import sys
from pathlib import Path


def dominant_newline(text: str) -> str:
    crlf = text.count("\r\n")
    lf = text.count("\n") - crlf
    return "\r\n" if crlf >= lf and crlf > 0 else "\n"


def main() -> int:
    job = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    path = Path(job["path"])
    text = path.read_text(encoding="utf-8", newline="")
    nl = dominant_newline(text)
    for index, edit in enumerate(job["edits"], start=1):
        old = edit["old"].replace("\r\n", "\n").replace("\n", nl)
        new = edit["new"].replace("\r\n", "\n").replace("\n", nl)
        count = text.count(old)
        if count != 1:
            print(f"edit {index}: expected 1 match, found {count}")
            return 1
        text = text.replace(old, new, 1)
    path.write_text(text, encoding="utf-8", newline="")
    print(f"ok: {path} ({len(job['edits'])} edit(s))")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
