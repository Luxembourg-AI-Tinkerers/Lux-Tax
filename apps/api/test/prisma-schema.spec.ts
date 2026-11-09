import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const schemaPath = join(process.cwd(), 'apps', 'api', 'prisma', 'schema.prisma');
const migrationsDir = join(process.cwd(), 'apps', 'api', 'prisma', 'migrations');

describe('Prisma schema is deployable', () => {
  test('the datasource carries the DATABASE_URL env reference', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    // Without this line Prisma validates the schema but every connection fails:
    // the API could not boot at all.
    assert.match(schema, /url\s*=\s*env\("DATABASE_URL"\)/);
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
