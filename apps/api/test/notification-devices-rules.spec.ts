import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  isValidPushToken,
  normalizePlatform,
  selectLiveTokens,
} from '../src/modules/notifications/notification-devices';

describe('isValidPushToken', () => {
  test('accepts the bracketed Expo token', () => {
    assert.strictEqual(isValidPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxx]'), true);
  });

  test('rejects short, empty and non-string values', () => {
    assert.strictEqual(isValidPushToken('short'), false);
    assert.strictEqual(isValidPushToken(''), false);
    assert.strictEqual(isValidPushToken(null), false);
    assert.strictEqual(isValidPushToken(42), false);
  });

  test('rejects a token with characters no provider issues', () => {
    assert.strictEqual(isValidPushToken('ExponentPushToken[aaaaaaaaaaaaaaaa] ; DROP'), false);
  });

  test('rejects an implausibly long value', () => {
    assert.strictEqual(isValidPushToken('a'.repeat(201)), false);
  });
});

describe('normalizePlatform', () => {
  test('lower-cases the three platforms we accept', () => {
    assert.strictEqual(normalizePlatform('iOS'), 'ios');
    assert.strictEqual(normalizePlatform(' ANDROID '), 'android');
    assert.strictEqual(normalizePlatform('web'), 'web');
  });

  test('returns null for anything else', () => {
    assert.strictEqual(normalizePlatform('windows'), null);
    assert.strictEqual(normalizePlatform(''), null);
    assert.strictEqual(normalizePlatform(undefined), null);
  });
});

describe('selectLiveTokens', () => {
  const row = (token: string, createdAt: Date, revokedAt: Date | null = null) => ({
    token,
    createdAt,
    revokedAt,
  });

  test('drops revoked devices and keeps oldest-first order', () => {
    const tokens = selectLiveTokens([
      row('ExponentPushToken[b]', new Date(2026, 0, 2)),
      row('ExponentPushToken[dead]', new Date(2026, 0, 1), new Date(2026, 1, 1)),
      row('ExponentPushToken[a]', new Date(2026, 0, 1)),
    ]);
    assert.deepStrictEqual(tokens, ['ExponentPushToken[a]', 'ExponentPushToken[b]']);
  });

  test('an all-revoked user yields no tokens', () => {
    assert.deepStrictEqual(
      selectLiveTokens([row('ExponentPushToken[x]', new Date(), new Date())]),
      [],
    );
  });

  test('returns a new array and does not mutate the input order', () => {
    const rows = [
      row('ExponentPushToken[b]', new Date(2026, 0, 2)),
      row('ExponentPushToken[a]', new Date(2026, 0, 1)),
    ];
    const before = rows.map((r) => r.token);
    const tokens = selectLiveTokens(rows);
    assert.deepStrictEqual(rows.map((r) => r.token), before);
    assert.deepStrictEqual(tokens, ['ExponentPushToken[a]', 'ExponentPushToken[b]']);
  });
});
