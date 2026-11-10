import io

p = r"B:\B\tax-app\apps\api\src\config\proxy-trust.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

old = """  // A list of trusted networks / addresses for the immediate peer.
  const entries = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return entries.length > 0 ? entries : false;
}
"""
new = """  // A list of trusted networks / addresses for the immediate peer. Every entry
  // must look like one: a bare word is a typo, and passing it to proxy-addr
  // would either throw at boot or silently never match. Fall back to no trust.
  const entries = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (entries.length === 0) return false;
  return entries.every(isIpOrCidr) ? entries : false;
}

/**
 * IPv4 or IPv6, optionally with a prefix length.
 *
 * Deliberately strict: `yes`, `ture`, `-1` and a bare `1` are configuration
 * mistakes, and the safe reading of a mistake is "do not trust the header".
 */
function isIpOrCidr(entry: string): boolean {
  const [address, prefix, ...rest] = entry.split('/');
  if (rest.length > 0) return false;

  if (prefix !== undefined) {
    if (!/^\\d{1,3}$/.test(prefix)) return false;
    const bits = Number(prefix);
    if (bits < 0 || bits > 128) return false;
  }

  const isV4 = /^(\\d{1,3}\\.){3}\\d{1,3}$/.test(address);
  if (isV4) {
    return address.split('.').every((part) => Number(part) <= 255);
  }

  const isV6 = address.includes(':') && /^[0-9a-fA-F:]+$/.test(address);
  return isV6;
}
"""
assert t.count(old) == 1, "list branch"
t = t.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("proxy-trust: entries validated, fail closed")
