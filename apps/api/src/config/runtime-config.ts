/**
 * Boot-time configuration checks.
 *
 * The application used to fall back to a literal JWT secret that is committed to
 * this repository: with `JWT_ACCESS_SECRET` unset, a deploy would start normally
 * and sign tokens anybody could forge. A wrong secret is worse than a missing
 * one, so nothing here has a default — if the environment is incomplete the
 * process refuses to start.
 */

/** Values that must never be used as a signing key, whatever the environment. */
const KNOWN_PUBLIC_SECRETS = new Set([
  'dev_luxembourg_tax_jwt_access_secret_32chars_min_2026',
]);

export const MIN_SECRET_LENGTH = 32;

export class ConfigurationError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Refusing to start: ${problems.join('; ')}`);
    this.name = 'ConfigurationError';
  }
}

/**
 * Collect every configuration problem at once, so an operator fixes them in one
 * pass instead of discovering them one restart at a time.
 */
export function configurationProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];

  const secret = (env.JWT_ACCESS_SECRET ?? '').trim();
  if (!secret) {
    problems.push('JWT_ACCESS_SECRET is required (no default is used)');
  } else if (secret.length < MIN_SECRET_LENGTH) {
    problems.push(`JWT_ACCESS_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  } else if (KNOWN_PUBLIC_SECRETS.has(secret)) {
    problems.push('JWT_ACCESS_SECRET is the example value committed to the repository');
  }

  if (!(env.DATABASE_URL ?? '').trim()) {
    problems.push('DATABASE_URL is required');
  }

  if ((env.NODE_ENV ?? '') === 'production') {
    if (!(env.FRONTEND_URL ?? '').trim()) {
      problems.push('FRONTEND_URL is required in production (it is the CORS allowlist)');
    }
    const frontend = (env.FRONTEND_URL ?? '').trim();
    if (frontend && !/^https:\/\//i.test(frontend) && !/^http:\/\/localhost(:\d+)?$/i.test(frontend)) {
      problems.push('FRONTEND_URL must be https in production');
    }
  }

  return problems;
}

/** Throw unless the environment is complete enough to run safely. */
export function assertRuntimeConfig(env: NodeJS.ProcessEnv = process.env): void {
  const problems = configurationProblems(env);
  if (problems.length > 0) throw new ConfigurationError(problems);
}

/** The signing key, guaranteed present and sane because the config was asserted. */
export function jwtAccessSecret(env: NodeJS.ProcessEnv = process.env): string {
  assertRuntimeConfig(env);
  return (env.JWT_ACCESS_SECRET as string).trim();
}
