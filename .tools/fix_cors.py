import io

p = r"B:\B\tax-app\apps\api\src\main.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });"""

new = """  // The adapter's default preflight answers `GET,HEAD,POST` only, which made
  // every PUT / PATCH / DELETE from the browser fail as "Failed to fetch":
  // saving the questionnaire, editing or deleting a fact, changing a document's
  // visibility and saving a freelance profile were all blocked client-side.
  // Server-to-server clients (and the e2e suite, which uses app.inject) never
  // send a preflight, so nothing caught this until the UI ran in a browser.
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    maxAge: 600,
  });"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
