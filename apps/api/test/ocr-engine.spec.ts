import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  OCR_BINARY_ENV,
  TesseractCliOcrEngine,
  normaliseOcrText,
  resolveTesseractPath,
  type CommandRunner,
} from '../src/modules/documents/ocr/ocr-engine';

/**
 * The adapter's contract with the Tesseract CLI.
 *
 * A real binary is not required to prove the parts that have caused failures in
 * practice: which arguments are passed, what happens when the binary is absent,
 * and whether a crash is distinguishable from "no text". The process boundary is
 * injected, so these assertions are about this code rather than about the host.
 */

let workspace: string;
const originalEnv = { ...process.env };

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'ocr-spec-'));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
  process.env = { ...originalEnv };
});

/** A file that exists, standing in for the executable. */
function fakeBinary(): string {
  const path = join(workspace, 'tesseract.exe');
  writeFileSync(path, 'not a real binary');
  return path;
}

/** Records the call and writes the `.txt` the CLI would have produced. */
function runnerWriting(
  text: string,
  calls: Array<{ args: readonly string[]; inputExisted?: boolean }>,
): CommandRunner {
  return async (_command, args) => {
    calls.push({ args, inputExisted: existsSync(args[0]) });
    writeFileSync(`${args[1]}.txt`, text);
    return { code: 0, stderr: '' };
  };
}

describe('resolveTesseractPath', () => {
  test('an unset variable explains what to set', () => {
    const resolved = resolveTesseractPath({});
    assert.equal(resolved.path, null);
    assert.match(resolved.reason ?? '', new RegExp(OCR_BINARY_ENV));
  });

  test('a path that does not exist is rejected, not passed to the shell', () => {
    const resolved = resolveTesseractPath({ [OCR_BINARY_ENV]: join(workspace, 'missing.exe') });
    assert.equal(resolved.path, null);
    assert.match(resolved.reason ?? '', /does not exist/);
  });

  test('an existing binary is resolved to an absolute path', () => {
    const resolved = resolveTesseractPath({ [OCR_BINARY_ENV]: fakeBinary() });
    assert.ok(resolved.path);
    assert.equal(resolved.reason, null);
  });
});

describe('TesseractCliOcrEngine', () => {
  test('reports NOT_CONFIGURED without spawning anything', async () => {
    let spawned = false;
    const engine = new TesseractCliOcrEngine({
      binaryPath: null,
      runner: async () => {
        spawned = true;
        return { code: 0, stderr: '' };
      },
    });

    const result = await engine.recognize(Buffer.from('image'), 'image/png');
    assert.equal(result.status, 'NOT_CONFIGURED');
    assert.equal(spawned, false);
    assert.match(result.reason ?? '', new RegExp(OCR_BINARY_ENV));
  });

  test('a configured path that has disappeared is NOT_CONFIGURED, not FAILED', async () => {
    process.env[OCR_BINARY_ENV] = join(workspace, 'gone.exe');
    const result = await new TesseractCliOcrEngine().recognize(Buffer.from('image'), 'image/png');
    assert.equal(result.status, 'NOT_CONFIGURED');
  });

  test('passes the French model and PSM 6, and hands over the real bytes', async () => {
    const calls: Array<{ args: readonly string[]; inputExisted: boolean }> = [];
    const engine = new TesseractCliOcrEngine({
      binaryPath: fakeBinary(),
      runner: runnerWriting('CERTIFICAT DE REMUNERATION\n101. 76800.00 EUR', calls),
    });

    const result = await engine.recognize(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png');

    assert.equal(result.status, 'TEXT');
    assert.match(result.text, /CERTIFICAT/);
    assert.equal(calls.length, 1);

    const { args, inputExisted } = calls[0];
    assert.equal(inputExisted, true, 'the image must be on disk before the process starts');
    assert.deepEqual(args.slice(2), ['-l', 'fra', '--psm', '6']);
    assert.match(args[0], /page\.png$/, 'the input keeps an extension Tesseract recognises');
  });

  test('honours OCR_LANGUAGES and OCR_PSM', async () => {
    process.env.OCR_LANGUAGES = 'fra+deu';
    process.env.OCR_PSM = '4';
    const calls: Array<{ args: readonly string[] }> = [];
    const engine = new TesseractCliOcrEngine({ binaryPath: fakeBinary(), runner: runnerWriting('x y z', calls) });

    await engine.recognize(Buffer.from('irrelevant-but-not-empty'), 'image/jpeg');

    assert.deepEqual(calls[0].args.slice(2), ['-l', 'fra+deu', '--psm', '4']);
    assert.match(calls[0].args[0], /page\.jpg$/);
  });

  test('an empty result is EMPTY, not TEXT with whitespace', async () => {
    const engine = new TesseractCliOcrEngine({
      binaryPath: fakeBinary(),
      runner: runnerWriting('  \n\n \t \n', []),
    });
    const result = await engine.recognize(Buffer.from('x'), 'image/png');
    assert.equal(result.status, 'EMPTY');
    assert.equal(result.text, '');
  });

  test('a non-zero exit is a failure that carries the reason', async () => {
    const engine = new TesseractCliOcrEngine({
      binaryPath: fakeBinary(),
      runner: async () => ({ code: 2, stderr: 'Error, cannot read input file' }),
    });

    const result = await engine.recognize(Buffer.from('x'), 'image/png');
    assert.equal(result.status, 'FAILED');
    assert.match(result.reason ?? '', /exit 2/);
    assert.match(result.reason ?? '', /cannot read input file/);
  });

  test('a timeout is a failure, not a silent empty document', async () => {
    const engine = new TesseractCliOcrEngine({
      binaryPath: fakeBinary(),
      runner: async () => {
        throw new Error('OCR timed out after 30000 ms');
      },
    });

    const result = await engine.recognize(Buffer.from('x'), 'image/png');
    assert.equal(result.status, 'FAILED');
    assert.match(result.reason ?? '', /timed out/);
  });

  test('a successful run leaves no temporary directory behind', async () => {
    const calls: Array<{ args: readonly string[] }> = [];
    const engine = new TesseractCliOcrEngine({
      binaryPath: fakeBinary(),
      tmpRoot: workspace,
      runner: runnerWriting('some text', calls),
    });

    await engine.recognize(Buffer.from('x'), 'image/png');

    const workDirectory = calls[0].args[0].replace(/[\\/]page\.png$/, '');
    assert.equal(existsSync(workDirectory), false, 'the work directory must be removed');
  });
});

describe('OCR text normalisation', () => {
  test('collapses the padding Tesseract prints and drops page breaks', () => {
    const raw = 'CERTIFICAT DE REMUNERATION\r\n101.   Remuneration brute     76800.00 EUR\r\n\f\r\n103.   9000.00 EUR\r\n';
    assert.equal(
      normaliseOcrText(raw),
      'CERTIFICAT DE REMUNERATION\n101. Remuneration brute 76800.00 EUR\n103. 9000.00 EUR',
    );
  });
});
