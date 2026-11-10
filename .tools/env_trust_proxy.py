import io

p = r"B:\B\tax-app\.env.example"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

anchor = """RATE_LIMIT_USER_CAPACITY=120
RATE_LIMIT_USER_REFILL=2
"""
addition = """RATE_LIMIT_USER_CAPACITY=120
RATE_LIMIT_USER_REFILL=2

# --- Proxy trust (L6) ------------------------------------------------------
# X-Forwarded-For is client-controlled. Leave this unset when the API is
# reachable directly: the recorded client address is then the socket address.
# Set it only when a proxy is genuinely in front, and prefer the narrowest
# form: a hop count (TRUST_PROXY=1 for one load balancer) or the proxy's
# networks (TRUST_PROXY=10.0.0.0/8). TRUST_PROXY=true trusts the header
# unconditionally and is only correct when every request comes through that
# proxy. An unreadable value falls back to no trust.
# TRUST_PROXY=1
"""
assert t.count(anchor) == 1, "rate limit block"
t = t.replace(anchor, addition, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print(".env.example: TRUST_PROXY documented")
