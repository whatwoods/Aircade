import Link from 'next/link';
import { registerAction } from '../actions';

type RegisterFormProps = {
  redirectTo?: string | null;
};

const inputClass =
  'ac-field w-full rounded-[12px] px-4 py-3 text-[14px] outline-none transition-colors';

const inputStyle: React.CSSProperties = {
  background: 'var(--ac-surface)',
  border: '1px solid var(--ac-border)',
  color: 'var(--ac-fg)',
};

export function RegisterForm({ redirectTo }: RegisterFormProps) {
  return (
    <form action={registerAction} className="space-y-6">
      <input type="hidden" name="redirectTo" value={redirectTo ?? '/account'} />

      {/* Step indicator */}
      <div
        className="flex items-center gap-2 text-[12px]"
        style={{ color: 'var(--ac-fg-soft)' }}
      >
        <StepDot n="1" label="基本信息" active />
        <StepLine />
        <StepDot n="2" label="进入街机厅" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label
            htmlFor="username"
            className="mb-2 block text-[13px] font-medium"
            style={{ color: 'var(--ac-fg)' }}
          >
            用户名 <span style={{ color: 'var(--ac-primary)' }}>*</span>
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
            placeholder="3 到 20 位，支持中文"
          />
        </div>

        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-[13px] font-medium"
            style={{ color: 'var(--ac-fg)' }}
          >
            邮箱
            <span
              className="ml-1 text-[11px] font-normal"
              style={{ color: 'var(--ac-fg-faint)' }}
            >
              (选填)
            </span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            className={inputClass}
            style={inputStyle}
            placeholder="后续找回密码用"
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label
            htmlFor="password"
            className="text-[13px] font-medium"
            style={{ color: 'var(--ac-fg)' }}
          >
            密码 <span style={{ color: 'var(--ac-primary)' }}>*</span>
          </label>
          <span className="ac-micro" style={{ color: 'var(--ac-fg-faint)' }}>
            至少 8 位
          </span>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputClass}
          style={inputStyle}
          placeholder="输入一个别人猜不到的"
        />
      </div>

      <button type="submit" className="ac-btn ac-btn-primary ac-btn-lg w-full">
        创建账号并登录 →
      </button>

      <div
        className="flex flex-col gap-2 border-t pt-4 text-[13px] sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: 'var(--ac-border)', color: 'var(--ac-fg-soft)' }}
      >
        <span>已经有账号？</span>
        <Link
          href="/login"
          className="font-semibold transition-colors hover:opacity-80"
          style={{ color: 'var(--ac-primary)' }}
        >
          已有账号，直接登录 →
        </Link>
      </div>
    </form>
  );
}

function StepDot({
  n,
  label,
  active,
}: {
  n: string;
  label: string;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
        style={{
          background: active ? 'var(--ac-primary)' : 'var(--ac-surface-soft)',
          color: active ? 'var(--ac-primary-ink)' : 'var(--ac-fg-faint)',
          border: active ? 'none' : '1px solid var(--ac-border)',
          fontFamily: 'var(--font-mono), ui-monospace, monospace',
        }}
      >
        {n}
      </span>
      <span
        style={{
          color: active ? 'var(--ac-fg)' : 'var(--ac-fg-faint)',
          fontWeight: active ? 600 : 400,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function StepLine() {
  return (
    <span
      aria-hidden
      className="h-px flex-1"
      style={{ background: 'var(--ac-border)', minWidth: 12 }}
    />
  );
}
