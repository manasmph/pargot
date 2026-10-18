/**
 * Ensures `session.user.id` is typed. With the database session strategy we
 * populate it in the `session` callback in `@/auth`.
 */
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}
