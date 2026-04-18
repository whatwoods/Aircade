import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/features/auth';
import { WorkSubmitForm } from '@/features/works';

export const metadata: Metadata = {
  title: '提交作品',
  description: '提交作品到 Aircade，进入审核队列。',
};

type SubmitPageProps = {
  searchParams?: {
    error?: string | string[];
  };
};

function readMessage(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SubmitPage({ searchParams }: SubmitPageProps) {
  const user = await requireUser('/submit');
  const errorMessage = readMessage(searchParams?.error);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(159,227,201,0.25),_transparent_26%),linear-gradient(180deg,_#fffaf3_0%,_#fff4e3_45%,_#fffdf8_100%)] px-4 py-10 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="bg-white/88 rounded-card border border-brand-coffee/10 p-6 shadow-[0_24px_80px_rgba(61,46,31,0.12)] backdrop-blur sm:p-8">
          <div className="space-y-3">
            <span className="inline-flex rounded-full bg-brand-orange/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-brand-orange">
              New Work
            </span>
            <h1 className="font-display text-3xl tracking-tight text-brand-coffee sm:text-4xl">
              把作品挂进街机厅
            </h1>
            <p className="text-brand-coffee/72 max-w-2xl text-sm leading-7 sm:text-base">
              当前登录账号是 @{user.username}
              。这一步只做最小闭环：提交基础信息、进入审核队列、通过后出现在首页。
            </p>
          </div>

          {errorMessage ? (
            <div className="mt-6 rounded-input border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-8">
            <WorkSubmitForm />
          </div>
        </section>

        <aside className="rounded-card border border-brand-coffee/10 bg-brand-coffee p-6 text-brand-milk shadow-[0_24px_60px_rgba(61,46,31,0.18)] sm:p-8">
          <div className="space-y-5">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-orange text-2xl font-bold text-white shadow-lg shadow-brand-orange/30">
              W
            </div>
            <div className="space-y-3">
              <h2 className="font-display text-2xl tracking-tight text-white">
                当前投稿规则
              </h2>
              <div className="space-y-3 text-sm leading-7 text-brand-milk/80">
                <p>先只收最必要的信息：标题、介绍、封面、外链。</p>
                <p>提交后状态会变成待审核，管理员通过后首页才可见。</p>
                <p>二维码和网页地址至少填一个，保证别人能真的点进去。</p>
              </div>
            </div>
          </div>

          <div className="mt-10 grid gap-3">
            <Link
              href="/account"
              className="border-white/12 bg-white/8 hover:bg-white/14 rounded-btn border px-4 py-3 text-sm font-medium text-white transition hover:border-brand-cream/40"
            >
              回账号中心
            </Link>
            <Link
              href="/"
              className="border-white/12 bg-white/8 hover:bg-white/14 rounded-btn border px-4 py-3 text-sm font-medium text-white transition hover:border-brand-cream/40"
            >
              先看首页
            </Link>
            {user.role === 'admin' ? (
              <Link
                href="/admin/works"
                className="border-white/12 hover:bg-brand-orange/92 rounded-btn border bg-brand-orange px-4 py-3 text-sm font-medium text-white transition"
              >
                去审核后台
              </Link>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
