'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/features/auth';
import { parseReviewWorkFormData } from './schemas';
import { getWorkErrorMessage } from './server/errors';
import {
  parseCreateWorkUploadFormData,
  parseUpdateWorkUploadFormData,
} from './server/upload-work-assets';
import {
  createWork,
  reviewWork,
  setFeaturedWork,
  unlistWork,
  getWorkByIdForViewer,
  updateWork,
} from './server/works';

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

export async function setFeaturedAction(formData: FormData) {
  const user = await requireUser('/admin/works');
  if (user.role !== 'admin') redirect('/account');
  const workId = formData.get('workId') as string;
  if (typeof workId !== 'string' || !workId) {
    redirect('/admin/works?error=无效的作品ID');
  }
  const featured = formData.get('featured') === 'true';
  await setFeaturedWork(workId, featured);
  revalidatePath('/admin/works');
  revalidatePath('/');
  redirect(
    '/admin/works?notice=' +
      encodeURIComponent(featured ? '已设为精选' : '已取消精选')
  );
}

export async function unlistWorkAction(formData: FormData) {
  const user = await requireUser('/admin/works');
  if (user.role !== 'admin') redirect('/account');
  const workId = formData.get('workId') as string;
  if (typeof workId !== 'string' || !workId) {
    redirect('/admin/works?error=无效的作品ID');
  }
  await unlistWork(workId);
  revalidatePath('/admin/works');
  revalidatePath('/');
  revalidatePath('/discover');
  redirect('/admin/works?notice=' + encodeURIComponent('已设为隐藏'));
}

export async function updateWorkAction(formData: FormData) {
  const user = await requireUser('/submit');
  const workId = formData.get('workId');
  if (typeof workId !== 'string' || !workId) {
    throw new Error('Missing workId');
  }

  // Fetch existing work for image fallbacks
  const existing = await getWorkByIdForViewer(workId, user);
  if (!existing || existing.author.id !== user.id) {
    throw new Error('无权编辑此作品');
  }

  let errorMessage: string | null = null;

  try {
    const parsed = await parseUpdateWorkUploadFormData(formData, {
      coverUrl: existing.coverUrl,
      screenshots: existing.screenshots,
      qrUrl: existing.qrUrl,
    });

    await updateWork(workId, user.id, parsed);
  } catch (error) {
    errorMessage = getWorkErrorMessage(error);
  }

  if (!errorMessage) {
    revalidatePath('/');
    revalidatePath('/account');
    revalidatePath(`/works/${workId}`);
    revalidatePath('/admin/works');
    redirect(`/works/${workId}?notice=作品已更新`);
  }

  redirect(
    buildRedirectUrl(`/works/${workId}/edit`, {
      error: errorMessage ?? '更新失败，请稍后再试',
    })
  );
}
