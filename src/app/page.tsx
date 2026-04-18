import Link from 'next/link';
import { getCurrentUser } from '@/features/auth';
import { WorkCard, listHomepageWorks } from '@/features/works';

export default async function HomePage() {
  const [user, works] = await Promise.all([
    getCurrentUser(),
    listHomepageWorks(),
  ]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,159,107,0.2),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(159,227,201,0.24),_transparent_30%),linear-gradient(180deg,_#fff8ef_0%,_#fffdf8_100%)] px-6 py-10 sm:px-8">
      <div className="border-brand-coffee/8 bg-white/72 mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col rounded-[32px] border p-6 shadow-[0_30px_90px_rgba(61,46,31,0.1)] backdrop-blur sm:p-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-orange">
              Aircade
            </p>
            <h1 className="mt-3 font-display text-4xl tracking-tight text-brand-coffee sm:text-6xl">
              群友造的街机厅
            </h1>
          </div>

          <nav className="flex flex-wrap gap-3">
            {user ? (
              <>
                <Link
                  href="/submit"
                  className="hover:bg-brand-orange/92 rounded-btn bg-brand-orange px-4 py-2 text-sm font-medium text-white shadow-[0_16px_28px_rgba(255,159,107,0.28)] transition"
                >
                  提交作品
                </Link>
                <Link
                  href="/account"
                  className="border-brand-coffee/12 hover:bg-brand-coffee/92 rounded-btn border bg-brand-coffee px-4 py-2 text-sm font-medium text-white transition"
                >
                  账号中心
                </Link>
                {user.role === 'admin' ? (
                  <Link
                    href="/admin/works"
                    className="border-brand-coffee/12 rounded-btn border bg-white px-4 py-2 text-sm font-medium text-brand-coffee transition hover:border-brand-orange/30 hover:bg-brand-cream/55"
                  >
                    审核后台
                  </Link>
                ) : null}
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="border-brand-coffee/12 rounded-btn border bg-white px-4 py-2 text-sm font-medium text-brand-coffee transition hover:border-brand-orange/30 hover:bg-brand-cream/55"
                >
                  登录
                </Link>
                <Link
                  href="/register"
                  className="hover:bg-brand-orange/92 rounded-btn bg-brand-orange px-4 py-2 text-sm font-medium text-white shadow-[0_16px_28px_rgba(255,159,107,0.28)] transition"
                >
                  注册
                </Link>
              </>
            )}
          </nav>
        </header>

        <section className="grid gap-10 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="space-y-6">
            <p className="text-brand-coffee/72 max-w-2xl text-base leading-8 sm:text-lg">
              骨架期已经过去了。现在首页开始展示真正上线的作品，认证链负责门禁，投稿和审核链负责把内容送进来。
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href={user ? '/submit' : '/register'}
                className="hover:bg-brand-orange/92 rounded-btn bg-brand-orange px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_30px_rgba(255,159,107,0.28)] transition"
              >
                {user ? '提交你的作品' : '带邀请码注册'}
              </Link>
              <Link
                href={user ? '/account' : '/login'}
                className="border-brand-coffee/12 rounded-btn border bg-white px-6 py-3 text-sm font-semibold text-brand-coffee transition hover:border-brand-orange/30 hover:bg-brand-cream/55"
              >
                {user ? '查看账号中心' : '直接登录'}
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FeatureCard
              title="提交作品"
              body="登录后直接发起投稿，先进入 pending 队列。"
            />
            <FeatureCard
              title="管理员审核"
              body="后台可直接通过或驳回，不再停留在表结构层面。"
            />
            <FeatureCard
              title="作品详情页"
              body="已上线作品公开可见，未上线作品只给作者和管理员看。"
            />
            <FeatureCard
              title="服务端 Session"
              body="cookie 只存不透明 token，数据库留哈希可吊销。"
            />
          </div>
        </section>

        <section className="border-brand-coffee/8 space-y-6 border-t pt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-orange">
                Live Works
              </p>
              <h2 className="mt-2 font-display text-3xl tracking-tight text-brand-coffee">
                已上线的作品
              </h2>
            </div>
            <p className="text-brand-coffee/62 max-w-xl text-sm leading-7">
              现在只有通过审核的内容会出现在这里。这样首页不只是装修好的门面，而是真开始承载内容。
            </p>
          </div>

          {works.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {works.map((work) => (
                <WorkCard key={work.id} work={work} />
              ))}
            </div>
          ) : (
            <div className="border-brand-coffee/14 bg-brand-milk/72 rounded-card border border-dashed px-6 py-12 text-center">
              <p className="font-display text-2xl tracking-tight text-brand-coffee">
                还没有上线作品
              </p>
              <p className="text-brand-coffee/62 mx-auto mt-3 max-w-2xl text-sm leading-7">
                这不是空白页问题，而是内容链还需要第一批投稿。管理员通过一条作品后，这里就会开始像真正的展示站。
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="border-brand-coffee/8 rounded-card border bg-brand-milk/75 p-5">
      <h2 className="font-display text-xl tracking-tight text-brand-coffee">
        {title}
      </h2>
      <p className="text-brand-coffee/68 mt-3 text-sm leading-7">{body}</p>
    </article>
  );
}
