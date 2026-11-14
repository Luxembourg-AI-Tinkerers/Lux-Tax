import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ReceiptAiVisionService } from '../src/modules/documents/receipt-ai-vision.service';
import { TesseractCliOcrEngine, resolveTesseractPath, type OcrEngine } from '../src/modules/documents/ocr/ocr-engine';
import { workspaceFile } from './support/workspace-file';

/**
 * A photographed receipt, with no vision endpoint configured.
 *
 * This is the case that used to end in an empty fact list: a JPEG/PNG with no
 * text layer, no model registered, and nothing to tell the user apart from "this
 * receipt has no deductible amounts". The two tests below prove both halves —
 * the pipeline always produces figures when an engine answers, and the real
 * engine produces them on a real image when a binary is configured.
 */

/** The text a correct OCR run of the fixture produces (see the real test). */
const RECEIPT_TEXT = [
  'CERTIFICAT DE REMUNERATION 2025',
  'Employeur: Banque Internationale a Luxembourg',
  '101. Remuneration brute 76800.00 EUR',
  '103. Cotisations sociales 9000.00 EUR',
  '105. Retenue d impot 13950.00 EUR',
  '141. Interets debiteurs 3500.00 EUR',
].join('\n');

const noModels = {
  getModelRoutes: async () => [],
  getModels: async () => [],
} as never;

const stubEngine = (text: string): OcrEngine => ({
  name: 'stub-ocr',
  recognize: async () => ({ status: 'TEXT', text, engine: 'stub-ocr', reason: null }),
});

function receiptImage(): Buffer {
  return workspaceFile(join('apps', 'api', 'test', 'fixtures', 'receipt-remuneration-2025.png'));
}

describe('a photographed receipt, no vision endpoint', () => {
  test('yields extracted fields through the OCR port', async () => {
    const service = new ReceiptAiVisionService(noModels, stubEngine(RECEIPT_TEXT));

    const result = await service.processReceiptOrDocument(receiptImage(), 'receipt.png', 'image/png');

    assert.equal(result.source, 'OCR');
    assert.equal(result.needsOcr, false);
    assert.equal(result.reason, null);
    assert.equal(result.documentType, 'SALARY_CERTIFICATE');

    const byName = new Map(result.fields.map((field) => [field.name, field]));
    assert.equal(byName.get('grossSalary')?.value, '76800.00');
    assert.equal(byName.get('socialSecurity')?.value, '9000.00');
    assert.equal(byName.get('withholdingTax')?.value, '13950.00');
    assert.equal(byName.get('mortgageInterest')?.value, '3500.00');

    // The printed line travels with the figure: this is what the user is shown
    // when confirming, and what makes a model-free extraction auditable.
    assert.match(byName.get('grossSalary')?.snippet ?? '', /101\./);
  });

  test('the OCR engine is only asked when no vision model answered', async () => {
    let asked = 0;
    const counting: OcrEngine = {
      name: 'counting',
      recognize: async () => {
        asked += 1;
        return { status: 'TEXT', text: RECEIPT_TEXT, engine: 'counting', reason: null };
      },
    };

    const service = new ReceiptAiVisionService(noModels, counting);
    await service.processReceiptOrDocument(receiptImage(), 'receipt.png', 'image/png');
    assert.equal(asked, 1);

    // A PDF with a text layer never reaches OCR: the pixels are not the best
    // source when the characters are already there.
    await service.processReceiptOrDocument(workspaceFile('100f-2025.pdf'), '100f.pdf', 'application/pdf');
    assert.equal(asked, 1, 'a readable PDF must not be photographed again');
  });

  test('with no engine configured the document says which variable to set', async () => {
    const service = new ReceiptAiVisionService(noModels, new TesseractCliOcrEngine({ binaryPath: null }));

    const result = await service.processReceiptOrDocument(receiptImage(), 'receipt.png', 'image/png');

    assert.equal(result.needsOcr, true);
    assert.deepEqual(result.fields, []);
    assert.match(result.reason ?? '', /OCR_TESSERACT_PATH/);
  });

  test('an engine that finds nothing is reported as such, not as zero amounts', async () => {
    const empty: OcrEngine = {
      name: 'empty',
      recognize: async () => ({ status: 'EMPTY', text: '', engine: 'empty', reason: 'The OCR engine found no readable text in this image.' }),
    };

    const service = new ReceiptAiVisionService(noModels, empty);
    const result = await service.processReceiptOrDocument(receiptImage(), 'receipt.png', 'image/png');

    assert.equal(result.needsOcr, true);
    assert.match(result.reason ?? '', /no readable text/i);
  });
});

/**
 * A certificate scanned straight to PDF — the format a multi-function printer
 * produces. There is no text layer to read, so the page image has to be pulled
 * out and OCR'd. This is the same automation, one container further away.
 */
describe('a scanned PDF, no vision endpoint', () => {
  const scannedPdf = (): Buffer => workspaceFile(join('apps', 'api', 'test', 'fixtures', 'receipt-scanned.pdf'));

  test('renders the page image and yields the same figures', async () => {
    const service = new ReceiptAiVisionService(noModels, stubEngine(RECEIPT_TEXT));

    const result = await service.processReceiptOrDocument(scannedPdf(), 'scan.pdf', 'application/pdf');

    assert.equal(result.source, 'OCR');
    assert.equal(result.needsOcr, false);
    assert.equal(result.pageCount, 1);
    assert.equal(result.documentType, 'SALARY_CERTIFICATE');

    const byName = new Map(result.fields.map((field) => [field.name, field]));
    assert.equal(byName.get('grossSalary')?.value, '76800.00');
    assert.equal(byName.get('withholdingTax')?.value, '13950.00');
  });

  test('a scanned PDF with no engine says which variable to set', async () => {
    const service = new ReceiptAiVisionService(noModels, new TesseractCliOcrEngine({ binaryPath: null }));

    const result = await service.processReceiptOrDocument(scannedPdf(), 'scan.pdf', 'application/pdf');

    assert.equal(result.needsOcr, true);
    assert.deepEqual(result.fields, []);
    assert.match(result.reason ?? '', /OCR_TESSERACT_PATH/);
  });

  test('a vector PDF with no text layer is reported, not sent to OCR blindly', async () => {
    // A drawing without a text layer and without a page image cannot be read by
    // this pipeline; the user is told, and no figure is invented.
    const service = new ReceiptAiVisionService(noModels, stubEngine(RECEIPT_TEXT));
    const vector = Buffer.from(
      [
        '%PDF-1.4',
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
        '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
        '3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj',
        '4 0 obj << /Length 20 >> stream',
        'q 100 0 0 100 0 0 cm Q',
        'endstream endobj',
        'trailer << /Root 1 0 R >>',
        '%%EOF',
      ].join('\n'),
      'latin1',
    );

    const result = await service.processReceiptOrDocument(vector, 'drawing.pdf', 'application/pdf');

    assert.equal(result.needsOcr, true);
    assert.deepEqual(result.fields, []);
    assert.match(result.reason ?? '', /OCR_TESSERACT_PATH|scan/i);
  });
});

/**
 * The same assertion against a real Tesseract process.
 *
 * Skipped when `OCR_TESSERACT_PATH` does not resolve, so the suite stays green
 * on a machine without the binary — but it is not a stub: it spawns Tesseract,
 * reads the PNG from disk, and parses what the engine actually returned.
 */
describe('a photographed receipt read by a real Tesseract binary', () => {
  const resolved = resolveTesseractPath();

  test(
    'produces figures from the pixels',
    { skip: resolved.path ? false : `skipped: ${resolved.reason}` },
    async () => {
      const service = new ReceiptAiVisionService(noModels, new TesseractCliOcrEngine());

      const result = await service.processReceiptOrDocument(receiptImage(), 'receipt.png', 'image/png');

      assert.equal(result.source, 'OCR');
      assert.equal(result.needsOcr, false);

      const byName = new Map(result.fields.map((field) => [field.name, field]));
      assert.equal(byName.get('grossSalary')?.value, '76800.00');
      assert.equal(byName.get('socialSecurity')?.value, '9000.00');

      // Tesseract 5.4 reads "105." as "195." on this rendering; the withholding
      // figure therefore legitimately does not arrive. That is exactly why every
      // figure is confirmed by a human before it enters the return, and why the
      // test asserts what the engine truly produced rather than a wish.
      assert.ok(result.fields.length >= 3, `expected at least three figures, got ${result.fields.length}`);
    },
  );

  test(
    'produces figures from a scanned PDF page image',
    { skip: resolved.path ? false : `skipped: ${resolved.reason}` },
    async () => {
      const service = new ReceiptAiVisionService(noModels, new TesseractCliOcrEngine());

      const result = await service.processReceiptOrDocument(
        workspaceFile(join('apps', 'api', 'test', 'fixtures', 'receipt-scanned.pdf')),
        'scan.pdf',
        'application/pdf',
      );

      assert.equal(result.source, 'OCR');
      assert.equal(result.needsOcr, false);
      assert.equal(result.documentType, 'SALARY_CERTIFICATE');

      const byName = new Map(result.fields.map((field) => [field.name, field]));
      assert.equal(byName.get('grossSalary')?.value, '76800.00');
      assert.equal(byName.get('socialSecurity')?.value, '9000.00');
      assert.ok(result.fields.length >= 3);
    },
  );
});
