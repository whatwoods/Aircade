import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, works } from '@/db/schema';
import type { CurrentUser } from '@/features/auth';
import type { CreateWorkInput, ReviewWorkInput, WorkType } from '../schemas';
import { WorkError } from './errors';

type WorkStatus = 'pending' | 'live' | 'rejected' | 'unlisted';

export type WorkSummary = {
  id: string;
  title: string;
  tagline: string;
  description: string;
  type: WorkType;
  coverUrl: string;
  webUrl: string | null;
  qrUrl: string | null;
  status: WorkStatus;
  rejectReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  likeCount: number;
  viewCount: number;
  author: {
    id: string;
    username: string;
    nickname: string;
    slug: string;
  };
};

export type WorkDetail = WorkSummary & {
  screenshots: string[];
};

function normalizeScreenshots(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function mapWorkRow(row: {
  id: string;
  title: string;
  tagline: string;
  description: string;
  type: WorkType;
  coverUrl: string;
  screenshots: unknown;
  webUrl: string | null;
  qrUrl: string | null;
  status: WorkStatus;
  rejectReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  likeCount: number;
  viewCount: number;
  authorId: string;
  authorUsername: string;
  authorNickname: string;
  authorSlug: string;
}): WorkDetail {
  return {
    id: row.id,
    title: row.title,
    tagline: row.tagline,
    description: row.description,
    type: row.type,
    coverUrl: row.coverUrl,
    screenshots: normalizeScreenshots(row.screenshots),
    webUrl: row.webUrl,
    qrUrl: row.qrUrl,
    status: row.status,
    rejectReason: row.rejectReason,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
    likeCount: row.likeCount,
    viewCount: row.viewCount,
    author: {
      id: row.authorId,
      username: row.authorUsername,
      nickname: row.authorNickname,
      slug: row.authorSlug,
    },
  };
}

function toSummary(work: WorkDetail): WorkSummary {
  const { screenshots, ...summary } = work;
  return summary;
}

function canReadWork(work: WorkDetail, viewer: CurrentUser | null) {
  if (work.status === 'live') {
    return true;
  }

  if (!viewer) {
    return false;
  }

  return viewer.role === 'admin' || viewer.id === work.author.id;
}

export async function createWork(input: CreateWorkInput, authorId: string) {
  const createdWorks = await db
    .insert(works)
    .values({
      authorId,
      title: input.title,
      type: input.type,
      tagline: input.tagline,
      description: input.description,
      coverUrl: input.coverUrl,
      screenshots: input.screenshots,
      webUrl: input.webUrl ?? null,
      qrUrl: input.qrUrl ?? null,
      status: 'pending',
    })
    .returning({
      id: works.id,
    });

  const createdWork = createdWorks[0];

  if (!createdWork) {
    throw new WorkError('创建作品失败，请稍后再试');
  }

  return createdWork;
}

export async function listHomepageWorks(limit = 6): Promise<WorkSummary[]> {
  const rows = await db
    .select({
      id: works.id,
      title: works.title,
      tagline: works.tagline,
      description: works.description,
      type: works.type,
      coverUrl: works.coverUrl,
      screenshots: works.screenshots,
      webUrl: works.webUrl,
      qrUrl: works.qrUrl,
      status: works.status,
      rejectReason: works.rejectReason,
      createdAt: works.createdAt,
      reviewedAt: works.reviewedAt,
      likeCount: works.likeCount,
      viewCount: works.viewCount,
      authorId: users.id,
      authorUsername: users.username,
      authorNickname: users.nickname,
      authorSlug: users.slug,
    })
    .from(works)
    .innerJoin(users, eq(users.id, works.authorId))
    .where(eq(works.status, 'live'))
    .orderBy(desc(works.featuredAt), desc(works.createdAt))
    .limit(limit);

  return rows.map((row) => toSummary(mapWorkRow(row)));
}

export async function listRecentWorksByAuthor(
  authorId: string,
  limit = 4
): Promise<WorkSummary[]> {
  const rows = await db
    .select({
      id: works.id,
      title: works.title,
      tagline: works.tagline,
      description: works.description,
      type: works.type,
      coverUrl: works.coverUrl,
      screenshots: works.screenshots,
      webUrl: works.webUrl,
      qrUrl: works.qrUrl,
      status: works.status,
      rejectReason: works.rejectReason,
      createdAt: works.createdAt,
      reviewedAt: works.reviewedAt,
      likeCount: works.likeCount,
      viewCount: works.viewCount,
      authorId: users.id,
      authorUsername: users.username,
      authorNickname: users.nickname,
      authorSlug: users.slug,
    })
    .from(works)
    .innerJoin(users, eq(users.id, works.authorId))
    .where(eq(works.authorId, authorId))
    .orderBy(desc(works.createdAt))
    .limit(limit);

  return rows.map((row) => toSummary(mapWorkRow(row)));
}

export async function getWorkByIdForViewer(
  workId: string,
  viewer: CurrentUser | null,
  options?: {
    incrementView?: boolean;
  }
): Promise<WorkDetail | null> {
  const rows = await db
    .select({
      id: works.id,
      title: works.title,
      tagline: works.tagline,
      description: works.description,
      type: works.type,
      coverUrl: works.coverUrl,
      screenshots: works.screenshots,
      webUrl: works.webUrl,
      qrUrl: works.qrUrl,
      status: works.status,
      rejectReason: works.rejectReason,
      createdAt: works.createdAt,
      reviewedAt: works.reviewedAt,
      likeCount: works.likeCount,
      viewCount: works.viewCount,
      authorId: users.id,
      authorUsername: users.username,
      authorNickname: users.nickname,
      authorSlug: users.slug,
    })
    .from(works)
    .innerJoin(users, eq(users.id, works.authorId))
    .where(eq(works.id, workId))
    .limit(1);
  const row = rows[0];

  if (!row) {
    return null;
  }

  const work = mapWorkRow(row);

  if (!canReadWork(work, viewer)) {
    return null;
  }

  if (work.status === 'live' && options?.incrementView !== false) {
    await db
      .update(works)
      .set({
        viewCount: sql`${works.viewCount} + 1`,
      })
      .where(eq(works.id, work.id));
    work.viewCount += 1;
  }

  return work;
}

export async function listWorksForReview(
  status: Extract<WorkStatus, 'pending' | 'rejected'>,
  limit = 12
): Promise<WorkSummary[]> {
  const baseQuery = db
    .select({
      id: works.id,
      title: works.title,
      tagline: works.tagline,
      description: works.description,
      type: works.type,
      coverUrl: works.coverUrl,
      screenshots: works.screenshots,
      webUrl: works.webUrl,
      qrUrl: works.qrUrl,
      status: works.status,
      rejectReason: works.rejectReason,
      createdAt: works.createdAt,
      reviewedAt: works.reviewedAt,
      likeCount: works.likeCount,
      viewCount: works.viewCount,
      authorId: users.id,
      authorUsername: users.username,
      authorNickname: users.nickname,
      authorSlug: users.slug,
    })
    .from(works)
    .innerJoin(users, eq(users.id, works.authorId))
    .where(eq(works.status, status));

  const rows =
    status === 'pending'
      ? await baseQuery.orderBy(works.createdAt).limit(limit)
      : await baseQuery
          .orderBy(desc(works.reviewedAt), desc(works.createdAt))
          .limit(limit);

  return rows.map((row) => toSummary(mapWorkRow(row)));
}

export async function reviewWork(input: ReviewWorkInput) {
  const workRows = await db
    .select({
      id: works.id,
      status: works.status,
    })
    .from(works)
    .where(eq(works.id, input.workId))
    .limit(1);
  const target = workRows[0];

  if (!target) {
    throw new WorkError('作品不存在或已被删除');
  }

  if (target.status !== 'pending' && target.status !== 'rejected') {
    throw new WorkError('当前作品状态不允许再次审核');
  }

  const updatedWorks = await db
    .update(works)
    .set({
      status: input.decision === 'approve' ? 'live' : 'rejected',
      rejectReason:
        input.decision === 'approve' ? null : (input.rejectReason ?? null),
      reviewedAt: new Date(),
    })
    .where(and(eq(works.id, input.workId), eq(works.status, target.status)))
    .returning({
      id: works.id,
      status: works.status,
    });
  const updatedWork = updatedWorks[0];

  if (!updatedWork) {
    throw new WorkError('作品状态已变化，请刷新后重试');
  }

  return updatedWork;
}
