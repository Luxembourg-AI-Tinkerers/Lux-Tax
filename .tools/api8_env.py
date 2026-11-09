import io
p = ".env.example"
try:
    s = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")
except FileNotFoundError:
    s = ""
addition = """
# API-8 — rate limiting (off unless RATE_LIMIT_ENABLED=true)
RATE_LIMIT_ENABLED=false
RATE_LIMIT_IP_CAPACITY=60
RATE_LIMIT_IP_REFILL=1
RATE_LIMIT_USER_CAPACITY=120
RATE_LIMIT_USER_REFILL=2

# API-8 — TOTP MFA (off unless MFA_ENABLED=true)
MFA_ENABLED=false
"""
if 'RATE_LIMIT_ENABLED' not in s:
    if not s.endswith("\n"):
        s += "\n"
    s += addition
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("env example updated")
