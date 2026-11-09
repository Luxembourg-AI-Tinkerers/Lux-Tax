/**
 * Save-to-device and share policy (MOB-10).
 *
 * A file that leaves the app carries three decisions: what it is called, what type it claims
 * to be, and whether the platform should share it or write it to storage. All three are pure
 * transforms, so they are proven here instead of on a device.
 *
 * The name matters most: it is produced partly from user-supplied document names, and it is
 * handed to the OS file provider.
 */

/** Reserved device names on Windows and FAT volumes; sharing to a PC must not fail. */
const RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

const MAX_NAME_LENGTH = 120;

/**
 * Produces a file name that is safe to hand to any platform's document provider.
 *
 *  - path separators and `..` cannot escape the target directory;
 *  - control characters (including NUL) are removed;
 *  - characters Windows/macOS reject (`<>:"/\|?*`) become `_`;
 *  - a reserved device name is prefixed so it cannot resolve to a device;
 *  - leading dots and spaces are stripped (hidden files, trailing-space bugs);
 *  - the extension is preserved and the stem is truncated to keep the total bounded.
 */
export function sanitizeFileName(input: string, fallback = 'document'): string {
  // Take the basename first: `../../etc/passwd` is not a name, it is a path, and the
  // only safe reading of it is "passwd". Doing this before extension detection also
  // stops `dir/file.tar.gz` from being mistaken for a `gz` extension of a weird stem.
  const source = (input ?? '').normalize('NFC');
  const segments = source.split(/[\\/]+/).filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
  const raw = segments.length > 0 ? segments[segments.length - 1] : '';
  const lastDot = raw.lastIndexOf('.');
  const hasExtension = lastDot > 0 && lastDot < raw.length - 1;
  const stem = hasExtension ? raw.slice(0, lastDot) : raw;
  const extension = hasExtension ? raw.slice(lastDot + 1) : '';

  const cleanStem = stem
    // control chars first, then anything the OS reserves
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\.+/g, '.')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim();

  const cleanExtension = extension.replace(/[^A-Za-z0-9]/g, '').slice(0, 10);

  let safeStem = cleanStem.length > 0 ? cleanStem : fallback;
  if (RESERVED.has(safeStem.toUpperCase())) safeStem = `_${safeStem}`;

  const budget = MAX_NAME_LENGTH - (cleanExtension ? cleanExtension.length + 1 : 0);
  safeStem = safeStem.slice(0, Math.max(1, budget));

  return cleanExtension ? `${safeStem}.${cleanExtension.toLowerCase()}` : safeStem;
}

export type ExportKind = 'ANNEX_PDF' | 'RECEIPT_IMAGE' | 'SALARY_CERTIFICATE';

export interface ExportDescriptor {
  fileName: string;
  mimeType: string;
  /** Apple's uniform type identifier, used by the iOS share sheet. */
  uti: string;
}

const MIME_BY_KIND: Record<ExportKind, { mimeType: string; uti: string; extension: string }> = {
  ANNEX_PDF: { mimeType: 'application/pdf', uti: 'com.adobe.pdf', extension: 'pdf' },
  RECEIPT_IMAGE: { mimeType: 'image/jpeg', uti: 'public.jpeg', extension: 'jpg' },
  SALARY_CERTIFICATE: { mimeType: 'application/pdf', uti: 'com.adobe.pdf', extension: 'pdf' },
};

/** MIME type for a descriptor, so the caller never hard-codes a string twice. */
export function mimeForKind(kind: ExportKind): string {
  return MIME_BY_KIND[kind].mimeType;
}

/** Maps a known MIME type back to a safe extension; unknown types get `bin`. */
export function extensionForMime(mimeType: string): string {
  const normalised = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  const match = Object.values(MIME_BY_KIND).find((entry) => entry.mimeType === normalised);
  if (match) return match.extension;
  if (normalised === 'image/png') return 'png';
  if (normalised === 'application/zip') return 'zip';
  return 'bin';
}

/**
 * Descriptor for a file the user is about to save or share.
 *
 * `baseName` is sanitised and the canonical extension for the kind is appended, so a user
 * document called `report.pdf.exe` cannot masquerade as something else.
 */
export function describeExport(
  kind: ExportKind,
  baseName: string,
  options: { hashPrefix?: string | null } = {},
): ExportDescriptor {
  const entry = MIME_BY_KIND[kind];
  const hash = (options.hashPrefix ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
  const stem = sanitizeFileName(baseName, kind.toLowerCase());
  const withoutExtension = stem.includes('.') ? stem.slice(0, stem.lastIndexOf('.')) : stem;
  const suffix = hash ? `-${hash}` : '';

  return {
    fileName: `${withoutExtension}${suffix}.${entry.extension}`,
    mimeType: entry.mimeType,
    uti: entry.uti,
  };
}

export type ShareRoute = 'SHARE_SHEET' | 'SAVE_TO_FILES' | 'REJECT_TOO_LARGE';

export interface SharePolicyInput {
  readonly platform: 'ios' | 'android' | 'unknown';
  readonly hasShareSheet: boolean;
  readonly fileSizeBytes: number;
  /** Default 25 MB: above this the share sheet is unreliable on both platforms. */
  readonly maxBytes?: number;
}

export const DEFAULT_MAX_SHARE_BYTES = 25 * 1024 * 1024;

/**
 * Where the file should go.
 *
 * Too large is rejected rather than silently attempted — a failed share of a 90 MB scan
 * leaves the user with no file and no explanation. Otherwise a share sheet is preferred
 * (it also covers "save to Files"), falling back to a direct write when unavailable.
 */
export function chooseShareRoute(input: SharePolicyInput): ShareRoute {
  const max = input.maxBytes ?? DEFAULT_MAX_SHARE_BYTES;
  if (!Number.isFinite(input.fileSizeBytes) || input.fileSizeBytes > max) return 'REJECT_TOO_LARGE';
  if (input.fileSizeBytes < 0) return 'REJECT_TOO_LARGE';
  if (input.hasShareSheet) return 'SHARE_SHEET';
  return 'SAVE_TO_FILES';
}

/** Human-readable reason shown when a share is refused. */
export function shareRejectionMessage(fileSizeBytes: number, maxBytes = DEFAULT_MAX_SHARE_BYTES): string {
  const mb = (fileSizeBytes / (1024 * 1024)).toFixed(1);
  const limit = (maxBytes / (1024 * 1024)).toFixed(0);
  return `This file is ${mb} MB. Files above ${limit} MB cannot be shared reliably — save it on the web app instead.`;
}
