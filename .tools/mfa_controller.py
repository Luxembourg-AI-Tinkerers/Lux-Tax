import io

p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.controller.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

# login forwards the second factor from the raw body (zod strips unknown keys)
s = s.replace(
    """    return this.authService.login(parseResult.data, {
      ipAddress: req.ip || req.headers?.['x-forwarded-for'],
      userAgent: req.headers?.['user-agent'],
    });""",
    """    const totpCode =
      typeof (body as { totpCode?: unknown })?.totpCode === 'string'
        ? (body as { totpCode: string }).totpCode
        : undefined;
    return this.authService.login(
      parseResult.data,
      {
        ipAddress: req.ip || req.headers?.['x-forwarded-for'],
        userAgent: req.headers?.['user-agent'],
      },
      totpCode,
    );""",
)

routes = """  /**
   * Multi-factor authentication. Enrolment returns the seed once; activation
   * requires a code, and disabling requires a code or a recovery code.
   */
  @Post('mfa/enrol')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async enrolMfa(@CurrentUser('id') userId: string) {
    return this.authService.enrolMfa(userId);
  }

  @Post('mfa/activate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async activateMfa(@CurrentUser('id') userId: string, @Body() body: { code?: unknown }) {
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!code) throw new BadRequestException('A code is required');
    return this.authService.activateMfa(userId, code);
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async disableMfa(@CurrentUser('id') userId: string, @Body() body: { code?: unknown }) {
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!code) throw new BadRequestException('A code is required');
    return this.authService.disableMfa(userId, code);
  }

  @Post('logout')"""

assert s.count("  @Post('logout')") == 1
s = s.replace("  @Post('logout')", routes)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("controller ok")
