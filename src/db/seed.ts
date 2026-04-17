import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@/features/auth/server/password';
import {
  normalizeSeedInviteCode,
  normalizeSeedUsername,
} from '@/features/auth/schemas';

config({ path: '.env.local', override: false });
config({ path: '.env', override: false });

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123456';
const DEFAULT_ADMIN_EMAIL = 'admin@aircade.local';
const DEFAULT_INVITE_CODE = 'AIRCADE-DEV-001';

async function loadDb() {
  const [{ db }, schema] = await Promise.all([
    import('./client'),
    import('./schema'),
  ]);

  return {
    db,
    inviteCodes: schema.inviteCodes,
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

async function ensureInviteCode(createdBy: string) {
  const { db, inviteCodes } = await loadDb();
  const code = normalizeSeedInviteCode(
    process.env.SEED_INVITE_CODE ?? DEFAULT_INVITE_CODE
  );

  const [existingInvite] = await db
    .select({
      id: inviteCodes.id,
      code: inviteCodes.code,
      status: inviteCodes.status,
    })
    .from(inviteCodes)
    .where(eq(inviteCodes.code, code))
    .limit(1);

  if (existingInvite) {
    return {
      code: existingInvite.code,
      status: existingInvite.status,
      created: false,
    };
  }

  const createdInvites = await db
    .insert(inviteCodes)
    .values({
      code,
      type: 'multi',
      maxUses: 20,
      createdBy,
    })
    .returning({
      code: inviteCodes.code,
      status: inviteCodes.status,
    });
  const createdInvite = createdInvites[0];

  if (!createdInvite) {
    throw new Error('failed to create invite code');
  }

  return {
    code: createdInvite.code,
    status: createdInvite.status,
    created: true,
  };
}

async function main() {
  const admin = await ensureAdminUser();
  const invite = await ensureInviteCode(admin.id);

  console.log('[seed] dev auth seed ready');
  console.log(`  admin username: ${admin.username}`);
  console.log(`  admin password: ${admin.password}`);
  console.log(`  invite code:    ${invite.code}`);
  console.log(
    `  admin user:     ${admin.created ? 'created' : 'already existed'}`
  );
  console.log(
    `  invite code:    ${invite.created ? 'created' : 'already existed'}`
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
