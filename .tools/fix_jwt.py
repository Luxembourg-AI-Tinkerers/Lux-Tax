import io

# ---- auth.module.ts: no fallback secret, assert config at import ------------
p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.module.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

s = s.replace(
    "import { AuditModule } from '../audit/audit.module';",
    "import { AuditModule } from '../audit/audit.module';\nimport { assertRuntimeConfig, jwtAccessSecret } from '../../config/runtime-config';\n\n// Fail fast: a missing or defaulted signing key must stop the process, not\n// produce tokens that anybody who has read this repository can forge.\nassertRuntimeConfig();",
)
s = s.replace(
    """    JwtModule.register({
      secret:
        process.env.JWT_ACCESS_SECRET || 'dev_luxembourg_tax_jwt_access_secret_32chars_min_2026',
      signOptions: { expiresIn: '15m' },
    }),""",
    """    JwtModule.register({
      secret: jwtAccessSecret(),
      signOptions: { expiresIn: '15m' },
    }),""",
)
assert "dev_luxembourg" not in s, "fallback still present in auth.module"
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))

# ---- jwt.strategy.ts: same secret, algorithm pinned ------------------------
p = r"B:\B\tax-app\apps\api\src\modules\auth\jwt.strategy.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

s = s.replace(
    "import { PrismaService } from '../../prisma/prisma.service';",
    "import { PrismaService } from '../../prisma/prisma.service';\nimport { jwtAccessSecret } from '../../config/runtime-config';",
)
s = s.replace(
    """      secretOrKey:
        process.env.JWT_ACCESS_SECRET || 'dev_luxembourg_tax_jwt_access_secret_32chars_min_2026',""",
    """      secretOrKey: jwtAccessSecret(),
      // Pin the algorithm: with a symmetric secret this is defence in depth, and
      // it is what stops a future PEM migration from enabling key confusion.
      algorithms: ['HS256'],""",
)
assert "dev_luxembourg" not in s, "fallback still present in jwt.strategy"
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))

# ---- auth.service.ts: sign with the configured secret ---------------------
p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

s = s.replace(
    "import { AuditService } from '../audit/audit.service';",
    "import { AuditService } from '../audit/audit.service';\nimport { jwtAccessSecret } from '../../config/runtime-config';",
)
s = s.replace(
    """    const accessToken = this.jwtService.sign(payload, {
      secret:
        process.env.JWT_ACCESS_SECRET || 'dev_luxembourg_tax_jwt_access_secret_32chars_min_2026',
      expiresIn: '15m',
    });""",
    """    const accessToken = this.jwtService.sign(payload, {
      secret: jwtAccessSecret(),
      expiresIn: '15m',
    });""",
)
assert "dev_luxembourg" not in s, "fallback still present in auth.service"
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))

print("ok")
