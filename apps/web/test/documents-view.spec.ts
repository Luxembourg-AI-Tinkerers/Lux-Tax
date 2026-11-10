/**
 * The vault's visibility control used to demote a document out of the return on
 * a single click, with no confirmation and no way back to PRIVATE_DRAFT: a
 * misplaced click silently changed what gets filed.
 *
 * The view is mounted for real (React 18 renderer), `fetch` is stubbed — the
 * PATCH the component sends and the confirmation it asks for are the real ones.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';

import { DocumentStatus, DocumentType, DocumentVisibility } from '@luxtax/contracts';

import { DocumentsView } from '../src/components/DocumentsView';

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

function documentWith(visibility: DocumentVisibility) {
  return {
    id: 'doc-1',
    workspaceId: 'ws-1',
    uploaderId: 'user-1',
    ownerId: 'user-1',
    ownerEmail: 'spouse@example.lu',
    fileName: 'certificat.pdf',
    originalName: 'Certificat de remuneration 2025.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
    sha256Hash: 'abc',
    documentType: DocumentType.SALARY_CERTIFICATE,
    status: DocumentStatus.EXTRACTED,
    visibility,
    taxYear: 2025,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const originalFetch = globalThis.fetch;
const originalConfirm = (globalThis as { confirm?: unknown }).confirm;

function stubFetch(visibility: DocumentVisibility): Call[] {
  const calls: Call[] = [];
  (globalThis as { fetch: unknown }).fetch = async (url: unknown, init: unknown) => {
    const request = (init ?? {}) as { method?: string; body?: string };
    const method = request.method ?? 'GET';
    calls.push({
      url: String(url),
      method,
      body: request.body ? JSON.parse(request.body) : undefined,
    });

    const target = String(url);
    if (target.endsWith('/documents') && method === 'GET') {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => [documentWith(visibility)],
      };
    }
    if (target.endsWith('/facts')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ extractedFacts: [], confirmedFacts: [] }),
      };
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ ...documentWith(visibility), visibility: 'PRIVATE_DRAFT' }),
    };
  };
  return calls;
}

async function mount(): Promise<{ tree: Node[]; unmount: () => void }> {
  let renderer: ReturnType<typeof TestRenderer.create> | undefined;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(
      React.createElement(DocumentsView, {
        workspaceId: 'ws-1',
        members: [],
        onFactsChanged: () => {},
      }),
    );
  });
  return { tree: nodes(renderer!.toJSON()), unmount: () => TestRenderer.act(() => renderer!.unmount()) };
}

function visibilityButton(tree: Node[]): Node {
  const button = tree.find(
    (n) => n.type === 'button' && textOf(n).join('').includes('INCLUDED IN RETURN'),
  );
  assert.ok(button, 'the visibility button of the included document was not rendered');
  return button!;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  (globalThis as { confirm?: unknown }).confirm = originalConfirm;
});

describe('DocumentsView — removing a document from the return needs confirmation', () => {
  it('leaves the document alone when the confirmation is declined', async () => {
    const calls = stubFetch(DocumentVisibility.INCLUDED_IN_RETURN);
    const view = await mount();

    let asked = '';
    (globalThis as { confirm?: unknown }).confirm = (message: string) => {
      asked = message;
      return false;
    };

    await TestRenderer.act(async () => {
      (visibilityButton(view.tree).props.onClick as () => Promise<void>)();
    });

    assert.match(asked, /removes its figures from the return/);
    assert.equal(
      calls.some((call) => call.method === 'PATCH'),
      false,
      'declining must not send the visibility change',
    );
    view.unmount();
  });

  it('applies the change once it is confirmed, back to the private draft', async () => {
    const calls = stubFetch(DocumentVisibility.INCLUDED_IN_RETURN);
    const view = await mount();
    (globalThis as { confirm?: unknown }).confirm = () => true;

    await TestRenderer.act(async () => {
      (visibilityButton(view.tree).props.onClick as () => Promise<void>)();
    });

    const patch = calls.find((call) => call.method === 'PATCH');
    assert.ok(patch, `no PATCH was sent: ${JSON.stringify(calls)}`);
    assert.match(patch!.url, /\/documents\/doc-1\/visibility$/);
    assert.deepEqual(patch!.body, { visibility: DocumentVisibility.PRIVATE_DRAFT });
    view.unmount();
  });

  it('promotes a private draft without asking', async () => {
    const calls = stubFetch(DocumentVisibility.PRIVATE_DRAFT);
    const view = await mount();

    let asked = 0;
    (globalThis as { confirm?: unknown }).confirm = () => {
      asked += 1;
      return false;
    };

    const button = view.tree.find(
      (n) => n.type === 'button' && textOf(n).join('').includes('PRIVATE DRAFT'),
    );
    assert.ok(button, 'the private draft was not rendered');
    await TestRenderer.act(async () => {
      (button!.props.onClick as () => Promise<void>)();
    });

    assert.equal(asked, 0, 'no confirmation is needed to add evidence');
    const patch = calls.find((call) => call.method === 'PATCH');
    assert.ok(patch, 'the promotion was not sent');
    assert.deepEqual(patch!.body, { visibility: DocumentVisibility.SHARED_FOR_DISCUSSION });
    view.unmount();
  });
});
