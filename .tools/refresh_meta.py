import io

# refresh() gains the request metadata so a rotated session keeps its origin.
p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

old = "  async refresh(dto: RefreshTokenRequestDto): Promise<AuthResponseDto> {\n"
new = (
    "  async refresh(\n"
    "    dto: RefreshTokenRequestDto,\n"
    "    meta?: { ipAddress?: string; userAgent?: string },\n"
    "  ): Promise<AuthResponseDto> {\n"
)
assert t.count(old) == 1, "refresh signature"
t = t.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("auth.service.ts refresh signature updated")

p2 = r"B:\B\tax-app\apps\api\src\modules\auth\auth.controller.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
nl2 = "\r\n" if "\r\n" in raw2 else "\n"
t2 = raw2.replace("\r\n", "\n")

old2 = "  async refresh(@Body() body: RefreshTokenRequestDto): Promise<AuthResponseDto> {\n"
new2 = (
    "  async refresh(\n"
    "    @Body() body: RefreshTokenRequestDto,\n"
    "    @Req() req: any,\n"
    "  ): Promise<AuthResponseDto> {\n"
)
assert t2.count(old2) == 1, "refresh controller signature"
t2 = t2.replace(old2, new2, 1)

old3 = "    return this.authService.refresh(parseResult.data);\n"
new3 = "    return this.authService.refresh(parseResult.data, {\n      ipAddress: req.ip,\n      userAgent: req.headers?.['user-agent'],\n    });\n"
assert t2.count(old3) == 1, "refresh call"
t2 = t2.replace(old3, new3, 1)

io.open(p2, "w", encoding="utf-8", newline=nl2).write(t2)
print("auth.controller.ts refresh passes meta")
