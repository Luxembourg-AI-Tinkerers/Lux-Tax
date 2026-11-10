/**
 * Resolves the `redirect` query parameter carried by the invitation links
 * (`/login?redirect=/invite/<token>`).
 *
 * Only a same-origin absolute path is accepted: `//evil.example` and
 * `https://evil.example` would turn the login page into an open redirect, so
 * they fall back to the caller's own default path.
 */
export function resolvePostAuthPath(search: string | null | undefined, fallback: string): string {
  const redirect = new URLSearchParams(search ?? '').get('redirect');
  if (!redirect) return fallback;
  if (!redirect.startsWith('/') || redirect.startsWith('//') || redirect.includes('\\')) {
    return fallback;
  }
  return redirect;
}
