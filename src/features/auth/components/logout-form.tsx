import { logoutAction } from '../actions';

type LogoutFormProps = {
  redirectTo?: string;
};

export function LogoutForm({ redirectTo = '/' }: LogoutFormProps) {
  return (
    <form action={logoutAction}>
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button
        type="submit"
        className="border-brand-coffee/12 rounded-btn border bg-white px-4 py-2 text-sm font-medium text-brand-coffee transition hover:border-brand-orange/40 hover:bg-brand-cream/50"
      >
        退出登录
      </button>
    </form>
  );
}
