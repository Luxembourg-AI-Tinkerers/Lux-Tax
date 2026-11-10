import io

p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.controller.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

# Add verification routes before logout.
old = """  @Post('logout')"""
new = """  /**
   * Confirm an address from the link in the verification e-mail. Public on
   * purpose: the token is the credential.
   */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() body: { token?: unknown }): Promise<{ verified: true }> {
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (token.length < 16) {
      throw new BadRequestException('A verification token is required');
    }
    return this.authService.verifyEmail(token);
  }

  /** Re-send the link for the signed-in, unverified account. */
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async resendVerification(@CurrentUser('id') userId: string): Promise<{ sent: boolean }> {
    return this.authService.resendVerification(userId);
  }

  @Post('logout')"""
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("controller ok")
