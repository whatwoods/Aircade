import Link from 'next/link';
import { TypeChip, Cover } from '@/components/brand';
import { getCurrentUser } from '@/features/auth';
import {
  WorkCard,
  countLiveWorksByType,
  getSiteStats,
  listFeaturedWorks,
  listHomepageWorks,
} from '@/features/works';
import type { WorkSummary, WorkTypeCount } from '@/features/works';

const typeMeta: Record<
  WorkSummary['type'],
  { label: string; mood: string; blurb: string }
> = {
  game: {
    label: '游戏',
    mood: 'var(--t-game)',
    blurb: '摸鱼五分钟，爽一整天',
  },
  tool: {
    label: '工具',
    mood: 'var(--t-tool)',
    blurb: '省一点时间做别的事',
  },
  social: {
    label: '社交',
    mood: 'var(--t-social)',
    blurb: '把好玩的东西发到群里',
  },
  ai: {
    label: 'AI',
    mood: 'var(--t-ai)',
    blurb: '用模型做点怪的',
  },
  other: {
    label: '其他',
    mood: 'var(--t-other)',
    blurb: '装不下的那些小玩具',
  },
};

const typeOrder: WorkSummary['type'][] = [
  'game',
  'tool',
  'social',
  'ai',
  'other',
];

export default async function HomePage() {
  const [user, latest, featured, stats, typeCounts] = await Promise.all([
    getCurrentUser(),
    listHomepageWorks(9),
    listFeaturedWorks(4),
    getSiteStats(),
    countLiveWorksByType(),
  ]);

  const countByType = new Map<WorkSummary['type'], number>(
    typeCounts.map((t: WorkTypeCount) => [t.type, t.count])
  );

  return (
    <div className="ac-page-in">
      {/* HERO */}
      <section className="ac-hero-bg relative overflow-hidden">
        <div className="ac-dither pointer-events-none absolute inset-0" />
        <div className="ac-scanlines pointer-events-none absolute inset-0" />

        <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-20 sm:px-8">
          <div className="grid items-center gap-14 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div
                className="ac-micro mb-4"
                style={{ color: 'var(--ac-primary)' }}
              >
                AIRCADE · V1.0 · 2026
              </div>
              <h1
                className="font-display text-[54px] leading-[1.05] tracking-tight sm:text-[72px]"
                style={{ color: 'var(--ac-fg)' }}
              >
                群友造的
                <br />
                <span style={{ color: 'var(--ac-primary)' }}>街机厅</span>
                <span
                  className="ml-3 align-middle text-[24px] sm:text-[32px]"
                  style={{ color: 'var(--ac-fg-faint)' }}
                >
                  / aircade
                </span>
              </h1>
              <p
                className="mt-6 max-w-[520px] text-[16px] leading-[1.75] sm:text-[17px]"
                style={{ color: 'var(--ac-fg-soft)' }}
              >
                一群做 AI 小程序 / 小游戏 / web
                玩具的群友，把散落在聊天记录里的作品集中沉淀下来。没人做大事，但每一件都认真做过。
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                {user ? (
                  <>
                    <Link
                      href="/submit"
                      className="ac-btn ac-btn-primary ac-btn-lg"
                    >
                      提交你的作品 →
                    </Link>
                    <Link
                      href="#latest"
                      className="ac-btn ac-btn-ghost ac-btn-lg"
                    >
                      先看看作品
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href="/register"
                      className="ac-btn ac-btn-primary ac-btn-lg"
                    >
                      立即注册 →
                    </Link>
                    <Link
                      href="#latest"
                      className="ac-btn ac-btn-ghost ac-btn-lg"
                    >
                      先看看作品
                    </Link>
                  </>
                )}
              </div>

              <div
                className="mt-9 flex flex-wrap gap-8 pt-6"
                style={{ borderTop: '1px dashed var(--ac-border)' }}
              >
                {[
                  ['作品', stats.works],
                  ['群友作者', stats.authors],
                  ['累计点赞', stats.likes],
                  ['精选位', stats.featured],
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

            <HeroStack featured={featured} />
          </div>
        </div>
      </section>

      {/* FEATURED */}
      {featured.length > 0 ? (
        <section className="mx-auto max-w-6xl px-6 pt-[72px] sm:px-8">
          <SectionHead
            kicker="FEATURED · 本周精选"
            title="群主给你挑过的"
            cta={{ href: '#latest', label: '查看全部 →' }}
          />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {featured.map((work) => (
              <WorkCard key={work.id} work={work} variant="featured" />
            ))}
          </div>
        </section>
      ) : null}

      {/* BY TYPE */}
      <section className="mx-auto max-w-6xl px-6 pt-[60px] sm:px-8">
        <SectionHead kicker="BY TYPE · 按类型逛" title="你今天想玩什么" />
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {typeOrder.map((type) => {
            const meta = typeMeta[type];
            const count = countByType.get(type) ?? 0;
            return (
              <div
                key={type}
                className="ac-lift ac-card relative overflow-hidden p-5"
              >
                <div
                  aria-hidden
                  className="absolute -right-5 -top-5 h-28 w-28 rounded-full opacity-60 blur-[2px]"
                  style={{ background: meta.mood }}
                />
                <div className="relative">
                  <TypeChip type={type} />
                </div>
                <div
                  className="relative mt-4 font-display text-[22px] leading-tight"
                  style={{ color: 'var(--ac-fg)' }}
                >
                  {meta.label}
                </div>
                <div
                  className="ac-micro relative mt-1"
                  style={{ color: 'var(--ac-fg-faint)' }}
                >
                  {count} 作品
                </div>
                <p
                  className="relative mt-2 text-[13px] leading-6"
                  style={{ color: 'var(--ac-fg-soft)' }}
                >
                  {meta.blurb}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* LATEST */}
      <section id="latest" className="mx-auto max-w-6xl px-6 pt-[72px] sm:px-8">
        <SectionHead kicker="LATEST · 最新上架" title="群里刚丢出来的" />
        {latest.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {latest.map((work) => (
              <WorkCard key={work.id} work={work} />
            ))}
          </div>
        ) : (
          <div
            className="rounded-[22px] border border-dashed px-6 py-14 text-center"
            style={{
              borderColor: 'var(--ac-border-strong)',
              background: 'var(--ac-surface-soft)',
            }}
          >
            <div
              className="font-display text-[26px]"
              style={{ color: 'var(--ac-fg)' }}
            >
              还没有上线作品
            </div>
            <p
              className="mx-auto mt-3 max-w-xl text-[14px] leading-7"
              style={{ color: 'var(--ac-fg-soft)' }}
            >
              内容链还在等第一批投稿。管理员通过一条作品后，这里就会开始像真正的展示站。
            </p>
          </div>
        )}
      </section>

      {/* JOIN CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-24 pt-[80px] sm:px-8">
        <div className="ac-card relative overflow-hidden p-10">
          <div
            aria-hidden
            className="absolute -right-20 -top-20 h-80 w-80 rounded-full"
            style={{
              background:
                'radial-gradient(circle, color-mix(in oklch, var(--ac-primary) 30%, transparent), transparent 70%)',
            }}
          />
          <div className="relative grid items-center gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="ac-micro" style={{ color: 'var(--ac-primary)' }}>
                JOIN · 加入我们
              </div>
              <h2
                className="mt-3 font-display text-[34px] leading-tight sm:text-[38px]"
                style={{ color: 'var(--ac-fg)' }}
              >
                你也在用 AI 做点小东西？
              </h2>
              <p
                className="mt-3 max-w-xl text-[15px] leading-[1.75]"
                style={{ color: 'var(--ac-fg-soft)' }}
              >
                现在直接注册就能进来逛、点赞、收藏和投稿。如果你已经做了点 AI
                小程序、小玩具、小实验，注册完就把它扔进来，让这地方别只剩聊天记录。
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={user ? '/submit' : '/register'}
                  className="ac-btn ac-btn-primary ac-btn-lg"
                >
                  {user ? '去投稿' : '去注册'}
                </Link>
                <Link
                  href={user ? '/account' : '/login'}
                  className="ac-btn ac-btn-ghost ac-btn-lg"
                >
                  {user ? '账号中心' : '已有账号 · 登录'}
                </Link>
              </div>
            </div>

            <div
              className="flex aspect-square flex-col items-center justify-center overflow-hidden rounded-[20px] p-3"
              style={{
                border: '1px solid var(--ac-border)',
                background: 'var(--ac-surface)',
                boxShadow: 'var(--ac-card-shadow)',
              }}
            >
              <img
                src="/images/wechat-group-qr.jpg"
                alt="微信群聊二维码"
                className="h-full w-full rounded-[14px] object-contain"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionHead({
  kicker,
  title,
  cta,
}: {
  kicker: string;
  title: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <div className="ac-micro mb-1.5" style={{ color: 'var(--ac-primary)' }}>
          {kicker}
        </div>
        <h2
          className="font-display text-[30px] tracking-tight sm:text-[34px]"
          style={{ color: 'var(--ac-fg)' }}
        >
          {title}
        </h2>
      </div>
      {cta ? (
        <Link href={cta.href} className="ac-btn ac-btn-sm ac-btn-ghost">
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}

function HeroStack({ featured }: { featured: WorkSummary[] }) {
  if (featured.length === 0) {
    return (
      <div
        className="hidden aspect-[4/5] items-center justify-center rounded-[22px] lg:flex"
        style={{
          border: '2px dashed var(--ac-border-strong)',
          background: 'var(--ac-surface-soft)',
          color: 'var(--ac-fg-faint)',
          fontFamily: 'var(--font-mono), ui-monospace, monospace',
          fontSize: 12,
          letterSpacing: '0.2em',
        }}
      >
        [ 精选作品位 · 等第一位 ]
      </div>
    );
  }

  const offsets = [
    { top: 0, left: 10, rotate: -4, z: 1 },
    { top: 40, left: 140, rotate: 3, z: 3 },
    { top: 90, left: 50, rotate: -2, z: 2 },
  ];
  const picks = featured.slice(0, 3);

  return (
    <div className="relative hidden h-[460px] w-full lg:block">
      {picks.map((work, i) => {
        const off = offsets[i] ?? offsets[0]!;
        return (
          <Link
            key={work.id}
            href={`/works/${work.id}`}
            className="ac-lift ac-card absolute block w-[280px] overflow-hidden p-3"
            style={{
              top: off.top,
              left: off.left,
              transform: `rotate(${off.rotate}deg)`,
              zIndex: off.z,
            }}
          >
            <Cover
              seed={`${work.id}-${work.type}`}
              coverUrl={work.coverUrl}
              ratio="4 / 3"
            />
            <div className="px-1.5 pb-1 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <TypeChip type={work.type} />
                <span
                  className="ac-micro"
                  style={{ color: 'var(--ac-fg-faint)' }}
                >
                  精选
                </span>
              </div>
              <div
                className="font-display text-[17px] leading-tight"
                style={{ color: 'var(--ac-fg)' }}
              >
                {work.title}
              </div>
              <div
                className="mt-1 truncate text-[12px]"
                style={{ color: 'var(--ac-fg-faint)' }}
              >
                {work.tagline}
              </div>
            </div>
          </Link>
        );
      })}
      <div
        className="absolute -bottom-5 right-0 rounded-full px-3.5 py-2"
        style={{
          background: 'var(--ac-surface)',
          color: 'var(--ac-primary)',
          border: '1px solid var(--ac-border)',
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'var(--font-mono), ui-monospace, monospace',
          letterSpacing: '0.16em',
          boxShadow: 'var(--ac-card-shadow)',
        }}
      >
        本周 Top 3
      </div>
    </div>
  );
}
