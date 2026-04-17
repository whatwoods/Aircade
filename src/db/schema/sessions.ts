import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  index,
  customType,
} from 'drizzle-orm/pg-core';
import { users } from './users';

const inet = customType<{ data: string }>({
  dataType() {
    return 'inet';
  },
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index('idx_sessions_user_id').on(t.userId),
    expiresIdx: index('idx_sessions_expires_at').on(t.expiresAt),
  })
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
