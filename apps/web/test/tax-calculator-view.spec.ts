/**
 * First test that mounts a web view.
 *
 * `TaxCalculatorView` fetches on mount through the real `LuxTaxApiClient`, so this test
 * stubs `fetch` (the client's only I/O) rather than the client itself: the request path,
 * the envelope handling and the render are all exercised.
 *
 * The fixture is **not hand-written**. `calculations.service.ts` builds the DTO as
 * `{ ...engineResult, comparisonEligible }`, so the test runs the real engine for a
 * known salary and feeds its output to the view — the numbers on screen are the numbers
 * the tax engine produced.
 *
 * Boundary: React 19 renders to host elements ('div', 'button', …); there is no DOM, no
 * layout, no Tailwind evaluation and no browser. Class names are asserted only where the
 * copy matters, never to prove styling.
 */
import './support/render-harness';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';

import { TaxClass, TaxResidence, type TaxCalculationResultDto } from '@luxtax/contracts';
import { LuxembourgTaxEngine } from '@luxtax/tax-engine';

import { TaxCalculatorView } from '../src/components/TaxCalculatorView';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TestRenderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => {
    toJSON: () => unknown;
    unmount: () => void;
    update: (el: React.ReactElement) => void;
  };
  act: (cb: () => void | Promise<void>) => Promise<void> | void;
};

function textOf(node: unknown): string[] {
  if (node === null || node === undefined || node === false) return [];
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(textOf);
  const children = (node as { children?: unknown }).children;
  return children ? textOf(children) : [];
}

const engineResult = LuxembourgTaxEngine.calculate({
  taxClass: TaxClass.CLASS_1,
  residence: TaxResidence.RESIDENT,
  primaryUserId: 'u1',
  taxYear: 2025,
  facts: [
    { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 } as never,
  ],
});

const dto = engineResult as unknown as TaxCalculationResultDto;

const originalFetch = globalThis.fetch;

function stubFetch(payload: unknown, ok = true, status = 200): string[] {
  const calls: string[] = [];
  (globalThis as { fetch: unknown }).fetch = async (url: unknown) => {
    calls.push(String(url));
    return {
      ok,
      status,
      statusText: ok ? 'OK' : 'Server Error',
      json: async () =>
        ok ? payload : { message: 'Calculation failed upstream' },
    };
  };
  return calls;
}

async function mount(): Promise<{ text: string[]; tree: unknown; unmount: () => void }> {
  let renderer: ReturnType<typeof TestRenderer.create> | undefined;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(
      React.createElement(TaxCalculatorView, { workspaceId: 'ws-1', taxYear: 2025 }),
    );
  });
  const tree = renderer!.toJSON();
  return {
    text: textOf(tree),
    tree,
    unmount: () => TestRenderer.act(() => renderer!.unmount()),
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('TaxCalculatorView — mounts and renders engine output', () => {
  it('requests the saved calculation for the workspace and shows the engine figures', async () => {
    const calls = stubFetch(dto);
    const view = await mount();

    assert.ok(
      calls.some((u) => u.includes('/api/workspaces/ws-1/calculation')),
      `unexpected requests: ${JSON.stringify(calls)}`,
    );

    const joined = view.text.join('');
    assert.match(joined, /Deterministic Tax Engine \(Tax Year 2025\)/);
    assert.match(joined, new RegExp(dto.rulePackageVersion.replace(/\./g, '\\.')));

    // The taxable income is rendered with two decimals; assert the exact formatted figure.
    const formatted = dto.taxableIncome.toLocaleString('en-US', { minimumFractionDigits: 2 });
    assert.ok(joined.includes(formatted), `expected ${formatted} in:\n${joined}`);

    view.unmount();
  });

  it('shows the unsupported-scenario banner when the engine refused part of the input', async () => {
    stubFetch({
      ...dto,
      unsupported: ['Foreign income under Art. 3ter is not modelled for this profile.'],
    });
    const view = await mount();
    const joined = view.text.join('');

    assert.match(joined, /This scenario is not fully supported/);
    assert.match(joined, /Foreign income under Art\. 3ter is not modelled/);
    assert.match(joined, /Do not file from this estimate\./);
    view.unmount();
  });

  it('hides the banner when nothing was refused', async () => {
    stubFetch({ ...dto, unsupported: [] });
    const view = await mount();
    assert.ok(!view.text.join('').includes('This scenario is not fully supported'));
    view.unmount();
  });

  it('falls back to the empty state when no calculation is saved yet', async () => {
    stubFetch(null);
    const view = await mount();
    const joined = view.text.join(' | ');
    assert.match(joined, /Run First Tax Calculation/);
    view.unmount();
  });

  it('tolerates a stored result that predates the unsupported field', async () => {
    const { unsupported: _dropped, ...legacy } = dto as unknown as Record<string, unknown>;
    stubFetch(legacy);
    const view = await mount();
    const joined = view.text.join('');
    assert.match(joined, /Deterministic Tax Engine/);
    assert.ok(!joined.includes('This scenario is not fully supported'));
    view.unmount();
  });

  it('survives an API error without rendering a broken result', async () => {
    stubFetch(null, false, 500);
    const view = await mount();
    const joined = view.text.join(' | ');
    assert.match(joined, /Run First Tax Calculation/);
    assert.ok(!joined.includes('NaN'), 'a failed fetch must not leak NaN into the view');
    assert.ok(!joined.includes('undefined'), 'a failed fetch must not leak undefined');
    view.unmount();
  });

  it('surfaces the load failure instead of an unexplained empty panel', async () => {
    stubFetch(null, false, 500);
    const view = await mount();
    const joined = view.text.join('');
    assert.match(joined, /The stored calculation could not be loaded/);
    assert.match(joined, /Calculation failed upstream/);
    view.unmount();
  });

  it('clears the previous workspace result when the new one has none stored', async () => {
    let reply: unknown = dto;
    (globalThis as { fetch: unknown }).fetch = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => reply,
    });

    let renderer: ReturnType<typeof TestRenderer.create> | undefined;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(TaxCalculatorView, { workspaceId: 'ws-1', taxYear: 2025 }),
      );
    });
    assert.match(textOf(renderer!.toJSON()).join(''), /Deterministic Tax Engine/);

    // The next year has no stored calculation: its panel must be empty rather
    // than showing the previous year's figures as if they were current.
    reply = null;
    await TestRenderer.act(async () => {
      renderer!.update(
        React.createElement(TaxCalculatorView, { workspaceId: 'ws-2', taxYear: 2026 }),
      );
    });

    const joined = textOf(renderer!.toJSON()).join(' | ');
    assert.match(joined, /Run First Tax Calculation/);
    assert.ok(
      !joined.includes(dto.rulePackageVersion),
      'the previous result must not stay on screen',
    );
    renderer!.unmount();
  });
});
