/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Google sign-in, backed by the Drizzle adapter on Neon Postgres. Uses the
 * default database session strategy (rows in the `session` table), so the
 * session callback receives the DB `user` and we expose `user.id` to the app.
 *
 * When `AUTH_ENABLED` is false (the default / open-source mode) this is a
 * no-op config: no provider, no adapter, so `auth()` resolves to `null` and
 * the database is never touched. That lets the app run with zero auth/DB
 * setup on a laptop. Enable it with `NEXT_PUBLIC_AUTH_ENABLED=true`.
 *
 * Exports `handlers` (for the route), plus `auth` / `signIn` / `signOut` for
 * server components and API routes.
 */
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { AUTH_ENABLED } from '@/lib/auth-config';
import { db } from '@/lib/db';
import { accounts, sessions, users, verificationTokens } from '@/lib/db/schema';

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Adapter + provider only when auth is on. Off → no DB access at all.
  adapter: AUTH_ENABLED
    ? DrizzleAdapter(db, {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
      })
    : undefined,
  providers: AUTH_ENABLED ? [Google] : [],
  callbacks: {
    // Database session strategy → `user` is the DB row. Surface its id so
    // API routes can key interviews + quota against `session.user.id`.
    session({ session, user }) {
      if (session.user && user) session.user.id = user.id;
      return session;
    },
  },
});
