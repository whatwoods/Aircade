import Link from 'next/link';
import type { WorkSummary } from '../server/works';
import { reviewWorkAction } from '../actions';

const textareaClassName =
  'border-brand-coffee/12 min-h-24 w-full rounded-input border bg-white px-4 py-3 text-sm text-brand-coffee outline-none transition placeholder:text-brand-coffee/35 focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10';

export function AdminReviewForm({ work }: { work: WorkSummary }) {
  return (
    <article className="rounded-card border border-brand-coffee/10 bg-white p-5 shadow-[0_18px_50px_rgba(61,46,31,0.08)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-brand-coffee/45">
            <span>{work.status === 'pending' ? '待审核' : '已驳回'}</span>
            <span>@{work.author.username}</span>
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-2xl tracking-tight text-brand-coffee">
              {work.title}
            </h2>
            <p className="text-sm font-medium text-brand-orange">
              {work.tagline}
            </p>
            <p className="max-w-3xl text-sm leading-7 text-brand-coffee/70">
              {work.description}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href={`/works/${work.id}`}
              className="rounded-btn border border-brand-coffee/10 bg-brand-milk px-4 py-2 font-medium text-brand-coffee transition hover:border-brand-orange/30 hover:bg-brand-cream/55"
            >
              查看详情
            </Link>
            {work.webUrl ? (
              <a
                href={work.webUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-btn border border-brand-coffee/10 bg-white px-4 py-2 font-medium text-brand-coffee transition hover:border-brand-orange/30 hover:text-brand-orange"
              >
                打开网页
              </a>
            ) : null}
            {work.qrUrl ? (
              <a
                href={work.qrUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-btn border border-brand-coffee/10 bg-white px-4 py-2 font-medium text-brand-coffee transition hover:border-brand-orange/30 hover:text-brand-orange"
              >
                查看二维码
              </a>
            ) : null}
          </div>
        </div>

        <div
          className="h-40 w-full rounded-2xl bg-brand-coffee/10 bg-cover bg-center lg:w-64"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(61,46,31,0.05), rgba(61,46,31,0.25)), url(${work.coverUrl})`,
          }}
        />
      </div>

      <form action={reviewWorkAction} className="mt-5 space-y-4">
        <input type="hidden" name="workId" value={work.id} />
        <div className="space-y-2">
          <label
            htmlFor={`rejectReason-${work.id}`}
            className="text-sm font-medium text-brand-coffee/80"
          >
            驳回原因
          </label>
          <textarea
            id={`rejectReason-${work.id}`}
            name="rejectReason"
            defaultValue={work.rejectReason ?? ''}
            placeholder="拒绝时填写。通过时可以留空。"
            className={textareaClassName}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            name="decision"
            value="approve"
            className="hover:bg-brand-coffee/92 rounded-btn bg-brand-coffee px-4 py-2 text-sm font-semibold text-white transition"
          >
            通过并上线
          </button>
          <button
            type="submit"
            name="decision"
            value="reject"
            className="rounded-btn bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            驳回
          </button>
        </div>
      </form>
    </article>
  );
}
