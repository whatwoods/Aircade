import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { inviteCodes } from './invite-codes';

export const users = pgTable(
  'users',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    username: varchar('username', { length: 20 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    email: varchar('email', { length: 254 }),
    nickname: varchar('nickname', { length: 30 }).notNull(),
    avatarUrl: text('avatar_url'),
    bio: varchar('bio', { length: 100 }),
    slug: varchar('slug', { length: 40 }).notNull(),
    role: text('role', { enum: ['user', 'admin'] })
      .notNull()
      .default('user'),
    status: text('status', { enum: ['active', 'banned'] })
      .notNull()
      .default('active'),
    inviteCodeUsed: text('invite_code_used').references(
      (): AnyPgColumn => inviteCodes.id,
      {
        onDelete: 'set null',
      }
    ),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => ({
    usernameUniq: uniqueIndex('idx_users_username').on(t.username),
    slugUniq: uniqueIndex('idx_users_slug').on(t.slug),
    emailUniq: uniqueIndex('idx_users_email')
      .on(t.email)
      .where(sql`${t.email} is not null`),
    statusIdx: index('idx_users_status').on(t.status),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
