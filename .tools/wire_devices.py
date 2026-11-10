import io

p = r"B:\B\tax-app\apps\api\src\modules\notifications\notifications.module.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

s = s.replace(
    "import { NotificationRemindersService } from './notification-reminders.service';",
    "import { NotificationRemindersService } from './notification-reminders.service';\nimport { NotificationDevicesService } from './notification-devices.service';",
)
s = s.replace(
    "    NotificationRemindersService,\n",
    "    NotificationRemindersService,\n    NotificationDevicesService,\n",
)
s = s.replace(
    "  exports: [NotificationsService, NotificationOutboxService],",
    "  exports: [NotificationsService, NotificationOutboxService, NotificationDevicesService],",
)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print(s)
