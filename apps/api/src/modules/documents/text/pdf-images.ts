/**
 * DA-10: page images out of a PDF, so a scanned certificate can reach OCR.
 *
 * A scan-to-PDF is almost always a wrapper around one picture per page: a
 * `/Subtype /Image` XObject that holds the JPEG the scanner produced. Reading
 * that image is not a full PDF renderer — it cannot rasterise a vector page —
 * but it is exactly the case a taxpayer produces, and it needs no native
 * dependency.
 */
import { deflateSync } from 'node:zlib';
import {
  collectPageNumbers,
  decodeStream,
  indexObjectStreams,
  indexObjects,
  pageResources,
  readEntries,
  refNumber,
  resolveRef,
  streamBody,
} from './pdf-text';

export interface PdfPageImage {
  /** Zero-based page number the image belongs to. */
  pageIndex: number;
  mimeType: 'image/jpeg' | 'image/png';
  data: Buffer;
  width: number;
  height: number;
}

/** Images smaller than this are logos and rules, not the page content. */
const MIN_IMAGE_EDGE = 200;

/** A ceiling on the pixels decoded from one upload, to bound memory and OCR time. */
const MAX_TOTAL_PIXELS = 60_000_000;

const CRC_TABLE = ((): Int32Array => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let k = 0; k < 8; k += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/**
 * Wraps 8-bit samples in a PNG.
 *
 * Tesseract reads PNG, and writing one is a header, a deflate and two CRCs —
 * cheaper than teaching the OCR adapter about raw formats, and lossless, which
 * matters when the input is a scan.
 */
export function encodePng(width: number, height: number, channels: 1 | 3, pixels: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(channels === 1 ? 0 : 2, 9); // colour type: grey / truecolour
  header.writeUInt8(0, 10); // deflate
  header.writeUInt8(0, 11); // adaptive filtering
  header.writeUInt8(0, 12); // no interlace

  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    raw[row * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Reads one numeric entry (`/Width 1240`) from an object dictionary. */
function dictNumber(dictionary: string, key: string): number | null {
  const match = new RegExp(`/${key}\\s+(\\d+)`).exec(dictionary);
  return match ? Number(match[1]) : null;
}

function dictName(dictionary: string, key: string): string | null {
  const match = new RegExp(`/${key}\\s*/([A-Za-z0-9]+)`).exec(dictionary);
  return match ? match[1] : null;
}

/**
 * Turns one image XObject into something Tesseract can read.
 *
 * DCTDecode streams *are* JPEG files, so they are passed through untouched — no
 * recompression, no quality loss. FlateDecode samples are wrapped in a PNG. Any
 * other filter (JPX, CCITT, JBIG2) or a colour space this does not handle is
 * reported as unsupported rather than guessed at.
 */
function decodeImageXObject(body: string): { mimeType: 'image/jpeg' | 'image/png'; data: Buffer } | null {
  const stream = streamBody(body);
  if (!stream) return null;

  const { dictionary, raw } = stream;
  const width = dictNumber(dictionary, 'Width');
  const height = dictNumber(dictionary, 'Height');
  if (!width || !height) return null;

  const filter = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dictionary)?.[1] ?? '';

  if (/DCTDecode/.test(filter)) {
    return raw.length > 0 ? { mimeType: 'image/jpeg', data: raw } : null;
  }

  if (/FlateDecode/.test(filter)) {
    // A predictor changes the byte layout; without un-predicting it the pixels
    // would be silently wrong, so such an image is left to the vision model.
    if (/\/Predictor\s+([2-9]|1[0-5])/.test(dictionary)) return null;

    const bits = dictNumber(dictionary, 'BitsPerComponent') ?? 8;
    if (bits !== 8) return null;

    const colourSpace = dictName(dictionary, 'ColorSpace');
    const channels = colourSpace === 'DeviceGray' ? 1 : colourSpace === 'DeviceRGB' ? 3 : null;
    if (channels === null) return null;

    const pixels = decodeStream(body);
    if (!pixels) return null;
    if (pixels.length < width * height * channels) return null;

    return {
      mimeType: 'image/png',
      data: encodePng(width, height, channels, pixels),
    };
  }

  return null;
}

/**
 * The page-sized images of a PDF, one per page at most.
 *
 * A scan often carries a full-page image plus a small logo; the largest image on
 * the page is the content. Pages are returned in order and capped, because OCR
 * time is linear in pages.
 */
export function extractPdfPageImages(
  buffer: Buffer,
  options: { maxPages?: number } = {},
): PdfPageImage[] {
  if (!buffer || buffer.length === 0) return [];

  const src = buffer.toString('latin1');
  if (!src.startsWith('%PDF')) return [];

  const objects = indexObjects(src);
  indexObjectStreams(objects);
  indexObjectStreams(objects);

  const pageNumbers = collectPageNumbers(objects);
  const maxPages = options.maxPages ?? 10;
  const images: PdfPageImage[] = [];
  let totalPixels = 0;

  for (let pageIndex = 0; pageIndex < pageNumbers.length && pageIndex < maxPages; pageIndex += 1) {
    const page = objects.get(pageNumbers[pageIndex]);
    if (!page) continue;

    const resources = pageResources(objects, page.body);
    if (!resources) continue;

    const xObjects = /\/XObject\s*<<([\s\S]*?)>>/.exec(resources)?.[1] ?? resolveRef(objects, resources, 'XObject');
    if (!xObjects) continue;

    let best: PdfPageImage | null = null;

    for (const [, reference] of readEntries(xObjects)) {
      const number = refNumber(reference);
      const body = number === null ? null : objects.get(number)?.body ?? null;
      if (!body || !/\/Subtype\s*\/Image/.test(body)) continue;

      const width = dictNumber(body, 'Width') ?? 0;
      const height = dictNumber(body, 'Height') ?? 0;
      if (width < MIN_IMAGE_EDGE || height < MIN_IMAGE_EDGE) continue;

      const decoded = decodeImageXObject(body);
      if (!decoded) continue;

      const candidate: PdfPageImage = { pageIndex, ...decoded, width, height };
      if (!best || width * height > best.width * best.height) best = candidate;
    }

    if (!best) continue;

    totalPixels += best.width * best.height;
    if (totalPixels > MAX_TOTAL_PIXELS) break;
    images.push(best);
  }

  return images;
}
