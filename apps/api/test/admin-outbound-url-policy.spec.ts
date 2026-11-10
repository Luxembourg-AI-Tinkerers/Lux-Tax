import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  assertEndpointUrlAllowed,
  evaluateEndpointUrl,
  isForbiddenIp,
  isLoopbackHost,
} from '../src/modules/admin/outbound-url-policy';

/**
 * SSRF / credential-egress regression tests for the admin model probe.
 * Every case is pure: host names are resolved through an injected resolver, so
 * no test touches the network.
 */
const resolveTo =
  (...addresses: string[]) =>
  async (): Promise<readonly string[]> =>
    addresses;

describe('Outbound URL policy for admin model probes (M1)', () => {
  test('a public https endpoint is allowed', () => {
    const decision = evaluateEndpointUrl('https://api.mistral.ai/v1', { production: true });
    assert.strictEqual(decision.allowed, true);
    if (decision.allowed) assert.strictEqual(decision.url.hostname, 'api.mistral.ai');
  });

  test('a public IP literal over https is allowed, a non-standard port does not matter', () => {
    assert.strictEqual(evaluateEndpointUrl('https://93.184.216.34/v1').allowed, true);
    assert.strictEqual(evaluateEndpointUrl('https://api.openai.com:8443/v1').allowed, true);
  });

  test('plain http is rejected — except localhost outside production', () => {
    const publicHttp = evaluateEndpointUrl('http://api.mistral.ai/v1', { production: true });
    assert.strictEqual(publicHttp.allowed, false);
    if (!publicHttp.allowed) assert.match(publicHttp.reason, /plain http/);

    assert.strictEqual(evaluateEndpointUrl('http://api.mistral.ai/v1', { production: false }).allowed, false);
    assert.strictEqual(evaluateEndpointUrl('http://localhost:11434/v1', { production: false }).allowed, true);
    assert.strictEqual(evaluateEndpointUrl('http://127.0.0.1:11434/v1', { production: false }).allowed, true);
  });

  test('localhost and loopback are unreachable in production', () => {
    for (const url of [
      'https://localhost:11434/v1',
      'https://127.0.0.1/v1',
      'https://127.10.0.1/v1',
      'http://[::1]:8080/v1',
      'https://api.localhost/v1',
    ]) {
      const decision = evaluateEndpointUrl(url, { production: true });
      assert.strictEqual(decision.allowed, false, `${url} must be blocked`);
    }
  });

  test('cloud metadata endpoints are rejected by name and by address', () => {
    for (const url of [
      'https://metadata.google.internal/computeMetadata/v1/',
      'https://metadata/googleMetadata/v1/',
      'https://instance-data/latest/',
    ]) {
      const decision = evaluateEndpointUrl(url, { production: true });
      assert.strictEqual(decision.allowed, false, `${url} must be blocked`);
      if (!decision.allowed) assert.match(decision.reason, /metadata/);
    }

    const address = evaluateEndpointUrl('https://169.254.169.254/latest/meta-data/', { production: true });
    assert.strictEqual(address.allowed, false);
    if (!address.allowed) assert.match(address.reason, /blocked range/);
  });

  test('private, link-local and reserved IPv4 ranges are rejected', () => {
    for (const host of [
      '10.0.0.5',
      '10.255.255.254',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.10',
      '169.254.10.10',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
    ]) {
      const decision = evaluateEndpointUrl(`https://${host}/v1`);
      assert.strictEqual(decision.allowed, false, `${host} must be blocked`);
      if (!decision.allowed) assert.match(decision.reason, /blocked range/);
    }
  });

  test('public addresses next to a private block stay allowed', () => {
    // Guard against an off-by-one in the masks: these are outside 172.16/12.
    assert.strictEqual(evaluateEndpointUrl('https://172.15.0.1/v1').allowed, true);
    assert.strictEqual(evaluateEndpointUrl('https://172.32.0.1/v1').allowed, true);
    assert.strictEqual(evaluateEndpointUrl('https://11.0.0.1/v1').allowed, true);
  });

  test('IPv6 loopback, unique-local, link-local and IPv4-mapped addresses are rejected', () => {
    for (const host of [
      '[::1]',
      '[fc00::1]',
      '[fd12:3456::1]',
      '[fe80::1]',
      '[::]',
      '[::ffff:127.0.0.1]',
      '[::ffff:10.0.0.1]',
      '[ff02::1]',
    ]) {
      const decision = evaluateEndpointUrl(`https://${host}/v1`, { production: true });
      assert.strictEqual(decision.allowed, false, `${host} must be blocked`);
    }
    // A global unicast IPv6 literal is a legitimate endpoint.
    assert.strictEqual(evaluateEndpointUrl('https://[2606:4700:4700::1111]/v1').allowed, true);
  });

  test('obfuscated IPv4 literals are normalised before the check', () => {
    // WHATWG URL parsing turns decimal/hex/short forms into a dotted quad, so the
    // literal check sees 127.0.0.1 and not an opaque integer.
    for (const url of ['https://2130706433/v1', 'https://0x7f000001/v1', 'https://127.1/v1']) {
      assert.strictEqual(evaluateEndpointUrl(url, { production: true }).allowed, false, `${url} must be blocked`);
    }
  });

  test('URLs with embedded credentials or non-http schemes are rejected', () => {
    const credentials = evaluateEndpointUrl('https://user:secret@api.mistral.ai/v1');
    assert.strictEqual(credentials.allowed, false);
    if (!credentials.allowed) assert.match(credentials.reason, /credentials/);

    for (const url of ['ftp://api.mistral.ai/v1', 'file:///etc/passwd', 'gopher://127.0.0.1:6379/_INFO']) {
      assert.strictEqual(evaluateEndpointUrl(url).allowed, false, `${url} must be blocked`);
    }
  });

  test('a host name that resolves to a private address is rejected', async () => {
    const decision = await assertEndpointUrlAllowed('https://models.example.com/v1', {
      production: true,
      resolveHost: resolveTo('10.1.2.3'),
    });
    assert.strictEqual(decision.allowed, false);
    if (!decision.allowed) assert.match(decision.reason, /10\.1\.2\.3/);
  });

  test('a host name with one private answer is rejected even when another is public', async () => {
    const decision = await assertEndpointUrlAllowed('https://models.example.com/v1', {
      production: true,
      resolveHost: resolveTo('203.0.113.10', '192.168.0.7'),
    });
    assert.strictEqual(decision.allowed, false);
  });

  test('a host name that resolves to a public address is allowed', async () => {
    const decision = await assertEndpointUrlAllowed('https://models.example.com/v1', {
      production: true,
      resolveHost: resolveTo('203.0.113.10'),
    });
    assert.strictEqual(decision.allowed, true);
  });

  test('unresolvable or empty answers fail closed', async () => {
    const unresolvable = await assertEndpointUrlAllowed('https://models.example.com/v1', {
      production: true,
      resolveHost: async () => {
        throw new Error('ENOTFOUND');
      },
    });
    assert.strictEqual(unresolvable.allowed, false);
    if (!unresolvable.allowed) assert.match(unresolvable.reason, /could not be resolved/);

    const empty = await assertEndpointUrlAllowed('https://models.example.com/v1', {
      production: true,
      resolveHost: resolveTo(),
    });
    assert.strictEqual(empty.allowed, false);
  });

  test('an IP literal is never resolved through the injected resolver', async () => {
    let called = 0;
    const decision = await assertEndpointUrlAllowed('https://93.184.216.34/v1', {
      production: true,
      resolveHost: async () => {
        called += 1;
        return ['10.0.0.1'];
      },
    });
    assert.strictEqual(decision.allowed, true);
    assert.strictEqual(called, 0);
  });

  test('isForbiddenIp and isLoopbackHost classify addresses directly', () => {
    assert.strictEqual(isForbiddenIp('127.0.0.1'), true);
    assert.strictEqual(isForbiddenIp('127.0.0.1', true), false);
    assert.strictEqual(isForbiddenIp('10.0.0.1'), true);
    assert.strictEqual(isForbiddenIp('8.8.8.8'), false);
    assert.strictEqual(isForbiddenIp('::1'), true);
    assert.strictEqual(isForbiddenIp('fe80::1'), true);
    assert.strictEqual(isForbiddenIp('2606:4700:4700::1111'), false);
    assert.strictEqual(isLoopbackHost('localhost'), true);
    assert.strictEqual(isLoopbackHost('[::1]'), true);
    assert.strictEqual(isLoopbackHost('not-localhost.example'), false);
  });
});
