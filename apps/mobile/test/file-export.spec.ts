import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  chooseShareRoute,
  DEFAULT_MAX_SHARE_BYTES,
  describeExport,
  extensionForMime,
  mimeForKind,
  sanitizeFileName,
  shareRejectionMessage,
} from '../src/lib/file-export';

describe('Safe file names (MOB-10)', () => {
  test('strips path traversal and separators', () => {
    // a path is reduced to its basename before anything else
    assert.strictEqual(sanitizeFileName('../../etc/passwd'), 'passwd');
    assert.strictEqual(sanitizeFileName('dir/sub/file.pdf'), 'file.pdf');
    assert.strictEqual(sanitizeFileName('C:\\Windows\\system32\\x.pdf'), 'x.pdf');
    assert.ok(!sanitizeFileName('../../etc/passwd').includes('/'));
    assert.ok(!sanitizeFileName('../../etc/passwd').includes('..'));
  });

  test('removes control characters and NUL', () => {
    assert.strictEqual(sanitizeFileName('a\u0000b\u001fc.pdf'), 'abc.pdf');
  });

  test('replaces characters Windows and macOS reject', () => {
    assert.strictEqual(sanitizeFileName('re<po>rt:"1"|2?.pdf'), 're_po_rt__1__2_.pdf');
  });

  test('prefixes reserved device names', () => {
    assert.strictEqual(sanitizeFileName('CON.pdf'), '_CON.pdf');
    assert.strictEqual(sanitizeFileName('lpt1.txt'), '_lpt1.txt');
    assert.strictEqual(sanitizeFileName('console.pdf'), 'console.pdf');
  });

  test('strips leading dots and trailing spaces', () => {
    assert.strictEqual(sanitizeFileName('.hidden.pdf'), 'hidden.pdf');
    assert.strictEqual(sanitizeFileName('name   .pdf'), 'name.pdf');
  });

  test('keeps a sanitised extension and lowercases it', () => {
    assert.strictEqual(sanitizeFileName('Report.PDF'), 'Report.pdf');
    // the extension is reduced to alphanumerics, so a space disappears
    assert.strictEqual(sanitizeFileName('x.e xe'), 'x.exe');
  });

  test('falls back when nothing usable remains', () => {
    assert.strictEqual(sanitizeFileName('...'), 'document');
    assert.strictEqual(sanitizeFileName('', 'receipt'), 'receipt');
    assert.strictEqual(sanitizeFileName('   '), 'document');
  });

  test('bounds the total length and keeps the extension', () => {
    const long = `${'a'.repeat(400)}.pdf`;
    const result = sanitizeFileName(long);
    assert.ok(result.length <= 120, `length ${result.length}`);
    assert.ok(result.endsWith('.pdf'));
  });
});

describe('Export descriptors (MOB-10)', () => {
  test('the annex is always a PDF with Apple UTI com.adobe.pdf', () => {
    const descriptor = describeExport('ANNEX_PDF', 'luxtax-annexes-2025', { hashPrefix: 'abcdef0123' });
    assert.deepStrictEqual(descriptor, {
      fileName: 'luxtax-annexes-2025-abcdef01.pdf',
      mimeType: 'application/pdf',
      uti: 'com.adobe.pdf',
    });
    assert.strictEqual(mimeForKind('ANNEX_PDF'), 'application/pdf');
  });

  test('a receipt is JPEG', () => {
    const descriptor = describeExport('RECEIPT_IMAGE', 'scan 001');
    assert.strictEqual(descriptor.fileName, 'scan 001.jpg');
    assert.strictEqual(descriptor.mimeType, 'image/jpeg');
    assert.strictEqual(descriptor.uti, 'public.jpeg');
  });

  test('a double extension cannot masquerade as another type', () => {
    const descriptor = describeExport('ANNEX_PDF', 'invoice.pdf.exe');
    assert.strictEqual(descriptor.fileName, 'invoice.pdf.pdf');
    assert.strictEqual(descriptor.mimeType, 'application/pdf');
  });

  test('a hostile base name is sanitised before use', () => {
    const descriptor = describeExport('ANNEX_PDF', '../../etc/passwd');
    assert.ok(!descriptor.fileName.includes('/'));
    assert.ok(!descriptor.fileName.includes('..'));
    assert.ok(descriptor.fileName.endsWith('.pdf'));
  });

  test('the hash suffix is alphanumeric only', () => {
    const descriptor = describeExport('ANNEX_PDF', 'annexes', { hashPrefix: '../a b/c' });
    assert.strictEqual(descriptor.fileName, 'annexes-abc.pdf');
  });

  test('extension lookup round-trips known types and defaults to bin', () => {
    assert.strictEqual(extensionForMime('application/pdf'), 'pdf');
    assert.strictEqual(extensionForMime('application/pdf; charset=binary'), 'pdf');
    assert.strictEqual(extensionForMime('image/jpeg'), 'jpg');
    assert.strictEqual(extensionForMime('image/png'), 'png');
    assert.strictEqual(extensionForMime('application/x-unknown'), 'bin');
    assert.strictEqual(extensionForMime(''), 'bin');
  });
});

describe('Share policy (MOB-10)', () => {
  test('prefers the share sheet when available on either platform', () => {
    assert.strictEqual(
      chooseShareRoute({ platform: 'ios', hasShareSheet: true, fileSizeBytes: 1_000 }),
      'SHARE_SHEET',
    );
    assert.strictEqual(
      chooseShareRoute({ platform: 'android', hasShareSheet: true, fileSizeBytes: 1_000 }),
      'SHARE_SHEET',
    );
  });

  test('falls back to writing the file when there is no share sheet', () => {
    assert.strictEqual(
      chooseShareRoute({ platform: 'android', hasShareSheet: false, fileSizeBytes: 1_000 }),
      'SAVE_TO_FILES',
    );
  });

  test('rejects files above the cap instead of failing silently', () => {
    assert.strictEqual(
      chooseShareRoute({ platform: 'ios', hasShareSheet: true, fileSizeBytes: DEFAULT_MAX_SHARE_BYTES + 1 }),
      'REJECT_TOO_LARGE',
    );
    assert.strictEqual(
      chooseShareRoute({ platform: 'ios', hasShareSheet: true, fileSizeBytes: DEFAULT_MAX_SHARE_BYTES }),
      'SHARE_SHEET',
    );
  });

  test('rejects nonsensical sizes', () => {
    assert.strictEqual(chooseShareRoute({ platform: 'ios', hasShareSheet: true, fileSizeBytes: -1 }), 'REJECT_TOO_LARGE');
    assert.strictEqual(
      chooseShareRoute({ platform: 'ios', hasShareSheet: true, fileSizeBytes: Number.NaN }),
      'REJECT_TOO_LARGE',
    );
  });

  test('honours a caller-supplied cap', () => {
    assert.strictEqual(
      chooseShareRoute({ platform: 'ios', hasShareSheet: true, fileSizeBytes: 2_000, maxBytes: 1_000 }),
      'REJECT_TOO_LARGE',
    );
  });

  test('the rejection message states the size and the alternative', () => {
    const message = shareRejectionMessage(30 * 1024 * 1024);
    assert.match(message, /30\.0 MB/);
    assert.match(message, /25 MB/);
    assert.match(message, /web app/);
  });
});
