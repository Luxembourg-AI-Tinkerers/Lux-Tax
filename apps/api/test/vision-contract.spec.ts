import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentType } from '@luxtax/contracts';
import type { ModelDefinitionDto, ModelRouteDto } from '@luxtax/contracts';
import {
  EXTRACTION_FIELD_NAMES,
  buildVisionPrompt,
  modelMaySeeDataClass,
  normalizeAmount,
  parseVisionExtraction,
  resolveVisionChain,
} from '../src/modules/documents/extraction/vision-contract';

const model = (overrides: Partial<ModelDefinitionDto> & Pick<ModelDefinitionDto, 'id'>): ModelDefinitionDto => ({
  displayName: overrides.id,
  providerType: 'HOSTED',
  modelIdentifier: overrides.id,
  capabilities: ['VISION'],
  permittedDataClass: 'CUSTOMER_DOCUMENT',
  hostingRegion: 'EU',
  status: 'ACTIVE',
  healthy: true,
  endpointUrl: 'https://ocr.example.test/v1/chat/completions',
  ...overrides,
});

const route = (overrides: Partial<ModelRouteDto> = {}): ModelRouteDto => ({
  id: 'route-ocr',
  taskName: 'document.ocr.receipt_scan',
  primaryModelId: 'm1',
  fallbackModelIds: [],
  promptVersion: 'ocr-v1',
  outputSchemaVersion: 'schema-v1',
  timeoutMs: 15000,
  maxDataClass: 'CUSTOMER_DOCUMENT',
  activeRolloutPercentage: 100,
  ...overrides,
});

describe('vision contract — amounts', () => {
  test('reads a Luxembourg-style amount', () => {
    assert.equal(normalizeAmount('76.800,00'), '76800.00');
    assert.equal(normalizeAmount('1 234,56 EUR'), '1234.56');
  });

  test('reads an international-style amount', () => {
    assert.equal(normalizeAmount('1,234.56'), '1234.56');
    assert.equal(normalizeAmount('€ 450.00'), '450.00');
  });

  test('an integer amount means whole euros, not a year', () => {
    assert.equal(normalizeAmount('12 345'), '12345.00');
    assert.equal(normalizeAmount('13950'), '13950.00');
  });

  test('a negative amount is stored as a positive deduction', () => {
    // A model occasionally reports a credit with a minus. The engine treats a
    // signed amount as a deduction that raises tax, so the sign is dropped.
    assert.equal(normalizeAmount('-120,50'), '120.50');
  });

  test('refuses anything that is not a number', () => {
    for (const value of ['n/a', '', '   ', 'EUR', null, undefined, {}, [], Number.NaN]) {
      assert.equal(normalizeAmount(value), null, `expected null for ${String(value)}`);
    }
  });

  test('accepts a JSON number', () => {
    assert.equal(normalizeAmount(4500), '4500.00');
  });
});

describe('vision contract — a model answer is validated, not trusted', () => {
  const answer = (payload: unknown): string => JSON.stringify(payload);

  test('accepts a well-formed answer', () => {
    const parsed = parseVisionExtraction(
      answer({
        documentType: 'SALARY_CERTIFICATE',
        confidence: 0.95,
        snippet: '101. Remuneration brute 76800.00',
        fields: [
          { name: 'grossSalary', value: '76800.00', confidence: 0.95, snippet: '101.' },
          { name: 'withholdingTax', value: '13.950,00', confidence: 0.9, snippet: '105.' },
        ],
      }),
    );

    assert.ok(parsed);
    assert.equal(parsed.documentType, DocumentType.SALARY_CERTIFICATE);
    assert.equal(parsed.fields.length, 2);
    assert.equal(parsed.fields[1].value, '13950.00');
    assert.deepEqual(parsed.rejectedFields, []);
  });

  test('reads through a code fence and a sentence before the JSON', () => {
    const content = 'Here is the extraction:\n```json\n' + answer({ documentType: 'RECEIPT', fields: [{ name: 'invoiceExpense', value: '99.90' }] }) + '\n```';
    const parsed = parseVisionExtraction(content);
    assert.ok(parsed);
    assert.equal(parsed.fields[0].value, '99.90');
  });

  test('drops a field the engine cannot store, and reports it', () => {
    const parsed = parseVisionExtraction(
      answer({
        documentType: 'SALARY_CERTIFICATE',
        fields: [
          { name: 'grossSalary', value: '50000.00' },
          { name: 'magicBonus', value: '1000.00' },
        ],
      }),
    );

    assert.ok(parsed);
    assert.deepEqual(parsed.fields.map((field) => field.name), ['grossSalary']);
    assert.deepEqual(parsed.rejectedFields, ['magicBonus']);
  });

  test('drops a field whose value is not an amount', () => {
    const parsed = parseVisionExtraction(
      answer({
        documentType: 'SALARY_CERTIFICATE',
        fields: [
          { name: 'grossSalary', value: 'see attached' },
          { name: 'withholdingTax', value: '13950.00' },
        ],
      }),
    );

    assert.ok(parsed);
    assert.deepEqual(parsed.fields.map((field) => field.name), ['withholdingTax']);
    assert.ok(parsed.rejectedFields.includes('grossSalary'));
  });

  test('two answers for one field keep the more confident one', () => {
    const parsed = parseVisionExtraction(
      answer({
        documentType: 'SALARY_CERTIFICATE',
        fields: [
          { name: 'grossSalary', value: '1000.00', confidence: 0.4 },
          { name: 'grossSalary', value: '2000.00', confidence: 0.9 },
        ],
      }),
    );

    assert.ok(parsed);
    assert.equal(parsed.fields.length, 1);
    assert.equal(parsed.fields[0].value, '2000.00');
  });

  test('a zero amount is not a fact, but the classification is kept', () => {
    // The model may correctly identify the document and still read no figure;
    // that is a document needing attention, not a parse failure.
    const parsed = parseVisionExtraction(
      JSON.stringify({ documentType: 'SALARY_CERTIFICATE', fields: [{ name: 'grossSalary', value: '0.00' }] }),
    );
    assert.ok(parsed);
    assert.equal(parsed.documentType, DocumentType.SALARY_CERTIFICATE);
    assert.deepEqual(parsed.fields, []);
  });

  test('an unknown document type becomes UNKNOWN but keeps the figures', () => {
    const parsed = parseVisionExtraction(
      answer({ documentType: 'SPACESHIP_MANIFEST', fields: [{ name: 'grossSalary', value: '100.00' }] }),
    );
    assert.ok(parsed);
    assert.equal(parsed.documentType, DocumentType.UNKNOWN);
    assert.equal(parsed.fields.length, 1);
  });

  test('a percentage confidence is normalised', () => {
    const parsed = parseVisionExtraction(
      answer({ documentType: 'RECEIPT', confidence: 95, fields: [{ name: 'invoiceExpense', value: '10.00' }] }),
    );
    assert.ok(parsed);
    assert.equal(parsed.confidence, 0.95);
  });

  test('prose with no JSON is not an extraction', () => {
    assert.equal(parseVisionExtraction('I could not read this document, sorry.'), null);
    assert.equal(parseVisionExtraction(''), null);
    assert.equal(parseVisionExtraction('{"broken": '), null);
  });

  test('a reply with neither a type nor a field is not an extraction', () => {
    assert.equal(parseVisionExtraction(answer({ documentType: 'UNKNOWN', fields: [] })), null);
  });

  test('the prompt names every storable field and forbids invention', () => {
    const prompt = buildVisionPrompt('scan.jpg', DocumentType.SALARY_CERTIFICATE);
    for (const field of EXTRACTION_FIELD_NAMES) {
      assert.ok(prompt.includes(field), `prompt is missing ${field}`);
    }
    assert.match(prompt, /Never guess/);
    assert.match(prompt, /SALARY_CERTIFICATE/);
  });
});

describe('vision contract — which model may be called', () => {
  test('a data class below the route is refused', () => {
    assert.equal(modelMaySeeDataClass(model({ id: 'a', permittedDataClass: 'PUBLIC' }), 'CUSTOMER_DOCUMENT'), false);
    assert.equal(modelMaySeeDataClass(model({ id: 'a' }), 'CUSTOMER_DOCUMENT'), true);
    assert.equal(modelMaySeeDataClass(model({ id: 'a', permittedDataClass: 'REDACTED_CUSTOMER' }), 'REDACTED_CUSTOMER'), true);
  });

  test('an unknown data class fails closed', () => {
    assert.equal(modelMaySeeDataClass(model({ id: 'a' }), 'SOMETHING_NEW'), false);
  });

  test('order is primary then fallbacks', () => {
    const chain = resolveVisionChain(route({ fallbackModelIds: ['m2', 'm3'] }), [
      model({ id: 'm3' }),
      model({ id: 'm1' }),
      model({ id: 'm2' }),
    ]);
    assert.deepEqual(chain.map((entry) => entry.id), ['m1', 'm2', 'm3']);
  });

  test('a model that cannot be called is skipped, not fatal', () => {
    const chain = resolveVisionChain(route({ primaryModelId: 'disabled', fallbackModelIds: ['text-only', 'no-url', 'good'] }), [
      model({ id: 'disabled', status: 'DISABLED' }),
      model({ id: 'text-only', capabilities: ['TEXT'] }),
      model({ id: 'no-url', endpointUrl: undefined }),
      model({ id: 'good' }),
    ]);
    assert.deepEqual(chain.map((entry) => entry.id), ['good']);
  });

  test('a duplicate id is tried once', () => {
    const chain = resolveVisionChain(route({ fallbackModelIds: ['m1', 'm1'] }), [model({ id: 'm1' })]);
    assert.equal(chain.length, 1);
  });

  test('no route means no OCR, even when models exist', () => {
    assert.deepEqual(resolveVisionChain(null, [model({ id: 'm1' })]), []);
  });

  test('no eligible model means an empty chain, which the user is told about', () => {
    assert.deepEqual(resolveVisionChain(route(), []), []);
  });
});
