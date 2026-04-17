import Link from 'next/link';
import { registerAction } from '../actions';

type RegisterFormProps = {
  redirectTo?: string | null;
};

export function RegisterForm({ redirectTo }: RegisterFormProps) {
  return (
    <form action={registerAction} className="space-y-5">
      <input type="hidden" name="redirectTo" value={redirectTo ?? '/account'} />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <label
            htmlFor="inviteCode"
            className="text-sm font-medium text-brand-coffee/80"
          >
            邀请码
          </label>
          <input
            id="inviteCode"
            name="inviteCode"
            type="text"
            autoComplete="off"
            required
            maxLength={32}
            className="border-brand-coffee/12 w-full rounded-input border bg-white px-4 py-3 text-sm uppercase tracking-[0.18em] text-brand-coffee outline-none transition placeholder:tracking-normal placeholder:text-brand-coffee/35 focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10"
            placeholder="AIRCADE-DEV-001"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="username"
            className="text-sm font-medium text-brand-coffee/80"
          >
            用户名
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            maxLength={20}
            className="border-brand-coffee/12 w-full rounded-input border bg-white px-4 py-3 text-sm text-brand-coffee outline-none transition placeholder:text-brand-coffee/35 focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10"
            placeholder="3 到 20 位，支持中文"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="email"
            className="text-sm font-medium text-brand-coffee/80"
          >
            邮箱（选填）
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            className="border-brand-coffee/12 w-full rounded-input border bg-white px-4 py-3 text-sm text-brand-coffee outline-none transition placeholder:text-brand-coffee/35 focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10"
            placeholder="后续找回密码会用到"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="text-sm font-medium text-brand-coffee/80"
        >
          密码
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="border-brand-coffee/12 w-full rounded-input border bg-white px-4 py-3 text-sm text-brand-coffee outline-none transition placeholder:text-brand-coffee/35 focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10"
          placeholder="至少 8 位"
        />
      </div>

      <button
        type="submit"
        className="hover:bg-brand-coffee/92 inline-flex w-full items-center justify-center rounded-btn bg-brand-coffee px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_30px_rgba(61,46,31,0.18)] transition"
      >
        创建账号并登录
      </button>

      <div className="flex flex-col gap-2 text-sm text-brand-coffee/65 sm:flex-row sm:items-center sm:justify-between">
        <span>已经有账号？</span>
        <Link
          href="/login"
          className="font-medium text-brand-orange transition hover:text-brand-coffee"
        >
          直接去登录
        </Link>
      </div>
    </form>
  );
}
