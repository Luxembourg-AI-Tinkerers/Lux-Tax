"""Activate the two projet de loi 8775 measures in rules/2026.ts.

Usage
-----
  python .tools/activate_8775.py --bands bands.json [--target <file>] [--check]

`bands.json` shape (the table exactly as published by the ACD):

  {
    "bands": [
      { "from": 0, "to": 2500, "slope": 0.0, "offset": 84 },
      { "from": 2500.01, "to": 3500, "slope": 0.02, "offset": 34 }
    ],
    "topAmount": 68,
    "topUpTo": 4500
  }

The script performs the three coordinated edits and nothing else:

  1. inserts `cic: { ... }` after `ccssPensionRate`
  2. inserts a `specialExpenses` override with `savingsHousingYoungMaxAge: 200`
  3. flips both `pendingMeasures` from NOT_IN_FORCE to IN_FORCE

It refuses to run twice (idempotence guard), refuses an empty band list, and with
`--check` only verifies the file is untouched and the measures are still gated.
No amount is invented here: every figure comes from the file passed in.
"""

import argparse
import io
import json
import re


def read(path):
    with io.open(path, encoding="utf-8", newline="") as fh:
        raw = fh.read()
    return raw.replace("\r\n", "\n"), ("\r\n" in raw)


def write(path, text, crlf):
    if crlf:
        text = text.replace("\n", "\r\n")
    with io.open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)


def validate_bands(payload):
    if not isinstance(payload, dict):
        raise SystemExit("bands file must be a JSON object")
    bands = payload.get("bands")
    if not isinstance(bands, list) or not bands:
        raise SystemExit("bands file needs a non-empty 'bands' array")
    previous_to = None
    for index, band in enumerate(bands):
        for key in ("from", "to", "slope", "offset"):
            if key not in band:
                raise SystemExit("band %d is missing '%s'" % (index, key))
        if band["from"] > band["to"]:
            raise SystemExit("band %d has from > to" % index)
        if previous_to is not None and band["from"] <= previous_to:
            raise SystemExit("band %d overlaps the previous band" % index)
        previous_to = band["to"]
    if "topAmount" in payload and not isinstance(payload["topAmount"], (int, float)):
        raise SystemExit("'topAmount' must be a number")
    return payload


def render_cic(rules):
    lines = ["  // Activated from the Mémorial publication of projet de loi 8775.",
             "  cic: {", "    bands: ["]
    for band in rules["bands"]:
        lines.append(
            "      { from: %s, to: %s, slope: %s, offset: %s },"
            % (band["from"], band["to"], band["slope"], band["offset"])
        )
    lines.append("    ],")
    if "topAmount" in rules:
        lines.append("    topAmount: %s," % rules["topAmount"])
    if "topUpTo" in rules:
        lines.append("    topUpTo: %s," % rules["topUpTo"])
    lines.append("  },")
    return "\n".join(lines)


SPECIAL_EXPENSES = (
    "  // Projet de loi 8775: the 40-year age limit for the increased épargne-logement\n"
    "  // cap is removed, so the young-saver ceiling applies without an age condition.\n"
    "  specialExpenses: { ...RULES_2025.specialExpenses, savingsHousingYoungMaxAge: 200 },"
)


def flip(text, measure_id):
    pattern = re.compile(
        r"(id: '" + re.escape(measure_id) + r"',\s*\n\s*status: ')NOT_IN_FORCE(',)"
    )
    new_text, count = pattern.subn(r"\1IN_FORCE\2", text)
    if count != 1:
        raise SystemExit(
            "expected exactly one NOT_IN_FORCE for %s, found %d" % (measure_id, count)
        )
    return new_text


def activate(path, payload):
    text, crlf = read(path)

    if "  cic: {" in text:
        raise SystemExit("%s already has a cic table; refusing to apply twice" % path)
    if "savingsHousingYoungMaxAge: 200" in text:
        raise SystemExit("%s already has the 8775 age limit; refusing to apply twice" % path)

    anchor = "  ccssPensionRate: 0.17,"
    if text.count(anchor) != 1:
        raise SystemExit("anchor '%s' not found exactly once" % anchor)
    text = text.replace(
        anchor, anchor + "\n" + render_cic(payload) + "\n" + SPECIAL_EXPENSES, 1
    )

    text = flip(text, "CIC_2026")
    text = flip(text, "EPARGNE_LOGEMENT_8775")

    write(path, text, crlf)


def check(path):
    text, _ = read(path)
    problems = []
    if "  cic: {" in text:
        problems.append("a cic table is present")
    if "savingsHousingYoungMaxAge: 200" in text:
        problems.append("the 8775 age limit is already applied")
    for measure_id in ("CIC_2026", "EPARGNE_LOGEMENT_8775"):
        if not re.search(
            r"id: '" + measure_id + r"',\s*\n\s*status: 'NOT_IN_FORCE'", text
        ):
            problems.append("%s is not gated as NOT_IN_FORCE" % measure_id)
    if problems:
        raise SystemExit("file is not in the pre-publication state: " + "; ".join(problems))
    print("ok: %s is still gated (cic absent, age 40, both measures NOT_IN_FORCE)" % path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bands", help="JSON file with the published monthly table")
    parser.add_argument("--target", default="packages/tax-engine/src/rules/2026.ts")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    if args.check:
        check(args.target)
        return

    if not args.bands:
        raise SystemExit("--bands is required unless --check is used")
    with io.open(args.bands, encoding="utf-8") as fh:
        payload = validate_bands(json.load(fh))

    activate(args.target, payload)
    print("activated %s with %d band(s)" % (args.target, len(payload["bands"])))


if __name__ == "__main__":
    main()
