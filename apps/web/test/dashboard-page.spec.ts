/**
 * The dashboard used to ignore every `res.error`: a failed workspace read left
 * the previous workspace mounted, and a URL without a household kept the page
 * on its spinner forever (`if (!householdId) return;` never cleared the flag).
 *
 * `next/navigation` and the browser storage are harness stand-ins; `fetch` is
 * stubbed. The page, its effects and the error branch are the real ones.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';

import DashboardPage from '../src/app/(workspace)/[householdId]/dashboard/page';
import { AuthProvider } from '../src/lib/auth-context';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TestRenderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => {
    toJSON: () => unknown;
    unmount: () => void;
    update: (el: React.ReactElement) => void;
  };
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

function household(id: string, name: string) {
  return { id, name, members: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
}

function workspace(id: string, householdId: string, status: string, completionScore: number) {
  return {
    id,
    householdId,
    taxYear: 2025,
    status,
    completionScore,
    activeReturnVersion: 0,
    residenceStatus: 'RESIDENT',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const originalFetch = globalThis.fetch;
const globals = globalThis as Record<string, unknown>;

const savedGlobals = {
  window: globals.window,
  localStorage: globals.localStorage,
  params: globals.__nextParams,
};

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    json: async () => body,
  };
}

/** Installs the browser surface the page expects, plus the route params. */
function installBrowser(params: Record<string, string>): void {
  const store = new Map<string, string>();
  store.set('luxtax_access_token', 'token-1');
  globals.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  globals.window = {
    location: { href: '', search: '' },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    // NotificationCenter polls with window.setInterval; delegate to Node's timers.
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
  globals.__nextParams = params;
  globals.__nextSearch = '';
  globals.__nextRouter = { push: () => undefined, replace: () => undefined };
}

/**
 * `hh-good` answers every read; `hh-broken` has a household but no workspace
 * for the requested year, which is the failure the page used to swallow.
 */
function stubHouseholds(): string[] {
  const calls: string[] = [];
  (globalThis as { fetch: unknown }).fetch = async (url: unknown) => {
    const target = String(url);
    calls.push(target);
    if (target.endsWith('/api/users/me')) return reply(200, USER);
    if (target.endsWith('/activity')) return reply(200, []);
    if (target.endsWith('/api/households/hh-good')) return reply(200, household('hh-good', 'Dupont Household'));
    if (target.endsWith('/api/households/hh-good/workspaces')) {
      return reply(200, [workspace('ws-good', 'hh-good', 'APPROVED', 42)]);
    }
    if (target.endsWith('/api/households/hh-good/workspaces/2025')) {
      return reply(200, workspace('ws-good', 'hh-good', 'APPROVED', 42));
    }
    if (target.endsWith('/api/households/hh-good/workspaces/2025/readiness')) {
      return reply(200, {
        workspaceId: 'ws-good',
        taxYear: 2025,
        completionScore: 42,
        totalTasks: 0,
        unresolvedBlockers: 0,
        unresolvedWarnings: 0,
        tasks: [],
      });
    }
    if (target.endsWith('/api/households/hh-broken')) return reply(200, household('hh-broken', 'Empty Household'));
    if (target.endsWith('/api/households/hh-broken/workspaces')) return reply(200, []);
    if (target.includes('/api/households/hh-broken/workspaces/2025')) {
      return reply(404, { message: 'No workspace exists for tax year 2025' });
    }
    return reply(500, { message: `unexpected request ${target}` });
  };
  return calls;
}

async function mount(): Promise<{
  text: () => string;
  tree: () => Node[];
  switchTo: (householdId: string) => Promise<void>;
  unmount: () => void;
}> {
  let renderer: ReturnType<typeof TestRenderer.create> | undefined;
  const tree = () => React.createElement(AuthProvider, null, React.createElement(DashboardPage));

  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(tree());
  });

  return {
    text: () => textOf(renderer!.toJSON()).join(' '),
    tree: () => nodes(renderer!.toJSON()),
    switchTo: async (householdId: string) => {
      globals.__nextParams = { householdId };
      await TestRenderer.act(async () => {
        renderer!.update(tree());
      });
    },
    unmount: () => TestRenderer.act(() => renderer!.unmount()),
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  globals.window = savedGlobals.window;
  globals.localStorage = savedGlobals.localStorage;
  globals.__nextParams = savedGlobals.params;
});

describe('DashboardPage — a failed load is reported, not silently kept', () => {
  it('clears the previous workspace when the next household has none', async () => {
    installBrowser({ householdId: 'hh-good' });
    stubHouseholds();
    const view = await mount();

    const loaded = view.text();
    assert.match(loaded, /42/, 'the first workspace did not load');
    assert.match(loaded, /APPROVED/);

    await view.switchTo('hh-broken');

    const text = view.text();
    assert.match(text, /No workspace exists for tax year 2025/, 'the failure must be shown');
    assert.ok(!text.includes('42%'), 'the previous completion score must be gone');
    assert.ok(!text.includes('APPROVED'), 'the previous workspace status must be gone');
    assert.ok(!text.includes('Loading tax workspace'), 'the spinner must not stay on screen');
    view.unmount();
  });

  it('renders a missing tax balance as a dash, never as €0.00', async () => {
    installBrowser({ householdId: 'hh-good' });
    stubHouseholds();
    const view = await mount();

    const text = view.text();
    assert.match(text, /Estimated Outcome/);
    assert.ok(text.includes('—'), `a missing balance must render as an em dash:\n${text}`);
    assert.ok(!text.includes('€0.00'), 'a missing balance must not look like a zero');
    view.unmount();
  });

  it('exposes the overview cards as keyboard-operable buttons', async () => {
    installBrowser({ householdId: 'hh-good' });
    stubHouseholds();
    const view = await mount();

    const cards = view
      .tree()
      .filter((node) => node.type === 'div' && node.props.role === 'button');
    assert.equal(cards.length, 4, 'the four overview cards must be buttons to assistive technology');
    for (const card of cards) {
      assert.equal(card.props.tabIndex, 0, 'a card must be reachable with Tab');
      assert.equal(typeof card.props.onKeyDown, 'function', 'a card must handle Enter/Space');
    }
    view.unmount();
  });

  it('stops loading and explains itself when the URL has no household id', async () => {
    installBrowser({});
    const calls: string[] = [];
    (globalThis as { fetch: unknown }).fetch = async (url: unknown) => {
      calls.push(String(url));
      if (String(url).endsWith('/api/users/me')) return reply(200, USER);
      return reply(500, { message: 'no household request was expected' });
    };

    const view = await mount();
    const text = view.text();

    assert.match(text, /carries no household identifier/);
    assert.ok(!text.includes('Loading tax workspace'), 'the page must not stay on its spinner');
    assert.equal(
      calls.some((call) => call.includes('/api/households')),
      false,
      'nothing can be requested without a household',
    );
    view.unmount();
  });
});
