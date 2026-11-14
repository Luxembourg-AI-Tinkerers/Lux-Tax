import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentType } from '@luxtax/contracts';
import { ReceiptAiVisionService } from '../src/modules/documents/receipt-ai-vision.service';
import { TesseractCliOcrEngine } from '../src/modules/documents/ocr/ocr-engine';
import { buildPdf } from './support/pdf-fixture';

/**
 * The upload pipeline, end to end in one process.
 *
 * The HTTP e2e cannot run everywhere — it needs a database, and the Nest ESM
 * test harness currently fails to load on this machine — so the seam that
 * actually decides a tax figure is covered here instead: real PDF bytes in, the
 * document's text layer out, the deterministic parser over it, and the same
 * result the API would store. Nothing is mocked except the model registry, which
 * is empty on purpose: that is the "no OCR configured" case.
 */

const adminWithoutModels = {
  getModelRoutes: async () => [],
  getModels: async () => [],
} as never;

const service = (): ReceiptAiVisionService => new ReceiptAiVisionService(adminWithoutModels);

const CERTIFICATE_LINES = [
  'CERTIFICAT DE REMUNERATION 2025',
  'Employeur: Societe Generale Luxembourg',
  '101. Remuneration brute: 76 800,00 EUR',
  '103. Cotisations sociales: 9 000,00 EUR',
  '105. Retenue d impot: 13 950,00 EUR',
  '141. Interets debiteurs: 3 500,00 EUR',
];

describe('upload → text layer → figures', () => {
  test('a compressed PDF certificate becomes four typed figures', async () => {
    const pdf = buildPdf(CERTIFICATE_LINES, { compress: true });
    const result = await service().processReceiptOrDocument(pdf, 'certificat-2025.pdf', 'application/pdf');

    assert.equal(result.source, 'TEXT_LAYER');
    assert.equal(result.needsOcr, false);
    assert.equal(result.documentType, DocumentType.SALARY_CERTIFICATE);

    const byName = new Map(result.fields.map((field) => [field.name, field]));
    assert.equal(byName.get('grossSalary')?.value, '76800.00');
    assert.equal(byName.get('socialSecurity')?.value, '9000.00');
    assert.equal(byName.get('withholdingTax')?.value, '13950.00');
    assert.equal(byName.get('mortgageInterest')?.value, '3500.00');

    // Provenance: the snippet is the printed line, which is what the user is
    // shown when confirming.
    assert.match(byName.get('grossSalary')?.snippet ?? '', /101\./);
  });

  test('a table whose amount sits on the following line is still read', async () => {
    // A PDF prints the label and the figure in columns; the text layer often
    // yields them as consecutive lines.
    const pdf = buildPdf([
      'CERTIFICAT DE REMUNERATION 2025',
      '101. Remuneration brute',
      '76 800,00',
      '105. Retenue d impot',
      '13 950,00',
    ]);

    const result = await service().processReceiptOrDocument(pdf, 'certificat.pdf', 'application/pdf');
    const byName = new Map(result.fields.map((field) => [field.name, field]));

    assert.equal(byName.get('grossSalary')?.value, '76800.00');
    assert.equal(byName.get('withholdingTax')?.value, '13950.00');
  });

  test('a multi-page PDF reports its page count', async () => {
    const pdf = buildPdf(CERTIFICATE_LINES, { extraPages: ['Annexe: aucune autre remuneration'] });
    const result = await service().processReceiptOrDocument(pdf, 'certificat.pdf', 'application/pdf');
    assert.equal(result.pageCount, 2);
  });

  test('the same certificate as text yields the same figures', async () => {
    const result = await service().processReceiptOrDocument(
      Buffer.from(CERTIFICATE_LINES.join('\n'), 'utf8'),
      'certificat.txt',
      'text/plain',
    );

    assert.equal(result.source, 'PLAIN_TEXT');
    assert.equal(result.fields.filter((field) => field.name === 'grossSalary').length, 1);
    assert.equal(result.fields.find((field) => field.name === 'grossSalary')?.value, '76800.00');
  });

  test('a crèche invoice is classified as childcare and not as a training course', async () => {
    const invoice = buildPdf([
      'FACTURE CRECHE LA MAISON DES ENFANTS',
      'Garde d enfant octobre 2025',
      'Montant total 450.00 EUR',
    ]);

    const result = await service().processReceiptOrDocument(invoice, 'creche.pdf', 'application/pdf');
    assert.equal(result.documentType, DocumentType.CHILDCARE_INVOICE);
    assert.equal(result.fields[0]?.value, '450.00');
    assert.equal(result.fields[0]?.category, 'CHILDCARE_EXPENSE');
  });

  test('a dental invoice is a medical invoice, not a childcare invoice', async () => {
    const invoice = buildPdf([
      'Cabinet dentaire Dr Muller',
      'Soins dentaires 12.03.2025',
      'Total 280.00 EUR',
    ]);

    const result = await service().processReceiptOrDocument(invoice, 'dentiste.pdf', 'application/pdf');
    assert.equal(result.documentType, DocumentType.MEDICAL_INVOICE);
    assert.equal(result.fields[0]?.name, 'medicalExpense');
  });

  test('a photo with no model and no text says so, and extracts nothing', async () => {
    const photo = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from(Array.from({ length: 6000 }, (_, index) => (index * 91 + 7) % 256)),
    ]);

    // An explicitly unconfigured engine: the assertion is about the state the
    // user sees when nothing can read the file, not about whether this machine
    // happens to have Tesseract on it.
    const configuredOff = new TesseractCliOcrEngine({ binaryPath: null });
    const result = await new ReceiptAiVisionService(adminWithoutModels, configuredOff).processReceiptOrDocument(
      photo,
      'IMG_2025.jpg',
      'image/jpeg',
    );

    assert.equal(result.source, 'NONE');
    assert.equal(result.needsOcr, true);
    assert.deepEqual(result.fields, []);
    assert.match(result.reason ?? '', /OCR_TESSERACT_PATH|OCR engine/i);
  });

  test('a scan that carries its own text is read without any model', async () => {
    const scan = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from(CERTIFICATE_LINES.join('\n'), 'utf8'),
    ]);

    const result = await service().processReceiptOrDocument(scan, 'scan.png', 'image/png');

    assert.equal(result.source, 'EMBEDDED_TEXT');
    assert.equal(result.needsOcr, false);
    assert.equal(result.fields.find((field) => field.name === 'grossSalary')?.value, '76800.00');
  });

  test('an unreadable PDF is stored as needing OCR, with a reason for the user', async () => {
    const empty = buildPdf([]);
    const result = await service().processReceiptOrDocument(empty, 'scan.pdf', 'application/pdf');

    assert.equal(result.fields.length, 0);
    assert.equal(result.needsOcr, true);
    assert.ok((result.reason ?? '').length > 10);
  });
});
