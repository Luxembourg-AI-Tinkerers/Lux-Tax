import { constants as zlibConstants, inflateRawSync, inflateSync } from 'node:zlib';

/**
 * A dependency-free reader for the *text layer* of a PDF.
 *
 * Why this exists: the upload pipeline used to hand the raw file bytes to
 * `buffer.toString('utf-8')` and run keyword matching over the result. For a
 * real PDF that is meaningless — the page content is a FlateDecode stream whose
 * glyph codes are font-specific, so a tax certificate produced by the ACD
 * reached the extractor as noise. This module turns the file into the text a
 * human sees, and it reports when it could not: a scanned PDF has no text
 * layer and must go to OCR instead.
 *
 * Scope, deliberately bounded:
 *  - classic and cross-reference-stream PDFs (objects are found by scanning,
 *    so a broken xref does not matter);
 *  - FlateDecode content streams, `/ToUnicode` CMaps (bfchar + bfrange),
 *    Identity-H two-byte codes, simple fonts with WinAnsi/Latin-1;
 *  - text positioning operators only as far as they decide line breaks.
 *
 * Out of scope, and reported rather than guessed: encryption, image-only
 * pages, fonts whose ToUnicode CMap is embedded in an object stream we cannot
 * resolve, and non-Flate content filters (LZW, ASCII85, RunLength).
 */

/** What a caller needs to decide between "we read it" and "this is a scan". */
export interface PdfTextResult {
  /** Text of all pages, pages separated by a form feed. */
  text: string;
  /** Text per page, in page order. */
  pages: string[];
  pageCount: number;
  /** True when the file declares an `/Encrypt` dictionary. */
  encrypted: boolean;
  /** Number of content streams decoded. */
  streamsDecoded: number;
  /** Number of streams that used an unsupported filter and were skipped. */
  streamsSkipped: number;
  /** Fonts that had a usable ToUnicode CMap. */
  fontsWithCMap: number;
  /** Fonts that fell back to WinAnsi / Latin-1. */
  fontsWithoutCMap: number;
}

/** Heuristic verdict on whether a text layer is worth feeding to the parser. */
export interface TextQuality {
  characters: number;
  /** Share of characters that are letters, digits or whitespace. */
  printableRatio: number;
  /** True when there is too little text to classify a document from. */
  looksLikeScan: boolean;
}

/** Below this many non-space characters a page is treated as "no text layer". */
export const MIN_TEXT_LAYER_CHARACTERS = 40;

/** Below this printable ratio the "text" is font garbage, not language. */
export const MIN_PRINTABLE_RATIO = 0.75;

export interface PdfObject {
  num: number;
  body: string;
}

interface FontInfo {
  /** 2 for Identity-H composite fonts, 1 for simple fonts. */
  bytesPerCode: 1 | 2;
  /** Glyph code → Unicode text. Empty when the font has no usable CMap. */
  map: Map<number, string>;
  hasCMap: boolean;
}

/** Font resource name (`F1`) → resolved font. */
type FontTable = Map<string, FontInfo>;

const EMPTY_FONT: FontInfo = { bytesPerCode: 1, map: new Map(), hasCMap: false };

/**
 * cp1252 for the range Latin-1 leaves undefined. PDF text in French uses these
 * infrequently, but a curly apostrophe or a euro sign should not become a
 * replacement character in a tax figure's snippet.
 */
const CP1252: Record<number, string> = {
  0x80: '€',
  0x82: '‚',
  0x83: 'ƒ',
  0x84: '„',
  0x85: '…',
  0x86: '†',
  0x87: '‡',
  0x88: 'ˆ',
  0x89: '‰',
  0x8a: 'Š',
  0x8b: '‹',
  0x8c: 'Œ',
  0x8e: 'Ž',
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x95: '•',
  0x96: '–',
  0x97: '—',
  0x98: '˜',
  0x99: '™',
  0x9a: 'š',
  0x9b: '›',
  0x9c: 'œ',
  0x9e: 'ž',
  0x9f: 'Ÿ',
};

function decodeWinAnsi(code: number): string {
  if (code >= 0x20 && code <= 0x7e) return String.fromCharCode(code);
  if (CP1252[code] !== undefined) return CP1252[code];
  if (code >= 0xa0 && code <= 0xff) return String.fromCharCode(code);
  return '';
}

/**
 * Maps every `N G obj` in the file to its body. Bodies are latin-1 strings, so
 * one character is one byte and string offsets stay usable as byte offsets.
 * A later definition of the same object number (incremental update) wins.
 */
export function indexObjects(src: string): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>();
  const header = /(\d+)\s+(\d+)\s+obj\b/g;
  let match: RegExpExecArray | null;

  while ((match = header.exec(src)) !== null) {
    const start = match.index + match[0].length;
    const end = src.indexOf('endobj', start);
    if (end < 0) break;
    objects.set(Number(match[1]), { num: Number(match[1]), body: src.slice(start, end) });
    // Continue after this object so a `obj` inside a stream cannot re-enter it.
    header.lastIndex = end + 'endobj'.length;
  }

  return objects;
}

/** Body of the stream in an object, or `null` when the object carries none. */
export function streamBody(body: string): { raw: Buffer; dictionary: string } | null {
  const streamAt = body.indexOf('stream');
  if (streamAt < 0) return null;

  let start = streamAt + 'stream'.length;
  if (body[start] === '\r') start += 1;
  if (body[start] === '\n') start += 1;

  const end = body.lastIndexOf('endstream');
  if (end < start) return null;

  return {
    raw: Buffer.from(body.slice(start, end), 'latin1'),
    dictionary: body.slice(0, streamAt),
  };
}

/**
 * Adds the objects that live inside `/Type /ObjStm` streams to the index.
 *
 * From PDF 1.5 on, a producer may pack page and font dictionaries into a
 * compressed object stream, so they have no `N G obj` header of their own and a
 * plain scan of the file cannot see them. Without this pass such a document
 * decodes to empty pages and would be misreported as a scan.
 */
export function indexObjectStreams(objects: Map<number, PdfObject>): void {
  const packed = [...objects.values()].filter((object) => /\/Type\s*\/ObjStm/.test(object.body));

  for (const container of packed) {
    const decoded = decodeStream(container.body);
    if (!decoded) continue;

    const text = decoded.toString('latin1');
    const count = Number(/\/N\s+(\d+)/.exec(container.body)?.[1] ?? 0);
    const first = Number(/\/First\s+(\d+)/.exec(container.body)?.[1] ?? 0);
    if (!count || !first || first > text.length) continue;

    const header = text
      .slice(0, first)
      .trim()
      .split(/\s+/)
      .map(Number);

    for (let i = 0; i < count; i += 1) {
      const num = header[i * 2];
      const offset = header[i * 2 + 1];
      const nextOffset = i + 1 < count ? header[(i + 1) * 2 + 1] : text.length - first;
      if (!Number.isFinite(num) || !Number.isFinite(offset)) continue;
      if (objects.has(num)) continue;
      objects.set(num, {
        num,
        body: text.slice(first + offset, first + Math.min(nextOffset, text.length - first)),
      });
    }
  }
}

function inflate(raw: Buffer): Buffer | null {
  const attempts: Array<() => Buffer> = [
    () => inflateSync(raw),
    () => inflateRawSync(raw),
    () => inflateSync(raw, { finishFlush: zlibConstants.Z_SYNC_FLUSH }),
  ];

  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      // try the next variant; a truncated tail is common in linearised files
    }
  }
  return null;
}

/**
 * Decodes a stream according to its `/Filter`. Returns `null` for an image or
 * an unsupported filter, so the caller can count what it skipped instead of
 * silently producing empty text.
 */
export function decodeStream(body: string): Buffer | null {
  const stream = streamBody(body);
  if (!stream) return null;

  const { dictionary, raw } = stream;
  const filterMatch = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dictionary);
  const filter = filterMatch ? filterMatch[1] : '';

  if (!filter) return raw;
  if (/FlateDecode/.test(filter)) return inflate(raw);
  if (/ASCIIHexDecode/.test(filter) && !/FlateDecode/.test(filter)) {
    const hex = raw.toString('latin1').replace(/>[\s\S]*$/, '').replace(/[^0-9A-Fa-f]/g, '');
    const even = hex.length % 2 === 0 ? hex : `${hex}0`;
    return Buffer.from(even, 'hex');
  }
  return null;
}

/** Resolves `/Key N 0 R` in an object body to the referenced object's body. */
export function resolveRef(objects: Map<number, PdfObject>, body: string, key: string): string | null {
  const ref = new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`).exec(body);
  if (!ref) return null;
  const target = objects.get(Number(ref[1]));
  return target ? target.body : null;
}

/** `<< /Name 12 0 R /Other 13 0 R >>` → `{ Name: '12 0 R', … }`. */
export function readEntries(dictionary: string): Map<string, string> {
  const entries = new Map<string, string>();
  const entry = /\/([A-Za-z0-9#+._-]+)\s+(\d+\s+\d+\s+R)/g;
  let match: RegExpExecArray | null;
  while ((match = entry.exec(dictionary)) !== null) {
    entries.set(match[1], match[2]);
  }
  return entries;
}

export function refNumber(reference: string | undefined): number | null {
  if (!reference) return null;
  const match = /^(\d+)\s+\d+\s+R$/.exec(reference.trim());
  return match ? Number(match[1]) : null;
}

/**
 * Parses a `/ToUnicode` CMap into a code → text map.
 *
 * Both forms the format allows are handled:
 *   beginbfchar  <0003> <0020>
 *   beginbfrange <0020> <007e> <0020>   |   <0020> <0029> [<0041> <0042> …]
 *
 * The source hex length decides how many bytes a code occupies, which is what
 * distinguishes an Identity-H composite font from a simple one.
 */
function parseToUnicodeCMap(cmap: string): { map: Map<number, string>; bytesPerCode: 1 | 2 } {
  const map = new Map<number, string>();
  let bytesPerCode: 1 | 2 = 1;

  const sourceLength = (hex: string): number => hex.replace(/\s+/g, '').length / 2;

  const bfchar = /beginbfchar([\s\S]*?)endbfchar/g;
  let block: RegExpExecArray | null;
  while ((block = bfchar.exec(cmap)) !== null) {
    const pair = /<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]*)>/g;
    let entry: RegExpExecArray | null;
    while ((entry = pair.exec(block[1])) !== null) {
      const bytes = sourceLength(entry[1]);
      if (bytes === 2) bytesPerCode = 2;
      map.set(parseInt(entry[1].replace(/\s+/g, ''), 16), utf16be(entry[2]));
    }
  }

  const bfrange = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((block = bfrange.exec(cmap)) !== null) {
    const simple = /<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]*)>/g;
    let entry: RegExpExecArray | null;
    while ((entry = simple.exec(block[1])) !== null) {
      const bytes = sourceLength(entry[1]);
      if (bytes === 2) bytesPerCode = 2;
      const low = parseInt(entry[1].replace(/\s+/g, ''), 16);
      const high = parseInt(entry[2].replace(/\s+/g, ''), 16);
      const base = utf16be(entry[3]);
      // A bfrange longer than a few thousand codes is a malformed or hostile
      // file; refusing to expand it keeps this bounded.
      if (high < low || high - low > 0x4000) continue;
      for (let code = low; code <= high; code += 1) {
        map.set(code, shiftLastCodePoint(base, code - low));
      }
    }

    const arrayForm = /<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>\s*\[([\s\S]*?)\]/g;
    while ((entry = arrayForm.exec(block[1])) !== null) {
      const low = parseInt(entry[1].replace(/\s+/g, ''), 16);
      const destinations = entry[3].match(/<([0-9A-Fa-f\s]*)>/g) ?? [];
      destinations.forEach((destination, index) => {
        map.set(low + index, utf16be(destination.replace(/[<>]/g, '')));
      });
    }
  }

  return { map, bytesPerCode };
}

/** UTF-16BE hex (`0052 00e9`) → `Ré`, as a CMap destination is written. */
function utf16be(hex: string): string {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length === 0) return '';
  const even = clean.length % 2 === 0 ? clean : `${clean}0`;
  let out = '';
  for (let i = 0; i < even.length; i += 4) {
    const unit = parseInt(even.slice(i, i + 4).padEnd(4, '0'), 16);
    if (!Number.isNaN(unit) && unit !== 0) out += String.fromCharCode(unit);
  }
  return out;
}

/** Increments the last code point of `text`, for a bfrange continuation. */
function shiftLastCodePoint(text: string, delta: number): string {
  if (delta === 0 || text.length === 0) return text;
  const head = text.slice(0, -1);
  return head + String.fromCharCode(text.charCodeAt(text.length - 1) + delta);
}

/**
 * Builds the font table for one page's resource dictionary.
 *
 * `/Font` is usually an inline dictionary of references, but may itself be a
 * reference; both are resolved. A font without a usable CMap is kept, marked,
 * so the decoder falls back to WinAnsi rather than dropping the text.
 */
function buildFontTable(
  objects: Map<number, PdfObject>,
  resources: string | null,
): FontTable {
  const table: FontTable = new Map();
  if (!resources) return table;

  let fontDictionary = '';
  const inline = /\/Font\s*<<([\s\S]*?)>>/.exec(resources);
  if (inline) {
    fontDictionary = inline[1];
  } else {
    const referenced = resolveRef(objects, resources, 'Font');
    if (referenced) fontDictionary = referenced;
  }
  if (!fontDictionary) return table;

  for (const [name, reference] of readEntries(fontDictionary)) {
    const fontNumber = refNumber(reference);
    const fontBody = fontNumber === null ? null : objects.get(fontNumber)?.body ?? null;
    if (!fontBody) {
      table.set(name, EMPTY_FONT);
      continue;
    }

    const isComposite = /\/Subtype\s*\/Type0/.test(fontBody);
    const cmapBody = resolveRef(objects, fontBody, 'ToUnicode');
    const decoded = cmapBody ? decodeStream(cmapBody) : null;

    if (decoded) {
      const { map, bytesPerCode } = parseToUnicodeCMap(decoded.toString('latin1'));
      table.set(name, {
        bytesPerCode: isComposite ? 2 : bytesPerCode,
        map,
        hasCMap: map.size > 0,
      });
    } else {
      table.set(name, { bytesPerCode: isComposite ? 2 : 1, map: new Map(), hasCMap: false });
    }
  }

  return table;
}

/** Decodes the bytes of one PDF string using the active font. */
function decodeTextString(bytes: Buffer, font: FontInfo): string {
  let out = '';

  if (font.bytesPerCode === 2) {
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      const mapped = font.map.get(code);
      // Without a CMap an Identity-H code is a glyph index, not a character:
      // emitting latin-1 would invent text that is not on the page.
      out += mapped ?? (code < 0x20 ? ' ' : '');
    }
    return out;
  }

  for (const byte of bytes) {
    const mapped = font.map.get(byte);
    out += mapped ?? decodeWinAnsi(byte);
  }
  return out;
}

function isWhitespace(byte: number): boolean {
  return byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09 || byte === 0x0c || byte === 0x00;
}

/** Reads a `( … )` literal string starting at `start` (which points at `(`). */
function readLiteralString(content: string, start: number): { bytes: Buffer; next: number } {
  const out: number[] = [];
  let depth = 1;
  let i = start + 1;

  while (i < content.length) {
    const char = content[i];

    if (char === '\\') {
      const next = content[i + 1];
      if (next === undefined) break;
      if (next === 'n') { out.push(0x0a); i += 2; continue; }
      if (next === 'r') { out.push(0x0d); i += 2; continue; }
      if (next === 't') { out.push(0x09); i += 2; continue; }
      if (next === 'b') { out.push(0x08); i += 2; continue; }
      if (next === 'f') { out.push(0x0c); i += 2; continue; }
      if (next === '(' || next === ')' || next === '\\') { out.push(next.charCodeAt(0)); i += 2; continue; }
      if (next === '\r') { i += content[i + 2] === '\n' ? 3 : 2; continue; }
      if (next === '\n') { i += 2; continue; }
      const octal = /^[0-7]{1,3}/.exec(content.slice(i + 1, i + 4));
      if (octal) {
        out.push(parseInt(octal[0], 8) & 0xff);
        i += 1 + octal[0].length;
        continue;
      }
      out.push(next.charCodeAt(0));
      i += 2;
      continue;
    }

    if (char === '(') { depth += 1; out.push(0x28); i += 1; continue; }
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return { bytes: Buffer.from(out), next: i + 1 };
      out.push(0x29);
      i += 1;
      continue;
    }

    out.push(char.charCodeAt(0) & 0xff);
    i += 1;
  }

  return { bytes: Buffer.from(out), next: i };
}

/** Reads a `< … >` hex string starting at `start` (which points at `<`). */
function readHexString(content: string, start: number): { bytes: Buffer; next: number } {
  const end = content.indexOf('>', start + 1);
  if (end < 0) return { bytes: Buffer.alloc(0), next: content.length };
  const hex = content.slice(start + 1, end).replace(/[^0-9A-Fa-f]/g, '');
  const even = hex.length % 2 === 0 ? hex : `${hex}0`;
  return { bytes: Buffer.from(even, 'hex'), next: end + 1 };
}

/** Tokens that can appear in a content stream where we care about them. */
interface Operand {
  kind: 'name' | 'string' | 'number';
  text: string;
  bytes?: Buffer;
}

/**
 * Walks a content stream and returns the text it paints.
 *
 * Line breaks follow the positioning operators rather than the raw layout: a
 * `Td`/`TD`/`T*`/`Tm` starts a new line, and a `TJ` array inserts nothing
 * between its parts unless a large negative kern asks for a space. That is
 * enough to keep `101. Rémunération brute … 76 800,00` on one line, which is
 * what the field parser needs.
 */
function extractContentText(content: string, fonts: FontTable): string {
  let out = '';
  let currentFont: FontInfo = EMPTY_FONT;
  const operands: Operand[] = [];
  let i = 0;

  const newline = (): void => {
    if (out.length > 0 && !out.endsWith('\n')) out += '\n';
  };

  const showString = (bytes: Buffer | undefined): void => {
    if (!bytes) return;
    out += decodeTextString(bytes, currentFont);
  };

  while (i < content.length) {
    const char = content[i];

    if (isWhitespace(char.charCodeAt(0))) { i += 1; continue; }

    if (char === '%') {
      const eol = content.indexOf('\n', i);
      i = eol < 0 ? content.length : eol + 1;
      continue;
    }

    if (char === '(') {
      const { bytes, next } = readLiteralString(content, i);
      operands.push({ kind: 'string', text: '', bytes });
      i = next;
      continue;
    }

    if (char === '<') {
      if (content[i + 1] === '<') {
        // An inline dictionary (a marked-content property list). Skip it whole;
        // its strings are metadata, not page text.
        let depth = 0;
        let j = i;
        while (j < content.length) {
          if (content[j] === '<' && content[j + 1] === '<') { depth += 1; j += 2; continue; }
          if (content[j] === '>' && content[j + 1] === '>') {
            depth -= 1;
            j += 2;
            if (depth === 0) break;
            continue;
          }
          j += 1;
        }
        i = j;
        continue;
      }
      const { bytes, next } = readHexString(content, i);
      operands.push({ kind: 'string', text: '', bytes });
      i = next;
      continue;
    }

    if (char === '[' || char === ']') {
      // Arrays matter only as a grouping for TJ; the operands inside are
      // already collected, so the bracket itself needs no representation.
      operands.push({ kind: 'name', text: char });
      i += 1;
      continue;
    }

    if (char === '/') {
      let j = i + 1;
      while (j < content.length && !/[\s/<>[\]()]/.test(content[j])) j += 1;
      operands.push({ kind: 'name', text: content.slice(i + 1, j) });
      i = j;
      continue;
    }

    if (char === '-' || char === '+' || char === '.' || (char >= '0' && char <= '9')) {
      let j = i;
      while (j < content.length && /[-+.\d]/.test(content[j])) j += 1;
      operands.push({ kind: 'number', text: content.slice(i, j) });
      i = j;
      continue;
    }

    // Keyword
    let j = i;
    while (j < content.length && !/[\s/<>[\]()%]/.test(content[j])) j += 1;
    const operator = content.slice(i, j);
    i = j;

    switch (operator) {
      case 'Tf': {
        const name = [...operands].reverse().find((operand) => operand.kind === 'name' && operand.text.length > 1);
        currentFont = (name && fonts.get(name.text)) || EMPTY_FONT;
        break;
      }
      case 'Tj':
      case "'":
      case '"': {
        if (operator !== 'Tj') newline();
        const string = [...operands].reverse().find((operand) => operand.kind === 'string');
        showString(string?.bytes);
        break;
      }
      case 'TJ': {
        for (const operand of operands) {
          if (operand.kind !== 'string') {
            // A kern larger than ~200/1000 em usually separates words.
            if (operand.kind === 'number' && Number(operand.text) < -200) out += ' ';
            continue;
          }
          showString(operand.bytes);
        }
        break;
      }
      case 'Td':
      case 'TD':
      case 'T*':
      case 'Tm':
        newline();
        break;
      case 'ET':
        newline();
        break;
      default:
        break;
    }

    operands.length = 0;
  }

  return out;
}

/** Normalises the raw extraction: CRLF, collapsed runs of spaces, no empty lines. */
function normaliseText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter((line, index, all) => line.length > 0 || (index > 0 && all[index - 1].length > 0))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Collects page object numbers by walking the page tree; falls back to scan order. */
export function collectPageNumbers(objects: Map<number, PdfObject>): number[] {
  const catalog = [...objects.values()].find((object) => /\/Type\s*\/Catalog/.test(object.body));
  const pagesRef = catalog ? refNumber(readEntries(catalog.body).get('Pages')) : null;
  const ordered: number[] = [];
  const seen = new Set<number>();

  const walk = (number: number | null, depth: number): void => {
    if (number === null || depth > 32 || seen.has(number)) return;
    seen.add(number);
    const object = objects.get(number);
    if (!object) return;

    if (/\/Type\s*\/Page(?![a-zA-Z])/.test(object.body)) {
      ordered.push(number);
      return;
    }

    const kids = /\/Kids\s*\[([\s\S]*?)\]/.exec(object.body);
    if (!kids) return;
    const references = kids[1].match(/\d+\s+\d+\s+R/g) ?? [];
    for (const reference of references) walk(refNumber(reference), depth + 1);
  };

  walk(pagesRef, 0);

  if (ordered.length > 0) return ordered;

  return [...objects.values()]
    .filter((object) => /\/Type\s*\/Page(?![a-zA-Z])/.test(object.body))
    .map((object) => object.num);
}

/** `/Resources` on the page, or the nearest ancestor that defines one. */
export function pageResources(
  objects: Map<number, PdfObject>,
  pageBody: string,
): string | null {
  if (/\/Resources\s*<</.test(pageBody)) {
    const match = /\/Resources\s*<<[\s\S]*/.exec(pageBody);
    return match ? match[0] : null;
  }

  const direct = resolveRef(objects, pageBody, 'Resources');
  if (direct) return direct;

  // Inherited from the page tree: follow /Parent a bounded number of times.
  let current = pageBody;
  for (let depth = 0; depth < 8; depth += 1) {
    const parentRef = refNumber(readEntries(current).get('Parent'));
    if (parentRef === null) return null;
    const parent = objects.get(parentRef);
    if (!parent) return null;
    const resources = /\/Resources\s*<</.test(parent.body)
      ? (/\/Resources\s*<<[\s\S]*/.exec(parent.body)?.[0] ?? null)
      : resolveRef(objects, parent.body, 'Resources');
    if (resources) return resources;
    current = parent.body;
  }

  return null;
}

/** Content stream bodies of a page, in draw order. */
function pageContentStreams(objects: Map<number, PdfObject>, pageBody: string): string[] {
  const contents = /\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(pageBody);
  if (!contents) return [];

  const references = contents[1].match(/\d+\s+\d+\s+R/g) ?? [];
  return references
    .map((reference) => {
      const number = refNumber(reference);
      return number === null ? null : objects.get(number)?.body ?? null;
    })
    .filter((body): body is string => body !== null);
}

/**
 * Reads the text layer of a PDF.
 *
 * Never throws on malformed input: a truncated or hostile file yields whatever
 * could be recovered plus zeroed counters, because an upload that fails here
 * must still reach the "needs OCR / enter manually" state rather than a 500.
 */
export function extractPdfText(buffer: Buffer): PdfTextResult {
  const empty: PdfTextResult = {
    text: '',
    pages: [],
    pageCount: 0,
    encrypted: false,
    streamsDecoded: 0,
    streamsSkipped: 0,
    fontsWithCMap: 0,
    fontsWithoutCMap: 0,
  };

  if (!buffer || buffer.length === 0) return empty;

  const src = buffer.toString('latin1');
  if (!src.startsWith('%PDF')) return empty;

  const encrypted = /\/Encrypt\s+\d+\s+\d+\s+R/.test(src);
  const objects = indexObjects(src);
  // Twice: an object stream may itself be referenced by an object stream.
  indexObjectStreams(objects);
  indexObjectStreams(objects);
  const pageNumbers = collectPageNumbers(objects);
  const pages: string[] = [];
  let streamsDecoded = 0;
  let streamsSkipped = 0;
  let fontsWithCMap = 0;
  let fontsWithoutCMap = 0;

  for (const pageNumber of pageNumbers) {
    const page = objects.get(pageNumber);
    if (!page) continue;

    const resources = pageResources(objects, page.body);
    const fonts = buildFontTable(objects, resources);
    for (const font of fonts.values()) {
      if (font.hasCMap) fontsWithCMap += 1;
      else fontsWithoutCMap += 1;
    }

    let pageText = '';
    for (const streamObjectBody of pageContentStreams(objects, page.body)) {
      const decoded = decodeStream(streamObjectBody);
      if (!decoded) {
        streamsSkipped += 1;
        continue;
      }
      streamsDecoded += 1;
      pageText += extractContentText(decoded.toString('latin1'), fonts);
    }

    pages.push(normaliseText(pageText));
  }

  return {
    text: normaliseText(pages.join('\n\n')),
    pages,
    pageCount: pages.length,
    encrypted,
    streamsDecoded,
    streamsSkipped,
    fontsWithCMap,
    fontsWithoutCMap,
  };
}

/**
 * Decides whether extracted text is worth classifying a document from.
 *
 * A scanned certificate yields an empty or a handful of characters; a font
 * whose CMap we could not read yields many characters but few of them letters.
 * Both must fall through to OCR instead of producing a confident wrong type.
 */
export function assessTextQuality(text: string): TextQuality {
  const characters = text.replace(/\s+/g, '').length;
  if (characters === 0) {
    return { characters: 0, printableRatio: 0, looksLikeScan: true };
  }

  let printable = 0;
  for (const char of text) {
    if (/[\p{L}\p{N}\s.,;:!?'"()\[\]€%+\-/&]/u.test(char)) printable += 1;
  }

  const printableRatio = printable / text.length;
  return {
    characters,
    printableRatio,
    looksLikeScan: characters < MIN_TEXT_LAYER_CHARACTERS || printableRatio < MIN_PRINTABLE_RATIO,
  };
}
