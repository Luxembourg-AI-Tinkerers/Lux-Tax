import { writeFileSync } from 'node:fs';
import { buildAnnexPdf } from '../apps/api/src/modules/filing/annex-pdf.builder';

const pdf = buildAnnexPdf(
  {
    taxYear: 2025,
    taxClass: 'CLASS_2',
    householdName: 'Ménage Düpont',
    taxpayer: 'Marie Düpont',
    generatedAt: '2026-11-08T10:00:00.000Z',
    packageHash: 'abcdef0123456789abcdef0123456789',
  },
  [
    {
      code: '190/210',
      title: 'Revenus de location — biens bâtis',
      reason: 'Une location déclarée ouvre l’annexe 190/210.',
      fields: [
        { label: 'Loyers bruts', value: '18000.00' },
        { label: 'Charges', value: '2000.00' },
        { label: 'Amortissement', value: '7600.00' },
        { label: 'Intérêts', value: '1000.00' },
        { label: 'Résultat net', value: '7400.00' },
      ],
      produced: false,
    },
    {
      code: '700',
      title: 'Plus-values immobilières et cessions',
      reason: 'Une plus-value imposable ouvre le modèle 700.',
      fields: [
        { label: 'Participation importante (Art. 100)', value: '60000.00' },
        { label: 'Abattement appliqué', value: '50000.00' },
        { label: 'Plus-value imposable', value: '10000.00' },
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
      reason: 'Le CIM se demande dans la feuille Enfants du modèle 100.',
      fields: [{ label: 'CIM calculé', value: '3504.00' }],
      produced: false,
    },
  ],
);

writeFileSync('.tools/sample-annexes.pdf', pdf);
const text = pdf.toString('latin1');
console.log('bytes', pdf.length);
console.log('pages', (text.match(/\/Type \/Page\b(?!s)/g) ?? []).length);
console.log('header', text.slice(0, 8));
console.log('eof', text.trimEnd().slice(-5));
console.log('annexes', ['ANNEXE 190/210', 'ANNEXE 700', 'ANNEXE 104', 'case 228+'].every((c) => text.includes(c)));

