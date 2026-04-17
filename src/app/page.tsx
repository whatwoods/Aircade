import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,159,107,0.2),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(159,227,201,0.24),_transparent_30%),linear-gradient(180deg,_#fff8ef_0%,_#fffdf8_100%)] px-6 py-10 sm:px-8">
      <div className="border-brand-coffee/8 bg-white/72 mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col justify-between rounded-[32px] border p-6 shadow-[0_30px_90px_rgba(61,46,31,0.1)] backdrop-blur sm:p-10">
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
            <Link
              href="/account"
              className="border-brand-coffee/12 hover:bg-brand-coffee/92 rounded-btn border bg-brand-coffee px-4 py-2 text-sm font-medium text-white transition"
            >
              账号中心
            </Link>
          </nav>
        </header>

        <section className="grid gap-10 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="space-y-6">
            <p className="text-brand-coffee/72 max-w-2xl text-base leading-8 sm:text-lg">
              现在的站点还在搭骨架，但认证和邀请码注册这条链已经可以用了：用户名密码登录、邀请码核销、服务端
              session、账号页保护，都已经接上。
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/register"
                className="hover:bg-brand-orange/92 rounded-btn bg-brand-orange px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_30px_rgba(255,159,107,0.28)] transition"
              >
                带邀请码注册
              </Link>
              <Link
                href="/login"
                className="border-brand-coffee/12 rounded-btn border bg-white px-6 py-3 text-sm font-semibold text-brand-coffee transition hover:border-brand-orange/30 hover:bg-brand-cream/55"
              >
                直接登录
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FeatureCard
              title="用户名密码登录"
              body="失败 5 次锁定 30 分钟，先把基础门禁立住。"
            />
            <FeatureCard
              title="邀请码注册"
              body="注册即核销邀请码，并回写到用户记录。"
            />
            <FeatureCard
              title="DB Session"
              body="cookie 只存不透明 token，数据库留哈希可吊销。"
            />
            <FeatureCard
              title="账号中心"
              body="未登录访问会被拦回登录页，方便后续接用户中心。"
            />
          </div>
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
