export default function Loading() {
  return (
    <div className="ac-page-in">
      <section className="ac-hero-bg relative overflow-hidden">
        <div className="ac-dither pointer-events-none absolute inset-0 opacity-60" />

        <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-20 sm:px-8">
          <div
            className="ac-micro mb-3 flex items-center gap-2"
            style={{ color: 'var(--ac-primary)' }}
          >
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
              style={{ background: 'var(--ac-primary)' }}
            />
            LOADING · 正在摆机子
          </div>
          <SkeletonBar width="62%" height={48} />
          <SkeletonBar width="48%" height={48} className="mt-3" />
          <SkeletonBar width="40%" height={18} className="mt-6" />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12 sm:px-8">
        <SkeletonBar width="30%" height={18} className="mb-5" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} index={i} />
          ))}
        </div>
      </section>
    </div>
  );
}

function SkeletonBar({
  width,
  height,
  className,
}: {
  width: string;
  height: number;
  className?: string;
}) {
  return (
    <div
      className={`ac-skeleton ${className ?? ''}`}
      style={{
        width,
        height,
        borderRadius: 10,
      }}
    />
  );
}

function SkeletonCard({ index }: { index: number }) {
  return (
    <div
      className="ac-card overflow-hidden p-0"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div
        className="ac-skeleton"
        style={{
          aspectRatio: '4 / 3',
          width: '100%',
          borderRadius: 0,
        }}
      />
      <div className="space-y-3 p-4">
        <SkeletonBar width="72%" height={18} />
        <SkeletonBar width="92%" height={12} />
        <div className="flex items-center gap-2 pt-2">
          <div
            className="ac-skeleton"
            style={{ width: 24, height: 24, borderRadius: 999 }}
          />
          <SkeletonBar width="40%" height={10} />
        </div>
      </div>
    </div>
  );
}
