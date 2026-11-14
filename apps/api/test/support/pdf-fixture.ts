import { deflateSync } from 'node:zlib';

/**
 * Builds a PDF whose visible text is known, for the pipeline tests.
 *
 * `extractPdfText` does not need a cross-reference table (it indexes objects by
 * scanning), so a fixture can stay readable instead of being a 200-line byte
 * blob. Two variants matter: an uncompressed content stream, which isolates the
 * text-operator reader, and a FlateDecode stream, which is what a real producer
 * writes and what the ACD form in this workspace uses.
 */
export interface PdfFixtureOptions {
  /** Wrap the content stream in FlateDecode, as every real PDF does. */
  compress?: boolean;
  /** Extra pages, each with its own line of text. */
  extraPages?: string[];
}

export function buildPdf(lines: string[], options: PdfFixtureOptions = {}): Buffer {
  const pages = [lines, ...(options.extraPages ?? []).map((line) => [line])];

  const objects: string[] = [];
  // 1 = catalog, 2 = page tree, then page/content pairs from object 3.
  // The font takes the number after the last page, so a two-page document does
  // not have its font overwritten by the second page object.
  let nextObject = 3;
  const fontObjectNumber = 3 + pages.length * 2;

  const pageRefs: string[] = [];
  const bodies: string[] = [];

  for (const pageLines of pages) {
    const pageNumber = nextObject;
    const contentNumber = nextObject + 1;
    nextObject += 2;

    const content = ['BT', '/F1 11 Tf', '14 TL', '50 780 Td']
      .concat(pageLines.map((line) => `(${escapePdfString(line)}) Tj T*`))
      .concat(['ET'])
      .join('\n');

    const stream = Buffer.from(content, 'latin1');
    const encoded = options.compress ? deflateSync(stream) : stream;
    const filter = options.compress ? ' /Filter /FlateDecode' : '';

    bodies.push(
      `${pageNumber} 0 obj << /Type /Page /Parent 2 0 R /Contents ${contentNumber} 0 R ` +
        `/Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> >> endobj`,
      `${contentNumber} 0 obj << /Length ${encoded.length}${filter} >> stream\n` +
        `${encoded.toString('latin1')}\nendstream endobj`,
    );

    pageRefs.push(`${pageNumber} 0 R`);
  }

  objects.push(
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    `2 0 obj << /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pages.length} >> endobj`,
    ...bodies,
    `${fontObjectNumber} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj`,
  );

  return Buffer.from(
    ['%PDF-1.4', ...objects, 'trailer << /Root 1 0 R >>', '%%EOF'].join('\n'),
    'latin1',
  );
}

/** Escapes the three characters that end a PDF literal string. */
function escapePdfString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
