'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { requireUser } from '@/features/auth';

export async function updateProfile(formData: FormData) {
  const user = await requireUser('/account/profile');

  const nickname = String(formData.get('nickname') ?? '').trim();
  const bio = String(formData.get('bio') ?? '').trim();
  const avatarUrl = String(formData.get('avatarUrl') ?? '').trim() || null;

  if (!nickname || nickname.length > 30) {
    redirect('/account/profile?error=昵称需要 1-30 个字符');
  }

  if (bio.length > 100) {
    redirect('/account/profile?error=简介不能超过 100 个字符');
  }

  if (avatarUrl && !isValidUrl(avatarUrl)) {
    redirect('/account/profile?error=头像地址格式不正确');
  }

  await db
    .update(users)
    .set({ nickname, bio: bio || null, avatarUrl })
    .where(eq(users.id, user.id));

  revalidatePath('/account');
  revalidatePath('/account/profile');
  redirect('/account/profile?notice=个人资料已更新');
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
