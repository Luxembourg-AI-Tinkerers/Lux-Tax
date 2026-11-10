import io

p = r"B:\B\tax-app\site-e2e-2026-11-10.md"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

lines = t.split("\n")
replaced = 0
for index, line in enumerate(lines):
    if line.startswith("| Mobile on a device |"):
        lines[index] = (
            "| Mobile on a device | **Builds now.** `cd apps/mobile && npm run build` bundles iOS (957 "
            "modules) and Android (954) to Hermes bytecode. The earlier blocker was a truncated "
            "`caniuse-lite` copy inside `browserslist`, not the expo package — see "
            "`build-verification-2026-11-10.md` for the correction. Running the bundle on real hardware "
            "still needs a device this environment does not have. |"
        )
        replaced += 1
t = "\n".join(lines)
print("rows replaced:", replaced)

# The heading claimed two accepted limitations; only the mail/push one remains.
t = t.replace(
    "## Not covered — two accepted limitations, two open gaps",
    "## Not covered — one accepted limitation, three open gaps",
    1,
)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("e2e report updated")
