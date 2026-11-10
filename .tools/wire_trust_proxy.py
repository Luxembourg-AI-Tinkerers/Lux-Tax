import io

p = r"B:\B\tax-app\apps\api\src\main.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

old_import = "import { AllExceptionsFilter } from './common/filters/http-exception.filter';\n"
new_import = (
    "import { AllExceptionsFilter } from './common/filters/http-exception.filter';\n"
    "import { resolveTrustProxy } from './config/proxy-trust';\n"
)
assert t.count(old_import) == 1, "import anchor"
t = t.replace(old_import, new_import, 1)

old_adapter = (
    "  const fastifyAdapter = new FastifyAdapter({\n"
    "    logger: process.env.NODE_ENV === 'development',\n"
    "    bodyLimit: REQUEST_BODY_LIMIT_BYTES,\n"
    "  });\n"
)
new_adapter = (
    "  const fastifyAdapter = new FastifyAdapter({\n"
    "    logger: process.env.NODE_ENV === 'development',\n"
    "    bodyLimit: REQUEST_BODY_LIMIT_BYTES,\n"
    "    // L6: only consult X-Forwarded-For when the deployment says a proxy is in\n"
    "    // front of the API. Off by default: the header is client-controlled, and\n"
    "    // both the audit trail and the per-IP rate-limit bucket key on the address\n"
    "    // it carries.\n"
    "    trustProxy: resolveTrustProxy(process.env.TRUST_PROXY),\n"
    "  });\n"
)
assert t.count(old_adapter) == 1, "adapter anchor"
t = t.replace(old_adapter, new_adapter, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("main.ts: trustProxy wired")
