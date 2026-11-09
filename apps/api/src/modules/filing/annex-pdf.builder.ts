/**
 * Dependency-free PDF builder for the ACD annex sheets.
 *
 * The app cannot reproduce the official ACD forms (layout, case numbering and
 * legal notices belong to the administration). What it *can* do — and what this
 * module produces — is a form-shaped preparation sheet per annex:
 *
 *   header (annex code, tax year, taxpayer, class)
 *   a labelled value table with an empty "case" column to copy from
 *   a declaration + signature block
 *   a footer stating that it does not replace the official form
 *
 * The output is a valid PDF 1.4 document (Helvetica, A4, one page per annex plus
 * a cover page). No external dependency is used, so it builds in any environment.
 */
import type { AnnexRequestDto } from '@luxtax/contracts';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export interface AnnexPdfMeta {
  taxYear: number;
  taxClass?: string | null;
  householdName?: string | null;
  taxpayer?: string | null;
  generatedAt?: string;
  packageHash?: string | null;
}

interface Page {
  ops: string[];
  cursorY: number;
}

const escapePdfText = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]+/g, ' ');

/** Trim to a printable width (rough Helvetica average advance ≈ 0.5 em). */
const fit = (value: string, maxChars: number): string =>
  value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars - 1))}…`;

const newPage = (): Page => ({ ops: [], cursorY: PAGE_HEIGHT - MARGIN });

const text = (page: Page, x: number, y: number, value: string, size = 10, bold = false): void => {
  page.ops.push(
    `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(value)}) Tj ET`,
  );
};

const rule = (page: Page, y: number, width = CONTENT_WIDTH, x = MARGIN): void => {
  page.ops.push(
    `0.6 w ${x.toFixed(2)} ${y.toFixed(2)} m ${(x + width).toFixed(2)} ${y.toFixed(2)} l S`,
  );
};

const box = (page: Page, x: number, y: number, w: number, h: number): void => {
  page.ops.push(
    `0.6 w ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`,
  );
};

const wrap = (page: Page, value: string, x: number, y: number, maxChars: number, size = 9): number => {
  const words = value.split(/\s+/);
  let line = '';
  let cursor = y;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      text(page, x, cursor, line, size);
      cursor -= size + 3;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) {
    text(page, x, cursor, line, size);
    cursor -= size + 3;
  }
  return cursor;
};

const ANNEX_TITLES: Record<string, string> = {
  '190/210': 'Revenus de location — biens bâtis',
  '700': 'Plus-values immobilières et cessions',
  '104': 'Désignation du parent — garde alternée',
  '100 - feuille Enfants (case 228+)': "Demande de crédit d'impôt monoparental (CIM)",
};

const annexTitle = (annex: AnnexRequestDto): string =>
  ANNEX_TITLES[annex.code] ?? annex.title ?? `Annexe ${annex.code}`;

function coverPage(meta: AnnexPdfMeta, annexes: AnnexRequestDto[]): Page {
  const page = newPage();
  let y = page.cursorY;

  text(page, MARGIN, y, 'DOSSIER FISCAL — ANNEXES', 18, true);
  y -= 26;
  text(page, MARGIN, y, 'Administration des contributions directes (ACD) — préparation', 11);
  y -= 14;
  text(page, MARGIN, y, `Année d'imposition ${meta.taxYear}`, 11, true);
  y -= 28;
  rule(page, y);
  y -= 22;

  const rows: Array<[string, string]> = [
    ["Ménage", meta.householdName ?? '—'],
    ['Contribuable', meta.taxpayer ?? '—'],
    ["Classe d'impôt", meta.taxClass ?? '—'],
    ['Annexes requises', String(annexes.length)],
    ['Référence du dossier', meta.packageHash ? meta.packageHash.slice(0, 24) : '—'],
    ['Généré le', meta.generatedAt ?? new Date().toISOString()],
  ];
  for (const [label, value] of rows) {
    text(page, MARGIN, y, label, 9);
    text(page, MARGIN + 150, y, fit(value, 70), 9, true);
    y -= 15;
  }

  y -= 10;
  rule(page, y);
  y -= 20;
  text(page, MARGIN, y, 'Contenu', 11, true);
  y -= 16;
  for (const annex of annexes) {
    text(page, MARGIN, y, `• ${annex.code} — ${annexTitle(annex)}`, 9);
    y -= 13;
  }

  y -= 12;
  const note =
    'Ces feuilles sont des documents de préparation. Elles reprennent les montants calculés par le dossier et laissent une colonne « case » à compléter avec le formulaire officiel ACD. Elles ne remplacent ni le formulaire officiel ni la signature du contribuable.';
  y = wrap(page, note, MARGIN, y, 92, 9);

  return page;
}

function annexPage(annex: AnnexRequestDto, meta: AnnexPdfMeta, index: number): Page {
  const page = newPage();
  let y = page.cursorY;

  // Header band
  box(page, MARGIN, y - 46, CONTENT_WIDTH, 46);
  text(page, MARGIN + 10, y - 18, `ANNEXE ${annex.code}`, 14, true);
  text(page, MARGIN + 10, y - 34, fit(annexTitle(annex), 78), 10);
  text(page, MARGIN + CONTENT_WIDTH - 120, y - 18, `Année ${meta.taxYear}`, 10, true);
  y -= 62;

  text(page, MARGIN, y, `Motif : ${annex.reason}`, 9);
  y -= 18;

  // Meta grid
  const metaRows: Array<[string, string]> = [
    ["Ménage", meta.householdName ?? '—'],
    ['Contribuable', meta.taxpayer ?? '—'],
    ["Classe d'impôt", meta.taxClass ?? '—'],
  ];
  for (const [label, value] of metaRows) {
    text(page, MARGIN, y, `${label} :`, 9);
    text(page, MARGIN + 90, y, fit(value, 60), 9, true);
    y -= 13;
  }
  y -= 8;

  // Table header
  box(page, MARGIN, y - 4, CONTENT_WIDTH, 18);
  text(page, MARGIN + 6, y + 1, 'Libellé', 9, true);
  text(page, MARGIN + 330, y + 1, 'Montant calculé', 9, true);
  text(page, MARGIN + 450, y + 1, 'Case', 9, true);
  y -= 22;

  for (const field of annex.fields) {
    if (y < MARGIN + 120) break;
    text(page, MARGIN + 6, y, fit(field.label, 58), 9);
    text(page, MARGIN + 330, y, field.value, 9, true);
    // empty case slot to be filled from the official form
    box(page, MARGIN + 452, y - 3, 60, 14);
    y -= 8;
    rule(page, y);
    y -= 14;
  }

  // Declaration + signature
  y = Math.min(y, MARGIN + 110);
  rule(page, y + 30);
  text(page, MARGIN, y + 12, 'Déclaration : les montants ci-dessus sont issus du dossier fiscal et doivent être reportés sur le formulaire officiel.', 8);
  text(page, MARGIN, y - 4, 'Date : ____________________', 9);
  text(page, MARGIN + 230, y - 4, 'Signature du contribuable : ____________________', 9);

  void index;
  return page;
}

function footer(page: Page, pageNumber: number, total: number, meta: AnnexPdfMeta): void {
  text(page, MARGIN, MARGIN - 14, `Document de préparation — ne remplace pas le formulaire officiel ACD`, 7);
  text(page, PAGE_WIDTH - MARGIN - 60, MARGIN - 14, `Page ${pageNumber}/${total}`, 7);
  text(page, PAGE_WIDTH - MARGIN - 180, MARGIN - 26, `Année ${meta.taxYear}`, 7);
}

/** Assemble a PDF 1.4 file from page content streams. */
export function assemblePdf(pages: string[]): Buffer {
  const parts: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;

  const push = (value: string | Buffer): void => {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, 'latin1');
    parts.push(buffer);
    length += buffer.length;
  };

  const addObject = (id: number, body: string | Buffer): void => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    push(body);
    push('\nendobj\n');
  };

  push('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');

  const pageObjectIds = pages.map((_, i) => 5 + i * 2);
  addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  addObject(
    2,
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  );
  addObject(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  addObject(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  pages.forEach((content, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    const stream = Buffer.from(content, 'latin1');

    addObject(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
    );

    offsets[contentId] = length;
    push(`${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n`);
    push(stream);
    push('\nendstream\nendobj\n');
  });

  const xrefStart = length;
  const maxId = 4 + pages.length * 2;
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) {
    const offset = offsets[id] ?? 0;
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return Buffer.concat(parts);
}

/**
 * Build the annex PDF for a filing package.
 * One cover page plus one page per annex.
 */
export function buildAnnexPdf(meta: AnnexPdfMeta, annexes: AnnexRequestDto[]): Buffer {
  const pages = [coverPage(meta, annexes)];
  annexes.forEach((annex, index) => pages.push(annexPage(annex, meta, index)));

  const total = pages.length;
  const streams = pages.map((page, index) => {
    footer(page, index + 1, total, meta);
    return page.ops.join('\n');
  });

  return assemblePdf(streams);
}
