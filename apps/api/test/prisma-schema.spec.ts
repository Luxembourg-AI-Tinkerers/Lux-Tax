import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const schemaPath = join(process.cwd(), 'apps', 'api', 'prisma', 'schema.prisma');
const migrationsDir = join(process.cwd(), 'apps', 'api', 'prisma', 'migrations');

describe('Prisma schema is deployable', () => {
  test('the datasource URL lives in prisma.config.ts, as Prisma 7 requires', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    // Prisma 7 rejects a `url` in the datasource outright. The CLI the project
    // pins refused to generate a client while that line was present, which made
    // the API unbootable; the URL now lives in prisma.config.ts.
    assert.doesNotMatch(schema, /url\s*=\s*env\(/);

    const configPath = join(process.cwd(), 'apps', 'api', 'prisma.config.ts');
    const config = readFileSync(configPath, 'utf8');
    assert.match(config, /process\.env\.DATABASE_URL/);
    assert.match(config, /datasource/);
  });

  test('every migration folder has a migration.sql and a lock file is present', () => {
    const entries = readdirSync(migrationsDir, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    );
    assert.ok(entries.length >= 11, `expected at least 11 migrations, found ${entries.length}`);

    for (const entry of entries) {
      assert.ok(
        existsSync(join(migrationsDir, entry.name, 'migration.sql')),
        `${entry.name} has no migration.sql`,
      );
    }
    assert.ok(existsSync(join(migrationsDir, 'migration_lock.toml')));
  });

  test('the outbox and dedupe migrations are present', () => {
    const names = readdirSync(migrationsDir);
    assert.ok(names.includes('20261109140000_add_notification_dedupe'));
    assert.ok(names.includes('20261109150000_add_unsupported_codes'));
    assert.ok(names.includes('20261109160000_add_notification_outbox'));
  });

  test('the outbox table is declared with its unique channel key', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    assert.match(schema, /model NotificationDelivery \{/);
    assert.match(schema, /@@unique\(\[notificationId, channel\]\)/);
    assert.match(schema, /enum NotificationDeliveryStatus \{/);
  });
});
