import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

/**
 * Defect M6: every 5xx returned its raw message unless NODE_ENV was exactly
 * 'production', so a development or unset NODE_ENV shipped Prisma statements and
 * PostgreSQL details to the client.
 */

const SAFE_MESSAGE = 'An unexpected error occurred. Please try again later.';

function capture(exception: unknown): { status?: number; body?: any } {
  const filter = new AllExceptionsFilter();
  // Silence the expected 5xx logging so the test output stays readable.
  (filter as any).logger.error = () => undefined;

  const sent: { status?: number; body?: any } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    send(body: unknown) {
      sent.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'GET', url: '/api/workspaces/x/documents' }),
    }),
  } as any;

  filter.catch(exception, host);
  return sent;
}

function prismaError(): Error {
  return Object.assign(
    new Error(
      "Invalid `prisma.document.findUnique()` invocation in apps/api/src/modules/documents/documents.service.ts:120:1\n\nInconsistent column data: Error creating UUID, invalid length: 11",
    ),
    { name: 'PrismaClientKnownRequestError', code: 'P2023', clientVersion: '7.10.0' },
  );
}

function postgresError(): Error {
  return Object.assign(
    new Error('duplicate key value violates unique constraint "users_email_key"'),
    { code: '23505', severity: 'ERROR', routine: 'ExecConstraints', detail: 'Key (email)=(a@b.c) already exists.' },
  );
}

describe('5xx error disclosure (M6)', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {
      NODE_ENV: process.env.NODE_ENV,
      EXPOSE_ERROR_DETAILS: process.env.EXPOSE_ERROR_DETAILS,
    };
    delete process.env.EXPOSE_ERROR_DETAILS;
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test('a plain Error is hidden in development, where it used to leak', () => {
    const { status, body } = capture(new Error('connect ECONNREFUSED 127.0.0.1:5432'));
    assert.strictEqual(status, 500);
    assert.strictEqual(body.message, SAFE_MESSAGE);
  });

  test('a Prisma message is hidden even though it arrives as an Error', () => {
    const { body } = capture(prismaError());
    assert.strictEqual(body.message, SAFE_MESSAGE);
  });

  test('a Prisma-shaped error stays hidden when EXPOSE_ERROR_DETAILS is on', () => {
    process.env.EXPOSE_ERROR_DETAILS = 'true';
    const { body } = capture(prismaError());
    assert.strictEqual(body.message, SAFE_MESSAGE);
    assert.doesNotMatch(JSON.stringify(body), /prisma|P2023|documents\.service/);
  });

  test('a node-postgres error stays hidden when EXPOSE_ERROR_DETAILS is on', () => {
    process.env.EXPOSE_ERROR_DETAILS = 'true';
    const { body } = capture(postgresError());
    assert.strictEqual(body.message, SAFE_MESSAGE);
    assert.doesNotMatch(JSON.stringify(body), /23505|users_email_key/);
  });

  test('the explicit flag exposes an application-authored 5xx message', () => {
    process.env.EXPOSE_ERROR_DETAILS = 'true';
    const { status, body } = capture(new InternalServerErrorException('tax engine returned no result'));
    assert.strictEqual(status, 500);
    assert.strictEqual(body.message, 'tax engine returned no result');
  });

  test('without the flag an application-authored 5xx message is hidden too', () => {
    const { body } = capture(new InternalServerErrorException('tax engine returned no result'));
    assert.strictEqual(body.message, SAFE_MESSAGE);
  });

  test('4xx messages still reach the client', () => {
    const badRequest = capture(new BadRequestException('Invalid visibility state'));
    assert.strictEqual(badRequest.status, 400);
    assert.strictEqual(badRequest.body.message, 'Invalid visibility state');

    const notFound = capture(new NotFoundException('Document not found'));
    assert.strictEqual(notFound.status, 404);
    assert.strictEqual(notFound.body.message, 'Document not found');
  });

  test('the response shape is unchanged', () => {
    const { status, body } = capture(new Error('boom'));
    assert.strictEqual(status, 500);
    assert.strictEqual(body.statusCode, 500);
    assert.strictEqual(body.path, '/api/workspaces/x/documents');
    assert.match(body.timestamp, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepStrictEqual(Object.keys(body).sort(), ['message', 'path', 'statusCode', 'timestamp']);
  });

  test('Prisma query logging is opt-in, so bound values stay out of logs (M6)', () => {
    // The second half of M6: Prisma query logging printed e-mails, amounts and
    // token hashes in development. It now needs PRISMA_LOG_QUERIES=true.
    const source = readFileSync(join(__dirname, '..', 'src', 'prisma', 'prisma.service.ts'), 'utf8');
    assert.match(source, /process\.env\.PRISMA_LOG_QUERIES === 'true'/);
    assert.doesNotMatch(source, /NODE_ENV === 'development' \? \['query'/);
  });
});
