import type { Metadata } from 'next';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { Avatar } from '@/components/brand';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { getCurrentUser } from '@/features/auth';
import { updateProfile } from '@/features/users';

export const metadata: Metadata = {
  title: '编辑资料',
  description: '编辑你的个人资料，包括昵称、简介和头像。',
};

const inputClass =
  'ac-field w-full rounded-[12px] px-4 py-3 text-[14px] outline-none transition-colors';

const inputStyle: React.CSSProperties = {
  background: 'var(--ac-surface)',
  border: '1px solid var(--ac-border)',
  color: 'var(--ac-fg)',
};

type ProfilePageProps = {
  searchParams?: {
    notice?: string | string[];
    error?: string | string[];
  };
};

function readMessage(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect('/login?next=/account/profile');
  }

  // Fetch full user record including bio and avatarUrl
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      nickname: users.nickname,
      bio: users.bio,
      avatarUrl: users.avatarUrl,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, currentUser.id))
    .limit(1);

  if (!user) {
    redirect('/login');
  }

  const noticeMessage = readMessage(searchParams?.notice);
  const errorMessage = readMessage(searchParams?.error);

  return (
    <div className="ac-page-in mx-auto max-w-6xl px-6 py-10 sm:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <div className="ac-micro mb-2" style={{ color: 'var(--ac-primary)' }}>
            PROFILE · 编辑资料
          </div>
          <h1
            className="font-display text-[36px] leading-tight tracking-tight sm:text-[40px]"
            style={{ color: 'var(--ac-fg)' }}
          >
            编辑个人资料
          </h1>
          <p
            className="mt-2 text-[14px] leading-7"
            style={{ color: 'var(--ac-fg-soft)' }}
          >
            更新你的昵称、简介和头像。
          </p>
        </div>

        {/* Notices */}
        {noticeMessage ? (
          <div
            className="mb-6 rounded-[14px] px-4 py-3 text-sm"
            style={{
              background: 'rgba(220, 252, 231, 0.6)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              color: '#15803d',
            }}
          >
            {noticeMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div
            className="mb-6 rounded-[14px] px-4 py-3 text-sm"
            style={{
              background: 'rgba(254, 226, 226, 0.6)',
              border: '1px solid rgba(220, 38, 38, 0.25)',
              color: '#b91c1c',
            }}
          >
            {errorMessage}
          </div>
        ) : null}

        <form action={updateProfile} className="space-y-6">
          {/* Account info (read-only) */}
          <div className="ac-card p-5">
            <div
              className="ac-micro mb-4"
              style={{ color: 'var(--ac-fg-faint)' }}
            >
              ACCOUNT · 账号信息
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div
                  className="mb-2 block text-[13px] font-medium"
                  style={{ color: 'var(--ac-fg-soft)' }}
                >
                  用户名
                </div>
                <div
                  className="rounded-[12px] px-4 py-3 text-[14px]"
                  style={{
                    background: 'var(--ac-surface-soft)',
                    border: '1px solid var(--ac-border)',
                    color: 'var(--ac-fg)',
                  }}
                >
                  @{user.username}
                </div>
              </div>
              <div>
                <div
                  className="mb-2 block text-[13px] font-medium"
                  style={{ color: 'var(--ac-fg-soft)' }}
                >
                  角色
                </div>
                <div
                  className="rounded-[12px] px-4 py-3 text-[14px]"
                  style={{
                    background: 'var(--ac-surface-soft)',
                    border: '1px solid var(--ac-border)',
                    color: 'var(--ac-fg)',
                  }}
                >
                  {user.role === 'admin' ? '★ 管理员' : '群友作者'}
                </div>
              </div>
            </div>
          </div>

          {/* Avatar preview */}
          <div className="ac-card p-5">
            <div
              className="ac-micro mb-4"
              style={{ color: 'var(--ac-fg-faint)' }}
            >
              AVATAR · 头像预览
            </div>
            <div className="flex items-center gap-4">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.nickname}
                  className="h-20 w-20 rounded-full object-cover"
                  style={{ border: '2px solid var(--ac-border)' }}
                />
              ) : (
                <Avatar
                  name={user.nickname || user.username}
                  seed={user.username}
                  size={80}
                />
              )}
              <div>
                <div
                  className="text-[15px] font-medium"
                  style={{ color: 'var(--ac-fg)' }}
                >
                  {user.nickname}
                </div>
                <div
                  className="text-[13px]"
                  style={{ color: 'var(--ac-fg-soft)' }}
                >
                  {user.avatarUrl ? '自定义头像' : '使用默认头像'}
                </div>
              </div>
            </div>
          </div>

          {/* Editable fields */}
          <div className="ac-card p-5">
            <div
              className="ac-micro mb-4"
              style={{ color: 'var(--ac-fg-faint)' }}
            >
              EDIT · 修改资料
            </div>

            <div className="space-y-5">
              {/* Nickname */}
              <div>
                <label
                  htmlFor="nickname"
                  className="mb-2 block text-[13px] font-medium"
                  style={{ color: 'var(--ac-fg)' }}
                >
                  昵称{' '}
                  <span style={{ color: 'var(--ac-fg-faint)' }}>*必填</span>
                </label>
                <input
                  id="nickname"
                  name="nickname"
                  type="text"
                  required
                  maxLength={30}
                  defaultValue={user.nickname}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="你的昵称"
                />
              </div>

              {/* Bio */}
              <div>
                <label
                  htmlFor="bio"
                  className="mb-2 block text-[13px] font-medium"
                  style={{ color: 'var(--ac-fg)' }}
                >
                  简介
                </label>
                <textarea
                  id="bio"
                  name="bio"
                  maxLength={200}
                  rows={3}
                  defaultValue={user.bio ?? ''}
                  className="ac-field w-full resize-y rounded-[12px] px-4 py-3 text-[14px] outline-none"
                  style={inputStyle}
                  placeholder="一句话介绍自己"
                />
                <div
                  className="mt-1.5 text-right text-[12px]"
                  style={{ color: 'var(--ac-fg-faint)' }}
                >
                  最多 200 字
                </div>
              </div>

              {/* Avatar URL */}
              <div>
                <label
                  htmlFor="avatarUrl"
                  className="mb-2 block text-[13px] font-medium"
                  style={{ color: 'var(--ac-fg)' }}
                >
                  头像地址{' '}
                  <span style={{ color: 'var(--ac-fg-faint)' }}>（可选）</span>
                </label>
                <input
                  id="avatarUrl"
                  name="avatarUrl"
                  type="url"
                  maxLength={500}
                  defaultValue={user.avatarUrl ?? ''}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="https://example.com/avatar.png"
                />
                <div
                  className="mt-1.5 text-[12px]"
                  style={{ color: 'var(--ac-fg-faint)' }}
                >
                  填写图片 URL，留空使用默认头像
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button type="submit" className="ac-btn ac-btn-primary ac-btn-lg">
              保存修改
            </button>
            <Link href="/account" className="ac-btn ac-btn-ghost ac-btn-lg">
              返回账号中心
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
