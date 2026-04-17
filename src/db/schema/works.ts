import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  json,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const works = pgTable(
  'works',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 30 }).notNull(),
    type: text('type', {
      enum: ['game', 'tool', 'social', 'ai', 'other'],
    }).notNull(),
    tagline: varchar('tagline', { length: 30 }).notNull(),
    description: varchar('description', { length: 300 }).notNull(),
    coverUrl: text('cover_url').notNull(),
    screenshots: json('screenshots').$type<string[]>().notNull(),
    qrUrl: text('qr_url'),
    webUrl: text('web_url'),
    status: text('status', {
      enum: ['pending', 'live', 'rejected', 'unlisted'],
    })
      .notNull()
      .default('pending'),
    rejectReason: text('reject_reason'),
    likeCount: integer('like_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    featuredAt: timestamp('featured_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  },
  (t) => ({
    statusCreatedIdx: index('idx_works_status_created_at').on(
      t.status,
      t.createdAt
    ),
    authorIdx: index('idx_works_author').on(t.authorId),
    featuredIdx: index('idx_works_featured_at').on(t.featuredAt),
    actionTargetCk: check(
      'works_action_target_required',
      sql`${t.qrUrl} is not null or ${t.webUrl} is not null`
    ),
  })
);

export type Work = typeof works.$inferSelect;
export type NewWork = typeof works.$inferInsert;
