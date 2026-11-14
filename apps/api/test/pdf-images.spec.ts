import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { extractPdfPageImages } from '../src/modules/documents/text/pdf-images';
import { workspaceFile } from './support/workspace-file';

/**
 * Pulling the page picture out of a scan-to-PDF.
 *
 * A scanner writes one image per page and no text layer. Reading that image is
 * what lets a scanned certificate reach OCR without a PDF renderer; these tests
 * pin the formats a scanner actually produces, and the ones it does not.
 */

const scanned = (): Buffer => workspaceFile('apps/api/test/fixtures/receipt-scanned.pdf');

/** Builds a one-page PDF whose content is a single image XObject. */
function pdfWithImage(dictionary: string, stream: Buffer): Buffer {
  const content = 'q 200 0 0 200 0 0 cm /Im0 Do Q';
  const head = Buffer.from(
    [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >> endobj',
      `4 0 obj << /Length ${content.length} >> stream`,
      content,
      'endstream endobj',
    ].join('\n') + '\n',
    'latin1',
  );
  const imageHead = Buffer.from(`5 0 obj << ${dictionary} /Length ${stream.length} >> stream\n`, 'latin1');
  const tail = Buffer.from('\nendstream endobj\ntrailer << /Root 1 0 R >>\n%%EOF', 'latin1');
  return Buffer.concat([head, imageHead, stream, tail]);
}

describe('page images of a scanned PDF', () => {
  test('a scan-to-PDF yields its JPEG page image, untouched', () => {
    const images = extractPdfPageImages(scanned());

    assert.equal(images.length, 1);
    assert.equal(images[0].pageIndex, 0);
    assert.equal(images[0].mimeType, 'image/jpeg');
    assert.equal(images[0].width, 1240);
    assert.equal(images[0].height, 760);

    // Passed through, not re-encoded: a JPEG starts with FFD8 and a scan loses
    // accuracy every time it is decoded and compressed again.
    assert.equal(images[0].data.subarray(0, 2).toString('hex'), 'ffd8');
    assert.ok(images[0].data.length > 50_000);
  });

  test('a vector PDF contributes no page images', () => {
    // The official Form 100 is drawn, not scanned: there is nothing to OCR, and
    // the text layer is the right source.
    assert.deepEqual(extractPdfPageImages(workspaceFile('100f-2025.pdf')), []);
  });

  test('a Flate-compressed RGB image is wrapped in a readable PNG', () => {
    const width = 200;
    const height = 200;
    const pixels = Buffer.alloc(width * height * 3, 0x7f);

    const pdf = pdfWithImage(
      '/Type /XObject /Subtype /Image /Width 200 /Height 200 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode',
      deflateSync(pixels),
    );

    const images = extractPdfPageImages(pdf);
    assert.equal(images.length, 1);
    assert.equal(images[0].mimeType, 'image/png');

    // PNG signature, then IHDR width/height — enough to prove the wrapper is real.
    assert.equal(images[0].data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(images[0].data.readUInt32BE(16), width);
    assert.equal(images[0].data.readUInt32BE(20), height);
  });

  test('a greyscale image reports one channel, not three', () => {
    const width = 200;
    const height = 200;
    const pdf = pdfWithImage(
      '/Type /XObject /Subtype /Image /Width 200 /Height 200 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode',
      deflateSync(Buffer.alloc(width * height, 0x40)),
    );

    const images = extractPdfPageImages(pdf);
    assert.equal(images.length, 1);
    // Colour type 0 (greyscale) sits in the IHDR at byte 25.
    assert.equal(images[0].data.readUInt8(25), 0);
  });

  test('a predictor is refused rather than decoded into wrong pixels', () => {
    const pdf = pdfWithImage(
      '/Type /XObject /Subtype /Image /Width 200 /Height 200 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 200 >>',
      deflateSync(Buffer.alloc(200 * 200 * 3)),
    );

    assert.deepEqual(extractPdfPageImages(pdf), []);
  });

  test('an unsupported filter (JPEG 2000, CCITT) is skipped, not guessed at', () => {
    const pdf = pdfWithImage(
      '/Type /XObject /Subtype /Image /Width 200 /Height 200 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /JPXDecode',
      Buffer.alloc(4096),
    );

    assert.deepEqual(extractPdfPageImages(pdf), []);
  });

  test('a logo is too small to be the page content', () => {
    const pdf = pdfWithImage(
      '/Type /XObject /Subtype /Image /Width 40 /Height 40 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode',
      deflateSync(Buffer.alloc(40 * 40 * 3)),
    );

    assert.deepEqual(extractPdfPageImages(pdf), []);
  });

  test('anything that is not a PDF yields no images instead of throwing', () => {
    for (const input of [Buffer.alloc(0), Buffer.from('not a pdf'), Buffer.from([0xff, 0xd8, 0xff, 0xe0])]) {
      assert.deepEqual(extractPdfPageImages(input), []);
    }
  });
});
