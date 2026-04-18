import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar, HeartButton, TagChip, TypeChip } from '@/components/brand';
import { getCurrentUser } from '@/features/auth';
import {
  WorkCard,
  WorkGallery,
  getWorkByIdForViewer,
  listRecentWorksByAuthor,
} from '@/features/works';

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

const statusToneMap: Record<keyof typeof statusLabelMap, string> = {
  pending: 'ac-type-social',
  live: 'ac-type-tool',
  rejected: 'ac-type-game',
  unlisted: 'ac-type-other',
};

function readMessage(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function formatShort(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
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
    return { title: '作品不存在' };
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

  const moreRaw = await listRecentWorksByAuthor(work.author.id, 6);
  const moreByAuthor = moreRaw
    .filter((w) => w.id !== work.id && w.status === 'live')
    .slice(0, 3);

  const notice = readMessage(searchParams?.notice);
  const canSeeReviewState =
    viewer?.role === 'admin' || viewer?.id === work.author.id;
  const authorName = work.author.nickname || work.author.username;
  const shortId = work.id.slice(0, 6).toUpperCase();

  return (
    <div className="ac-page-in mx-auto max-w-6xl px-6 py-10 sm:px-8">
      <Link href="/" className="ac-btn ac-btn-sm ac-btn-ghost mb-6 inline-flex">
        ← 返回
      </Link>

      {notice ? (
        <div
          className="mb-6 rounded-[14px] px-4 py-3 text-sm"
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

      <div className="grid items-start gap-12 lg:grid-cols-[1fr_380px]">
        {/* LEFT: gallery + description */}
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <TypeChip type={work.type} size="lg" />
            {work.featuredAt ? (
              <span
                className="ac-pill"
                style={{
                  background:
                    'color-mix(in oklch, var(--ac-primary) 14%, var(--ac-surface))',
                  color: 'var(--ac-primary)',
                }}
              >
                ★ 本周精选
              </span>
            ) : null}
            {canSeeReviewState ? (
              <span className={`ac-pill ${statusToneMap[work.status]}`}>
                {statusLabelMap[work.status]}
              </span>
            ) : null}
            <span className="ac-micro" style={{ color: 'var(--ac-fg-faint)' }}>
              #{shortId}
            </span>
          </div>

          <h1
            className="font-display text-[42px] leading-[1.08] tracking-tight sm:text-[52px]"
            style={{ color: 'var(--ac-fg)' }}
          >
            {work.title}
          </h1>
          <p
            className="mt-2 text-[17px] font-semibold sm:text-[18px]"
            style={{ color: 'var(--ac-primary)' }}
          >
            {work.tagline}
          </p>

          <div className="mt-6">
            <WorkGallery work={work} />
          </div>

          {canSeeReviewState &&
          work.status === 'rejected' &&
          work.rejectReason ? (
            <div
              className="mt-6 rounded-[16px] border p-4 text-sm leading-7"
              style={{
                borderColor: 'rgba(220, 38, 38, 0.25)',
                background: 'rgba(254, 226, 226, 0.6)',
                color: '#b91c1c',
              }}
            >
              <p className="font-semibold">当前驳回原因</p>
              <p className="mt-2">{work.rejectReason}</p>
            </div>
          ) : null}

          <div className="mt-8">
            <div
              className="ac-micro mb-2.5"
              style={{ color: 'var(--ac-fg-faint)' }}
            >
              ABOUT · 关于这个作品
            </div>
            <p
              className="text-[15px] leading-[1.9] sm:text-[16px]"
              style={{ color: 'var(--ac-fg-soft)', textWrap: 'pretty' }}
            >
              {work.description}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <TagChip tag={work.type} />
              {work.featuredAt ? <TagChip tag="featured" /> : null}
            </div>
          </div>

          {moreByAuthor.length > 0 ? (
            <div
              className="mt-10 pt-8"
              style={{ borderTop: '1px dashed var(--ac-border)' }}
            >
              <div
                className="ac-micro mb-4"
                style={{ color: 'var(--ac-fg-faint)' }}
              >
                MORE BY · 同一作者
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {moreByAuthor.map((w) => (
                  <WorkCard key={w.id} work={w} />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* RIGHT: action rail */}
        <aside className="space-y-5 lg:sticky lg:top-[88px]">
          {/* Author card */}
          <div className="ac-card p-5">
            <div className="flex items-center gap-3">
              <Avatar name={authorName} seed={work.author.username} size={48} />
              <div>
                <div
                  className="font-display text-[18px]"
                  style={{ color: 'var(--ac-fg)' }}
                >
                  {authorName}
                </div>
                <div
                  className="text-[12px]"
                  style={{ color: 'var(--ac-fg-faint)' }}
                >
                  @{work.author.username}
                </div>
              </div>
            </div>
          </div>

          {/* QR / Web */}
          <div className="ac-card p-6">
            <div
              className="ac-micro mb-3"
              style={{ color: 'var(--ac-fg-faint)' }}
            >
              {work.qrUrl ? 'MINI-PROGRAM · 扫码试玩' : 'WEB · 在浏览器打开'}
            </div>

            {work.qrUrl ? (
              <div
                className="mb-4 flex aspect-square flex-col items-center justify-center overflow-hidden rounded-[14px] bg-cover bg-center"
                style={{
                  background: `url(${work.qrUrl}) center/contain no-repeat, var(--ac-bg-tint)`,
                  border: '2px dashed var(--ac-border-strong)',
                }}
              />
            ) : (
              <div
                className="mb-4 flex aspect-[16/10] items-center justify-center rounded-[14px] px-3 text-center"
                style={{
                  background: 'var(--ac-bg-tint)',
                  border: '2px dashed var(--ac-border-strong)',
                  fontFamily: 'var(--font-mono), ui-monospace, monospace',
                  fontSize: 12,
                  color: 'var(--ac-fg-faint)',
                  letterSpacing: '0.14em',
                  wordBreak: 'break-all',
                }}
              >
                {work.webUrl ?? '暂无直链'}
              </div>
            )}

            {work.webUrl ? (
              <a
                href={work.webUrl}
                target="_blank"
                rel="noreferrer"
                className="ac-btn ac-btn-primary w-full"
              >
                在新窗口打开 ↗
              </a>
            ) : work.qrUrl ? (
              <a
                href={work.qrUrl}
                target="_blank"
                rel="noreferrer"
                className="ac-btn ac-btn-ghost w-full"
              >
                查看大图二维码
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="ac-btn ac-btn-ghost w-full cursor-not-allowed opacity-60"
              >
                作者暂未提供链接
              </button>
            )}
          </div>

          {/* Stats + actions */}
          <div className="ac-card p-5">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="LIKES" value={work.likeCount} />
              <Stat label="VIEWS" value={work.viewCount} />
              <Stat label="上架" value={formatShort(work.createdAt)} small />
            </div>
            <div className="mt-4 flex items-center gap-2">
              <HeartButton initial={work.likeCount} size="lg" />
              <button
                type="button"
                className="ac-btn ac-btn-sm ac-btn-ghost flex-1"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
                收藏
              </button>
              <button
                type="button"
                className="ac-btn ac-btn-sm ac-btn-ghost flex-1"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />
                </svg>
                分享
              </button>
            </div>
            <div
              className="ac-micro mt-4"
              style={{ color: 'var(--ac-fg-faint)' }}
            >
              创建 · {formatDate(work.createdAt)}
              {work.reviewedAt
                ? ` · 审核 · ${formatDate(work.reviewedAt)}`
                : null}
            </div>
          </div>

          {viewer?.id === work.author.id ? (
            <Link href="/submit" className="ac-btn w-full">
              再投一个作品
            </Link>
          ) : null}
          {viewer?.role === 'admin' ? (
            <Link href="/admin/works" className="ac-btn w-full">
              回审核后台
            </Link>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  small,
}: {
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <div>
      <div
        className="ac-micro"
        style={{ fontSize: 10, color: 'var(--ac-fg-faint)' }}
      >
        {label}
      </div>
      <div
        className="mt-1 font-display"
        style={{
          color: 'var(--ac-fg)',
          fontSize: small ? 16 : 24,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </div>
  );
}
