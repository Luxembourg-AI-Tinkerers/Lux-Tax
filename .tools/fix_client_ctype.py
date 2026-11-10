import io

p = r"B:\B\tax-app\packages\api-client\src\client.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };"""

new = """    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    // Only claim a JSON body when there is one. Fastify (correctly) rejects a
    // request that declares `application/json` and sends nothing, which made
    // every bodyless POST — calculate, approve, read-all, rollover — fail with
    // "Body cannot be empty when content-type is set to 'application/json'".
    const hasBody = options.body !== undefined && options.body !== null;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...((options.headers as Record<string, string>) || {}),
    };"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
