import Link from 'next/link';
import type { WorkSummary } from '../server/works';

const typeLabelMap: Record<WorkSummary['type'], string> = {
  game: '游戏',
  tool: '工具',
  social: '社交',
  ai: 'AI',
  other: '其他',
};

const statusLabelMap: Record<WorkSummary['status'], string> = {
  pending: '待审核',
  live: '已上线',
  rejected: '已驳回',
  unlisted: '隐藏',
};

const statusClassMap: Record<WorkSummary['status'], string> = {
  pending: 'bg-brand-cream text-brand-coffee',
  live: 'bg-brand-mint/80 text-brand-coffee',
  rejected: 'bg-red-100 text-red-700',
  unlisted: 'bg-brand-coffee/10 text-brand-coffee/70',
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function WorkCard({ work }: { work: WorkSummary }) {
  return (
    <article className="overflow-hidden rounded-card border border-brand-coffee/10 bg-white shadow-[0_20px_60px_rgba(61,46,31,0.08)] transition hover:-translate-y-1 hover:shadow-[0_28px_80px_rgba(61,46,31,0.14)]">
      <div
        className="relative h-52 bg-brand-coffee/10 bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(61,46,31,0.08), rgba(61,46,31,0.28)), url(${work.coverUrl})`,
        }}
      >
        <div className="flex h-full items-start justify-between p-5">
          <span className="bg-white/82 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand-coffee">
            {typeLabelMap[work.type]}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClassMap[work.status]}`}
          >
            {statusLabelMap[work.status]}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.14em] text-brand-coffee/45">
            <span>@{work.author.username}</span>
            <span>{formatDate(work.createdAt)}</span>
          </div>
          <h2 className="font-display text-2xl tracking-tight text-brand-coffee">
            <Link
              href={`/works/${work.id}`}
              className="transition hover:text-brand-orange"
            >
              {work.title}
            </Link>
          </h2>
          <p className="text-sm font-medium text-brand-orange">
            {work.tagline}
          </p>
          <p className="text-brand-coffee/68 line-clamp-3 text-sm leading-7">
            {work.description}
          </p>
        </div>

        <div className="text-brand-coffee/58 flex items-center justify-between gap-4 text-sm">
          <span>{work.viewCount} 次查看</span>
          <Link
            href={`/works/${work.id}`}
            className="font-medium text-brand-coffee transition hover:text-brand-orange"
          >
            查看详情
          </Link>
        </div>
      </div>
    </article>
  );
}
