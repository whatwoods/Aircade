import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const drizzleDir = path.resolve(dirname, '../../drizzle');

function readAllMigrations() {
  const sqlFiles = readdirSync(drizzleDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  return sqlFiles
    .map((name) => readFileSync(path.join(drizzleDir, name), 'utf8'))
    .join('\n');
}

describe('drizzle migrations', () => {
  it('keeps invite_codes.created_by foreign key in SQL migrations', () => {
    expect(readAllMigrations()).toContain(
      'invite_codes_created_by_users_id_fk'
    );
  });

  it('keeps works action target check constraint in SQL migrations', () => {
    const migrations = readAllMigrations();

    expect(migrations).toContain('works_action_target_required');
    expect(migrations).toContain(
      'CHECK ("qr_url" is not null or "web_url" is not null)'
    );
  });
});
