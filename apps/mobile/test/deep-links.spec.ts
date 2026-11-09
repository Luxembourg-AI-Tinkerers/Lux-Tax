import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  buildDeepLink,
  isOpaqueToken,
  isWorkspaceId,
  parseDeepLink,
  requiresAuth,
} from '../src/lib/deep-links';

const WS = '3f1c9b2e-7a44-4c1d-9f6e-2b8a5d0c7e11';
const TOKEN = 'AbCdEfGh12345678XyZ';

describe('Deep-link parsing (MOB-8)', () => {
  test('parses the workspace routes', () => {
    const estimate = parseDeepLink(`luxtax://workspace/${WS}/estimate`);
    assert.strictEqual(estimate.ok, true);
    if (estimate.ok) assert.deepStrictEqual(estimate.route, { name: 'WORKSPACE_ESTIMATE', workspaceId: WS });

    const docs = parseDeepLink(`luxtax://workspace/${WS}/documents`);
    assert.strictEqual(docs.ok, true);
    if (docs.ok) assert.strictEqual(docs.route.name, 'WORKSPACE_DOCUMENTS');

    const tasks = parseDeepLink(`luxtax://workspace/${WS}/tasks`);
    assert.strictEqual(tasks.ok, true);
    if (tasks.ok) assert.strictEqual(tasks.route.name, 'WORKSPACE_TASKS');
  });

  test('accepts the universal link on the trusted host', () => {
    const result = parseDeepLink(`https://app.luxtax.lu/workspace/${WS}/estimate`);
    assert.strictEqual(result.ok, true);
    if (result.ok) assert.strictEqual(result.route.name, 'WORKSPACE_ESTIMATE');
  });

  test('rejects another https host', () => {
    const result = parseDeepLink(`https://evil.example/workspace/${WS}/estimate`);
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.reason, 'UNTRUSTED_HOST');
  });

  test('rejects dangerous schemes', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd']) {
      const result = parseDeepLink(url);
      assert.strictEqual(result.ok, false, url);
      if (!result.ok) assert.strictEqual(result.reason, 'UNSUPPORTED_SCHEME', url);
    }
  });

  test('rejects an app link that carries credentials', () => {
    const result = parseDeepLink(`luxtax://user:pass@evil/workspace/${WS}/estimate`);
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.reason, 'INVALID_AUTHORITY');
  });

  test('rejects a workspace id that is not a UUID — it would be interpolated into an API path', () => {
    for (const bad of ['..%2F..%2Fadmin', 'abc', `${WS}x`, '00000000-0000-0000-0000-00000000000']) {
      const result = parseDeepLink(`luxtax://workspace/${bad}/estimate`);
      assert.strictEqual(result.ok, false, bad);
      if (!result.ok) assert.ok(['INVALID_ID', 'UNKNOWN_ROUTE'].includes(result.reason), bad);
    }
  });

  test('a valid UUID passes the guard regardless of case', () => {
    assert.strictEqual(isWorkspaceId(WS.toUpperCase()), true);
    const result = parseDeepLink(`luxtax://workspace/${WS.toUpperCase()}/estimate`);
    assert.strictEqual(result.ok, true);
  });

  test('parses invite and reset tokens', () => {
    const invite = parseDeepLink(`luxtax://invite/${TOKEN}`);
    assert.strictEqual(invite.ok, true);
    if (invite.ok) assert.deepStrictEqual(invite.route, { name: 'INVITE', token: TOKEN });

    const reset = parseDeepLink(`luxtax://reset-password?token=${TOKEN}`);
    assert.strictEqual(reset.ok, true);
    if (reset.ok) assert.deepStrictEqual(reset.route, { name: 'RESET_PASSWORD', token: TOKEN });
  });

  test('rejects short or malformed tokens', () => {
    assert.strictEqual(parseDeepLink('luxtax://invite/short').ok, false);
    assert.strictEqual(parseDeepLink(`luxtax://invite/${TOKEN}../`).ok, false);
    assert.strictEqual(parseDeepLink('luxtax://reset-password').ok, false);
    assert.strictEqual(parseDeepLink('luxtax://reset-password?token=short').ok, false);
    assert.strictEqual(isOpaqueToken(TOKEN), true);
    assert.strictEqual(isOpaqueToken('has space and 16+ chars'), false);
  });

  test('home and notifications', () => {
    for (const url of ['luxtax://', 'luxtax://home', 'luxtax:///']) {
      const result = parseDeepLink(url);
      assert.strictEqual(result.ok, true, url);
      if (result.ok) assert.strictEqual(result.route.name, 'HOME', url);
    }
    const notifications = parseDeepLink('luxtax://notifications');
    assert.strictEqual(notifications.ok, true);
    if (notifications.ok) assert.strictEqual(notifications.route.name, 'NOTIFICATIONS');
  });

  test('empty, whitespace and oversized input are refused', () => {
    assert.strictEqual(parseDeepLink(null).ok, false);
    assert.strictEqual(parseDeepLink('').ok, false);
    assert.strictEqual(parseDeepLink('   ').ok, false);

    const long = `luxtax://workspace/${WS}/estimate?x=${'a'.repeat(3_000)}`;
    const result = parseDeepLink(long);
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.reason, 'TOO_LONG');
  });

  test('unknown routes are refused, not guessed', () => {
    const result = parseDeepLink(`luxtax://workspace/${WS}/settings`);
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.reason, 'UNKNOWN_ROUTE');

    assert.strictEqual(parseDeepLink('luxtax://nonsense/path').ok, false);
    assert.strictEqual(parseDeepLink(`luxtax://workspace/${WS}`).ok, false);
  });

  test('the scheme is case-insensitive and trailing slashes are tolerated', () => {
    assert.strictEqual(parseDeepLink(`LUXTAX://workspace/${WS}/estimate/`).ok, true);
  });

  test('build and parse round-trip for every route', () => {
    const routes = [
      { name: 'HOME' as const },
      { name: 'NOTIFICATIONS' as const },
      { name: 'WORKSPACE_ESTIMATE' as const, workspaceId: WS },
      { name: 'WORKSPACE_DOCUMENTS' as const, workspaceId: WS },
      { name: 'WORKSPACE_TASKS' as const, workspaceId: WS },
      { name: 'INVITE' as const, token: TOKEN },
      { name: 'RESET_PASSWORD' as const, token: TOKEN },
    ];

    for (const route of routes) {
      const parsed = parseDeepLink(buildDeepLink(route));
      assert.strictEqual(parsed.ok, true, route.name);
      if (parsed.ok) assert.deepStrictEqual(parsed.route, route, route.name);
    }
  });

  test('workspace routes need a session; home and notifications do not', () => {
    assert.strictEqual(requiresAuth({ name: 'WORKSPACE_ESTIMATE', workspaceId: WS }), true);
    assert.strictEqual(requiresAuth({ name: 'WORKSPACE_DOCUMENTS', workspaceId: WS }), true);
    assert.strictEqual(requiresAuth({ name: 'WORKSPACE_TASKS', workspaceId: WS }), true);
    assert.strictEqual(requiresAuth({ name: 'HOME' }), false);
    assert.strictEqual(requiresAuth({ name: 'NOTIFICATIONS' }), false);
    assert.strictEqual(requiresAuth({ name: 'INVITE', token: TOKEN }), false);
  });
});
