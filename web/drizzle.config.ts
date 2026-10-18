import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Next.js keeps env in `.env.local`; load it explicitly for the CLI (which
// otherwise only reads `.env`).
config({ path: '.env.local' });

/**
 * Drizzle Kit config — used by `pnpm db:push` / `pnpm db:studio`.
 */
export default defineConfig({
  schema: './lib/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
