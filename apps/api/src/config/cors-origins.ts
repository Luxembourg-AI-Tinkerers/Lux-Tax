/**
 * Browser origins allowed to call the API.
 *
 * `FRONTEND_URL` is a single canonical origin: it is also the base of the
 * verification e-mail link (`modules/auth/email-verification.ts`), so it cannot
 * carry a list without breaking those links. A phone demo on the LAN needs a
 * second origin next to `http://localhost:3000`, which is what `CORS_ORIGINS`
 * is for: comma-separated, defaulting to `FRONTEND_URL`.
 *
 * A trailing slash never appears in an `Origin` header, and `@fastify/cors`
 * compares the header literally, so it is stripped here rather than silently
 * rejecting every request from a pasted URL.
 */
const FALLBACK_ORIGIN = 'http://localhost:3000';

export function allowedCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = (env.CORS_ORIGINS ?? '').trim() || (env.FRONTEND_URL ?? '').trim();
  const origins = raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return [...new Set(origins.length > 0 ? origins : [FALLBACK_ORIGIN])];
}
