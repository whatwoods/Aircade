import Link from 'next/link';
import { Avatar, Cover, HeartButton, TypeChip } from '@/components/brand';
import type { WorkSummary } from '../server/works';

type WorkCardProps = {
  work: WorkSummary;
  variant?: 'default' | 'featured';
  showStatus?: boolean;
};

const statusLabelMap: Record<WorkSummary['status'], string> = {
  pending: '待审核',
  live: '已上线',
  rejected: '已驳回',
  unlisted: '隐藏',
};

const statusToneMap: Record<WorkSummary['status'], string> = {
  pending:
    'bg-[color-mix(in_oklch,var(--ac-primary),white_65%)] text-[var(--ac-fg)]',
  live: 'bg-[color-mix(in_oklch,var(--t-social),white_55%)] text-[var(--ac-fg)]',
  rejected: 'bg-red-100 text-red-700',
  unlisted: 'bg-[var(--ac-bg-tint)] text-[var(--ac-fg-soft)]',
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function WorkCard({
  work,
  variant = 'default',
  showStatus = false,
}: WorkCardProps) {
  const href = `/works/${work.id}`;
  const isFeatured = variant === 'featured';
  const authorName = work.author.nickname || work.author.username;
  const coverSeed = `${work.id}-${work.type}`;

  return (
    <article
      className="ac-lift group relative overflow-hidden rounded-[22px] border bg-[var(--ac-surface)]"
      style={{ borderColor: 'var(--ac-border)' }}
    >
      <Link
        href={href}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ac-primary)]"
      >
        <Cover
          seed={coverSeed}
          coverUrl={work.coverUrl}
          ratio={isFeatured ? '16 / 10' : '4 / 3'}
          label={`${work.type.toUpperCase()} · ${formatDate(work.createdAt)}`}
        />
      </Link>

      <div className="flex items-start justify-between gap-2 px-5 pt-5">
        <TypeChip type={work.type} size={isFeatured ? 'lg' : 'sm'} />
        <div className="flex items-center gap-2">
          {work.featuredAt ? (
            <span className="ac-pill ac-type-ai" style={{ fontSize: 11 }}>
              ★ 精选
            </span>
          ) : null}
          {showStatus ? (
            <span
              className={`ac-pill ${statusToneMap[work.status]}`}
              style={{ fontSize: 11 }}
            >
              {statusLabelMap[work.status]}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 px-5 pb-5 pt-3">
        <div className="space-y-1.5">
          <h3
            className={`font-display tracking-tight text-[var(--ac-fg)] ${
              isFeatured
                ? 'text-[26px] leading-[1.1]'
                : 'text-[20px] leading-[1.15]'
            }`}
          >
            <Link
              href={href}
              className="transition-colors hover:text-[var(--ac-primary)]"
            >
              {work.title}
            </Link>
          </h3>
          <p
            className="text-[13px] font-medium"
            style={{ color: 'var(--ac-primary)' }}
          >
            {work.tagline}
          </p>
        </div>

        {isFeatured ? (
          <p
            className="line-clamp-2 text-[13.5px] leading-6"
            style={{ color: 'var(--ac-fg-soft)' }}
          >
            {work.description}
          </p>
        ) : null}

        <div
          className="flex items-center justify-between gap-3 pt-1"
          style={{ borderTop: '1px dashed var(--ac-border)' }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={authorName} seed={work.author.username} size={30} />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[12.5px] font-semibold text-[var(--ac-fg)]">
                {authorName}
              </div>
              <div
                className="ac-micro truncate"
                style={{ color: 'var(--ac-fg-soft)' }}
              >
                @{work.author.username}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="ac-micro" style={{ color: 'var(--ac-fg-soft)' }}>
              {work.viewCount}👁
            </span>
            <HeartButton initial={work.likeCount} />
          </div>
        </div>
      </div>
    </article>
  );
}
