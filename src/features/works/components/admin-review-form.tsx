'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { Avatar, Cover, TypeChip } from '@/components/brand';
import type { WorkSummary } from '../server/works';
import { reviewWorkAction } from '../actions';

const statusPillClass: Record<WorkSummary['status'], string> = {
  pending: 'ac-type-social',
  live: 'ac-type-tool',
  rejected: 'ac-type-game',
  unlisted: 'ac-type-other',
};

const statusLabel: Record<WorkSummary['status'], string> = {
  pending: '待审核',
  live: '已上线',
  rejected: '已驳回',
  unlisted: '隐藏',
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

export function AdminReviewForm({ work }: { work: WorkSummary }) {
  const authorName = work.author.nickname || work.author.username;
  const formRef = useRef<HTMLFormElement>(null);
  const approveRef = useRef<HTMLButtonElement>(null);
  const rejectRef = useRef<HTMLButtonElement>(null);

  function handleShortcut(event: React.KeyboardEvent<HTMLFormElement>) {
    if (!event.metaKey && !event.ctrlKey) {
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      formRef.current?.requestSubmit(approveRef.current ?? undefined);
      return;
    }

    if ((event.key === 'R' || event.key === 'r') && event.shiftKey) {
      event.preventDefault();
      formRef.current?.requestSubmit(rejectRef.current ?? undefined);
    }
  }

  return (
    <article className="ac-card overflow-hidden">
      <div className="grid gap-5 p-5 lg:grid-cols-[240px_1fr]">
        <Cover
          seed={`${work.id}-${work.type}`}
          coverUrl={work.coverUrl}
          ratio="4 / 3"
          label={`#${work.id.slice(0, 6).toUpperCase()}`}
        />

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <TypeChip type={work.type} />
            <span className={`ac-pill ${statusPillClass[work.status]}`}>
              {statusLabel[work.status]}
            </span>
            <span className="ac-micro" style={{ color: 'var(--ac-fg-faint)' }}>
              {formatDate(work.createdAt)}
            </span>
          </div>

          <div>
            <h3
              className="font-display text-[24px] leading-tight tracking-tight"
              style={{ color: 'var(--ac-fg)' }}
            >
              {work.title}
            </h3>
            <p
              className="mt-1 text-[14px] font-semibold"
              style={{ color: 'var(--ac-primary)' }}
            >
              {work.tagline}
            </p>
          </div>

          <p
            className="max-w-3xl text-[13.5px] leading-7"
            style={{ color: 'var(--ac-fg-soft)' }}
          >
            {work.description}
          </p>

          <div className="flex items-center gap-2">
            <Avatar name={authorName} seed={work.author.username} size={28} />
            <div className="leading-tight">
              <div
                className="text-[13px] font-semibold"
                style={{ color: 'var(--ac-fg)' }}
              >
                {authorName}
              </div>
              <div className="ac-micro" style={{ color: 'var(--ac-fg-faint)' }}>
                @{work.author.username}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/works/${work.id}`}
              className="ac-btn ac-btn-sm ac-btn-ghost"
            >
              查看详情
            </Link>
            {work.webUrl ? (
              <a
                href={work.webUrl}
                target="_blank"
                rel="noreferrer"
                className="ac-btn ac-btn-sm ac-btn-ghost"
              >
                打开网页 ↗
              </a>
            ) : null}
            {work.qrUrl ? (
              <a
                href={work.qrUrl}
                target="_blank"
                rel="noreferrer"
                className="ac-btn ac-btn-sm ac-btn-ghost"
              >
                看二维码
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <form
        ref={formRef}
        action={reviewWorkAction}
        className="space-y-3 border-t p-5"
        style={{
          borderColor: 'var(--ac-border)',
          background: 'var(--ac-bg-tint)',
        }}
        onKeyDown={handleShortcut}
      >
        <input type="hidden" name="workId" value={work.id} />
        <div>
          <label
            htmlFor={`rejectReason-${work.id}`}
            className="ac-micro mb-2 block"
            style={{ color: 'var(--ac-fg-faint)' }}
          >
            REVIEW NOTE · 驳回时填写
          </label>
          <textarea
            id={`rejectReason-${work.id}`}
            name="rejectReason"
            defaultValue={work.rejectReason ?? ''}
            rows={2}
            className="ac-field w-full resize-y rounded-[12px] px-4 py-3 text-[14px] outline-none"
            style={{
              background: 'var(--ac-surface)',
              border: '1px solid var(--ac-border)',
              color: 'var(--ac-fg)',
              minHeight: 64,
            }}
            placeholder="驳回时写清楚具体改哪里，通过时可留空。"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="ac-micro" style={{ color: 'var(--ac-fg-faint)' }}>
            键盘快捷键 · ⌘Enter 通过 · ⌘⇧R 驳回
          </div>
          <div className="flex gap-2">
            <button
              ref={rejectRef}
              type="submit"
              name="decision"
              value="reject"
              className="ac-btn ac-btn-sm"
              aria-keyshortcuts="Meta+Shift+R Control+Shift+R"
              style={{
                background: 'rgba(220, 38, 38, 0.08)',
                borderColor: 'rgba(220, 38, 38, 0.35)',
                color: '#b91c1c',
              }}
            >
              驳回
            </button>
            <button
              ref={approveRef}
              type="submit"
              name="decision"
              value="approve"
              className="ac-btn ac-btn-sm ac-btn-primary"
              aria-keyshortcuts="Meta+Enter Control+Enter"
            >
              通过并上线 →
            </button>
          </div>
        </div>
      </form>
    </article>
  );
}
