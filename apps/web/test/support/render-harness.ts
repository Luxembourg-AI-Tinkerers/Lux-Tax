/**
 * Shared render-harness setup. Import this before `react-test-renderer`.
 *
 * - React 19's test renderer warns (via `console.error`) when `act` runs
 *   without an explicit act environment, and emits a deprecation warning for
 *   the renderer itself. Specs that assert on captured `console.error` output,
 *   such as the logout path, must not count those warnings as application
 *   errors.
 * - Next's client helpers fall back to `self.setTimeout` when
 *   `requestIdleCallback` is absent, so `self` must resolve to the Node global.
 */
const globals = globalThis as Record<string, unknown>;

globals.IS_REACT_ACT_ENVIRONMENT = true;
globals.self ??= globalThis;

const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const first = typeof args[0] === 'string' ? args[0] : '';
  if (first.startsWith('react-test-renderer is deprecated')) return;
  originalConsoleError(...args);
};
