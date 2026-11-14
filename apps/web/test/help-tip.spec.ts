import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { placeTooltip, TOOLTIP_WIDTH } from '../src/lib/tooltip-position';
import { HELP_TEXTS, type HelpId } from '../src/lib/help-texts';

/**
 * The explainers are copy, and copy rots in ways a type-checker cannot see: an
 * id nobody uses, a body that grew into a paragraph, a label that lost its "?".
 * These tests cover both halves — the geometry of the bubble, and the health of
 * the inventory behind it.
 */

describe('tooltip placement', () => {
  const viewport = { width: 1280, height: 800 };

  test('sits below the trigger, centred on it', () => {
    const placement = placeTooltip({ top: 100, left: 600, width: 16, height: 16 }, viewport);

    assert.equal(placement.above, false);
    assert.equal(placement.top, 124);
    assert.equal(placement.left, 600 + 8 - TOOLTIP_WIDTH / 2);
  });

  test('stays inside the right edge at the end of a table row', () => {
    const placement = placeTooltip({ top: 100, left: 1270, width: 16, height: 16 }, viewport);
    assert.ok(placement.left + TOOLTIP_WIDTH <= viewport.width, 'bubble runs off the right edge');
    assert.equal(placement.left, viewport.width - TOOLTIP_WIDTH - 8);
  });

  test('stays inside the left edge', () => {
    const placement = placeTooltip({ top: 100, left: 0, width: 16, height: 16 }, viewport);
    assert.equal(placement.left, 8);
  });

  test('flips above when the trigger is near the bottom', () => {
    const placement = placeTooltip({ top: 760, left: 400, width: 16, height: 16 }, viewport);

    assert.equal(placement.above, true);
    assert.ok(placement.top < 760, 'a flipped bubble must be above the trigger');
  });

  test('a trigger above the fold never pushes the bubble off the top', () => {
    const placement = placeTooltip({ top: 2, left: 400, width: 16, height: 16 }, { width: 800, height: 40 });
    assert.ok(placement.top >= 8);
  });
});

/** Locates `apps/web/src` whether the suite was started at the root or in the app. */
function sourceRoot(): string {
  let directory = resolve(process.cwd());
  for (let depth = 0; depth < 5; depth += 1) {
    for (const candidate of [join(directory, 'apps', 'web', 'src'), join(directory, 'src')]) {
      if (existsSync(join(candidate, 'components', 'HelpTip.tsx'))) return candidate;
    }
    directory = resolve(directory, '..');
  }
  throw new Error('apps/web/src not found');
}

function tsxFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith('.tsx') || path.endsWith('.ts') ? [path] : [];
  });
}

function usedHelpIds(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  for (const file of tsxFiles(sourceRoot())) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<HelpTip\s+id="([A-Za-z0-9]+)"/g)) {
      const list = used.get(match[1]) ?? [];
      list.push(file);
      used.set(match[1], list);
    }
  }
  return used;
}

describe('help inventory', () => {
  test('a "?" is not a paragraph', () => {
    for (const [id, entry] of Object.entries(HELP_TEXTS)) {
      assert.ok(entry.title.length >= 3 && entry.title.length <= 48, `${id}: title length`);
      assert.ok(entry.body.length >= 40 && entry.body.length <= 260, `${id}: body length ${entry.body.length}`);
      assert.equal(entry.body, entry.body.trim(), `${id}: body has outer whitespace`);
      assert.match(entry.body, /[.!]$/, `${id}: body should end with a full stop`);
    }
  });

  test('every id in the registry is actually shown somewhere', () => {
    const used = usedHelpIds();
    const orphans = Object.keys(HELP_TEXTS).filter((id) => !used.has(id));
    assert.deepEqual(orphans, [], 'unused help entries (delete them or place them)');
  });

  test('every "?" on screen has copy behind it', () => {
    const used = usedHelpIds();
    const unknown = [...used.keys()].filter((id) => !(id in HELP_TEXTS));
    assert.deepEqual(unknown, [], 'a HelpTip points at copy that does not exist');
  });

  test('the interface offers help in the places people get stuck', () => {
    const used = usedHelpIds();
    // A floor, not a target: it fails if a refactor quietly strips the
    // affordances out of the views rather than moving them.
    assert.ok(used.size >= 45, `only ${used.size} distinct help topics are placed`);

    const files = new Set([...used.values()].flat().map((file) => file.split(/[\\/]/).pop()));
    for (const surface of ['QuestionnaireView.tsx', 'TaxCalculatorView.tsx', 'DocumentsView.tsx', 'FilingPackageView.tsx']) {
      assert.ok(files.has(surface), `${surface} has no help at all`);
    }
  });
});
