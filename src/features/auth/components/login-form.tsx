import Link from 'next/link';
import { loginAction } from '../actions';

type LoginFormProps = {
  redirectTo?: string | null;
};

const inputClass =
  'ac-field w-full rounded-[12px] px-4 py-3 text-[14px] outline-none transition-colors';

const inputStyle: React.CSSProperties = {
  background: 'var(--ac-surface)',
  border: '1px solid var(--ac-border)',
  color: 'var(--ac-fg)',
};

export function LoginForm({ redirectTo }: LoginFormProps) {
  return (
    <form action={loginAction} className="space-y-5">
      <input type="hidden" name="redirectTo" value={redirectTo ?? '/account'} />

      <div>
        <label
          htmlFor="username"
          className="mb-2 block text-[13px] font-medium"
          style={{ color: 'var(--ac-fg)' }}
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
          className={inputClass}
          style={inputStyle}
          placeholder="例如 way 或 猫猫馆长"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label
            htmlFor="password"
            className="text-[13px] font-medium"
            style={{ color: 'var(--ac-fg)' }}
          >
            密码
          </label>
          <span className="ac-micro" style={{ color: 'var(--ac-fg-faint)' }}>
            还记得就能进
          </span>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
          style={inputStyle}
          placeholder="输入你的密码"
        />
      </div>

      <button type="submit" className="ac-btn ac-btn-primary ac-btn-lg w-full">
        登录 Aircade →
      </button>

      <div
        className="flex flex-col gap-2 border-t pt-4 text-[13px] sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: 'var(--ac-border)', color: 'var(--ac-fg-soft)' }}
      >
        <span>还没有账号？</span>
        <Link
          href="/register"
          className="font-semibold transition-colors hover:opacity-80"
          style={{ color: 'var(--ac-primary)' }}
        >
          去注册，马上进站 →
        </Link>
      </div>
    </form>
  );
}
