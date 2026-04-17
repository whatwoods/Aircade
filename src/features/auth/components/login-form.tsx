import Link from 'next/link';
import { loginAction } from '../actions';

type LoginFormProps = {
  redirectTo?: string | null;
};

export function LoginForm({ redirectTo }: LoginFormProps) {
  return (
    <form action={loginAction} className="space-y-5">
      <input type="hidden" name="redirectTo" value={redirectTo ?? '/account'} />

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
          placeholder="例如 way 或 猫猫馆长"
        />
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
          autoComplete="current-password"
          required
          className="border-brand-coffee/12 w-full rounded-input border bg-white px-4 py-3 text-sm text-brand-coffee outline-none transition placeholder:text-brand-coffee/35 focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10"
          placeholder="输入你的密码"
        />
      </div>

      <button
        type="submit"
        className="hover:bg-brand-orange/92 inline-flex w-full items-center justify-center rounded-btn bg-brand-orange px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_30px_rgba(255,159,107,0.28)] transition"
      >
        登录 Aircade
      </button>

      <div className="flex flex-col gap-2 text-sm text-brand-coffee/65 sm:flex-row sm:items-center sm:justify-between">
        <span>还没有账号？</span>
        <Link
          href="/register"
          className="font-medium text-brand-orange transition hover:text-brand-coffee"
        >
          去注册，顺手核销邀请码
        </Link>
      </div>
    </form>
  );
}
