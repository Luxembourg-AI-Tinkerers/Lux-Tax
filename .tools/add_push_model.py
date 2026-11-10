import io

p = r"B:\B\tax-app\apps\api\prisma\schema.prisma"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

model = io.open(
    r"B:\B\tax-app\tmp\push-device-model.prisma", encoding="utf-8", newline=""
).read().replace("\r\n", "\n").strip() + "\n"

# Anchor inside the User model only: the last relation followed by @@map("users").
anchor = "  notificationPreferences NotificationPreference[]\n\n  @@map(\"users\")"
assert s.count(anchor) == 1, s.count(anchor)
s = s.replace(
    anchor,
    "  notificationPreferences NotificationPreference[]\n  pushDevices          PushDevice[]\n\n  @@map(\"users\")",
)

s = s.rstrip("\n") + "\n\n" + model
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
