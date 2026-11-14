import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Reads a file from the workspace root, wherever the suite was started from.
 *
 * The unit suite is run both from the repository root (`node --test
 * apps/api/test/*.spec.ts`) and from `apps/api`, and the PDF fixtures live at
 * the root because they are the ACD forms the product is built against.
 */
export function workspaceFile(name: string): Buffer {
  let directory = resolve(process.cwd());

  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(directory, name);
    if (existsSync(candidate)) return readFileSync(candidate);
    const parent = resolve(directory, '..');
    if (parent === directory) break;
    directory = parent;
  }

  throw new Error(`Fixture ${name} not found above ${process.cwd()}`);
}
