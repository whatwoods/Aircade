import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoutForm, requireUser } from '@/features/auth';
import { listRecentWorksByAuthor } from '@/features/works';

export const metadata: Metadata = {
  title: '账号中心',
  description: '查看当前登录账号与基础信息。',
};

const statusLabelMap = {
  pending: '待审核',
  live: '已上线',
  rejected: '已驳回',
  unlisted: '隐藏',
} as const;

function formatDate(value: Date | null) {
  if (!value) {
    return '暂无';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

export default async function AccountPage() {
  const user = await requireUser('/account');
  const recentWorks = await listRecentWorksByAuthor(user.id);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#fff8ef_0%,_#fffdf7_100%)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="overflow-hidden rounded-card border border-brand-orange/20 bg-white shadow-[0_24px_70px_rgba(61,46,31,0.1)]">
          <div className="bg-[linear-gradient(120deg,_rgba(255,159,107,0.22),_rgba(159,227,201,0.3))] px-6 py-8 sm:px-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-3">
                <span className="inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-brand-coffee/70">
                  Account
                </span>
                <div>
                  <h1 className="font-display text-3xl tracking-tight text-brand-coffee sm:text-4xl">
                    {user.nickname}
                  </h1>
                  <p className="mt-2 text-sm text-brand-coffee/70 sm:text-base">
                    已登录账号：@{user.username}
                  </p>
                </div>
              </div>

              <LogoutForm />
            </div>
          </div>

          <div className="grid gap-4 px-6 py-6 sm:grid-cols-2 sm:px-8">
            <InfoCard
              label="角色"
              value={user.role === 'admin' ? '管理员' : '普通用户'}
            />
            <InfoCard
              label="状态"
              value={user.status === 'active' ? '正常' : '封禁'}
            />
            <InfoCard label="Slug" value={user.slug} />
            <InfoCard
              label="邀请码来源"
              value={user.inviteCodeUsed ?? '未记录'}
            />
            <InfoCard label="邮箱" value={user.email ?? '未填写'} />
            <InfoCard label="最近登录" value={formatDate(user.lastLoginAt)} />
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-card border border-brand-coffee/10 bg-white p-6 shadow-[0_20px_50px_rgba(61,46,31,0.08)]">
            <h2 className="font-display text-2xl tracking-tight text-brand-coffee">
              这一步已经打通的能力
            </h2>
            <ul className="text-brand-coffee/72 mt-4 space-y-3 text-sm leading-7">
              <li>邀请码注册：注册时核销邀请码并记录来源。</li>
              <li>密码登录：失败累计 5 次后锁定 30 分钟。</li>
              <li>
                服务端 session：cookie 里只放不透明 token，数据库保存哈希。
              </li>
              <li>账号页保护：未登录会被重定向回登录页。</li>
              <li>作品投稿：登录用户可提交作品进入审核队列。</li>
            </ul>
          </article>

          <article className="rounded-card border border-brand-coffee/10 bg-brand-coffee p-6 text-brand-milk shadow-[0_20px_50px_rgba(61,46,31,0.14)]">
            <h2 className="font-display text-2xl tracking-tight text-white">
              下一批自然接上的功能
            </h2>
            <ul className="text-brand-milk/78 mt-4 space-y-3 text-sm leading-7">
              <li>用户中心细页：我的收藏、账号设置、投稿编辑。</li>
              <li>首页内容流：通过审核的作品会直接出现在首页。</li>
              <li>管理员后台：已能审核投稿，后续继续补标签和精选流。</li>
            </ul>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-card border border-brand-coffee/10 bg-white p-6 shadow-[0_20px_50px_rgba(61,46,31,0.08)]">
            <h2 className="font-display text-2xl tracking-tight text-brand-coffee">
              现在就能做的动作
            </h2>
            <div className="mt-5 grid gap-3">
              <Link
                href="/submit"
                className="hover:bg-brand-orange/92 rounded-btn bg-brand-orange px-4 py-3 text-sm font-semibold text-white transition"
              >
                提交新作品
              </Link>
              <Link
                href="/"
                className="rounded-btn border border-brand-coffee/10 bg-brand-milk px-4 py-3 text-sm font-semibold text-brand-coffee transition hover:border-brand-orange/30 hover:bg-brand-cream/55"
              >
                回首页看已上线内容
              </Link>
              {user.role === 'admin' ? (
                <Link
                  href="/admin/works"
                  className="rounded-btn border border-brand-coffee/10 bg-white px-4 py-3 text-sm font-semibold text-brand-coffee transition hover:border-brand-orange/30 hover:text-brand-orange"
                >
                  进入审核后台
                </Link>
              ) : null}
            </div>
          </article>

          <article className="rounded-card border border-brand-coffee/10 bg-white p-6 shadow-[0_20px_50px_rgba(61,46,31,0.08)]">
            <h2 className="font-display text-2xl tracking-tight text-brand-coffee">
              你的最近投稿
            </h2>
            {recentWorks.length > 0 ? (
              <div className="mt-5 space-y-3">
                {recentWorks.map((work) => (
                  <Link
                    key={work.id}
                    href={`/works/${work.id}`}
                    className="border-brand-coffee/8 block rounded-2xl border bg-brand-milk/65 p-4 transition hover:border-brand-orange/30 hover:bg-brand-cream/60"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-brand-coffee">
                          {work.title}
                        </p>
                        <p className="mt-1 text-sm text-brand-coffee/65">
                          {work.tagline}
                        </p>
                      </div>
                      <span className="text-brand-coffee/72 rounded-full bg-white px-3 py-1 text-xs font-semibold">
                        {statusLabelMap[work.status]}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-brand-coffee/62 mt-5 text-sm leading-7">
                你还没有投稿记录。现在可以直接去提第一条。
              </p>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-brand-coffee/8 rounded-2xl border bg-brand-milk/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-coffee/45">
        {label}
      </p>
      <p className="mt-2 break-all text-sm font-medium text-brand-coffee">
        {value}
      </p>
    </div>
  );
}
