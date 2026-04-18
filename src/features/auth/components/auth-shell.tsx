import type { ReactNode } from 'react';
import Link from 'next/link';
import { MarqueeTicker } from '@/components/brand';

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
    <div className="ac-page-in">
      <div className="ac-hero-bg relative overflow-hidden">
        <div className="ac-dither pointer-events-none absolute inset-0" />
        <div className="ac-scanlines pointer-events-none absolute inset-0" />

        <div className="relative mx-auto max-w-6xl px-6 py-16 sm:px-8">
          <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            {/* Form card */}
            <section className="ac-card p-6 sm:p-8">
              <div className="mb-6">
                <div
                  className="ac-micro mb-2"
                  style={{ color: 'var(--ac-primary)' }}
                >
                  AIRCADE ACCESS
                </div>
                <h1
                  className="font-display text-[34px] leading-tight tracking-tight sm:text-[40px]"
                  style={{ color: 'var(--ac-fg)' }}
                >
                  {title}
                </h1>
                <p
                  className="mt-2 max-w-xl text-[14px] leading-7"
                  style={{ color: 'var(--ac-fg-soft)' }}
                >
                  {subtitle}
                </p>
              </div>

              {message ? (
                <div
                  className="mb-5 rounded-[14px] px-4 py-3 text-sm"
                  style={
                    message.tone === 'error'
                      ? {
                          background: 'rgba(254, 226, 226, 0.6)',
                          border: '1px solid rgba(220, 38, 38, 0.25)',
                          color: '#b91c1c',
                        }
                      : {
                          background:
                            'color-mix(in oklch, var(--ac-mint) 30%, var(--ac-surface))',
                          border: '1px solid var(--ac-border)',
                          color: 'var(--ac-fg)',
                        }
                  }
                >
                  {message.text}
                </div>
              ) : null}

              {children}
            </section>

            {/* Side brand panel */}
            <aside
              className="relative flex flex-col justify-between overflow-hidden rounded-[22px] p-7 sm:p-8"
              style={{
                background:
                  'linear-gradient(160deg, var(--ac-fg) 0%, #2a1f14 100%)',
                color: 'var(--ac-bg)',
                boxShadow: 'var(--ac-card-shadow)',
                minHeight: 420,
              }}
            >
              <div
                aria-hidden
                className="absolute -right-16 -top-16 h-72 w-72 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, color-mix(in oklch, var(--ac-primary) 60%, transparent), transparent 70%)',
                }}
              />
              <div
                aria-hidden
                className="absolute -bottom-10 -left-10 h-56 w-56 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, color-mix(in oklch, var(--ac-mint) 45%, transparent), transparent 70%)',
                }}
              />

              <div className="relative">
                <div
                  className="ac-micro mb-5"
                  style={{
                    color: 'color-mix(in oklch, var(--ac-bg) 60%, transparent)',
                  }}
                >
                  ★ INSERT COIN
                </div>
                <h2
                  className="font-display text-[28px] leading-tight tracking-tight sm:text-[32px]"
                  style={{ color: 'var(--ac-bg)' }}
                >
                  {sideTitle}
                </h2>
                <p
                  className="mt-3 max-w-sm text-[14px] leading-[1.85]"
                  style={{
                    color: 'color-mix(in oklch, var(--ac-bg) 72%, transparent)',
                  }}
                >
                  {sideBody}
                </p>
              </div>

              <div className="relative mt-8 grid gap-2">
                {sideLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-[12px] px-4 py-3 text-[13px] font-medium transition-colors"
                    style={{
                      border:
                        '1px solid color-mix(in oklch, var(--ac-bg) 25%, transparent)',
                      background:
                        'color-mix(in oklch, var(--ac-bg) 8%, transparent)',
                      color: 'var(--ac-bg)',
                    }}
                  >
                    {link.label} →
                  </Link>
                ))}
              </div>
            </aside>
          </div>
        </div>

        <MarqueeTicker />
      </div>
    </div>
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
