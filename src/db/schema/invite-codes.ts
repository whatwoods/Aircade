import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

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
    // 注：FK → users.id 由 Task 16 的手写 migration 补丁添加，避免 TS 模块循环。
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
  })
);

export type InviteCode = typeof inviteCodes.$inferSelect;
export type NewInviteCode = typeof inviteCodes.$inferInsert;
