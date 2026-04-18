import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@/features/auth/server/password';
import { normalizeSeedUsername } from '@/features/auth/schemas';

config({ path: '.env.local', override: false });
config({ path: '.env', override: false });

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123456';
const DEFAULT_ADMIN_EMAIL = 'admin@aircade.local';

async function loadDb() {
  const [{ db }, schema] = await Promise.all([
    import('./client'),
    import('./schema'),
  ]);

  return {
    db,
    users: schema.users,
  };
}

async function ensureAdminUser() {
  const { db, users } = await loadDb();
  const { username, displayName } = normalizeSeedUsername(
    process.env.SEED_ADMIN_USERNAME ?? DEFAULT_ADMIN_USERNAME
  );
  const password = process.env.SEED_ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
  const email = process.env.SEED_ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL;

  const [existingAdmin] = await db
    .select({
      id: users.id,
      username: users.username,
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existingAdmin) {
    return {
      id: existingAdmin.id,
      username: existingAdmin.username,
      password,
      created: false,
    };
  }

  const createdAdmins = await db
    .insert(users)
    .values({
      username,
      nickname: displayName,
      slug: 'admin',
      email,
      role: 'admin',
      passwordHash: await hashPassword(password),
    })
    .returning({
      id: users.id,
      username: users.username,
    });
  const createdAdmin = createdAdmins[0];

  if (!createdAdmin) {
    throw new Error('failed to create admin user');
  }

  return {
    id: createdAdmin.id,
    username: createdAdmin.username,
    password,
    created: true,
  };
}

async function main() {
  const admin = await ensureAdminUser();

  console.log('[seed] dev auth seed ready');
  console.log(`  admin username: ${admin.username}`);
  console.log(`  admin password: ${admin.password}`);
  console.log(
    `  admin user:     ${admin.created ? 'created' : 'already existed'}`
  );
}

main()
  .catch((error) => {
    console.error('[seed] failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit();
  });
