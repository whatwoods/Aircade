'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[aircade] route error:', error);
  }, [error]);

  return (
    <div className="ac-page-in relative overflow-hidden">
      <section className="ac-hero-bg relative">
        <div className="ac-dither pointer-events-none absolute inset-0 opacity-70" />

        <div className="relative mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center px-6 py-24 text-center sm:px-8">
          <div className="ac-micro mb-4" style={{ color: 'var(--ac-primary)' }}>
            ERR · 机子卡了一下
          </div>

          <div
            aria-hidden
            className="font-display leading-none tracking-tighter"
            style={{
              fontSize: 'clamp(90px, 16vw, 160px)',
              color: 'var(--ac-fg)',
              textShadow:
                '4px 4px 0 color-mix(in oklch, var(--ac-primary) 55%, transparent)',
              letterSpacing: '-0.05em',
            }}
          >
            ⚠
          </div>

          <h1
            className="mt-4 font-display text-[28px] leading-tight sm:text-[34px]"
            style={{ color: 'var(--ac-fg)' }}
          >
            出了个小意外
          </h1>
          <p
            className="mt-3 max-w-md text-[14px] leading-7"
            style={{ color: 'var(--ac-fg-soft)' }}
          >
            页面加载中断了。大概率只是网络抽风，重试一下通常就好了；如果一直在这个页面，欢迎去群里丢个截图。
          </p>

          {error.digest ? (
            <div
              className="ac-micro mt-4"
              style={{ color: 'var(--ac-fg-faint)' }}
            >
              trace · {error.digest}
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="ac-btn ac-btn-primary ac-btn-lg"
            >
              重新投币 ↻
            </button>
            <Link href="/" className="ac-btn ac-btn-ghost ac-btn-lg">
              回首页
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
