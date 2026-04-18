'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/features/auth';
import { parseCreateWorkFormData, parseReviewWorkFormData } from './schemas';
import { getWorkErrorMessage } from './server/errors';
import { createWork, reviewWork } from './server/works';

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

export async function createWorkAction(formData: FormData) {
  const user = await requireUser('/submit');

  try {
    const work = await createWork(parseCreateWorkFormData(formData), user.id);

    revalidatePath('/');
    revalidatePath('/account');
    revalidatePath('/submit');
    revalidatePath('/admin/works');

    redirect(
      buildRedirectUrl(`/works/${work.id}`, {
        notice: '投稿已提交，等待管理员审核',
      })
    );
  } catch (error) {
    redirect(
      buildRedirectUrl('/submit', {
        error: getWorkErrorMessage(error),
      })
    );
  }
}

export async function reviewWorkAction(formData: FormData) {
  const user = await requireUser('/admin/works');

  if (user.role !== 'admin') {
    redirect('/account');
  }

  try {
    const input = parseReviewWorkFormData(formData);
    const reviewed = await reviewWork(input);

    revalidatePath('/');
    revalidatePath('/account');
    revalidatePath(`/works/${reviewed.id}`);
    revalidatePath('/admin/works');

    redirect(
      buildRedirectUrl('/admin/works', {
        notice:
          reviewed.status === 'live'
            ? '作品已通过并对外展示'
            : '作品已标记为驳回',
      })
    );
  } catch (error) {
    redirect(
      buildRedirectUrl('/admin/works', {
        error: getWorkErrorMessage(error),
      })
    );
  }
}
