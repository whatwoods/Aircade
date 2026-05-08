import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/auth';
import { getWorkByIdForViewer, WorkSubmitForm } from '@/features/works';

type Props = { params: { workId: string } };

export const metadata = { title: '编辑作品 — Aircade' };

export default async function EditWorkPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const work = await getWorkByIdForViewer(params.workId, user);
  if (!work || work.author.id !== user.id) redirect('/account');

  return (
    <div className="ac-page-in mx-auto max-w-6xl px-6 py-10 sm:px-8">
      <h1
        className="font-display text-[32px] tracking-tight sm:text-[42px]"
        style={{ color: 'var(--ac-fg)' }}
      >
        编辑作品
      </h1>
      <WorkSubmitForm mode="edit" initialData={work} submitLabel="更新作品" />
    </div>
  );
}
