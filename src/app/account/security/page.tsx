import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/features/auth';
import { changePasswordAction, deleteAccountAction } from '@/features/auth';

export const metadata: Metadata = {
  title: '安全设置',
  description: '修改密码、删除账号等安全操作。',
};

const inputClass =
  'ac-field w-full rounded-[12px] px-4 py-3 text-[14px] outline-none transition-colors';

const inputStyle: React.CSSProperties = {
  background: 'var(--ac-surface)',
  border: '1px solid var(--ac-border)',
  color: 'var(--ac-fg)',
};

type SecurityPageProps = {
  searchParams?: {
    notice?: string | string[];
    error?: string | string[];
  };
};

function readMessage(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SecurityPage({
  searchParams,
}: SecurityPageProps) {
  await requireUser('/account/security');

  const noticeMessage = readMessage(searchParams?.notice);
  const errorMessage = readMessage(searchParams?.error);

  return (
    <div className="ac-page-in mx-auto max-w-6xl px-6 py-10 sm:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <div className="ac-micro mb-2" style={{ color: 'var(--ac-primary)' }}>
            SECURITY · 安全设置
          </div>
          <h1
            className="font-display text-[36px] leading-tight tracking-tight sm:text-[40px]"
            style={{ color: 'var(--ac-fg)' }}
          >
            安全设置
          </h1>
          <p
            className="mt-2 text-[14px] leading-7"
            style={{ color: 'var(--ac-fg-soft)' }}
          >
            修改密码或删除账号。
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

        {/* Change Password */}
        <form action={changePasswordAction} className="space-y-6">
          <div className="ac-card p-5">
            <div
              className="ac-micro mb-4"
              style={{ color: 'var(--ac-fg-faint)' }}
            >
              PASSWORD · 修改密码
            </div>

            <div className="space-y-5">
              <div>
                <label
                  htmlFor="currentPassword"
                  className="mb-2 block text-[13px] font-medium"
                  style={{ color: 'var(--ac-fg)' }}
                >
                  当前密码
                </label>
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  required
                  autoComplete="current-password"
                  className={inputClass}
                  style={inputStyle}
                  placeholder="输入当前密码"
                />
              </div>

              <div>
                <label
                  htmlFor="newPassword"
                  className="mb-2 block text-[13px] font-medium"
                  style={{ color: 'var(--ac-fg)' }}
                >
                  新密码{' '}
                  <span style={{ color: 'var(--ac-fg-faint)' }}>至少 8 位</span>
                </label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={inputClass}
                  style={inputStyle}
                  placeholder="输入新密码"
                />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="mb-2 block text-[13px] font-medium"
                  style={{ color: 'var(--ac-fg)' }}
                >
                  确认新密码
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={inputClass}
                  style={inputStyle}
                  placeholder="再次输入新密码"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" className="ac-btn ac-btn-primary ac-btn-lg">
              修改密码
            </button>
            <Link href="/account" className="ac-btn ac-btn-ghost ac-btn-lg">
              返回账号中心
            </Link>
          </div>
        </form>

        {/* Delete Account */}
        <div className="mt-12">
          <div
            className="rounded-[14px] p-5"
            style={{
              background: 'rgba(254, 226, 226, 0.3)',
              border: '1px solid rgba(220, 38, 38, 0.2)',
            }}
          >
            <div className="ac-micro mb-4" style={{ color: '#b91c1c' }}>
              DANGER · 危险操作
            </div>
            <h2
              className="font-display text-[22px] leading-tight"
              style={{ color: '#b91c1c' }}
            >
              删除账号
            </h2>
            <p
              className="mt-2 text-[13.5px] leading-6"
              style={{ color: '#991b1b' }}
            >
              删除账号后，你的所有作品、点赞、收藏和会话将被永久清除，且无法恢复。
            </p>

            <form
              action={deleteAccountAction}
              className="mt-5"
              onSubmit={(e) => {
                if (!confirm('确定删除账号？此操作不可逆')) {
                  e.preventDefault();
                }
              }}
            >
              <div className="mb-4">
                <label
                  htmlFor="deletePassword"
                  className="mb-2 block text-[13px] font-medium"
                  style={{ color: '#991b1b' }}
                >
                  输入密码确认删除
                </label>
                <input
                  id="deletePassword"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className={inputClass}
                  style={{
                    ...inputStyle,
                    borderColor: 'rgba(220, 38, 38, 0.3)',
                  }}
                  placeholder="输入你的密码"
                />
              </div>
              <button
                type="submit"
                className="ac-btn ac-btn-lg"
                style={{
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 600,
                }}
              >
                删除账号
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
