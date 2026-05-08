import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/features/auth';
import {
  WorkCard,
  countLiveWorksByType,
  getUserLikedWorkIds,
  listDiscoverWorks,
} from '@/features/works';
import type { WorkSummary, WorkTypeCount } from '@/features/works';

export const metadata: Metadata = {
  title: '发现 · 群友作品',
  description: '看看群友们都做了什么小东西。',
};

export default async function DiscoverPage() {
  const [works, typeCounts] = await Promise.all([
    listDiscoverWorks({
      sort: 'new',
      limit: 48,
    }),
    countLiveWorksByType(),
  ]);

  const user = await getCurrentUser();
  const likedSet = user
    ? await getUserLikedWorkIds(
        user.id,
        works.map((w) => w.id)
      )
    : new Set<string>();

  const countByType = new Map<WorkSummary['type'], number>(
    typeCounts.map((t: WorkTypeCount) => [t.type, t.count])
  );
  const totalLive = typeCounts.reduce((acc, t) => acc + t.count, 0);

  return (
    <div className="ac-page-in">
      {/* Header */}
      <section className="ac-hero-bg relative overflow-hidden">
        <div className="ac-dither pointer-events-none absolute inset-0" />
        <div className="ac-scanlines pointer-events-none absolute inset-0" />

        <div className="relative mx-auto max-w-6xl px-6 pb-14 pt-20 sm:px-8">
          <div>
            <div>
              <div
                className="ac-micro mb-4"
                style={{ color: 'var(--ac-primary)' }}
              >
                DISCOVER · 逛逛别人最近做的
              </div>
              <h1
                className="font-display text-[34px] leading-[1.05] tracking-tight sm:text-[54px] lg:text-[72px]"
                style={{ color: 'var(--ac-fg)' }}
              >
                全部作品
                <span
                  className="ml-1 align-middle text-[16px] font-normal sm:text-[24px] lg:text-[32px]"
                  style={{ color: 'var(--ac-fg-faint)' }}
                >
                  / discover
                </span>
              </h1>
              <p
                className="mt-6 max-w-[520px] text-[16px] leading-[1.75] sm:text-[17px]"
                style={{ color: 'var(--ac-fg-soft)' }}
              >
                {`目前共 ${totalLive} 件上线作品，看看群友们都做了啥。`}
              </p>

              <div
                className="mt-9 flex flex-wrap gap-8 pt-6"
                style={{ borderTop: '1px dashed var(--ac-border)' }}
              >
                {[
                  ['作品', totalLive],
                  ['游戏', countByType.get('game') ?? 0],
                  ['工具', countByType.get('tool') ?? 0],
                  ['AI', countByType.get('ai') ?? 0],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <div
                      className="font-display text-[22px] sm:text-[28px]"
                      style={{ color: 'var(--ac-fg)' }}
                    >
                      {value}
                    </div>
                    <div
                      className="ac-micro mt-0.5"
                      style={{ color: 'var(--ac-fg-faint)' }}
                    >
                      {label as string}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 筛选面板 — 暂时隐藏，规模小不需要
            <div
              className="space-y-4 rounded-[20px] p-4"
              style={{
                background:
                  'color-mix(in oklch, var(--ac-surface) 82%, transparent)',
                border: '1px solid var(--ac-border)',
                boxShadow: 'var(--ac-card-shadow)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <div
                  className="ac-micro"
                  style={{ color: 'var(--ac-fg-faint)' }}
                >
                  FILTERS · 筛选
                </div>
                {activeType || activeSort !== 'new' ? (
                  <Link
                    href="/discover"
                    className="text-[12.5px] font-semibold transition-colors hover:opacity-80"
                    style={{ color: 'var(--ac-primary)' }}
                  >
                    清空筛选
                  </Link>
                ) : null}
              </div>

              <div
                className="inline-flex items-center gap-1 self-start rounded-full p-1 md:self-auto"
                style={{
                  background: 'var(--ac-surface)',
                  border: '1px solid var(--ac-border)',
                  boxShadow: '0 8px 22px rgba(61, 46, 31, 0.06)',
                }}
              >
                {(Object.keys(sortMeta) as SortKey[]).map((key) => {
                  const active = key === activeSort;
                  return (
                    <Link
                      key={key}
                      href={buildHref({
                        type: activeType ?? undefined,
                        sort: key,
                      })}
                      className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors"
                      style={{
                        background: active
                          ? 'var(--ac-primary)'
                          : 'transparent',
                        color: active
                          ? 'var(--ac-primary-ink)'
                          : 'var(--ac-fg-soft)',
                      }}
                      title={sortMeta[key].hint}
                    >
                      {sortMeta[key].label}
                    </Link>
                  );
                })}
              </div>
            </div>
            */}
          </div>
        </div>
      </section>

      {/* 分类筛选栏 — 暂时隐藏
      <section
        className="border-y"
        style={{
          background: 'var(--ac-surface)',
          borderColor: 'var(--ac-border)',
        }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap gap-2 px-6 py-4 sm:px-8">
          <TypePill
            label="全部"
            count={totalLive}
            active={!activeType}
            href={buildHref({ sort: activeSort })}
          />
          {typeOrder.map((t) => (
            <TypePill
              key={t}
              label={typeMeta[t].label}
              count={countByType.get(t) ?? 0}
              mood={typeMeta[t].mood}
              active={activeType === t}
              href={buildHref({ type: t, sort: activeSort })}
            />
          ))}
        </div>
      </section>
      */}

      {/* Grid */}
      <section className="mx-auto max-w-6xl px-6 py-12 sm:px-8">
        {works.length > 0 ? (
          <>
            <div
              className="ac-micro mb-5 flex items-center justify-between"
              style={{ color: 'var(--ac-fg-faint)' }}
            >
              <span>RESULTS · 当前显示 {works.length} 件</span>
              {/* 清空筛选 — 暂时隐藏
              {activeType || activeSort !== 'new' ? (
                <Link
                  href="/discover"
                  className="font-semibold transition-colors hover:opacity-80"
                  style={{ color: 'var(--ac-primary)' }}
                >
                  清空筛选 ✕
                </Link>
              ) : null}
              */}
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {works.map((work) => (
                <WorkCard
                  key={work.id}
                  work={work}
                  initialLiked={likedSet.has(work.id)}
                />
              ))}
            </div>
          </>
        ) : (
          <div
            className="rounded-[24px] border border-dashed px-8 py-20 text-center"
            style={{
              borderColor: 'var(--ac-border-strong)',
              background: 'var(--ac-surface-soft)',
            }}
          >
            <div className="mb-4 text-[52px]">🕸️</div>
            <div
              className="font-display text-[24px]"
              style={{ color: 'var(--ac-fg)' }}
            >
              还没有上线作品
            </div>
            <p
              className="mx-auto mt-2 max-w-md text-[13.5px] leading-7"
              style={{ color: 'var(--ac-fg-soft)' }}
            >
              说不定就差你这一个作品。要不顺手丢一个进来？
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link href="/submit" className="ac-btn ac-btn-primary">
                提交新作品 →
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
