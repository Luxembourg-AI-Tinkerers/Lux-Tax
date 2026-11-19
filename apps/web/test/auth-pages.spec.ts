/**
 * Two auth-page defects are pinned here:
 *  - the invitation links carry `?redirect=/invite/<token>`, which neither page
 *    read, so the token was lost on the way in;
 *  - the fields had labels that were not associated with their inputs, so a
 *    screen reader announced them as unlabelled edit boxes.
 *
 * `next/navigation`, storage and `fetch` are stand-ins; the submit path, the
 * redirect resolution and the label wiring are the real ones.
 */
import './support/render-harness';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';

import LoginPage from '../src/app/(auth)/login/page';
import RegisterPage from '../src/app/(auth)/register/page';
import { AuthProvider } from '../src/lib/auth-context';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TestRenderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => { toJSON: () => unknown; unmount: () => void };
  act: (cb: () => void | Promise<void>) => Promise<void> | void;
};

interface Node {
  type: unknown;
  props: Record<string, unknown>;
  children?: unknown;
}

function nodes(node: unknown): Node[] {
  if (node === null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  const el = node as Node;
  const self = typeof el.type === 'string' ? [el] : [];
  return self.concat(el.children ? nodes(el.children) : []);
}

function textOf(node: unknown): string[] {
  if (node === null || node === undefined || node === false) return [];
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(textOf);
  const children = (node as { children?: unknown }).children;
  return children ? textOf(children) : [];
}

const USER = { id: 'user-1', email: 'spouse@example.lu', isEmailVerified: true, createdAt: '2026-01-01T00:00:00.000Z' };
const TOKENS = { accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 900 };

const originalFetch = globalThis.fetch;
const globals = globalThis as Record<string, unknown>;
const saved = {
  window: globals.window,
  localStorage: globals.localStorage,
  params: globals.__nextParams,
  router: globals.__nextRouter,
};

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    json: async () => body,
  };
}

/** Installs storage + a router that records where the page navigates to. */
function installBrowser(search: string): { pushed: string[]; calls: string[] } {
  const store = new Map<string, string>();
  globals.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  globals.window = {
    location: { href: '', search },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  globals.__nextParams = {};
  globals.__nextSearch = search;

  const pushed: string[] = [];
  globals.__nextRouter = { push: (path: string) => void pushed.push(path), replace: () => undefined };

  const calls: string[] = [];
  (globalThis as { fetch: unknown }).fetch = async (url: unknown, init: unknown) => {
    const target = String(url);
    const method = ((init ?? {}) as { method?: string }).method ?? 'GET';
    calls.push(`${method} ${target}`);
    if (target.endsWith('/api/auth/login') || target.endsWith('/api/auth/register')) {
      return reply(200, { user: USER, tokens: TOKENS });
    }
    if (target.endsWith('/api/households') && method === 'GET') return reply(200, []);
    if (target.endsWith('/api/households') && method === 'POST') {
      return reply(200, { id: 'hh-new', name: 'Household', members: [] });
    }
    return reply(500, { message: `unexpected request ${method} ${target}` });
  };

  return { pushed, calls };
}

async function mount(page: React.ReactElement): Promise<{
  tree: () => Node[];
  submit: () => Promise<void>;
  unmount: () => void;
}> {
  let renderer: ReturnType<typeof TestRenderer.create> | undefined;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(React.createElement(AuthProvider, null, page));
  });
  return {
    tree: () => nodes(renderer!.toJSON()),
    submit: async () => {
      const form = nodes(renderer!.toJSON()).find((n) => n.type === 'form');
      assert.ok(form, 'the page rendered no form');
      await TestRenderer.act(async () => {
        await (form!.props.onSubmit as (e: unknown) => Promise<void>)({ preventDefault: () => undefined });
      });
    },
    unmount: () => TestRenderer.act(() => renderer!.unmount()),
  };
}

/** Every input must be named by a <label for="…"> that points at its id. */
function assertLabelled(tree: Node[]): void {
  const inputs = tree.filter((n) => n.type === 'input');
  assert.ok(inputs.length > 0, 'the page rendered no inputs');
  const labelled = new Set(
    tree
      .filter((n) => n.type === 'label' && typeof n.props.htmlFor === 'string')
      .map((n) => n.props.htmlFor as string),
  );
  for (const input of inputs) {
    const id = input.props.id;
    assert.ok(typeof id === 'string' && id.length > 0, 'an input has no id');
    assert.ok(labelled.has(id as string), `input "${String(id)}" has no <label htmlFor>`);
  }
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  globals.window = saved.window;
  globals.localStorage = saved.localStorage;
  globals.__nextParams = saved.params;
  globals.__nextRouter = saved.router;
});

describe('LoginPage', () => {
  it('goes back to the invitation that sent the user here', async () => {
    const { pushed } = installBrowser('?redirect=/invite/token-1');
    const view = await mount(React.createElement(LoginPage));

    await view.submit();

    assert.deepEqual(pushed, ['/invite/token-1']);
    view.unmount();
  });

  it('falls back to the household dashboard without a redirect', async () => {
    const { pushed } = installBrowser('');
    const view = await mount(React.createElement(LoginPage));

    await view.submit();

    assert.deepEqual(pushed, ['/']);
    view.unmount();
  });

  it('renders the server message for a wrong password and stays on the page', async () => {
    const { pushed } = installBrowser('');
    (globalThis as { fetch: unknown }).fetch = async (url: unknown) => {
      const target = String(url);
      if (target.endsWith('/api/auth/login')) {
        return reply(401, { message: 'Invalid email or password' });
      }
      return reply(500, { message: `unexpected request ${target}` });
    };

    const view = await mount(React.createElement(LoginPage));
    await view.submit();

    const text = textOf(view.tree()).join(' ');
    assert.match(text, /Invalid email or password/);
    assert.deepEqual(pushed, [], 'a failed login must not navigate');
    view.unmount();
  });

  it('labels every field', async () => {
    installBrowser('');
    const view = await mount(React.createElement(LoginPage));
    assertLabelled(view.tree());
    view.unmount();
  });
});

describe('RegisterPage', () => {
  it('goes back to the invitation instead of creating a household first', async () => {
    const { pushed, calls } = installBrowser('?redirect=/invite/token-2');
    const view = await mount(React.createElement(RegisterPage));

    await view.submit();

    assert.deepEqual(pushed, ['/invite/token-2']);
    assert.equal(
      calls.some((call) => call.startsWith('POST') && call.endsWith('/api/households')),
      false,
      'the invited user joins an existing household, no new one is created',
    );
    view.unmount();
  });

  it('labels every field', async () => {
    installBrowser('');
    const view = await mount(React.createElement(RegisterPage));
    assertLabelled(view.tree());
    view.unmount();
  });
});
