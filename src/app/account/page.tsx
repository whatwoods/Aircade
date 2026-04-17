import type { Metadata } from 'next';
import { LogoutForm, requireUser } from '@/features/auth';

export const metadata: Metadata = {
  title: '账号中心',
  description: '查看当前登录账号与基础信息。',
};

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
            </ul>
          </article>

          <article className="rounded-card border border-brand-coffee/10 bg-brand-coffee p-6 text-brand-milk shadow-[0_20px_50px_rgba(61,46,31,0.14)]">
            <h2 className="font-display text-2xl tracking-tight text-white">
              下一批自然接上的功能
            </h2>
            <ul className="text-brand-milk/78 mt-4 space-y-3 text-sm leading-7">
              <li>用户中心细页：我的收藏、我的投稿、账号设置。</li>
              <li>作品提交表单：只有登录用户可访问。</li>
              <li>管理员后台：基于 `role=admin` 的保护和审核流。</li>
            </ul>
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
