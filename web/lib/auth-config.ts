/**
 * Single source of truth for whether authentication is turned on.
 *
 * Pargot.ai runs in two modes:
 *
 *  - **Auth OFF (default)** — the open-source / local experience. No sign-in,
 *    no database, no usage limits. Clone it, add a LiveKit + Google AI key,
 *    and run. This is what you get on a laptop with the example env.
 *
 *  - **Auth ON** — set `NEXT_PUBLIC_AUTH_ENABLED=true` (plus Google OAuth
 *    creds, `AUTH_SECRET`, and a `DATABASE_URL`). Adds Google sign-in,
 *    per-user interview history, and a daily interview quota. This is how
 *    the hosted deployment runs.
 *
 * The flag is `NEXT_PUBLIC_` so the same constant is readable in both client
 * components and server code, and the two can never drift out of sync. When
 * it is off, none of the auth/DB code paths are reached, so none of those
 * env vars are required.
 */
export const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true';
