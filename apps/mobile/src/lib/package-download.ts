/**
 * Authenticated filing-package download (MOB-6).
 *
 * The annex PDF sits behind `GET /api/workspaces/:id/filing-package/annexes.pdf`,
 * which requires a bearer token. On mobile that means three things the screens were
 * missing: an Authorization header, a retry policy that distinguishes transient from
 * permanent failures, and a content check before treating the body as a PDF.
 *
 * Everything is injected — `fetch`, the token getter, the sleeper — so the flow is
 * testable without React Native or a network.
 */
import { annexPdfFileName, annexPdfUrl } from './privacy';

export type DownloadFailure =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'NO_PACKAGE'
  | 'RATE_LIMITED'
  | 'SERVER'
  | 'NETWORK'
  | 'INVALID_CONTENT';

export type DownloadResult =
  | { ok: true; fileName: string; bytes: number; contentType: string; attempts: number }
  | { ok: false; reason: DownloadFailure; message: string; attempts: number; retryAfterSeconds?: number };

export interface DownloadOptions {
  baseUrl: string;
  workspaceId: string;
  taxYear: number;
  /** First 8+ chars of the package hash, used only for the file name. */
  hashPrefix?: string | null;
  getAccessToken: () => Promise<string | null> | string | null;
  fetchImpl?: typeof fetch;
  /** Total attempts, including the first. Default 3. */
  maxAttempts?: number;
  /** Base delay for exponential backoff, ms. Default 500. */
  baseDelayMs?: number;
  /** Injected for tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;

/** Retry only what can plausibly succeed on a second attempt. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export function backoffMs(attempt: number, baseDelayMs = DEFAULT_BASE_DELAY_MS): number {
  return baseDelayMs * 2 ** Math.max(0, attempt - 1);
}

/** `Retry-After` is either seconds or an HTTP date; only seconds are honoured here. */
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    const delta = Math.ceil((date - Date.now()) / 1000);
    return delta > 0 ? delta : 0;
  }
  return undefined;
}

function failureForStatus(status: number, message: string, attempts: number, retryAfterSeconds?: number): DownloadResult {
  const reason: DownloadFailure =
    status === 401
      ? 'UNAUTHORIZED'
      : status === 403
        ? 'FORBIDDEN'
        : status === 404
          ? 'NOT_FOUND'
          : status === 400 || status === 422
            ? 'NO_PACKAGE'
            : status === 429
              ? 'RATE_LIMITED'
              : 'SERVER';
  return { ok: false, reason, message, attempts, retryAfterSeconds };
}

/**
 * Downloads the annex PDF and hands the bytes to `save`.
 *
 * Contract:
 *  - no token → `UNAUTHORIZED` without touching the network;
 *  - 400/422 → `NO_PACKAGE` (the filing package was never generated) and **no retry**;
 *  - 401/403/404 → no retry, the caller must re-authenticate or fix the workspace;
 *  - 408/429/5xx/network → retried with exponential backoff, honouring `Retry-After`;
 *  - a 200 whose `Content-Type` is not `application/pdf` → `INVALID_CONTENT`, so an
 *    HTML error page can never be written to disk as a PDF.
 */
export async function downloadAnnexes(
  options: DownloadOptions,
  save: (file: { fileName: string; bytes: Uint8Array }) => Promise<void>,
): Promise<DownloadResult> {
  const {
    baseUrl,
    workspaceId,
    taxYear,
    hashPrefix,
    getAccessToken,
    fetchImpl = fetch,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  } = options;

  const token = await getAccessToken();
  if (!token) {
    return { ok: false, reason: 'UNAUTHORIZED', message: 'Not signed in.', attempts: 0 };
  }

  const url = annexPdfUrl(baseUrl, workspaceId);
  const fileName = annexPdfFileName(taxYear, hashPrefix);
  let attempts = 0;
  let lastMessage = 'Download failed.';

  while (attempts < maxAttempts) {
    attempts += 1;

    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' },
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.toLowerCase().includes('application/pdf')) {
          return {
            ok: false,
            reason: 'INVALID_CONTENT',
            message: `Expected a PDF but received "${contentType || 'unknown'}".`,
            attempts,
          };
        }

        const buffer = new Uint8Array(await response.arrayBuffer());
        await save({ fileName, bytes: buffer });
        return { ok: true, fileName, bytes: buffer.byteLength, contentType, attempts };
      }

      const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
      lastMessage = `Server responded ${response.status}.`;

      if (!isRetryableStatus(response.status)) {
        return failureForStatus(response.status, lastMessage, attempts, retryAfter);
      }

      if (attempts >= maxAttempts) {
        return failureForStatus(response.status, lastMessage, attempts, retryAfter);
      }

      const wait = retryAfter !== undefined ? retryAfter * 1000 : backoffMs(attempts, baseDelayMs);
      await sleep(wait);
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : 'Network error.';
      if (attempts >= maxAttempts) {
        return { ok: false, reason: 'NETWORK', message: lastMessage, attempts };
      }
      await sleep(backoffMs(attempts, baseDelayMs));
    }
  }

  return { ok: false, reason: 'NETWORK', message: lastMessage, attempts };
}
