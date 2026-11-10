import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MIB,
  assertDeclaredMimeMatches,
  decodeBase64Upload,
  sniffMimeType,
} from '../src/modules/documents/upload-guard';
import { MAX_UPLOAD_BYTES as CAP_FROM_SERVICE } from '../src/modules/documents/documents.service';

/**
 * Defect M11: `fileContentBase64` was unbounded and the declared `mimeType` was
 * believed. The service now decodes strictly, caps the decoded size at 10 MiB and
 * identifies the content from its magic bytes.
 */

const PDF = Buffer.concat([
  Buffer.from('%PDF-1.7\n'),
  Buffer.from('1 0 obj\n<< /Type /Catalog >>\nendobj\n'),
]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('png-body'),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jpeg-body')]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
  Buffer.from('webp-body'),
]);
const TEXT = Buffer.from('Certificat de rémunération 2025 — brut 84 000,00 EUR', 'utf8');
const BINARY = Buffer.from([0x00, 0x01, 0x02, 0x9c, 0xff, 0xfe]);

const isBadRequest = (error: unknown) => {
  assert.ok(error instanceof BadRequestException, `expected BadRequestException, got ${error}`);
  assert.strictEqual(error.getStatus(), 400);
  return true;
};

describe('document upload decoding (M11)', () => {
  test('a valid base64 payload decodes to the original bytes', () => {
    const decoded = decodeBase64Upload(PDF.toString('base64'));
    assert.ok(decoded.equals(PDF));
  });

  test('line breaks from MIME-style encoders are tolerated', () => {
    const wrapped = (PDF.toString('base64').match(/.{1,8}/g) ?? []).join('\r\n');
    assert.ok(decodeBase64Upload(wrapped).equals(PDF));
  });

  test('a string that is not base64 is rejected, not silently truncated', () => {
    for (const value of ['not base64!!', 'data:application/pdf;base64,JVBERi0=', 'AAAAA', '']) {
      assert.throws(() => decodeBase64Upload(value), isBadRequest, `accepted ${JSON.stringify(value)}`);
    }
  });

  test('the cap is exported from the service and is 10 MiB', () => {
    assert.strictEqual(MAX_UPLOAD_BYTES, 10 * 1024 * 1024);
    assert.strictEqual(CAP_FROM_SERVICE, MAX_UPLOAD_BYTES);
    assert.strictEqual(MAX_UPLOAD_MIB, 10);
  });

  test('a payload at the cap is accepted, one byte over is refused', () => {
    assert.strictEqual(decodeBase64Upload(Buffer.alloc(MAX_UPLOAD_BYTES, 0x41).toString('base64')).length, MAX_UPLOAD_BYTES);

    assert.throws(
      () => decodeBase64Upload(Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x41).toString('base64')),
      (error: unknown) => {
        isBadRequest(error);
        assert.match((error as Error).message, /10 MiB upload limit/);
        return true;
      },
    );
  });

  test('main.ts lets a body through that fits the cap after base64 expansion', () => {
    const main = readFileSync(join(__dirname, '..', 'src', 'main.ts'), 'utf8');
    const declared = /const REQUEST_BODY_LIMIT_BYTES = (\d+) \* 1024 \* 1024;/.exec(main);
    assert.ok(declared, 'REQUEST_BODY_LIMIT_BYTES not found in main.ts');
    assert.match(main, /bodyLimit:\s*REQUEST_BODY_LIMIT_BYTES/, 'the adapter must use the constant');

    const bodyLimit = Number(declared![1]) * 1024 * 1024;
    const neededForCap = Math.ceil(MAX_UPLOAD_BYTES / 3) * 4; // base64 is 4/3 of the bytes
    assert.ok(
      bodyLimit >= neededForCap,
      `body limit ${bodyLimit} cannot carry a ${MAX_UPLOAD_BYTES}-byte file (${neededForCap} base64 chars)`,
    );
  });
});

describe('content sniffing replaces the declared MIME type (M11)', () => {
  test('the four document signatures are recognised', () => {
    assert.strictEqual(sniffMimeType(PDF), 'application/pdf');
    assert.strictEqual(sniffMimeType(PNG), 'image/png');
    assert.strictEqual(sniffMimeType(JPEG), 'image/jpeg');
    assert.strictEqual(sniffMimeType(WEBP), 'image/webp');
  });

  test('plain UTF-8 text is recognised, binary is not', () => {
    assert.strictEqual(sniffMimeType(TEXT), 'text/plain');
    assert.strictEqual(sniffMimeType(BINARY), null);
  });

  test('a declared type that matches the bytes is accepted', () => {
    assert.strictEqual(assertDeclaredMimeMatches('application/pdf', PDF), 'application/pdf');
    assert.strictEqual(assertDeclaredMimeMatches('image/png', PNG), 'image/png');
    assert.strictEqual(assertDeclaredMimeMatches('text/plain', TEXT), 'text/plain');
  });

  test('a PDF declared as an image is rejected', () => {
    assert.throws(
      () => assertDeclaredMimeMatches('image/png', PDF),
      (error: unknown) => {
        isBadRequest(error);
        assert.match((error as Error).message, /image\/png/);
        assert.match((error as Error).message, /application\/pdf/);
        return true;
      },
    );
  });

  test('text declared as an image is rejected — the client cannot pick the type', () => {
    assert.throws(() => assertDeclaredMimeMatches('image/jpeg', TEXT), isBadRequest);
  });

  test('content with no known signature is rejected', () => {
    assert.throws(
      () => assertDeclaredMimeMatches('application/pdf', BINARY),
      (error: unknown) => {
        isBadRequest(error);
        assert.match((error as Error).message, /not a PDF/);
        return true;
      },
    );
  });
});
