import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_PRINTABLE_RATIO,
  assessTextQuality,
  extractPdfText,
} from '../src/modules/documents/text/pdf-text';
import { workspaceFile } from './support/workspace-file';

/**
 * The two PDFs in the workspace are the reason this module exists:
 *  100f-2025.pdf — the official 2025 Form 100, the document every filer has;
 *  lir2025.pdf   — the consolidated income tax law, 359 pages.
 * Both are produced by a real PDF engine with compressed object streams, so
 * they prove the reader against something other than a hand-written fixture.
 */
describe('PDF text layer — real documents', () => {
  test('reads every page of the 2025 Form 100', () => {
    const result = extractPdfText(workspaceFile('100f-2025.pdf'));

    assert.equal(result.pageCount, 20);
    assert.equal(result.encrypted, false);
    assert.equal(result.streamsSkipped, 0);

    // Wording only present on the salary sheet (page 7 of the printed form).
    assert.match(result.text, /revenu net provenant d'une occupation salari/);
    // Case numbers the filing package maps facts onto.
    assert.match(result.text, /\b1601\b/);
    assert.match(result.text, /\b1553\b/);
    // The spouse column of the salary sheet.
    assert.match(result.text, /\b702\b/);
  });

  test('reports a healthy text layer for the form, not a scan', () => {
    const result = extractPdfText(workspaceFile('100f-2025.pdf'));
    const quality = assessTextQuality(result.text);

    assert.equal(quality.looksLikeScan, false);
    assert.ok(quality.characters > 20_000, `expected a full form, got ${quality.characters} characters`);
    assert.ok(quality.printableRatio > 0.95);
  });

  test('reads the consolidated LIR, 359 pages including its cover', () => {
    const result = extractPdfText(workspaceFile('lir2025.pdf'));

    assert.equal(result.pageCount, 359);
    // The cover is set in a subset font with a ToUnicode CMap: this line only
    // decodes when objects packed into /ObjStm streams are indexed.
    assert.match(result.text, /Loi modifi/);
    // The form of the apostrophe is the typesetter's: accept either.
    assert.match(result.text, /concernant l.imp/);
    assert.ok(result.fontsWithCMap > 0, 'the law carries CMap-backed fonts');

    const nonEmpty = result.pages.filter((page) => page.trim().length > 50);
    assert.ok(nonEmpty.length > 350, `expected most pages to carry text, got ${nonEmpty.length}`);
  });
});

/** A minimal uncompressed PDF, to prove the simple-font path without zlib. */
function simplePdf(text: string): Buffer {
  return Buffer.from(
    [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
      `4 0 obj << /Length 60 >> stream`,
      `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`,
      'endstream endobj',
      '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj',
      'trailer << /Root 1 0 R >>',
      '%%EOF',
    ].join('\n'),
    'latin1',
  );
}

describe('PDF text layer — synthetic and hostile input', () => {
  test('reads an uncompressed page with a WinAnsi font', () => {
    const result = extractPdfText(simplePdf('Remuneration brute 76800.00 EUR'));
    assert.equal(result.pageCount, 1);
    assert.match(result.text, /Remuneration brute 76800\.00 EUR/);
  });

  test('decodes a WinAnsi accented string, which is how the ACD prints', () => {
    const result = extractPdfText(simplePdf('R\u00e9mun\u00e9ration'));
    assert.match(result.text, /R\u00e9mun\u00e9ration/);
  });

  test('a page that only paints an image has no text layer', () => {
    const imageOnly = Buffer.from(
      [
        '%PDF-1.4',
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
        '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
        '3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >> endobj',
        '4 0 obj << /Length 26 >> stream',
        'q 595 0 0 842 0 0 cm /Im0 Do Q',
        'endstream endobj',
        '5 0 obj << /Type /XObject /Subtype /Image /Filter /DCTDecode /Width 1 /Height 1 >> stream',
        '\u00ff\u00d8\u00ff\u00e0jpegbytes',
        'endstream endobj',
        'trailer << /Root 1 0 R >>',
        '%%EOF',
      ].join('\n'),
      'latin1',
    );

    const result = extractPdfText(imageOnly);
    assert.equal(result.text, '');
    assert.equal(assessTextQuality(result.text).looksLikeScan, true);
  });

  test('anything that is not a PDF yields an empty result instead of throwing', () => {
    for (const input of [Buffer.alloc(0), Buffer.from('not a pdf at all'), Buffer.from([0xff, 0xd8, 0xff, 0xe0])]) {
      const result = extractPdfText(input);
      assert.equal(result.text, '');
      assert.equal(result.pageCount, 0);
      assert.equal(result.encrypted, false);
    }
  });

  test('a truncated PDF returns what it could read instead of throwing', () => {
    const full = simplePdf('Partial document');
    const truncated = full.subarray(0, Math.floor(full.length * 0.55));
    assert.doesNotThrow(() => extractPdfText(truncated));
  });

  test('an encrypted PDF is flagged even when its text cannot be read', () => {
    const encrypted = Buffer.from(
      '%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Encrypt 9 0 R >>\n%%EOF',
      'latin1',
    );
    assert.equal(extractPdfText(encrypted).encrypted, true);
  });
});

describe('text quality gate', () => {
  test('an empty page is a scan', () => {
    assert.deepEqual(assessTextQuality('').looksLikeScan, true);
    assert.equal(assessTextQuality('   \n\n ').characters, 0);
  });

  test('a handful of characters is not enough to classify a document', () => {
    assert.equal(assessTextQuality('12.05.2025').looksLikeScan, true);
  });

  test('binary junk is rejected even when it is long', () => {
    // Not language detection: a body of replacement characters and control
    // bytes is what a mis-decoded binary produces, and no classifier should see
    // it. Text in an unusual script is a different matter and is not rejected.
    const garbage = `\u0000\u0001\u0002\ufffd\ufffd\u0007\ufffd`.repeat(40);
    const quality = assessTextQuality(garbage);
    assert.ok(quality.printableRatio < MIN_PRINTABLE_RATIO);
    assert.equal(quality.looksLikeScan, true);
  });

  test('ordinary language passes', () => {
    const sentence =
      'Certificat de r\u00e9mun\u00e9ration 2025. R\u00e9mun\u00e9ration brute 76 800,00 EUR, retenue d\u2019imp\u00f4t 13 950,00 EUR.';
    const quality = assessTextQuality(sentence.repeat(2));
    assert.equal(quality.looksLikeScan, false);
    assert.ok(quality.printableRatio > 0.95);
  });
});
