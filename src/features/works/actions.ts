'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/features/auth';
import { parseReviewWorkFormData } from './schemas';
import { getWorkErrorMessage } from './server/errors';
import { parseCreateWorkUploadFormData } from './server/upload-work-assets';
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

  let createdWorkId: string | null = null;
  let errorMessage: string | null = null;

  try {
    const input = await parseCreateWorkUploadFormData(formData);
    const work = await createWork(input, user.id);
    createdWorkId = work.id;
  } catch (error) {
    errorMessage = getWorkErrorMessage(error);
  }

  if (createdWorkId) {
    revalidatePath('/');
    revalidatePath('/account');
    revalidatePath('/submit');
    revalidatePath('/admin/works');

    redirect(
      buildRedirectUrl(`/works/${createdWorkId}`, {
        notice: '投稿已提交，等待管理员审核',
      })
    );
  }

  redirect(
    buildRedirectUrl('/submit', {
      error: errorMessage ?? '作品请求失败，请稍后再试',
    })
  );
}

export async function reviewWorkAction(formData: FormData) {
  const user = await requireUser('/admin/works');

  if (user.role !== 'admin') {
    redirect('/account');
  }

  let reviewedId: string | null = null;
  let reviewedStatus: 'live' | 'rejected' | null = null;
  let errorMessage: string | null = null;

  try {
    const input = parseReviewWorkFormData(formData);
    const reviewed = await reviewWork(input);
    reviewedId = reviewed.id;
    reviewedStatus = reviewed.status === 'live' ? 'live' : 'rejected';
  } catch (error) {
    errorMessage = getWorkErrorMessage(error);
  }

  if (reviewedId && reviewedStatus) {
    revalidatePath('/');
    revalidatePath('/account');
    revalidatePath(`/works/${reviewedId}`);
    revalidatePath('/admin/works');

    redirect(
      buildRedirectUrl('/admin/works', {
        notice:
          reviewedStatus === 'live'
            ? '作品已通过并对外展示'
            : '作品已标记为驳回',
      })
    );
  }

  redirect(
    buildRedirectUrl('/admin/works', {
      error: errorMessage ?? '作品请求失败，请稍后再试',
    })
  );
}
