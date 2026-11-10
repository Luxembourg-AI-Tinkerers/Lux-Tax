import io

p = r"B:\B\tax-app\implementation-tracker.md"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """Everything else is implemented and evidenced (488 tests, 8 migrations, zero drift). Active work
continues on the rest of the repository; the daily watch `861a3eef-273d-470c-a1de-475e4448138b`
unparks R6/R7 on publication."""

new = """Everything else is implemented and evidenced (**588 tests across 48 spec files, 11 migrations,
zero drift** — re-measured 2026-11-09). The daily-watch task this tracker recorded
(`861a3eef-273d-470c-a1de-475e4448138b`) is **no longer present** in the scheduler: `schedule_task
list` returns only an unrelated, disabled school-library follow-up. Nothing will therefore report
the publication of 8775; re-creating the watch is a separate, explicit step."""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
