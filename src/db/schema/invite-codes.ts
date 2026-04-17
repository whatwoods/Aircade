import { sql } from 'drizzle-orm';
import {
  foreignKey,
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const inviteCodes = pgTable(
  'invite_codes',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    code: varchar('code', { length: 32 }).notNull(),
    type: text('type', { enum: ['single', 'multi'] })
      .notNull()
      .default('single'),
    maxUses: integer('max_uses').notNull().default(1),
    usedCount: integer('used_count').notNull().default(0),
    createdBy: text('created_by').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    status: text('status', { enum: ['active', 'revoked', 'used'] })
      .notNull()
      .default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    codeUniq: uniqueIndex('idx_invite_codes_code').on(t.code),
    statusIdx: index('idx_invite_codes_status').on(t.status),
    createdByFk: foreignKey({
      columns: [t.createdBy],
      foreignColumns: [users.id],
      name: 'invite_codes_created_by_users_id_fk',
    }),
  })
);

export type InviteCode = typeof inviteCodes.$inferSelect;
export type NewInviteCode = typeof inviteCodes.$inferInsert;
