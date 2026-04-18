'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './logo';
import { Avatar } from './avatar';

type NavUser = {
  username: string;
  nickname: string;
  role: 'user' | 'admin';
} | null;

const tabs = [
  { href: '/', label: '首页', match: (p: string) => p === '/' },
  {
    href: '/discover',
    label: '发现',
    match: (p: string) => p.startsWith('/discover') || p.startsWith('/works'),
  },
  {
    href: '/submit',
    label: '提交作品',
    match: (p: string) => p.startsWith('/submit'),
  },
];

const ghostBtnStyle: React.CSSProperties = {
  background: 'var(--ac-surface)',
  border: '1px solid var(--ac-border)',
  color: 'var(--ac-fg)',
  borderRadius: 12,
};

export function Navbar({
  user,
  pendingCount = 0,
}: {
  user: NavUser;
  pendingCount?: number;
}) {
  const pathname = usePathname() ?? '/';

  return (
    <div className="ac-nav">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-8">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2"
            aria-label="Aircade 首页"
          >
            <Logo />
            <span
              className="font-display text-[22px] tracking-tight"
              style={{ color: 'var(--ac-fg)' }}
            >
              Aircade
            </span>
          </Link>

          <nav className="flex items-center gap-4 text-sm">
            {tabs.map((tab) => {
              const active = tab.match(pathname);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className="border-b-2 px-[2px] py-[6px] font-semibold transition-colors"
                  style={{
                    color: active ? 'var(--ac-primary)' : 'var(--ac-fg-soft)',
                    borderColor: active ? 'var(--ac-primary)' : 'transparent',
                  }}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 px-3 py-[7px] text-[13px] font-semibold transition-colors hover:opacity-80"
            style={ghostBtnStyle}
            aria-label="搜索作品"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            搜索
          </Link>

          {user ? (
            <>
              {user.role === 'admin' ? (
                <Link
                  href="/admin/works"
                  className="inline-flex items-center gap-2 px-3 py-[7px] text-[13px] font-semibold transition-colors hover:opacity-80"
                  style={ghostBtnStyle}
                >
                  审核后台
                  {pendingCount > 0 ? (
                    <span
                      className="rounded-full px-2 py-[1px] text-[10px] font-bold"
                      style={{
                        background: 'var(--ac-primary)',
                        color: 'var(--ac-primary-ink)',
                      }}
                    >
                      {pendingCount}
                    </span>
                  ) : null}
                </Link>
              ) : null}
              <Link
                href="/account"
                className="inline-flex items-center gap-2 px-3 py-[5px] text-[13px] font-semibold transition-colors hover:opacity-80"
                style={ghostBtnStyle}
              >
                <Avatar name={user.nickname} seed={user.username} size={22} />
                {user.nickname}
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-3 py-[7px] text-[13px] font-semibold transition-colors hover:opacity-80"
                style={ghostBtnStyle}
              >
                登录
              </Link>
              <Link
                href="/register"
                className="px-3 py-[7px] text-[13px] font-semibold transition-colors hover:brightness-105"
                style={{
                  background: 'var(--ac-primary)',
                  color: 'var(--ac-primary-ink)',
                  borderRadius: 12,
                  boxShadow:
                    '0 10px 18px color-mix(in oklch, var(--ac-primary) 32%, transparent)',
                }}
              >
                注册进站
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
