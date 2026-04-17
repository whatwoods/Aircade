import IORedis, { type Redis } from 'ioredis';
import { env } from './env';

declare global {
  // eslint-disable-next-line no-var
  var __aircade_redis__: Redis | undefined;
}

function createClient(): Redis {
  const client = new IORedis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });
  client.on('error', (err) => {
    // 避免 dev 阶段整进程 crash；生产环境外层会记录
    console.error('[redis] error:', err.message);
  });
  return client;
}

export const redis: Redis =
  globalThis.__aircade_redis__ ??
  (globalThis.__aircade_redis__ = createClient());
