import io

p = r"B:\B\tax-app\apps\api\src\modules\notifications\notifications.controller.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

s = s.replace(
    "import { NotificationsService } from './notifications.service';",
    "import { NotificationsService } from './notifications.service';\nimport { NotificationDevicesService } from './notification-devices.service';",
)
s = s.replace(
    "  constructor(private readonly notificationsService: NotificationsService) {}",
    "  constructor(\n    private readonly notificationsService: NotificationsService,\n    private readonly devicesService: NotificationDevicesService,\n  ) {}",
)

anchor = """  private householdIdOf(req: HouseholdRequest): string {"""
routes = """  /**
   * Register a mobile install for push. The token is per install, so the same
   * account may register several; re-registering is idempotent and re-activates
   * a previously revoked token.
   */
  @Post('devices')
  async registerDevice(
    @CurrentUser('id') userId: string,
    @Body() body: { token?: unknown; platform?: unknown },
  ): Promise<{ registered: true }> {
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const platform = typeof body?.platform === 'string' ? body.platform.trim() : '';
    if (!token || !platform) {
      throw new BadRequestException('token and platform are required');
    }
    if (!/^[A-Za-z0-9\\[\\]_-]{20,200}$/.test(token)) {
      throw new BadRequestException('token is not a push token');
    }
    if (!/^(ios|android|web)$/i.test(platform)) {
      throw new BadRequestException('platform must be ios, android or web');
    }
    await this.devicesService.register(userId, token, platform.toLowerCase());
    return { registered: true };
  }

  /** Revoke one install (sign-out, device lost). */
  @Post('devices/revoke')
  async revokeDevice(
    @CurrentUser('id') userId: string,
    @Body() body: { token?: unknown },
  ): Promise<{ revoked: true }> {
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token) throw new BadRequestException('token is required');
    await this.devicesService.revoke(userId, token);
    return { revoked: true };
  }

  private householdIdOf(req: HouseholdRequest): string {"""

assert s.count(anchor) == 1
s = s.replace(anchor, routes)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
