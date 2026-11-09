import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards against phantom client methods on mobile (MOB-2).
 *
 * `app/(tabs)/tasks.tsx` called `mobileApiClient.submitTaxProfile(...)`, which never
 * existed on `LuxTaxApiClient`. TypeScript could not catch it because the mobile app
 * has no React Native dependencies installed in this workspace, so the screen was
 * simply broken at runtime.
 *
 * This test scans the mobile sources for `mobileApiClient.<method>(` and asserts every
 * method exists on the client. It is a static check — no RN build required.
 */

const REPO_ROOT = process.cwd();
const CLIENT_PATH = join(REPO_ROOT, 'packages/api-client/src/client.ts');
const MOBILE_ROOT = join(REPO_ROOT, 'apps/mobile');

function clientMethods(): Set<string> {
  const source = readFileSync(CLIENT_PATH, 'utf8');
  const methods = new Set<string>();
  for (const match of source.matchAll(/^\s+async\s+(\w+)\s*\(/gm)) methods.add(match[1]);
  return methods;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'test') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function mobileCalls(): Array<{ file: string; method: string }> {
  const calls: Array<{ file: string; method: string }> = [];
  for (const file of walk(MOBILE_ROOT)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/mobileApiClient\.(\w+)\s*\(/g)) {
      calls.push({ file: file.replace(REPO_ROOT, '').replace(/\\/g, '/'), method: match[1] });
    }
  }
  return calls;
}

describe('Mobile client method integrity (MOB-2)', () => {
  test('every mobileApiClient call exists on LuxTaxApiClient', () => {
    const available = clientMethods();
    assert.ok(available.size > 5, `expected to parse client methods, got ${available.size}`);

    const missing = mobileCalls().filter((call) => !available.has(call.method));
    const detail = missing.map((m) => `${m.file} -> ${m.method}`).join('\n');
    assert.deepStrictEqual(missing, [], `phantom client methods:\n${detail}`);
  });

  test('the scanner uploads with a workspace id only', () => {
    const scanner = readFileSync(join(MOBILE_ROOT, 'src/components/DocumentCameraScanner.tsx'), 'utf8');
    assert.ok(!/uploadDocument\(\s*householdId/.test(scanner), 'scanner must not upload with a household id');
    assert.ok(/uploadDocument\(\s*workspaceId/.test(scanner), 'scanner must upload with a workspace id');
    assert.ok(!/householdId:\s*string/.test(scanner), 'scanner props must not expose a household id');
  });

  test('estimate and approval use workspace.id, not a household id', () => {
    const estimate = readFileSync(join(MOBILE_ROOT, 'app/(tabs)/estimate.tsx'), 'utf8');
    assert.ok(/calculateTax\(\s*workspace\.id\s*\)/.test(estimate), 'calculateTax must receive workspace.id');
    assert.ok(/approveReturn\(\s*workspace\.id\s*\)/.test(estimate), 'approveReturn must receive workspace.id');
    assert.ok(!/calculateTax\(\s*householdId/.test(estimate), 'no household id in calculateTax');
    assert.ok(!/approveReturn\(\s*householdId/.test(estimate), 'no household id in approveReturn');
  });

  test('the questionnaire is saved through the workspace-scoped endpoint', () => {
    const tasks = readFileSync(join(MOBILE_ROOT, 'app/(tabs)/tasks.tsx'), 'utf8');
    assert.ok(/saveQuestionnaire\(\s*workspaceId/.test(tasks), 'saveQuestionnaire must receive the workspace id');
    assert.ok(!/submitTaxProfile/.test(tasks.replace(/\/\/.*$/gm, '')), 'no call to the removed method');
  });
});
