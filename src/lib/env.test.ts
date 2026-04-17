import { describe, it, expect, afterEach } from 'vitest';

const ORIGINAL = { ...process.env };

function resetEnv() {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, ORIGINAL);
}

// 每个 case 用不同的 query 串让 Vite 视作不同模块，绕过 import cache。
function importFresh() {
  return import(`./env?t=${Date.now()}_${Math.random()}`);
}

describe('env', () => {
  afterEach(() => {
    resetEnv();
  });

  it('throws when DATABASE_URL missing', async () => {
    delete process.env.DATABASE_URL;
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    process.env.AUTH_SECRET = 'a'.repeat(32);
    await expect(importFresh()).rejects.toThrow(/DATABASE_URL/);
  });

  it('throws when AUTH_SECRET shorter than 32 chars', async () => {
    process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:5432/db';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    process.env.AUTH_SECRET = 'too-short';
    await expect(importFresh()).rejects.toThrow(/AUTH_SECRET/);
  });

  it('loads ok when all required vars present', async () => {
    process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:5432/db';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    process.env.AUTH_SECRET = 'a'.repeat(32);
    const mod = await importFresh();
    expect(mod.env.DATABASE_URL).toMatch(/^postgres:\/\//);
    expect(mod.env.AUTH_SESSION_TTL_DAYS).toBe(30);
  });
});
