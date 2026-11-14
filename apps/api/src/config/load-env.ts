/**
 * Loads `.env` into `process.env` at boot.
 *
 * The API reads its configuration at module-import time (`auth.module.ts` calls
 * `assertRuntimeConfig`), and neither Nest nor the Nest CLI reads `.env` by
 * itself. The documented setup (`cp .env.example .env`) therefore only worked
 * when the variables happened to be exported in the shell; `pnpm dev` from a
 * clean checkout died with "Refusing to start: JWT_ACCESS_SECRET is required".
 *
 * This runs from `main.ts` before any module import, so the check sees the
 * file. `process.loadEnvFile` does not overwrite variables that are already
 * set, so an explicitly exported environment (CI, production) keeps priority.
 *
 * Search is nearest-first — `apps/api/.env`, then the repository root — so the
 * package can be started from either its own directory or the repo root.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** How far up from the working directory a `.env` may live. */
const MAX_PARENT_LEVELS = 3;

export function loadEnvironment(startDir: string = process.cwd()): string | null {
  // Node < 20.12 has no `process.loadEnvFile`; there the shell must supply the
  // variables, which is the pre-existing behaviour.
  const loadEnvFile = (process as NodeJS.Process & {
    loadEnvFile?: (path?: string) => void;
  }).loadEnvFile;
  if (typeof loadEnvFile !== 'function') return null;

  let dir = resolve(startDir);
  for (let level = 0; level <= MAX_PARENT_LEVELS; level += 1) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      try {
        loadEnvFile.call(process, candidate);
      } catch {
        // An unreadable `.env` must not crash the boot: the configuration check
        // below reports what is actually missing, which is the useful message.
      }
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

loadEnvironment();
