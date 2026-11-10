import io

p = r"B:\B\tax-app\apps\api\src\common\guards\rate-limit.guard.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

anchor = "@Injectable()\nexport class RateLimitGuard"
helper = """function numericEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

"""

if "function numericEnv" not in s:
    assert s.count(anchor) == 1
    s = s.replace(anchor, helper + anchor)
    io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
    print("restored numericEnv")
else:
    print("already present")
