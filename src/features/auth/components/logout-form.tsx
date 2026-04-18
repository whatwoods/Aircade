import { logoutAction } from '../actions';

type LogoutFormProps = {
  redirectTo?: string;
};

export function LogoutForm({ redirectTo = '/' }: LogoutFormProps) {
  return (
    <form action={logoutAction}>
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button type="submit" className="ac-btn ac-btn-sm">
        退出登录 ↗
      </button>
    </form>
  );
}
