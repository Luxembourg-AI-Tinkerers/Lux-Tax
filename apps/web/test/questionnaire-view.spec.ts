/**
 * `QuestionnaireView` is where a taxpayer's answers become **facts** that the engine then
 * taxes: the quick-estimate fields are posted to `POST /facts/confirm` on save. That write
 * path had never been executed in any test, so this suite drives it end to end against the
 * real `LuxTaxApiClient` with `fetch` stubbed — the URL, the JSON body and the view's
 * reaction to the server's echo are all real.
 *
 * Boundary: React 19 renders host elements ('form', 'input', 'button'); there is no DOM, so
 * events are invoked as the props React would call. That proves the handler wiring and the
 * payload, not browser behaviour.
 */
import './support/render-harness';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import React from 'react';

import type { QuestionnaireAnswersDto, ReadinessDetailsDto } from '@luxtax/contracts';
import { FACT_INCLUSION_DOWNGRADE_MESSAGE } from '../src/lib/fact-inclusion';

import { QuestionnaireView } from '../src/components/QuestionnaireView';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TestRenderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => { toJSON: () => unknown; unmount: () => void };
  act: (cb: () => void | Promise<void>) => Promise<void> | void;
};

const ANSWERS: QuestionnaireAnswersDto = {
  maritalStatus: 'SINGLE',
  hasEmploymentIncome: true,
  hasFreelanceIncome: false,
  hasPensionIncome: false,
  hasPrimaryResidenceMortgage: false,
  mortgageOccupancyYear: 2020,
  hasLifeInsuranceOrPensionPlan: false,
  hasDonations: false,
  childrenCount: 0,
};

const READINESS: ReadinessDetailsDto = {
  workspaceId: 'ws-1',
  taxYear: 2025,
  completionScore: 100,
  totalTasks: 0,
  unresolvedBlockers: 0,
  unresolvedWarnings: 0,
  tasks: [],
};

interface Call {
  url: string;
  method: string;
  body: unknown;
}

const originalFetch = globalThis.fetch;

function stubApi(factEcho: unknown = { id: 'f1', isIncludedInReturn: true }): Call[] {
  const calls: Call[] = [];
  (globalThis as { fetch: unknown }).fetch = async (url: unknown, init: unknown) => {
    const request = (init ?? {}) as { method?: string; body?: string };
    const method = request.method ?? 'GET';
    const parsed = request.body ? JSON.parse(request.body) : undefined;
    calls.push({ url: String(url), method, body: parsed });

    let payload: unknown = { answers: ANSWERS, readiness: READINESS };
    if (String(url).includes('/facts/confirm')) {
      payload = factEcho;
    }
    return { ok: true, status: 200, statusText: 'OK', json: async () => payload };
  };
  return calls;
}

/**
 * A workspace whose gross salary is already confirmed at 40,000: the quick
 * estimate below must update that fact, never add a second one.
 */
function stubWithExistingSalary(): Call[] {
  const calls: Call[] = [];
  (globalThis as { fetch: unknown }).fetch = async (url: unknown, init: unknown) => {
    const request = (init ?? {}) as { method?: string; body?: string };
    const method = request.method ?? 'GET';
    const parsed = request.body ? JSON.parse(request.body) : undefined;
    calls.push({ url: String(url), method, body: parsed });

    const target = String(url);
    if (target.endsWith('/facts') && method === 'GET') {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          extractedFacts: [],
          confirmedFacts: [
            {
              id: 'f-existing',
              category: 'EMPLOYMENT_INCOME',
              fieldKey: 'grossSalary',
              amount: '40000.00',
              isIncludedInReturn: true,
            },
          ],
        }),
      };
    }
    if (target.includes('/facts/')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ id: 'f-existing', amount: '50000.00', isIncludedInReturn: true }),
      };
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ answers: ANSWERS, readiness: READINESS }),
    };
  };
  return calls;
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

let current: { toJSON: () => unknown; unmount: () => void } | undefined;

async function mount(): Promise<{ text: string; tree: Node[] }> {
  await TestRenderer.act(async () => {
    current = TestRenderer.create(
      React.createElement(QuestionnaireView, { workspaceId: 'ws-1', onProfileUpdated: () => {} }),
    );
  });
  const tree = nodes(current!.toJSON());
  return { text: textOf(current!.toJSON()).join(''), tree };
}

function inputByPlaceholder(tree: Node[], placeholder: string): Node {
  const found = tree.find(
    (n) => n.type === 'input' && String(n.props.placeholder ?? '') === placeholder,
  );
  assert.ok(found, `no input with placeholder "${placeholder}"`);
  return found!;
}

async function type(tree: Node[], placeholder: string, value: string): Promise<void> {
  const input = inputByPlaceholder(tree, placeholder);
  const onChange = input.props.onChange as (e: unknown) => void;
  await TestRenderer.act(async () => {
    onChange({ target: { value } });
  });
}

async function toggleMortgage(tree: Node[]): Promise<void> {
  const label = tree.find(
    (n) => n.type === 'label' && textOf(n).join('').includes('Mortgage Interest on Primary Residence'),
  );
  assert.ok(label, 'mortgage toggle not found');
  const box = nodes(label!.children).find((n) => n.type === 'input')!;
  const onChange = box.props.onChange as (e: unknown) => void;
  await TestRenderer.act(async () => {
    onChange({ target: { checked: true } });
  });
}

async function submitForm(tree: Node[]): Promise<void> {
  const form = tree.find((n) => n.type === 'form');
  assert.ok(form, 'no form rendered');
  const onSubmit = form!.props.onSubmit as (e: unknown) => Promise<void>;
  await TestRenderer.act(async () => {
    await onSubmit({ preventDefault: () => undefined });
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (current) {
    TestRenderer.act(() => current!.unmount());
    current = undefined;
  }
});

describe('QuestionnaireView — reads, saves, and writes facts', () => {
  it('loads the saved answers on mount', async () => {
    const calls = stubApi();
    const { tree } = await mount();
    assert.ok(
      calls.some((c) => c.method === 'GET' && c.url.includes('/api/workspaces/ws-1/questionnaire')),
      JSON.stringify(calls),
    );
    // A 100 % readiness score from the stub is rendered.
    assert.ok(textOf(current!.toJSON()).join('').includes('100'), 'readiness not rendered');
    assert.ok(tree.some((n) => n.type === 'form'));
  });

  it('saves the answers without writing any fact when the quick fields are empty', async () => {
    const calls = stubApi();
    const { tree } = await mount();
    await submitForm(tree);

    const writes = calls.filter(
      (c) => c.method !== 'GET' && c.url.endsWith('/questionnaire'),
    );
    assert.equal(writes.length, 1, JSON.stringify(writes));
    assert.match(writes[0]!.url, /\/questionnaire$/);
    assert.deepEqual(writes[0]!.body, ANSWERS);
    assert.equal(
      calls.some((c) => c.url.includes('/facts/confirm')),
      false,
      'empty quick fields must not create facts',
    );
  });

  it('records the spouse residence and the Art. 3 d) collective request', async () => {
    const calls = stubApi();
    const { tree } = await mount();

    // The couple controls only render for a married household.
    const married = tree.find(
      (n) => n.type === 'button' && textOf(n).join('').trim() === 'MARRIED',
    );
    assert.ok(married, 'MARRIED button not found');
    await TestRenderer.act(async () => {
      (married!.props.onClick as () => void)();
    });

    const reopened = nodes(current!.toJSON());
    const select = reopened.find((n) => n.type === 'select');
    assert.ok(select, 'spouse residence select not rendered for a married household');
    await TestRenderer.act(async () => {
      (select!.props.onChange as (e: unknown) => void)({ target: { value: 'NON_RESIDENT' } });
    });

    const withCheckbox = nodes(current!.toJSON());
    const checkbox = withCheckbox.find(
      (n) => n.type === 'input' && n.props.type === 'checkbox' && n.props.checked === false,
    );
    assert.ok(checkbox, 'collective request checkbox not rendered once a residence is chosen');
    await TestRenderer.act(async () => {
      (checkbox!.props.onChange as (e: unknown) => void)({ target: { checked: true } });
    });

    await submitForm(nodes(current!.toJSON()));

    const put = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/questionnaire'));
    assert.ok(put, 'no PUT questionnaire call');
    const body = put!.body as Record<string, unknown>;
    assert.equal(body.spouseResidence, 'NON_RESIDENT');
    assert.equal(body.mixedCoupleCollectiveRequested, true);
  });

  it('turns a quick salary into one grossSalary fact with a two-decimal amount', async () => {
    const calls = stubApi();
    const { tree } = await mount();
    await type(tree, 'e.g. 75000', '50000');
    await submitForm(nodes(current!.toJSON()));

    const facts = calls.filter((c) => c.url.includes('/facts/confirm'));
    assert.equal(facts.length, 1, JSON.stringify(facts));
    const body = facts[0]!.body as Record<string, unknown>;
    assert.equal(body.fieldKey, 'grossSalary');
    assert.equal(body.amount, '50000.00');
    assert.equal(body.category, 'EMPLOYMENT_INCOME');
    assert.equal(body.isIncludedInReturn, true);
  });

  it('creates all three facts when all three quick fields are filled', async () => {
    const calls = stubApi();
    const { tree } = await mount();
    await type(tree, 'e.g. 75000', '50000');
    await type(tree, 'e.g. 12500', '12000');
    await toggleMortgage(tree);
    const reopened = nodes(current!.toJSON());
    await type(reopened, 'e.g. 3500', '3000');
    await submitForm(nodes(current!.toJSON()));

    const keys = calls
      .filter((c) => c.url.includes('/facts/confirm'))
      .map((c) => (c.body as Record<string, unknown>).fieldKey);
    assert.deepEqual(keys, ['grossSalary', 'withholdingTax', 'mortgageInterest']);
  });

  it('ignores a non-numeric quick estimate instead of posting NaN', async () => {
    const calls = stubApi();
    const { tree } = await mount();
    await type(tree, 'e.g. 75000', 'not-a-number');
    await submitForm(nodes(current!.toJSON()));

    assert.equal(
      calls.some((c) => c.url.includes('/facts/confirm')),
      false,
      'a non-numeric estimate must not create a fact',
    );
  });

  it('surfaces the downgrade when the API does not include the saved fact in the return', async () => {
    stubApi({ id: 'f1', isIncludedInReturn: false });
    const { tree } = await mount();
    await type(tree, 'e.g. 75000', '50000');
    await submitForm(nodes(current!.toJSON()));

    const text = textOf(current!.toJSON()).join('');
    assert.ok(
      text.includes(FACT_INCLUSION_DOWNGRADE_MESSAGE),
      `downgrade message missing from:\n${text}`,
    );
  });

  it('shows an error state — not an editable form — when the questionnaire cannot be loaded', async () => {
    (globalThis as { fetch: unknown }).fetch = async () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({ message: 'Questionnaire unavailable' }),
    });

    await TestRenderer.act(async () => {
      current = TestRenderer.create(
        React.createElement(QuestionnaireView, { workspaceId: 'ws-1', onProfileUpdated: () => {} }),
      );
    });

    const tree = nodes(current!.toJSON());
    const text = textOf(current!.toJSON()).join('');
    assert.ok(text.includes('Questionnaire unavailable'), `error message missing from:\n${text}`);
    assert.equal(tree.some((n) => n.type === 'form'), false, 'no form may be editable before the GET succeeds');
    assert.equal(tree.some((n) => n.type === 'input'), false, 'no invented answers may be rendered');
  });

  it('updates the fact it already created instead of saving a duplicate', async () => {
    const calls = stubWithExistingSalary();
    const { tree } = await mount();
    await type(tree, 'e.g. 75000', '50000');
    await submitForm(nodes(current!.toJSON()));

    assert.equal(
      calls.some((c) => c.url.includes('/facts/confirm')),
      false,
      'a quick estimate that already exists must not be confirmed twice',
    );
    const patch = calls.find((c) => c.method === 'PATCH' && c.url.includes('/facts/f-existing'));
    assert.ok(patch, `no PATCH on the existing fact: ${JSON.stringify(calls)}`);
    assert.equal((patch!.body as Record<string, unknown>).amount, '50000.00');
  });
});
