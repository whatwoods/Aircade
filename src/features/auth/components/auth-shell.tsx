import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type Tone = 'error' | 'notice';

type Message = {
  tone: Tone;
  text: string;
};

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  sideTitle: string;
  sideBody: string;
  sideLinks: Array<{
    href: string;
    label: string;
  }>;
  message?: Message | null;
};

export function AuthShell({
  title,
  subtitle,
  children,
  sideTitle,
  sideBody,
  sideLinks,
  message,
}: AuthShellProps) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,159,107,0.28),_transparent_30%),linear-gradient(135deg,_#fffaf3_0%,_#fff3df_45%,_#fefcf7_100%)] px-4 py-10 sm:px-6">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-card border border-brand-orange/20 bg-white/85 p-6 shadow-[0_24px_80px_rgba(61,46,31,0.12)] backdrop-blur sm:p-8">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="space-y-2">
              <span className="inline-flex rounded-full bg-brand-orange/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-brand-orange">
                Aircade Access
              </span>
              <h1 className="font-display text-3xl tracking-tight text-brand-coffee sm:text-4xl">
                {title}
              </h1>
              <p className="max-w-xl text-sm leading-6 text-brand-coffee/70 sm:text-base">
                {subtitle}
              </p>
            </div>
            <Link
              href="/"
              className="rounded-btn border border-brand-coffee/10 bg-brand-milk px-4 py-2 text-sm font-medium text-brand-coffee transition hover:border-brand-orange/30 hover:bg-brand-cream/60"
            >
              返回首页
            </Link>
          </div>

          {message ? (
            <div
              className={cn(
                'mb-6 rounded-input border px-4 py-3 text-sm',
                message.tone === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-brand-mint/40 bg-brand-mint/20 text-brand-coffee'
              )}
            >
              {message.text}
            </div>
          ) : null}

          {children}
        </section>

        <aside className="flex flex-col justify-between rounded-card border border-brand-coffee/10 bg-brand-coffee p-6 text-brand-milk shadow-[0_24px_60px_rgba(61,46,31,0.18)] sm:p-8">
          <div className="space-y-5">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-orange text-2xl font-bold text-white shadow-lg shadow-brand-orange/30">
              A
            </div>
            <div className="space-y-3">
              <h2 className="font-display text-2xl tracking-tight text-white">
                {sideTitle}
              </h2>
              <p className="text-brand-milk/78 text-sm leading-7 sm:text-base">
                {sideBody}
              </p>
            </div>
          </div>

          <div className="mt-10 grid gap-3">
            {sideLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="border-white/12 bg-white/8 hover:bg-white/14 rounded-btn border px-4 py-3 text-sm font-medium text-white transition hover:border-brand-cream/40"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}

export function readFlashMessage(
  value: string | string[] | undefined,
  tone: Tone
): Message | null {
  const text = Array.isArray(value) ? value[0] : value;

  if (!text) {
    return null;
  }

  return {
    tone,
    text: text.slice(0, 160),
  };
}
