import type { Metadata } from 'next';
import Link from 'next/link';
import {
  WorkCard,
  countLiveWorksByType,
  listDiscoverWorks,
  workTypeValues,
} from '@/features/works';
import type { WorkSummary, WorkTypeCount } from '@/features/works';

export const metadata: Metadata = {
  title: '发现 · 群友作品',
  description: '按类型筛选群友们最近丢出来的小东西。',
};

type SortKey = 'new' | 'hot' | 'featured';

const sortMeta: Record<SortKey, { label: string; hint: string }> = {
  new: { label: '最新', hint: '按投稿时间' },
  hot: { label: '最热', hint: '按点赞数量' },
  featured: { label: '精选', hint: '管理员推的那批' },
};

const typeMeta: Record<
  WorkSummary['type'],
  { label: string; mood: string; blurb: string }
> = {
  game: { label: '游戏', mood: 'var(--t-game)', blurb: '摸鱼五分钟' },
  tool: { label: '工具', mood: 'var(--t-tool)', blurb: '顺手省点时间' },
  social: { label: '社交', mood: 'var(--t-social)', blurb: '丢到群里炸一下' },
  ai: { label: 'AI', mood: 'var(--t-ai)', blurb: '模型做点怪的' },
  other: { label: '其他', mood: 'var(--t-other)', blurb: '没法分类那一类' },
};

const typeOrder: WorkSummary['type'][] = [
  'game',
  'tool',
  'social',
  'ai',
  'other',
];

function parseType(value: string | undefined): WorkSummary['type'] | null {
  if (!value) return null;
  return (workTypeValues as readonly string[]).includes(value)
    ? (value as WorkSummary['type'])
    : null;
}

function parseSort(value: string | undefined): SortKey {
  if (value === 'hot' || value === 'featured' || value === 'new') return value;
  return 'new';
}

function buildHref(params: { type?: string | null; sort?: SortKey }) {
  const search = new URLSearchParams();
  if (params.type) search.set('type', params.type);
  if (params.sort && params.sort !== 'new') search.set('sort', params.sort);
  const qs = search.toString();
  return qs ? `/discover?${qs}` : '/discover';
}

type DiscoverPageProps = {
  searchParams?: { type?: string; sort?: string };
};

export default async function DiscoverPage({
  searchParams,
}: DiscoverPageProps) {
  const activeType = parseType(searchParams?.type);
  const activeSort = parseSort(searchParams?.sort);

  const [works, typeCounts] = await Promise.all([
    listDiscoverWorks({
      type: activeType ?? undefined,
      sort: activeSort,
      limit: 48,
    }),
    countLiveWorksByType(),
  ]);

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
          <div className="grid items-end gap-10 lg:grid-cols-[1.08fr_0.92fr]">
            <div>
              <div
                className="ac-micro mb-4"
                style={{ color: 'var(--ac-primary)' }}
              >
                DISCOVER · 逛逛别人最近做的
              </div>
              <h1
                className="font-display text-[54px] leading-[1.05] tracking-tight sm:text-[72px]"
                style={{ color: 'var(--ac-fg)' }}
              >
                {activeType ? typeMeta[activeType].label : '全部作品'}
                <span
                  className="ml-3 align-middle text-[24px] font-normal sm:text-[32px]"
                  style={{ color: 'var(--ac-fg-faint)' }}
                >
                  / discover
                </span>
              </h1>
              <p
                className="mt-6 max-w-[520px] text-[16px] leading-[1.75] sm:text-[17px]"
                style={{ color: 'var(--ac-fg-soft)' }}
              >
                {activeType
                  ? `${typeMeta[activeType].blurb}。当前分类共有 ${countByType.get(activeType) ?? 0} 件上线作品。`
                  : `目前共 ${totalLive} 件上线作品。按类型或热度挑一个看看。`}
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
                      className="font-display text-[28px]"
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

              {/* Sort segmented */}
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
          </div>
        </div>
      </section>

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

      {/* Grid */}
      <section className="mx-auto max-w-6xl px-6 py-12 sm:px-8">
        {works.length > 0 ? (
          <>
            <div
              className="ac-micro mb-5 flex items-center justify-between"
              style={{ color: 'var(--ac-fg-faint)' }}
            >
              <span>
                RESULTS · 当前显示 {works.length} 件
                {activeType ? ` · ${typeMeta[activeType].label}` : ''}
                {activeSort !== 'new' ? ` · ${sortMeta[activeSort].label}` : ''}
              </span>
              {activeType || activeSort !== 'new' ? (
                <Link
                  href="/discover"
                  className="font-semibold transition-colors hover:opacity-80"
                  style={{ color: 'var(--ac-primary)' }}
                >
                  清空筛选 ✕
                </Link>
              ) : null}
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {works.map((work) => (
                <WorkCard key={work.id} work={work} />
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
              这个分类还空着
            </div>
            <p
              className="mx-auto mt-2 max-w-md text-[13.5px] leading-7"
              style={{ color: 'var(--ac-fg-soft)' }}
            >
              说不定就差你这一个作品。要不顺手丢一个进来？
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link href="/discover" className="ac-btn ac-btn-ghost">
                看看别的类型
              </Link>
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

function TypePill({
  label,
  count,
  mood,
  active,
  href,
}: {
  label: string;
  count: number;
  mood?: string;
  active?: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="relative inline-flex items-center gap-2 overflow-hidden rounded-full px-4 py-2 text-[13px] font-semibold transition-colors"
      style={{
        background: active
          ? 'color-mix(in oklch, var(--ac-primary) 18%, var(--ac-surface))'
          : 'var(--ac-surface)',
        color: active ? 'var(--ac-primary)' : 'var(--ac-fg-soft)',
        border: `1px solid ${
          active
            ? 'color-mix(in oklch, var(--ac-primary) 44%, var(--ac-border))'
            : 'var(--ac-border)'
        }`,
      }}
    >
      {mood ? (
        <span
          aria-hidden
          className="h-2 w-2 rounded-full"
          style={{ background: mood }}
        />
      ) : null}
      <span>{label}</span>
      <span
        className="rounded-full px-2 py-[1px] text-[11px]"
        style={{
          background: active
            ? 'color-mix(in oklch, var(--ac-bg) 20%, transparent)'
            : 'var(--ac-surface-soft)',
          color: active ? 'var(--ac-bg)' : 'var(--ac-fg-faint)',
          fontFamily: 'var(--font-mono), ui-monospace, monospace',
        }}
      >
        {count}
      </span>
    </Link>
  );
}
