/**
 * The invite dialog is where a co-filer is added, and it is reached from the
 * primary flow: it must be a real dialog to assistive technology (role, aria,
 * Escape) and its two fields must be labelled.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';

import { InviteModal } from '../src/components/InviteModal';

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

const globals = globalThis as Record<string, unknown>;
const savedWindow = globals.window;

/** Captures the keydown listener the dialog registers. */
function installWindow(): { pressEscape: () => void } {
  let listener: ((event: { key: string }) => void) | undefined;
  globals.window = {
    addEventListener: (type: string, handler: (event: { key: string }) => void) => {
      if (type === 'keydown') listener = handler;
    },
    removeEventListener: () => undefined,
  };
  return {
    pressEscape: () => {
      assert.ok(listener, 'the dialog registered no keydown listener');
      listener!({ key: 'Escape' });
    },
  };
}

async function mount(onClose: () => void): Promise<{ tree: () => Node[]; unmount: () => void }> {
  let renderer: ReturnType<typeof TestRenderer.create> | undefined;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(
      React.createElement(InviteModal, {
        householdId: 'hh-1',
        isOpen: true,
        onClose,
        onSuccess: () => {},
      }),
    );
  });
  return {
    tree: () => nodes(renderer!.toJSON()),
    unmount: () => TestRenderer.act(() => renderer!.unmount()),
  };
}

afterEach(() => {
  globals.window = savedWindow;
});

describe('InviteModal', () => {
  it('exposes itself as a modal dialog named by its heading', async () => {
    installWindow();
    const view = await mount(() => {});

    const dialog = view.tree().find((node) => node.props.role === 'dialog');
    assert.ok(dialog, 'no role="dialog"');
    assert.equal(dialog!.props['aria-modal'], 'true');
    assert.equal(dialog!.props['aria-labelledby'], 'invite-modal-title');
    assert.ok(
      view.tree().some((node) => node.props.id === 'invite-modal-title'),
      'the label points at nothing',
    );
    view.unmount();
  });

  it('closes on Escape', async () => {
    const windowStub = installWindow();
    let closed = 0;
    const view = await mount(() => {
      closed += 1;
    });

    await TestRenderer.act(async () => {
      windowStub.pressEscape();
    });

    assert.equal(closed, 1);
    view.unmount();
  });

  it('labels both fields', async () => {
    installWindow();
    const view = await mount(() => {});
    const tree = view.tree();

    const labelled = new Set(
      tree
        .filter((node) => node.type === 'label' && typeof node.props.htmlFor === 'string')
        .map((node) => node.props.htmlFor as string),
    );
    const fields = tree.filter((node) => node.type === 'input' || node.type === 'select');
    assert.equal(fields.length, 2, 'expected the email and role fields');
    for (const field of fields) {
      const id = field.props.id;
      assert.ok(typeof id === 'string' && id.length > 0, 'a field has no id');
      assert.ok(labelled.has(id as string), `field "${String(id)}" has no <label htmlFor>`);
    }
    view.unmount();
  });
});
