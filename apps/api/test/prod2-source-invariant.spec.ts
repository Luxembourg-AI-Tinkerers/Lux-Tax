import { test, describe } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * PROD-2 source invariant.
 *
 * The defect was never in the helper: it was in a *call site* that rebuilt the
 * required-approver list itself. Unit tests of `requiredApproverIds` cannot see
 * that, and the e2e suite only proves the paths it walks today. This test pins
 * the shape of the source, so a fourth call site (or a revert of one) fails the
 * build instead of waiting for a household to get stuck.
 *
 * It reads the files as text on purpose: the rule is "every approver
 * computation goes through the helper", which is a property of the code, not of
 * any runtime value.
 */

const API_ROOT = path.resolve(__dirname, '..', 'src');

function read(relative: string): string {
  return fs.readFileSync(path.join(API_ROOT, relative), 'utf8');
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('PROD-2 source invariant: approvers are computed in exactly one place', () => {
  const filing = read(path.join('modules', 'filing', 'filing.service.ts'));

  test('every approve/file/history gate calls requiredApproverIds', () => {
    const calls = filing.match(/requiredApproverIds\(/g) ?? [];
    assert.strictEqual(
      calls.length,
      3,
      `expected the three gates (approveReturn, recordFiling, history) to call the helper, found ${calls.length}`,
    );
  });

  test('no gate rebuilds the list from household members', () => {
    // The regression looked exactly like this.
    assert.doesNotMatch(filing, /household\.members\.map/);
    assert.doesNotMatch(filing, /\.members\s*\.map\(/);
    assert.doesNotMatch(filing, /member\s*\)\s*=>\s*member\.userId/);
  });

  test('the helper excludes VIEWER and nothing else', () => {
    const helper = read(path.join('modules', 'filing', 'return-version-history.ts'));
    assert.match(helper, /\.filter\(\(member\) => member\.role !== 'VIEWER'\)/);
    // A widened exclusion (e.g. also dropping CO_FILER) would silently lower the
    // approval bar for a joint return.
    const filters = helper.match(/role !== '[A-Z_]+'/g) ?? [];
    assert.deepStrictEqual(filters, ["role !== 'VIEWER'"]);
  });

  test('no other module in the API counts members as approvers', () => {
    const offenders: string[] = [];
    for (const file of walk(API_ROOT)) {
      const text = fs.readFileSync(file, 'utf8');
      if (/(workspace|household)\??\.household\.members\.map/.test(text)) {
        offenders.push(path.relative(API_ROOT, file));
      }
    }
    assert.deepStrictEqual(offenders, []);
  });
});
