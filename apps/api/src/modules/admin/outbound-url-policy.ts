import * as dns from 'node:dns';

/**
 * Outbound URL policy for administrator-supplied model endpoints.
 *
 * `POST /api/admin/models/test` accepts any URL and — when a stored model is
 * probed — attaches that model's API key to the request. Without a policy that
 * is a server-side request forgery primitive with credential egress:
 * `http://169.254.169.254/…` reaches the cloud metadata service,
 * `http://10.0.0.5/…` reaches the internal network, and `http://localhost:…`
 * reaches whatever the API process itself exposes.
 *
 * The policy is split in two so it is unit-testable without a network:
 *   - `evaluateEndpointUrl` is synchronous and only inspects the URL;
 *   - `assertEndpointUrlAllowed` additionally resolves the host name through an
 *     injectable resolver and rejects names that point at a blocked address.
 *
 * Resolution is advisory: `fetch` resolves again when it connects, so a DNS
 * answer that changes between the two lookups (rebinding) is not covered here.
 * The check still removes every static destination — literals and stable names.
 */
export interface EndpointPolicyOptions {
  /** `true` blocks every non-public destination. Defaults to `NODE_ENV === 'production'`. */
  readonly production?: boolean;
  /** DNS resolver, injectable for tests. Defaults to `dns.promises.lookup`. */
  readonly resolveHost?: (hostname: string) => Promise<readonly string[]>;
}

export type UrlPolicyDecision =
  | { readonly allowed: true; readonly url: URL }
  | { readonly allowed: false; readonly reason: string };

const BLOCKED_IPV4_RANGES: readonly (readonly [string, number])[] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC 1918
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12], // RFC 1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // RFC 1918
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
];

const METADATA_HOSTS: readonly string[] = [
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'instance-data.ec2.internal',
];

function denied(reason: string): UrlPolicyDecision {
  return { allowed: false, reason };
}

export function isProductionEnv(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv === 'production';
}

/** `hostname` as the URL parser reports it, without IPv6 brackets. */
export function normalizeHost(hostname: string): string {
  return hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
}

export function parseIpv4(value: string): readonly number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    octets.push(octet);
  }
  return octets;
}

/** Expands an IPv6 literal to eight zero-padded hextets, or `null` if it is not one. */
export function expandIpv6(value: string): string | null {
  let text = value.split('%')[0].toLowerCase();
  if (!text.includes(':')) return null;

  // An embedded IPv4 tail (`::ffff:127.0.0.1`) is two hextets.
  if (text.includes('.')) {
    const lastColon = text.lastIndexOf(':');
    if (lastColon < 0) return null;
    const v4 = parseIpv4(text.slice(lastColon + 1));
    if (!v4) return null;
    const high = ((v4[0] << 8) | v4[1]).toString(16);
    const low = ((v4[2] << 8) | v4[3]).toString(16);
    text = `${text.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const filler = 8 - head.length - tail.length;

  if (halves.length === 1) {
    if (head.length !== 8) return null;
    return head.map((group) => group.padStart(4, '0')).join(':');
  }
  if (filler < 0) return null;

  const groups = [...head, ...new Array<string>(filler).fill('0'), ...tail];
  if (groups.length !== 8) return null;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
  }
  return groups.map((group) => group.padStart(4, '0')).join(':');
}

export function isIpLiteral(host: string): boolean {
  return parseIpv4(host) !== null || expandIpv6(host) !== null;
}

export function isLoopbackHost(host: string): boolean {
  const normalized = normalizeHost(host);
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  const v4 = parseIpv4(normalized);
  if (v4) return v4[0] === 127;
  const v6 = expandIpv6(normalized);
  return v6 === '0000:0000:0000:0000:0000:0000:0000:0001';
}

/**
 * Addresses that must never be dialled by an admin probe. Loopback is reported
 * separately by `isLoopbackHost`; `allowLoopback` decides whether it is a
 * violation (production) or the sanctioned local-development exception.
 */
export function isForbiddenIp(ip: string, allowLoopback = false): boolean {
  const normalized = normalizeHost(ip);

  const v4 = parseIpv4(normalized);
  if (v4) {
    if (v4[0] === 127) return !allowLoopback;
    return BLOCKED_IPV4_RANGES.some(([base, bits]) => inIpv4Range(v4, base, bits));
  }

  const v6 = expandIpv6(normalized);
  if (!v6) return false; // not an address: nothing to decide here

  if (v6 === '0000:0000:0000:0000:0000:0000:0000:0000') return true; // unspecified
  if (v6 === '0000:0000:0000:0000:0000:0000:0000:0001') return !allowLoopback; // loopback

  // ::ffff:a.b.c.d — IPv4-mapped; judge the embedded IPv4 address.
  if (v6.startsWith('0000:0000:0000:0000:0000:ffff:')) {
    const high = parseInt(v6.slice(30, 34), 16);
    const low = parseInt(v6.slice(35, 39), 16);
    const mapped = `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
    return isForbiddenIp(mapped, allowLoopback);
  }

  const first = parseInt(v6.slice(0, 4), 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (first === 0) return true; // 0::/16 reserved (:: and ::1 are handled above)
  return false;
}

function inIpv4Range(octets: readonly number[], base: string, bits: number): boolean {
  const baseOctets = parseIpv4(base);
  if (!baseOctets) return false;
  const toInt = (parts: readonly number[]) =>
    ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (toInt(octets) & mask) === (toInt(baseOctets) & mask);
}

function isMetadataHost(host: string): boolean {
  const normalized = normalizeHost(host);
  return METADATA_HOSTS.includes(normalized) || normalized.split('.').includes('metadata');
}

/**
 * Synchronous half of the policy: scheme, credentials, metadata names, loopback
 * policy and IP literals. Host names are only shape-checked here — call
 * `assertEndpointUrlAllowed` before an actual request so they are resolved too.
 */
export function evaluateEndpointUrl(
  rawUrl: string,
  options: EndpointPolicyOptions = {},
): UrlPolicyDecision {
  const production = options.production ?? isProductionEnv();

  let url: URL;
  try {
    url = new URL((rawUrl ?? '').trim());
  } catch {
    return denied('not an absolute URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return denied(`unsupported scheme "${url.protocol}" — only https is allowed`);
  }
  if (url.username || url.password) {
    return denied('the URL must not embed credentials');
  }

  const host = normalizeHost(url.hostname);
  if (!host) return denied('the URL has no host name');
  if (isMetadataHost(host)) {
    return denied('cloud metadata endpoints are never reachable from a model probe');
  }

  const loopback = isLoopbackHost(host);
  const localDevelopmentLoopback = !production && loopback;
  if (loopback && production) {
    return denied('localhost and loopback addresses are not reachable in production');
  }
  if (url.protocol === 'http:' && !localDevelopmentLoopback) {
    return denied('plain http is only allowed for localhost outside production');
  }

  if (isIpLiteral(host) && isForbiddenIp(host, !production)) {
    return denied(`address ${host} is in a blocked range`);
  }

  return { allowed: true, url };
}

async function defaultResolveHost(hostname: string): Promise<readonly string[]> {
  const addresses = await dns.promises.lookup(hostname, { all: true });
  return addresses.map((entry) => entry.address);
}

/**
 * Full policy check, run immediately before every outbound admin request:
 * evaluate the URL, resolve the host name, and reject names that point at a
 * private, loopback (unless development) or link-local address.
 */
export async function assertEndpointUrlAllowed(
  rawUrl: string,
  options: EndpointPolicyOptions = {},
): Promise<UrlPolicyDecision> {
  const decision = evaluateEndpointUrl(rawUrl, options);
  if (!decision.allowed) return decision;

  const production = options.production ?? isProductionEnv();
  const host = normalizeHost(decision.url.hostname);
  if (isIpLiteral(host)) return decision;

  const resolveHost = options.resolveHost ?? defaultResolveHost;
  let addresses: readonly string[];
  try {
    addresses = await resolveHost(host);
  } catch {
    return denied(`host "${host}" could not be resolved`);
  }
  if (addresses.length === 0) {
    return denied(`host "${host}" resolved to no address`);
  }
  for (const address of addresses) {
    if (isForbiddenIp(address, !production)) {
      return denied(`host "${host}" resolves to ${address}, which is in a blocked range`);
    }
  }

  return decision;
}
