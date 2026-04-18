import type { Metadata } from 'next';
import Link from 'next/link';
import { Avatar } from '@/components/brand';
import { LogoutForm, requireUser } from '@/features/auth';
import { WorkCard, listRecentWorksByAuthor } from '@/features/works';

export const metadata: Metadata = {
  title: '账号中心',
  description: '查看当前登录账号、最近投稿与可操作的动作。',
};

function formatDate(value: Date | null) {
  if (!value) return '暂无';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

export default async function AccountPage() {
  const user = await requireUser('/account');
  const recentWorks = await listRecentWorksByAuthor(user.id, 8);

  const liveCount = recentWorks.filter((w) => w.status === 'live').length;
  const pendingCount = recentWorks.filter((w) => w.status === 'pending').length;
  const rejectedCount = recentWorks.filter(
    (w) => w.status === 'rejected'
  ).length;

  return (
    <div className="ac-page-in mx-auto max-w-6xl px-6 py-10 sm:px-8">
      <div className="grid items-start gap-8 lg:grid-cols-[260px_1fr]">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-[88px]">
          <div className="ac-card overflow-hidden">
            <div
              className="px-5 py-5"
              style={{
                background:
                  'linear-gradient(135deg, color-mix(in oklch, var(--ac-primary) 25%, var(--ac-surface)), var(--ac-surface))',
                borderBottom: '1px solid var(--ac-border)',
              }}
            >
              <div className="flex items-center gap-3">
                <Avatar
                  name={user.nickname || user.username}
                  seed={user.username}
                  size={48}
                />
                <div className="min-w-0">
                  <div
                    className="truncate font-display text-[18px] leading-tight"
                    style={{ color: 'var(--ac-fg)' }}
                  >
                    {user.nickname}
                  </div>
                  <div
                    className="truncate text-[12px]"
                    style={{ color: 'var(--ac-fg-faint)' }}
                  >
                    @{user.username}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span
                  className="ac-pill"
                  style={{
                    background:
                      user.role === 'admin'
                        ? 'color-mix(in oklch, var(--ac-primary) 18%, var(--ac-surface))'
                        : 'var(--ac-surface-soft)',
                    color:
                      user.role === 'admin'
                        ? 'var(--ac-primary)'
                        : 'var(--ac-fg-soft)',
                    fontSize: 11,
                  }}
                >
                  {user.role === 'admin' ? '★ 管理员' : '群友作者'}
                </span>
                <span
                  className="ac-pill"
                  style={{ fontSize: 11, color: 'var(--ac-fg-soft)' }}
                >
                  {user.status === 'active' ? '正常' : '封禁'}
                </span>
              </div>
            </div>

            <nav className="flex flex-col p-2">
              <SidebarLink href="#submissions" label="我的投稿" active />
              <SidebarLink href="#account-meta" label="账号信息" />
              <SidebarLink href="/submit" label="提交新作品" emphasis />
              {user.role === 'admin' ? (
                <SidebarLink href="/admin/works" label="审核后台" />
              ) : null}
              <SidebarLink href="/" label="回首页" />
            </nav>

            <div
              className="border-t p-3"
              style={{ borderColor: 'var(--ac-border)' }}
            >
              <LogoutForm />
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="space-y-10">
          {/* Greeting */}
          <section>
            <div
              className="ac-micro mb-2"
              style={{ color: 'var(--ac-primary)' }}
            >
              ACCOUNT · 账号中心
            </div>
            <h1
              className="font-display text-[36px] leading-tight tracking-tight sm:text-[40px]"
              style={{ color: 'var(--ac-fg)' }}
            >
              嗨，{user.nickname}
            </h1>
            <p
              className="mt-2 max-w-2xl text-[14px] leading-7"
              style={{ color: 'var(--ac-fg-soft)' }}
            >
              这里能看到你的账号状态和最近投稿。想再丢一个作品就去提交页；想看别人最近做了啥就回首页。
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <MiniStat label="已上线" value={liveCount} tone="tool" />
              <MiniStat label="待审核" value={pendingCount} tone="social" />
              <MiniStat label="已驳回" value={rejectedCount} tone="game" />
            </div>
          </section>

          {/* Submissions */}
          <section id="submissions">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <div
                  className="ac-micro"
                  style={{ color: 'var(--ac-fg-faint)' }}
                >
                  SUBMISSIONS · 你的投稿
                </div>
                <h2
                  className="mt-1 font-display text-[26px] leading-tight"
                  style={{ color: 'var(--ac-fg)' }}
                >
                  最近丢出来的
                </h2>
              </div>
              <Link href="/submit" className="ac-btn ac-btn-sm ac-btn-primary">
                + 新投稿
              </Link>
            </div>

            {recentWorks.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2">
                {recentWorks.map((work) => (
                  <WorkCard key={work.id} work={work} showStatus />
                ))}
              </div>
            ) : (
              <div
                className="rounded-[22px] border border-dashed px-6 py-14 text-center"
                style={{
                  borderColor: 'var(--ac-border-strong)',
                  background: 'var(--ac-surface-soft)',
                }}
              >
                <div className="mb-3 text-[44px]">🎮</div>
                <div
                  className="font-display text-[22px]"
                  style={{ color: 'var(--ac-fg)' }}
                >
                  还没有投稿记录
                </div>
                <p
                  className="mx-auto mt-2 max-w-md text-[13.5px] leading-7"
                  style={{ color: 'var(--ac-fg-soft)' }}
                >
                  丢一个最近做的小东西进来吧。审核一般 24h
                  内，通过后就会出现在首页。
                </p>
                <Link
                  href="/submit"
                  className="ac-btn ac-btn-primary mt-5 inline-flex"
                >
                  提交第一个作品 →
                </Link>
              </div>
            )}
          </section>

          {/* Account meta */}
          <section id="account-meta">
            <div className="ac-micro" style={{ color: 'var(--ac-fg-faint)' }}>
              META · 账号信息
            </div>
            <h2
              className="mt-1 font-display text-[22px] leading-tight"
              style={{ color: 'var(--ac-fg)' }}
            >
              系统登记的内容
            </h2>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <InfoCell
                label="角色"
                value={user.role === 'admin' ? '管理员' : '普通用户'}
              />
              <InfoCell
                label="状态"
                value={user.status === 'active' ? '正常' : '封禁'}
              />
              <InfoCell label="Slug" value={user.slug} mono />
              <InfoCell label="邮箱" value={user.email ?? '未填写'} />
              <InfoCell label="注册方式" value="直接注册开放加入" />
              <InfoCell label="最近登录" value={formatDate(user.lastLoginAt)} />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function SidebarLink({
  href,
  label,
  active,
  emphasis,
}: {
  href: string;
  label: string;
  active?: boolean;
  emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-[12px] px-3 py-2.5 text-[13.5px] transition-colors"
      style={{
        background: active ? 'var(--ac-bg-tint)' : 'transparent',
        color: emphasis ? 'var(--ac-primary)' : 'var(--ac-fg)',
        fontWeight: active || emphasis ? 600 : 500,
      }}
    >
      <span>{label}</span>
      <span aria-hidden style={{ color: 'var(--ac-fg-faint)', fontSize: 12 }}>
        ›
      </span>
    </Link>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'game' | 'tool' | 'social' | 'ai';
}) {
  return (
    <div className="ac-card relative overflow-hidden p-4">
      <div
        aria-hidden
        className="absolute -right-5 -top-5 h-16 w-16 rounded-full opacity-55 blur-[1px]"
        style={{ background: `var(--t-${tone})` }}
      />
      <div
        className="ac-micro relative"
        style={{ color: 'var(--ac-fg-faint)' }}
      >
        {label}
      </div>
      <div
        className="relative mt-1 font-display text-[28px] leading-none"
        style={{ color: 'var(--ac-fg)' }}
      >
        {value}
      </div>
    </div>
  );
}

function InfoCell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      className="rounded-[14px] p-4"
      style={{
        background: 'var(--ac-surface-soft)',
        border: '1px solid var(--ac-border)',
      }}
    >
      <div className="ac-micro" style={{ color: 'var(--ac-fg-faint)' }}>
        {label}
      </div>
      <div
        className="mt-1.5 break-all text-[14px] font-medium"
        style={{
          color: 'var(--ac-fg)',
          fontFamily: mono
            ? 'var(--font-mono), ui-monospace, monospace'
            : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}
