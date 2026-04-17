import { pgTable, text, primaryKey } from 'drizzle-orm/pg-core';
import { works } from './works';
import { tags } from './tags';

export const workTags = pgTable(
  'work_tags',
  {
    workId: text('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workId, t.tagId] }),
  })
);

export type WorkTag = typeof workTags.$inferSelect;
export type NewWorkTag = typeof workTags.$inferInsert;
