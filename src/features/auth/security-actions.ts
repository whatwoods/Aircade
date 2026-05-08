'use server';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { requireUser } from './server/auth';
import { hashPassword, verifyPassword } from './server/password';
import {
  clearSessionCookie,
  readSessionCookie,
  deleteSessionByToken,
} from './server/session';

export async function changePasswordAction(formData: FormData) {
  const user = await requireUser('/account/security');
  const currentPassword = formData.get('currentPassword') as string;
  const newPassword = formData.get('newPassword') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!currentPassword || !newPassword || !confirmPassword) {
    redirect('/account/security?error=请填写所有字段');
  }
  if (newPassword !== confirmPassword) {
    redirect('/account/security?error=两次密码不一致');
  }
  if (newPassword.length < 8) {
    redirect('/account/security?error=密码至少8位');
  }

  // Verify current password
  const [userRow] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!userRow) {
    redirect('/account/security?error=用户不存在');
  }

  const valid = await verifyPassword(currentPassword, userRow.passwordHash);
  if (!valid) {
    redirect('/account/security?error=当前密码错误');
  }

  const newHash = await hashPassword(newPassword);
  await db
    .update(users)
    .set({ passwordHash: newHash })
    .where(eq(users.id, user.id));

  redirect('/account/security?notice=密码已修改');
}

export async function deleteAccountAction(formData: FormData) {
  const user = await requireUser('/account/security');
  const password = formData.get('password') as string;

  if (!password) {
    redirect('/account/security?error=请输入密码确认');
  }

  // Verify password
  const [userRow] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!userRow) {
    redirect('/account/security?error=用户不存在');
  }

  const valid = await verifyPassword(password, userRow.passwordHash);
  if (!valid) {
    redirect('/account/security?error=密码错误');
  }

  // Clear session cookie first
  const token = readSessionCookie();
  if (token) {
    await deleteSessionByToken(token);
  }
  await clearSessionCookie();

  // Delete user (cascades to sessions, works, likes, favorites via FK)
  await db.delete(users).where(eq(users.id, user.id));

  redirect('/?notice=账号已删除');
}
