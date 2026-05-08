'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
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
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  return (
    <>
      <div className="ac-nav">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-4 sm:px-8">
          {/* Left: logo + desktop nav */}
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

            {/* Desktop nav tabs */}
            <nav className="hidden items-center gap-4 text-sm md:flex">
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

          {/* Right: desktop buttons + mobile hamburger */}
          <div className="flex items-center gap-2.5">
            {/* Desktop right side */}
            <div className="hidden items-center gap-2.5 md:flex">
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
                    <Avatar
                      name={user.nickname}
                      seed={user.username}
                      size={22}
                    />
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

            {/* Mobile hamburger */}
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors md:hidden"
              style={{ color: 'var(--ac-fg)' }}
              onClick={() => setDrawerOpen(true)}
              aria-label="打开菜单"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer overlay + panel */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="ac-drawer-backdrop absolute inset-0"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Panel */}
          <nav
            className="ac-drawer-panel absolute right-0 top-0 flex h-full w-[280px] flex-col overflow-y-auto"
            style={{
              background: 'var(--ac-bg)',
              borderLeft: '1px solid var(--ac-border)',
              boxShadow: '0 0 48px rgba(61, 46, 31, 0.18)',
            }}
          >
            {/* Drawer header */}
            <div className="flex h-16 items-center justify-between px-5">
              <span
                className="font-display text-[18px]"
                style={{ color: 'var(--ac-fg)' }}
              >
                菜单
              </span>
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
                style={{ color: 'var(--ac-fg-soft)' }}
                onClick={() => setDrawerOpen(false)}
                aria-label="关闭菜单"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--ac-border)' }} />

            {/* Nav links */}
            <div className="flex flex-col gap-1 px-3 py-4">
              {tabs.map((tab) => {
                const active = tab.match(pathname);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className="rounded-xl px-4 py-3 text-[15px] font-semibold transition-colors"
                    style={{
                      color: active ? 'var(--ac-primary)' : 'var(--ac-fg)',
                      background: active
                        ? 'color-mix(in oklch, var(--ac-primary) 10%, transparent)'
                        : 'transparent',
                    }}
                  >
                    {tab.label}
                  </Link>
                );
              })}

              <Link
                href="/discover"
                className="mt-1 flex items-center gap-2 rounded-xl px-4 py-3 text-[15px] font-semibold transition-colors"
                style={{ color: 'var(--ac-fg-soft)' }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                搜索作品
              </Link>

              {user?.role === 'admin' ? (
                <Link
                  href="/admin/works"
                  className="flex items-center gap-2 rounded-xl px-4 py-3 text-[15px] font-semibold transition-colors"
                  style={{ color: 'var(--ac-fg-soft)' }}
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
            </div>

            <div className="flex-1" />

            {/* Drawer footer: auth actions */}
            <div
              className="flex flex-col gap-2 px-5 py-5"
              style={{ borderTop: '1px solid var(--ac-border)' }}
            >
              {user ? (
                <>
                  <Link
                    href="/account"
                    className="flex items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-semibold transition-colors"
                    style={ghostBtnStyle}
                  >
                    <Avatar
                      name={user.nickname}
                      seed={user.username}
                      size={24}
                    />
                    {user.nickname}
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/register"
                    className="rounded-xl px-4 py-3 text-center text-[14px] font-semibold transition-colors hover:brightness-105"
                    style={{
                      background: 'var(--ac-primary)',
                      color: 'var(--ac-primary-ink)',
                      boxShadow:
                        '0 10px 18px color-mix(in oklch, var(--ac-primary) 32%, transparent)',
                    }}
                  >
                    注册进站
                  </Link>
                  <Link
                    href="/login"
                    className="rounded-xl px-4 py-3 text-center text-[14px] font-semibold transition-colors hover:opacity-80"
                    style={ghostBtnStyle}
                  >
                    已有账号 · 登录
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}
