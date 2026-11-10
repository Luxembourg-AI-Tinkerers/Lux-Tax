import { test, describe, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import { AdminService } from '../src/modules/admin/admin.service';
import {
  MODEL_KEY_ENCRYPTION_ENV,
  decryptModelApiKey,
  encryptModelApiKey,
} from '../src/modules/admin/model-key-cipher';

/**
 * Wiring tests for the admin service guards (M1, M2, M3).
 *
 * No database and no network: `$queryRawUnsafe`/`$executeRawUnsafe` are stubbed
 * and `fetch` is replaced with a recorder. These tests prove that the pure
 * policies are actually reachable from the service, which unit-testing the
 * helpers alone cannot.
 */
const KEY = 'a1'.repeat(32);

interface Executed {
  readonly sql: string;
  readonly params: readonly unknown[];
}

class FakePrisma {
  readonly executed: Executed[] = [];
  fetchCalls = 0;

  constructor(private readonly routes: readonly any[] = [], private readonly models: readonly any[] = []) {}

  async $queryRawUnsafe(sql: string, ...params: unknown[]): Promise<any[]> {
    if (sql.includes('FROM custom_ai_routes')) return [...this.routes];
    if (sql.includes('FROM custom_ai_models')) {
      if (sql.includes('WHERE id =')) {
        return this.models.filter((row) => row.id === params[0]);
      }
      return [...this.models];
    }
    return [];
  }

  async $executeRawUnsafe(sql: string, ...params: unknown[]): Promise<number> {
    this.executed.push({ sql, params });
    return 1;
  }

  readonly auditEvent = { create: async () => ({}) };

  get inserts(): Executed[] {
    return this.executed.filter((entry) => entry.sql.includes('INSERT INTO'));
  }

  get routeUpdates(): Executed[] {
    return this.executed.filter((entry) => entry.sql.includes('UPDATE custom_ai_routes'));
  }
}

const documentRouteRow = {
  id: 'route-salary-cert',
  task_name: 'document.extract.salary_certificate',
  primary_model_id: 'mdl-docling-v2',
  fallback_model_ids: '[]',
  prompt_version: 'salary-cert-v2.0',
  output_schema_version: 'schema-salary-v1',
  timeout_ms: 8000,
  max_data_class: 'CUSTOMER_DOCUMENT',
  active_rollout_percentage: 100,
};

const publicModelRow = {
  id: 'mdl-public-model',
  display_name: 'Public Hosted Model',
  provider_type: 'HOSTED',
  model_identifier: 'public-model-v1',
  endpoint_url: 'https://models.example.com/v1',
  api_key: null,
  capabilities: '["TEXT"]',
  permitted_data_class: 'PUBLIC',
  hosting_region: 'EU_WEST',
  status: 'ACTIVE',
  healthy: true,
};

const createModelDto = {
  displayName: 'Test Hosted Model',
  providerType: 'HOSTED' as const,
  modelIdentifier: 'hosted-v1',
  capabilities: ['TEXT'] as const,
  permittedDataClass: 'CUSTOMER_DOCUMENT' as const,
  hostingRegion: 'EU_WEST',
  endpointUrl: 'https://models.example.com/v1',
  apiKey: 'sk-live-third-party-secret',
};

let originalFetch: typeof globalThis.fetch | undefined;

describe('Admin service guards (M1/M2/M3 wiring)', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    delete process.env[MODEL_KEY_ENCRYPTION_ENV];
    if (originalFetch) globalThis.fetch = originalFetch;
  });

  test('M2: a key is refused, not stored in plaintext, when the encryption key is missing', async () => {
    const prisma = new FakePrisma();
    const service = new AdminService(prisma as any);

    await assert.rejects(
      () => service.createModel(createModelDto as any, 'admin-1'),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        assert.match((err as Error).message, /MODEL_KEY_ENCRYPTION_KEY/);
        assert.match((err as Error).message, /refusing to store/i);
        return true;
      },
    );
    assert.deepStrictEqual(prisma.inserts, [], 'the model must not be written without the key');
  });

  test('M2: the stored value is a v1 envelope that decrypts back to the submitted key', async () => {
    process.env[MODEL_KEY_ENCRYPTION_ENV] = KEY;
    const prisma = new FakePrisma();
    const service = new AdminService(prisma as any);

    await service.createModel(createModelDto as any, 'admin-1');

    assert.strictEqual(prisma.inserts.length, 1);
    const stored = prisma.inserts[0].params[5] as string;
    assert.notStrictEqual(stored, createModelDto.apiKey);
    assert.ok(stored.startsWith('v1:'));
    assert.strictEqual(stored.includes('third-party-secret'), false);
    assert.strictEqual(decryptModelApiKey(stored, KEY), createModelDto.apiKey);
  });

  test('M3: a PUBLIC model cannot be made primary of a CUSTOMER_DOCUMENT route', async () => {
    const prisma = new FakePrisma([documentRouteRow], [publicModelRow]);
    const service = new AdminService(prisma as any);

    await assert.rejects(
      () =>
        service.updateModelRoute(
          'route-salary-cert',
          { primaryModelId: 'mdl-public-model', fallbackModelIds: [] },
          'admin-1',
        ),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        assert.match((err as Error).message, /PUBLIC/);
        assert.match((err as Error).message, /may never be selected/);
        assert.match((err as Error).message, /salary_certificate/);
        return true;
      },
    );
    assert.deepStrictEqual(prisma.routeUpdates, [], 'the route must not be written');
  });

  test('M3: the shipped document-route shape (document primary, redacted fallback) is accepted', async () => {
    const prisma = new FakePrisma([documentRouteRow]);
    const service = new AdminService(prisma as any);

    const route = await service.updateModelRoute(
      'route-salary-cert',
      { primaryModelId: 'mdl-docling-v2', fallbackModelIds: ['mdl-qwen35-4b'] },
      'admin-1',
    );

    assert.strictEqual(route.primaryModelId, 'mdl-docling-v2');
    assert.strictEqual(prisma.routeUpdates.length, 1);
    assert.strictEqual(prisma.routeUpdates[0].params[1], JSON.stringify(['mdl-qwen35-4b']));
  });

  test('M3: an unknown model id is rejected instead of being written', async () => {
    const prisma = new FakePrisma([documentRouteRow]);
    const service = new AdminService(prisma as any);

    await assert.rejects(
      () =>
        service.updateModelRoute(
          'route-salary-cert',
          { primaryModelId: 'mdl-not-registered', fallbackModelIds: [] },
          'admin-1',
        ),
      (err: unknown) => err instanceof BadRequestException && /Unknown model/.test((err as Error).message),
    );
    assert.deepStrictEqual(prisma.routeUpdates, []);
  });

  test('M1: the probe refuses a link-local target before any request is made', async () => {
    const prisma = new FakePrisma();
    const service = new AdminService(prisma as any);
    globalThis.fetch = (async () => {
      prisma.fetchCalls += 1;
      throw new Error('fetch must not run for a blocked endpoint');
    }) as any;

    const result = await service.testModelConnection({ endpointUrl: 'https://169.254.169.254/latest/meta-data' } as any);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 400);
    assert.match(result.message, /outbound URL policy/);
    assert.strictEqual(prisma.fetchCalls, 0);
  });

  test('M1: the probe refuses plain http to a public host before any request is made', async () => {
    const prisma = new FakePrisma();
    const service = new AdminService(prisma as any);
    globalThis.fetch = (async () => {
      prisma.fetchCalls += 1;
      throw new Error('fetch must not run for a blocked endpoint');
    }) as any;

    const result = await service.testModelConnection({ endpointUrl: 'http://models.example.com/v1' } as any);

    assert.strictEqual(result.success, false);
    assert.match(result.message, /plain http/);
    assert.strictEqual(prisma.fetchCalls, 0);
  });

  test('M2: a stored key that cannot be decrypted fails the probe instead of sending nothing', async () => {
    const foreignEnvelope = encryptModelApiKey('sk-stored', '5c'.repeat(32));
    const prisma = new FakePrisma([], [{ ...publicModelRow, api_key: foreignEnvelope }]);
    const service = new AdminService(prisma as any);
    globalThis.fetch = (async () => {
      prisma.fetchCalls += 1;
      throw new Error('fetch must not run without a usable credential');
    }) as any;

    const result = await service.testModelConnection({ modelId: 'mdl-public-model' } as any);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 400);
    assert.match(result.message, /cannot be decrypted/);
    assert.match(result.message, /MODEL_KEY_ENCRYPTION_KEY/);
    assert.strictEqual(prisma.fetchCalls, 0);
  });
});
