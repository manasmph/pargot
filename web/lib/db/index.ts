/**
 * Drizzle client over the Neon serverless HTTP driver.
 *
 * `@neondatabase/serverless` speaks Postgres over HTTP fetch, which works in
 * both the Node and edge runtimes and avoids the connection-pool exhaustion
 * that plagues raw TCP Postgres on serverless. Use the POOLED connection
 * string (host contains `-pooler`) as DATABASE_URL.
 *
 * The client is created lazily: importing this module never throws, so files
 * can `import { db }` unconditionally. The connection is only built on first
 * use, and only then do we require `DATABASE_URL`. When auth is disabled
 * (see `@/lib/auth-config`) nothing ever touches `db`, so a laptop install
 * with no database configured works fine.
 */
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let client: DrizzleDb | null = null;

function getDb(): DrizzleDb {
  if (client) return client;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. It is required when NEXT_PUBLIC_AUTH_ENABLED=true. ' +
        'Add your Neon pooled connection string, or leave auth disabled to run without a database.'
    );
  }
  client = drizzle(neon(connectionString), { schema });
  return client;
}

/**
 * Lazy proxy — behaves exactly like the Drizzle client, but defers
 * construction (and the `DATABASE_URL` check) until the first query.
 */
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
