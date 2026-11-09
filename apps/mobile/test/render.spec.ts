/**
 * Renderer tests for the two mobile components.
 *
 * These are the first tests that actually **mount** the components: React 18 builds
 * an element tree and `react-test-renderer` walks it. `react-native` is replaced by
 * the primitive shim in `.tools/node_modules/react-native` (View/Text/TouchableOpacity
 * → host components, StyleSheet passthrough).
 *
 * Boundary: this proves the components mount, read props, take the right branches and
 * render the text the policy layer produced. It proves nothing about layout, styling,
 * gestures, accessibility bridging or native behaviour — there is no NativeModule here,
 * and "the React Native build was not run" remains true.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';

import { OfflineBanner } from '../src/components/OfflineBanner';
import { AppLockScreen } from '../src/components/AppLockScreen';

// react-test-renderer ships no bundled types in this scratch toolchain.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TestRenderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => {
    toJSON: () => unknown;
    root: { findByType: (t: unknown) => { props: Record<string, unknown> } };
    unmount: () => void;
  };
  act: (cb: () => void) => void;
};

/** Every string rendered anywhere in the tree, in order. */
function textOf(node: unknown): string[] {
  if (node === null || node === undefined || node === false) return [];
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(textOf);
  const children = (node as { children?: unknown }).children;
  return children ? textOf(children) : [];
}

/** Host component names actually rendered, e.g. ['View','View','Text']. */
function tagsOf(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(tagsOf);
  const el = node as { type?: string; children?: unknown };
  const self = typeof el.type === 'string' ? [el.type] : [];
  return self.concat(el.children ? tagsOf(el.children) : []);
}

function render(el: React.ReactElement): { text: string[]; tags: string[]; tree: unknown } {
  let renderer: ReturnType<typeof TestRenderer.create> | undefined;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(el);
  });
  const tree = renderer!.toJSON();
  const result = { text: textOf(tree), tags: tagsOf(tree), tree };
  TestRenderer.act(() => renderer!.unmount());
  return result;
}

const NOW = 1_700_000_000_000;

describe('OfflineBanner renderer', () => {
  it('renders nothing when the policy says the banner is hidden', () => {
    const { tree } = render(
      React.createElement(OfflineBanner, {
        isConnected: true,
        pendingOperations: 0,
        lastSyncedAt: NOW,
        now: NOW,
      }),
    );
    assert.equal(tree, null);
  });

  it('renders the offline title and detail from the policy layer', () => {
    const { text, tags } = render(
      React.createElement(OfflineBanner, {
        isConnected: false,
        pendingOperations: 0,
        lastSyncedAt: NOW,
        now: NOW,
      }),
    );
    assert.ok(text.length >= 2, `expected title and detail, got ${JSON.stringify(text)}`);
    assert.ok(text.some((t) => /offline|connexion/i.test(t)), JSON.stringify(text));
    assert.ok(tags.includes('View'));
    assert.ok(tags.includes('Text'));
  });

  it('shows the retry button only when a retry handler is given and the level is not ONLINE', () => {
    const withRetry = render(
      React.createElement(OfflineBanner, {
        isConnected: false,
        pendingOperations: 2,
        lastSyncedAt: NOW,
        now: NOW,
        onRetry: () => undefined,
      }),
    );
    assert.ok(withRetry.text.includes('Retry'), JSON.stringify(withRetry.text));
    assert.ok(withRetry.tags.includes('TouchableOpacity'));

    const withoutRetry = render(
      React.createElement(OfflineBanner, {
        isConnected: false,
        pendingOperations: 2,
        lastSyncedAt: NOW,
        now: NOW,
      }),
    );
    assert.ok(!withoutRetry.text.includes('Retry'));
    assert.ok(!withoutRetry.tags.includes('TouchableOpacity'));
  });

  it('honours a pinned status and colours it from the level', () => {
    const { text, tree } = render(
      React.createElement(OfflineBanner, {
        isConnected: true,
        pendingOperations: 0,
        now: NOW,
        statusOverride: {
          visible: true,
          level: 'STALE',
          title: 'Data may be outdated',
          detail: 'Last sync was long ago.',
        } as never,
        onRetry: () => undefined,
      }),
    );
    assert.deepEqual(text, ['Data may be outdated', 'Last sync was long ago.', 'Retry']);
    assert.match(JSON.stringify(tree), /#1e3a8a/);
  });

  it('carries the alert accessibility role', () => {
    const { tree } = render(
      React.createElement(OfflineBanner, {
        isConnected: false,
        pendingOperations: 0,
        now: NOW,
      }),
    );
    assert.equal((tree as { props: Record<string, unknown> }).props.accessibilityRole, 'alert');
  });
});

const baseLock = {
  enabled: true,
  biometricsAvailable: true,
  biometricsEnrolled: true,
  failedAttempts: 0,
  lockedUntil: null,
  lastUnlockedAt: NOW - 60_000,
  backgroundedAt: NOW - 60_000,
};

describe('AppLockScreen renderer', () => {
  it('offers biometrics and a passcode fallback, and wires both buttons', () => {
    const calls: string[] = [];
    const { text, tags } = render(
      React.createElement(AppLockScreen, {
        state: baseLock,
        now: NOW,
        onBiometric: () => calls.push('biometric'),
        onPasscode: () => calls.push('passcode'),
        onSignIn: () => calls.push('signin'),
        promptOverride: { kind: 'UNLOCK_BIOMETRIC', fallback: 'PASSCODE' },
      }),
    );
    assert.ok(text.includes('Lux-Tax'));
    assert.ok(text.includes('Unlock with biometrics'), JSON.stringify(text));
    assert.ok(text.includes('Use device passcode'));
    assert.equal(tags.filter((t) => t === 'TouchableOpacity').length, 2);
    assert.deepEqual(calls, []);
  });

  it('explains a missing enrolment instead of showing a biometric button', () => {
    const { text, tags } = render(
      React.createElement(AppLockScreen, {
        state: { ...baseLock, biometricsEnrolled: false },
        now: NOW,
        onBiometric: () => undefined,
        onPasscode: () => undefined,
        onSignIn: () => undefined,
        promptOverride: { kind: 'UNLOCK_PASSCODE', reason: 'NOT_ENROLLED' },
      }),
    );
    assert.ok(text.includes('No fingerprint or face is enrolled.'), JSON.stringify(text));
    assert.ok(text.includes('Use device passcode'));
    assert.ok(!text.includes('Unlock with biometrics'));
    assert.equal(tags.filter((t) => t === 'TouchableOpacity').length, 1);
  });

  it('shows a countdown while locked out', () => {
    const { text } = render(
      React.createElement(AppLockScreen, {
        state: baseLock,
        now: NOW,
        onBiometric: () => undefined,
        onPasscode: () => undefined,
        onSignIn: () => undefined,
        promptOverride: { kind: 'WAIT', retryAfterSeconds: 42, fallback: 'PASSCODE' },
      }),
    );
    assert.ok(
      text.some((t) => t.includes('42')),
      `expected the 42-second countdown, got ${JSON.stringify(text)}`,
    );
  });

  it('a discarded session offers sign-in only, so a locked-out user cannot retry', () => {
    const { text, tags } = render(
      React.createElement(AppLockScreen, {
        state: baseLock,
        now: NOW,
        onBiometric: () => undefined,
        onPasscode: () => undefined,
        onSignIn: () => undefined,
        promptOverride: { kind: 'SIGN_IN', reason: 'TOO_MANY_FAILURES' },
      }),
    );
    assert.ok(text.includes('Sign in again'), JSON.stringify(text));
    assert.ok(!text.includes('Unlock with biometrics'));
    assert.ok(!text.includes('Use device passcode'));
    assert.equal(tags.filter((t) => t === 'TouchableOpacity').length, 1, JSON.stringify(text));
  });

  it('derives its own prompt when none is pinned', () => {
    const { text } = render(
      React.createElement(AppLockScreen, {
        state: baseLock,
        now: NOW,
        onBiometric: () => undefined,
        onPasscode: () => undefined,
        onSignIn: () => undefined,
      }),
    );
    assert.ok(text.length > 2, JSON.stringify(text));
    assert.ok(text.includes('Lux-Tax'));
  });

  it('renders without a lock when the feature is disabled', () => {
    const { text } = render(
      React.createElement(AppLockScreen, {
        state: { ...baseLock, enabled: false },
        now: NOW,
        onBiometric: () => undefined,
        onPasscode: () => undefined,
        onSignIn: () => undefined,
      }),
    );
    assert.ok(text.includes('Lux-Tax'));
  });
});
