import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'DATABASE_URL not set. Copy .env.example to .env.local and fill it in.'
  );
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
