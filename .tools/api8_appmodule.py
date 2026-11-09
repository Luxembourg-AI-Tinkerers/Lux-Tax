import io
p = "apps/api/src/app.module.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:60])
    s = s.replace(old, new)

rep("""  ],
})
export class AppModule {}""",
"""  ],
  providers: [
    // API-8: global rate limiting. The guard is inert unless RATE_LIMIT_ENABLED=true,
    // so enabling it is an operational decision rather than a deploy.
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}""")

# add imports at the top after the first import line
first = s.split("\n")[0]
rep(first, first + "\nimport { APP_GUARD } from '@nestjs/core';\nimport { RateLimitGuard } from './common/guards/rate-limit.guard';")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
