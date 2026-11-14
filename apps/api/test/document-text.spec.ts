import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { findEmbeddedText, readDocumentText } from '../src/modules/documents/text/document-text';
import { workspaceFile } from './support/workspace-file';

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CERTIFICATE_TEXT = [
  'CERTIFICAT DE REMUNERATION 2025',
  'Employeur: Societe Generale Luxembourg',
  '101. Remuneration brute: 76800.00 EUR',
  '103. Cotisations sociales: 9000.00 EUR',
  '105. Retenue d impot: 13950.00 EUR',
].join('\n');

describe('document text — the entry point every parser and model uses', () => {
  test('a real PDF is read from its text layer, not from its bytes', () => {
    const result = readDocumentText(workspaceFile('100f-2025.pdf'), 'application/pdf');

    assert.equal(result.source, 'TEXT_LAYER');
    assert.equal(result.needsOcr, false);
    assert.equal(result.reason, null);
    assert.equal(result.pageCount, 20);
    assert.match(result.text, /occupation salari/);
    assert.ok(result.detail.characters > 20_000);
  });

  test('a scanned PDF with no text layer is reported as needing OCR', () => {
    const imageOnly = Buffer.from(
      [
        '%PDF-1.4',
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
        '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
        '3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj',
        '4 0 obj << /Length 18 >> stream',
        'q 595 0 0 cm Q',
        'endstream endobj',
        'trailer << /Root 1 0 R >>',
        '%%EOF',
      ].join('\n'),
      'latin1',
    );

    const result = readDocumentText(imageOnly, 'application/pdf');
    assert.equal(result.source, 'NONE');
    assert.equal(result.needsOcr, true);
    assert.match(result.reason ?? '', /no text layer|scan/i);
  });

  test('an encrypted PDF says so instead of silently returning nothing', () => {
    const encrypted = Buffer.from(
      '%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Encrypt 9 0 R >>\n%%EOF',
      'latin1',
    );
    const result = readDocumentText(encrypted, 'application/pdf');
    assert.equal(result.needsOcr, true);
    assert.match(result.reason ?? '', /encrypted/i);
  });

  test('a photo without a text sidecar is sent to OCR, never parsed as noise', () => {
    // Random bytes behind a JPEG header: what a camera produces.
    const photo = Buffer.concat([JPEG_MAGIC, Buffer.from(Array.from({ length: 4000 }, (_, i) => (i * 37) % 256))]);
    const result = readDocumentText(photo, 'image/jpeg');

    assert.equal(result.source, 'NONE');
    assert.equal(result.text, '');
    assert.equal(result.needsOcr, true);
    assert.match(result.reason ?? '', /OCR engine/i);
  });

  test('an image carrying printed text beside it is read, and marked as such', () => {
    const scan = Buffer.concat([PNG_MAGIC, Buffer.from(CERTIFICATE_TEXT)]);
    const result = readDocumentText(scan, 'image/png');

    assert.equal(result.source, 'EMBEDDED_TEXT');
    assert.equal(result.needsOcr, false);
    assert.match(result.text, /76800\.00 EUR/);
  });

  test('plain text stays plain text', () => {
    const result = readDocumentText(Buffer.from(CERTIFICATE_TEXT), 'text/plain');
    assert.equal(result.source, 'PLAIN_TEXT');
    assert.equal(result.needsOcr, false);
    assert.match(result.text, /CERTIFICAT DE REMUNERATION/);
  });

  test('a text file with almost nothing in it is not a document', () => {
    const result = readDocumentText(Buffer.from('2025\n12.05.2025\n'), 'text/plain');
    assert.equal(result.needsOcr, true);
  });
});

describe('embedded text detection', () => {
  test('finds a certificate appended to a binary payload', () => {
    const found = findEmbeddedText(Buffer.concat([JPEG_MAGIC, Buffer.from(CERTIFICATE_TEXT)]));
    assert.ok(found);
    assert.match(found, /101\. Remuneration brute/);
  });

  test('does not invent text from image bytes', () => {
    const noise = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 53 + 11) % 256));
    assert.equal(findEmbeddedText(noise), null);
  });

  test('a short caption is not a document', () => {
    assert.equal(findEmbeddedText(Buffer.from('lunch 12.50')), null);
  });
});
