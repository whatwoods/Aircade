import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { redis } from '@/lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckResult = {
  status: 'ok' | 'error';
  latencyMs: number;
  detail?: string;
};

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    }),
  ]);
}

async function runCheck(task: () => Promise<unknown>): Promise<CheckResult> {
  const startedAt = Date.now();

  try {
    await task();

    return {
      status: 'ok',
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: 'error',
      latencyMs: Date.now() - startedAt,
      detail: error instanceof Error ? error.message : 'unknown error',
    };
  }
}

export async function GET() {
  const [database, cache] = await Promise.all([
    runCheck(async () => {
      await withTimeout(db.execute(sql`select 1`), 3000);
    }),
    runCheck(async () => {
      await withTimeout(redis.ping(), 3000);
    }),
  ]);

  const ok = database.status === 'ok' && cache.status === 'ok';

  return NextResponse.json(
    {
      status: ok ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        app: {
          status: 'ok',
        },
        database,
        cache,
      },
    },
    {
      status: ok ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
