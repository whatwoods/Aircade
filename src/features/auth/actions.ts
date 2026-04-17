'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { parseLoginFormData, parseRegisterFormData } from './schemas';
import {
  getPostAuthRedirectTarget,
  loginUser,
  logoutCurrentUser,
  registerUser,
} from './server/auth';
import { getAuthErrorMessage } from './server/errors';
import { getRequestMetadata } from './server/request';

function buildRedirectUrl(
  pathname: string,
  searchParams: Record<string, string | null | undefined>
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export async function loginAction(formData: FormData) {
  const redirectTo = getPostAuthRedirectTarget(
    String(formData.get('redirectTo') ?? '/account')
  );

  try {
    await loginUser(
      parseLoginFormData(formData),
      getRequestMetadata(headers())
    );
  } catch (error) {
    redirect(
      buildRedirectUrl('/login', {
        error: getAuthErrorMessage(error),
        next: redirectTo !== '/account' ? redirectTo : null,
      })
    );
  }

  redirect(redirectTo);
}

export async function registerAction(formData: FormData) {
  const redirectTo = getPostAuthRedirectTarget(
    String(formData.get('redirectTo') ?? '/account')
  );

  try {
    await registerUser(
      parseRegisterFormData(formData),
      getRequestMetadata(headers())
    );
  } catch (error) {
    redirect(
      buildRedirectUrl('/register', {
        error: getAuthErrorMessage(error),
        next: redirectTo !== '/account' ? redirectTo : null,
      })
    );
  }

  redirect(redirectTo);
}

export async function logoutAction(formData: FormData) {
  const redirectTo = getPostAuthRedirectTarget(
    String(formData.get('redirectTo') ?? '/')
  );

  await logoutCurrentUser();

  if (redirectTo === '/') {
    redirect(buildRedirectUrl('/', { notice: '已退出登录' }));
  }

  redirect(buildRedirectUrl('/login', { notice: '已退出登录' }));
}
