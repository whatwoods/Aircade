import { Logo } from './logo';

export function Footer() {
  return (
    <footer
      className="mt-16 py-10"
      style={{
        borderTop: '1px solid var(--ac-border)',
        background: 'var(--ac-bg-tint)',
      }}
    >
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-5 px-8">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <div
              className="font-display text-lg"
              style={{ color: 'var(--ac-fg)' }}
            >
              Aircade
            </div>
            <div className="text-xs" style={{ color: 'var(--ac-fg-faint)' }}>
              群友造的街机厅 · 一群人，做点小东西
            </div>
          </div>
        </div>
        <div className="ac-micro" style={{ color: 'var(--ac-fg-faint)' }}>
          © 2026 · AIRCADE.FUN · MADE WITH CAFFEINE
        </div>
      </div>
    </footer>
  );
}
