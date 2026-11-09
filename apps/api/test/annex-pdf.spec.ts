import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { AnnexRequestDto } from '@luxtax/contracts';
import { buildAnnexPdf, assemblePdf } from '../src/modules/filing/annex-pdf.builder';

const annexes: AnnexRequestDto[] = [
  {
    code: '190/210',
    title: 'Revenus de location — biens bâtis',
    reason: 'Une location déclarée ouvre l’annexe 190/210.',
    fields: [
      { label: 'Loyers bruts', value: '18000.00' },
      { label: 'Charges', value: '2000.00' },
      { label: 'Résultat net', value: '7400.00' },
    ],
    produced: false,
  },
  {
    code: '700',
    title: 'Plus-values immobilières et cessions',
    reason: 'Une plus-value imposable ouvre le modèle 700.',
    fields: [
      { label: 'Spéculation (Art. 99bis)', value: '0.00' },
      { label: 'Participation importante (Art. 100)', value: '60000.00' },
    ],
    produced: false,
  },
  {
    code: '104',
    title: 'Désignation du parent — garde alternée',
    reason: 'À remplir en cas de garde alternée.',
    fields: [{ label: 'Enfants déclarés', value: '1' }],
    produced: false,
  },
  {
    code: '100 - feuille Enfants (case 228+)',
    title: "Demande de crédit d'impôt monoparental",
    reason: 'Le CIM se demande dans la feuille Enfants.',
    fields: [{ label: 'CIM calculé', value: '3504.00' }],
    produced: false,
  },
];

const meta = {
  taxYear: 2025,
  taxClass: 'CLASS_2',
  householdName: 'Ménage Düpont',
  taxpayer: 'Marie Düpont',
  generatedAt: '2026-11-08T10:00:00.000Z',
  packageHash: 'abcdef0123456789abcdef0123456789',
};

const pageCount = (buffer: Buffer): number =>
  (buffer.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;

describe('Annex PDF builder', () => {
  test('produces a valid PDF 1.4 envelope', () => {
    const pdf = buildAnnexPdf(meta, annexes);
    const text = pdf.toString('latin1');

    assert.ok(text.startsWith('%PDF-1.4'));
    assert.ok(text.trimEnd().endsWith('%%EOF'));
    assert.match(text, /\/Type \/Catalog/);
    assert.match(text, /\/Type \/Pages/);
    assert.match(text, /\/BaseFont \/Helvetica\b/);
    assert.match(text, /\/BaseFont \/Helvetica-Bold\b/);
  });

  test('cover page plus one page per annex', () => {
    const pdf = buildAnnexPdf(meta, annexes);
    assert.strictEqual(pageCount(pdf), annexes.length + 1);
  });

  test('carries the annex codes, taxpayer and values', () => {
    const text = buildAnnexPdf(meta, annexes).toString('latin1');
    assert.ok(text.includes('ANNEXE 190/210'));
    assert.ok(text.includes('ANNEXE 700'));
    assert.ok(text.includes('ANNEXE 104'));
    assert.ok(text.includes('case 228+'));
    assert.ok(text.includes('Marie D'));
    assert.ok(text.includes('7400.00'));
    assert.ok(text.includes('3504.00'));
  });

  test('states that it is not the official form', () => {
    const text = buildAnnexPdf(meta, annexes).toString('latin1');
    assert.ok(text.includes('ne remplace pas le formulaire officiel'));
    assert.ok(text.includes('Signature du contribuable'));
  });

  test('xref offsets point at the objects and startxref at the table', () => {
    const pdf = buildAnnexPdf(meta, annexes);
    const text = pdf.toString('latin1');

    const startxref = Number(text.match(/startxref\s+(\d+)/)?.[1] ?? -1);
    assert.ok(startxref > 0, 'startxref present');
    assert.strictEqual(text.slice(startxref, startxref + 4), 'xref');

    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    assert.ok(offsets.length > 0);
    for (const offset of offsets.slice(1)) {
      assert.strictEqual(text.slice(offset, offset + 24).includes(' 0 obj'), true, `object at ${offset}`);
    }
  });

  test('escapes parentheses and backslashes in user text', () => {
    const pdf = buildAnnexPdf(meta, [
      {
        code: 'CUSTOM',
        title: 'Test (parent)',
        reason: 'Raison avec \\ backslash et (parenthèses)',
        fields: [{ label: 'Nom (complet)', value: 'A (B) \\ C' }],
        produced: false,
      },
    ]);
    const text = pdf.toString('latin1');
    assert.ok(text.includes('\\(parent\\)'));
    assert.ok(text.includes('Nom \\(complet\\)'));
  });

  test('assembler handles a single page', () => {
    const pdf = assemblePdf(['BT /F1 12 Tf 50 700 Td (Hello) Tj ET']);
    assert.strictEqual(pageCount(pdf), 1);
    assert.ok(pdf.toString('latin1').includes('(Hello) Tj'));
  });
});
