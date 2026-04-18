import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/features/auth';
import {
  AdminReviewForm,
  countPendingWorks,
  getSiteStats,
  listWorksForReview,
} from '@/features/works';

export const metadata: Metadata = {
  title: '作品审核',
  description: '管理员审核 Aircade 的投稿作品。',
};

type AdminWorksPageProps = {
  searchParams?: {
    error?: string | string[];
    notice?: string | string[];
  };
};

function readMessage(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminWorksPage({
  searchParams,
}: AdminWorksPageProps) {
  const user = await requireUser('/admin/works');

  if (user.role !== 'admin') {
    redirect('/account');
  }

  const [pendingWorks, rejectedWorks, pendingCount, stats] = await Promise.all([
    listWorksForReview('pending'),
    listWorksForReview('rejected', 8),
    countPendingWorks(),
    getSiteStats(),
  ]);

  const notice = readMessage(searchParams?.notice);
  const error = readMessage(searchParams?.error);

  return (
    <div className="ac-page-in mx-auto max-w-6xl px-6 py-10 sm:px-8">
      {/* Header */}
      <header className="mb-8">
        <div className="ac-micro mb-2" style={{ color: 'var(--ac-primary)' }}>
          ADMIN · 审核后台
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1
            className="font-display text-[36px] leading-tight tracking-tight sm:text-[40px]"
            style={{ color: 'var(--ac-fg)' }}
          >
            作品审核台
          </h1>
          <p className="text-[13px]" style={{ color: 'var(--ac-fg-soft)' }}>
            当前管理员：
            <span style={{ color: 'var(--ac-fg)' }}>@{user.username}</span>
          </p>
        </div>
      </header>

      {/* Stats bar */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="待审核" value={pendingCount} accent tone="game" />
        <StatCard label="已上线" value={stats.works} tone="tool" />
        <StatCard label="群友作者" value={stats.authors} tone="social" />
        <StatCard label="累计点赞" value={stats.likes} tone="ai" />
      </div>

      {/* Flash messages */}
      {notice ? (
        <div
          className="mb-4 rounded-[14px] px-4 py-3 text-sm"
          style={{
            background:
              'color-mix(in oklch, var(--ac-mint) 30%, var(--ac-surface))',
            border: '1px solid var(--ac-border)',
            color: 'var(--ac-fg)',
          }}
        >
          {notice}
        </div>
      ) : null}
      {error ? (
        <div
          className="mb-4 rounded-[14px] px-4 py-3 text-sm"
          style={{
            background: 'rgba(254, 226, 226, 0.6)',
            border: '1px solid rgba(220, 38, 38, 0.25)',
            color: '#b91c1c',
          }}
        >
          {error}
        </div>
      ) : null}

      {/* Pending queue */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="ac-micro" style={{ color: 'var(--ac-primary)' }}>
              QUEUE · 待审核
            </div>
            <h2
              className="mt-1 font-display text-[26px] leading-tight"
              style={{ color: 'var(--ac-fg)' }}
            >
              {pendingWorks.length > 0 ? '还有活儿' : '队列清空了'}
            </h2>
          </div>
          <span
            className="ac-pill"
            style={{
              background:
                'color-mix(in oklch, var(--ac-primary) 14%, var(--ac-surface))',
              color: 'var(--ac-primary)',
            }}
          >
            {pendingWorks.length} 条
          </span>
        </div>

        {pendingWorks.length > 0 ? (
          <div className="space-y-4">
            {pendingWorks.map((work) => (
              <AdminReviewForm key={work.id} work={work} />
            ))}
          </div>
        ) : (
          <div
            className="rounded-[22px] border border-dashed px-6 py-12 text-center text-sm"
            style={{
              borderColor: 'var(--ac-border-strong)',
              background: 'var(--ac-surface-soft)',
              color: 'var(--ac-fg-soft)',
            }}
          >
            当前没有待审核的投稿。该去群里催催了。
          </div>
        )}
      </section>

      {/* Rejected history */}
      <section className="mt-12 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="ac-micro" style={{ color: 'var(--ac-fg-faint)' }}>
              HISTORY · 最近驳回
            </div>
            <h2
              className="mt-1 font-display text-[22px] leading-tight"
              style={{ color: 'var(--ac-fg)' }}
            >
              最近处理过的
            </h2>
          </div>
          <span className="ac-pill" style={{ color: 'var(--ac-fg-soft)' }}>
            {rejectedWorks.length} 条
          </span>
        </div>

        {rejectedWorks.length > 0 ? (
          <div className="space-y-4">
            {rejectedWorks.map((work) => (
              <AdminReviewForm key={work.id} work={work} />
            ))}
          </div>
        ) : (
          <div
            className="rounded-[22px] border border-dashed px-6 py-10 text-center text-sm"
            style={{
              borderColor: 'var(--ac-border)',
              background: 'var(--ac-bg-tint)',
              color: 'var(--ac-fg-soft)',
            }}
          >
            还没有驳回记录。
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: number;
  accent?: boolean;
  tone: 'game' | 'tool' | 'social' | 'ai';
}) {
  return (
    <div className="ac-card relative overflow-hidden p-5">
      <div
        aria-hidden
        className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-55 blur-[2px]"
        style={{ background: `var(--t-${tone})` }}
      />
      <div
        className="ac-micro relative"
        style={{ color: accent ? 'var(--ac-primary)' : 'var(--ac-fg-faint)' }}
      >
        {label}
      </div>
      <div
        className="relative mt-1.5 font-display text-[32px] leading-none"
        style={{ color: 'var(--ac-fg)' }}
      >
        {value}
      </div>
    </div>
  );
}
