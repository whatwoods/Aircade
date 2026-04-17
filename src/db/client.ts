/**
 * Drizzle client — Postgres 连接单例。
 *
 * 此模块使用 postgres.js 驱动，不兼容 Edge runtime。
 * 任何 import 此模块的 Route Handler / Server Component
 * 都应显式运行在 Node.js runtime（Next.js 默认即 Node）。
 */
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/lib/env';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var __aircade_pg__: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __aircade_db__: PostgresJsDatabase<typeof schema> | undefined;
}

const client =
  globalThis.__aircade_pg__ ??
  (globalThis.__aircade_pg__ = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
  }));

export const db: PostgresJsDatabase<typeof schema> =
  globalThis.__aircade_db__ ??
  (globalThis.__aircade_db__ = drizzle(client, { schema }));
