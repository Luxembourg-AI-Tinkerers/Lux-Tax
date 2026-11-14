import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * In-process OCR.
 *
 * The vision-model path needs an endpoint somebody has to register; a taxpayer
 * photographing a receipt should not depend on that. This port lets the upload
 * pipeline read pixels locally, and states plainly when it cannot.
 *
 * The shipped adapter drives the Tesseract CLI. It is a separate process, but it
 * runs in the same request: no upload leaves the machine, no network call, and
 * the result arrives before the response does. `OCR_TESSERACT_PATH` selects the
 * binary — an unset or wrong value is reported as `NOT_CONFIGURED` rather than
 * being mistaken for "the document has no amounts".
 */

export type OcrStatus = 'TEXT' | 'EMPTY' | 'NOT_CONFIGURED' | 'FAILED';

export interface OcrResult {
  status: OcrStatus;
  text: string;
  /** Which engine answered, for the extraction provenance. */
  engine: string;
  /** Why there is no text, phrased for an operator or the user. */
  reason: string | null;
}

export interface OcrEngine {
  readonly name: string;
  recognize(image: Buffer, mimeType: string): Promise<OcrResult>;
}

/** Minimal child-process surface, injectable so the adapter is testable. */
export interface CommandRunner {
  (
    command: string,
    args: readonly string[],
    options: { timeoutMs: number },
  ): Promise<{ code: number; stderr: string }>;
}

export interface TesseractCliOptions {
  /** Defaults to `OCR_TESSERACT_PATH`. */
  binaryPath?: string | null;
  /** Defaults to `OCR_LANGUAGES`, then `fra`. */
  languages?: string;
  /** Defaults to `OCR_PSM`, then `6` (a uniform block of text). */
  pageSegmentationMode?: string;
  timeoutMs?: number;
  /** Directory for the temporary input/output pair; defaults to the OS temp dir. */
  tmpRoot?: string;
  runner?: CommandRunner;
}

/** Env var that points at the binary. Named in every failure message. */
export const OCR_BINARY_ENV = 'OCR_TESSERACT_PATH';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LANGUAGES = 'fra';
const DEFAULT_PSM = '6';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/tiff': '.tif',
  'image/bmp': '.bmp',
};

/** `execFile` with a kill-on-timeout, resolved to an exit code. */
const runCommand: CommandRunner = (command, args, options) =>
  new Promise((resolvePromise, rejectPromise) => {
    execFile(
      command,
      [...args],
      { timeout: options.timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (!error) {
          resolvePromise({ code: 0, stderr: stderr ?? '' });
          return;
        }
        // `execFile` reports a non-zero exit and a timeout both as errors; the
        // distinction matters (a crash is not a slow machine), so the code is
        // read off the error rather than guessed from the message.
        const code = typeof error.code === 'number' ? error.code : error.killed ? 124 : 1;
        if (error.killed) {
          rejectPromise(new Error(`OCR timed out after ${options.timeoutMs} ms`));
          return;
        }
        resolvePromise({ code, stderr: stderr || error.message });
      },
    );
  });

/**
 * Resolves the binary the environment points at.
 *
 * Returns a reason instead of throwing: the caller has to be able to say *why*
 * a document is unreadable, and "the environment is not configured" is a
 * different message from "the OCR run failed".
 */
export function resolveTesseractPath(
  env: NodeJS.ProcessEnv = process.env,
): { path: string | null; reason: string | null } {
  const configured = (env[OCR_BINARY_ENV] ?? '').trim();

  if (configured === '') {
    return {
      path: null,
      reason: `No OCR engine is configured. Set ${OCR_BINARY_ENV} to a Tesseract executable to read scanned documents.`,
    };
  }

  const absolute = resolve(configured);
  if (!existsSync(absolute)) {
    return {
      path: null,
      reason: `${OCR_BINARY_ENV} points at "${configured}", which does not exist.`,
    };
  }

  return { path: absolute, reason: null };
}

/**
 * Tesseract through its command-line interface.
 *
 * `tesseract <input> <outputbase> -l <langs> --psm <n>` writes
 * `<outputbase>.txt`; the file is read and removed with the temporary
 * directory. A single page is enough for a receipt, and PSM 6 assumes a uniform
 * block, which is what a photographed certificate is.
 */
export class TesseractCliOcrEngine implements OcrEngine {
  readonly name = 'tesseract-cli';

  constructor(private readonly options: TesseractCliOptions = {}) {}

  async recognize(image: Buffer, mimeType: string): Promise<OcrResult> {
    const resolvedBinary =
      this.options.binaryPath !== undefined
        ? this.options.binaryPath === null
          ? { path: null, reason: `No OCR engine is configured. Set ${OCR_BINARY_ENV}.` }
          : { path: resolve(this.options.binaryPath), reason: null }
        : resolveTesseractPath();

    if (!resolvedBinary.path) {
      return {
        status: 'NOT_CONFIGURED',
        text: '',
        engine: this.name,
        reason: resolvedBinary.reason,
      };
    }

    if (!existsSync(resolvedBinary.path)) {
      return {
        status: 'NOT_CONFIGURED',
        text: '',
        engine: this.name,
        reason: `${OCR_BINARY_ENV} points at "${resolvedBinary.path}", which does not exist.`,
      };
    }

    const languages = this.options.languages ?? process.env.OCR_LANGUAGES ?? DEFAULT_LANGUAGES;
    const psm = this.options.pageSegmentationMode ?? process.env.OCR_PSM ?? DEFAULT_PSM;
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const runner = this.options.runner ?? runCommand;

    const workDirectory = mkdtempSync(join(this.options.tmpRoot ?? tmpdir(), 'luxtax-ocr-'));
    const inputPath = join(workDirectory, `page${EXTENSION_BY_MIME[mimeType] ?? '.png'}`);
    const outputBase = join(workDirectory, 'ocr');

    try {
      writeFileSync(inputPath, image);

      const { code, stderr } = await runner(
        resolvedBinary.path,
        [inputPath, outputBase, '-l', languages, '--psm', psm],
        { timeoutMs },
      );

      if (code !== 0) {
        return {
          status: 'FAILED',
          text: '',
          engine: this.name,
          reason: `OCR failed (exit ${code}): ${stderr.trim().slice(0, 200)}`,
        };
      }

      const outputPath = `${outputBase}.txt`;
      if (!existsSync(outputPath)) {
        return {
          status: 'FAILED',
          text: '',
          engine: this.name,
          reason: 'OCR produced no output file.',
        };
      }

      const text = normaliseOcrText(readFileSync(outputPath, 'utf8'));
      if (text === '') {
        return {
          status: 'EMPTY',
          text: '',
          engine: this.name,
          reason: 'The OCR engine found no readable text in this image.',
        };
      }

      return { status: 'TEXT', text, engine: this.name, reason: null };
    } catch (error) {
      return {
        status: 'FAILED',
        text: '',
        engine: this.name,
        reason: error instanceof Error ? error.message : 'OCR failed for an unknown reason.',
      };
    } finally {
      rmSync(workDirectory, { recursive: true, force: true });
    }
  }
}

/**
 * Tesseract separates pages with a form feed and pads lines with runs of
 * spaces. The field parser matches lines, so the text is normalised first.
 */
export function normaliseOcrText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    // A form feed already ends a page; the newline that follows it would add a
    // blank line the field parser does not want between two sections.
    .replace(/\n?\f\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
