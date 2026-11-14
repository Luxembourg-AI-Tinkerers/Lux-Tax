import { assessTextQuality, extractPdfText } from './pdf-text';

/**
 * Turns an uploaded file into the text any parser or model can work from.
 *
 * The one rule this module exists to enforce: **never hand raw bytes to a text
 * parser.** A PDF is a container of compressed glyph streams and a photo is a
 * block of pixels; feeding either to a keyword matcher produces noise that looks
 * like an answer. Here the file is either read as text, or declared unreadable
 * so the caller can send it to OCR — there is no third outcome.
 */

export type DocumentTextSource =
  /** A PDF page content stream, decoded through its font CMaps. */
  | 'TEXT_LAYER'
  /** Printable text carried beside the payload (an OCR sidecar, a text fixture). */
  | 'EMBEDDED_TEXT'
  /** The upload itself is text/plain. */
  | 'PLAIN_TEXT'
  /** Nothing readable: a photo, or a scanned PDF without a text layer. */
  | 'NONE';

export interface DocumentTextDetail {
  characters: number;
  printableRatio: number;
  pages: number;
  streamsDecoded: number;
  encrypted: boolean;
}

export interface DocumentTextResult {
  text: string;
  source: DocumentTextSource;
  pageCount: number;
  /** True when the caller must reach for OCR or ask the user to type figures. */
  needsOcr: boolean;
  /** Why the text is missing, phrased for the user, or `null` when it was read. */
  reason: string | null;
  detail: DocumentTextDetail;
}

/** Shortest run of printable characters accepted as an embedded text sidecar. */
const MIN_EMBEDDED_CHARACTERS = 100;
const MIN_EMBEDDED_SPACES = 8;

function emptyDetail(): DocumentTextDetail {
  return { characters: 0, printableRatio: 0, pages: 0, streamsDecoded: 0, encrypted: false };
}

/**
 * Finds printable text carried inside a binary container.
 *
 * Two real cases justify this: a scanner that appends its OCR result beside the
 * image, and a PDF whose text layer was written by an OCR pass as plain runs.
 * A camera photo has no such run — its bytes fail UTF-8 decoding within a few
 * characters — so this does not turn a picture into invented text.
 */
export function findEmbeddedText(buffer: Buffer): string | null {
  if (buffer.length === 0) return null;

  // A run must be valid UTF-8 to survive toString(): a JPEG/PNG body becomes
  // U+FFFD quickly and breaks the run, while an appended French certificate
  // does not.
  const decoded = buffer.toString('utf8');
  const runs = decoded.match(/[\p{L}\p{N}\p{P}\p{Zs}\n\r\t]{60,}/gu);
  if (!runs) return null;

  const useful = runs
    .filter((run) => {
      const spaces = (run.match(/ /g) ?? []).length;
      const letters = (run.match(/\p{L}/gu) ?? []).length;
      return run.length >= MIN_EMBEDDED_CHARACTERS && spaces >= MIN_EMBEDDED_SPACES && letters / run.length > 0.4;
    })
    .sort((a, b) => b.length - a.length);

  if (useful.length === 0) return null;
  return useful.join('\n').slice(0, 200_000).trim();
}

/**
 * Reads what can be read from an upload.
 *
 * `mimeType` is the value already verified against the bytes by
 * `assertDeclaredMimeMatches`, so it can be trusted to choose the reader.
 */
export function readDocumentText(buffer: Buffer, mimeType: string): DocumentTextResult {
  if (mimeType === 'application/pdf') {
    const pdf = extractPdfText(buffer);
    const quality = assessTextQuality(pdf.text);
    const detail: DocumentTextDetail = {
      characters: quality.characters,
      printableRatio: quality.printableRatio,
      pages: pdf.pageCount,
      streamsDecoded: pdf.streamsDecoded,
      encrypted: pdf.encrypted,
    };

    if (!quality.looksLikeScan) {
      return {
        text: pdf.text,
        source: 'TEXT_LAYER',
        pageCount: pdf.pageCount,
        needsOcr: false,
        reason: null,
        detail,
      };
    }

    // No embedded-text fallback here on purpose. A PDF's own object syntax is
    // text — "/Type /Page /Parent 2 0 R" passes every printable-character test —
    // so treating a long run of it as an OCR sidecar fed the parser the file's
    // internals. If the text layer yielded nothing, this is a scan, and the
    // caller renders its page images instead.
    return {
      text: '',
      source: 'NONE',
      pageCount: pdf.pageCount,
      needsOcr: true,
      reason: pdf.encrypted
        ? 'This PDF is encrypted, so its text cannot be read. Enter the figures manually or upload an unprotected copy.'
        : 'This PDF has no text layer — it is a scan. Configure an OCR engine (OCR_TESSERACT_PATH) or a vision model, or enter the figures manually.',
      detail,
    };
  }

  if (mimeType.startsWith('image/')) {
    const embedded = findEmbeddedText(buffer);
    if (embedded) {
      const quality = assessTextQuality(embedded);
      return {
        text: embedded,
        source: 'EMBEDDED_TEXT',
        pageCount: 1,
        needsOcr: quality.looksLikeScan,
        reason: quality.looksLikeScan ? 'Only a fragment of text was found in this image.' : null,
        detail: { ...emptyDetail(), characters: quality.characters, printableRatio: quality.printableRatio, pages: 1 },
      };
    }

    return {
      text: '',
      source: 'NONE',
      pageCount: 1,
      needsOcr: true,
      reason:
        'This is an image, not a text document. Reading it needs an OCR engine (OCR_TESSERACT_PATH) or a vision model.',
      detail: emptyDetail(),
    };
  }

  // text/plain — the only type left after the upload guard's sniffing.
  const text = buffer.toString('utf8');
  const quality = assessTextQuality(text);
  return {
    text,
    source: 'PLAIN_TEXT',
    pageCount: 1,
    needsOcr: quality.looksLikeScan,
    reason: quality.looksLikeScan ? 'This file contains too little text to classify.' : null,
    detail: { ...emptyDetail(), characters: quality.characters, printableRatio: quality.printableRatio, pages: 1 },
  };
}
