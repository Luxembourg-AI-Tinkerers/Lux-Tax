/**
 * The scan dialog let the user pick a document category and then never sent it:
 * every scan reached the API as an untyped file, so the extracted figures were
 * filed under the wrong return line. The chips were decoration.
 *
 * FileReader and `fetch` are stand-ins; the click path, the upload payload and
 * the dialog semantics are the real ones.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';

import { DocumentType } from '@luxtax/contracts';

import { CameraScanModal } from '../src/components/CameraScanModal';

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

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
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
const originalFileReader = (globalThis as { FileReader?: unknown }).FileReader;
const globals = globalThis as Record<string, unknown>;
const originalWindow = globals.window;

/** The dialog registers a keydown listener in an effect; effects are client-side only. */
function installWindow(): void {
  globals.window = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  // The client reads its bearer from storage; no session exists in this test.
  globals.localStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
}

/** Minimal FileReader: the dialog only needs `readAsDataURL` + `onload`. */
class StubFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;

  readAsDataURL(): void {
    this.result = 'data:image/jpeg;base64,AAAA';
    this.onload?.();
  }
}

function stubUpload(): Call[] {
  const calls: Call[] = [];
  (globalThis as { fetch: unknown }).fetch = async (url: unknown, init: unknown) => {
    const request = (init ?? {}) as { method?: string; body?: string };
    const method = request.method ?? 'GET';
    calls.push({
      url: String(url),
      method,
      body: request.body ? JSON.parse(request.body) : undefined,
    });

    const payload = method === 'POST' ? { id: 'doc-1' } : { id: 'doc-1', visibility: 'INCLUDED_IN_RETURN' };
    return { ok: true, status: 200, statusText: 'OK', json: async () => payload };
  };
  return calls;
}

async function mount(): Promise<{
  tree: () => Node[];
  unmount: () => void;
}> {
  let renderer: ReturnType<typeof TestRenderer.create> | undefined;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(
      React.createElement(CameraScanModal, {
        isOpen: true,
        workspaceId: 'ws-1',
        onClose: () => {},
        onSuccess: () => {},
        onError: () => {},
      }),
    );
  });
  return {
    tree: () => nodes(renderer!.toJSON()),
    unmount: () => TestRenderer.act(() => renderer!.unmount()),
  };
}

function buttonWithText(tree: Node[], text: string): Node {
  const button = tree.find((n) => n.type === 'button' && textOf(n).join('').includes(text));
  assert.ok(button, `no button containing "${text}"`);
  return button!;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  (globalThis as { FileReader?: unknown }).FileReader = originalFileReader;
  globals.window = originalWindow;
});

describe('CameraScanModal — the chosen category reaches the API', () => {
  it('uploads the selected document type with the scan', async () => {
    installWindow();
    (globalThis as { FileReader?: unknown }).FileReader = StubFileReader;
    const calls = stubUpload();
    const view = await mount();

    // Capture a photo through the phone-camera input.
    const fileInput = view.tree().find((n) => n.type === 'input' && n.props.type === 'file');
    assert.ok(fileInput, 'the capture input was not rendered');
    await TestRenderer.act(async () => {
      (fileInput!.props.onChange as (e: unknown) => void)({
        target: { files: [{ name: 'receipt.jpg', type: 'image/jpeg' }] },
      });
    });

    // Pick "Mortgage Interest", then upload.
    const chip = buttonWithText(view.tree(), 'Mortgage Interest');
    await TestRenderer.act(async () => {
      (chip.props.onClick as () => void)();
    });
    const upload = buttonWithText(view.tree(), 'Upload & Extract Facts');
    await TestRenderer.act(async () => {
      await (upload.props.onClick as () => Promise<void>)();
    });

    const post = calls.find((call) => call.method === 'POST');
    assert.ok(post, `no upload was sent: ${JSON.stringify(calls)}`);
    assert.equal(post!.body?.documentType, DocumentType.MORTGAGE_CERTIFICATE);
    view.unmount();
  });

  it('is exposed to assistive technology as a modal dialog', async () => {
    installWindow();
    stubUpload();
    const view = await mount();
    const dialog = view.tree().find((n) => n.props.role === 'dialog');

    assert.ok(dialog, 'the dialog has no role="dialog"');
    assert.equal(dialog!.props['aria-modal'], 'true');
    assert.equal(dialog!.props['aria-labelledby'], 'camera-scan-title');
    assert.ok(
      view.tree().some((n) => n.props.id === 'camera-scan-title'),
      'the accessible name does not resolve to a heading',
    );
    view.unmount();
  });
});
