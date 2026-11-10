import { BadRequestException } from '@nestjs/common';

/**
 * Largest document accepted, measured on the decoded bytes. The HTTP body limit in
 * `main.ts` is derived from it: base64 costs 4/3 of the raw size, so a 10 MiB file
 * needs ~13.34 MiB of JSON body.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The cap above, in MiB, for messages and logs. */
export const MAX_UPLOAD_MIB = MAX_UPLOAD_BYTES / (1024 * 1024);

/** `+`, `/` and `=` only — a data-URL prefix or stray punctuation is a client bug. */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/** Control characters that never appear in a text document (tab, LF and CR do). */
const TEXT_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Content types this API can name from the bytes alone. */
export type SniffedMimeType =
  | 'application/pdf'
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'text/plain';

/**
 * Decodes `fileContentBase64`, rejecting anything that is not really base64 and
 * anything larger than `MAX_UPLOAD_BYTES`. The length check runs before the
 * decode so an oversized body is refused without allocating its bytes.
 */
export function decodeBase64Upload(value: string): Buffer {
  const normalized = value.replace(/\s+/g, '');

  if (!normalized || !BASE64_PATTERN.test(normalized) || normalized.length % 4 === 1) {
    throw new BadRequestException('File content is not valid base64');
  }

  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  const declaredLength = Math.floor((normalized.length * 3) / 4) - padding;
  if (declaredLength > MAX_UPLOAD_BYTES) {
    throw new BadRequestException(
      `File is larger than the ${MAX_UPLOAD_MIB} MiB upload limit`,
    );
  }

  const buffer = Buffer.from(normalized, 'base64');

  // Buffer.from() is lenient — it skips invalid characters and stops at the first
  // '='. Re-encoding is the cheapest proof that the input was base64 and that no
  // bytes were silently dropped.
  if (
    buffer.length === 0 ||
    buffer.length !== declaredLength ||
    buffer.toString('base64').replace(/=+$/, '') !== normalized.replace(/=+$/, '')
  ) {
    throw new BadRequestException('File content is not valid base64');
  }

  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new BadRequestException(
      `File is larger than the ${MAX_UPLOAD_MIB} MiB upload limit`,
    );
  }

  return buffer;
}

function isPlainText(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return false;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return false; // invalid UTF-8: binary, not text
  }
  return !TEXT_CONTROL.test(text);
}

/**
 * Identifies the content from its bytes. `null` means "not a document type we
 * accept", which is a rejection, not a pass.
 */
export function sniffMimeType(buffer: Buffer): SniffedMimeType | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('latin1') === '%PDF') {
    return 'application/pdf';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 && // P
    buffer[2] === 0x4e && // N
    buffer[3] === 0x47 && // G
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (isPlainText(buffer)) {
    return 'text/plain';
  }
  return null;
}

/**
 * Rejects a payload whose bytes disagree with the MIME type the client declared.
 * The declared type is what gets stored on the document and forwarded to the AI
 * model, so it has to be confirmed rather than believed.
 */
export function assertDeclaredMimeMatches(
  declaredMimeType: string,
  buffer: Buffer,
): SniffedMimeType {
  const detected = sniffMimeType(buffer);
  if (detected === null) {
    throw new BadRequestException(
      'File content is not a PDF, a PNG/JPEG/WebP image, or plain text',
    );
  }
  if (detected !== declaredMimeType) {
    throw new BadRequestException(
      `Declared file type ${declaredMimeType} does not match the file content (detected ${detected})`,
    );
  }
  return detected;
}
