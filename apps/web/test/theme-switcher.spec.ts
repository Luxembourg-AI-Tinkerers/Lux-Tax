import './support/render-harness';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';

import LoginPage from '../src/app/(auth)/login/page';
import { ThemeSwitcher } from '../src/components/ui/ThemeSwitcher';
import { AuthProvider } from '../src/lib/auth-context';
import {
  THEME_COLORS,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  ThemeProvider,
  resolveTheme,
} from '../src/lib/theme-context';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TestRenderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => {
    toJSON: () => unknown;
    unmount: () => void;
    root: {
      findAll: (pred: (n: { type: unknown; props: Record<string, unknown> }) => boolean) => Array<{
        type: unknown;
        props: Record<string, unknown>;
      }>;
    };
  };
  act: (cb: () => void | Promise<void>) => Promise<void> | void;
};

interface JsonNode {
  type: unknown;
  props: Record<string, unknown>;
  children?: unknown;
}

function nodes(node: unknown): JsonNode[] {
  if (node === null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  const el = node as JsonNode;
  const self = typeof el.type === 'string' ? [el] : [];
  return self.concat(el.children ? nodes(el.children) : []);
}

const globals = globalThis as Record<string, unknown>;
const savedGlobals = {
  window: globals.window,
  document: globals.document,
  localStorage: globals.localStorage,
  params: globals.__nextParams,
  router: globals.__nextRouter,
  search: globals.__nextSearch,
};

interface MockBrowserOptions {
  storedTheme?: string;
  systemDark?: boolean;
  throwStorage?: boolean;
}

function installThemeEnvironment(opts: MockBrowserOptions = {}) {
  const store = new Map<string, string>();
  if (opts.storedTheme !== undefined) {
    store.set(THEME_STORAGE_KEY, opts.storedTheme);
  }

  let systemDark = opts.systemDark ?? false;
  const mediaListeners = new Set<(event: { matches: boolean }) => void>();
  const windowListeners = new Map<string, Set<(event: unknown) => void>>();

  const classSet = new Set<string>();
  const style: { colorScheme: string } = { colorScheme: '' };
  const metas = [{ content: '' }, { content: '' }];

  const metaWrappers = metas.map((m) => ({
    setAttribute(name: string, value: string) {
      if (name === 'content') m.content = value;
    },
    getContent: () => m.content,
  }));

  const storage = {
    getItem: (key: string) => {
      if (opts.throwStorage) throw new Error('storage disabled');
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (opts.throwStorage) throw new Error('storage disabled');
      store.set(key, value);
    },
    removeItem: (key: string) => {
      if (opts.throwStorage) throw new Error('storage disabled');
      store.delete(key);
    },
  };

  const mockDocument = {
    documentElement: {
      classList: {
        toggle: (cls: string, force?: boolean) => {
          if (force === undefined) {
            if (classSet.has(cls)) {
              classSet.delete(cls);
              return false;
            }
            classSet.add(cls);
            return true;
          }
          if (force) classSet.add(cls);
          else classSet.delete(cls);
          return force;
        },
        contains: (cls: string) => classSet.has(cls),
      },
      style,
    },
    querySelector: (selector: string) =>
      selector === 'meta[name="theme-color"]' ? metaWrappers[0] : null,
    querySelectorAll: (selector: string) =>
      selector === 'meta[name="theme-color"]' ? metaWrappers : [],
  };

  const mockWindow = {
    location: { href: '', search: '' },
    localStorage: storage,
    matchMedia: (query: string) => ({
      media: query,
      get matches() {
        return query.includes('prefers-color-scheme: dark') ? systemDark : false;
      },
      addEventListener: (type: string, cb: (event: { matches: boolean }) => void) => {
        if (type === 'change') mediaListeners.add(cb);
      },
      removeEventListener: (type: string, cb: (event: { matches: boolean }) => void) => {
        if (type === 'change') mediaListeners.delete(cb);
      },
    }),
    addEventListener: (type: string, cb: (event: unknown) => void) => {
      let set = windowListeners.get(type);
      if (!set) {
        set = new Set();
        windowListeners.set(type, set);
      }
      set.add(cb);
    },
    removeEventListener: (type: string, cb: (event: unknown) => void) => {
      windowListeners.get(type)?.delete(cb);
    },
  };

  globals.localStorage = storage;
  globals.document = mockDocument;
  globals.window = mockWindow;
  globals.__nextParams = {};
  globals.__nextSearch = '';
  globals.__nextRouter = { push: () => undefined, replace: () => undefined };

  return {
    store,
    classSet,
    style,
    metas,
    setSystemDark(next: boolean) {
      systemDark = next;
      for (const cb of mediaListeners) {
        cb({ matches: next });
      }
    },
    emitStorage(key: string, newValue: string | null) {
      for (const cb of windowListeners.get('storage') ?? []) {
        cb({ key, newValue });
      }
    },
  };
}

describe('Theme system & ThemeSwitcher', () => {
  afterEach(() => {
    globals.window = savedGlobals.window;
    globals.document = savedGlobals.document;
    globals.localStorage = savedGlobals.localStorage;
    globals.__nextParams = savedGlobals.params;
    globals.__nextRouter = savedGlobals.router;
    globals.__nextSearch = savedGlobals.search;
  });

  it('resolves explicit and system theme modes accurately', () => {
    assert.equal(resolveTheme('light', true), 'light');
    assert.equal(resolveTheme('light', false), 'light');
    assert.equal(resolveTheme('dark', false), 'dark');
    assert.equal(resolveTheme('dark', true), 'dark');
    assert.equal(resolveTheme('system', true), 'dark');
    assert.equal(resolveTheme('system', false), 'light');
  });

  it('applies dark class, colorScheme, and all theme-color meta tags in the init script without FOUC', () => {
    const env = installThemeEnvironment({ systemDark: true });
    new Function(THEME_INIT_SCRIPT)();

    assert.equal(env.classSet.has('dark'), true);
    assert.equal(env.style.colorScheme, 'dark');
    assert.deepEqual(
      env.metas.map((m) => m.content),
      [THEME_COLORS.dark, THEME_COLORS.dark],
    );

    const lightOverride = installThemeEnvironment({ storedTheme: 'light', systemDark: true });
    new Function(THEME_INIT_SCRIPT)();

    assert.equal(lightOverride.classSet.has('dark'), false);
    assert.equal(lightOverride.style.colorScheme, 'light');
    assert.deepEqual(
      lightOverride.metas.map((m) => m.content),
      [THEME_COLORS.light, THEME_COLORS.light],
    );
  });

  it('ignores corrupt storage values and storage exceptions in the init script', () => {
    const corruptEnv = installThemeEnvironment({ storedTheme: 'neon', systemDark: false });
    new Function(THEME_INIT_SCRIPT)();
    assert.equal(corruptEnv.classSet.has('dark'), false);
    assert.equal(corruptEnv.style.colorScheme, 'light');

    const restrictedEnv = installThemeEnvironment({ throwStorage: true });
    assert.doesNotThrow(() => new Function(THEME_INIT_SCRIPT)());
    assert.equal(restrictedEnv.classSet.has('dark'), false);
  });

  it('switches themes via segmented buttons, persists preference, and tracks system & storage changes', async () => {
    const env = installThemeEnvironment({ systemDark: false });
    let tree!: ReturnType<typeof TestRenderer.create>;

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(ThemeSwitcher, { variant: 'segmented' }),
        ),
      );
    });

    const buttons = () =>
      nodes(tree.toJSON()).filter((n) => n.type === 'button');

    const darkBtn = buttons().find((b) => b.props['aria-label'] === 'Dark theme');
    assert.ok(darkBtn, 'expected Dark theme button');

    await TestRenderer.act(async () => {
      (darkBtn.props.onClick as () => void)();
    });

    assert.equal(env.store.get(THEME_STORAGE_KEY), 'dark');
    assert.equal(env.classSet.has('dark'), true);
    assert.equal(env.style.colorScheme, 'dark');
    assert.equal(
      buttons().find((b) => b.props['aria-label'] === 'Dark theme')?.props['aria-pressed'],
      true,
    );

    const systemBtn = buttons().find((b) => b.props['aria-label'] === 'System theme');
    assert.ok(systemBtn);
    await TestRenderer.act(async () => {
      (systemBtn.props.onClick as () => void)();
    });
    assert.equal(env.store.get(THEME_STORAGE_KEY), 'system');
    assert.equal(env.classSet.has('dark'), false);

    // Live OS preference change applies immediately in system mode
    await TestRenderer.act(async () => {
      env.setSystemDark(true);
    });
    assert.equal(env.classSet.has('dark'), true);
    assert.equal(env.style.colorScheme, 'dark');

    // Cross-tab storage sync updates the active mode
    await TestRenderer.act(async () => {
      env.emitStorage(THEME_STORAGE_KEY, 'light');
    });
    assert.equal(env.classSet.has('dark'), false);
    assert.equal(
      buttons().find((b) => b.props['aria-label'] === 'Light theme')?.props['aria-pressed'],
      true,
    );

    await TestRenderer.act(async () => {
      tree.unmount();
    });
  });

  it('toggles between dark and light with the icon variant', async () => {
    const env = installThemeEnvironment({ systemDark: false });
    let tree!: ReturnType<typeof TestRenderer.create>;

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(ThemeSwitcher, { variant: 'icon' }),
        ),
      );
    });

    const getToggle = () => nodes(tree.toJSON()).find((n) => n.type === 'button')!;
    assert.equal(getToggle().props['aria-label'], 'Switch to dark theme');

    await TestRenderer.act(async () => {
      (getToggle().props.onClick as () => void)();
    });
    assert.equal(env.classSet.has('dark'), true);
    assert.equal(getToggle().props['aria-label'], 'Switch to light theme');

    await TestRenderer.act(async () => {
      (getToggle().props.onClick as () => void)();
    });
    assert.equal(env.classSet.has('dark'), false);
    assert.equal(getToggle().props['aria-label'], 'Switch to dark theme');

    await TestRenderer.act(async () => {
      tree.unmount();
    });
  });

  it('renders the color theme switcher inside the auth shell on LoginPage', async () => {
    installThemeEnvironment({ systemDark: false });
    let tree!: ReturnType<typeof TestRenderer.create>;

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(AuthProvider, null, React.createElement(LoginPage)),
        ),
      );
    });

    const group = nodes(tree.toJSON()).find(
      (n) => n.type === 'div' && n.props.role === 'group' && n.props['aria-label'] === 'Color theme',
    );
    assert.ok(group, 'expected AuthShell to render the Color theme group');

    await TestRenderer.act(async () => {
      tree.unmount();
    });
  });
});
