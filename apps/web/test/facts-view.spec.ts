/**
 * Two clicks on "Quick Load 2025 Demo Facts" used to insert the same six facts
 * twice, and the engine sums what is confirmed: €75,000 of gross salary became
 * €225,000 over two extra clicks. The loader now skips what is already recorded
 * and reports a failed insert instead of dropping it.
 *
 * `fetch` is stubbed with a store that really accumulates facts, so a duplicate
 * insert is visible in the data, not only in the call list.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';

import { FactsView } from '../src/components/FactsView';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TestRenderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => { toJSON: () => unknown; unmount: () => void };
  act: (cb: () => void | Promise<void>) => Promise<void> | void;
};

interface Call {
  url: string;
  method: string;
  body: unknown;
}

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

const originalFetch = globalThis.fetch;

interface StoredFact {
  id: string;
  category: string;
  fieldKey: string;
  amount: string;
  isIncludedInReturn: boolean;
}

/** A stub that stores confirmed facts like the API would. */
function stubStore(insertFails = false): { calls: Call[]; facts: StoredFact[] } {
  const calls: Call[] = [];
  const facts: StoredFact[] = [];

  (globalThis as { fetch: unknown }).fetch = async (url: unknown, init: unknown) => {
    const request = (init ?? {}) as { method?: string; body?: string };
    const method = request.method ?? 'GET';
    const body = request.body ? JSON.parse(request.body) : undefined;
    calls.push({ url: String(url), method, body });

    const target = String(url);
    if (target.endsWith('/facts') && method === 'GET') {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ extractedFacts: [], confirmedFacts: facts }),
      };
    }
    if (target.endsWith('/facts/confirm') && method === 'POST') {
      if (insertFails) {
        return {
          ok: false,
          status: 500,
          statusText: 'Server Error',
          json: async () => ({ message: 'Fact service down' }),
        };
      }
      const stored: StoredFact = {
        id: `fact-${facts.length + 1}`,
        category: String((body as { category: string }).category),
        fieldKey: String((body as { fieldKey: string }).fieldKey),
        amount: String((body as { amount: string }).amount),
        isIncludedInReturn: true,
      };
      facts.push(stored);
      return { ok: true, status: 200, statusText: 'OK', json: async () => stored };
    }
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({}) };
  };

  return { calls, facts };
}

async function mount(): Promise<{ tree: Node[]; text: () => string; unmount: () => void }> {
  let renderer: ReturnType<typeof TestRenderer.create> | undefined;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(
      React.createElement(FactsView, { workspaceId: 'ws-1', onFactsChanged: () => {} }),
    );
  });
  return {
    tree: nodes(renderer!.toJSON()),
    text: () => textOf(renderer!.toJSON()).join(' '),
    unmount: () => TestRenderer.act(() => renderer!.unmount()),
  };
}

function quickLoadButton(tree: Node[]): Node {
  const button = tree.find(
    (n) => n.type === 'button' && textOf(n).join('').includes('Demo Facts'),
  );
  assert.ok(button, 'the quick-load button was not rendered');
  return button!;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('FactsView — the demo loader is idempotent', () => {
  it('does not insert a second copy of the demo facts on a second click', async () => {
    const { calls, facts } = stubStore();
    const view = await mount();

    const button = quickLoadButton(view.tree);
    await TestRenderer.act(async () => {
      await (button.props.onClick as () => Promise<void>)();
    });
    const afterFirst = calls.filter((c) => c.url.endsWith('/facts/confirm')).length;
    assert.equal(afterFirst, 6, JSON.stringify(calls));

    // The button is disabled once everything is recorded; the handler is called
    // directly to prove that even a repeat invocation cannot duplicate a fact.
    await TestRenderer.act(async () => {
      await (button.props.onClick as () => Promise<void>)();
    });

    const confirms = calls.filter((c) => c.url.endsWith('/facts/confirm'));
    assert.equal(confirms.length, 6, 'a second click must not re-insert the demo set');
    const salaries = facts.filter((fact) => fact.fieldKey === 'grossSalary');
    assert.equal(salaries.length, 1, 'exactly one gross salary fact may exist');
    assert.equal(salaries[0]?.amount, '75000.00');
    view.unmount();
  });

  it('surfaces a failed insert instead of reporting success', async () => {
    const { facts } = stubStore(true);
    const view = await mount();

    const button = quickLoadButton(view.tree);
    await TestRenderer.act(async () => {
      await (button.props.onClick as () => Promise<void>)();
    });

    assert.equal(facts.length, 0);
    assert.match(view.text(), /Loading the demo facts failed: Fact service down/);
    view.unmount();
  });
});
