import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Every field the engine accepts must be supplied by the API layer — otherwise a questionnaire
 * answer, or an entire capability, is silently dropped on the way to the calculation.
 *
 * This is a static check on purpose: `CalculationsService` needs Prisma and Nest to instantiate, and
 * the failure mode being guarded (a parameter nobody passes) is exactly the kind that a unit test of
 * the engine cannot see. A name-level audit would have caught `lossCarryForward` before Phase 43.
 *
 * Adding a field to `TaxCalculationParams` therefore fails this test until it is either wired into
 * `calculations.service.ts` or listed below with a reason.
 */
const ROOT = join(__dirname, '..', '..', '..');
const PARAMS_FILE = join(ROOT, 'packages', 'contracts', 'src', 'tax.ts');
const SERVICE_FILE = join(ROOT, 'apps', 'api', 'src', 'modules', 'calculations', 'calculations.service.ts');

/** Params that legitimately never appear in the mapping, with the reason. */
const NOT_FROM_ANSWERS: Record<string, string> = {
  taxYear: 'comes from the workspace, not the questionnaire',
  taxClass: 'resolved by class-resolution.ts',
  residence: 'comes from the workspace/household',
  primaryUserId: 'comes from the workspace member',
  spouseUserId: 'comes from the household member list',
  dependantsCount: 'counted from the household dependants',
  facts: 'loaded from the fact table',
  qualifyingDividends: 'summed from facts with fieldKey "qualifyingDividend"',
  rentalProperties: 'derived from rental facts',
  movableGains: 'derived from gain facts',
  realEstateGains: 'derived from gain facts',
  securities: 'derived from capital facts',
  foreignIncomeItems: 'derived from foreign-income facts',
};

/**
 * Known gaps: the engine can do it, but no questionnaire field reaches it yet. Listed rather than
 * hidden, so the test still guards everything else.
 *
 * Empty since Phase 44 wired `spouseResidence` and `mixedCoupleCollectiveRequested`. The assertion
 * below still runs, so any future entry has to stay honest.
 */
const KNOWN_UNWIRED: Record<string, string> = {};

function engineParams(): string[] {
  const source = readFileSync(PARAMS_FILE, 'utf8');
  const body = /export interface TaxCalculationParams \{([\s\S]*?)\n\}/.exec(source);
  assert.ok(body, 'TaxCalculationParams not found in contracts');
  const names = [...body![1]!.matchAll(/^\s{2}([A-Za-z_][A-Za-z0-9_]*)\??\s*:/gm)].map(
    (match) => match[1]!,
  );
  return [...new Set(names)];
}

describe('calculation params are wired from the questionnaire', () => {
  const service = readFileSync(SERVICE_FILE, 'utf8');
  const params = engineParams();

  it('finds both files and a sane parameter list', () => {
    assert.ok(params.length > 40, `only ${params.length} params parsed`);
    assert.ok(
      service.includes('LuxembourgTaxEngine.calculate') || service.includes('answers.'),
      'service file looks wrong',
    );
  });

  it('supplies every engine parameter, or documents why not', () => {
    const unmapped = params.filter(
      (name) =>
        !new RegExp(`\\b${name}\\b`).test(service) &&
        NOT_FROM_ANSWERS[name] === undefined &&
        KNOWN_UNWIRED[name] === undefined,
    );
    assert.deepEqual(
      unmapped,
      [],
      `these engine params reach no code path in calculations.service.ts: ${unmapped.join(', ')}`,
    );
  });

  it('has no unwired engine parameter left (Phase 44)', () => {
    assert.deepEqual(Object.keys(KNOWN_UNWIRED), []);
  });

  it('keeps the known-gap list honest: each entry is still genuinely absent', () => {
    for (const name of Object.keys(KNOWN_UNWIRED)) {
      assert.ok(
        params.includes(name),
        `${name} is listed as a known gap but is no longer an engine parameter`,
      );
      assert.equal(
        new RegExp(`\\b${name}\\b`).test(service),
        false,
        `${name} is now wired — remove it from KNOWN_UNWIRED`,
      );
    }
  });

  it('passes the Art. 114 ledger through (Phase 43)', () => {
    assert.match(service, /lossCarryForward:\s*answers\.lossCarryForward/);
  });

  it('passes the mortgage fixation year, which the engine requires for the deduction', () => {
    assert.match(service, /mortgageFixationYear:\s*answers\.mortgageOccupancyYear/);
  });
});
