import { randomUUID } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { inviteCodes, sessions, users } from '@/db/schema';
import type { LoginInput, RegisterInput } from '../schemas';
import { AuthError } from './errors';
import { hashPassword, verifyPassword } from './password';
import type { RequestMetadata } from './request';
import {
  clearSessionCookie,
  createSession,
  deleteSessionByToken,
  hashSessionToken,
  pruneExpiredSessionsForUser,
  readSessionCookie,
  writeSessionCookie,
} from './session';
import { slugifyUsername } from './slug';

const LOGIN_LOCK_THRESHOLD = 5;
const LOGIN_LOCK_MINUTES = 30;

export type CurrentUser = {
  id: string;
  username: string;
  nickname: string;
  email: string | null;
  slug: string;
  role: 'user' | 'admin';
  status: 'active' | 'banned';
  inviteCodeUsed: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  sessionExpiresAt: Date;
};

function buildLockedUntil() {
  return new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000);
}

function normalizeRedirectTarget(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/account';
  }

  return value;
}

async function resolveUniqueSlug(baseValue: string): Promise<string> {
  const baseSlug = slugifyUsername(baseValue);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
    const candidate = `${baseSlug}${suffix}`.slice(0, 40);
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.slug, candidate))
      .limit(1);

    if (!existing) {
      return candidate;
    }
  }

  return `${baseSlug.slice(0, 31)}-${randomUUID().slice(0, 8)}`;
}

async function findInviteCode(code: string) {
  const [invite] = await db
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.code, code))
    .limit(1);

  return invite ?? null;
}

function assertInviteUsable(
  invite:
    | (typeof inviteCodes.$inferSelect & {
        expiresAt: Date | null;
      })
    | null
): asserts invite is typeof inviteCodes.$inferSelect {
  if (!invite) {
    throw new AuthError('邀请码不存在');
  }

  if (invite.status === 'revoked') {
    throw new AuthError('邀请码已作废');
  }

  if (invite.status === 'used' || invite.usedCount >= invite.maxUses) {
    throw new AuthError('邀请码已用尽');
  }

  if (invite.expiresAt && invite.expiresAt <= new Date()) {
    throw new AuthError('邀请码已过期');
  }
}

async function ensureUsernameAndEmailAvailable(input: RegisterInput) {
  const [existingUsername] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, input.username))
    .limit(1);

  if (existingUsername) {
    throw new AuthError('用户名已被占用');
  }

  if (!input.email) {
    return;
  }

  const [existingEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existingEmail) {
    throw new AuthError('邮箱已被占用');
  }
}

export async function registerUser(
  input: RegisterInput,
  metadata: RequestMetadata
) {
  await ensureUsernameAndEmailAvailable(input);

  const invite = await findInviteCode(input.inviteCode);
  assertInviteUsable(invite);

  const passwordHash = await hashPassword(input.password);
  const slug = await resolveUniqueSlug(input.displayName);

  const user = await db.transaction(async (tx) => {
    const currentInvite = await tx
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.id, invite.id))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    assertInviteUsable(currentInvite);

    const createdUsers = await tx
      .insert(users)
      .values({
        username: input.username,
        nickname: input.displayName,
        slug,
        email: input.email ?? null,
        passwordHash,
        inviteCodeUsed: currentInvite.id,
      })
      .returning({
        id: users.id,
      });
    const createdUser = createdUsers[0];

    if (!createdUser) {
      throw new AuthError('创建用户失败，请稍后再试');
    }

    const nextUsedCount = currentInvite.usedCount + 1;
    const nextStatus =
      nextUsedCount >= currentInvite.maxUses || currentInvite.type === 'single'
        ? 'used'
        : 'active';

    const updatedInvites = await tx
      .update(inviteCodes)
      .set({
        usedCount: nextUsedCount,
        status: nextStatus,
      })
      .where(
        and(
          eq(inviteCodes.id, currentInvite.id),
          eq(inviteCodes.usedCount, currentInvite.usedCount),
          eq(inviteCodes.status, currentInvite.status),
          currentInvite.expiresAt
            ? eq(inviteCodes.expiresAt, currentInvite.expiresAt)
            : isNull(inviteCodes.expiresAt)
        )
      )
      .returning({
        id: inviteCodes.id,
      });
    const updatedInvite = updatedInvites[0];

    if (!updatedInvite) {
      throw new AuthError('邀请码刚刚被别人用了，请换一个再试');
    }

    return createdUser;
  });

  const session = await createSession(user.id, metadata);
  await writeSessionCookie(session);
}

export async function loginUser(input: LoginInput, metadata: RequestMetadata) {
  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.username, input.username))
    .limit(1);
  const user = userRows[0] ?? null;

  if (!user) {
    throw new AuthError('用户名或密码错误');
  }

  if (user.status === 'banned') {
    throw new AuthError('账号已被封禁，请联系管理员');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AuthError('账号已锁定，请 30 分钟后再试');
  }

  const passwordOk = await verifyPassword(input.password, user.passwordHash);

  if (!passwordOk) {
    const nextFailedCount = user.failedLoginCount + 1;
    const shouldLock = nextFailedCount >= LOGIN_LOCK_THRESHOLD;

    await db
      .update(users)
      .set({
        failedLoginCount: shouldLock ? 0 : nextFailedCount,
        lockedUntil: shouldLock ? buildLockedUntil() : null,
      })
      .where(eq(users.id, user.id));

    if (shouldLock) {
      throw new AuthError('密码错误次数过多，账号已锁定 30 分钟');
    }

    throw new AuthError('用户名或密码错误');
  }

  await db
    .update(users)
    .set({
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    })
    .where(eq(users.id, user.id));

  await pruneExpiredSessionsForUser(user.id);
  const session = await createSession(user.id, metadata);
  await writeSessionCookie(session);
}

export async function logoutCurrentUser() {
  const token = readSessionCookie();

  if (token) {
    await deleteSessionByToken(token);
  }

  await clearSessionCookie();
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = readSessionCookie();

  if (!token) {
    return null;
  }

  const [row] = await db
    .select({
      sessionExpiresAt: sessions.expiresAt,
      id: users.id,
      username: users.username,
      nickname: users.nickname,
      email: users.email,
      slug: users.slug,
      role: users.role,
      status: users.status,
      inviteCodeUsed: users.inviteCodeUsed,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        gt(sessions.expiresAt, new Date()),
        eq(users.status, 'active')
      )
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return row;
}

export async function requireUser(redirectTo = '/account') {
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(redirectTo)}`);
  }

  return user;
}

export async function redirectIfAuthenticated(defaultTarget = '/account') {
  const user = await getCurrentUser();

  if (user) {
    redirect(defaultTarget);
  }
}

export function getPostAuthRedirectTarget(value: string | null | undefined) {
  return normalizeRedirectTarget(value);
}
