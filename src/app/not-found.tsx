import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="ac-page-in relative overflow-hidden">
      <section className="ac-hero-bg relative">
        <div className="ac-dither pointer-events-none absolute inset-0 opacity-70" />
        <div className="ac-scanlines pointer-events-none absolute inset-0" />

        <div className="relative mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center px-6 py-24 text-center sm:px-8">
          <div className="ac-micro mb-4" style={{ color: 'var(--ac-primary)' }}>
            ERR 0x404 · PAGE MISSING
          </div>

          <div
            aria-hidden
            className="font-display leading-none tracking-tighter"
            style={{
              fontSize: 'clamp(120px, 22vw, 220px)',
              color: 'var(--ac-fg)',
              textShadow:
                '6px 6px 0 color-mix(in oklch, var(--ac-primary) 55%, transparent)',
              letterSpacing: '-0.05em',
            }}
          >
            4<span style={{ color: 'var(--ac-primary)' }}>🎮</span>4
          </div>

          <h1
            className="mt-6 font-display text-[28px] leading-tight sm:text-[34px]"
            style={{ color: 'var(--ac-fg)' }}
          >
            这台机子没投币
          </h1>
          <p
            className="mt-3 max-w-md text-[14px] leading-7"
            style={{ color: 'var(--ac-fg-soft)' }}
          >
            你找的东西不在这儿——要么被老板搬走了，要么地址打错了一位。回首页重新逛一圈试试。
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/" className="ac-btn ac-btn-primary ac-btn-lg">
              回首页 →
            </Link>
            <Link href="/discover" className="ac-btn ac-btn-ghost ac-btn-lg">
              去逛逛发现页
            </Link>
          </div>

          <div
            className="ac-micro mt-12"
            style={{ color: 'var(--ac-fg-faint)' }}
          >
            · PAGE LOST · BACK TO AIRCADE ·
          </div>
        </div>
      </section>
    </div>
  );
}
