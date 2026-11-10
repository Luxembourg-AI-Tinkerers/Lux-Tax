import io

p = r"B:\B\tax-app\build-verification-2026-11-10.md"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

# 1. Heading: the bundle is green now.
old_head = "## 2. `apps/mobile` — Metro bundle: **five real defects fixed, bundle blocked by the machine**\n"
new_head = "## 2. `apps/mobile` — Metro bundle: **green** (both platforms)\n"
assert t.count(old_head) == 1, "heading"
t = t.replace(old_head, new_head, 1)

# 2. Drop the two sections that described the blocker.
start = t.find("### How far the bundle got")
end = t.find("### Resolved: the mobile bundle builds")
assert start != -1 and end > start, (start, end)
t = t[:start] + t[end:]

# 3. The "resolved" heading is redundant under a green heading.
t = t.replace("### Resolved: the mobile bundle builds\n\n", "", 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("build report restructured")
