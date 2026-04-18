import type { Metadata } from 'next';
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
    <div className="ac-page-in mx-auto max-w-6xl px-6 py-10 sm:px-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="ac-micro mb-2" style={{ color: 'var(--ac-primary)' }}>
            SUBMIT · 投稿
          </div>
          <h1
            className="font-display text-[36px] leading-tight tracking-tight sm:text-[40px]"
            style={{ color: 'var(--ac-fg)' }}
          >
            提交你的小东西
          </h1>
          <p
            className="mt-2 max-w-2xl text-[14px] leading-7"
            style={{ color: 'var(--ac-fg-soft)' }}
          >
            当前登录账号是 @{user.username}。审核一般 24h 内，群主会在群里 @
            你；驳回会给理由，可修改后重提。
          </p>
        </div>
        <div className="ac-card p-4 text-[13px]">
          <div
            className="ac-micro mb-2"
            style={{ color: 'var(--ac-fg-faint)' }}
          >
            3-STEP FLOW
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            style={{ color: 'var(--ac-fg-soft)' }}
          >
            <span>① 填信息</span>
            <span style={{ color: 'var(--ac-fg-faint)' }}>→</span>
            <span>② 待审核</span>
            <span style={{ color: 'var(--ac-fg-faint)' }}>→</span>
            <span>③ 上架首页</span>
          </div>
        </div>
      </header>

      {errorMessage ? (
        <div
          className="mb-6 rounded-[14px] px-4 py-3 text-sm"
          style={{
            background: 'rgba(254, 226, 226, 0.6)',
            border: '1px solid rgba(220, 38, 38, 0.25)',
            color: '#b91c1c',
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      <WorkSubmitForm />
    </div>
  );
}
