import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth';
import { toggleLike } from '@/features/works';

export async function POST(
  _req: Request,
  { params }: { params: { workId: string } }
) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const result = await toggleLike(user.id, params.workId);
  return NextResponse.json(result);
}
