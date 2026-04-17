import { pgTable, text, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users';
import { works } from './works';

export const favorites = pgTable(
  'favorites',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workId: text('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.workId] }),
  })
);

export type Favorite = typeof favorites.$inferSelect;
export type NewFavorite = typeof favorites.$inferInsert;
