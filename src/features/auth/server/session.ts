import { createHash, randomBytes } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { env } from '@/lib/env';
import type { RequestMetadata } from './request';

export type CreatedSession = {
  token: string;
  expiresAt: Date;
};

function getSessionDurationMs() {
  return env.AUTH_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256')
    .update(`${env.AUTH_SECRET}:${token}`)
    .digest('hex');
}

export function readSessionCookie(): string | null {
  return cookies().get(env.AUTH_SESSION_COOKIE)?.value ?? null;
}

export async function createSession(
  userId: string,
  metadata: RequestMetadata
): Promise<CreatedSession> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + getSessionDurationMs());

  await db.insert(sessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  });

  return { token, expiresAt };
}

export async function writeSessionCookie(session: CreatedSession) {
  cookies().set(env.AUTH_SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: session.expiresAt,
  });
}

export async function clearSessionCookie() {
  cookies().set(env.AUTH_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  });
}

export async function deleteSessionByToken(token: string) {
  await db
    .delete(sessions)
    .where(eq(sessions.tokenHash, hashSessionToken(token)));
}

export async function pruneExpiredSessionsForUser(userId: string) {
  await db
    .delete(sessions)
    .where(
      and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date()))
    );
}
