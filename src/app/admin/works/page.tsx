import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/features/auth';
import { AdminReviewForm, listWorksForReview } from '@/features/works';

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

  const [pendingWorks, rejectedWorks] = await Promise.all([
    listWorksForReview('pending'),
    listWorksForReview('rejected', 8),
  ]);
  const notice = readMessage(searchParams?.notice);
  const error = readMessage(searchParams?.error);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#fff7ed_0%,_#fffdf8_100%)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-card border border-brand-coffee/10 bg-brand-coffee p-6 text-brand-milk shadow-[0_24px_60px_rgba(61,46,31,0.16)] sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-brand-cream">
                Admin Queue
              </span>
              <h1 className="font-display text-3xl tracking-tight text-white sm:text-4xl">
                作品审核台
              </h1>
              <p className="text-brand-milk/78 max-w-2xl text-sm leading-7">
                当前管理员：@{user.username}
                。这里先只做最小审核流：查看投稿、通过上线、填写原因驳回。
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="border-white/12 bg-white/8 hover:bg-white/14 rounded-btn border px-4 py-2 text-sm font-medium text-white transition"
              >
                首页
              </Link>
              <Link
                href="/submit"
                className="border-white/12 hover:bg-brand-orange/92 rounded-btn border bg-brand-orange px-4 py-2 text-sm font-medium text-white transition"
              >
                提交新作品
              </Link>
            </div>
          </div>
        </section>

        {notice ? (
          <div className="rounded-input border border-brand-mint/40 bg-brand-mint/20 px-4 py-3 text-sm text-brand-coffee">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-input border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-2xl tracking-tight text-brand-coffee">
              待审核投稿
            </h2>
            <span className="text-sm text-brand-coffee/60">
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
            <div className="border-brand-coffee/14 rounded-card border border-dashed bg-white/70 px-6 py-10 text-center text-sm text-brand-coffee/60">
              审核队列目前是空的，说明该去拉内容了。
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-2xl tracking-tight text-brand-coffee">
              最近驳回
            </h2>
            <span className="text-sm text-brand-coffee/60">
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
            <div className="border-brand-coffee/14 rounded-card border border-dashed bg-white/70 px-6 py-10 text-center text-sm text-brand-coffee/60">
              还没有驳回记录。
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
