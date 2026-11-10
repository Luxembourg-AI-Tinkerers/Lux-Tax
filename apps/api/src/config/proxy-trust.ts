/**
 * Proxy trust (L6).
 *
 * `X-Forwarded-For` is a client-controlled header. Reading it unconditionally —
 * which the auth controller used to do — lets any caller claim any IP, so the
 * audit trail records fiction and the per-IP rate-limit bucket can be reset at
 * will by rotating the header.
 *
 * The correct behaviour depends on the deployment, so it is configuration, with
 * the safe value as the default:
 *
 * - `TRUST_PROXY` unset / `false` → the socket address is the client address.
 *   `request.ip` never consults the header.
 * - `TRUST_PROXY=true` → trust the header entirely. Only correct when the API is
 *   not directly reachable, e.g. behind a single load balancer that overwrites
 *   the header.
 * - `TRUST_PROXY=<n>` → trust the last `n` hops. Fastify has no numeric form,
 *   so this compiles to a hop predicate with proxy-addr's semantics
 *   (`hop < n`), which is the right setting for a known chain of `n` proxies.
 * - `TRUST_PROXY=<cidr>[,<cidr>...]` → trust the header only when the immediate
 *   peer is inside one of these networks.
 *
 * A bare `true` is deliberately not the default: it is the setting that turns a
 * spoofable header into a trusted fact.
 */

/** What Fastify accepts for its `trustProxy` option. */
export type TrustProxyFunction = (address: string, hop: number) => boolean;

export type TrustProxySetting = boolean | string[] | TrustProxyFunction;

/**
 * Parse the environment into a Fastify `trustProxy` value.
 *
 * Anything unreadable falls back to `false` rather than to permissive trust: a
 * typo in a deployment variable must not silently enable header trust.
 */
export function resolveTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = (raw ?? '').trim();

  if (value === '' || value.toLowerCase() === 'false' || value === '0') return false;
  if (value.toLowerCase() === 'true') return true;

  // A hop count: trust the last N proxies. 1 is the usual single-LB setup.
  // Fastify accepts no numeric value, so this becomes the equivalent predicate.
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    if (hops <= 0) return false;
    return (_address: string, hop: number) => hop < hops;
  }

  // A list of trusted networks / addresses for the immediate peer. Every entry
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
    if (!/^\d{1,3}$/.test(prefix)) return false;
    const bits = Number(prefix);
    if (bits < 0 || bits > 128) return false;
  }

  const isV4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(address);
  if (isV4) {
    return address.split('.').every((part) => Number(part) <= 255);
  }

  const isV6 = address.includes(':') && /^[0-9a-fA-F:]+$/.test(address);
  return isV6;
}
