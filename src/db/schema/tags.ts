import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  varchar,
  boolean,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const tags = pgTable(
  'tags',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar('name', { length: 20 }).notNull(),
    slug: varchar('slug', { length: 40 }).notNull(),
    preset: boolean('preset').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    nameUniq: uniqueIndex('idx_tags_name').on(t.name),
    slugUniq: uniqueIndex('idx_tags_slug').on(t.slug),
  })
);

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
