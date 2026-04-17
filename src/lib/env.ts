import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().url().startsWith('postgres://', {
    message: 'DATABASE_URL must start with postgres://',
  }),
  REDIS_URL: z.string().url().startsWith('redis://', {
    message: 'REDIS_URL must start with redis://',
  }),

  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET must be at least 32 chars'),
  AUTH_SESSION_COOKIE: z.string().default('aircade_sid'),
  AUTH_SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  NEXT_PUBLIC_SITE_NAME: z.string().default('Aircade'),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),

  UPLOAD_DIR: z.string().default('/var/aircade/uploads'),
  UPLOAD_PUBLIC_BASE: z.string().default('/uploads'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(
    `[env] Invalid or missing environment variables:\n${issues}\n` +
      `See .env.example for the full list.`
  );
}

export const env = Object.freeze(parsed.data);
export type Env = typeof env;
