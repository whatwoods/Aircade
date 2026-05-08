import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/auth';
import { WorkCard, getFavoritedWorksByUser } from '@/features/works';

export const metadata: Metadata = {
  title: '我的收藏',
  description: '查看你收藏的作品。',
};

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const favorites = await getFavoritedWorksByUser(user.id);

  return (
    <div className="ac-page-in mx-auto max-w-6xl px-6 py-10 sm:px-8">
      <div className="mb-5">
        <div className="ac-micro" style={{ color: 'var(--ac-fg-faint)' }}>
          FAVORITES · 我的收藏
        </div>
        <h1
          className="mt-1 font-display text-[36px] leading-tight tracking-tight sm:text-[40px]"
          style={{ color: 'var(--ac-fg)' }}
        >
          我的收藏
        </h1>
        <p
          className="mt-2 max-w-2xl text-[14px] leading-7"
          style={{ color: 'var(--ac-fg-soft)' }}
        >
          这里是你收藏的作品列表。
        </p>
      </div>

      {favorites.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {favorites.map((work) => (
            <div key={work.id} className="space-y-2">
              <WorkCard work={work} />
            </div>
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
          <div className="mb-3 text-[44px]">⭐</div>
          <div
            className="font-display text-[22px]"
            style={{ color: 'var(--ac-fg)' }}
          >
            还没有收藏记录
          </div>
          <p
            className="mx-auto mt-2 max-w-md text-[13.5px] leading-7"
            style={{ color: 'var(--ac-fg-soft)' }}
          >
            浏览作品时点击星标按钮就能收藏，方便以后快速找到。
          </p>
          <Link
            href="/discover"
            className="ac-btn ac-btn-primary mt-5 inline-flex"
          >
            去逛逛 →
          </Link>
        </div>
      )}
    </div>
  );
}
