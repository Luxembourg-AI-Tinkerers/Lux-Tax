/**
 * Signing out used to POST to a literal `http://localhost:3001` and ignore the
 * answer. It now uses the configured base URL and does not silently pretend the
 * refresh token was revoked when the call fails — while still ending the local
 * session, which is what the user asked for.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';

import { AuthProvider, useAuth } from '../src/lib/auth-context';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TestRenderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => { toJSON: () => unknown; unmount: () => void };
  act: (cb: () => void | Promise<void>) => Promise<void> | void;
};

const globals = globalThis as Record<string, unknown>;
const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
const saved = { window: globals.window, localStorage: globals.localStorage };

/** A button that signs the provider's user out. */
function LogoutProbe() {
  const { logout } = useAuth();
  return React.createElement('button', { onClick: () => void logout() }, 'Sign Out');
}

function installSession(): { navigate: () => string; store: Map<string, string> } {
  const store = new Map<string, string>();
  store.set('luxtax_access_token', 'access-1');
  store.set('luxtax_refresh_token', 'refresh-1');
  globals.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  const location = { href: '', search: '' };
  globals.window = {
    location,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  return { navigate: () => location.href, store };
}

async function mount(): Promise<{ clickSignOut: () => Promise<void>; unmount: () => void }> {
  let renderer: ReturnType<typeof TestRenderer.create> | undefined;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(
      React.createElement(AuthProvider, null, React.createElement(LogoutProbe)),
    );
  });
  const tree = renderer!.toJSON() as { props: { onClick: () => Promise<void> } };
  return {
    clickSignOut: async () => {
      await TestRenderer.act(async () => {
        await tree.props.onClick();
      });
    },
    unmount: () => TestRenderer.act(() => renderer!.unmount()),
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
  globals.window = saved.window;
  globals.localStorage = saved.localStorage;
});

describe('sign-out', () => {
  it('posts to the configured API base URL', async () => {
    installSession();
    const calls: string[] = [];
    (globalThis as { fetch: unknown }).fetch = async (url: unknown) => {
      calls.push(String(url));
      return { ok: true, status: 204, statusText: 'No Content', json: async () => ({}) };
    };

    const view = await mount();
    await view.clickSignOut();

    const logoutCalls = calls.filter((call) => call.endsWith('/api/auth/logout'));
    assert.deepEqual(logoutCalls, ['http://localhost:3001/api/auth/logout']);
    view.unmount();
  });

  it('records a failed revocation instead of hiding it, and still ends the session', async () => {
    const session = installSession();
    (globalThis as { fetch: unknown }).fetch = async () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({ message: 'boom' }),
    });

    const messages: unknown[] = [];
    console.error = (...args: unknown[]) => {
      messages.push(args[0]);
    };

    const view = await mount();
    await view.clickSignOut();

    assert.equal(session.store.size, 0, 'the local tokens must be cleared');
    assert.equal(session.navigate(), '/login');
    assert.equal(messages.length, 1, 'the un-revoked refresh token must be reported');
    assert.match(String(messages[0]), /Logout request failed/);
    view.unmount();
  });
});
