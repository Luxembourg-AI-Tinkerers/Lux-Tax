/**
 * Verifies the site-wide UI & UX improvements:
 *  - AdminConsoleView shows an honest "Administrator Access Required" gate on 403
 *    instead of printing a fake HEALTHY status and zero counters.
 *  - AssessmentView alerts the user when the workspace still needs approval before
 *    recording a filing.
 *  - ConfirmDialog exposes an accessible alertdialog that closes on Escape.
 */
import './support/render-harness';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';

import { TaxResidence, WorkspaceStatus } from '@luxtax/contracts';
import { AdminConsoleView } from '../src/components/AdminConsoleView';
import { AssessmentView } from '../src/components/AssessmentView';
import { WorkspaceShell } from '../src/components/WorkspaceShell';
import { ConfirmDialog } from '../src/components/ui/ConfirmDialog';

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

const originalFetch = globalThis.fetch;
const globals = globalThis as Record<string, unknown>;
const savedWindow = globals.window;
const savedLocalStorage = globals.localStorage;

afterEach(() => {
  globalThis.fetch = originalFetch;
  globals.window = savedWindow;
  globals.localStorage = savedLocalStorage;
});

function installStorage() {
  globals.localStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
  globals.window = {
    location: { href: '', search: '' },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

describe('AdminConsoleView — honest 403 gate', () => {
  it('shows Administrator Access Required instead of HEALTHY when endpoints return 403', async () => {
    installStorage();
    (globalThis as { fetch: unknown }).fetch = async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ message: 'Administrator access required' }),
    });

    let renderer: ReturnType<typeof TestRenderer.create> | undefined;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(React.createElement(AdminConsoleView));
    });

    const text = textOf(renderer!.toJSON()).join(' ');
    assert.match(text, /Administrator Access Required/);
    assert.ok(!text.includes('HEALTHY'), 'must not claim HEALTHY when admin access is denied');
    TestRenderer.act(() => renderer!.unmount());
  });
});

describe('AssessmentView — approval prerequisite banner', () => {
  it('warns when the workspace is not yet approved before recording a filing', async () => {
    installStorage();
    (globalThis as { fetch: unknown }).fetch = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => null,
    });

    let navigated = 0;
    let renderer: ReturnType<typeof TestRenderer.create> | undefined;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(AssessmentView, {
          workspace: {
            id: 'ws-1',
            householdId: 'hh-1',
            taxYear: 2025,
            status: WorkspaceStatus.COLLECTING,
            completionScore: 40,
            activeReturnVersion: 1,
            residenceStatus: TaxResidence.RESIDENT,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          onRefresh: () => {},
          onNavigateToFiling: () => {
            navigated += 1;
          },
        }),
      );
    });

    const tree = nodes(renderer!.toJSON());
    const text = textOf(renderer!.toJSON()).join(' ');
    assert.match(text, /Approval required before filing/);

    const goButton = tree.find(
      (n) => n.type === 'button' && textOf(n).join('').includes('Go to Approvals'),
    );
    assert.ok(goButton, 'expected Go to Approvals button');
    await TestRenderer.act(async () => {
      (goButton!.props.onClick as () => void)();
    });
    assert.equal(navigated, 1);

    TestRenderer.act(() => renderer!.unmount());
  });
});

describe('ConfirmDialog — accessible alertdialog', () => {
  it('renders alertdialog semantics and closes on Escape', async () => {
    let listener: ((e: { key: string }) => void) | undefined;
    globals.window = {
      addEventListener: (type: string, handler: (e: { key: string }) => void) => {
        if (type === 'keydown') listener = handler;
      },
      removeEventListener: () => undefined,
    };

    let cancelled = 0;
    let renderer: ReturnType<typeof TestRenderer.create> | undefined;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(ConfirmDialog, {
          isOpen: true,
          title: 'Delete item?',
          description: 'This cannot be undone.',
          onConfirm: () => {},
          onCancel: () => {
            cancelled += 1;
          },
        }),
      );
    });

    const tree = nodes(renderer!.toJSON());
    const dialog = tree.find((n) => n.props.role === 'alertdialog');
    assert.ok(dialog, 'missing role="alertdialog"');
    assert.equal(dialog!.props['aria-modal'], 'true');

    await TestRenderer.act(async () => {
      listener?.({ key: 'Escape' });
    });
    assert.equal(cancelled, 1);

    TestRenderer.act(() => renderer!.unmount());
  });
});

describe('WorkspaceShell — sidebar and responsive mobile dock', () => {
  it('renders grouped sidebar navigation and mobile bottom dock instead of top nav tabs', async () => {
    installStorage();
    globals.__nextParams = { householdId: 'hh-1' };
    globals.__nextRouter = { push: () => undefined, replace: () => undefined };
    let selectedTab = 'overview';
    let renderer: ReturnType<typeof TestRenderer.create> | undefined;

    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          WorkspaceShell,
          {
            activeTab: 'overview',
            onSelectTab: (tab) => {
              selectedTab = tab;
            },
            householdName: 'Dupont Household',
            selectedYear: 2025,
            onSelectYear: () => {},
            workspaces: [],
            workspace: null,
            statusTone: 'neutral',
            completionScore: 45,
            hasBalance: false,
            isRefund: false,
            balanceLabel: '—',
            hasCoFiler: false,
            onOpenInvite: () => {},
            userDisplayName: 'Claire Weber',
            userEmail: 'claire@example.lu',
            userInitials: 'CW',
            onLogout: () => {},
          },
          React.createElement('div', null, 'Canvas Content'),
        ),
      );
    });

    const tree = nodes(renderer!.toJSON());
    const sidebarNav = tree.find(
      (n) => n.type === 'nav' && n.props['aria-label'] === 'Workspace sections',
    );
    const mobileDock = tree.find(
      (n) => n.type === 'nav' && n.props['aria-label'] === 'Mobile navigation dock',
    );
    const oldTablist = tree.find((n) => n.props.role === 'tablist');

    assert.ok(sidebarNav, 'expected left sidebar navigation landmark');
    assert.ok(mobileDock, 'expected responsive mobile bottom navigation dock');
    assert.equal(oldTablist, undefined, 'top horizontal tablist must be removed');

    const docsButton = tree.find(
      (n) => n.type === 'button' && textOf(n).join('').includes('Document Vault'),
    );
    assert.ok(docsButton, 'expected Document Vault nav button in sidebar');
    await TestRenderer.act(async () => {
      (docsButton!.props.onClick as () => void)();
    });
    assert.equal(selectedTab, 'documents');

    TestRenderer.act(() => renderer!.unmount());
  });
});
