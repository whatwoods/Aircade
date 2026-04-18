import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/features/auth';
import { getWorkByIdForViewer } from '@/features/works';

type WorkDetailPageProps = {
  params: {
    workId: string;
  };
  searchParams?: {
    notice?: string | string[];
  };
};

const statusLabelMap = {
  pending: '待审核',
  live: '已上线',
  rejected: '已驳回',
  unlisted: '隐藏',
} as const;

const typeLabelMap = {
  game: '游戏',
  tool: '工具',
  social: '社交',
  ai: 'AI',
  other: '其他',
} as const;

function readMessage(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

export async function generateMetadata({
  params,
}: WorkDetailPageProps): Promise<Metadata> {
  const viewer = await getCurrentUser();
  const work = await getWorkByIdForViewer(params.workId, viewer, {
    incrementView: false,
  });

  if (!work) {
    return {
      title: '作品不存在',
    };
  }

  return {
    title: work.title,
    description: work.tagline,
  };
}

export default async function WorkDetailPage({
  params,
  searchParams,
}: WorkDetailPageProps) {
  const viewer = await getCurrentUser();
  const work = await getWorkByIdForViewer(params.workId, viewer);

  if (!work) {
    notFound();
  }

  const notice = readMessage(searchParams?.notice);
  const canSeeReviewState =
    viewer?.role === 'admin' || viewer?.id === work.author.id;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#fff8ef_0%,_#fffdf8_100%)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {notice ? (
          <div className="rounded-input border border-brand-mint/40 bg-brand-mint/20 px-4 py-3 text-sm text-brand-coffee">
            {notice}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-[30px] border border-brand-coffee/10 bg-white shadow-[0_28px_90px_rgba(61,46,31,0.1)]">
          <div
            className="min-h-[320px] bg-brand-coffee/10 bg-cover bg-center p-6 sm:p-8"
            style={{
              backgroundImage: `linear-gradient(180deg, rgba(61,46,31,0.18), rgba(61,46,31,0.55)), url(${work.coverUrl})`,
            }}
          >
            <div className="flex min-h-[256px] flex-col justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span className="bg-white/82 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-coffee">
                  {typeLabelMap[work.type]}
                </span>
                {canSeeReviewState ? (
                  <span className="rounded-full bg-brand-orange px-3 py-1 text-xs font-semibold text-white">
                    {statusLabelMap[work.status]}
                  </span>
                ) : null}
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-brand-cream">
                    {work.tagline}
                  </p>
                  <h1 className="mt-3 font-display text-4xl tracking-tight text-white sm:text-5xl">
                    {work.title}
                  </h1>
                </div>
                <div className="flex flex-wrap gap-3">
                  {work.webUrl ? (
                    <a
                      href={work.webUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:bg-brand-orange/92 rounded-btn bg-brand-orange px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_30px_rgba(255,159,107,0.28)] transition"
                    >
                      打开作品
                    </a>
                  ) : null}
                  {work.qrUrl ? (
                    <a
                      href={work.qrUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="border-white/18 hover:bg-white/16 rounded-btn border bg-white/10 px-5 py-3 text-sm font-semibold text-white transition"
                    >
                      查看二维码
                    </a>
                  ) : null}
                  <Link
                    href="/"
                    className="border-white/18 hover:bg-white/16 rounded-btn border bg-white/10 px-5 py-3 text-sm font-semibold text-white transition"
                  >
                    返回首页
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-coffee/45">
                  About
                </p>
                <p className="text-brand-coffee/72 mt-3 text-sm leading-8">
                  {work.description}
                </p>
              </div>

              {canSeeReviewState &&
              work.status === 'rejected' &&
              work.rejectReason ? (
                <div className="rounded-card border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-700">
                  <p className="font-semibold">当前驳回原因</p>
                  <p className="mt-2">{work.rejectReason}</p>
                </div>
              ) : null}

              {work.screenshots.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-coffee/45">
                    Screenshots
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {work.screenshots.map((screenshot) => (
                      <a
                        key={screenshot}
                        href={screenshot}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-brand-coffee/8 block overflow-hidden rounded-2xl border border-brand-coffee/10"
                      >
                        <div
                          className="h-40 bg-cover bg-center"
                          style={{ backgroundImage: `url(${screenshot})` }}
                        />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>

            <aside className="space-y-4 rounded-card border border-brand-coffee/10 bg-brand-milk/70 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-coffee/45">
                  Meta
                </p>
                <div className="mt-4 space-y-4 text-sm">
                  <MetaRow label="作者" value={`@${work.author.username}`} />
                  <MetaRow label="昵称" value={work.author.nickname} />
                  <MetaRow
                    label="创建时间"
                    value={formatDate(work.createdAt)}
                  />
                  <MetaRow label="查看次数" value={`${work.viewCount}`} />
                  <MetaRow label="点赞计数" value={`${work.likeCount}`} />
                  {work.reviewedAt ? (
                    <MetaRow
                      label="最近审核"
                      value={formatDate(work.reviewedAt)}
                    />
                  ) : null}
                </div>
              </div>

              {viewer?.id === work.author.id ? (
                <Link
                  href="/submit"
                  className="hover:bg-brand-coffee/92 inline-flex w-full items-center justify-center rounded-btn bg-brand-coffee px-4 py-3 text-sm font-semibold text-white transition"
                >
                  再投一个作品
                </Link>
              ) : null}

              {viewer?.role === 'admin' ? (
                <Link
                  href="/admin/works"
                  className="inline-flex w-full items-center justify-center rounded-btn border border-brand-coffee/10 bg-white px-4 py-3 text-sm font-semibold text-brand-coffee transition hover:border-brand-orange/30 hover:text-brand-orange"
                >
                  回审核后台
                </Link>
              ) : null}
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-brand-coffee/45">{label}</p>
      <p className="mt-1 break-all font-medium text-brand-coffee">{value}</p>
    </div>
  );
}
